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
  var AI_DELAY = window.__OKEY_FAST ? 0 : 750; // test hook for headless runs

  // ---- Famous-figure opponents & portrait avatars -------------------------
  // Each opponent is a well-known historical figure with a hand-tuned flat
  // portrait drawn as inline SVG (works fully offline). Three are picked at
  // random per match; seat 0 is always "You".
  var YOU_FIGURE = {
    name: 'You',
    bg: '#3d5a45', skin: '#e8b98f', hair: 'short', hairColor: '#5a3a22', smile: true
  };
  var FIGURE_POOL = [
    { name: 'Einstein',    bg: '#37475a', skin: '#e8bd94', hair: 'wild',  hairColor: '#e9e9e9', mustache: '#dcdcdc' },
    { name: 'Beethoven',   bg: '#5a3535', skin: '#e6b98f', hair: 'wild',  hairColor: '#6b4a2a', brow: true },
    { name: 'Mozart',      bg: '#5f4a78', skin: '#f0d3b3', hair: 'wig',   hairColor: '#f2f2f2' },
    { name: 'Tesla',       bg: '#2c3e50', skin: '#e6b98f', hair: 'slick', hairColor: '#241f1c', mustache: '#241f1c' },
    { name: 'Cleopatra',   bg: '#7a6420', skin: '#cf9b6a', hair: 'long',  hairColor: '#181818', headband: '#d4af37' },
    { name: 'Frida',       bg: '#3a5a3a', skin: '#cf9b6a', hair: 'bun',   hairColor: '#181818', brow: true, flower: '#e5568f' },
    { name: 'Napoleon',    bg: '#33366a', skin: '#e6b98f', hair: 'short', hairColor: '#2a2a2a', hat: 'bicorne' },
    { name: 'Atatürk',     bg: '#455a6a', skin: '#f0d3b3', hair: 'short', hairColor: '#d9c07a', brow: true },
    { name: 'Curie',       bg: '#444a52', skin: '#e6b98f', hair: 'bun',   hairColor: '#3a2a1a' },
    { name: 'Shakespeare', bg: '#574a38', skin: '#e6b98f', hair: 'short', hairColor: '#7a5a38', goatee: '#7a5a38', bald: true },
    { name: 'Gandhi',      bg: '#5a4a2a', skin: '#b98a5a', hair: 'bald',  hairColor: '#333', glasses: true },
    { name: 'Da Vinci',    bg: '#4a4030', skin: '#e6b98f', hair: 'long',  hairColor: '#8a7a5a', beard: '#8a7a5a' }
  ];

  var figures = [YOU_FIGURE, FIGURE_POOL[0], FIGURE_POOL[1], FIGURE_POOL[2]];

  function assignFigures() {
    var pool = FIGURE_POOL.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    figures = [YOU_FIGURE, pool[0], pool[1], pool[2]];
  }

  function nameOf(seat) { return (figures[seat] && figures[seat].name) || ('Player ' + seat); }

  // Build a compact flat-portrait SVG from a figure config.
  function avatarSVG(f) {
    var p = [];
    p.push('<svg viewBox="0 0 48 48" preserveAspectRatio="xMidYMid slice" aria-hidden="true">');
    p.push('<rect width="48" height="48" fill="' + f.bg + '"/>');
    // shoulders / clothing
    p.push('<path d="M6 48 C7 39 15 35 24 35 C33 35 41 39 42 48 Z" fill="rgba(0,0,0,0.28)"/>');
    // neck
    p.push('<rect x="21" y="30" width="6" height="7" rx="2" fill="' + f.skin + '"/>');
    // ears
    p.push('<circle cx="14" cy="22" r="2.4" fill="' + f.skin + '"/><circle cx="34" cy="22" r="2.4" fill="' + f.skin + '"/>');
    // head
    p.push('<ellipse cx="24" cy="21" rx="10.5" ry="11.5" fill="' + f.skin + '"/>');
    // hair (behind/around) depending on style
    if (f.hair === 'long') {
      p.push('<path d="M12 16 C12 8 36 8 36 16 L36 33 C34 27 33 24 33 20 C33 14 15 14 15 20 C15 24 14 27 12 33 Z" fill="' + f.hairColor + '"/>');
    }
    if (f.hair === 'wig') {
      p.push('<path d="M12 22 C8 22 9 13 13 12 C13 6 35 6 35 12 C39 13 40 22 36 22 C37 17 35 14 33 13 C33 10 15 10 15 13 C13 14 11 17 12 22 Z" fill="' + f.hairColor + '"/>');
      p.push('<circle cx="12" cy="24" r="3.2" fill="' + f.hairColor + '"/><circle cx="36" cy="24" r="3.2" fill="' + f.hairColor + '"/>');
    }
    if (f.hair === 'wild') {
      p.push('<g fill="' + f.hairColor + '">');
      p.push('<circle cx="14" cy="13" r="5"/><circle cx="10" cy="18" r="4.2"/><circle cx="24" cy="9" r="5.5"/>');
      p.push('<circle cx="34" cy="13" r="5"/><circle cx="38" cy="18" r="4.2"/><circle cx="18" cy="10" r="4.5"/><circle cx="30" cy="10" r="4.5"/>');
      p.push('</g>');
    }
    if (f.hair === 'short' && !f.bald) {
      p.push('<path d="M13 20 C13 9 35 9 35 20 C33 15 31 13 24 13 C17 13 15 15 13 20 Z" fill="' + f.hairColor + '"/>');
    }
    if (f.hair === 'slick') {
      p.push('<path d="M13 19 C13 10 35 10 35 19 C33 14 31 12 24 12 C17 12 15 14 13 19 Z" fill="' + f.hairColor + '"/>');
      p.push('<rect x="23.4" y="11" width="1.2" height="6" fill="' + f.bg + '" opacity="0.5"/>'); // center part
    }
    if (f.hair === 'bun') {
      p.push('<path d="M13 20 C13 9 35 9 35 20 C33 14 31 12 24 12 C17 12 15 14 13 20 Z" fill="' + f.hairColor + '"/>');
      p.push('<circle cx="24" cy="7" r="4" fill="' + f.hairColor + '"/>');
    }
    if (f.hair === 'bald') {
      p.push('<path d="M14 21 C15 17 17 16 18 16 C16 19 16 21 16 21 Z M34 21 C33 17 31 16 30 16 C32 19 32 21 32 21 Z" fill="' + (f.hairColor || '#333') + '"/>');
    }
    if (f.headband) {
      p.push('<rect x="13" y="12" width="22" height="3.4" rx="1.5" fill="' + f.headband + '"/>');
      p.push('<circle cx="24" cy="13.7" r="1.6" fill="' + f.headband + '" stroke="#a5842a" stroke-width="0.5"/>');
    }
    if (f.hat === 'bicorne') {
      p.push('<path d="M8 15 C14 7 34 7 40 15 C34 12 14 12 8 15 Z" fill="#20233a"/>');
      p.push('<rect x="22" y="9" width="4" height="4" fill="#c9a227"/>');
    }
    if (f.flower) p.push('<circle cx="32" cy="12" r="3" fill="' + f.flower + '"/><circle cx="32" cy="12" r="1.2" fill="#ffd257"/>');
    // brows
    if (f.brow) p.push('<rect x="17" y="19" width="6" height="1.6" rx="0.8" fill="#3a2a1a"/><rect x="25" y="19" width="6" height="1.6" rx="0.8" fill="#3a2a1a"/>');
    // eyes
    p.push('<circle cx="20" cy="22" r="1.5" fill="#2a2320"/><circle cx="28" cy="22" r="1.5" fill="#2a2320"/>');
    // glasses
    if (f.glasses) {
      p.push('<g fill="none" stroke="#333" stroke-width="1"><circle cx="20" cy="22" r="3"/><circle cx="28" cy="22" r="3"/><line x1="23" y1="22" x2="25" y2="22"/></g>');
    }
    // mouth / smile
    if (f.smile) p.push('<path d="M20 27 Q24 30 28 27" fill="none" stroke="#8a4a3a" stroke-width="1.4" stroke-linecap="round"/>');
    else p.push('<path d="M21 27.5 L27 27.5" stroke="#8a4a3a" stroke-width="1.3" stroke-linecap="round"/>');
    // mustache
    if (f.mustache) p.push('<path d="M18 26.5 Q24 25 30 26.5 Q24 29 18 26.5 Z" fill="' + f.mustache + '"/>');
    // beard
    if (f.beard) p.push('<path d="M15 25 C15 34 33 34 33 25 C33 33 28 36 24 36 C20 36 15 33 15 25 Z" fill="' + f.beard + '" opacity="0.92"/>');
    // goatee
    if (f.goatee) p.push('<path d="M21 29 Q24 34 27 29 Q24 31 21 29 Z" fill="' + f.goatee + '"/><rect x="23" y="26" width="2" height="4" fill="' + f.goatee + '"/>');
    p.push('</svg>');
    return p.join('');
  }

  var game = null;
  var scores = [0, 0, 0, 0];
  var roundNum = 1;
  var selected = {};          // tileId -> true
  var stagedIds = {};         // tileId -> true (in a staged meld)
  var stagedMelds = [];       // [{ ids:[], points, type }]
  var busy = false;           // AI thinking, ignore human input

  // ---- Persistence (match scores + difficulty survive a refresh) ----------
  var STORE_KEY = 'okey101.match';
  function saveMatch() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        scores: scores, roundNum: roundNum, difficulty: $('#difficulty-select').value
      }));
    } catch (e) { /* private mode / disabled storage: ignore */ }
  }
  function loadMatch() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

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

  // mode: 'new'    -> fresh match (round 1, zeroed scores)
  //       'next'   -> next round of the current match (keep scores)
  //       'resume' -> re-deal the current round/scores as loaded from storage
  function newRound(mode) {
    mode = mode || 'new';
    if (mode === 'new') { scores = [0, 0, 0, 0]; roundNum = 1; }
    else if (mode === 'next') { roundNum += 1; }
    var diffs = difficultiesFromSelect();
    game = new Game({
      humanSeat: HUMAN,
      difficulties: diffs,
      scores: scores.slice(),
      rng: window.__OKEY_RNG || Math.random, // test hook; defaults to Math.random
      onEvent: onGameEvent
    });
    scores = game.scores;
    assignFigures();
    if (window.__OKEY_FAST) window.__okeyGame = game; // test hook only
    selected = {};
    stagedIds = {};
    stagedMelds = [];
    busy = false;
    $('#overlay').hidden = true;
    $('#log').innerHTML = '';
    $('#round-count').textContent = roundNum;
    saveMatch();
    log('Round ' + roundNum + ' dealt. Okey (wild) is ' + game.okey.color + ' ' + game.okey.num + '.');
    log('Starter: ' + nameOf(game.starter) + '.');
    render();
    routeTurn();
  }

  function onGameEvent(type, data) {
    switch (type) {
      case 'draw':
        if (data.seat !== HUMAN)
          log(nameOf(data.seat) + ' drew from ' + (data.source === 'discard' ? 'the discard' : 'the stock') + '.');
        break;
      case 'meld':
        log(nameOf(data.seat) + ' laid ' + data.count + ' meld(s)' +
            (data.value ? ' (' + data.value + ' pts)' : '') + '.',
            data.seat === HUMAN ? 'you' : '');
        break;
      case 'layoff':
        log(nameOf(data.seat) + ' laid off a tile.');
        break;
      case 'discard':
        if (data.seat !== HUMAN) log(nameOf(data.seat) + ' discarded ' + tileName(data.tile) + '.');
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
    seat.querySelector('.player-name').textContent = nameOf(s);
    var avatar = seat.querySelector('.avatar');
    if (avatar && figures[s]) avatar.innerHTML = avatarSVG(figures[s]);
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
    // If exactly one tile is selected and we've opened, glow the melds it can
    // legally join so the player can just click a target to lay off.
    var selIds = Object.keys(selected);
    var layoffTile = null;
    if (selIds.length === 1 && game.opened[HUMAN] && game.current === HUMAN &&
        game.phase === Game.PHASE.ACTION && !busy) {
      layoffTile = findHandTile(selIds[0]);
    }
    game.melds.forEach(function (meld, idx) {
      var m = el('div', 'table-meld');
      m.appendChild(el('span', 'owner-tag', nameOf(meld.owner).slice(0, 3)));
      meld.tiles.forEach(function (t) { m.appendChild(tileEl(t, 'small')); });
      m.dataset.meldIndex = idx;
      if (layoffTile && Okey.canLayOff(layoffTile, meld, game.okey)) m.classList.add('layoff-target');
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

  // ---- Hint ---------------------------------------------------------------
  function clearHints() {
    document.querySelectorAll('#rack .tile.hint').forEach(function (e) { e.classList.remove('hint'); });
  }
  function markHint(ids) {
    clearHints();
    ids.forEach(function (id) {
      var e = document.querySelector('#rack .tile[data-tile-id="' + id + '"]');
      if (e) e.classList.add('hint');
    });
  }
  function groupsValue(groups) {
    var total = 0;
    for (var i = 0; i < groups.length; i++) {
      var tiles = groups[i].map(findHandTile);
      if (tiles.indexOf(null) !== -1) return -1;
      var res = Okey.validateMeld(tiles, game.okey);
      if (!res.valid) return -1;
      total += res.points;
    }
    return total;
  }

  function onHint() {
    if (busy || !game || game.roundOver || game.current !== HUMAN) { toast('Not your turn yet.'); return; }
    var profile = AI.PROFILES.expert;
    var okey = game.okey;
    var hand = game.hands[HUMAN];

    if (game.phase === Game.PHASE.DRAW) {
      var src = AI.chooseDraw(game, HUMAN, profile);
      toast(src === 'discard' ? 'Tip: take the tile from the discard on your left.'
                              : 'Tip: draw a fresh tile from the stock.');
      return;
    }

    // Can we go out this turn?
    for (var i = 0; i < hand.length; i++) {
      var without = hand.slice(0, i).concat(hand.slice(i + 1));
      var r = Okey.solveHand(without, okey, { mode: 'partition', budget: profile.budget });
      if (r && r.leftover === 0) {
        var groups = AI.meldsToTileGroups(without, r, okey);
        if (!groups) continue;
        if (!game.opened[HUMAN] && groupsValue(groups) < Okey.OPEN_THRESHOLD) continue;
        var allIds = [];
        groups.forEach(function (g) { allIds = allIds.concat(g); });
        markHint(allIds);
        toast('You can GO OUT! Lay these melds, then discard ' + tileName(hand[i]) + '.');
        return;
      }
    }

    if (!game.opened[HUMAN]) {
      var best = Okey.solveHand(hand, okey, { mode: 'value', budget: profile.budget });
      if (best && best.value >= Okey.OPEN_THRESHOLD) {
        var og = AI.meldsToTileGroups(hand, best, okey);
        if (og) {
          var ids = [];
          og.forEach(function (g) { ids = ids.concat(g); });
          markHint(ids);
          toast('You can open — highlighted tiles make ' + best.value + ' points (need 101).');
          return;
        }
      }
      var need = best ? (Okey.OPEN_THRESHOLD - best.value) : Okey.OPEN_THRESHOLD;
      toast('Not enough to open yet (best ' + (best ? best.value : 0) + '/101). Keep building — draw and discard.');
      var d0 = AI.chooseDiscard(game, HUMAN, profile);
      markHint([d0]);
      return;
    }

    // Opened: suggest a lay-off if one exists, else a discard.
    for (var h = 0; h < hand.length; h++) {
      if (Okey.isWild(hand[h], okey)) continue;
      for (var m = 0; m < game.melds.length; m++) {
        if (Okey.canLayOff(hand[h], game.melds[m], okey)) {
          markHint([hand[h].id]);
          toast('Tip: select this tile and click the glowing meld to lay it off.');
          return;
        }
      }
    }
    var d = AI.chooseDiscard(game, HUMAN, profile);
    markHint([d]);
    toast('Nothing new to meld — best discard is highlighted.');
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
      title.textContent = (game.winner === HUMAN ? 'You Win the Round! 🎉' : nameOf(game.winner) + ' wins the round');
      log(nameOf(game.winner) + ' went out!', 'win');
    }

    var table = el('table');
    table.style.margin = '0 auto';
    table.innerHTML = '<tr><th style="padding:2px 12px">Player</th>' +
                      '<th style="padding:2px 12px">Hand left</th>' +
                      '<th style="padding:2px 12px">Total</th></tr>';
    for (var s = 0; s < 4; s++) {
      var left = (s === game.winner) ? 0 : Okey.handPenalty(game.hands[s], game.okey);
      var tr = el('tr');
      tr.innerHTML = '<td style="padding:2px 12px">' + nameOf(s) + (s === HUMAN ? ' (you)' : '') + '</td>' +
                     '<td style="padding:2px 12px;text-align:center">' + (s === game.winner ? '—' : left) + '</td>' +
                     '<td style="padding:2px 12px;text-align:center;font-weight:bold">' + scores[s] + '</td>';
      table.appendChild(tr);
    }
    body.appendChild(table);
    // Standings note: who currently leads (lowest total).
    var lowIdx = 0;
    for (var q = 1; q < 4; q++) if (scores[q] < scores[lowIdx]) lowIdx = q;
    body.appendChild(el('p', null, 'Lower total is better — ' +
      (lowIdx === HUMAN ? 'you are' : nameOf(lowIdx) + ' is') + ' leading after round ' + roundNum + '.'));
    saveMatch();
    overlay.hidden = false;
  }

  // ---- Wire up ------------------------------------------------------------
  function init() {
    $('#new-game-btn').addEventListener('click', function () {
      if (roundNum > 1 && !confirm('Start a new match? Current scores will be cleared.')) return;
      newRound('new');
    });
    $('#overlay-btn').addEventListener('click', function () { newRound('next'); });
    $('#draw-stock-btn').addEventListener('click', onDrawStock);
    $('#take-discard-btn').addEventListener('click', onTakeDiscard);
    $('#sort-btn').addEventListener('click', function () {
      if (!game) return;
      game.hands[HUMAN] = Okey.sortHand(game.hands[HUMAN], game.okey);
      render();
    });
    $('#hint-btn').addEventListener('click', onHint);
    $('#group-btn').addEventListener('click', onGroup);
    $('#commit-btn').addEventListener('click', onCommit);
    $('#undo-stage-btn').addEventListener('click', onUndoStage);
    $('#layoff-btn').addEventListener('click', onLayoffBtn);
    $('#discard-btn').addEventListener('click', onDiscard);
    $('#difficulty-select').addEventListener('change', saveMatch);
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

    // Resume a saved match if one exists (and the tester hasn't rigged an RNG).
    var saved = window.__OKEY_RNG ? null : loadMatch();
    if (saved && saved.scores && saved.roundNum) {
      scores = saved.scores.slice();
      roundNum = saved.roundNum;
      if (saved.difficulty) $('#difficulty-select').value = saved.difficulty;
      newRound('resume');
    } else {
      newRound('new');
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
