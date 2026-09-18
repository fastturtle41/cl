/*
 * Okey 101 - AI opponents (no DOM).
 * Four difficulty levels tune: opening aggressiveness, discard safety,
 * discard-pile awareness, joker discipline and meld-search depth.
 *
 *   easy    - draws from stock almost always, discards fairly naively,
 *             opens only when it clearly can, never tracks opponents.
 *   medium  - keeps partial melds, discards true dead tiles, opens at 101.
 *   hard    - takes useful discards, lays off, avoids feeding neighbours,
 *             plays toward an efficient going-out.
 *   expert  - deeper meld search, careful joker use, avoids giving
 *             opponents tiles, maximises going-out chances.
 */
(function (global) {
  'use strict';

  var Okey = (typeof require !== 'undefined') ? require('./engine.js') : global.Okey;

  var PROFILES = {
    easy:   { budget: 3000,  takeDiscardThreshold: 7,  jokerDiscipline: 1, safety: 0,   openMargin: 0 },
    medium: { budget: 12000, takeDiscardThreshold: 5,  jokerDiscipline: 2, safety: 0.3, openMargin: 0 },
    hard:   { budget: 40000, takeDiscardThreshold: 4,  jokerDiscipline: 3, safety: 0.7, openMargin: 0 },
    expert: { budget: 90000, takeDiscardThreshold: 3,  jokerDiscipline: 4, safety: 1.0, openMargin: 0 }
  };

  // ---- Mapping abstract solver melds back to concrete tile objects --------

  function normAce(v) { return v === 14 ? 1 : v; }

  function claimJoker(workHand, okey) {
    for (var i = 0; i < workHand.length; i++) {
      if (Okey.isWild(workHand[i], okey)) return workHand.splice(i, 1)[0];
    }
    return null;
  }

  // Claim a concrete tile representing (color, num). Real okey-value tiles are
  // wild (never concrete); false jokers stand in for the okey-value tile.
  function claimConcrete(workHand, color, num, okey) {
    // prefer a plain real tile that is not wild
    for (var i = 0; i < workHand.length; i++) {
      var t = workHand[i];
      if (t.fake) continue;
      if (Okey.isWild(t, okey)) continue;
      if (t.color === color && t.num === num) return workHand.splice(i, 1)[0];
    }
    // otherwise a false joker, valid only if target == okey value
    if (color === okey.color && num === okey.num) {
      for (var j = 0; j < workHand.length; j++) {
        if (workHand[j].fake) return workHand.splice(j, 1)[0];
      }
    }
    return null;
  }

  // Convert a solver decomposition into arrays of tile ids per meld.
  function meldsToTileGroups(hand, decomposition, okey) {
    var work = hand.slice();
    var groups = [];
    for (var m = 0; m < decomposition.melds.length; m++) {
      var meld = decomposition.melds[m];
      var tiles = [];
      var ok = true;
      if (meld.type === 'group') {
        var num = normAce(meld.value);
        for (var ci = 0; ci < meld.colors.length; ci++) {
          var color = Okey.COLORS[meld.colors[ci]];
          var t = claimConcrete(work, color, num, okey);
          if (!t) { ok = false; break; }
          tiles.push(t);
        }
        for (var jg = 0; ok && jg < meld.jokers; jg++) {
          var jk = claimJoker(work, okey);
          if (!jk) { ok = false; break; }
          tiles.push(jk);
        }
      } else { // run
        var color2 = Okey.COLORS[meld.color];
        for (var s = 0; s < meld.length; s++) {
          if (meld.pattern[s] === 'r') {
            var val = normAce(meld.start + s);
            var rt = claimConcrete(work, color2, val, okey);
            if (!rt) { ok = false; break; }
            tiles.push(rt);
          } else {
            var jr = claimJoker(work, okey);
            if (!jr) { ok = false; break; }
            tiles.push(jr);
          }
        }
      }
      if (!ok || tiles.length < 3) return null;
      groups.push(tiles.map(function (t) { return t.id; }));
    }
    return groups;
  }

  // ---- Heuristics ---------------------------------------------------------

  // How useful is a tile to the hand right now (higher = keep it)?
  function tileUsefulness(tile, hand, okey) {
    if (Okey.isWild(tile, okey)) return 1000;
    var cc = Okey.concreteOf(tile, okey);
    var score = 0;
    var sameNumColors = 0;
    for (var i = 0; i < hand.length; i++) {
      var o = hand[i];
      if (o === tile) continue;
      if (Okey.isWild(o, okey)) continue;
      var oc = Okey.concreteOf(o, okey);
      if (oc.num === cc.num && oc.color !== cc.color) sameNumColors++;
      if (oc.color === cc.color) {
        var d = Math.abs(oc.num - cc.num);
        if (d === 1) score += 3;
        else if (d === 2) score += 1;
      }
    }
    score += sameNumColors * 3;
    return score;
  }

  // ---- Turn execution -----------------------------------------------------

  // Decide the draw source; returns 'stock' or 'discard'.
  function chooseDraw(game, seat, profile) {
    if (game.stock.length === 0) return 'stock';
    var left = (seat + 3) % 4;
    var pile = game.discards[left];
    if (pile.length === 0) return 'stock';
    var candidate = pile[pile.length - 1];
    // Never scoop a wild-losing move; evaluate usefulness if we picked it up.
    var testHand = game.hands[seat].concat([candidate]);
    var use = tileUsefulness(candidate, testHand, game.okey);
    // Also: does it complete an opening or a meld? Big bonus.
    if (Okey.isWild(candidate, game.okey)) use += 50;
    if (use >= profile.takeDiscardThreshold) return 'discard';
    return 'stock';
  }

  // Attempt to go out this turn. Returns true if the game ended.
  function tryGoOut(game, seat, profile) {
    var hand = game.hands[seat];
    var okey = game.okey;
    for (var i = 0; i < hand.length; i++) {
      var without = hand.slice(0, i).concat(hand.slice(i + 1));
      var res = Okey.solveHand(without, okey, { mode: 'partition', budget: profile.budget });
      if (res && res.leftover === 0) {
        // If not opened yet, the laid melds must total >= 101.
        if (!game.opened[seat]) {
          var val = 0;
          for (var mm = 0; mm < res.melds.length; mm++) val += meldValueOf(res.melds[mm]);
          if (val < Okey.OPEN_THRESHOLD) continue;
        }
        var groups = meldsToTileGroups(without, res, okey);
        if (!groups) continue;
        var discardId = hand[i].id;
        var layRes = game.layMelds(seat, groups);
        if (!layRes.ok) continue;
        game.discard(seat, discardId);
        return true;
      }
    }
    return false;
  }

  function meldValueOf(meld) {
    function pv(v) { return v === 14 || v === 1 ? 11 : v; }
    if (meld.type === 'group') return meld.colors.length + meld.jokers > 0 ? (meld.colors.length + meld.jokers) * pv(meld.value) : 0;
    var pts = 0;
    for (var s = 0; s < meld.length; s++) pts += pv(meld.start + s);
    return pts;
  }

  // Lay off single tiles onto existing melds where legal (keep >=1 to discard).
  function tryLayOffs(game, seat) {
    var changed = true;
    while (changed) {
      changed = false;
      var hand = game.hands[seat];
      if (hand.length <= 1) break;
      for (var h = 0; h < hand.length && hand.length > 1; h++) {
        var tile = hand[h];
        if (Okey.isWild(tile, game.okey)) continue; // keep jokers unless finishing
        for (var m = 0; m < game.melds.length; m++) {
          if (Okey.canLayOff(tile, game.melds[m], game.okey)) {
            var r = game.layOff(seat, tile.id, m);
            if (r.ok) { changed = true; break; }
          }
        }
        if (changed) break;
      }
    }
  }

  // Choose which tile to discard (returns tile id).
  function chooseDiscard(game, seat, profile) {
    var hand = game.hands[seat];
    var okey = game.okey;
    var best = null, bestScore = Infinity;
    for (var i = 0; i < hand.length; i++) {
      var tile = hand[i];
      if (Okey.isWild(tile, okey) && profile.jokerDiscipline > 0 && hand.length > 1) continue; // never throw joker early
      var use = tileUsefulness(tile, hand, okey);
      var cc = Okey.concreteOf(tile, okey);
      var points = Okey.tilePoints(cc.num);
      // score to MINIMISE: keep useful tiles; among dead tiles prefer to shed
      // high-value ones (penalty reduction) but avoid feeding neighbour (safety).
      var neighbourNeed = profile.safety > 0 ? neighbourDanger(game, seat, tile) : 0;
      var score = use * 10 - points * 0.5 + neighbourNeed * profile.safety * 6;
      if (score < bestScore) { bestScore = score; best = tile; }
    }
    if (!best) best = hand[0];
    return best.id;
  }

  // Rough danger that discarding this tile helps the next player (to our right).
  function neighbourDanger(game, seat, tile) {
    var next = (seat + 1) % 4;
    // We can only see what the next player has previously discarded (what they
    // DON'T want) and the table melds they could lay off onto.
    var okey = game.okey;
    var danger = 0;
    // If tile can be laid off onto an opened neighbour's meld region, riskier.
    for (var m = 0; m < game.melds.length; m++) {
      if (game.melds[m].owner === next && Okey.canLayOff(tile, game.melds[m], okey)) danger += 1;
    }
    // If the neighbour recently discarded a tile of the same value, they likely
    // don't need this number -> lower danger.
    var theirDiscards = game.discards[next];
    if (theirDiscards.length) {
      var cc = Okey.concreteOf(tile, okey);
      for (var d = Math.max(0, theirDiscards.length - 3); d < theirDiscards.length; d++) {
        var dc = Okey.concreteOf(theirDiscards[d], okey);
        if (dc.num === cc.num) danger -= 0.5;
      }
    }
    return danger;
  }

  // Full AI turn. Works whether the seat is at the DRAW phase (normal turn)
  // or already at the ACTION phase (the starter's very first move, holding 22).
  function takeTurn(game, seat) {
    var difficulty = game.aiDifficulty(seat);
    var profile = PROFILES[difficulty] || PROFILES.medium;
    var PHASE = global.OkeyGame.PHASE;

    // 1. Draw (skipped for the starter's first ACTION-phase move).
    if (game.phase === PHASE.DRAW) {
      var source = chooseDraw(game, seat, profile);
      if (source === 'discard') {
        var dr = game.drawFromDiscard(seat);
        if (!dr.ok) game.drawFromStock(seat);
      } else {
        game.drawFromStock(seat);
      }
    }
    if (game.phase === PHASE.OVER) return;

    // 2. Try to go out this very turn.
    if (tryGoOut(game, seat, profile)) return;

    // 3. Open if we can reach 101.
    if (!game.opened[seat]) {
      var res = Okey.solveHand(game.hands[seat], game.okey, { mode: 'value', budget: profile.budget });
      if (res && res.value >= Okey.OPEN_THRESHOLD + profile.openMargin) {
        var groups = meldsToTileGroups(game.hands[seat], res, game.okey);
        if (groups && groups.length) {
          // Ensure we keep at least one tile to discard.
          var totalTiles = 0;
          for (var g = 0; g < groups.length; g++) totalTiles += groups[g].length;
          if (totalTiles < game.hands[seat].length) {
            game.layMelds(seat, groups);
          }
        }
      }
    } else {
      // 3b. Already opened: lay any additional complete melds.
      var res2 = Okey.solveHand(game.hands[seat], game.okey, { mode: 'value', budget: profile.budget });
      if (res2 && res2.melds.length) {
        var groups2 = meldsToTileGroups(game.hands[seat], res2, game.okey);
        if (groups2 && groups2.length) {
          var tot = 0;
          for (var g2 = 0; g2 < groups2.length; g2++) tot += groups2[g2].length;
          if (tot < game.hands[seat].length) game.layMelds(seat, groups2);
        }
      }
      tryLayOffs(game, seat);
    }

    if (game.phase === PHASE.OVER) return;

    // 4. Discard
    if (game.hands[seat].length === 0) return; // safety
    var discardId = chooseDiscard(game, seat, profile);
    game.discard(seat, discardId);
  }

  var AI = {
    PROFILES: PROFILES,
    takeTurn: takeTurn,
    chooseDraw: chooseDraw,
    chooseDiscard: chooseDiscard,
    tileUsefulness: tileUsefulness,
    meldsToTileGroups: meldsToTileGroups
  };

  global.OkeyAI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;

})(typeof window !== 'undefined' ? window : globalThis);
