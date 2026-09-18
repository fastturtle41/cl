/*
 * Okey 101 - Game Engine (pure logic, no DOM)
 * ------------------------------------------------------------
 * Works both in the browser (attaches to window.Okey) and in Node
 * (module.exports) so the rules can be unit-tested headlessly.
 *
 * Rules implemented (standard "101 Okey" / Yüzbir Okey):
 *  - Deck: numbers 1..13 in 4 colors, 2 copies each (104 tiles)
 *    plus 2 "false jokers" (fake okey) => 106 tiles total.
 *  - An indicator tile ("gösterge") is revealed. The okey (wild) is
 *    the tile one number higher of the SAME color (13 wraps to 1).
 *      * The two real okey-value tiles are WILD (can be anything).
 *      * The two false jokers act as a normal okey-value tile.
 *  - Melds:
 *      * Run  (seri): 3+ consecutive numbers, same color.
 *                     1 may be low (1-2-3) or high (12-13-1).
 *      * Group (küme): 3-4 tiles, same number, distinct colors.
 *  - To "open" you must lay melds worth >= 101 points on your first meld.
 *  - Ace (1) scores 11 points; other tiles score face value.
 */
(function (global) {
  'use strict';

  var COLORS = ['red', 'yellow', 'black', 'blue'];
  var COLOR_LABEL = { red: 'R', yellow: 'Y', black: 'K', blue: 'B' };
  var OPEN_THRESHOLD = 101;

  // ---- Tile helpers -------------------------------------------------------

  function makeTile(color, num, fake, id) {
    return { id: id, color: color || null, num: num || null, fake: !!fake };
  }

  // Build the 106-tile deck.
  function buildDeck() {
    var deck = [];
    var id = 0;
    for (var copy = 0; copy < 2; copy++) {
      for (var c = 0; c < COLORS.length; c++) {
        for (var n = 1; n <= 13; n++) {
          deck.push(makeTile(COLORS[c], n, false, 't' + id++));
        }
      }
    }
    deck.push(makeTile(null, null, true, 't' + id++)); // false joker 1
    deck.push(makeTile(null, null, true, 't' + id++)); // false joker 2
    return deck;
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // The okey (wild) tile value, given an indicator.
  function okeyFromIndicator(indicator) {
    var num = indicator.num + 1;
    if (num > 13) num = 1;
    return { color: indicator.color, num: num };
  }

  // Is this tile a wild okey? (a real numbered tile equal to okey value)
  function isWild(tile, okey) {
    if (!okey) return false;
    if (tile.fake) return false;
    return tile.color === okey.color && tile.num === okey.num;
  }

  // What concrete (color,num) does this tile represent when NOT used as wild.
  // False jokers stand in for the okey-value tile.
  function concreteOf(tile, okey) {
    if (tile.fake) return { color: okey.color, num: okey.num };
    return { color: tile.color, num: tile.num };
  }

  function colorIndex(color) { return COLORS.indexOf(color); }

  // Points a tile is worth in a meld (ace = 11).
  function tilePoints(num) { return num === 1 ? 11 : num; }

  // ---- Meld solver --------------------------------------------------------
  //
  // Concrete tiles are represented as { c: colorIndex, v: value } where
  // value is 1..13, plus a jokerCount for wilds. High-ace runs are handled
  // by branching each "1" tile between value 1 (low) and value 14 (high).

  function serialize(counts, jokers) {
    // counts: Int array length 4*14 (color*14 + value), value index 1..14
    return counts.join(',') + '|' + jokers;
  }

  // Core solver over labeled values (1..14). Returns best result object:
  //   { value: bestMeldPoints, melds: [...], leftover: count }
  // mode: 'value' maximizes meld points (leftover allowed),
  //       'partition' requires leftover === 0 (returns null if impossible).
  function coreSolve(counts, jokers, mode, budgetRef) {
    var memo = {};

    function pointsForValue(v) { return v === 14 ? 11 : (v === 1 ? 11 : v); }

    function rec(counts, jokers) {
      if (budgetRef.n <= 0) return null;
      budgetRef.n--;

      // find canonical tile: lowest (color, value) with count>0
      var ci = -1, vi = -1;
      outer:
      for (var v = 1; v <= 14; v++) {
        for (var c = 0; c < 4; c++) {
          if (counts[c * 14 + v] > 0) { ci = c; vi = v; break outer; }
        }
      }

      if (ci === -1) {
        // no concrete tiles left; any leftover jokers count as leftover
        return { value: 0, melds: [], leftover: jokers };
      }

      var key = serialize(counts, jokers);
      if (memo[key] !== undefined) return memo[key];

      var best = null;

      function consider(result) {
        if (!result) return;
        if (mode === 'partition') {
          if (result.leftover !== 0) return;
        }
        if (!best) { best = result; return; }
        if (mode === 'partition') { best = result; return; }
        // value mode: prefer higher meld value, then fewer leftover
        if (result.value > best.value ||
            (result.value === best.value && result.leftover < best.leftover)) {
          best = result;
        }
      }

      // Option A: leave canonical as leftover (only in value mode)
      if (mode === 'value') {
        counts[ci * 14 + vi]--;
        var subL = rec(counts, jokers);
        counts[ci * 14 + vi]++;
        if (subL) {
          consider({ value: subL.value, melds: subL.melds, leftover: subL.leftover + 1 });
        }
      }

      // Option B: groups containing canonical (same value vi, distinct colors)
      // gather colors (other than ci) that have this value
      var availColors = [];
      for (var c2 = 0; c2 < 4; c2++) {
        if (c2 !== ci && counts[c2 * 14 + vi] > 0) availColors.push(c2);
      }
      // choose subset of availColors, plus jokers, total size 3 or 4 (incl canonical)
      var maxOthers = availColors.length;
      // enumerate subsets via bitmask
      for (var mask = 0; mask < (1 << maxOthers); mask++) {
        var chosen = [];
        for (var b = 0; b < maxOthers; b++) if (mask & (1 << b)) chosen.push(availColors[b]);
        var baseSize = 1 + chosen.length;
        // add jokers to reach size 3 or 4
        for (var jUse = 0; jUse <= jokers; jUse++) {
          var size = baseSize + jUse;
          if (size < 3 || size > 4) continue;
          if (baseSize + jUse > 4) break;
          // build meld, consume tiles
          counts[ci * 14 + vi]--;
          for (var k = 0; k < chosen.length; k++) counts[chosen[k] * 14 + vi]--;
          var sub = rec(counts, jokers - jUse);
          // restore
          counts[ci * 14 + vi]++;
          for (var k2 = 0; k2 < chosen.length; k2++) counts[chosen[k2] * 14 + vi]++;
          if (sub) {
            var meldPts = size * pointsForValue(vi);
            var meld = { type: 'group', value: vi, colors: [ci].concat(chosen), jokers: jUse };
            consider({ value: sub.value + meldPts, melds: [meld].concat(sub.melds), leftover: sub.leftover });
          }
        }
      }

      // Option C: runs starting at canonical going up (same color ci)
      // ascending values vi, vi+1, ... up to 14. Jokers fill gaps.
      var runColor = ci;
      var used = []; // record which positions are real vs joker
      var jRemaining = jokers;
      var consumedReal = [];
      var length = 0;
      var val = vi;
      // We iterate extending the run; at each step try to close (>=3).
      // Use an explicit loop building arrays.
      (function buildRuns() {
        var realConsumed = []; // values taken from board
        var pattern = [];      // 'r' real or 'j' joker per slot
        var jokersLeft = jokers;

        function step(curVal) {
          if (curVal > 14) return;
          // Try using a real tile of runColor@curVal if available
          var idx = runColor * 14 + curVal;
          var haveReal = counts[idx] > 0;
          // Branch 1: place real (if available)
          if (haveReal) {
            counts[idx]--;
            realConsumed.push(curVal);
            pattern.push('r');
            closeOrExtend(curVal);
            pattern.pop();
            realConsumed.pop();
            counts[idx]++;
          }
          // Branch 2: place joker (if available) -- only if it helps; allow
          if (jokersLeft > 0) {
            jokersLeft--;
            pattern.push('j');
            closeOrExtend(curVal);
            pattern.pop();
            jokersLeft++;
          }
        }

        function closeOrExtend(curVal) {
          // if pattern ends with joker(s) that we can't justify, they still count
          if (pattern.length >= 3) {
            // close here: recurse on remainder
            var jUsed = 0;
            for (var p = 0; p < pattern.length; p++) if (pattern[p] === 'j') jUsed++;
            var sub = rec(counts, jokers - jUsed);
            if (sub) {
              // meld points: sum of pointsForValue for each slot value
              var startVal = vi;
              var pts = 0;
              for (var s = 0; s < pattern.length; s++) pts += pointsForValue(startVal + s);
              var meld = { type: 'run', color: runColor, start: startVal, length: pattern.length, pattern: pattern.slice(), jokers: jUsed };
              consider({ value: sub.value + pts, melds: [meld].concat(sub.melds), leftover: sub.leftover });
            }
          }
          if (curVal + 1 <= 14) step(curVal + 1);
        }

        step(vi);
      })();

      memo[key] = best;
      return best;
    }

    return rec(counts, jokers);
  }

  // Convert a hand (array of tile objects) + okey into concrete counts and jokers.
  // Returns list of "ones" positions so we can branch high/low ace.
  function toConcrete(hand, okey) {
    var jokers = 0;
    var tiles = []; // {c, v}
    for (var i = 0; i < hand.length; i++) {
      var t = hand[i];
      if (isWild(t, okey)) { jokers++; continue; }
      var cc = concreteOf(t, okey);
      tiles.push({ c: colorIndex(cc.color), v: cc.num });
    }
    return { tiles: tiles, jokers: jokers };
  }

  // Build counts array from tiles with a given ace-assignment (map index->14).
  function buildCounts(tiles, highAceMask) {
    var counts = new Array(4 * 14);
    for (var i = 0; i < counts.length; i++) counts[i] = 0;
    var oneIdx = 0;
    for (var t = 0; t < tiles.length; t++) {
      var tile = tiles[t];
      var v = tile.v;
      if (v === 1) {
        if (highAceMask & (1 << oneIdx)) v = 14;
        oneIdx++;
      }
      counts[tile.c * 14 + v]++;
    }
    return counts;
  }

  // Solve a hand: returns best meld decomposition.
  // options: { mode: 'value'|'partition', budget: number }
  function solveHand(hand, okey, options) {
    options = options || {};
    var mode = options.mode || 'value';
    var budget = options.budget || 60000;
    var conc = toConcrete(hand, okey);
    var ones = 0;
    for (var i = 0; i < conc.tiles.length; i++) if (conc.tiles[i].v === 1) ones++;

    var best = null;
    var maxMask = 1 << Math.min(ones, 8); // cap ace branching
    // If more than 8 ones (extremely rare), only try all-low + all-high
    var masks;
    if (ones <= 8) {
      masks = [];
      for (var m = 0; m < maxMask; m++) masks.push(m);
    } else {
      masks = [0, (1 << ones) - 1];
    }

    for (var mi = 0; mi < masks.length; mi++) {
      var counts = buildCounts(conc.tiles, masks[mi]);
      var budgetRef = { n: budget };
      var res = coreSolve(counts, conc.jokers, mode, budgetRef);
      if (!res) continue;
      if (mode === 'partition') {
        if (res.leftover === 0) return res; // any full partition is a win
      } else {
        if (!best || res.value > best.value ||
            (res.value === best.value && res.leftover < best.leftover)) {
          best = res;
        }
      }
    }
    return best;
  }

  // Can the hand be fully partitioned into valid melds? (win check)
  function canGoOut(hand, okey, budget) {
    var res = solveHand(hand, okey, { mode: 'partition', budget: budget || 200000 });
    return !!res && res.leftover === 0;
  }

  // Best meld value obtainable from a hand (for opening decisions).
  function bestMeldValue(hand, okey, budget) {
    var res = solveHand(hand, okey, { mode: 'value', budget: budget || 60000 });
    return res ? res.value : 0;
  }

  // ---- Meld validation for explicit tile groups (player-formed) ----------
  // Given an array of tile objects the player wants to lay as ONE meld,
  // determine if it's a valid run or group and its point value.
  function validateMeld(tiles, okey) {
    if (!tiles || tiles.length < 3 || tiles.length > 4) {
      if (!tiles || tiles.length < 3) return { valid: false, reason: 'A meld needs at least 3 tiles.' };
    }
    var wilds = 0;
    var concretes = [];
    for (var i = 0; i < tiles.length; i++) {
      if (isWild(tiles[i], okey)) { wilds++; continue; }
      concretes.push(concreteOf(tiles[i], okey));
    }
    if (wilds >= tiles.length) return { valid: false, reason: 'Too many jokers.' };

    // Try group: all same number, distinct colors.
    var groupOk = true;
    if (tiles.length <= 4) {
      var num = concretes[0].num;
      var seenColors = {};
      for (var g = 0; g < concretes.length; g++) {
        if (concretes[g].num !== num) { groupOk = false; break; }
        if (seenColors[concretes[g].color]) { groupOk = false; break; }
        seenColors[concretes[g].color] = true;
      }
    } else {
      groupOk = false;
    }
    if (groupOk) {
      var pts = tiles.length * tilePoints(concretes[0].num);
      return { valid: true, type: 'group', points: pts };
    }

    // Try run: same color, consecutive (with joker gap-fill, ace low or high).
    var runRes = validateRun(tiles, okey);
    if (runRes.valid) return runRes;

    return { valid: false, reason: 'Not a valid run or group.' };
  }

  function validateRun(tiles, okey) {
    // All non-wild tiles must be same color.
    var color = null;
    var slots = []; // {num} for concretes; wilds are flexible
    var wilds = 0;
    for (var i = 0; i < tiles.length; i++) {
      if (isWild(tiles[i], okey)) { wilds++; continue; }
      var cc = concreteOf(tiles[i], okey);
      if (color === null) color = cc.color;
      else if (cc.color !== color) return { valid: false, reason: 'Run tiles must share a color.' };
      slots.push(cc.num);
    }
    // Try to arrange as consecutive. We attempt both ace-low and ace-high.
    var arrangements = arrangeRunValues(slots);
    for (var a = 0; a < arrangements.length; a++) {
      var vals = arrangements[a].slice().sort(function (x, y) { return x - y; });
      // place wilds to fill gaps; total length = tiles.length
      var res = tryFillRun(vals, wilds, tiles.length);
      if (res.ok) {
        var pts = 0;
        for (var p = 0; p < res.sequence.length; p++) pts += tilePoints(normAce(res.sequence[p]));
        return { valid: true, type: 'run', points: pts, color: color };
      }
    }
    return { valid: false, reason: 'Not consecutive.' };
  }

  function normAce(v) { return v === 14 ? 1 : v; }

  // Generate value arrangements considering ace as 1 or 14.
  function arrangeRunValues(vals) {
    // find indices of value 1
    var ones = [];
    for (var i = 0; i < vals.length; i++) if (vals[i] === 1) ones.push(i);
    if (ones.length === 0) return [vals];
    var results = [];
    var combos = 1 << ones.length;
    for (var m = 0; m < combos; m++) {
      var copy = vals.slice();
      for (var b = 0; b < ones.length; b++) {
        if (m & (1 << b)) copy[ones[b]] = 14;
      }
      results.push(copy);
    }
    return results;
  }

  // Given sorted concrete values and a number of wilds, can we make a single
  // consecutive run of exactly totalLen tiles? Returns filled sequence.
  function tryFillRun(sortedVals, wilds, totalLen) {
    if (sortedVals.length === 0) return { ok: false };
    // Check for duplicates (a run can't have two of the same value).
    for (var i = 1; i < sortedVals.length; i++) {
      if (sortedVals[i] === sortedVals[i - 1]) return { ok: false };
    }
    var lo = sortedVals[0];
    var hi = sortedVals[sortedVals.length - 1];
    var span = hi - lo + 1;
    if (span > totalLen) return { ok: false };
    // wilds needed to fill internal gaps
    var internalGaps = span - sortedVals.length;
    if (internalGaps > wilds) return { ok: false };
    var extraWilds = wilds - internalGaps;
    // extend on either side; totalLen must equal span + extraWilds
    if (span + extraWilds !== totalLen) {
      // we can also choose to not use all wilds? No: all tiles must be placed.
      return { ok: false };
    }
    // Build a representative sequence (extend upward first, then downward).
    var seq = [];
    var extendUp = 0, extendDown = 0;
    // prefer extending within 1..14 bounds
    var canUp = 14 - hi;
    var canDown = lo - 1;
    extendUp = Math.min(extraWilds, canUp);
    extendDown = extraWilds - extendUp;
    if (extendDown > canDown) {
      extendDown = canDown;
      extendUp = extraWilds - extendDown;
      if (extendUp > canUp) return { ok: false };
    }
    var start = lo - extendDown;
    var end = hi + extendUp;
    for (var v = start; v <= end; v++) seq.push(v);
    if (seq.length !== totalLen) return { ok: false };
    return { ok: true, sequence: seq };
  }

  // ---- Lay-off (adding a tile to an existing table meld) -----------------
  // meld: { type, tiles:[...] } as stored on the table. Returns true if the
  // given tile can be appended to keep it valid. (Simplified: we re-validate.)
  function canLayOff(tile, meld, okey) {
    var combined = meld.tiles.concat([tile]);
    if (meld.type === 'group') {
      if (combined.length > 4) return false;
    }
    var res = validateMeld(combined, okey);
    return res.valid;
  }

  // ---- Scoring: value of tiles remaining in a hand (penalty on loss) -----
  function handPenalty(hand, okey) {
    var total = 0;
    for (var i = 0; i < hand.length; i++) {
      if (isWild(hand[i], okey)) { total += 25; continue; } // joker heavy penalty
      var cc = concreteOf(hand[i], okey);
      total += tilePoints(cc.num);
    }
    return total;
  }

  // ---- Sorting a hand for display ----------------------------------------
  function sortHand(hand, okey) {
    return hand.slice().sort(function (a, b) {
      var aw = isWild(a, okey), bw = isWild(b, okey);
      if (aw && bw) return 0;
      if (aw) return 1;   // wilds to the end
      if (bw) return -1;
      var ca = concreteOf(a, okey), cb = concreteOf(b, okey);
      var ci = colorIndex(ca.color) - colorIndex(cb.color);
      if (ci !== 0) return ci;
      return ca.num - cb.num;
    });
  }

  var Okey = {
    COLORS: COLORS,
    COLOR_LABEL: COLOR_LABEL,
    OPEN_THRESHOLD: OPEN_THRESHOLD,
    makeTile: makeTile,
    buildDeck: buildDeck,
    shuffle: shuffle,
    okeyFromIndicator: okeyFromIndicator,
    isWild: isWild,
    concreteOf: concreteOf,
    colorIndex: colorIndex,
    tilePoints: tilePoints,
    solveHand: solveHand,
    canGoOut: canGoOut,
    bestMeldValue: bestMeldValue,
    validateMeld: validateMeld,
    canLayOff: canLayOff,
    handPenalty: handPenalty,
    sortHand: sortHand
  };

  global.Okey = Okey;
  if (typeof module !== 'undefined' && module.exports) module.exports = Okey;

})(typeof window !== 'undefined' ? window : globalThis);
