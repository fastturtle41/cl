/*
 * Okey 101 - Game state machine (turn orchestration, no DOM).
 * Emits events via an onEvent callback so the UI can render/animate.
 *
 * Turn flow per player:
 *   1. DRAW  - take one tile from the stock pile OR the previous discard.
 *   2. MELD  - (optional) open with >=101 points, then lay new melds and
 *              lay off onto table melds (only allowed once opened).
 *   3. DISCARD - throw one tile onto own discard pile.
 *   4. If the hand is now empty and the player has opened -> WIN.
 */
(function (global) {
  'use strict';

  var Okey = (typeof require !== 'undefined') ? require('./engine.js') : global.Okey;

  var PHASE = { DRAW: 'draw', ACTION: 'action', OVER: 'over' };

  function Game(options) {
    options = options || {};
    this.rng = options.rng || Math.random;
    this.numPlayers = 4;
    this.onEvent = options.onEvent || function () {};
    this.difficulties = options.difficulties || ['expert', 'expert', 'expert']; // for the 3 AIs
    this.scores = options.scores || [0, 0, 0, 0]; // cumulative penalty points
    this.humanSeat = (options.humanSeat != null) ? options.humanSeat : 0;
    this.reset();
  }

  Game.prototype.emit = function (type, data) {
    this.onEvent(type, data || {});
  };

  Game.prototype.reset = function () {
    var deck = Okey.shuffle(Okey.buildDeck(), this.rng);

    // Indicator must be a numbered tile (not a false joker).
    var indicator = null;
    for (var i = deck.length - 1; i >= 0; i--) {
      if (!deck[i].fake) { indicator = deck.splice(i, 1)[0]; break; }
    }
    this.indicator = indicator;
    this.okey = Okey.okeyFromIndicator(indicator);

    // Deal: each player 21 tiles, starting player gets 22.
    this.hands = [[], [], [], []];
    this.opened = [false, false, false, false];
    this.melds = []; // table melds: {owner, type, tiles:[]}
    this.discards = [[], [], [], []];
    this.starter = Math.floor(this.rng() * 4);

    for (var p = 0; p < 4; p++) {
      var count = (p === this.starter) ? 22 : 21;
      for (var k = 0; k < count; k++) this.hands[p].push(deck.pop());
    }
    this.stock = deck; // remaining draw pile
    this.current = this.starter;
    // Starter begins already holding 22, so their first act is ACTION (discard).
    this.phase = PHASE.ACTION;
    this.lastDrawFromDiscard = false;
    this.winner = null;
    this.roundOver = false;

    this.emit('deal', { indicator: this.indicator, okey: this.okey, starter: this.starter });
  };

  Game.prototype.isHuman = function (seat) { return seat === this.humanSeat; };

  Game.prototype.aiDifficulty = function (seat) {
    // seats other than human get difficulties in order
    var aiIndex = 0;
    for (var s = 0; s < 4; s++) {
      if (s === this.humanSeat) continue;
      if (s === seat) return this.difficulties[aiIndex] || 'medium';
      aiIndex++;
    }
    return 'medium';
  };

  // ---- Draw actions -------------------------------------------------------

  Game.prototype.drawFromStock = function (seat) {
    if (this.phase !== PHASE.DRAW || this.current !== seat) return { ok: false, reason: 'Not your draw.' };
    if (this.stock.length === 0) { return this.endRoundStockEmpty(); }
    var tile = this.stock.pop();
    this.hands[seat].push(tile);
    this.phase = PHASE.ACTION;
    this.lastDrawFromDiscard = false;
    this.emit('draw', { seat: seat, tile: tile, source: 'stock', stockLeft: this.stock.length });
    return { ok: true, tile: tile };
  };

  Game.prototype.drawFromDiscard = function (seat) {
    if (this.phase !== PHASE.DRAW || this.current !== seat) return { ok: false, reason: 'Not your draw.' };
    var left = (seat + 3) % 4; // player to the left (previous player)
    var pile = this.discards[left];
    if (pile.length === 0) return { ok: false, reason: 'No discard to take.' };
    var tile = pile.pop();
    this.hands[seat].push(tile);
    this.phase = PHASE.ACTION;
    this.lastDrawFromDiscard = true;
    this.emit('draw', { seat: seat, tile: tile, source: 'discard', from: left });
    return { ok: true, tile: tile };
  };

  // ---- Melding ------------------------------------------------------------
  // meldTileIds: array of arrays of tile ids the player wants to lay as melds
  // For the first meld (opening) the combined value must be >= 101.

  Game.prototype.layMelds = function (seat, groups) {
    if (this.phase !== PHASE.ACTION || this.current !== seat) return { ok: false, reason: 'Not your turn.' };
    var hand = this.hands[seat];
    var validated = [];
    var totalValue = 0;
    var usedIds = {};

    for (var i = 0; i < groups.length; i++) {
      var tiles = this.tilesByIds(hand, groups[i], usedIds);
      if (!tiles) return { ok: false, reason: 'Tile selection error.' };
      var res = Okey.validateMeld(tiles, this.okey);
      if (!res.valid) return { ok: false, reason: res.reason || 'Invalid meld.' };
      validated.push({ tiles: tiles, type: res.type, points: res.points });
      totalValue += res.points;
      for (var t = 0; t < tiles.length; t++) usedIds[tiles[t].id] = true;
    }

    if (!this.opened[seat]) {
      if (totalValue < Okey.OPEN_THRESHOLD) {
        return { ok: false, reason: 'Need at least 101 points to open (have ' + totalValue + ').' };
      }
    }

    // Commit: remove tiles from hand, add melds to table.
    for (var v = 0; v < validated.length; v++) {
      var m = validated[v];
      for (var x = 0; x < m.tiles.length; x++) this.removeTile(hand, m.tiles[x].id);
      this.melds.push({ owner: seat, type: m.type, tiles: m.tiles });
    }
    this.opened[seat] = true;
    this.emit('meld', { seat: seat, count: validated.length, value: totalValue });
    return { ok: true, value: totalValue, melds: validated.length };
  };

  // Lay off a single tile onto an existing table meld.
  Game.prototype.layOff = function (seat, tileId, meldIndex) {
    if (this.phase !== PHASE.ACTION || this.current !== seat) return { ok: false, reason: 'Not your turn.' };
    if (!this.opened[seat]) return { ok: false, reason: 'You must open before laying off.' };
    var meld = this.melds[meldIndex];
    if (!meld) return { ok: false, reason: 'No such meld.' };
    var tile = this.findTile(this.hands[seat], tileId);
    if (!tile) return { ok: false, reason: 'Tile not in hand.' };
    if (!Okey.canLayOff(tile, meld, this.okey)) return { ok: false, reason: 'Cannot add that tile there.' };
    this.removeTile(this.hands[seat], tileId);
    meld.tiles.push(tile);
    this.emit('layoff', { seat: seat, meldIndex: meldIndex });
    return { ok: true };
  };

  // ---- Discard ------------------------------------------------------------

  Game.prototype.discard = function (seat, tileId) {
    if (this.phase !== PHASE.ACTION || this.current !== seat) return { ok: false, reason: 'Not your turn.' };
    var hand = this.hands[seat];
    var tile = this.findTile(hand, tileId);
    if (!tile) return { ok: false, reason: 'Tile not in hand.' };
    this.removeTile(hand, tileId);
    this.discards[seat].push(tile);
    this.emit('discard', { seat: seat, tile: tile });

    // Win check: hand empty AND opened.
    if (hand.length === 0 && this.opened[seat]) {
      return this.finishRound(seat);
    }

    // Advance turn.
    this.current = (seat + 1) % 4;
    this.phase = PHASE.DRAW;
    this.emit('turn', { seat: this.current });
    return { ok: true };
  };

  // ---- Round end ----------------------------------------------------------

  Game.prototype.finishRound = function (winnerSeat) {
    this.winner = winnerSeat;
    this.phase = PHASE.OVER;
    this.roundOver = true;

    // Scoring: winner subtracts, losers add their remaining hand value.
    var results = [];
    for (var p = 0; p < 4; p++) {
      var penalty = (p === winnerSeat) ? 0 : Okey.handPenalty(this.hands[p], this.okey);
      results.push(penalty);
      this.scores[p] += penalty;
    }
    // Winner bonus: reduce score by 101 (going out reward), floor optional.
    this.scores[winnerSeat] -= 101;

    this.emit('roundOver', { winner: winnerSeat, results: results, scores: this.scores.slice() });
    return { ok: true, winner: winnerSeat };
  };

  Game.prototype.endRoundStockEmpty = function () {
    // Stock exhausted: no winner. Everyone keeps their penalty, no bonus.
    this.phase = PHASE.OVER;
    this.roundOver = true;
    var results = [];
    for (var p = 0; p < 4; p++) {
      var penalty = Okey.handPenalty(this.hands[p], this.okey);
      results.push(penalty);
      this.scores[p] += penalty;
    }
    this.emit('roundOver', { winner: null, results: results, scores: this.scores.slice(), drawn: true });
    return { ok: false, reason: 'Stock empty; round drawn.' };
  };

  // ---- Utilities ----------------------------------------------------------

  Game.prototype.findTile = function (hand, id) {
    for (var i = 0; i < hand.length; i++) if (hand[i].id === id) return hand[i];
    return null;
  };

  Game.prototype.removeTile = function (hand, id) {
    for (var i = 0; i < hand.length; i++) {
      if (hand[i].id === id) { return hand.splice(i, 1)[0]; }
    }
    return null;
  };

  Game.prototype.tilesByIds = function (hand, ids, alreadyUsed) {
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      if (alreadyUsed[ids[i]]) return null;
      var t = this.findTile(hand, ids[i]);
      if (!t) return null;
      out.push(t);
    }
    return out;
  };

  Game.PHASE = PHASE;

  global.OkeyGame = Game;
  if (typeof module !== 'undefined' && module.exports) module.exports = Game;

})(typeof window !== 'undefined' ? window : globalThis);
