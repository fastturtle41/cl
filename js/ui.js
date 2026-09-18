/*
 * Okey 101 - Browser UI controller.
 * Wires the pure engine/game/AI to the DOM. Human is always seat 0 (bottom).
 * Turn order is clockwise: 0 (you) -> 1 (right) -> 2 (top) -> 3 (left).
 */
(function () {
  'use strict';

  var Okey = window.Okey;
  var Game = window.OkeyGame;
  var AI = window.OkeyAI;

  var HUMAN = 0;
  var NAMES = ['You', 'Ayşe', 'Mehmet', 'Zeynep'];
  var AI_DELAY = window.__OKEY_FAST ? 0 : 750; // test hook for headless runs

  var game = null;
  var scores = [0, 0, 0, 0];
  var selected = {};          // tileId -> true
  var stagedIds = {};         // tileId -> true (in a staged meld)
  var stagedMelds = [];       // [{ ids:[], points, type }]
  var busy = false;           // AI thinking, ignore human input

  // ---- DOM helpers --------------------------------------------------------
  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function tileEl(tile, sizeClass) {
    var e = el('div', 'tile' + (sizeClass ? ' ' + sizeClass : ''));
    if (!game) return e;
    var okey = game.okey;
    if (tile.fake) {
      e.classList.add('fake');
      e.textContent = '✵';
      e.title = 'False joker — acts as ' + okey.color + ' ' + okey.num;
    } else {
      e.classList.add('c-' + tile.color);
      e.textContent = tile.num;
      if (Okey.isWild(tile, okey)) {
        e.classList.add('wild');
        e.title = 'Okey (wild) — ' + tile.color + ' ' + tile.num;
      }
    }
    e.dataset.tileId = tile.id;
    return e;
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function log(msg, cls) {
    var box = $('#log');
    var e = el('div', 'log-entry' + (cls ? ' ' + cls : ''), msg);
    box.appendChild(e);
    box.scrollTop = box.scrollHeight;
  }

  // ---- New game -----------------------------------------------------------
  function difficultiesFromSelect() {
    var v = $('#difficulty-select').value;
    if (v === 'mixed') return ['easy', 'medium', 'hard'];
    return [v, v, v];
  }

  function newRound() {
    var diffs = difficultiesFromSelect();
    game = new Game({
      humanSeat: HUMAN,
      difficulties: diffs,
      scores: scores.slice(),
      rng: window.__OKEY_RNG || Math.random, // test hook; defaults to Math.random
      onEvent: onGameEvent
    });
    scores = game.scores;
    if (window.__OKEY_FAST) window.__okeyGame = game; // test hook only
    selected = {};
    stagedIds = {};
    stagedMelds = [];
    busy = false;
    $('#overlay').hidden = true;
    $('#log').innerHTML = '';
    log('New round dealt. Okey (wild) is ' + game.okey.color + ' ' + game.okey.num + '.');
    log('Starter: ' + NAMES[game.starter] + '.');
    render();
    routeTurn();
  }

  function onGameEvent(type, data) {
    switch (type) {
      case 'draw':
        if (data.seat !== HUMAN)
          log(NAMES[data.seat] + ' drew from ' + (data.source === 'discard' ? 'the discard' : 'the stock') + '.');
        break;
      case 'meld':
        log(NAMES[data.seat] + ' laid ' + data.count + ' meld(s)' +
            (data.value ? ' (' + data.value + ' pts)' : '') + '.',
            data.seat === HUMAN ? 'you' : '');
        break;
      case 'layoff':
        log(NAMES[data.seat] + ' laid off a tile.');
        break;
      case 'discard':
        if (data.seat !== HUMAN) log(NAMES[data.seat] + ' discarded ' + tileName(data.tile) + '.');
        break;
      case 'roundOver':
        break;
    }
  }

  function tileName(tile) {
    if (tile.fake) return 'false joker';
    return tile.color + ' ' + tile.num;
  }

  // ---- Rendering ----------------------------------------------------------
  function render() {
    if (!game) return;
    // Okey info
    $('#indicator-tile').replaceWith(makeInfoTile('indicator-tile', game.indicator));
    var okeyDisplay = Okey.makeTile(game.okey.color, game.okey.num, false, 'okeydisp');
    $('#okey-tile').replaceWith(makeInfoTile('okey-tile', okeyDisplay, true));
    $('#stock-count').textContent = game.stock.length;

    // Seats
    for (var s = 0; s < 4; s++) renderSeat(s);

    // Melds on table
    renderMelds();

    // Human rack
    renderRack();

    // Staging tray
    renderStaging();

    // Active-turn highlight
    document.querySelectorAll('.player-card').forEach(function (c) { c.classList.remove('active-turn'); });
    var activeCard = document.querySelector('#seat-' + game.current + ' .player-card');
    if (activeCard && !game.roundOver) activeCard.classList.add('active-turn');

    // Stock/discard affordances
    var humanTurn = !busy && !game.roundOver && game.current === HUMAN;
    $('#stock').classList.toggle('can-draw', humanTurn && game.phase === Game.PHASE.DRAW && game.stock.length > 0);
    var leftPile = $('#seat-3 .discard-pile');
    var canTake = humanTurn && game.phase === Game.PHASE.DRAW && game.discards[3].length > 0;
    if (leftPile) leftPile.classList.toggle('can-take', canTake);

    refreshControls();

    // Lightweight debug snapshot for headless tests (harmless in normal play).
    window.__okeyDbg = {
      current: game.current, phase: game.phase, roundOver: game.roundOver,
      busy: busy, humanTurn: !busy && !game.roundOver && game.current === HUMAN
    };
  }

  function makeInfoTile(id, tile, wildMark) {
    var e = tileEl(tile, 'mini');
    e.id = id;
    if (wildMark) e.classList.add('wild');
    return e;
  }

  function renderSeat(s) {
    var seat = $('#seat-' + s);
    if (!seat) return;
    var card = seat.querySelector('.player-card');
    seat.querySelector('.player-name').textContent = NAMES[s];
    var diffSpan = seat.querySelector('.player-diff');
    if (s === HUMAN) diffSpan.textContent = 'human';
    else diffSpan.textContent = game.aiDifficulty(s);
    seat.querySelector('.tile-count').textContent = game.hands[s].length;
    seat.querySelector('.score').textContent = scores[s];
    var badge = seat.querySelector('.opened-badge');
    if (badge) badge.hidden = !game.opened[s];

    // opponents: face-down mini hand
    var mini = seat.querySelector('.mini-hand');
    if (mini) {
      mini.innerHTML = '';
      if (s !== HUMAN) {
        for (var i = 0; i < game.hands[s].length; i++) mini.appendChild(el('div', 'mini-tile'));
      }
    }

    // discard pile: show top tile
    var pile = seat.querySelector('.discard-pile');
    if (pile) {
      pile.innerHTML = '';
      var d = game.discards[s];
      if (d.length) pile.appendChild(tileEl(d[d.length - 1], 'small'));
    }
  }

  function renderMelds() {
    var area = $('#melds-area');
    area.innerHTML = '';
    if (!game.melds.length) {
      area.appendChild(el('div', 'melds-hint', 'Melds on the table appear here'));
      return;
    }
    game.melds.forEach(function (meld, idx) {
      var m = el('div', 'table-meld');
      m.appendChild(el('span', 'owner-tag', NAMES[meld.owner].slice(0, 3)));
      meld.tiles.forEach(function (t) { m.appendChild(tileEl(t, 'small')); });
      m.dataset.meldIndex = idx;
      m.addEventListener('click', function () { onMeldClick(idx); });
      area.appendChild(m);
    });
  }

  function renderRack() {
    var rack = $('#rack');
    rack.innerHTML = '';
    var hand = game.hands[HUMAN];
    hand.forEach(function (tile) {
      if (stagedIds[tile.id]) return; // hidden while staged
      var e = tileEl(tile);
      if (selected[tile.id]) e.classList.add('selected');
      e.addEventListener('click', function () { onRackTileClick(tile.id); });
      rack.appendChild(e);
    });
  }

  function renderStaging() {
    var tray = $('#staging-tray');
    if (!stagedMelds.length) { tray.hidden = true; return; }
    tray.hidden = false;
    var list = $('#staged-list');
    list.innerHTML = '';
    var total = 0;
    stagedMelds.forEach(function (m) {
      total += m.points;
      var g = el('div', 'staged-meld');
      m.ids.forEach(function (id) {
        var tile = findHandTile(id);
        if (tile) g.appendChild(tileEl(tile, 'small'));
      });
      list.appendChild(g);
    });
    $('#staged-total').textContent = 'Total: ' + total +
      (game.opened[HUMAN] ? '' : ' / ' + Okey.OPEN_THRESHOLD + ' to open');
  }

  function findHandTile(id) {
    var hand = game.hands[HUMAN];
    for (var i = 0; i < hand.length; i++) if (hand[i].id === id) return hand[i];
    return null;
  }

  // ---- Controls state -----------------------------------------------------
  function refreshControls() {
    var humanTurn = !busy && !game.roundOver && game.current === HUMAN;
    var drawPhase = humanTurn && game.phase === Game.PHASE.DRAW;
    var actionPhase = humanTurn && game.phase === Game.PHASE.ACTION;
    var selCount = Object.keys(selected).length;

    $('#draw-stock-btn').disabled = !drawPhase || game.stock.length === 0;
    $('#take-discard-btn').disabled = !drawPhase || game.discards[3].length === 0;
    $('#group-btn').disabled = !actionPhase || selCount < 3;
    $('#commit-btn').disabled = !actionPhase || stagedMelds.length === 0;
    $('#undo-stage-btn').disabled = !actionPhase || stagedMelds.length === 0;
    $('#discard-btn').disabled = !actionPhase || selCount !== 1;
    $('#layoff-btn').disabled = !actionPhase || !game.opened[HUMAN] || selCount !== 1;
  }

  // ---- Human interactions -------------------------------------------------
  function onRackTileClick(id) {
    if (busy || game.current !== HUMAN) return;
    if (selected[id]) delete selected[id];
    else selected[id] = true;
    render();
  }

  function selectedIds() { return Object.keys(selected); }

  function onDrawStock() {
    if (busy) return;
    var r = game.drawFromStock(HUMAN);
    if (!r.ok) { toast(r.reason || 'Cannot draw.'); return; }
    log('You drew ' + tileName(r.tile) + '.', 'you');
    render();
  }

  function onTakeDiscard() {
    if (busy) return;
    var r = game.drawFromDiscard(HUMAN);
    if (!r.ok) { toast(r.reason || 'Cannot take.'); return; }
    log('You took ' + tileName(r.tile) + ' from the discard.', 'you');
    render();
  }

  function onGroup() {
    var ids = selectedIds();
    if (ids.length < 3) return;
    var tiles = ids.map(findHandTile);
    var res = Okey.validateMeld(tiles, game.okey);
    if (!res.valid) { toast(res.reason || 'Not a valid meld.'); return; }
    stagedMelds.push({ ids: ids.slice(), points: res.points, type: res.type });
    ids.forEach(function (id) { stagedIds[id] = true; });
    selected = {};
    render();
  }

  function onUndoStage() {
    var m = stagedMelds.pop();
    if (!m) return;
    m.ids.forEach(function (id) { delete stagedIds[id]; });
    render();
  }

  function onCommit() {
    if (!stagedMelds.length) return;
    var groups = stagedMelds.map(function (m) { return m.ids; });
    var r = game.layMelds(HUMAN, groups);
    if (!r.ok) { toast(r.reason); return; }
    log('You laid ' + r.melds + ' meld(s) worth ' + r.value + ' pts.', 'you');
    stagedMelds = [];
    stagedIds = {};
    selected = {};
    render();
    checkAutoWin();
  }

  function onLayoffBtn() {
    // Highlight valid targets; user then clicks a meld.
    var ids = selectedIds();
    if (ids.length !== 1) return;
    var tile = findHandTile(ids[0]);
    var any = false;
    document.querySelectorAll('.table-meld').forEach(function (m) {
      var idx = parseInt(m.dataset.meldIndex, 10);
      if (Okey.canLayOff(tile, game.melds[idx], game.okey)) { m.classList.add('layoff-target'); any = true; }
    });
    if (!any) toast('No meld accepts that tile.');
    else toast('Click a highlighted meld to lay off.');
  }

  function onMeldClick(idx) {
    if (busy || game.current !== HUMAN || game.phase !== Game.PHASE.ACTION) return;
    var ids = selectedIds();
    if (ids.length !== 1) return;
    if (!game.opened[HUMAN]) { toast('Open first (lay 101+) before laying off.'); return; }
    var r = game.layOff(HUMAN, ids[0], idx);
    if (!r.ok) { toast(r.reason); return; }
    log('You laid off a tile.', 'you');
    selected = {};
    render();
    checkAutoWin();
  }

  function onDiscard() {
    var ids = selectedIds();
    if (ids.length !== 1) return;
    var tile = findHandTile(ids[0]);
    var r = game.discard(HUMAN, ids[0]);
    if (!r.ok) { toast(r.reason); return; }
    log('You discarded ' + tileName(tile) + '.', 'you');
    selected = {};
    // discard() may have ended the round (you went out) or advanced the turn.
    advance();
  }

  // If a meld/layoff emptied the hand and we've opened, the round is over.
  function checkAutoWin() {
    if (game.roundOver) { advance(); }
  }

  // ---- Turn routing -------------------------------------------------------
  function routeTurn() { advance(); }

  function advance() {
    render();
    if (game.roundOver) { showRoundOver(); return; }
    if (game.current === HUMAN) { beginHumanTurn(); return; }
    scheduleAi();
  }

  function beginHumanTurn() {
    busy = false;
    if (game.phase === Game.PHASE.DRAW) {
      log('Your turn — draw a tile.', 'you');
    } else {
      log('Your turn — meld and discard.', 'you');
    }
    render();
  }

  function scheduleAi() {
    busy = true;
    render();
    var seat = game.current;
    setTimeout(function () {
      try {
        AI.takeTurn(game, seat);
      } catch (e) {
        console.error(e);
      }
      busy = false;
      advance();
    }, AI_DELAY);
  }

  // ---- Round over ---------------------------------------------------------
  function showRoundOver() {
    render();
    var overlay = $('#overlay');
    var title = $('#overlay-title');
    var body = $('#overlay-body');
    body.innerHTML = '';

    if (game.winner == null) {
      title.textContent = 'Round Drawn';
      body.appendChild(el('p', null, 'The stock ran out — nobody went out.'));
      log('Round drawn (stock empty).', 'win');
    } else {
      title.textContent = (game.winner === HUMAN ? 'You Win the Round! 🎉' : NAMES[game.winner] + ' wins the round');
      log(NAMES[game.winner] + ' went out!', 'win');
    }

    var table = el('table');
    table.style.margin = '0 auto';
    table.innerHTML = '<tr><th style="padding:2px 12px">Player</th>' +
                      '<th style="padding:2px 12px">Hand left</th>' +
                      '<th style="padding:2px 12px">Total</th></tr>';
    for (var s = 0; s < 4; s++) {
      var left = (s === game.winner) ? 0 : Okey.handPenalty(game.hands[s], game.okey);
      var tr = el('tr');
      tr.innerHTML = '<td style="padding:2px 12px">' + NAMES[s] + (s === HUMAN ? ' (you)' : '') + '</td>' +
                     '<td style="padding:2px 12px;text-align:center">' + (s === game.winner ? '—' : left) + '</td>' +
                     '<td style="padding:2px 12px;text-align:center;font-weight:bold">' + scores[s] + '</td>';
      table.appendChild(tr);
    }
    body.appendChild(table);
    body.appendChild(el('p', null, 'Lower total is better.'));
    overlay.hidden = false;
  }

  // ---- Wire up ------------------------------------------------------------
  function init() {
    $('#new-game-btn').addEventListener('click', function () { scores = [0, 0, 0, 0]; newRound(); });
    $('#overlay-btn').addEventListener('click', function () { newRound(); });
    $('#draw-stock-btn').addEventListener('click', onDrawStock);
    $('#take-discard-btn').addEventListener('click', onTakeDiscard);
    $('#sort-btn').addEventListener('click', function () {
      if (!game) return;
      game.hands[HUMAN] = Okey.sortHand(game.hands[HUMAN], game.okey);
      render();
    });
    $('#group-btn').addEventListener('click', onGroup);
    $('#commit-btn').addEventListener('click', onCommit);
    $('#undo-stage-btn').addEventListener('click', onUndoStage);
    $('#layoff-btn').addEventListener('click', onLayoffBtn);
    $('#discard-btn').addEventListener('click', onDiscard);
    $('#stock').addEventListener('click', function () {
      if (!busy && game && game.current === HUMAN && game.phase === Game.PHASE.DRAW) onDrawStock();
    });
    $('#seat-3 .discard-pile').addEventListener('click', function () {
      if (!busy && game && game.current === HUMAN && game.phase === Game.PHASE.DRAW) onTakeDiscard();
    });
    $('.you-discard').addEventListener('click', function () {
      // quick discard: if exactly one selected
      if (Object.keys(selected).length === 1) onDiscard();
    });

    newRound();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
