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
  // Each opponent is a well-known historical figure with a hand-tuned,
  // shaded inline-SVG portrait (works fully offline — no image files, no
  // network). Three are picked at random per match; seat 0 is always "You".
  //
  // Config fields: bg/bgEdge (radial ground), skin/skin2 (base/shadow),
  // cloth + collar, eye (iris), hair {style,color,hi}, plus optional
  // brow, mustache, beard, goatee, glasses, hat, headdress, flower, unibrow,
  // cravat, ruff.
  var YOU_FIGURE = {
    name: 'You', bg: '#3d5a45', bgEdge: '#20321f', skin: '#e8b98f', skin2: '#c9925f',
    cloth: '#2f4a3a', collar: 'suit', eye: '#5a4a3a',
    hair: { style: 'short', color: '#5a3a22', hi: '#7a5233' }, smile: true
  };
  var FIGURE_POOL = [
    { name: 'Einstein', photo: 'assets/portraits/einstein.jpg', bg: '#3a5064', bgEdge: '#1c2b38', skin: '#e9c6a1', skin2: '#c99b70',
      cloth: '#3a3f4a', collar: 'suit', eye: '#5a4636',
      hair: { style: 'wild', color: '#e6e6e6', hi: '#ffffff' }, mustache: '#d8d8d8', brow: '#d0d0d0' },
    { name: 'Beethoven', photo: 'assets/portraits/beethoven.jpg', bg: '#6a3838', bgEdge: '#331b1b', skin: '#e6b98f', skin2: '#bf8c58',
      cloth: '#242430', collar: 'cravat', eye: '#3a2a1a',
      hair: { style: 'wild', color: '#4a3320', hi: '#6b4a2a' }, brow: '#3a2618', intense: true },
    { name: 'Mozart', photo: 'assets/portraits/mozart.jpg', bg: '#5f4a86', bgEdge: '#2f2348', skin: '#f2d5b5', skin2: '#d3ac86',
      cloth: '#7a1f2a', collar: 'coat', eye: '#4a5a6a',
      hair: { style: 'wig', color: '#f0f0f0', hi: '#ffffff' }, brow: '#c3b199' },
    { name: 'Tesla', photo: 'assets/portraits/tesla.jpg', bg: '#2c3e50', bgEdge: '#131f29', skin: '#e6b98f', skin2: '#bf8c58',
      cloth: '#23262e', collar: 'suit', eye: '#33402f',
      hair: { style: 'slick', color: '#241f1c', hi: '#3c332e' }, mustache: '#241f1c', brow: '#241f1c' },
    { name: 'Cleopatra', photo: 'assets/portraits/cleopatra.jpg', bg: '#7a6420', bgEdge: '#3a2f0e', skin: '#cf9b6a', skin2: '#a87a4e',
      cloth: '#151515', collar: 'dress', eye: '#2a2018',
      hair: { style: 'egyptian', color: '#181818', hi: '#33312e' }, headdress: '#d4af37', kohl: true },
    { name: 'Frida', photo: 'assets/portraits/frida.jpg', bg: '#3a5a3a', bgEdge: '#1c301c', skin: '#cf9b6a', skin2: '#a87a4e',
      cloth: '#b0344a', collar: 'dress', eye: '#2a1a10',
      hair: { style: 'bun', color: '#1a1a1a', hi: '#3a3330' }, unibrow: '#1a1a1a', flower: true },
    { name: 'Napoleon', photo: 'assets/portraits/napoleon.jpg', bg: '#33366a', bgEdge: '#181a3a', skin: '#e6b98f', skin2: '#bf8c58',
      cloth: '#1a2340', collar: 'uniform', eye: '#33445a',
      hair: { style: 'short', color: '#241f1c', hi: '#3a2f28' }, hat: 'bicorne', brow: '#241f1c' },
    { name: 'Atatürk', photo: 'assets/portraits/ataturk.jpg', bg: '#45607a', bgEdge: '#22323f', skin: '#f0d3b3', skin2: '#d0a578',
      cloth: '#2a2f3a', collar: 'suit', eye: '#6f93ab',
      hair: { style: 'slick', color: '#c8b06a', hi: '#e2cf8c' }, brow: '#9a8248', intense: true },
    { name: 'Shakespeare', photo: 'assets/portraits/shakespeare.jpg', bg: '#574a38', bgEdge: '#2b2418', skin: '#e6b98f', skin2: '#bf8c58',
      cloth: '#161616', collar: 'ruff', eye: '#4a3a2a',
      hair: { style: 'balding', color: '#7a5a38', hi: '#95744c' }, goatee: '#7a5a38' },
    { name: 'Gandhi', photo: 'assets/portraits/gandhi.jpg', bg: '#5a4a2a', bgEdge: '#2c2414', skin: '#b98a5a', skin2: '#96693c',
      cloth: '#efe9dd', collar: 'robe', eye: '#2a1a10',
      hair: { style: 'bald', color: '#4a4a4a', hi: '#5a5a5a' }, glasses: true, mustache: '#555555' },
    { name: 'Da Vinci', photo: 'assets/portraits/davinci.jpg', bg: '#4a4030', bgEdge: '#241f16', skin: '#e6b98f', skin2: '#bf8c58',
      cloth: '#3a2f20', collar: 'robe', eye: '#4a3a2a',
      hair: { style: 'long', color: '#8a7a5a', hi: '#a89877' }, beard: '#8a7a5a', cap: '#33291c' }
  ];

  var figures = [YOU_FIGURE, FIGURE_POOL[0], FIGURE_POOL[1], FIGURE_POOL[2]];
  var avatarUid = 0;

  function assignFigures() {
    var pool = FIGURE_POOL.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    figures = [YOU_FIGURE, pool[0], pool[1], pool[2]];
  }

  function nameOf(seat) { return (figures[seat] && figures[seat].name) || ('Player ' + seat); }

  function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  // Avatar markup for a figure: a real portrait photo when one is provided,
  // otherwise the hand-drawn illustrated SVG fallback (used for You and any
  // figure without artwork). The <img> fills the round avatar frame via CSS
  // (object-fit: cover), matching the SVG portraits' sizing.
  function avatarMarkup(f) {
    if (f.photo) return '<img src="' + escapeAttr(f.photo) + '" alt="' + escapeAttr(f.name) + '">';
    return avatarSVG(f);
  }

  // Build a shaded illustrated portrait (100x100 viewBox) for a figure.
  function avatarSVG(f) {
    var u = 'av' + (avatarUid++);
    var hair = f.hair || { style: 'short', color: '#4a3a2a', hi: '#5a4530' };
    var browCol = f.brow || hair.color;
    var p = [];
    p.push('<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">');
    p.push('<defs>');
    p.push('<radialGradient id="' + u + 'bg" cx="50%" cy="38%" r="72%">' +
           '<stop offset="0%" stop-color="' + f.bg + '"/><stop offset="100%" stop-color="' + (f.bgEdge || f.bg) + '"/></radialGradient>');
    p.push('<linearGradient id="' + u + 'skin" x1="0" y1="0" x2="0" y2="1">' +
           '<stop offset="0%" stop-color="' + f.skin + '"/><stop offset="100%" stop-color="' + (f.skin2 || f.skin) + '"/></linearGradient>');
    p.push('</defs>');
    p.push('<rect width="100" height="100" fill="url(#' + u + 'bg)"/>');

    // --- back hair (behind the head) for long/wig/egyptian styles
    if (hair.style === 'long' || hair.style === 'egyptian')
      p.push('<path d="M22 40 C20 18 80 18 78 40 L79 74 C74 60 72 52 72 44 C72 30 28 30 28 44 C28 52 26 60 21 74 Z" fill="' + hair.color + '"/>');
    if (hair.style === 'wig')
      p.push('<path d="M22 52 C12 52 15 26 26 24 C26 12 74 12 74 24 C85 26 88 52 78 52 C80 40 74 32 68 30 C68 22 32 22 32 30 C26 32 20 40 22 52 Z" fill="' + hair.color + '"/>');

    // --- shoulders / clothing + collar
    p.push('<path d="M8 100 C10 80 28 72 50 72 C72 72 90 80 92 100 Z" fill="' + (f.cloth || '#333') + '"/>');
    p.push('<path d="M8 100 C10 80 28 72 50 72 C72 72 90 80 92 100 Z" fill="rgba(0,0,0,0.18)" opacity="0.5"/>');
    drawCollar(p, f);

    // --- neck (with shadow under jaw)
    p.push('<path d="M42 62 h16 v10 c0 5 -16 5 -16 0 Z" fill="' + (f.skin2 || f.skin) + '"/>');
    p.push('<ellipse cx="50" cy="63" rx="10" ry="4" fill="rgba(0,0,0,0.12)"/>');

    // --- ears
    p.push('<circle cx="28" cy="46" r="5" fill="url(#' + u + 'skin)"/><circle cx="72" cy="46" r="5" fill="url(#' + u + 'skin)"/>');

    // --- head
    p.push('<path d="M28 42 C28 24 72 24 72 42 C72 60 63 68 50 68 C37 68 28 60 28 42 Z" fill="url(#' + u + 'skin)"/>');
    // side shading + cheeks
    p.push('<path d="M30 42 C30 28 36 24 36 24 C31 32 31 50 40 62 C34 60 30 52 30 42 Z" fill="rgba(0,0,0,0.10)"/>');
    p.push('<ellipse cx="38" cy="50" rx="4" ry="3" fill="rgba(210,120,90,0.16)"/><ellipse cx="62" cy="50" rx="4" ry="3" fill="rgba(210,120,90,0.16)"/>');

    // --- nose
    p.push('<path d="M50 42 C49 48 47 51 45 53 C47 55 53 55 55 53 C53 51 51 48 50 42 Z" fill="rgba(0,0,0,0.10)"/>');

    // --- eyes
    drawEye(p, 40, 44, f.eye, f.kohl);
    drawEye(p, 60, 44, f.eye, f.kohl);
    // --- brows
    if (f.unibrow) {
      p.push('<path d="M33 39 C42 35 58 35 67 39 C58 37 42 37 33 39 Z" fill="' + f.unibrow + '"/>');
    } else {
      var by = f.intense ? 39.5 : 38.5;
      p.push('<path d="M33 ' + by + ' C37 ' + (by - 2) + ' 45 ' + (by - 2) + ' 47 ' + by + ' C44 ' + (by - 0.5) + ' 37 ' + (by - 0.5) + ' 33 ' + (by + 1) + ' Z" fill="' + browCol + '"/>');
      p.push('<path d="M67 ' + by + ' C63 ' + (by - 2) + ' 55 ' + (by - 2) + ' 53 ' + by + ' C56 ' + (by - 0.5) + ' 63 ' + (by - 0.5) + ' 67 ' + (by + 1) + ' Z" fill="' + browCol + '"/>');
    }

    // --- mouth / lips
    if (f.smile) p.push('<path d="M42 58 Q50 64 58 58 Q50 60 42 58 Z" fill="#a85a48"/>');
    else p.push('<path d="M43 58 Q50 61 57 58" fill="none" stroke="#8a4a3a" stroke-width="2" stroke-linecap="round"/>');

    // --- facial hair
    if (f.beard) {
      p.push('<path d="M30 48 C30 70 44 80 50 80 C56 80 70 70 70 48 C66 62 60 66 50 66 C40 66 34 62 30 48 Z" fill="' + f.beard + '"/>');
      p.push('<path d="M42 60 Q50 64 58 60 L58 62 Q50 66 42 62 Z" fill="rgba(0,0,0,0.15)"/>');
    }
    if (f.goatee) {
      p.push('<path d="M44 62 Q50 72 56 62 Q50 66 44 62 Z" fill="' + f.goatee + '"/>');
      p.push('<rect x="47" y="55" width="6" height="8" rx="2" fill="' + f.goatee + '"/>');
    }
    if (f.mustache) p.push('<path d="M38 55 Q50 51 62 55 Q56 60 50 58 Q44 60 38 55 Z" fill="' + f.mustache + '"/>');

    // --- front hair
    drawFrontHair(p, hair);

    // --- accessories
    if (f.headdress) {
      p.push('<rect x="26" y="24" width="48" height="7" rx="2" fill="' + f.headdress + '"/>');
      p.push('<path d="M50 31 l4 6 -4 3 -4 -3 Z" fill="' + f.headdress + '"/>');
      p.push('<rect x="26" y="24" width="48" height="2.4" fill="rgba(255,255,255,0.35)"/>');
    }
    if (f.flower) {
      drawFlower(p, 70, 28, '#e5568f');
      drawFlower(p, 32, 26, '#f2b134');
    }
    if (f.hat === 'bicorne') {
      p.push('<path d="M16 34 C28 14 72 14 84 34 C70 28 30 28 16 34 Z" fill="#1c2038"/>');
      p.push('<path d="M16 34 C30 30 70 30 84 34 C70 36 30 36 16 34 Z" fill="#11142a"/>');
      p.push('<rect x="46" y="22" width="8" height="9" rx="1" fill="#c9a227"/>');
    }
    if (f.cap) p.push('<path d="M28 40 C28 26 72 26 72 40 C64 32 36 32 28 40 Z" fill="' + f.cap + '"/>');
    if (f.glasses) {
      p.push('<g fill="none" stroke="#2a2a2a" stroke-width="1.6">' +
             '<circle cx="40" cy="44" r="7"/><circle cx="60" cy="44" r="7"/>' +
             '<line x1="47" y1="44" x2="53" y2="44"/><line x1="33" y1="43" x2="28" y2="43"/><line x1="67" y1="43" x2="72" y2="43"/></g>');
    }
    p.push('</svg>');
    return p.join('');
  }

  if (window.__OKEY_FAST) window.__okeyAvatars = { build: avatarMarkup, pool: [YOU_FIGURE].concat(FIGURE_POOL) };

  function drawEye(p, cx, cy, iris, kohl) {
    iris = iris || '#3a2a1a';
    p.push('<ellipse cx="' + cx + '" cy="' + cy + '" rx="5" ry="3.2" fill="#fbf7f0"/>');
    p.push('<circle cx="' + cx + '" cy="' + cy + '" r="2.6" fill="' + iris + '"/>');
    p.push('<circle cx="' + cx + '" cy="' + cy + '" r="1.2" fill="#181410"/>');
    p.push('<circle cx="' + (cx - 0.9) + '" cy="' + (cy - 1) + '" r="0.7" fill="#ffffff"/>');
    p.push('<path d="M' + (cx - 5) + ' ' + (cy - 0.5) + ' Q' + cx + ' ' + (cy - 4) + ' ' + (cx + 5) + ' ' + (cy - 0.5) + '" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="' + (kohl ? 2 : 1) + '"/>');
    if (kohl) p.push('<line x1="' + (cx + 5) + '" y1="' + (cy - 0.5) + '" x2="' + (cx + 8) + '" y2="' + (cy - 2) + '" stroke="rgba(0,0,0,0.6)" stroke-width="1.4" stroke-linecap="round"/>');
  }

  function drawCollar(p, f) {
    switch (f.collar) {
      case 'suit':
        p.push('<path d="M42 72 L50 86 L58 72 L64 76 L58 100 L42 100 L36 76 Z" fill="rgba(255,255,255,0.10)"/>');
        p.push('<path d="M46 74 L50 100 L54 74 Z" fill="rgba(255,255,255,0.6)"/>'); // shirt/tie strip
        break;
      case 'uniform':
        p.push('<path d="M38 74 L50 88 L62 74 L66 78 L60 100 L40 100 L34 78 Z" fill="#0f1630"/>');
        p.push('<circle cx="44" cy="84" r="1.6" fill="#e3c05a"/><circle cx="44" cy="90" r="1.6" fill="#e3c05a"/>');
        p.push('<circle cx="56" cy="84" r="1.6" fill="#e3c05a"/><circle cx="56" cy="90" r="1.6" fill="#e3c05a"/>');
        break;
      case 'cravat':
        p.push('<path d="M42 72 L50 92 L58 72 Z" fill="#f3efe6"/>');
        break;
      case 'ruff':
        p.push('<ellipse cx="50" cy="74" rx="22" ry="7" fill="#f3efe6"/>');
        p.push('<ellipse cx="50" cy="74" rx="22" ry="7" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1" stroke-dasharray="3 2"/>');
        break;
      case 'coat':
        p.push('<path d="M40 74 L50 90 L60 74 L66 80 L58 100 L42 100 L34 80 Z" fill="#e6c766"/>');
        p.push('<path d="M47 76 L50 100 L53 76 Z" fill="#f4efe0"/>');
        break;
      case 'robe':
        p.push('<path d="M34 78 C42 74 58 74 66 78 L62 100 L38 100 Z" fill="rgba(0,0,0,0.12)"/>');
        break;
      case 'dress':
        p.push('<path d="M40 76 C46 82 54 82 60 76 L60 100 L40 100 Z" fill="rgba(0,0,0,0.14)"/>');
        break;
    }
  }

  function drawFlower(p, cx, cy, col) {
    for (var a = 0; a < 5; a++) {
      var ang = a * (Math.PI * 2 / 5);
      p.push('<circle cx="' + (cx + Math.cos(ang) * 3.4).toFixed(1) + '" cy="' + (cy + Math.sin(ang) * 3.4).toFixed(1) + '" r="2.4" fill="' + col + '"/>');
    }
    p.push('<circle cx="' + cx + '" cy="' + cy + '" r="2" fill="#ffd257"/>');
  }

  function drawFrontHair(p, hair) {
    var c = hair.color, hi = hair.hi || hair.color;
    switch (hair.style) {
      case 'wild':
        p.push('<g fill="' + c + '"><circle cx="30" cy="30" r="11"/><circle cx="20" cy="42" r="9"/><circle cx="50" cy="20" r="12"/>' +
               '<circle cx="70" cy="30" r="11"/><circle cx="80" cy="42" r="9"/><circle cx="38" cy="22" r="10"/><circle cx="62" cy="22" r="10"/></g>');
        p.push('<path d="M32 34 C36 26 64 26 68 34 C60 30 40 30 32 34 Z" fill="' + hi + '" opacity="0.5"/>');
        break;
      case 'wig':
        p.push('<path d="M30 34 C30 22 70 22 70 34 C62 28 38 28 30 34 Z" fill="' + c + '"/>');
        p.push('<circle cx="26" cy="50" r="7" fill="' + c + '"/><circle cx="74" cy="50" r="7" fill="' + c + '"/>');
        p.push('<circle cx="26" cy="50" r="3" fill="' + hi + '" opacity="0.6"/><circle cx="74" cy="50" r="3" fill="' + hi + '" opacity="0.6"/>');
        break;
      case 'slick':
        p.push('<path d="M29 40 C29 24 71 24 71 40 C64 30 58 27 50 27 C42 27 36 30 29 40 Z" fill="' + c + '"/>');
        p.push('<path d="M50 27 C46 30 42 34 40 40 C46 32 50 30 50 30 Z" fill="' + hi + '" opacity="0.5"/>');
        break;
      case 'egyptian':
        p.push('<path d="M28 38 C28 22 72 22 72 38 C64 30 36 30 28 38 Z" fill="' + c + '"/>');
        p.push('<rect x="26" y="36" width="8" height="30" rx="3" fill="' + c + '"/><rect x="66" y="36" width="8" height="30" rx="3" fill="' + c + '"/>');
        break;
      case 'short':
        p.push('<path d="M28 42 C28 24 72 24 72 42 C66 32 60 29 50 29 C40 29 34 32 28 42 Z" fill="' + c + '"/>');
        p.push('<path d="M34 34 C40 29 60 29 66 34 C58 31 42 31 34 34 Z" fill="' + hi + '" opacity="0.45"/>');
        break;
      case 'updo':
        p.push('<path d="M28 42 C28 24 72 24 72 42 C66 32 60 29 50 29 C40 29 34 32 28 42 Z" fill="' + c + '"/>');
        p.push('<ellipse cx="50" cy="20" rx="10" ry="7" fill="' + c + '"/>');
        p.push('<ellipse cx="50" cy="19" rx="5" ry="3" fill="' + hi + '" opacity="0.5"/>');
        break;
      case 'bun':
        p.push('<path d="M28 42 C28 24 72 24 72 42 C66 32 60 29 50 29 C40 29 34 32 28 42 Z" fill="' + c + '"/>');
        p.push('<circle cx="50" cy="18" r="8" fill="' + c + '"/>');
        break;
      case 'balding':
        p.push('<path d="M30 42 C30 34 34 30 40 29 C34 33 33 40 33 46 C31 45 30 44 30 42 Z" fill="' + c + '"/>');
        p.push('<path d="M70 42 C70 34 66 30 60 29 C66 33 67 40 67 46 C69 45 70 44 70 42 Z" fill="' + c + '"/>');
        p.push('<path d="M30 46 C29 54 30 60 33 64 L36 50 Z" fill="' + c + '"/><path d="M70 46 C71 54 70 60 67 64 L64 50 Z" fill="' + c + '"/>');
        break;
      case 'long':
        p.push('<path d="M28 40 C28 24 72 24 72 40 C64 31 36 31 28 40 Z" fill="' + c + '"/>');
        break;
      // 'bald' -> no front hair
    }
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
    // Mirror the latest line into the always-visible status strip (mobile).
    var status = $('#status');
    if (status) status.textContent = msg;
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
    if (avatar && figures[s]) avatar.innerHTML = avatarMarkup(figures[s]);
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
      // Pointer handling gives us both a tap (select) and a drag (reorder).
      e.addEventListener('pointerdown', function (ev) { onRackPointerDown(ev, tile.id, e); });
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
  // A quick tap selects/deselects a tile; a drag reorders it within the rack.
  function toggleSelect(id) {
    if (selected[id]) delete selected[id];
    else selected[id] = true;
    render();
  }

  // Rack drag-to-reorder state.
  var drag = { id: null, el: null, startX: 0, startY: 0, active: false };
  var DRAG_THRESHOLD = 7; // px before a press becomes a drag

  function onRackPointerDown(ev, id, elm) {
    // Only left button / touch / pen.
    if (ev.button != null && ev.button !== 0) return;
    drag.id = id;
    drag.el = elm;
    drag.startX = ev.clientX;
    drag.startY = ev.clientY;
    drag.active = false;
    // You can rearrange your hand any time (even while opponents move), just
    // not after the round has ended.
    drag.canDrag = !!game && !game.roundOver;
  }

  function onRackPointerMove(ev) {
    if (drag.id == null) return;
    var dx = ev.clientX - drag.startX;
    var dy = ev.clientY - drag.startY;
    if (!drag.active) {
      if (!drag.canDrag) return;
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.active = true;
      drag.el.classList.add('dragging');
    }
    ev.preventDefault();
    // Reposition within the rack based on the tile under the pointer.
    var under = document.elementFromPoint(ev.clientX, ev.clientY);
    var target = under && under.closest ? under.closest('#rack .tile') : null;
    var rack = $('#rack');
    if (target && target !== drag.el && target.parentNode === rack) {
      var rect = target.getBoundingClientRect();
      var before;
      if (ev.clientY < rect.top) before = true;            // pointer on an earlier row
      else if (ev.clientY > rect.bottom) before = false;   // pointer on a later row
      else before = ev.clientX < rect.left + rect.width / 2; // same row: by x
      rack.insertBefore(drag.el, before ? target : target.nextSibling);
    }
  }

  function onRackPointerUp() {
    if (drag.id == null) return;
    var wasActive = drag.active;
    var id = drag.id;
    var elm = drag.el;
    var inDom = elm && elm.parentNode && elm.parentNode.id === 'rack';
    drag.id = null; drag.el = null; drag.active = false;
    if (wasActive) {
      if (elm) elm.classList.remove('dragging');
      if (inDom) { syncHandFromRack(); render(); } // a re-render may have detached it
    } else {
      toggleSelect(id); // it was a tap
    }
  }

  // Rewrite the human hand order to match the rack's current DOM order,
  // keeping any staged (hidden) tiles at the end.
  function syncHandFromRack() {
    var rack = $('#rack');
    var order = [].slice.call(rack.querySelectorAll('.tile'))
      .map(function (e) { return e.dataset.tileId; });
    var hand = game.hands[HUMAN];
    var byId = {};
    hand.forEach(function (t) { byId[t.id] = t; });
    var visible = order.map(function (i) { return byId[i]; }).filter(Boolean);
    var staged = hand.filter(function (t) { return stagedIds[t.id]; });
    game.hands[HUMAN] = visible.concat(staged);
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

  // Return every staged meld's tiles to the hand (they were never removed from
  // game.hands, only hidden), leaving staging empty.
  function clearStaging() {
    stagedMelds = [];
    stagedIds = {};
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
    clearStaging();
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
    // Uncommitted staged melds do not carry across turns — return them to hand.
    clearStaging();
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
    clearStaging(); // each turn starts with a clean staging tray
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

  // ---- Install-as-app button ----------------------------------------------
  function setupInstallButton() {
    var btn = $('#install-btn');
    if (!btn) return;
    var deferred = null;
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                     window.navigator.standalone === true;
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    // Android / desktop Chromium fire this when the app is installable.
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      if (!standalone) btn.hidden = false;
    });
    window.addEventListener('appinstalled', function () { btn.hidden = true; });

    // iOS Safari has no prompt event — offer instructions instead.
    if (isIOS && !standalone) btn.hidden = false;

    btn.addEventListener('click', function () {
      if (deferred) {
        deferred.prompt();
        deferred.userChoice.then(function () { deferred = null; btn.hidden = true; });
      } else {
        toast('To install: tap the Share icon, then "Add to Home Screen".');
      }
    });
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
    setupInstallButton();
    // Rack drag-to-reorder: track pointer at the document level so the drag
    // continues even if the pointer leaves the tile.
    document.addEventListener('pointermove', onRackPointerMove, { passive: false });
    document.addEventListener('pointerup', onRackPointerUp);
    document.addEventListener('pointercancel', onRackPointerUp);
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
