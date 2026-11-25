/*
 * Shred Slope: game loop, rider physics, tricks, camera, HUD, menus and multiplayer flow.
 */
(function () {
  'use strict';
  const SS = window.SS;
  const C = SS.COURSE;
  const M4 = SS.M4;
  const Sfx = SS.Sfx;
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ tuning
  const G = 9.81;            // gravity, the same on the snow and in the air
  const GIANT_G = 9.81;      // the giant big-air kickers too (their landing hills are shaped for it)
  const GIANT_SPEED = 22;    // the in-run eases you to this speed at a giant's lip
  SS.GIANT_G = GIANT_G;
  SS.GIANT_SPEED = GIANT_SPEED;
  const SPIN_RATE = 11;      // rad/s in the air: quick enough for a 1440 off a big kicker
  const FLIP_RATE = 7.6;     // rad/s while holding up/down in the air: room for double corks
  const MAX_SPEED = 42;      // m/s (150 km/h)
  const BOOST_MAX = 42;      // m/s while boosting
  const BOOST_ACC = 7;       // extra m/s^2 while boosting
  // the snow and the air
  const MU_SNOW = 0.035;     // waxed base on packed snow
  // standing up you settle at about 80 km/h on a park slope; tuck (W) to go well past 100
  const DRAG_UP = 0.0034;    // air drag per m of speed², standing up (a rider in baggy outerwear)
  const DRAG_TUCK = 0.0016;  // tucked: half the frontal area
  const DRAG_AIR = 0.0012;   // in the air, between the two
  const GRIP = 20;           // m/s²: the sideways pull an edge holds before the board skids (about 2 g)
  const BOOST_TIME = 2.8;    // seconds a full boost meter lasts
  const TARGET_TIME = 150;   // s: finishing faster than this earns a time bonus
  const TOKEN_PTS = 50;
  const SPIN_PTS = [0, 150, 350, 700, 1100, 1600, 2300, 3100, 4000, 5000, 6200, 7500, 9000, 10600, 12400];
  // grab names; the index is also the pose the rider takes (see rider.js)
  const GRABS = ['METHOD', 'INDY', 'WEDDLE', 'MELON', 'STALEFISH', 'NOSE GRAB', 'TAIL GRAB', 'JAPAN'];
  const SEND_MS = 1000 / 12;
  const BEST_KEY = 'shredSlope3d.best';
  const NAME_KEY = 'shredSlope.name';
  const SET_KEY = 'shredSlope.settings';
  const PROG_KEY = 'shredSlope.maps';

  // ------------------------------------------------------------------ helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
  const fmtTime = (s) => {
    s = Math.max(0, s);
    const m = Math.floor(s / 60), r = Math.floor((s - m * 60) * 10) / 10;
    return String(m).padStart(2, '0') + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  };
  const clock = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage */ } },
  };
  const $ = (id) => document.getElementById(id);
  const show = (el, on) => el.classList.toggle('hidden', !on);
  const hidden = (el) => el.classList.contains('hidden');
  const sentence = (t) => t.charAt(0) + t.slice(1).toLowerCase();
  const DIFF_WORD = { EASY: 'Easy', MEDIUM: 'Intermediate', HARD: 'Expert' };
  const pisteSign = (d) => `<i class="pst ${d}" title="${DIFF_WORD[d] || ''}"></i>`;
  const rgbOf = (c) => 'rgb(' + c.map((v) => Math.round(v * 255)).join(',') + ')';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ui = {};
  ['hud', 'zone', 'mpbar', 'mpServer', 'mpTimer', 'score', 'tokenCount', 'trick', 'landTag', 'trickName', 'trickSub', 'comboBar', 'comboFill',
    'speedLbl', 'speedVal', 'speedUnit', 'speedBar', 'subStats', 'timer', 'minimap', 'alt', 'left', 'popMeter', 'popBar', 'standings', 'feed',
    'big', 'bigText', 'bigSub', 'note', 'tags', 'menuBtn', 'title', 'nameInput', 'swatches', 'outfitName', 'spBtn', 'mpBtn', 'settingsBtn',
    'bestScore', 'servers', 'serverList', 'serverMsg', 'backBtn', 'pauseMenu', 'resumeBtn', 'restartBtn', 'pauseSettingsBtn', 'quitBtn',
    'results', 'resTitle', 'resBody', 'againBtn', 'newBtn', 'resMenuBtn', 'resNote', 'settings', 'settingsDone', 'loading', 'loadingText',
    'nogl', 'touch', 'fx', 'boostBox', 'boostFill', 'balance', 'balMark', 'mapIntro', 'miTime', 'miName', 'miGoals', 'maps', 'mapGrid', 'mapsBack',
    'starsTotal', 'resMapsBtn', 'avatar', 'mapPrev', 'mapNext', 'mapDots', 'racePos'].forEach((id) => { ui[id] = $(id); });

  // ------------------------------------------------------------------ settings
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const settings = Object.assign({ quality: coarse ? 'medium' : 'high', fps: '60', music: 'on', sfx: 'on', camera: 'close', autoRail: 'on', outfit: 0, rider: 'kai', map: 'resort' }, store.get(SET_KEY, {}));
  if (settings.autoRail !== 'off') settings.autoRail = 'on';
  if (!['ask', 'off', 'ptt', 'open'].includes(settings.voice)) settings.voice = 'ask';
  if (!SS.MAPS[settings.map]) settings.map = 'bluebird';
  if (!['30', '60', '90'].includes(String(settings.fps))) settings.fps = '60';
  settings.fps = String(settings.fps);
  const Q = {
    // low still gets FXAA and the colour grade, just not bloom and sun rays ('lite')
    // far: how far down the valley you see (a coarse mesh past the detailed chunks; 0 = fog at the draw distance)
    low: { detail: 0, dpr: 1, draw: 320, fog: 300, far: 0, particles: 0.5, trails: true, shadows: 0, post: 'lite', rays: false },
    medium: { detail: 0.6, dpr: 1.5, draw: 380, fog: 380, far: 1200, particles: 0.8, trails: true, shadows: 1024, post: true, rays: false },
    high: { detail: 1, dpr: 2, draw: 440, fog: 420, far: 1700, particles: 1, trails: true, shadows: 2048, post: true, rays: true },
  };
  let q = Q[settings.quality] || Q.high;

  // ------------------------------------------------------------------ engine
  let engine;
  try {
    engine = new SS.Engine($('gl'));
  } catch (e) {
    show(ui.title, false);
    show(ui.loading, false);
    show(ui.nogl, true);
    console.error(e);
    return;
  }
  const gl = engine.gl;
  const backdrop = SS.buildBackdrop(engine);
  // the mountain's chunks are baked in a background thread, so new parts of the course never stall a frame
  const chunkWorker = SS.makeChunkWorker ? SS.makeChunkWorker() : null;
  const useWorker = () => chunkWorker && !chunkWorker.dead;
  let dpr = 1;
  const fxCtx = ui.fx.getContext('2d');
  function resize() {
    engine.resize(window.innerWidth, window.innerHeight, dpr);
    ui.fx.width = window.innerWidth;
    ui.fx.height = window.innerHeight;
  }
  function applySettings() {
    q = Q[settings.quality] || Q.high;
    engine.detail = q.detail;
    engine.fog = [60, q.fog];
    C.DRAW = q.draw;
    if (world) world.farOn = farView();
    dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    resize();
    Sfx.setSfx(settings.sfx === 'on');
    Sfx.setMusic(settings.music === 'on');
    store.set(SET_KEY, settings);
    accountChanged();
    if (mode === 'mp' && myId && voice && settings.voice !== 'ask') applyVoice();
    document.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', settings[seg.dataset.key] === b.dataset.v));
    });
  }
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------------ state
  let mode = 'menu';      // menu | sp | mp
  let phase = 'attract';  // attract | countdown | riding | finished | waiting | spectate | results
  let paused = false;
  let world = null;
  let time = 0;
  let raceT = 0;
  let countdownT = 0;
  let finishedAt = 0;
  let myColor = settings.outfit | 0;
  // what you wear: your locker (signed in, see shop.js) or the free outfit you picked
  const myLook = () => (SS.Shop && SS.Shop.look()) || SS.ITEMS.defaultLook(settings.outfit | 0, settings.rider);
  let shake = 0;
  let lastSend = 0;
  let zoneName = '';
  let fireworksT = 0, fireworksNext = 0;
  let tokenGot = new Set();
  let lastSpSeed = null;
  let spMap = SS.MAP_IDS.includes(settings.map) ? settings.map : SS.MAP_IDS[0];
  const oneMap = SS.MAP_IDS.length === 1;
  let envK = 0;           // 0 outside, 1 deep inside the cave (for the camera)
  let glare = 0;
  let introT = 0;
  let previewLock = false;

  const P = {};
  const run = {};
  const runFeedList = []; // the last tricks you landed, shown under the score
  let best = Number(store.get(BEST_KEY, 0)) || 0;
  ui.bestScore.textContent = fmt(best);

  // per-map progress: best score and the 3 challenge stars
  const progress = store.get(PROG_KEY, {}) || {};
  const prog = (id) => {
    const p = progress[id] || (progress[id] = { best: 0, stars: [false, false, false] });
    if (!Array.isArray(p.stars)) p.stars = [false, false, false];
    return p;
  };
  const starCount = () => SS.MAP_IDS.reduce((n, id) => n + prog(id).stars.filter(Boolean).length, 0);
  const updateStars = () => {
    const n = starCount(), all = SS.MAP_IDS.length * 3;
    ui.starsTotal.textContent = n + '/' + all;
    const f = $('passFill');
    if (f) f.style.width = (100 * n / all).toFixed(1) + '%';
    const cs = $('courseStars');
    if (cs) cs.innerHTML = prog(SS.MAP_IDS[0]).stars.map((v) => `<i class="${v ? 'on' : ''}">&#9733;</i>`).join('');
    if (typeof renderPass === 'function' && ui.title && ui.title.dataset.page === 'pass') renderPass();
  };
  updateStars();
  function goalMet(g, final) {
    switch (g.k) {
      case 'finish': return !!final;
      case 'score': return run.score >= g.v;
      case 'tokens': return run.tokens >= g.v;
      case 'perfects': return run.perfects >= g.v;
      case 'time': return !!final && run.finalTime <= g.v;
      case 'nobail': return !!final && run.bails === 0;
      case 'air': return run.bigAir >= g.v;
      case 'grind': return run.grindT >= g.v;
      case 'giants': return run.giantLands >= g.v;
      case 'win': return !!final && run.place === 1;
    }
    return false;
  }

  let playerName = String(store.get(NAME_KEY, '') || '').slice(0, 16);
  if (!playerName) playerName = 'Rider' + Math.floor(100 + Math.random() * 900);
  ui.nameInput.value = playerName;

  const riding = () => phase === 'riding' || phase === 'attract';

  // ------------------------------------------------------------------ input
  const keys = { left: false, right: false, up: false, down: false, grab: false, boost: false };
  const touch = { left: false, right: false, flip: false, pop: false, boost: false };
  const ai = { on: false, steer: 0, flip: 0, brake: false, tuck: false, grab: false, boost: false, plan: null, popped: false };
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ShiftLeft: 'grab', ShiftRight: 'grab', KeyE: 'grab',
    KeyF: 'boost' };
  const steerInput = () => (ai.on ? ai.steer : (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0));
  const flipInput = () => (ai.on ? ai.flip : (keys.up ? 1 : 0) - (keys.down || touch.flip ? 1 : 0));
  // shift: crouch on the snow, grab in the air
  const grabbing = () => (ai.on ? ai.grab : keys.grab || (touch.pop && !P.grounded));
  const crouching = () => !ai.on && keys.grab && P.grounded;
  // on the snow: W / up speeds you up, S / down powerslides to brake (in the air they flip)
  const brakeInput = () => (ai.on ? ai.brake : keys.down && !keys.grab);
  const tuckInput = () => (ai.on ? ai.tuck : keys.up && !keys.grab);
  const boostInput = () => (ai.on ? ai.boost : keys.boost || touch.boost);
  const typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };

  window.addEventListener('keydown', (e) => {
    if (typing()) {
      if (e.code === 'Enter' && document.activeElement === ui.nameInput) ui.nameInput.blur();
      return;
    }
    if (e.code === 'KeyV' && mode === 'mp' && voice && voice.on && voice.mode === 'ptt') {
      e.preventDefault();
      voice.setTalkKey(true);
      return;
    }
    if (!hidden(ui.maps) && /^Arrow(Left|Right|Up|Down)$/.test(e.code)) {
      e.preventDefault();
      const cols = Math.max(1, getComputedStyle(ui.mapGrid).gridTemplateColumns.split(' ').length);
      moveMapSel(e.code === 'ArrowRight' ? 1 : e.code === 'ArrowLeft' ? -1 : e.code === 'ArrowDown' ? cols : -cols);
      return;
    }
    if (!hidden(ui.maps) && e.code === 'Enter' && mapSel) { e.preventDefault(); rideMap(mapSel); return; }
    if (e.code === 'Enter' && mode === 'menu' && !hidden(ui.title) && ui.title.dataset.page === 'ride' && document.querySelectorAll('.modal-ov:not(.hidden)').length === 0) {
      e.preventDefault(); rideNow(); return;
    }
    const k = KEYMAP[e.code];
    if (k) {
      keys[k] = true;
      e.preventDefault();
      if (phase === 'spectate' && !e.repeat && (k === 'left' || k === 'right')) cycleSpectate(k === 'right' ? 1 : -1);
      return;
    }
    if (e.code === 'Escape' && !hidden(ui.maps)) {
      closeMaps();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) jump();
    } else if (e.code === 'Escape') {
      if (!e.repeat) toggleMenu();
    } else if (e.code === 'KeyM') {
      if (!e.repeat) Sfx.setMuted(!Sfx.muted);
    } else if (e.code === 'Enter' && phase === 'results' && mode === 'sp') {
      startSingle(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
    if (e.code === 'KeyV' && voice) voice.setTalkKey(false);
  });
  window.addEventListener('blur', () => {
    if (voice) voice.setTalkKey(false);
    for (const k in keys) keys[k] = false;
    for (const k in touch) touch[k] = false;
    if (mode === 'sp' && (phase === 'riding' || phase === 'countdown') && !paused) toggleMenu();
  });

  // space jumps straight away
  function jump() {
    if (mode === 'menu' || phase !== 'riding' || paused || P.bailT > 0 || P.finished || P.pipeMode) return;
    if (P.grounded || P.coyote > 0) pop();
  }

  // touch buttons
  let touchMode = false;
  function enableTouch() {
    if (touchMode) return;
    touchMode = true;
    document.body.classList.add('touch');
    if (mode !== 'menu') show(ui.touch, true);
  }
  if (coarse) enableTouch();
  window.addEventListener('touchstart', enableTouch, { passive: true });
  ui.touch.querySelectorAll('button').forEach((b) => {
    const k = b.dataset.k;
    const set = (on) => {
      if (touch[k] === on) return;
      touch[k] = on;
      b.classList.toggle('on', on);
      if (k === 'pop' && on) jump();
      if (on && phase === 'spectate' && (k === 'left' || k === 'right')) cycleSpectate(k === 'right' ? 1 : -1);
    };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* ok */ } set(true); });
    b.addEventListener('pointerup', () => set(false));
    b.addEventListener('pointercancel', () => set(false));
    b.addEventListener('lostpointercapture', () => set(false));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ------------------------------------------------------------------ board dents in the powder
  // Each trail point stores a ready-lit cross-section of the groove: powder lips either side,
  // walls that face each other and a packed-down bottom. Only on snow, never on kickers or rails.
  // [lateral offset, height, how far the normal leans sideways, brightness]
  const DENT = [
    [-0.34, 0, 0, 1], [-0.25, 0.032, -0.3, 1.03], [-0.19, 0.038, 0.25, 1.0], [-0.14, 0.014, 0.95, 0.94], [-0.07, 0, 0.15, 0.87],
    [0.07, 0, -0.15, 0.87], [0.14, 0.014, -0.95, 0.94], [0.19, 0.038, -0.25, 1.0], [0.25, 0.032, 0.3, 1.03], [0.34, 0, 0, 1],
  ];
  const DN = DENT.length;
  const TRAIL_MAX = 420;
  const DL = [0, 0, 0];
  function dentRow(x, z, heading, wide) {
    const w = world;
    w.H(x, z);
    if (w.surf !== 0) return null;
    const LT = w.L;
    const e = 0.6;
    let nx = -(w.ground(x + e, z) - w.ground(x - e, z)) / (2 * e), ny = 1, nz = -(w.ground(x, z + e) - w.ground(x, z - e)) / (2 * e);
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    const rx = Math.cos(heading), rz = -Math.sin(heading);
    const shadow = w.map.shadows ? w.treeShadow(x, z) : 1;
    // same snow colour the slope uses: groomed piste, powder at the sides, ice in the cave
    const off = Math.abs(x - w.center(z));
    const kp = clamp((off - C.HALF) / 4, 0, 1);
    let ar = lerp(LT.snow[0], LT.powder[0], kp), ag = lerp(LT.snow[1], LT.powder[1], kp), ab = lerp(LT.snow[2], LT.powder[2], kp);
    const ck = w.cave ? w.caveK(z) : 0;
    if (ck > 0) { ar = lerp(ar, 0.78, ck * 0.7); ag = lerp(ag, 0.9, ck * 0.7); ab = lerp(ab, 1.0, ck * 0.7); }
    const d = new Float32Array(DN * 6);
    for (let i = 0; i < DN; i++) {
      const D = DENT[i];
      const u = D[0] * wide;
      const vx = x + rx * u, vz = z + rz * u;
      const vy = w.meshY(vx, vz) + 0.014 + D[1] * Math.min(1.4, wide);
      let mx = nx + rx * D[2], my = ny, mz = nz + rz * D[2];
      const ml = Math.hypot(mx, my, mz);
      mx /= ml; my /= ml; mz /= ml;
      w.light(mx, my, mz, vx, vy, vz, DL, shadow);
      // packed snow in the bottom of the groove is a touch bluer
      const blue = D[3] < 0.9 ? 1.03 : 1;
      const o = i * 6;
      d[o] = vx; d[o + 1] = vy; d[o + 2] = vz;
      d[o + 3] = ar * DL[0] * D[3]; d[o + 4] = ag * DL[1] * D[3]; d[o + 5] = ab * DL[2] * D[3] * blue;
    }
    return d;
  }
  class Trail {
    constructor() { this.pts = []; this.lx = 1e9; this.lz = 1e9; }
    clear() { this.pts.length = 0; this.lx = 1e9; this.lz = 1e9; }
    end() {
      if (this.pts.length && this.pts[this.pts.length - 1]) this.pts.push(null);
      this.lx = 1e9;
    }
    add(x, z, heading, on, wide) {
      if (!on || !world) { this.end(); return; }
      if ((x - this.lx) ** 2 + (z - this.lz) ** 2 < 0.2) return;
      const row = dentRow(x, z, heading, wide || 1);
      if (!row) { this.end(); return; }
      this.lx = x; this.lz = z;
      this.pts.push(row);
      if (this.pts.length > TRAIL_MAX) this.pts.shift();
    }
  }
  const trails = new Map([['me', new Trail()]]);
  const trailBuf = new Float32Array(TRAIL_MAX * 4 * (DN - 1) * 6 * 6);

  // ------------------------------------------------------------------ world
  let mapBase = null;
  function useWorld(seed, mapId) {
    mapId = SS.MAP_IDS.includes(mapId) ? mapId : SS.MAP_IDS[0];
    if (world && world.seed === (seed >>> 0) && world.mapId === mapId) return;
    if (world) world.dispose(engine);
    world = new SS.World(seed, mapId);
    if (useWorker()) chunkWorker.attach(world, engine);
    world.farOn = farView();
    engine.setSky(world.map.sky);
    setGrade(world.map);
    const cv = world.map.curve;
    engine.course = world.pipeArr || world.towerArr ? null : {
      a1: cv[0], p1: cv[1], a2: cv[2], p2: cv[3], ph1: world.p1, ph2: world.p2,
      c0: cv[0] * Math.sin(world.p1) + cv[2] * Math.sin(world.p2), half: C.HALF,
    };
    document.body.classList.toggle('day', world.map.sky.stars < 0.5);
    ui.hud.style.setProperty('--acc', world.map.accent);
    world.featSorted = world.features.slice().sort((a, b) => (a.kind === 'kicker' ? a.z0 : a.az) - (b.kind === 'kicker' ? b.z0 : b.az));
    world.ensureChunks(engine, 0, useWorker() ? 1 : 14);
    mapBase = document.createElement('canvas');
    mapBase.width = ui.minimap.width;
    mapBase.height = ui.minimap.height;
    world.drawMinimap(mapBase);
    for (const t of trails.values()) t.clear();
  }

  // the rider's stats (1 to 5, 3 is average) as -2..+2, read from your look when a run starts:
  // speed (top speed and glide), air (pop and air control), spin (rotation) and balance (how much
  // a sideways landing, a rail or a skidding edge forgives)
  const STK = { speed: 0, air: 0, spin: 0, balance: 0 };
  function applyStats() {
    const lk = myLook(), st = SS.ITEMS.stats(lk && typeof lk === 'object' ? lk.rider : null);
    for (const k of Object.keys(STK)) STK[k] = clamp((st[k] || 3) - 3, -2, 2);
  }
  function resetRider(z) {
    z = z === undefined ? 2 : z;
    applyStats();
    Object.assign(P, {
      x: world.center(z), z, speed: 0, heading: 0, slip: 0, vx: 0, vy: 0, vz: 0,
      grounded: true, surf: 0, grindRef: null, grind: 0, airT: 0,
      spin: 0, flip: 0, spinVel: 0, flipVel: 0, spinLock: 0, flipLock: 0, grabT: 0,
      stance: 0, lean: 0, crouch: 0.2, comp: 0, compV: 0, charge: 0, chargeT: 0, charging: false, coyote: 0,
      bailT: 0, tumble: 0, tumbleRoll: 0, tumbleV: 0, rollV: 0, bailAge: 0, bailUp: 0, bailKind: 'tumble', bailSide: 1, bailHits: 0, inv: 0, finished: false, yawOff: 0,
      steerS: 0, slide: 0, wind: 0, wobble: 0, boosting: false, bal: 0, balV: 0, balPush: 0, balT: 0, balErr: 0, giant: false, ref: null, edgeT: 0, skid: 0,
      grabs: [], grabType: 0, grabAmt: 0, grabHeld: false, crouchT: 0,
      pipeMode: false, pipeAir: 0, pipeLandV: 0, ps: 0, pv: 0, wallRoll: 0,
    });
    if (world.map.racers) P.x = world.center(z) + 2.25; // your gate in the start house
    P.y = world.H(P.x, P.z);
    resetRivals(z);
    Object.assign(run, { score: 0, pot: 0, combo: 0, bankT: 0, tricks: 0, bails: 0, topSpeed: 0, bigAir: 0, finalTime: 0, bonus: 0, tokens: 0, perfects: 0, boost: 0.25, goals: [false, false, false], grindT: 0, giantLands: 0, place: 0,
      parts: { air: 0, grab: 0, rail: 0, land: 0, flakes: 0 }, potParts: {}, bestTrick: { name: '', pts: 0 }, landed: 0, comboNames: [] });
    runFeedList.length = 0;
    const rfe = $('runFeed');
    if (rfe) rfe.innerHTML = '';
    tokenGot = new Set();
    raceT = 0;
    zoneName = '';
    cam.snap = true;
    trails.get('me').clear();
    setTrick('', '', false, 0);
  }

  // ------------------------------------------------------------------ particles
  const PMAX = 2200;
  const pp = new Float32Array(PMAX * 14);
  let pn = 0;
  const outA = new Float32Array(PMAX * 8), outB = new Float32Array(PMAX * 8);
  function emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, add) {
    if (pn >= PMAX) return;
    const o = pn * 14;
    pp[o] = x; pp[o + 1] = y; pp[o + 2] = z; pp[o + 3] = vx; pp[o + 4] = vy; pp[o + 5] = vz;
    pp[o + 6] = life; pp[o + 7] = life; pp[o + 8] = size; pp[o + 9] = r; pp[o + 10] = g; pp[o + 11] = b; pp[o + 12] = a; pp[o + 13] = add ? 1 : 0;
    pn++;
  }
  function burst(x, y, z, n, power, vx, vz) {
    n = Math.round(n * q.particles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      emit(x, y + 0.1, z, vx * 0.5 + Math.cos(a) * power * rand(0.3, 1), rand(1, 3) * power * 0.5, vz * 0.5 + Math.sin(a) * power * rand(0.3, 1),
        rand(0.6, 1.3), rand(0.05, 0.16), 0.92, 0.95, 1.0, 0.8, false);
      if (i % 4 === 0) emit(x, y + 0.2, z, vx * 0.3 + Math.cos(a) * power * 0.3, rand(0.4, 1.2), vz * 0.3 + Math.sin(a) * power * 0.3, rand(1.2, 2), rand(0.5, 1.0), 0.9, 0.93, 0.98, 0.12, false);
    }
  }
  function sparkle(x, y, z, n, r, g, b, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, e = rand(-1, 1);
      const s = power * rand(0.5, 1);
      emit(x, y, z, Math.cos(a) * s * Math.sqrt(1 - e * e), e * s, Math.sin(a) * s * Math.sqrt(1 - e * e), rand(0.7, 1.4), rand(0.12, 0.22), r, g, b, 1, true);
    }
  }
  function updateParticles(dt) {
    for (let i = pn - 1; i >= 0; i--) {
      const o = i * 14;
      pp[o + 6] -= dt;
      if (pp[o + 6] <= 0) {
        pn--;
        if (i !== pn) pp.copyWithin(o, pn * 14, pn * 14 + 14);
        continue;
      }
      const add = pp[o + 13] > 0;
      pp[o + 4] -= (add ? 7 : 4.5) * dt;
      const drag = Math.exp(-(add ? 0.8 : 1.8) * dt);
      pp[o + 3] *= drag; pp[o + 5] *= drag;
      pp[o] += pp[o + 3] * dt; pp[o + 1] += pp[o + 4] * dt; pp[o + 2] += pp[o + 5] * dt;
    }
  }
  function drawParticles() {
    let na = 0, nb = 0;
    for (let i = 0; i < pn; i++) {
      const o = i * 14;
      const k = pp[o + 6] / pp[o + 7];
      const add = pp[o + 13] > 0;
      const out = add ? outB : outA;
      const j = (add ? nb++ : na++) * 8;
      out[j] = pp[o]; out[j + 1] = pp[o + 1]; out[j + 2] = pp[o + 2];
      out[j + 3] = pp[o + 9]; out[j + 4] = pp[o + 10]; out[j + 5] = pp[o + 11];
      out[j + 6] = pp[o + 12] * Math.min(1, k * 1.6);
      out[j + 7] = pp[o + 8] * (add ? 1 : 0.6 + (1 - k) * 1.1);
    }
    engine.drawPoints(outA, na, { soft: 1 });
    engine.drawPoints(outB, nb, { soft: 1, additive: true });
  }

  // falling snow around the camera
  const FLAKES = 700;
  const flakes = new Float32Array(FLAKES * 8);
  function resetFlake(i, anywhere) {
    const o = i * 8;
    flakes[o] = cam.x + rand(-35, 35);
    flakes[o + 1] = cam.y + (anywhere ? rand(-8, 22) : rand(14, 24));
    flakes[o + 2] = cam.z + rand(-10, 70);
    flakes[o + 3] = 0.9; flakes[o + 4] = 0.93; flakes[o + 5] = 1.0; flakes[o + 6] = rand(0.35, 0.8); flakes[o + 7] = rand(0.04, 0.09);
  }
  let motes = false;
  const MOTE_COLS = [[0.4, 0.95, 1.0], [0.7, 0.5, 1.0], [0.4, 1.0, 0.8], [1.0, 0.55, 0.9]];
  function tintFlakes(cave) {
    motes = cave;
    for (let i = 0; i < FLAKES; i++) {
      const o = i * 8, c = cave ? MOTE_COLS[i % 4] : [0.9, 0.93, 1.0];
      flakes[o + 3] = c[0]; flakes[o + 4] = c[1]; flakes[o + 5] = c[2];
    }
  }
  function updateFlakes(dt) {
    if ((envK > 0.5) !== motes) tintFlakes(envK > 0.5);
    const sf = world ? world.map.snowfall : 1;
    const fall = motes ? 0.3 : sf > 1 ? 2.1 : 1.6;
    const sway = Math.sin(time * 0.7) * (motes ? 0.3 : sf > 1 ? 1.4 : 0.6);
    for (let i = 0; i < FLAKES; i++) {
      const o = i * 8;
      flakes[o + 1] -= fall * dt;
      flakes[o] += sway * dt;
      const dx = flakes[o] - cam.x, dy = flakes[o + 1] - cam.y, dz = flakes[o + 2] - cam.z;
      if (dy < -10 || dz < -12 || dz > 75 || Math.abs(dx) > 40) resetFlake(i, dz < -12 || dz > 75 || Math.abs(dx) > 40);
    }
  }

  function drawTrails() {
    if (!q.trails) return;
    let n = 0;
    const put = (r, k) => { const o = n * 6, q6 = k * 6; trailBuf[o] = r[q6]; trailBuf[o + 1] = r[q6 + 1]; trailBuf[o + 2] = r[q6 + 2]; trailBuf[o + 3] = r[q6 + 3]; trailBuf[o + 4] = r[q6 + 4]; trailBuf[o + 5] = r[q6 + 5]; n++; };
    outer: for (const tr of trails.values()) {
      const pts = tr.pts, len = pts.length;
      for (let i = 1; i < len; i++) {
        const a = pts[i - 1], b = pts[i];
        if (!a || !b) continue;
        // a gap (respawn, teleport) would stretch a groove across the slope
        if (Math.abs(a[2] - b[2]) + Math.abs(a[0] - b[0]) > 4) continue;
        if (Math.abs(a[2] - cam.z) > 150) continue;
        if ((n + (DN - 1) * 6) * 6 > trailBuf.length) break outer;
        for (let k = 0; k < DN - 1; k++) {
          put(a, k); put(a, k + 1); put(b, k + 1);
          put(a, k); put(b, k + 1); put(b, k);
        }
      }
    }
    if (!n) return;
    engine.beginBaked();
    engine.setDetail(q.detail > 0);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -3);
    engine.drawBakedArray(trailBuf, n);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    engine.setDetail(false);
  }

  // ------------------------------------------------------------------ rider physics
  const POP = 0.95;
  const AIR_PUSH = 9; // m/s² sideways push while you steer in the air
  const AIR_DRIFT = 3.5; // m/s: the most sideways speed you can add in one air // how hard a jump pops
  // ollie onto a rail: with one just ahead, the pop is sized to put you on its start instead of sailing over it
  function railPop(base, vy) {
    // off a gap kicker it's a full pop: its in-run speed was checked to carry you onto the rail
    const k = P.ref;
    if (k && k.kind === 'kicker' && k.gap && Math.abs(P.z - (k.z0 + k.Lu)) < 3) return vy;
    const sh = Math.sin(P.heading), ch = Math.cos(P.heading), sp = Math.max(4, P.speed);
    const r = world.railAhead(P.x, P.z, P.heading, sh, ch, 1.2 + sp * 0.75);
    if (!r) return vy;
    const f = r.f, lo = Math.max(0.8, base + 0.5), hi = vy + 1.2;
    // with real gravity you have to come down onto a rail, not rise past it: aim for the first spot
    // along it you can reach on the way down (on a rail that drops away fast that's a little way in)
    for (let s = 0.5; s <= Math.min(f.len - 0.8, 7); s += 0.25) {
      const t = Math.max(0.12, (r.d + s) / sp);
      const need = (world.railY(f, s) + 0.12 - P.y) / t + 0.5 * G * t;
      if (need - G * t < -0.3 && need <= hi) return clamp(need, lo, hi);
    }
    const t = Math.max(0.12, r.d / sp);
    return clamp((r.top + 0.3 - P.y + 0.5 * G * t * t) / t, lo, hi);
  }
  function pop() {
    const c = POP + (P.crouchT > 0.12 ? 0.4 : 0);
    P.crouchT = 0;
    if (P.grounded) {
      const sh = Math.sin(P.heading), ch = Math.cos(P.heading);
      const vx = sh * P.speed + ch * P.slip, vz = ch * P.speed - sh * P.slip;
      takeoff(vx, vz);
      P.coyote = 0;
      P.vy = railPop(P.vy, P.vy + (2.3 + 2.9 * c) * (P.absorb || 1) * (1 + 0.06 * STK.air));
    } else {
      P.vy = railPop(P.vy, P.vy + (1.9 + 2.3 * c) * (P.absorb || 1) * (1 + 0.07 * STK.air)); // late pop off a lip
      P.coyote = 0;
    }
    P.compV -= 2.5;
    if (!ai.on) Sfx.pop();
    burst(P.x, P.y, P.z, 10, 2, P.vx, P.vz);
  }

  // auto rail (a setting, on by default): ride straight at a rail and you hop onto it by yourself.
  // Off a little gap kicker it pops at the lip when the rail past it is lined up. Boxes with a ramp
  // you just ride onto, so they don't need it.
  function autoRail() {
    if (settings.autoRail !== 'on' || ai.on || mode === 'menu' || phase !== 'riding' || P.surf === 2 || P.bailT > 0 || P.finished || P.speed < 3) return;
    const sh = Math.sin(P.heading), ch = Math.cos(P.heading);
    const lined = (f, x, z) => {
      if (Math.abs(wrap(P.heading - f.ang)) > 0.3) return false;
      const rx = f.ax - x, rz = f.az - z;
      return Math.abs(rx * ch - rz * sh) < f.w + 0.4;
    };
    const k = P.surf === 1 && P.ref && P.ref.kind === 'kicker' ? P.ref : null;
    if (k && k.gap) {
      const u = P.z - k.z0;
      if (u > k.Lu - 0.45 && u < k.Lu + 0.3 && lined(k.gap, P.x, P.z)) pop();
      return;
    }
    const r = world.railAhead(P.x, P.z, P.heading, sh, ch, 1.2 + P.speed * 0.12);
    if (r && r.d < 0.9 + P.speed * 0.1 && lined(r.f, P.x, P.z)) pop();
  }

  function takeoff(vx, vz) {
    if (P.surf === 2) endGrind();
    P.grounded = false;
    P.vx = vx;
    P.vz = vz;
    P.airT = 0;
    P.drift = 0;
    P.spin = 0;
    P.flip = 0;
    P.spinVel = 0;
    P.flipVel = 0;
    P.grabT = 0;
    P.grabs = [];
    P.grabHeld = grabbing();
    P.spinLock = steerInput();
    P.flipLock = flipInput();
    P.giant = P.surf === 1 && !!P.ref && P.ref.size === 'G';
    P.toRef = P.surf === 1 && P.ref && P.ref.kind === 'kicker' && !P.ref.fn && Math.abs(P.z - (P.ref.z0 + P.ref.Lu)) < 2.5 ? P.ref : null;
    P.toV = Math.hypot(vx, vz);
    // off a kicker faster than it's built for: a flatter take-off (the pop is soaked up the same way)
    P.absorb = absorbLip();
    P.vy *= P.absorb;
    P.surf = 0;
    P.coyote = 0.14;
  }

  function startGrind(f) {
    P.grindRef = f;
    P.grind = 0;
    // landing off-centre on the rail starts you off balance
    const lat = (P.x - f.ax) * f.dz - (P.z - f.az) * f.dx;
    P.bal = clamp(lat / f.w * 0.35 + (Math.random() < 0.5 ? -1 : 1) * rand(0.05, 0.16), -0.6, 0.6);
    P.balV = 0;
    P.balT = 0;
    P.balErr = 0;
  }

  function endGrind() {
    const f = P.grindRef;
    if (f && P.grind > 0.25) {
      let name = f.label ? f.label + ' 50-50' : f.type === 'box' ? 'BOX 50-50' : 'RAIL 50-50';
      let pts = 150 + P.grind * 450;
      const perfect = P.grind > 0.45 && P.balErr / P.grind < 0.22;
      if (perfect) pts *= 1.3;
      if (f.type === 'rail') pts *= 1.2;
      addTrick(name, Math.round(pts), { rail: pts });
      if (perfect && mode !== 'menu') {
        ui.landTag.textContent = 'PERFECT BALANCE +30%';
        ui.landTag.className = 'brush show perfect';
        landT = 1.6;
      }
    }
    P.grindRef = null;
    P.grind = 0;
    P.bal = 0;
  }

  // the rail tips you off unless you steer against the lean
  function balanceStep(dt, steer) {
    const rail = P.grindRef.type === 'rail';
    P.balT -= dt;
    if (P.balT <= 0) { P.balT = rand(0.22, 0.45); P.balPush = rand(-1, 1) * (rail ? 1.9 : 1.1) * (1 - 0.12 * STK.balance); }
    P.balV += (P.bal * (rail ? 3.6 : 2.3) + P.balPush + steer * 7 - P.balV * 1.7) * dt;
    P.bal += P.balV * dt;
    P.balErr += Math.abs(P.bal) * dt;
    if (Math.abs(P.bal) >= 1) {
      P.bal = 0;
      bail('LOST BALANCE');
      return false;
    }
    return true;
  }

  function groundStep(dt, steer) {
    const w = world;
    const grinding = P.surf === 2 && P.grindRef;
    // smoothed steering: carves build up instead of snapping
    P.steerS += (steer - P.steerS) * Math.min(1, dt * 11);
    const s = P.steerS;
    const braking = brakeInput() && !grinding && !P.finished;
    P.slide += ((braking ? 1 : 0) - P.slide) * Math.min(1, dt * (braking ? 6 : 3.5));

    if (grinding) {
      if (!balanceStep(dt, steer)) return;
      const f = P.grindRef;
      P.heading = lerpAngle(P.heading, f.ang, Math.min(1, dt * 28));
      const lat = (P.x - f.ax) * f.dz - (P.z - f.az) * f.dx;
      const k = Math.min(1, dt * 26);
      P.x -= f.dz * lat * k;
      P.z += f.dx * lat * k;
      P.slip = 0;
    } else {
      // carving: the edge holds up to GRIP sideways; ask for a tighter turn than that and the board
      // skids round it instead, scrubbing speed. Banked turns lean you into the bank and grip more.
      const want = s * lerp(2.9, 1.55, clamp(P.speed / 42, 0, 1)) * (1 + 0.35 * P.slide);
      const e0 = 0.35, h0 = P.heading;
      const latSlope = (w.Hk(P.x + e0, P.z) - w.Hk(P.x - e0, P.z)) / (2 * e0) * Math.cos(h0) - (w.Hk(P.x, P.z + e0) - w.Hk(P.x, P.z - e0)) / (2 * e0) * Math.sin(h0);
      const bank = Math.max(0, Math.sign(want) * latSlope);
      const wGrip = (GRIP + 9.8 * Math.min(1.2, bank) * 1.1) / Math.max(4, P.speed);
      let turn = want;
      P.skid = 0;
      if (Math.abs(want) > wGrip) {
        P.skid = clamp((Math.abs(want) - wGrip) / Math.abs(want), 0, 1);
        turn = Math.sign(want) * (wGrip + (Math.abs(want) - wGrip) * 0.6);
      }
      // the turn comes in fast but not instantly
      P.yawV = (P.yawV || 0) + (turn - (P.yawV || 0)) * Math.min(1, dt * 14);
      P.heading += P.yawV * dt;
      // a long, hard skid at speed: the downhill edge digs in and throws you
      P.edgeT = P.skid > 0.5 && P.speed > 26 && !ai.on ? P.edgeT + dt : Math.max(0, P.edgeT - dt * 2);
      if (P.edgeT > 0.9 + 0.15 * STK.balance && !P.finished) {
        P.edgeT = 0;
        bail('CAUGHT AN EDGE');
        return;
      }
      // hands off: the board keeps going the way you pointed it, like a real board (it doesn't swing
      // back down the hill by itself); only the look-into-the-turn eases off
      if (Math.abs(steer) < 0.05) P.steerS *= Math.exp(-6 * dt);
      P.heading = clamp(P.heading, -1.45, 1.45);
    }

    const e = 0.35;
    let gx = 0, gz = 0;
    if (!grinding) {
      gx = (w.Hk(P.x + e, P.z) - w.Hk(P.x - e, P.z)) / (2 * e);
      gz = (w.Hk(P.x, P.z + e) - w.Hk(P.x, P.z - e)) / (2 * e);
    }
    const sh = Math.sin(P.heading), ch = Math.cos(P.heading);
    let along = -(gx * sh + gz * ch);
    if (grinding) {
      // straight rails slope with the snow; arched ones go up, then down
      const f = P.grindRef, tA = (P.x - f.ax) * f.dx + (P.z - f.az) * f.dz;
      along = -w.railDY(f, clamp(tA, 0, f.len));
    }
    const sinA = along / Math.sqrt(1 + along * along), cosA = 1 / Math.sqrt(1 + along * along);
    const skid = grinding ? 0 : P.skid || 0;
    const tuck = tuckInput() && !grinding && P.slide < 0.2;
    // butters: hold shift and press up (nose) or down (tail) to press the board and ride on one end
    const bIn = crouching() && !grinding && P.speed > 4 ? (keys.up ? 1 : keys.down ? -1 : 0) : 0;
    P.butterK = (P.butterK || 0) + (bIn - (P.butterK || 0)) * Math.min(1, dt * 9);
    if (bIn) { P.butterT = (P.butterDir === bIn ? P.butterT || 0 : 0) + dt; P.butterDir = bIn; P.speed *= Math.exp(-0.12 * dt); }
    else { if ((P.butterT || 0) > 0.4) awardButter(P.butterDir, P.butterT); P.butterT = 0; }
    // friction presses with the board's weight on the slope; a carve costs a little, a skid a lot
    // off the groomed piste the board ploughs through deep snow
    const deep = grinding || world.map.open ? 0 : clamp((Math.abs(P.x - world.center(P.z)) - C.HALF - 1) / 4, 0, 1);
    const mu = grinding ? (P.grindRef.type === 'box' ? 0.045 : 0.035) : MU_SNOW * (1 - 0.06 * STK.speed) + 0.012 * Math.abs(s) + 0.5 * skid + 0.62 * P.slide + 0.07 * deep + (P.finished ? 0.45 : 0);
    let acc = G * sinA - G * cosA * mu - (tuck ? DRAG_TUCK : DRAG_UP) * (1 - 0.05 * STK.speed) * P.speed * P.speed;
    if (P.wobble > 0) acc -= 1.5;
    // boost: burn the meter for a shove of speed
    const boosting = boostInput() && run.boost > 0.01 && !grinding && !P.finished && P.slide < 0.3 && phase !== 'countdown';
    if (boosting) {
      acc += BOOST_ACC;
      run.boost = Math.max(0, run.boost - dt / BOOST_TIME);
      if (!P.boosting && !ai.on && mode !== 'menu') { Sfx.hiss(0.6, 0.3, 1500, 'bandpass'); Sfx.tone(150, 0.5, 'sawtooth', 0.05, 420); }
    }
    P.boosting = boosting;
    // some courses have a top speed of their own (cross courses are about lines, not straight-lining)
    const vmax = world.map.vmax || MAX_SPEED;
    const top = MAX_SPEED + 1.5 * STK.speed;
    const cap = boosting ? Math.min(BOOST_MAX + 1.5 * STK.speed, vmax + 3) : Math.min(top, vmax);
    let v = P.speed + acc * dt;
    if (v > cap) v = P.speed > cap ? Math.max(cap, Math.min(v, P.speed) - 7 * dt) : cap;
    // a giant's in-run sets the takeoff speed, so every launch lands on the landing hill
    const gk = giantAhead();
    if (gk) {
      const k = clamp((P.z - (gk.z0 - 45)) / 25, 0, 1);
      if (v > GIANT_SPEED) v = Math.max(GIANT_SPEED, v - 4 * k * dt);
      else v = Math.min(GIANT_SPEED, v + 12 * k * dt); // the steep drop-in carries you up to speed
    }
    // speed check for the kicker ahead (not while boosting, and not on the snowboard cross)
    P.check = Math.max(0, (P.check || 0) - dt * 3);
    if (!gk && !boosting && !grinding && !world.map.racers) {
      const kf = kickerAhead();
      if (kf) {
        // ease off over the whole in-run, never more than a gentle 3.5 m/s² (no sudden braking): the
        // jumps are built for this speed, so you get a full arc that lands in the sweet spot. Whatever
        // is left over gives a slightly flatter take-off (absorbLip).
        const vt = Math.max(idealSpeed(kf) + 0.6, SPEED_CHECK[kf.size] || 0), d = Math.max(1, kf.z0 + kf.Lu - 3 - P.z);
        if (v > vt) {
          const dec = Math.min(3.5, (v * v - vt * vt) / (2 * d));
          v = Math.max(vt, v - dec * dt);
          P.check = Math.max(P.check, clamp(dec / 14, 0, 0.25)); // the board turns across a touch
        }
        // too slow: tuck and pump up toward it (the small ones are fine a bit slow; the big gaps and
        // step-ups have to be cleared, and on the tight park courses you often come in slow off the last one)
        else {
          const lo = vt - (kf.size === 'S' || kf.size === 'M' ? 2 : 0.6);
          if (v < lo) v = Math.min(lo, v + Math.min(6, (lo * lo - v * v) / (2 * d)) * dt);
        }
      }
    }
    P.speed = Math.max(v, P.finished || P.slide > 0.5 ? 0 : 1.2);

    if (!grinding) {
      const cross = -(gx * ch - gz * sh);
      P.slip += G * cross * 0.85 * dt;
      // a skidded turn drifts the board out of the turn
      if (skid > 0) P.slip -= Math.sign(s) * skid * P.speed * 0.9 * dt;
      P.slip *= Math.exp(-2.2 * dt);
    }
    const vx = sh * P.speed + ch * P.slip, vz = ch * P.speed - sh * P.slip;
    const nx = P.x + vx * dt, nz = P.z + vz * dt;
    const nh = w.H(nx, nz);
    const nSurf = w.surf, nRef = w.surfRef;

    if (nSurf === 2 && P.surf !== 2 && nh - P.y > 0.3) {
      const f = nRef;
      const along = (nx - f.ax) * f.dx + (nz - f.az) * f.dz;
      const lat = (nx - f.ax) * f.dz - (nz - f.az) * f.dx;
      if (along > 0.8 && Math.abs(wrap(P.heading - f.ang)) < 0.6) {
        // brushed the side of a box or rail: scrape along it instead of bailing
        const away = lat > 0 ? 1 : -1;
        P.x += f.dz * away * 0.06;
        P.z -= f.dx * away * 0.06;
        P.heading = lerpAngle(P.heading, f.ang + away * 0.05, 0.5);
        P.slip = 0;
        P.steerS *= 0.5;
        P.speed *= 0.995;
        if (P.wobble <= 0 && !ai.on && mode !== 'menu') Sfx.hiss(0.18, 0.12, 2800, 'bandpass');
        P.wobble = Math.max(P.wobble, 0.3);
        return;
      }
      P.x = nx; P.z = nz;
      bail('CAUGHT AN EDGE');
      return;
    }
    const yb = P.y + P.vy * dt - 0.5 * G * dt * dt;
    // locked into a grind, you follow the rail over its kinks instead of flying off them
    const stuck = grinding && nSurf === 2 && nRef === P.grindRef;
    if (nh < yb - 0.04 && P.speed > 4 && !stuck) {
      takeoff(vx, vz);
      P.x = nx; P.z = nz; P.y = yb;
      P.vy -= (P.giant ? GIANT_G : G) * dt;
      return;
    }
    const vyNew = clamp((nh - P.y) / dt, -60, 60);
    // legs soak up bumps: the ground pushing up compresses them
    P.compV -= (vyNew - P.vy) * 0.025;
    P.vy = vyNew;
    P.x = nx; P.z = nz; P.y = nh;
    const wasGrind = P.surf === 2;
    P.surf = nSurf;
    P.ref = nRef;
    if (nSurf === 2) {
      if (!wasGrind || P.grindRef !== nRef) startGrind(nRef);
      P.grind += dt;
      run.grindT += dt;
    } else if (wasGrind) endGrind();

    P.lean = lerp(P.lean, grinding ? P.bal * 0.6 : s * clamp(P.speed / 16, 0.3, 1) * 0.5 - P.slide * 0.3, Math.min(1, dt * 6));
    P.yawOff = lerp(P.yawOff, grinding ? 0 : -s * 0.12 - P.slide * 1.05 - (P.check || 0) * 0.45 - (P.skid || 0) * 0.35 * Math.sign(s), Math.min(1, dt * 6));
    const crouch = crouching() && !grinding;
    P.crouchT = crouch ? P.crouchT + dt : 0;
    const cTarget = crouch ? 0.85 : tuck ? 0.42 : 0.18 + Math.abs(s) * 0.18 + P.slide * 0.25;
    P.crouch = lerp(P.crouch, cTarget, Math.min(1, dt * 10));
    if (P.wobble > 0) P.lean += Math.sin(time * 30) * 0.08 * P.wobble;
    if (run.pot > 0 && P.surf !== 2) {
      run.bankT -= dt;
      if (run.bankT <= 0) bank();
    }
  }

  // first grab of a jump follows the rotation; tapping grab again switches to a new one
  const GRAB_CYCLE = [0, 5, 6, 7, 1, 2, 3, 4];
  function pickGrab() {
    const used = P.grabs.map((g) => g.type);
    let t;
    if (!used.length) {
      if (Math.abs(P.flipVel) > 1.5) t = P.flipVel > 0 ? 2 : 4;
      else if (Math.abs(P.spinVel) > 1.5) t = P.spinVel > 0 ? 1 : 3;
      else t = 0;
    } else {
      let i = GRAB_CYCLE.indexOf(used[used.length - 1]);
      for (let n = 0; n < GRAB_CYCLE.length; n++) {
        i = (i + 1) % GRAB_CYCLE.length;
        if (!used.includes(GRAB_CYCLE[i])) break;
      }
      t = GRAB_CYCLE[i];
    }
    P.grabType = t;
    P.grabs.push({ type: t, t: 0 });
  }

  // the giant kicker you're lined up with and about to hit, if any
  function giantAhead() {
    const zn = world.zoneAt(P.z);
    if (zn.type !== 'giant') return null;
    const b = world.fb[((P.z + 30 - C.Z0) / 10) | 0] || world.fb[((P.z - C.Z0) / 10) | 0];
    if (!b) return null;
    for (const f of b) {
      if (f.size !== 'G') continue;
      if (P.z > f.z0 - 45 && P.z < f.z0 + f.Lu && Math.abs(P.x - world.center(P.z)) < f.w + 6) return f;
    }
    return null;
  }

  // ---- speed checks: every kicker has a take-off speed that lands you in the sweet spot of its
  // landing (found by flying the arc with real gravity and drag). On the in-run you ease toward it,
  // like a rider scrubbing speed or tucking for a jump. Boosting overrides it.
  const SWEET = 0.38; // how far down the landing the sweet spot is (0 = knuckle, 1 = bottom)
  // the lowest speed each kicker checks you down to: the big ones to their sweet spot, the small
  // ones only to a fast cruise (overshooting a small kicker just drops you onto the flat)
  const SPEED_CHECK = { S: 14, M: 13, L: 11, XL: 11, XXL: 11, J15: 11, J18: 11, J19: 11, J21: 11, J22: 11, J25: 11, SU: 6, SD: 6 };
  function landingAt(f, v) {
    const lz = f.z0 + f.Lu, lx = world.center(lz) + f.off;
    const e = 0.3;
    const sl = (world.Hk(lx, lz) - world.Hk(lx, lz - e)) / e;
    const c = 1 / Math.sqrt(1 + sl * sl);
    // with a normal ollie off the lip (not popping lands you nearer the knuckle, still on the landing)
    let x = lx, z = lz, y = world.Hk(lx, lz), vz = v * c, vy = v * sl * c + 2.3 + 2.9 * POP;
    const dt = 1 / 60;
    for (let i = 0; i < 900; i++) {
      vy -= G * dt;
      const sp = Math.hypot(vy, vz), k = 1 - DRAG_AIR * sp * dt;
      vz *= k; vy *= k;
      z += vz * dt; y += vy * dt;
      x = world.center(z) + f.off;
      if (vy < 0 && y <= world.Hk(x, z)) break;
      // a gap kicker's flight ends where it comes down onto its rail
      if (f.gap && vy < 0) {
        const g = f.gap, t = (x - g.ax) * g.dx + (z - g.az) * g.dz;
        if (t > 0.3 && t < g.len && y <= world.railY(g, t) + 0.15) break;
      }
    }
    return z;
  }
  function idealSpeed(f) {
    if (f.vIdeal !== undefined) return f.vIdeal;
    // a step-up is aimed a few metres onto its table; everything else at the sweet spot of the landing
    const target = f.tu !== undefined ? f.z0 + f.tu : f.z0 + f.Lu + f.Lt + SWEET * f.Ll;
    let lo = 5, hi = 40;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (landingAt(f, mid) < target) lo = mid; else hi = mid;
    }
    f.vIdeal = (lo + hi) / 2;
    return f.vIdeal;
  }
  // the kicker you're heading for in the last stretch of its in-run (judged by where your line
  // will be at its lip, so side-by-side kickers don't get mixed up)
  function kickerAhead() {
    let best = null, bestD = 1e9;
    const tn = Math.tan(clamp(P.heading, -1.2, 1.2));
    for (let bz = P.z - 10; bz <= P.z + 80; bz += 10) {
      const list = world.fb[((bz - C.Z0) / 10) | 0];
      if (!list) continue;
      for (const f of list) {
        if (f.kind !== 'kicker' || f.fn || !(SPEED_CHECK[f.size] || f.tu)) continue;
        const lip = f.z0 + f.Lu;
        if (P.z < lip - 70 || P.z > lip - 1) continue;
        const px = P.x + tn * (lip - P.z) * 0.6, kx = world.center(lip) + f.off;
        const dx = Math.abs(px - kx);
        if (dx > f.w + 2 || dx >= bestD) continue;
        best = f; bestD = dx;
      }
    }
    return best;
  }

  // ---- snowboard cross rivals: three riders racing the same course
  const RIVALS = [
    { name: 'NOVA', color: 3, skill: 0.932, lane: -6.75, grab: 1 },
    { name: 'KAI', color: 6, skill: 0.915, lane: -2.25, grab: 2 },
    { name: 'JUNO', color: 9, skill: 0.885, lane: 6.75, grab: 0 },
  ];
  const rivals = [];
  function resetRivals(z) {
    rivals.length = 0;
    if (!world.map.racers || mode !== 'sp') return;
    for (const d of RIVALS) {
      const x = world.center(z) + d.lane;
      rivals.push({ ...d, x, z, y: world.H(x, z), vy: 0, speed: 0, off: d.lane, air: false, airT: 0, fin: 0, t: 0, heading: 0, lean: 0, ph: Math.random() * 6, grabK: 0, spin: 0 });
    }
  }
  function updateRivals(dt) {
    if (!rivals.length) return;
    const ss = world.surf, sr = world.surfRef;
    for (const r of rivals) {
      r.t += dt;
      const z = r.z;
      const zn = world.zoneAt(z);
      // pace: how fast this bit of the course lets a clean rider go
      const sl = (world.base(z) - world.base(z + 8)) / 8;
      const vt = r.fin ? 6 : r.skill * clamp(9 + sl * 80, 10, (world.map.vmax || 25) - 0.3);
      r.speed += (vt - r.speed) * Math.min(1, dt * (r.air ? 0.1 : 0.7));
      // racing line: spread out across the course, bunch up to the middle for the jumps
      const jumps = zn.type === 'sbxJumps' || zn.type === 'sbxFinal';
      const want = clamp(jumps ? r.lane * 0.12 : r.lane * 0.6 + Math.sin(r.t * 0.5 + r.ph) * 1.6, -C.HALF + 2, C.HALF - 2);
      r.off += clamp(want - r.off, -1.6 * dt, 1.6 * dt);
      const dir = Math.atan2(world.center(z + 4) - world.center(z - 4), 8);
      r.heading = lerpAngle(r.heading, dir + clamp((want - r.off) * 0.15, -0.25, 0.25), Math.min(1, dt * 4));
      const nz = z + r.speed * Math.cos(r.heading - dir) * dt;
      const nx = world.center(nz) + r.off;
      const nh = world.H(nx, nz);
      if (!r.air) {
        const yb = r.y + r.vy * dt - 0.5 * G * dt * dt;
        if (nh < yb - 0.04 && r.speed > 6) { r.air = true; r.airT = 0; r.vy += 1.5; }
        else { r.vy = clamp((nh - r.y) / dt, -40, 40); r.y = nh; }
      }
      if (r.air) {
        r.vy -= G * dt; r.y += r.vy * dt; r.airT += dt;
        if (r.y <= nh) { r.y = nh; r.air = false; r.vy = 0; r.airT = 0; }
      }
      r.grabK = lerp(r.grabK, r.air && r.airT > 0.25 ? 1 : 0, Math.min(1, dt * 8));
      r.x = nx; r.z = nz;
      const bank = world.bermArr ? world.sample(world.bermArr, nz) : 0;
      r.lean = lerp(r.lean, clamp(bank * 1.2 + (want - r.off) * 0.05, -0.6, 0.6), Math.min(1, dt * 5));
      if (!r.fin && r.z >= C.LENGTH) r.fin = r.t;
    }
    world.surf = ss; world.surfRef = sr;
    // where am I? (rivals who finished before me, or are further down the course)
    const ahead = rivals.filter((r) => (r.fin && (!P.finished || r.fin < run.finalTime)) || (!r.fin && !P.finished && r.z > P.z)).length;
    if (!P.finished) run.place = ahead + 1;
  }
  if (window.ShredSlopeDebug !== undefined || /[?&]debug/.test(location.search)) window.__rivals = rivals;
  function rivalStates(out) {
    for (const r of rivals) {
      out.push({ st: { x: r.x, y: r.y, z: r.z, heading: r.heading, spin: 0, stance: 0, flip: 0, lean: r.lean, crouch: r.air ? 0.3 : 0.35, comp: 0, grab: r.grabK > 0.5, grabK: r.grabK, grabType: r.grab, air: r.air, airT: r.airT, tuck: !r.air && r.speed > 18, t: time, speed: r.speed, vx: 0, vz: r.speed }, color: r.color, alpha: 1 });
    }
  }

  // ---- halfpipe: ride the walls along the pipe's own shape, launch straight up out of the coping
  const PIPE = SS.PIPE;
  function inPipe() {
    if (!world.pipeArr || P.finished) return false;
    return world.sample(world.pipeArr, P.z) > 0.985 && Math.abs(P.x - world.center(P.z)) < PIPE.LIP + 0.25;
  }
  function enterPipe() {
    const off = clamp(P.x - world.center(P.z), -PIPE.LIP, PIPE.LIP);
    P.ps = PIPE.arc(off);
    if (P.pipeAir) {
      // back in from an air: down the wall you came out of, riding the other way round
      const board = P.heading + P.stance;
      P.pv = -P.pipeAir * Math.max(3, P.pipeLandV) * 0.93;
      const nh = Math.atan2(P.pv, Math.max(4, P.speed));
      P.stance = Math.abs(wrap(board - nh)) > Math.PI / 2 ? Math.PI : 0;
      P.pipeAir = 0;
    } else {
      P.pv = Math.sin(P.heading) * P.speed;
      P.speed = Math.max(4, Math.cos(P.heading) * P.speed);
      if (Math.abs(P.pv) < 3) P.pv = (off >= 0 ? 1 : -1) * 4; // start the swing
    }
    P.pipeMode = true;
  }
  function leavePipe() {
    const p = PIPE.at(P.ps);
    const lat = P.pv * Math.cos(p.ang);
    P.heading = clamp(Math.atan2(lat, P.speed), -1.2, 1.2);
    P.speed = Math.hypot(lat, P.speed);
    P.pipeMode = false;
  }
  function pipeStep(dt, steer) {
    if (!P.pipeMode) enterPipe();
    const at = PIPE.at(P.ps);
    const sg = P.ps < 0 ? -1 : 1;
    // gravity along the wall pulls you back into the middle
    P.pv -= sg * G * Math.sin(at.ang) * dt;
    // on the flat: pumping. Steer toward the wall you're heading for to go higher, away to go lower
    const dir = Math.sign(P.pv) || 1;
    if (Math.abs(P.ps) < PIPE.W0) {
      let lipV = 7.9 + (steer * dir > 0.3 ? 2.7 : 0) - (steer * dir < -0.3 ? 2.2 : 0) - (brakeInput() ? 1.7 : 0);
      const want = Math.sqrt(lipV * lipV + 2 * G * PIPE.H);
      const cur = Math.abs(P.pv);
      P.pv = dir * (cur + clamp(want - cur, -5 * dt, 8 * dt));
    }
    // never more swing than a big pump allows (landings low on the wall would otherwise add energy)
    const yRel = PIPE.at(P.ps).y, eMax = 0.5 * 12.2 * 12.2 + G * PIPE.H;
    if (0.5 * P.pv * P.pv + G * yRel > eMax) P.pv = (Math.sign(P.pv) || 1) * Math.sqrt(Math.max(0, 2 * (eMax - G * yRel)));
    P.ps += P.pv * dt;
    // down the pipe
    P.speed += (G * world.map.slope * 0.5 - 0.012 * P.speed * P.speed + (tuckInput() ? 1.5 : 0) - (brakeInput() ? 5 : 0)) * dt;
    P.speed = clamp(P.speed, 4, 22);
    P.z += P.speed * dt;
    const c = world.center(P.z);
    if (Math.abs(P.ps) >= PIPE.SL && P.pv * Math.sign(P.ps) > 0) {
      // out of the coping: straight up, drifting back over the pipe
      const s2 = Math.sign(P.ps);
      P.ps = s2 * PIPE.SL;
      P.x = c + PIPE.at(P.ps).o - s2 * 0.05;
      P.y = world.ground(P.x, P.z) + 0.02;
      const up = Math.abs(P.pv) * Math.sin(PIPE.TM);
      takeoff(-s2 * 0.15, P.speed);
      P.vy = up;
      P.pipeAir = s2;
      P.pipeMode = false;
      if (!ai.on) Sfx.pop();
      burst(P.x, P.y, P.z, 12, 2, 0, P.speed);
      return;
    }
    const p = PIPE.at(P.ps);
    P.x = c + p.o;
    const ny = world.ground(P.x, P.z);
    P.vy = (ny - P.y) / dt;
    P.y = ny;
    P.vx = 0; P.vz = P.speed;
    P.heading = clamp(Math.atan2(P.pv, P.speed), -1.4, 1.4);
    P.wallRoll = sg * p.ang;
    P.surf = 0; P.slide = 0; P.slip = 0; P.steerS = 0; P.yawV = 0;
    P.lean = lerp(P.lean, 0, Math.min(1, dt * 6));
    P.crouch = lerp(P.crouch, 0.25 + 0.35 * Math.min(1, Math.abs(P.pv) / 16) * (1 - Math.abs(P.ps) / PIPE.SL), Math.min(1, dt * 6));
    if (P.speed > 2 && Math.random() < 0.4) emit(P.x, P.y + 0.1, P.z, rand(-1, 1), rand(0.5, 1.5), rand(-1, 1), 0.5, 0.25, 0.92, 0.95, 1, 0.6, false);
  }

  // keep your speed into a jump: come in faster than a kicker is built for and you leave its lip on a
  // flatter line, like a rider soaking up the lip with their knees. Your speed is never touched (no
  // braking on the in-run, no slowing down in the air); the lower arc just brings you down on the
  // landing instead of sailing past it. Boosting skips it: then the big send is yours.
  const OLLIE = 2.3 + 2.9 * POP;
  function flightEnd(k, gp) {
    // the flight off the lip with its upward speed (and a normal ollie) scaled by k
    let x = P.x, y = P.y, z = P.z, vx = P.vx, vy = (P.vy + OLLIE) * k, vz = P.vz;
    const g = P.giant ? GIANT_G : G, dt = 1 / 60;
    for (let i = 0; i < 600; i++) {
      vy -= g * dt;
      if (!P.giant) { const q = Math.max(0, 1 - DRAG_AIR * Math.hypot(vx, vy, vz) * dt); vx *= q; vy *= q; vz *= q; }
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (vy < 0 && y <= world.Hk(x, z)) break;
      // a gap kicker's flight ends where it comes down onto its rail
      if (gp && vy < 0) {
        const t = (x - gp.ax) * gp.dx + (z - gp.az) * gp.dz;
        if (t > 0.3 && t < gp.len && y <= world.railY(gp, t) + 0.15) break;
      }
    }
    return z;
  }
  function absorbLip() {
    const kf = P.toRef;
    // (not the giants: their in-run sets the speed their own landing hill is drawn for)
    if (!kf || P.giant || P.boosting || P.pipeAir || world.map.racers || P.vz < 4 || P.vy <= 0) return 1;
    const gp = kf.gap;
    let end, aim;
    if (gp) { end = gp.az + gp.dz * gp.len * 0.85; aim = gp.az + gp.dz * gp.len * 0.4; } // onto the rail, not past it
    else if (kf.tu !== undefined) { end = kf.z0 + kf.tu + 6; aim = kf.z0 + kf.tu + 1; }
    else { end = kf.z0 + kf.Lu + kf.Lt + kf.Ll * 0.85; aim = kf.z0 + kf.Lu + kf.Lt + kf.Ll * 0.5; }
    if (!(end > 0) || flightEnd(1, gp) <= end) return 1;
    let lo = 0.08, hi = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (flightEnd(mid, gp) > aim) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  function airStep(dt, steer) {
    P.airT += dt;
    if (P.coyote > 0) P.coyote -= dt;
    P.vy -= (P.giant ? GIANT_G : G) * dt;
    // air drag slows the flight a little (none off the giants, whose landing hills are drawn for a clean arc)
    if (!P.giant && !P.pipeAir) {
      const sp = Math.hypot(P.vx, P.vy, P.vz), k = Math.max(0, 1 - DRAG_AIR * sp * dt);
      P.vx *= k; P.vz *= k; P.vy *= k;
    }
    const hs = Math.hypot(P.vx, P.vz);
    if (P.pipeAir) {
      // keep the flight over the coping so you come back down the wall you left
      const lim = PIPE.LIP - 0.25, off = P.x - world.center(P.z);
      if (Math.abs(off) > lim) P.x = world.center(P.z) + Math.sign(off) * lim;
    } else if (hs > 2) {
      const ang = Math.atan2(P.vx, P.vz);
      let na = ang;
      const st = P.finished || ai.on ? 0 : steer;
      // air control: A/D drift the flight sideways so you can line up a rail or a landing. A tap (or
      // holding the way you carved off the lip) drifts; once you're into a full spin it stops drifting
      const drifting = st ? 1 - clamp(Math.abs(P.spinVel) / SPIN_RATE, 0, 1) * (P.spinLock ? 0 : 1) : 0;
      if (drifting > 0.02) {
        const lim = AIR_DRIFT + 0.4 * STK.air;
        const push = clamp(st * AIR_PUSH * drifting * dt, -lim - P.drift, lim - P.drift);
        P.drift += push;
        P.vx += Math.cos(ang) * push;
        P.vz -= Math.sin(ang) * push;
      } else if (!st) {
        // hands off: the flight bends gently with the course so big airs land on the piste
        const course = Math.atan2(world.center(P.z + 2) - world.center(P.z - 2), 4);
        na += clamp(wrap(course - ang), -0.35 * dt, 0.35 * dt);
      }
      const h2 = Math.hypot(P.vx, P.vz);
      P.vx = Math.sin(na) * h2;
      P.vz = Math.cos(na) * h2;
      // the body turns with the flight, so the landing lines up with where you're going
      P.heading = clamp(lerpAngle(P.heading, na, Math.min(1, dt * 5)), -1.45, 1.45);
      const off = P.x - world.center(P.z);
      if (Math.abs(off) > C.HALF - 3) P.vx -= Math.sign(off) * 4 * dt;
    }
    P.x += P.vx * dt;
    P.z += P.vz * dt;
    P.y += P.vy * dt;

    if (P.spinLock && steer !== P.spinLock) P.spinLock = 0;
    const s = P.spinLock ? 0 : steer;
    const fi = flipInput();
    if (P.flipLock && fi !== P.flipLock) P.flipLock = 0;
    const f = P.flipLock ? 0 : fi;
    const sk = 1 + 0.08 * STK.spin;
    if (s) P.spinVel += (s * SPIN_RATE * sk - P.spinVel) * Math.min(1, dt * 10);
    else {
      P.spinVel *= Math.exp(-7 * dt);
      const tgt = Math.round((P.spin + P.stance) / Math.PI) * Math.PI - P.stance;
      P.spin += clamp(tgt - P.spin, -3.4 * dt, 3.4 * dt);
    }
    P.spin += P.spinVel * dt;
    if (f) P.flipVel += (f * FLIP_RATE * sk - P.flipVel) * Math.min(1, dt * 10);
    else {
      P.flipVel *= Math.exp(-7 * dt);
      const tgt = Math.round(P.flip / TAU) * TAU;
      P.flip += clamp(tgt - P.flip, -2.6 * dt, 2.6 * dt);
    }
    P.flip += P.flipVel * dt;
    if (world.cave && world.inCave(P.z)) {
      const roof = world.ceilingY(P.x, P.z) - 1.9;
      if (P.y > roof) {
        P.y = roof;
        if (P.vy > 0) { P.vy = -1.5; if (!ai.on) { shake = Math.max(shake, 0.35); Sfx.land(false); } }
      }
    }
    const gNow = grabbing();
    if (gNow && (!P.grabHeld || !P.grabs.length)) pickGrab();
    P.grabHeld = gNow;
    if (gNow) { P.grabT += dt; P.grabs[P.grabs.length - 1].t += dt; }
    P.grabAmt += ((gNow ? 1 : 0) - P.grabAmt) * Math.min(1, dt * (gNow ? 9 : 6));
    P.lean *= Math.exp(-4 * dt);
    P.yawOff = lerp(P.yawOff, 0, Math.min(1, dt * 3));
    P.crouch = lerp(P.crouch, grabbing() ? 0.55 : 0.28, Math.min(1, dt * 8));

    if (P.vy < 0 && !P.pipeAir) {
      const rc = world.railCatch(P.x, P.z, P.y, -P.vy * dt);
      if (rc) { P.x = rc.x; P.z = rc.z; land(world.H(P.x, P.z)); return; }
    }
    const h = world.H(P.x, P.z);
    if (P.y <= h) land(h);
  }

  function land(h) {
    const surf = world.surf, ref = world.surfRef;
    const total = P.spin + P.stance;
    const n = Math.round(total / Math.PI);
    const spinErr = Math.abs(total - n * Math.PI);
    const m = Math.round(P.flip / TAU);
    const flipErr = Math.abs(P.flip - m * TAU);
    P.y = h;
    // balance widens every landing window a little (or narrows it)
    const bt = 1 + 0.1 * STK.balance;
    if (flipErr > 0.78 * bt || spinErr > 0.85 * bt) {
      P.grounded = true;
      P.vy = 0;
      bail(flipErr > 0.78 * bt ? 'HEAD PLANT' : 'LANDED SIDEWAYS');
      return;
    }
    const e = 0.4;
    const gx = (world.Hk(P.x + e, P.z) - world.Hk(P.x - e, P.z)) / (2 * e);
    const gz = (world.Hk(P.x, P.z + e) - world.Hk(P.x, P.z - e)) / (2 * e);
    const groundVy = gx * P.vx + gz * P.vz;
    if (P.pipeAir) P.pipeLandV = Math.max(0, -P.vy);
    const impact = P.pipeAir ? 0 : Math.max(0, groundVy - P.vy);
    const hs = Math.hypot(P.vx, P.vz);
    const softK = P.giant ? 3 : 1 + 0.5 * Math.max(0, P.airT - 0.9);
    // coming down a bit sideways at speed catches the downhill edge; slamming flat buckles the knees
    if (!P.pipeAir && P.airT > 0.35 && ((spinErr > 0.58 * bt && hs > 16) || impact > 28 * softK * bt)) {
      P.grounded = true;
      P.vy = 0;
      bail(impact > 28 * softK * bt ? 'HARD LANDING' : 'CAUGHT AN EDGE');
      return;
    }
    if (!P.pipeAir) P.heading = clamp(Math.atan2(P.vx, P.vz), -1.45, 1.45);
    P.yawV = 0;
    // the longer you fly, the more your legs soak up: big airs off normal kickers land on a slope
    // you can't always reach, so grade them a bit kinder (giants have their own landing hill)
    const soft = P.giant ? 3 : 1 + 0.5 * Math.max(0, P.airT - 0.9);
    // the legs soak up the part of the speed going into the slope; the part along it carries on,
    // so a jump landed on a steep landing keeps its speed and a flat landing loses it
    let ts = hs;
    if (!P.pipeAir) {
      const nl = Math.hypot(gx, 1, gz), nx = -gx / nl, ny = 1 / nl, nz = -gz / nl;
      const vn = P.vx * nx + P.vy * ny + P.vz * nz;
      if (vn < 0) ts = Math.hypot(P.vx - vn * nx, P.vz - vn * nz);
    }
    P.speed = ts * clamp(1 - Math.max(0, impact - 7 * soft) * 0.018, 0.7, 1);
    P.vy = groundVy;
    P.slip = 0;
    P.grounded = true;
    const half = Math.abs(Math.round(P.spin / Math.PI));
    const wasSwitch = Math.abs(P.stance) > 1, spinDir = Math.sign(P.spin);
    P.stance = (Math.abs(n) % 2) * Math.PI;
    const air = P.airT, grabT = P.grabT;
    P.spin = 0; P.flip = 0; P.spinVel = 0; P.flipVel = 0;
    if (ai.on) ai.plan = null; // a trick is planned for one jump; a hop on the landing gets none
    P.surf = surf;
    if (surf === 2) startGrind(ref);
    if (P.pipeAir && !inPipe()) P.pipeAir = 0;
    run.bigAir = Math.max(run.bigAir, air);
    // landing quality
    let qual = 'clean';
    if (P.giant) run.giantLands++;
    P.giant = false;
    if (air > 0.5) {
      if (spinErr < 0.22 * bt && flipErr < 0.22 * bt && impact < 10 * soft) qual = 'perfect';
      else if (spinErr > 0.42 * bt || flipErr > 0.45 * bt || impact > 13 * soft) qual = 'sketchy';
    }
    if (window.ShredSlopeDebug && air > 0.5) {
      const kf = P.toRef, rel = kf ? +((P.z - (kf.z0 + kf.Lu + kf.Lt)) / Math.max(1, kf.Ll)).toFixed(2) : null;
      (window.ShredSlopeDebug.landLog = window.ShredSlopeDebug.landLog || []).push([Math.round(P.z), qual, +air.toFixed(2), +spinErr.toFixed(2), +flipErr.toFixed(2), +impact.toFixed(1), kf ? kf.size : '-', rel, +(P.toV || 0).toFixed(1)]);
    }
    if (qual === 'perfect') { if (P.speed < 32) P.speed = Math.min(32, P.speed * 1.05); run.perfects++; addBoost(0.12); }
    else if (qual === 'sketchy') { P.speed *= 0.76; P.wobble = 0.9; }
    P.compV += Math.min(5, 0.6 + impact * 0.2);
    awardAir(half, Math.abs(m), Math.sign(m), grabT, air, qual, spinDir, wasSwitch);
    if (air > 0.5 && mode !== 'menu') showLand(qual);
    if (air > 0.3) {
      if (!ai.on) Sfx.land(impact > 11);
      burst(P.x, P.y, P.z, Math.min(50, 14 + Math.round(impact * 2)), 2.8 + impact * 0.14, P.vx, P.vz);
      if (!ai.on) { shake = Math.max(shake, Math.min(0.6, impact * 0.03)); cam.bumpV -= Math.min(5, impact * 0.22); }
    }
  }

  // trick names the way riders call them: SWITCH / CAB (switch frontside), FS or BS for the way you
  // spin, how many flips (DOUBLE, TRIPLE, QUAD), what kind of off-axis flip it is (a back flip with
  // a backside spin is a CORK, with a frontside spin a RODEO; a front flip spun backside is a BIO,
  // frontside a MISTY), the degrees, then the grabs.
  const FLIP_N = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD '];
  function awardAir(half, flips, dir, grabT, air, qual, spinDir, sw) {
    if (air < 0.35) return;
    let name = '';
    let pts = 0;
    const lines = []; // the breakdown shown under the trick: [what, points]
    const add = (what, v) => { if (Math.round(v)) lines.push([what, Math.round(v)]); };
    const deg = half * 180;
    const fs = spinDir > 0;
    // riding switch into a frontside spin is a "cab"
    const pre0 = sw ? (half && fs ? 'CAB ' : 'SWITCH ') : '';
    const side = half ? (sw && fs ? '' : fs ? 'FS ' : 'BS ') : '';
    const nf = FLIP_N[Math.min(4, flips)] || '';
    if (half) { pts = SPIN_PTS[Math.min(half, 14)]; add(`${deg} SPIN`, pts); }
    if (flips) {
      const fp = flips * (dir < 0 ? 900 : 800);
      pts += fp;
      add(flips > 1 ? `${flips} ${dir < 0 ? 'BACK' : 'FRONT'} FLIPS` : `${dir < 0 ? 'BACK' : 'FRONT'} FLIP`, fp);
    }
    if (flips && half) {
      // a back flip spun backside (or out of a cab) is a cork, spun frontside a rodeo
      const kind = dir < 0 ? (fs && !sw ? 'RODEO' : 'CORK') : (fs ? 'MISTY' : 'BIO');
      name = `${pre0}${side}${nf}${kind} ${deg}`;
      const before = pts;
      pts *= 1.3;
      if (flips >= 2) pts *= 1 + 0.12 * (flips - 1); // stacking corks is the hardest thing there is
      add('OFF-AXIS ' + kind, pts - before);
    } else if (flips) {
      name = `${pre0}${nf}${dir < 0 ? 'BACKFLIP' : 'FRONTFLIP'}`;
    } else if (half) {
      name = `${pre0}${side}${deg}`;
    }
    if (sw && (flips || half)) { const before = pts; pts *= 1.1; add(fs && half ? 'CAB' : 'SWITCH', pts - before); } // switch take-offs score a little more
    const held = (P.grabs || []).filter((g) => g.t > 0.15);
    let gp = 0;
    if (held.length) {
      const g = held.map((h) => GRABS[h.type]).join(' TO ');
      name = name ? name + ' ' + g : g;
      for (const h of held) gp += 150 + Math.min(2.5, h.t) * 300;
      pts += gp;
      if (held.length > 1) { const k = 1 + 0.25 * (held.length - 1); pts *= k; gp *= k; }
      add(g + ' GRAB', gp);
    }
    if (air > 1.1) {
      pts += (air - 1.1) * 250;
      add(`AIRTIME ${air.toFixed(1)} S`, (air - 1.1) * 250);
      if (!name) name = 'BIG AIR';
    }
    // which part of the score each piece goes to (for the results screen)
    const pre = pts;
    let ks = 1;
    if (qual === 'perfect') { pts *= 1.15; add('STOMP', pts - pre); }
    else if (qual === 'sketchy') { pts *= 0.7; ks = 0.7; add('SKETCHY LANDING', pts - pre); }
    if (name) {
      const seen = run.seen || (run.seen = {});
      const n = seen[name] || 0;
      seen[name] = n + 1;
      if (n) { const before = pts, k = Math.max(0.4, 1 - 0.15 * n); pts *= k; ks *= k; add(`${n + 1}${['', '', 'ND', 'RD'][n + 1] || 'TH'} TIME -${Math.round((1 - k) * 100)}%`, pts - before); }
      addTrick(name, Math.round(pts), { air: (pre - gp) * ks, grab: gp * ks, land: qual === 'perfect' ? pre * 0.15 * ks : 0 }, lines);
    }
  }

  // butters on the snow: points for how long you hold the press
  function awardButter(dir, t) {
    const name = dir > 0 ? 'NOSE BUTTER' : 'TAIL BUTTER';
    const pts = Math.round(150 + Math.min(2.5, t) * 260);
    addTrick(name, pts, { air: pts }, [[name, pts]]);
  }

  const mult = () => Math.min(3, 1 + 0.15 * Math.max(0, run.combo - 1));

  function addBoost(a) {
    const was = run.boost;
    run.boost = Math.min(1, run.boost + a);
    if (was < 1 && run.boost >= 1 && mode !== 'menu' && !ai.on) { Sfx.tone(660, 0.12, 'square', 0.05); Sfx.tone(990, 0.2, 'square', 0.05, 0, 0.08); }
  }

  function addTrick(name, pts, parts, lines) {
    addBoost(Math.min(0.4, pts / 4500));
    run.combo++;
    run.pot += pts;
    run.tricks++;
    const pp = run.potParts || (run.potParts = {});
    for (const [k, v] of Object.entries(parts || { air: pts })) pp[k] = (pp[k] || 0) + v;
    if (run.bestTrick && pts * mult() > run.bestTrick.pts) run.bestTrick = { name, pts: Math.round(pts * mult()) };
    (run.comboNames || (run.comboNames = [])).push(name);
    run.bankT = 2.4;
    if (mode === 'menu') return;
    const m = mult();
    setTrick(name, '+' + fmt(run.pot * m) + (m > 1 ? `<span class="mult">x${m.toFixed(2)}</span>` : ''), false, 2.6, lines || [[name, pts]]);
    Sfx.trick();
    if (mode === 'mp' && pts >= 600) net.send({ t: 'ev', txt: name });
  }

  function bank() {
    if (run.pot <= 0) return;
    const m = mult();
    if (mode !== 'menu') pushRunFeed(run.comboNames || [], Math.round(run.pot * m), m);
    run.comboNames = [];
    run.score += Math.round(run.pot * m);
    if (run.parts) for (const [k, v] of Object.entries(run.potParts || {})) run.parts[k] = (run.parts[k] || 0) + Math.round(v * m);
    run.landed = (run.landed || 0) + 1;
    run.potParts = {};
    run.pot = 0;
    run.combo = 0;
    if (mode !== 'menu') Sfx.bank();
  }

  function bail(reason) {
    if (P.bailT > 0) return;
    if (window.ShredSlopeDebug) (window.ShredSlopeDebug.bailLog = window.ShredSlopeDebug.bailLog || []).push(reason + '@' + Math.round(P.z) + (window.ShredSlopeDebug.verbose ? ' off=' + (P.x - world.center(P.z)).toFixed(1) + ' hd=' + P.heading.toFixed(2) + ' sp=' + P.speed.toFixed(1) + ' ref=' + (world.surfRef ? world.surfRef.type || world.surfRef.kind : '-') + ' wasSurf=' + P.surf : ''));
    const lost = Math.round(run.pot * mult());
    run.potParts = {};
    run.comboNames = [];
    run.pot = 0;
    run.combo = 0;
    run.bails++;
    if (P.surf === 2) { P.grindRef = null; P.grind = 0; }
    // how you go down depends on what went wrong
    const kind = /TREE|WALL/.test(reason) ? 'hit' : /EDGE|BALANCE/.test(reason) ? 'slam' : 'tumble';
    const side = P.lean ? -Math.sign(P.lean) : Math.random() < 0.5 ? -1 : 1; // +1 = onto your back, -1 = onto your front
    P.bailKind = kind;
    P.bailSide = side;
    P.bailT = BAIL_T;
    P.bailAge = 0;
    P.bailHits = 0;
    P.tumble = 0;
    P.tumbleRoll = 0;
    P.boosting = false;
    P.spin = 0; P.flip = 0; P.slide = 0;
    if (kind === 'slam') {
      // edge catch: the board stops, you don't: whipped onto your back or your face
      P.rollV = side * (7 + P.speed * 0.12);
      P.tumbleV = (Math.random() - 0.5) * 2;
    } else if (kind === 'hit') {
      // bounce off and fall back into the snow
      P.speed = 0;
      P.rollV = 6.5;
      P.bailSide = 1;
      P.tumbleV = 0;
      P.grounded = false; P.vy = 2.4; P.vx = -Math.sin(P.heading) * 2.5; P.vz = -Math.cos(P.heading) * 2.5;
    } else {
      // cartwheel down the hill
      P.tumbleV = (P.flip < 0 ? -1 : 1) * (5.5 + P.speed * 0.22);
      P.rollV = side * (1.5 + Math.random() * 1.5);
    }
    show(ui.popMeter, false);
    burst(P.x, P.y, P.z, 60, 5, P.vx || 0, P.vz || 0);
    if (mode === 'menu') return;
    setTrick('BAIL', lost > 0 ? 'LOST ' + fmt(lost) : reason, true, 2);
    Sfx.bail();
    shake = 1;
    if (mode === 'mp') net.send({ t: 'ev', txt: 'BAILED' });
  }

  const BAIL_T = 2.35, GETUP_T = 0.75;
  function bailStep(dt) {
    P.bailT -= dt;
    P.bailAge += dt;
    const kind = P.bailKind || 'tumble';
    const getUp = clamp(1 - P.bailT / GETUP_T, 0, 1);
    P.speed *= Math.exp(-(kind === 'slam' ? 1.5 : 1.7) * dt);
    const sh = Math.sin(P.heading), ch = Math.cos(P.heading);
    if (P.grounded) {
      P.x += sh * P.speed * dt;
      P.z += ch * P.speed * dt;
      P.y = world.H(P.x, P.z);
    } else {
      P.vy -= G * dt;
      P.x += P.vx * dt * 0.6;
      P.z += P.vz * dt * 0.6;
      P.y += P.vy * dt;
      const h = world.H(P.x, P.z);
      if (P.y <= h) {
        P.y = h;
        P.grounded = true;
        const hs = Math.hypot(P.vx, P.vz);
        if (kind === 'hit') P.speed = 0.6;
        else if (P.bailAge > 0.02 && hs > 0.5) { P.speed = hs * 0.55; P.heading = clamp(Math.atan2(P.vx, P.vz), -Math.PI, Math.PI); }
        P.bailHits++;
        burst(P.x, P.y, P.z, 26, 3, 0, 0);
        if (!ai.on && P.bailHits < 4) shake = Math.max(shake, 0.45);
      }
    }
    // tumbling slows down; every half turn the body hits the snow and bounces a little
    const prevHalf = Math.floor(P.tumble / Math.PI + 0.5);
    P.tumble += P.tumbleV * dt;
    P.tumbleRoll += P.rollV * dt;
    if (kind === 'tumble' && P.grounded && P.speed > 5 && Math.floor(P.tumble / Math.PI + 0.5) !== prevHalf && P.bailAge < 1.3) {
      P.grounded = false;
      P.vy = 1.4 + P.speed * 0.07;
      P.vx = Math.sin(P.heading) * P.speed;
      P.vz = Math.cos(P.heading) * P.speed;
    }
    const settle = kind === 'tumble' ? 1.15 : 0.35;
    if (P.bailAge < settle && P.speed > 3) {
      P.tumbleV *= Math.exp(-1.4 * dt);
      P.rollV *= Math.exp(-1.2 * dt);
      // a slam stops when you're flat on the snow
      if (kind !== 'tumble' && Math.abs(P.tumbleRoll) > 1.45) { P.tumbleRoll = Math.sign(P.tumbleRoll) * 1.45; P.rollV = 0; }
    } else {
      // come to rest flat on your back (or front), then get up
      P.tumbleV = 0; P.rollV = 0;
      const flat = (P.bailSide || 1) * 1.45;
      const tPitch = Math.round(P.tumble / TAU) * TAU;
      const tRoll = Math.round((P.tumbleRoll - flat) / TAU) * TAU + flat;
      const k = Math.min(1, dt * 7);
      P.tumble = lerp(P.tumble, tPitch, k);
      P.tumbleRoll = lerp(P.tumbleRoll, getUp > 0 ? Math.round(P.tumbleRoll / TAU) * TAU : tRoll, getUp > 0 ? Math.min(1, dt * 9 * getUp) : k);
    }
    P.bailUp = getUp;
    if (getUp > 0) {
      // stand up facing back down the course
      const course = Math.atan2(world.center(P.z + 4) - world.center(P.z - 4), 8);
      P.heading = lerpAngle(P.heading, course, Math.min(1, dt * 5));
    }
    if (P.speed > 3 && Math.random() < 0.6) emit(P.x, P.y + 0.2, P.z, rand(-1, 1), rand(1, 2.5), rand(-1, 1), 0.8, 0.35, 0.92, 0.95, 1, 0.75, false);
    if (P.bailT <= 0) respawn();
  }

  function respawn() {
    const c = world.center(P.z);
    P.x = clamp(P.x, c - C.HALF + 3, c + C.HALF - 3);
    P.y = world.H(P.x, P.z);
    Object.assign(P, { pipeMode: false, pipeAir: 0, wallRoll: 0, heading: Math.atan2(world.center(P.z + 4) - world.center(P.z - 4), 8), speed: 7, slip: 0, vy: 0, vx: 0, vz: 0, grounded: true, stance: 0, spin: 0, flip: 0, inv: 1.3, surf: 0, tumble: 0, tumbleRoll: 0, rollV: 0, tumbleV: 0, bailUp: 0, bailAge: 0, lean: 0, slide: 0, wobble: 0, giant: false, ref: null, grabs: [], grabAmt: 0 });
    if (mode !== 'menu') setTrick('BACK ON YOUR FEET', '', false, 1.6);
  }

  function checkTokens(px, pz) {
    const b0 = ((P.z - C.Z0) / 10) | 0;
    for (let b = b0 - 1; b <= b0 + 1; b++) {
      const list = world.tokenBuckets[b];
      if (!list) continue;
      for (const t of list) {
        if (tokenGot.has(t.id)) continue;
        if (t.y < P.y - 0.6 || t.y > P.y + 2.4) continue;
        // distance from the token to the path travelled this step
        const ax = P.x - px, az = P.z - pz;
        const l2 = ax * ax + az * az || 1e-6;
        const k = clamp(((t.x - px) * ax + (t.z - pz) * az) / l2, 0, 1);
        const dx = t.x - (px + ax * k), dz = t.z - (pz + az * k);
        if (dx * dx + dz * dz < 2.6) {
          tokenGot.add(t.id);
          run.tokens++;
          run.score += TOKEN_PTS;
          if (run.parts) run.parts.flakes += TOKEN_PTS;
          addBoost(0.025);
          if (run.pot > 0) run.bankT = Math.max(run.bankT, 1.2);
          if (mode !== 'menu') Sfx.token();
          sparkle(t.x, t.y, t.z, Math.round(16 * q.particles), 0.4, 0.9, 1.0, 3.5);
        }
      }
    }
  }

  function physics(dt) {
    if (P.bailT > 0) { bailStep(dt); return; }
    if (P.inv > 0) P.inv -= dt;
    if (P.wobble > 0) P.wobble -= dt;
    const steer = P.finished ? 0 : steerInput();
    P.wind = lerp(P.wind, P.grounded ? 0 : clamp(P.spinVel / SPIN_RATE, -1, 1) * 0.6, Math.min(1, dt * 6));
    const px = P.x, pz = P.z;
    if (P.grounded) {
      if (inPipe()) pipeStep(dt, steer);
      else { if (P.pipeMode) leavePipe(); groundStep(dt, steer); }
      if (P.grounded && !P.pipeMode) autoRail();
    } else airStep(dt, steer);
    if (!P.pipeMode) P.wallRoll *= Math.exp(-(P.grounded ? 12 : 5) * dt);
    // the big air tower has railings: you can't ride off the side of the deck
    if (world.towerArr && P.bailT <= 0 && world.sample(world.towerArr, P.z) > 1) {
      const c = world.center(P.z), lim = world.map.towerHalf - 0.45, off = P.x - c;
      if (Math.abs(off) > lim) {
        P.x = c + Math.sign(off) * lim;
        if (P.grounded) { P.heading = lerpAngle(P.heading, 0, 0.35); P.slip = 0; } else P.vx *= -0.2;
      }
    }
    // legs as a spring
    P.compV += (-70 * P.comp - 10 * P.compV) * dt;
    P.comp = clamp(P.comp + P.compV * dt, -0.15, 0.85);
    if (P.bailT <= 0) checkTokens(px, pz);
    if (P.bailT <= 0 && P.inv <= 0) {
      const hit = world.hit(P.x, P.y, P.z, 0.32);
      if (hit) bail(hit.r > 0.6 ? 'WALL' : 'TREE');
    }
    if (Math.abs(P.x - world.center(P.z)) > C.HALF + 55 && P.bailT <= 0) bail('OUT OF BOUNDS');
    if (world.cave && world.inCave(P.z) && Math.abs(P.x - world.center(P.z)) > C.HALF + 7.5 && P.bailT <= 0) bail('ICE WALL');
  }

  function emitSpray(dt) {
    if (P.bailT > 0 || !P.grounded || P.speed < 3) return;
    const steer = P.steerS;
    const carve = Math.abs(steer);
    const grinding = P.surf === 2;
    const scrub = Math.max(P.slide, (P.check || 0) * 0.8, (P.skid || 0) * 0.7);
    const n = Math.round(((P.speed * 0.5 + carve * 7) * 0.75 + scrub * 16) * dt * 60 * q.particles + Math.random());
    const sh = Math.sin(P.heading), ch = Math.cos(P.heading);
    for (let i = 0; i < n; i++) {
      if (grinding && P.grindRef && P.grindRef.type === 'rail') {
        emit(P.x, P.y + 0.05, P.z, rand(-1.5, 1.5) + sh * P.speed * 0.4, rand(0.5, 2.5), ch * P.speed * 0.4 + rand(-1, 1), rand(0.2, 0.5), rand(0.05, 0.1), 1.0, rand(0.5, 0.8), 0.2, 1, true);
        continue;
      }
      if (scrub > 0.3 && Math.random() < scrub) {
        // powerslide: a wall of snow thrown forward and out
        emit(P.x + sh * 0.4, P.y + 0.1, P.z + ch * 0.4,
          sh * P.speed * 0.9 - ch * rand(1, 4), rand(1.5, 4.5), ch * P.speed * 0.9 + sh * rand(1, 4),
          rand(0.5, 1.1), rand(0.06, 0.2), 0.93, 0.96, 1.0, 0.7, false);
        continue;
      }
      const side = steer ? -Math.sign(steer) : (Math.random() < 0.5 ? -1 : 1);
      const back = rand(0.2, 0.8);
      emit(P.x - sh * back + ch * side * 0.25, P.y + 0.06, P.z - ch * back - sh * side * 0.25,
        sh * P.speed * 0.55 + ch * side * rand(1, 2 + carve * 4), rand(0.6, 1.6 + carve * 2.2), ch * P.speed * 0.55 - sh * side * rand(1, 2 + carve * 4),
        rand(0.35, 0.8), rand(0.04, 0.13), 0.9, 0.94, 1.0, 0.7, false);
      // fine powder hanging in the air behind the spray
      if (Math.random() < 0.12 + carve * 0.15) emit(P.x - sh * back * 1.5, P.y + 0.2, P.z - ch * back * 1.5, sh * P.speed * 0.3 + rand(-0.6, 0.6), rand(0.3, 1.0), ch * P.speed * 0.3 + rand(-0.6, 0.6), rand(0.8, 1.4), rand(0.35, 0.7), 0.9, 0.93, 0.98, 0.1, false);
    }
    // boost flames off the tail of the board
    if (P.boosting) {
      const m = Math.round(5 * q.particles + Math.random());
      for (let i = 0; i < m; i++) {
        const hot = Math.random();
        emit(P.x - sh * 0.9 + rand(-0.2, 0.2), P.y + rand(0.1, 0.5), P.z - ch * 0.9 + rand(-0.2, 0.2),
          -sh * rand(3, 7) + rand(-1, 1), rand(0.5, 2.5), -ch * rand(3, 7) + rand(-1, 1),
          rand(0.25, 0.55), rand(0.14, 0.3), 1.0, 0.45 + hot * 0.45, 0.12 + hot * 0.2, 0.9, true);
      }
    }
    // a soft powder cloud at speed
    if (P.speed > 24 && Math.random() < 0.5 * q.particles) {
      emit(P.x - sh * 1.2 + rand(-0.4, 0.4), P.y + 0.3, P.z - ch * 1.2, sh * P.speed * 0.3, rand(0.2, 0.8), ch * P.speed * 0.3, rand(1, 1.6), rand(0.6, 1.1), 0.85, 0.9, 1.0, 0.18, false);
    }
  }

  function updateFireworks(dt) {
    if (fireworksT <= 0) return;
    fireworksT -= dt;
    fireworksNext -= dt;
    if (fireworksNext <= 0) {
      fireworksNext = rand(0.18, 0.4);
      const z = C.LENGTH + rand(15, 45);
      const x = world.center(z) + rand(-14, 14);
      const y = world.ground(x, z) + rand(16, 26);
      const cols = [[1, 0.35, 0.3], [1, 0.85, 0.3], [0.4, 0.8, 1], [0.5, 1, 0.6], [0.9, 0.5, 1]];
      const c = cols[(Math.random() * cols.length) | 0];
      sparkle(x, y, z, Math.round(55 * q.particles), c[0], c[1], c[2], rand(7, 10));
      if (mode !== 'menu') Sfx.boom();
    }
  }

  // ------------------------------------------------------------------ AI rider (title screen)
  // how long until this flight comes down (gravity and drag, no steering)
  function predictAir() {
    let x = P.x, y = P.y, z = P.z, vx = P.vx, vy = P.vy, vz = P.vz, t = 0;
    const g = P.giant ? GIANT_G : G, dt = 1 / 30;
    while (t < 9) {
      vy -= g * dt;
      if (!P.giant) { const k = 1 - DRAG_AIR * Math.hypot(vx, vy, vz) * dt; vx *= k; vy *= k; vz *= k; }
      x += vx * dt; y += vy * dt; z += vz * dt; t += dt;
      if (vy < 0 && y <= world.Hk(x, z)) break;
    }
    return t;
  }
  function aiThink() {
    ai.steer = 0; ai.flip = 0; ai.grab = false; ai.brake = false; ai.tuck = false; ai.boost = false;
    if (P.bailT > 0) return;
    if (P.surf === 2 && P.grindRef) {
      ai.steer = clamp(-(P.bal * 4 + P.balV * 1.3), -1, 1);
      return;
    }
    if (!P.grounded) {
      const pl = ai.plan;
      if (pl) {
        // on the first moment in the air, fly the arc ahead and keep only the rotation that fits
        if (!pl.fit) {
          pl.fit = true;
          const tAir = predictAir();
          const room = Math.max(0, tAir - 0.75);
          if (pl.spin) pl.spin = Math.min(pl.spin, Math.floor((room * SPIN_RATE * 0.9) / Math.PI) * Math.PI);
          if (pl.flip && room < TAU / FLIP_RATE + 0.2) pl.flip = false;
        }
        if (pl.spin && Math.abs(P.spin) < pl.spin - 0.55) ai.steer = pl.dir;
        if (pl.flip && Math.abs(P.flip) < TAU - 0.7) ai.flip = -1;
        if (pl.grab && P.airT > 0.12) ai.grab = true;
      }
      return;
    }
    if (P.surf === 0) ai.plan = null;
    let target = world.center(P.z + 22), feat = null;
    for (const f of world.featSorted) {
      const z0 = f.kind === 'kicker' ? f.z0 : f.az - f.ramp;
      if (z0 > P.z + 70) break;
      // stay lined up with a kicker all the way up its in-run (long jumps have long ramps)
      if ((f.kind === 'kicker' ? f.z0 + Math.max(0, f.Lu) : z0) < P.z - 2) continue;
      if (f.kind === 'rail' && (f.type === 'rail' || f.ramp < 0.1)) continue;
      if (f.aiSkip || f.size === 'D') continue;
      feat = f;
      break;
    }
    if (feat) {
      target = feat.kind === 'kicker' ? world.center(feat.z0) + feat.off : feat.ax;
      // a box needs lining up: if it's close and you're well off its line, scrub speed to make the turn
      const fz = feat.kind === 'kicker' ? feat.z0 : feat.az - feat.ramp;
      if (feat.kind === 'rail' && P.speed > 16 && fz - P.z < P.speed * 1.4 && Math.abs(target - P.x) > 2) ai.brake = true;
    }
    for (let dz = 3; dz < 12 + P.speed * 0.75; dz += 1.5) {
      const hx = P.x + Math.sin(P.heading) * dz;
      const h = world.hit(hx, P.y, P.z + dz, 1.4) || world.avoidHit(hx, P.z + dz, 1.0);
      if (h) {
        target = h.x + (P.x > h.x ? 1 : -1) * (h.r + 2.6);
        // too fast to carve round it: powerslide to scrub speed and turn tighter
        if (P.speed > 20 && dz < P.speed * 0.9) ai.brake = true;
        break;
      }
    }
    const want = Math.atan2(target - P.x, 22);
    ai.steer = clamp((want - P.heading) * 4, -1, 1);
    ai.tuck = !feat && P.speed < 30;
    ai.boost = !feat && run.boost > 0.6 && P.speed < 42;
    if (P.surf === 1 && world.surfRef && world.surfRef.kind === 'kicker' && !world.surfRef.aiSkip) {
      const f = world.surfRef, u = P.z - f.z0;
      if (!ai.popped && u > f.Lu - 1.4) {
        ai.popped = true;
        const r = Math.random();
        const dir = Math.random() < 0.5 ? -1 : 1;
        if (f.size === 'G') ai.plan = r < 0.4 ? { spin: 9 * Math.PI, dir, grab: true } : r < 0.7 ? { flip: true, spin: 5 * Math.PI, dir } : { spin: 7 * Math.PI, dir, grab: true };
        else if (f.size === 'S' || f.size === 'D' || f.size === 'GK' || f.size === 'RK') ai.plan = { grab: true };
        else if (f.size === 'M') ai.plan = r < 0.6 ? { spin: TAU, dir, grab: r < 0.3 } : { grab: true, spin: Math.PI, dir };
        else ai.plan = r < 0.5 ? { flip: true } : { spin: 3 * Math.PI, dir, grab: true };
        ai.steer = ai.plan.spin ? ai.plan.dir : 0;
        ai.flip = ai.plan.flip ? -1 : 0;
        pop();
      }
    } else if (P.surf === 0) ai.popped = false;
  }

  function startAttract() {
    mode = 'menu';
    phase = 'attract';
    ai.on = true;
    ai.plan = null;
    ai.popped = false;
    resetRider(world.cave ? rand(world.cave[0] + 20, world.cave[1] - 400) : rand(40, 1600));
    P.speed = 18;
    run.boost = 1;
  }
  // the title screen tours all the mountains
  function nextAttract() {
    if (!previewLock) {
      const i = SS.MAP_IDS.indexOf(world.mapId);
      useWorld((Math.random() * 2147483647) | 0, SS.MAP_IDS[(i + 1) % SS.MAP_IDS.length]);
    }
    startAttract();
  }

  // ------------------------------------------------------------------ camera
  const cam = { x: 0, y: 30, z: -40, tx: 0, ty: 0, tz: 0, head: 0, fov: 1.1, roll: 0, bump: 0, bumpV: 0, snap: true };
  const eyeV = [0, 0, 0], tgtV = [0, 0, 0];

  let camLock = null; // debug: hold the camera still for screenshots
  function follow(dt, t, opts) {
    if (camLock) { Object.assign(cam, camLock); return; }
    opts = opts || {};
    const pipeCam = t === P && (P.pipeMode || P.pipeAir) ? 1 : 0;
    cam.pipe = lerp(cam.pipe || 0, pipeCam, Math.min(1, dt * 2));
    let travel = t.grounded === false && Math.hypot(t.vx || 0, t.vz || 0) > 1 ? Math.atan2(t.vx, t.vz) : t.heading;
    if (pipeCam) travel = Math.atan2(world.center(t.z + 6) - world.center(t.z - 6), 12);
    const k = cam.snap ? 1 : 1 - Math.exp(-dt * 3.2);
    cam.head = cam.snap ? travel : lerpAngle(cam.head, travel, k);
    const camMode = opts.far ? 'far' : settings.camera;
    const far = camMode === 'far', high = camMode === 'high' && !opts.far;
    const sp = t.speed || 0;
    const giantAir = t === P && P.giant && !P.grounded;
    cam.big = lerp(cam.big || 0, giantAir ? 1 : 0, Math.min(1, dt * (giantAir ? 1.5 : 0.8)));
    // HIGH hangs the camera up in the sky behind the rider, like a drone, so you see the course coming.
    // CHASE (the default) rides low over your shoulder; in the air it eases back and up to frame the
    // landing, and drops back in behind you when you touch down.
    const chase = !far && !high;
    const airK = t === P && !P.grounded && !P.giant && P.bailT <= 0 ? clamp((P.airT - 0.25) / 0.8, 0, 1) : 0;
    cam.air = lerp(cam.air || 0, airK, Math.min(1, dt * (airK > (cam.air || 0) ? 2.2 : 4)));
    let dist = (high ? 11 : far ? 8.6 : 5.5) + sp * (high ? 0.06 : chase ? 0.045 : 0.05) + cam.big * 6 + (chase ? cam.air * 2.2 : 0);
    const hgt = (high ? 7.6 : far ? 3.3 : 1.8) + sp * (high ? 0.035 : chase ? 0.017 : 0.02) + cam.big * (high ? 3.5 : 2.5) + (chase ? cam.air * 1.3 : 0);
    const head = cam.head + (opts.orbit || 0);
    // if a bank is behind the rider, pull the camera in instead of lifting it over the rider's head
    let ex, ez;
    for (let i = 0; i < 6; i++) {
      ex = t.x - Math.sin(head) * dist;
      ez = t.z - Math.cos(head) * dist;
      if (world.ground(ex, ez) + 1.4 <= t.y + hgt + 0.6 || dist < 3) break;
      dist *= 0.78;
    }
    if (chase && !opts.far) {
      // over the right shoulder
      const off = 0.6 * (1 - cam.air * 0.6);
      ex += Math.cos(head) * off;
      ez -= Math.sin(head) * off;
    }
    if (cam.pipe > 0.01) {
      // keep the whole pipe in view: slide toward the middle and rise above the decks
      const c = world.center(ez);
      ex = lerp(ex, c + (t.x - world.center(t.z)) * 0.35, cam.pipe);
      ez -= 2.5 * cam.pipe;
    }
    let ey = Math.max(t.y + hgt, world.ground(ex, ez) + 1.4);
    if (cam.pipe > 0.01) ey = lerp(ey, Math.max(ey, world.base(ez) + SS.PIPE.H + 2.8), cam.pipe);
    if (world.cave && world.inCave(ez)) ey = Math.min(ey, world.ceilingY(ex, ez) - 1.2);
    const kp = cam.snap ? 1 : 1 - Math.exp(-dt * 9);
    const ky = cam.snap ? 1 : 1 - Math.exp(-dt * (t.grounded === false ? 3 + cam.big * 3 : 6));
    cam.x += (ex - cam.x) * kp;
    cam.z += (ez - cam.z) * kp;
    cam.y += (ey - cam.y) * ky;
    // look a little into the turn (and off to one side on the title screen)
    const side = (t.steerS || 0) * 1.6 + (opts.side || 0);
    const ahead = (high ? 9 : 7) + (chase ? cam.air * 5 : 0);
    const tx = t.x + Math.sin(cam.head) * ahead + Math.cos(cam.head) * side;
    const tz = t.z + Math.cos(cam.head) * ahead - Math.sin(cam.head) * side;
    const ty = t.y + (high ? -0.6 : chase ? 0.65 - cam.air * 1.1 : 0.5);
    cam.tx += (tx - cam.tx) * kp;
    cam.tz += (tz - cam.tz) * kp;
    cam.ty += (ty - cam.ty) * (cam.snap ? 1 : 1 - Math.exp(-dt * 6));
    const rollT = -(t.lean || 0) * 0.14;
    cam.roll += (rollT - cam.roll) * Math.min(1, dt * 4);
    const boostFov = t === P && P.boosting ? 9 : 0;
    cam.fov = lerp(cam.fov, ((chase ? 64 : 62) + clamp(sp / MAX_SPEED, 0, 1) * (chase ? 15 : 13) + boostFov + (chase ? cam.air * 4 : 0)) * (Math.PI / 180), cam.snap ? 1 : Math.min(1, dt * (boostFov ? 4 : 2)));
    cam.snap = false;
  }

  // ------------------------------------------------------------------ ghost of your best run (singleplayer, same mountain)
  let ghostRec = [];
  let bestGhost = null;
  let ghostT = 0;
  const ghostTag = document.createElement('div');
  ghostTag.className = 'tagEl';
  ghostTag.textContent = 'BEST RUN';
  ghostTag.style.setProperty('--c', '#cfe3ff');
  ghostTag.style.display = 'none';
  ui.tags.appendChild(ghostTag);
  function recordGhost(dt) {
    ghostT += dt;
    if (ghostT < 0.1) return;
    ghostT = 0;
    ghostRec.push([raceT, P.x, P.y, P.z, P.heading, P.spin + P.stance + P.yawOff, P.flip, P.lean, P.crouch, P.bailT > 0 ? 1 : 0, P.grounded ? 1 : 0]);
  }
  function ghostState() {
    if (mode !== 'sp' || !bestGhost || !world || bestGhost.seed !== world.seed || bestGhost.map !== world.mapId || !(phase === 'riding' || phase === 'finished')) return null;
    const f = bestGhost.frames;
    if (!f.length) return null;
    let i = 0;
    while (i < f.length - 1 && f[i + 1][0] < raceT) i++;
    const a = f[i], b = f[Math.min(i + 1, f.length - 1)];
    const k = b[0] > a[0] ? clamp((raceT - a[0]) / (b[0] - a[0]), 0, 1) : 0;
    return {
      x: lerp(a[1], b[1], k), y: lerp(a[2], b[2], k), z: lerp(a[3], b[3], k), heading: lerpAngle(a[4], b[4], k),
      spin: lerpAngle(a[5], b[5], k), flip: lerpAngle(a[6], b[6], k), lean: lerp(a[7], b[7], k), crouch: lerp(a[8], b[8], k),
      bail: !!a[9], air: !a[10], stance: 0, t: time,
    };
  }

  // ------------------------------------------------------------------ multiplayer
  let myId = 0;
  let serverInfo = null;
  let serverPhase = 'idle';
  let phaseEnds = 0;
  let racers = new Set();
  const remotes = new Map();
  let specId = 0;
  const net = new SS.Net({ message: onNet, close: onNetClose });

  function onNet(m) {
    switch (m.t) {
      case 'welcome':
        myId = m.id;
        myColor = m.color;
        serverInfo = m.server;
        playerName = m.name;
        for (const r of remotes.values()) r.tag.remove();
        remotes.clear();
        for (const p of m.players) if (p.id !== myId) addRemote(p);
        ui.mpServer.textContent = m.server.name;
        show(ui.loading, false);
        onPhase(m);
        if (voice) voice.reset(myId, m.players, m.ice);
        onVotes(m.votes);
        askVoice();
        break;
      case 'phase':
        onPhase(m);
        break;
      case 'join':
        addRemote(m.p);
        if (m.racers) racers = new Set(m.racers);
        feed(m.p.name + ' joined', m.p.color);
        if (voice) voice.joined(m.p);
        break;
      case 'leave': {
        const r = remotes.get(m.id);
        if (r) { feed(r.name + ' left', r.color); r.tag.remove(); remotes.delete(m.id); trails.delete(m.id); }
        if (voice) voice.left(m.id);
        break;
      }
      case 'vc':
        if (voice) voice.peerVoice(m.id, m.on);
        { const r = remotes.get(m.id); if (r && m.on) feed(r.name + ' turned voice on', r.color); }
        break;
      case 'rtc':
        if (voice) voice.signal(m.from, m.d);
        break;
      case 'votes':
        onVotes(m);
        break;
      case 'coins':
        if (SS.Shop) SS.Shop.onRaceCoins(m);
        break;
      case 'needAccount':
        mpError('Create an account to play multiplayer.');
        if (SS.Account && SS.Account.online) SS.Account.open('up', ui.servers);
        break;
      case 'snap': {
        const now = performance.now();
        for (const row of m.p) {
          const r = remotes.get(row[0]);
          if (!r) continue;
          r.buf.push({ t: now, d: row.slice(1) });
          if (r.buf.length > 30) r.buf.shift();
        }
        break;
      }
      case 'feed': {
        const r = remotes.get(m.id);
        if (r) feed(r.name + ' · ' + m.txt, r.color);
        break;
      }
      case 'full':
        mpError('That server is full (10/10). Try another one.');
        break;
    }
  }

  function onNetClose(e, wasOpen) {
    if (mode !== 'mp') return;
    const msg = wasOpen ? 'Disconnected from the server.' : 'Could not connect to the server.';
    leaveMp();
    toMenu();
    openServers(msg);
  }

  function mpError(msg) {
    net.leave();
    leaveMp();
    toMenu();
    openServers(msg);
  }

  // ---- map votes
  let votes = { counts: {}, next: null, mine: null };
  function onVotes(v) {
    if (!v) return;
    votes = { counts: v.counts || {}, next: v.next, mine: v.mine || null };
    const m = SS.MAPS[votes.next];
    const n = votes.counts[votes.next] || 0;
    $('mpNext').textContent = m ? m.name + (n ? ` (${n} ${n === 1 ? 'vote' : 'votes'})` : '') : '—';
    if (mapVote && !hidden(ui.maps)) { buildMaps(); if (mapSel) selectMap(mapSel); }
  }

  // ---- voice chat (voice.js does the talking)
  const voice = SS.Voice ? new SS.Voice({ send: (o) => net.send(o), onChange: () => renderVoice() }) : null;
  let voiceSession = null; // what you picked when asked on this visit, if you didn't make it stick
  const voiceWant = () => (settings.voice !== 'ask' ? settings.voice : voiceSession);
  async function applyVoice() {
    if (!voice || mode !== 'mp' || !myId) return;
    const w = voiceWant();
    if (w === 'open' || w === 'ptt') {
      const ok = await voice.enable(w);
      if (!ok && voice.error) feed(voice.error, 6);
    } else voice.disable();
    renderVoice();
  }
  function askVoice() {
    if (!voice || !SS.Voice.supported()) return;
    if (settings.voice !== 'ask' || voiceSession !== null) { applyVoice(); return; }
    $('vpRemember').checked = false;
    $('vpErr').textContent = '';
    show($('voicePrompt'), true);
  }
  function answerVoice(choice) {
    if ($('vpRemember').checked) { settings.voice = choice; voiceSession = null; } else voiceSession = choice;
    show($('voicePrompt'), false);
    Sfx.init();
    const ctx = voice && voice.audioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    applySettings(); // turns voice on or off when the answer was kept as the setting
    if (settings.voice === 'ask') applyVoice();
  }
  // the little box on the left: who has voice on, who's talking, click a name to mute them
  function renderVoice() {
    const box = $('voiceBox');
    if (!voice || mode !== 'mp' || !myId) { show(box, false); return; }
    const others = [...voice.others.entries()].filter(([, o]) => o.voice);
    show(box, voice.on || others.length > 0);
    $('vbMode').textContent = voice.on ? (voice.mode === 'ptt' ? 'VOICE · HOLD V TO TALK' : 'VOICE · OPEN MIC') : 'VOICE IS OFF · TURN IT ON IN SETTINGS';
    box.classList.toggle('on', voice.on);
    box.classList.toggle('talking', voice.talking);
    show($('vbMute'), voice.on);
    $('vbMute').textContent = voice.selfMuted ? 'UNMUTE ME' : 'MUTE ME';
    show($('vbTalk'), voice.on && voice.mode === 'ptt' && coarse);
    const rows = [];
    if (voice.on) rows.push(`<div class="vb-row me" data-me="1"><i class="lv"></i><span class="nm">${esc(playerName)} (you)</span><span class="st">${voice.selfMuted ? 'muted' : voice.talking ? 'talking' : voice.mode === 'ptt' ? 'hold V' : ''}</span></div>`);
    for (const [id, o] of others) {
      const muted = voice.isMuted(id), conn = voice.connected(id);
      rows.push(`<button type="button" class="vb-row${muted ? ' muted' : ''}" data-id="${id}" title="${muted ? 'Unmute' : 'Mute'} ${esc(o.name)}"><i class="lv"></i><span class="nm">${esc(o.name)}</span><span class="st">${muted ? 'muted' : !voice.on ? '' : conn ? '' : 'connecting'}</span></button>`);
    }
    $('vbList').innerHTML = rows.join('');
  }
  let voiceLvT = 0, voiceRenderT = 0;
  function updateVoiceLevels(dt) {
    if (!voice || !voice.on || mode !== 'mp') return;
    voiceLvT -= dt;
    if (voiceLvT > 0) return;
    voiceLvT = 0.08;
    voiceRenderT -= 0.08;
    if (voiceRenderT <= 0) { voiceRenderT = 1; renderVoice(); } // connection states change quietly
    const lv = voice.levels();
    for (const el of $('vbList').children) {
      const id = el.dataset.me ? voice.myId : +el.dataset.id;
      const v = lv.get(id) || 0;
      el.style.setProperty('--lv', v.toFixed(2));
      el.classList.toggle('speaking', v > 0.12);
    }
  }

  function addRemote(p) {
    if (p.id === myId || remotes.has(p.id)) return;
    const tag = document.createElement('div');
    tag.className = 'tagEl';
    tag.textContent = p.name;
    tag.style.setProperty('--c', SS.PALETTE[p.color % 10].css);
    tag.style.display = 'none';
    ui.tags.appendChild(tag);
    remotes.set(p.id, { id: p.id, name: p.name, color: p.color, look: p.look || null, buf: [], tag, st: null });
    trails.set(p.id, new Trail());
  }

  function onPhase(m) {
    serverPhase = m.phase;
    phaseEnds = performance.now() + (m.ends || 0);
    racers = new Set(m.racers || []);
    if (m.seed !== undefined && m.phase !== 'idle') {
      const fresh = !world || world.seed !== (m.seed >>> 0) || world.mapId !== (m.map || 'night');
      useWorld(m.seed, m.map || 'night');
      if (fresh && m.phase === 'countdown') showIntro(3.4);
    }
    const amRacer = racers.has(myId);
    ai.on = false;
    if (m.phase === 'countdown') {
      show(ui.results, false);
      if (amRacer) {
        resetRider();
        phase = 'countdown';
        Sfx.beep(false);
      } else phase = 'waiting';
    } else if (m.phase === 'racing') {
      if (amRacer && (phase === 'countdown' || phase === 'attract' || phase === 'waiting')) {
        if (phase !== 'countdown') resetRider();
        go();
      } else if (!amRacer || phase !== 'riding') {
        phase = 'spectate';
      }
    } else if (m.phase === 'results') {
      if (phase === 'riding' && !P.finished) bank();
      phase = 'results';
      showMpResults(m.results || []);
    }
    show(ui.hud, m.phase !== 'results');
    show(ui.menuBtn, true);
    if (touchMode) show(ui.touch, m.phase !== 'results');
  }

  function interpRemote(r, now) {
    const b = r.buf;
    if (!b.length) { r.st = null; return; }
    const t = now - 140;
    let a = b[0], c = b[b.length - 1];
    for (let i = 0; i < b.length; i++) {
      if (b[i].t <= t) a = b[i];
      else { c = b[i]; break; }
    }
    if (a.t > t) c = a;
    const k = c.t > a.t ? clamp((t - a.t) / (c.t - a.t), 0, 1) : 1;
    const A = a.d, B = c.d;
    const flags = B[8] | 0;
    const st = r.st || (r.st = {});
    st.x = lerp(A[0], B[0], k); st.y = lerp(A[1], B[1], k); st.z = lerp(A[2], B[2], k);
    st.heading = lerpAngle(A[3], B[3], k);
    const wasBail = st.bail;
    st.bail = !!(flags & 4);
    if (st.bail) {
      st.tumble = lerp(A[4], B[4], k); st.tumbleRoll = lerp(A[5], B[5], k); st.spin = 0; st.flip = 0;
      if (!wasBail) st.bailStart = time;
      st.bailAge = time - st.bailStart;
      st.bailUp = clamp((st.bailAge - (BAIL_T - GETUP_T)) / GETUP_T, 0, 1);
      const bdt = Math.max(0.03, (c.t - a.t) / 1000 || 0.08);
      st.bailK = clamp((Math.abs(B[4] - A[4]) + Math.abs(B[5] - A[5])) / bdt / 6, 0, 1);
    }
    else { st.spin = lerpAngle(A[4], B[4], k); st.flip = lerpAngle(A[5], B[5], k); }
    st.stance = 0;
    st.lean = lerp(A[6], B[6], k);
    st.crouch = lerp(A[7], B[7], k);
    st.grounded = !!(flags & 1);
    st.air = !st.grounded;
    // other riders in the halfpipe lean onto the walls too
    st.wallRoll = 0;
    if (world.pipeArr && st.grounded && !st.bail && world.sample(world.pipeArr, st.z) > 0.9) {
      const off = st.x - world.center(st.z);
      if (Math.abs(off) < SS.PIPE.LIP) st.wallRoll = Math.sign(off) * SS.PIPE.at(SS.PIPE.arc(off)).ang;
    }
    st.grab = !!(flags & 2);
    st.fin = !!(flags & 8);
    st.slide = flags & 32 ? 1 : 0;
    st.tuck = !!(flags & 64);
    st.surf = flags & 16 ? 2 : 0;
    st.grabType = (flags >> 7) & 7;
    st.grabK = lerp(st.grabK || 0, st.grab ? 1 : 0, 0.25);
    st.airT = st.air ? (st.airT || 0) + 1 / 60 : 0;
    st.score = B[9];
    st.dist = B[10];
    const dt = (c.t - a.t) / 1000 || 0.08;
    st.vx = (B[0] - A[0]) / dt; st.vz = (B[2] - A[2]) / dt;
    st.spinV = st.air && !st.bail ? clamp(wrap(B[4] - A[4]) / dt / SPIN_RATE, -1, 1) : 0;
    st.flipV = st.air && !st.bail ? clamp(wrap(B[5] - A[5]) / dt / FLIP_RATE, -1, 1) : 0;
    st.speed = Math.hypot(st.vx, st.vz);
    st.t = time;
    if (now - c.t > 3000) r.st = null;
  }

  function sendState() {
    const bailing = P.bailT > 0;
    const flags = (P.grounded ? 1 : 0) | (grabbing() && !P.grounded ? 2 : 0) | (bailing ? 4 : 0) | (P.finished ? 8 : 0) | (P.surf === 2 ? 16 : 0) | ((P.grabType & 7) << 7) |
      (P.slide > 0.3 ? 32 : 0) | (tuckInput() && P.grounded ? 64 : 0);
    net.send({
      t: 's',
      d: [
        +P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2), +P.heading.toFixed(3),
        +(bailing ? P.tumble : P.spin + P.stance + P.yawOff).toFixed(3), +(bailing ? P.tumbleRoll : P.flip).toFixed(3),
        +P.lean.toFixed(2), +(P.crouch + P.comp * 0.6).toFixed(2), flags, Math.round(run.score + run.pot), Math.round(Math.max(0, P.z)),
      ],
    });
  }

  function spectateTarget() {
    const list = [...remotes.values()].filter((r) => r.st);
    if (!list.length) return null;
    let r = remotes.get(specId);
    if (!r || !r.st) {
      list.sort((a, b) => (a.st.fin - b.st.fin) || (b.st.z - a.st.z));
      r = list[0];
      specId = r.id;
    }
    return r;
  }

  function cycleSpectate(d) {
    const list = [...remotes.values()].filter((r) => r.st).sort((a, b) => a.id - b.id);
    if (!list.length) return;
    const i = list.findIndex((r) => r.id === specId);
    specId = list[(i + d + list.length) % list.length].id;
    cam.snap = true;
  }

  const feedEls = [];
  function feed(text, color) {
    const d = document.createElement('div');
    d.textContent = text;
    if (color !== undefined) d.style.borderLeft = '4px solid ' + SS.PALETTE[color % 10].css;
    ui.feed.appendChild(d);
    feedEls.push({ d, t: time });
    if (feedEls.length > 5) feedEls.shift().d.remove();
  }

  let standingsT = 0;
  function updateStandings() {
    if (mode !== 'mp') return;
    const rows = [];
    if (racers.has(myId)) rows.push({ me: true, name: playerName, color: myColor, dist: Math.max(0, P.z), fin: P.finished, score: run.score + run.pot });
    for (const r of remotes.values()) if (racers.has(r.id) && r.st) rows.push({ me: false, name: r.name, color: r.color, dist: r.st.dist, fin: r.st.fin, score: r.st.score });
    rows.sort((a, b) => (b.fin - a.fin) || (b.dist - a.dist));
    ui.standings.innerHTML = rows.slice(0, 10).map((r, i) =>
      `<div class="row${r.me ? ' me' : ''}"><span class="pos">${i + 1}</span><span class="dot" style="background:${SS.PALETTE[r.color % 10].css}"></span><span class="nm">${esc(r.name)}</span><span class="v">${r.fin ? '✔ ' + fmt(r.score) : fmt(r.dist) + ' m'}</span></div>`
    ).join('') || '<div class="row"><span class="nm">Waiting for riders…</span></div>';
  }

  // ------------------------------------------------------------------ flow
  function go() {
    phase = 'riding';
    raceT = 0;
    ai.on = false;
    P.speed = Math.max(P.speed, 9);
    ghostRec = [];
    setBig('GO!', '', 1.0);
    Sfx.beep(true);
    Sfx.init();
  }

  // a cup: its mountain and its course (the same seed for everyone)
  let cupRun = null;
  function startCup(c) {
    cupRun = c;
    lastSpSeed = c.seed;
    previewLock = false;
    startSingle(true, c.map);
    setTimeout(() => feed(c.name + ': your best score counts'), 1800);
  }

  function startSingle(sameMountain, mapId) {
    if (mapId) { spMap = mapId; settings.map = mapId; store.set(SET_KEY, settings); }
    const reuse = !sameMountain && mode === 'menu' && world && world.mapId === spMap ? world.seed : null;
    Sfx.init();
    mode = 'sp';
    paused = false;
    ai.on = false;
    phase = 'countdown';
    countdownT = 99;
    hideOverlays();
    showLoading('PREPARING THE MOUNTAIN');
    setTimeout(() => {
      const seed = sameMountain && lastSpSeed !== null ? lastSpSeed : reuse !== null ? reuse : (Math.random() * 2147483647) | 0;
      lastSpSeed = seed;
      useWorld(seed, spMap);
      resetRider();
      show(ui.loading, false);
      phase = 'countdown';
      countdownT = 4.6;
      showIntro(1.5);
      myColor = settings.outfit | 0;
      show(ui.hud, true);
      show(ui.menuBtn, true);
      show(ui.standings, false);
      show(ui.mpbar, false);
      if (touchMode) show(ui.touch, true);
      if (bestGhost && bestGhost.seed === world.seed && bestGhost.map === world.mapId) feed('Racing your best run on this course');
    }, 30);
  }

  function finish() {
    P.finished = true;
    bank();
    run.finalTime = raceT;
    if (rivals.length) run.place = 1 + rivals.filter((r) => r.fin && r.fin < raceT).length;
    run.bonus = Math.max(0, Math.round((TARGET_TIME * (C.LENGTH / 2600) - raceT) * 20));
    run.score += run.bonus;
    finishedAt = time;
    fireworksT = 3.2;
    fireworksNext = 0;
    setTrick('', '', false, 0);
    ui.landTag.classList.remove('show');
    Sfx.finish();
    const PLACES = ['', '1ST PLACE!', '2ND PLACE', '3RD PLACE', '4TH PLACE'];
    if (rivals.length) setBig(PLACES[run.place] || 'FINISH!', fmtTime(raceT) + (run.place === 1 ? '   YOU WON THE RACE' : ''), 3.2);
    else setBig('FINISH!', fmtTime(raceT) + (run.bonus ? '   +' + fmt(run.bonus) + ' TIME BONUS' : ''), 3);
    if (mode === 'sp' && (!bestGhost || bestGhost.seed !== world.seed || bestGhost.map !== world.mapId || run.score > bestGhost.score)) {
      bestGhost = { seed: world.seed, map: world.mapId, score: run.score, frames: ghostRec };
    }
    if (mode === 'mp') net.send({ t: 'fin', score: Math.round(run.score), time: Math.round(raceT * 1000), dist: C.LENGTH });
  }

  function showSpResults() {
    phase = 'results';
    const map = world.map, pr = prog(map.id);
    // a cup run: the cup's mountain and course, ridden from the cups screen
    const isCup = !!(cupRun && world.mapId === cupRun.map && world.seed === cupRun.seed);
    const mapBest = run.score > pr.best;
    if (mapBest) pr.best = Math.round(run.score);
    const got = map.goals.map((g) => goalMet(g, true));
    const wasStar = pr.stars.slice();
    pr.stars = pr.stars.map((v, i) => v || got[i]);
    store.set(PROG_KEY, progress);
    updateStars();
    const newBest = run.score > best;
    if (newBest) { best = Math.round(run.score); store.set(BEST_KEY, best); ui.bestScore.textContent = fmt(best); }
    accountChanged();
    const placeTxt = rivals.length ? ['', '1ST PLACE', '2ND PLACE', '3RD PLACE', '4TH PLACE'][run.place] || 'RUN COMPLETE' : 'RUN COMPLETE';
    ui.resTitle.innerHTML = `${placeTxt}<small>${esc(map.name)} &middot; ${sentence(map.time).toLowerCase()}</small>`;
    ui.results.style.setProperty('--acc', map.accent);
    const pt = run.parts || {};
    const rows = [
      ['Tricks &amp; airtime', '', pt.air],
      ['Grabs &amp; style', '', pt.grab],
      ['Rails &amp; boxes', '', pt.rail],
      ['Stomped landings', `${run.perfects} perfect landing${run.perfects === 1 ? '' : 's'}`, pt.land],
      ['Snowflakes', `${run.tokens} of ${world.tokens.length} collected`, pt.flakes],
    ];
    if (run.bonus) rows.push(['Time bonus', 'for a fast run', run.bonus]);
    const goals = map.goals.map((g, i) => `<span class="${got[i] ? 'on' : pr.stars[i] ? 'on' : ''}${got[i] && !wasStar[i] ? ' new' : ''}">${esc(g.t)}</span>`).join('');
    const bt = run.bestTrick && run.bestTrick.name ? run.bestTrick : null;
    ui.resBody.innerHTML = `<div class="res-grid">
      <div class="res-total"><small class="kicker">TOTAL SCORE</small><div class="num">${fmt(run.score)}</div>
        <span class="pb${mapBest ? ' yes' : ''}">${mapBest ? '&#8599; NEW PERSONAL BEST' : 'BEST HERE ' + fmt(pr.best)}</span></div>
      <ul class="res-break">${rows.map(([n, sub, v]) => `<li><span>${n}${sub ? `<small>${sub}</small>` : ''}</span><b>+${fmt(Math.max(0, v || 0))}</b></li>`).join('')}</ul>
    </div>
    <div class="res-stats">
      <div><small class="kicker">RUN TIME</small><b>${fmtTime(run.finalTime)}</b></div>
      <div><small class="kicker">TOP SPEED</small><b>${Math.round(run.topSpeed * 3.6)}<em>KM/H</em></b></div>
      <div><small class="kicker">BIGGEST AIR</small><b>${run.bigAir.toFixed(1)}<em>S</em></b></div>
      <div><small class="kicker">TRICKS</small><b>${run.tricks}<em>${run.bails ? run.bails + ' BAIL' + (run.bails === 1 ? '' : 'S') : 'NO BAILS'}</em></b></div>
    </div>
    ${bt ? `<div class="res-best"><small class="kicker">BEST TRICK</small><span class="nm">${esc(bt.name)}</span><b>+${fmt(bt.pts)}</b></div>` : ''}
    <div class="res-goals">${goals}</div>
    <div id="resCoins" class="res-coins">${isCup ? `<b class="cup-tag">${esc(cupRun.name)}</b> ` : ''}<span class="dim">${SS.Shop && SS.Shop.signedIn ? 'Counting your coins…' : SS.Account && SS.Account.online ? 'Create an account to earn coins for your runs and spend them in the shop.' : ''}</span></div>`;
    reportRun(isCup);
    show(ui.hud, false);
    show(ui.menuBtn, false);
    show(ui.againBtn, true);
    show(ui.newBtn, true);
    show(ui.resMapsBtn, !oneMap);
    show(ui.touch, false);
    ui.resMenuBtn.textContent = 'LOBBY';
    ui.resNote.textContent = 'Same mountain rides this exact course again, against a ghost of your best run.';
    show(ui.results, true);
  }

  // coins for the run (and the cup leaderboard), filled in when the server answers
  async function reportRun(isCup) {
    if (!SS.Shop || !SS.Shop.signedIn) return;
    const r = await SS.Shop.reportRun({ map: world.mapId, score: Math.round(run.score), time: Math.round(run.finalTime), seed: world.seed, cup: isCup ? cupRun.kind : undefined });
    const el = $('resCoins');
    if (!el || phase !== 'results') return;
    const parts = [];
    if (isCup) parts.push(`<b class="cup-tag">${esc(cupRun.name)}</b>`);
    if (r.status === 200) {
      parts.push(`<b><i class="coin"></i>+${fmt(r.earned)}</b><span>coins</span>`);
      if (r.cup && r.cup.me) parts.push(`<span>Your best <b>${fmt(r.cup.me.best)}</b>, <b>#${r.cup.me.rank}</b> of ${r.cup.n}</span>`);
      parts.push(`<span class="dim">You have ${fmt(r.coins)}</span>`);
    } else parts.push(`<span class="dim">${esc(r.error || 'Couldn’t reach the server for your coins.')}</span>`);
    el.innerHTML = parts.join(' ');
  }

  function showMpResults(rows) {
    ui.resTitle.innerHTML = `ROUND RESULTS<small>${esc(world.map.name)}</small>`;
    ui.results.style.setProperty('--acc', world.map.accent);
    ui.resBody.innerHTML = rows.length
      ? `<table class="res-table rank">${rows.map((r, i) => `<tr class="${r.id === myId ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${SS.PALETTE[r.color % 10].css}"></span>${esc(r.name)}</td><td class="n">${r.fin ? fmtTime(r.time / 1000) : 'Didn\'t finish (' + fmt(r.dist) + ' m)'}</td><td class="n"><b>${fmt(r.score)}</b>${r.coins ? `<span class="res-coin"><i class="coin"></i>+${r.coins}</span>` : ''}</td></tr>`).join('')}</table>`
      : '<p class="small">Nobody finished this round.</p>';
    show(ui.againBtn, false);
    show(ui.newBtn, false);
    show(ui.resMapsBtn, false);
    ui.resMenuBtn.textContent = 'LEAVE SERVER';
    ui.resNote.textContent = '';
    show(ui.results, true);
  }

  // the loading screen, with a riding tip
  const TIPS = ['Load up SPACE on the way into a kicker, let go at the lip.', 'Land it flat and straight. Perfect landings keep your speed.',
    'SHIFT in the air grabs. Tap it again to switch grabs mid-air.', 'Same trick twice scores less. Mix it up.', 'Tricks fill boost. F burns it.',
    'On rails, tap A and D to stay on.', 'Grab the snowflakes on the way down.', 'Carry speed into the Traverse or you will be skating.',
    'Mia spins fastest. Dre is the quickest. Rio forgives a sketchy landing.', 'Come down sideways at speed and you catch an edge.'];
  function showLoading(txt) {
    ui.loadingText.textContent = txt;
    $('loadingTip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
    show(ui.loading, true);
  }

  function hideOverlays() {
    for (const el of [ui.title, ui.servers, ui.pauseMenu, ui.results, ui.nogl, ui.settings, ui.maps, $('auth'), $('store'), $('cups'), $('help')]) if (el) show(el, false);
    show(ui.mapIntro, false);
  }

  function toMenu() {
    if (mode === 'mp') leaveMp();
    paused = false;
    hideOverlays();
    show(ui.hud, false);
    show(ui.menuBtn, false);
    show(ui.touch, false);
    show(ui.loading, false);
    setPage('ride');
    show(ui.title, true);
    Sfx.silence();
    previewLock = false;
    if (!world) useWorld(20261117, spMap);
    startAttract();
  }

  // ------------------------------------------------------------------ map select
  function mapArt(m) {
    const W = 300, H = 150;
    const peaks = (col, cap, y, seed, n) => {
      let d = `M0 ${H}`, cd = '';
      const r = SS.rng(seed);
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * W, px = x + (r() - 0.5) * 20, py = y - 18 - r() * 34;
        d += ` L${(x - W / n / 2).toFixed(0)} ${y} L${px.toFixed(0)} ${py.toFixed(0)}`;
        cd += `<path d="M${(px - 12).toFixed(0)} ${(py + 12).toFixed(0)} L${px.toFixed(0)} ${py.toFixed(0)} L${(px + 12).toFixed(0)} ${(py + 12).toFixed(0)} L${(px + 4).toFixed(0)} ${(py + 9).toFixed(0)} L${(px - 3).toFixed(0)} ${(py + 13).toFixed(0)}Z" fill="${cap}"/>`;
      }
      return `<path d="${d} L${W} ${y} L${W} ${H}Z" fill="${col}"/>` + cd;
    };
    const pine = (x, y, s, col, snow) => `<path d="M${x} ${y - 30 * s} L${x + 9 * s} ${y - 12 * s} L${x + 5 * s} ${y - 12 * s} L${x + 12 * s} ${y} L${x - 12 * s} ${y} L${x - 5 * s} ${y - 12 * s} L${x - 9 * s} ${y - 12 * s}Z" fill="${col}"/>` +
      (snow ? `<path d="M${x} ${y - 30 * s} L${x + 5 * s} ${y - 22 * s} L${x - 5 * s} ${y - 22 * s}Z" fill="${snow}"/>` : '');
    const slope = (col, shade) => `<path d="M0 ${H} L0 118 Q150 92 300 104 L300 ${H}Z" fill="${col}"/><path d="M120 ${H} Q150 110 170 98 L200 99 Q185 120 200 ${H}Z" fill="${shade}"/>`;
    const r = SS.rng(m.id.length * 97);
    const dots = (n, col, y1) => { let o = ''; for (let i = 0; i < n; i++) o += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * y1).toFixed(0)}" r="${(0.5 + r() * 1.1).toFixed(1)}" fill="${col}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`; return o; };
    const grad = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    let body = '';
    const gid = 'g' + m.id;
    if (m.id === 'night') {
      body = `<defs>${grad(gid, [[0, '#040918'], [0.6, '#10265a'], [1, '#22417a']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>${dots(40, '#fff', 80)}
        <path d="M-10 46 Q60 20 130 40 T300 30" stroke="#4dffa6" stroke-width="10" fill="none" opacity="0.35"/><path d="M20 58 Q90 36 170 52 T320 44" stroke="#9a6bff" stroke-width="6" fill="none" opacity="0.25"/>
        <circle cx="250" cy="28" r="9" fill="#e6ecff"/>${peaks('#16244a', '#9fb2d8', 104, 3, 6)}${slope('#cdd9f2', '#a9bbe0')}
        ${[40, 92, 232, 276].map((x, i) => `<rect x="${x}" y="${78 + i * 3}" width="2.5" height="36" fill="#222"/><circle cx="${x + 1}" cy="${78 + i * 3}" r="9" fill="#ffd27a" opacity="0.35"/><circle cx="${x + 1}" cy="${78 + i * 3}" r="3.5" fill="#fff4cc"/>`).join('')}`;
    } else if (m.id === 'bluebird') {
      body = `<defs>${grad(gid, [[0, '#1556c9'], [0.65, '#5ea3f2'], [1, '#cfe6ff']])}<radialGradient id="s${gid}"><stop offset="0" stop-color="#fffbe6"/><stop offset="0.25" stop-color="#fff2b0" stop-opacity="0.9"/><stop offset="1" stop-color="#fff2b0" stop-opacity="0"/></radialGradient></defs>
        <rect width="${W}" height="${H}" fill="url(#${gid})"/><circle cx="70" cy="36" r="40" fill="url(#s${gid})"/>
        <g fill="#fff" opacity="0.95"><ellipse cx="200" cy="34" rx="34" ry="10"/><ellipse cx="224" cy="28" rx="20" ry="11"/><ellipse cx="128" cy="58" rx="22" ry="6"/></g>
        ${peaks('#6f8fc4', '#ffffff', 106, 11, 5)}${slope('#ffffff', '#d6e5ff')}${pine(26, 124, 1, '#1f6b45', '#fff')}${pine(278, 118, 0.9, '#1f6b45', '#fff')}
        ${[90, 210, 250].map((x, i) => `<rect x="${x}" y="${96 - i}" width="2" height="22" fill="#ccc"/><path d="M${x + 2} ${96 - i} q8 3 8 12 l-8 2Z" fill="${['#ff4060', '#ffc21a', '#2a8cff'][i]}"/>`).join('')}`;
    } else if (m.id === 'sunset') {
      body = `<defs>${grad(gid, [[0, '#2b2a6e'], [0.45, '#c8577a'], [0.75, '#ff9a52'], [1, '#ffd27a']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <circle cx="210" cy="96" r="30" fill="#ffe6a8" opacity="0.95"/><circle cx="210" cy="96" r="52" fill="#ffd27a" opacity="0.25"/>
        <g stroke="#ffcf9c" stroke-width="3" opacity="0.5"><line x1="150" y1="40" x2="270" y2="40"/><line x1="120" y1="56" x2="230" y2="56"/></g>
        ${peaks('#5a2f62', '#ffb9a0', 110, 21, 6)}${slope('#ffe3d6', '#d9a7b8')}
        <path d="M60 128 L160 112" stroke="#9a5a8a" stroke-width="5" opacity="0.5"/>${pine(48, 128, 1, '#3a1d3e', '#ffd9c8')}${pine(78, 122, 0.7, '#3a1d3e', '#ffd9c8')}`;
    } else if (m.id === 'woods') {
      let trees = '';
      for (let i = 0; i < 16; i++) trees += pine((i * 21 + r() * 8) | 0, 96 + ((r() * 10) | 0), 0.9 + r() * 0.5, '#0b1a2c', '#d6e2ff');
      let front = '';
      for (const x of [10, 44, 254, 290]) front += pine(x, 150, 1.6, '#06101e', '#e8efff');
      body = `<defs>${grad(gid, [[0, '#03071a'], [0.7, '#0e1d48'], [1, '#1b2f66']])}<radialGradient id="m${gid}"><stop offset="0.3" stop-color="#dfe8ff" stop-opacity="0.5"/><stop offset="1" stop-color="#dfe8ff" stop-opacity="0"/></radialGradient></defs>
        <rect width="${W}" height="${H}" fill="url(#${gid})"/>${dots(30, '#fff', 70)}<circle cx="200" cy="40" r="46" fill="url(#m${gid})"/><circle cx="200" cy="40" r="17" fill="#eef3ff"/><circle cx="194" cy="36" r="4" fill="#cfd8ee"/><circle cx="206" cy="46" r="3" fill="#cfd8ee"/>
        ${trees}${slope('#b8c8ee', '#8ea3d4')}${front}${dots(40, '#fff', 150)}`;
    } else if (m.id === 'railking') {
      // long rails and a rainbow rail on a sunny slope
      body = `<defs>${grad(gid, [[0, '#1a63d8'], [0.6, '#7cb6f2'], [1, '#e8f3ff']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <circle cx="250" cy="30" r="16" fill="#fff6c8"/><g fill="#fff" opacity="0.95"><ellipse cx="80" cy="26" rx="30" ry="8"/></g>
        ${peaks('#6f8fc4', '#ffffff', 92, 61, 6)}${slope('#ffffff', '#dbe8fb')}
        <path d="M20 128 L150 96" stroke="#c9d3e3" stroke-width="5" stroke-linecap="round"/><path d="M20 128 L150 96" stroke="#5f6b80" stroke-width="2"/>
        <path d="M150 118 Q205 70 262 104" stroke="#c9d3e3" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M150 118 Q205 70 262 104" stroke="#5f6b80" stroke-width="2" fill="none"/>
        ${[40, 80, 120].map((x) => `<rect x="${x}" y="${123 - (x - 20) * 0.25}" width="2.5" height="${8 + (x - 20) * 0.1}" fill="#333"/>`).join('')}
        <path d="M60 140 L240 120 L240 128 L60 148Z" fill="#ffb21f" stroke="#10204a" stroke-width="1.5"/>`;
    } else if (m.id === 'triple') {
      // side view: three giant kickers stepping down the hill into a golden sunset
      const ys = (x) => 70 + x * 0.26;
      let k = '';
      [46, 142, 238].forEach((x) => {
        const h = 16;
        k += `<path d="M${x - 34} ${ys(x - 34)} Q${x - 8} ${ys(x - 8)} ${x} ${ys(x) - h} L${x + 16} ${ys(x + 16) - h} L${x + 22} ${ys(x + 22) - h + 2} Q${x + 34} ${ys(x + 40) - 4} ${x + 52} ${ys(x + 52)}Z" fill="#fff4ec" stroke="#c4786a" stroke-width="1"/><path d="M${x} ${ys(x) - h} L${x + 16} ${ys(x + 16) - h}" stroke="#ff7a2e" stroke-width="3" stroke-linecap="round"/>`;
      });
      body = `<defs>${grad(gid, [[0, '#3a3c7a'], [0.45, '#d0688a'], [0.75, '#ffa45a'], [1, '#ffe08a']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <circle cx="246" cy="44" r="22" fill="#ffe6a8"/>${peaks('#5a2f62', '#ffb9a0', 80, 71, 6)}
        <path d="M0 ${H} L0 ${ys(0)} L300 ${ys(300)} L300 ${H}Z" fill="#e9a58f"/>${k}
        <path d="M62 ${ys(62) - 18} Q100 10 150 ${ys(150) - 30}" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 4" fill="none" opacity="0.85"/>
        <g transform="translate(102 34) rotate(25)"><rect x="-12" y="6" width="24" height="5" rx="2.5" fill="#2f7dff"/><rect x="-5" y="-11" width="10" height="15" rx="4" fill="#ff6d17"/><circle cx="0" cy="-14" r="5" fill="#1c1d22"/></g>`;
    } else if (m.id === 'slopestyle') {
      // competition course: rails up top, three jumps, grandstands and gold
      body = `<defs>${grad(gid, [[0, '#1c55c4'], [0.55, '#6fb0f2'], [1, '#f5f9ff']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        ${peaks('#7d97c8', '#ffffff', 80, 81, 6)}
        <path d="M0 ${H} L0 86 L300 96 L300 ${H}Z" fill="#ffffff"/>
        ${[60, 150, 240].map((x) => `<path d="M${x - 26} 128 L${x} 108 L${x + 14} 108 L${x + 36} 128Z" fill="#e6eefb"/><path d="M${x} 108 L${x + 14} 108" stroke="#2f7dff" stroke-width="3"/>`).join('')}
        ${[40, 140, 240].map((x) => `<path d="M${x} 96 L${x + 40} 92" stroke="#5f6b80" stroke-width="3"/>`).join('')}
        <g>${Array.from({ length: 40 }, (_, i) => `<rect x="${4 + (i % 20) * 4}" y="${132 + ((i / 20) | 0) * 7}" width="3" height="5" fill="${['#ff4060', '#2f7dff', '#ffc21a', '#2fbf71', '#fff'][i % 5]}"/>`).join('')}</g>
        <g>${Array.from({ length: 40 }, (_, i) => `<rect x="${216 + (i % 20) * 4}" y="${132 + ((i / 20) | 0) * 7}" width="3" height="5" fill="${['#ffc21a', '#fff', '#ff4060', '#2f7dff', '#2fbf71'][i % 5]}"/>`).join('')}</g>
        <path d="M136 0 L146 28 L152 26 L144 0Z" fill="#2f7dff"/><path d="M164 0 L154 28 L148 26 L156 0Z" fill="#ff4060"/><circle cx="150" cy="42" r="15" fill="#ffd23f" stroke="#b07a00" stroke-width="3"/><path d="M150 34 L152.5 39.5 L158 40 L154 44 L155 50 L150 47 L145 50 L146 44 L142 40 L147.5 39.5Z" fill="#fff3b0"/>`;
    } else if (m.id === 'jumpline') {
      // side view: floodlit kickers lined up down the slope, a rider flying between them
      const ys = (x) => 84 + x * 0.22;
      let k = '';
      [44, 118, 192, 266].forEach((x, i) => {
        const h = 7 + i * 1.5;
        k += `<path d="M${x - 26} ${ys(x - 26)} Q${x - 6} ${ys(x - 6)} ${x} ${ys(x) - h} L${x + 10} ${ys(x + 10) - h} Q${x + 18} ${ys(x + 18) - h} ${x + 34} ${ys(x + 34)}Z" fill="#e3ebfa"/><path d="M${x} ${ys(x) - h} L${x + 10} ${ys(x + 10) - h}" stroke="#4fa8ff" stroke-width="2.5" stroke-linecap="round"/>`;
      });
      body = `<defs>${grad(gid, [[0, '#040a1c'], [0.6, '#123064'], [1, '#2a4f8a']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>${dots(30, '#fff', 60)}
        <path d="M-10 34 Q80 14 160 30 T320 20" stroke="#4dffa6" stroke-width="8" fill="none" opacity="0.3"/>
        ${peaks('#16244a', '#9fb2d8', 70, 91, 6)}
        <path d="M0 ${H} L0 ${ys(0)} L300 ${ys(300)} L300 ${H}Z" fill="#c7d4ef"/>${k}
        <path d="M128 ${ys(128) - 10} Q160 40 196 ${ys(196) - 22}" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 4" fill="none" opacity="0.8"/>
        <g transform="translate(160 56) rotate(-20)"><rect x="-11" y="5" width="22" height="4.5" rx="2.2" fill="#ffc21a"/><rect x="-4.5" y="-10" width="9" height="14" rx="4" fill="#2fbf71"/><circle cx="0" cy="-13" r="4.5" fill="#1c1d22"/></g>
        ${[[20, 66], [236, 58]].map(([x, y]) => `<rect x="${x}" y="${y}" width="2.5" height="${ys(x) - y}" fill="#222"/><circle cx="${x + 1}" cy="${y}" r="11" fill="#ffd27a" opacity="0.35"/><circle cx="${x + 1}" cy="${y}" r="3.5" fill="#fff4cc"/>`).join('')}`;
    } else if (m.id === 'cliffs') {
      // a rock band in a snowstorm with pillows below
      let snow = '';
      for (let i = 0; i < 60; i++) snow += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(0.6 + r()).toFixed(1)}" fill="#fff" opacity="0.8"/>`;
      body = `<defs>${grad(gid, [[0, '#8d97a8'], [0.6, '#c4cad4'], [1, '#eef1f5']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        ${peaks('#a3acbb', '#eef1f5', 70, 101, 5)}
        <path d="M0 80 L300 70 L300 84 L0 96Z" fill="#f4f6fa"/>
        <path d="M0 96 L300 84 L300 104 L210 110 L150 106 L80 112 L0 108Z" fill="#4c5260"/><path d="M40 98 L60 108 M120 94 L130 106 M200 90 L216 104 M260 88 L270 100" stroke="#353a45" stroke-width="2"/>
        <path d="M0 108 L80 112 L150 106 L210 110 L300 104 L300 ${H} L0 ${H}Z" fill="#ffffff"/>
        ${[50, 110, 180, 245].map((x, i) => `<ellipse cx="${x}" cy="${128 + (i % 2) * 8}" rx="18" ry="7" fill="#e4e9f2"/>`).join('')}
        ${pine(16, 90, 0.8, '#3b5446', '#fff')}${pine(284, 82, 0.9, '#3b5446', '#fff')}${snow}`;
    } else if (m.id === 'neon') {
      // glowing boxes and rails under pink and cyan lights
      body = `<defs>${grad(gid, [[0, '#0a0420'], [0.55, '#3b0f5c'], [1, '#6a1a86']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>${dots(25, '#fff', 60)}
        ${peaks('#1a0d33', '#5a3d8a', 86, 111, 6)}<path d="M0 ${H} L0 96 Q150 80 300 96 L300 ${H}Z" fill="#d9ccf2"/>
        ${[[30, '#ff3fbf'], [270, '#38e8ff']].map(([x, c]) => `<rect x="${x}" y="50" width="2.5" height="50" fill="#222"/><circle cx="${x + 1}" cy="50" r="16" fill="${c}" opacity="0.35"/><circle cx="${x + 1}" cy="50" r="4" fill="#fff"/>`).join('')}
        <path d="M60 128 L150 108 L150 116 L60 136Z" fill="#ff3fbf"/><path d="M60 128 L150 108" stroke="#ffd0f2" stroke-width="2"/>
        <path d="M170 120 Q215 86 262 116" stroke="#38e8ff" stroke-width="4" fill="none"/><path d="M180 104 L180 120 M244 104 L244 118" stroke="#333" stroke-width="2"/>
        <path d="M100 100 L120 92 L132 92 L146 100Z" fill="#b48cff"/>`;
    } else if (m.id === 'bigairfinal') {
      // city big air: scaffold tower, one huge kicker, stadium lights and a skyline
      let city = '';
      for (let i = 0; i < 16; i++) {
        const x = i * 20 - 6, h = 20 + r() * 50;
        city += `<rect x="${x}" y="${92 - h}" width="17" height="${h}" fill="#0b0d18"/>`;
        for (let y = 96 - h; y < 88; y += 7) if (r() < 0.6) city += `<rect x="${x + 2}" y="${y}" width="${4 + r() * 10}" height="2" fill="${r() < 0.3 ? '#9fd0ff' : '#ffd27a'}" opacity="0.85"/>`;
      }
      body = `<defs>${grad(gid, [[0, '#05070f'], [0.6, '#1a1838'], [1, '#46305a']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>${dots(25, '#fff', 55)}${city}
        <path d="M0 ${H} L0 120 Q150 100 300 116 L300 ${H}Z" fill="#c7d0ea"/>
        <path d="M14 30 L70 30 L150 104 L100 104Z" fill="#dfe6f6"/><path d="M14 30 L70 30" stroke="#ff7a2e" stroke-width="2"/>
        ${[22, 36, 50, 64, 78, 92].map((x) => `<path d="M${x} ${30 + (x - 14) * 0.9} L${x} 120" stroke="#8792ad" stroke-width="1.4"/>`).join('')}
        <path d="M24 44 L60 80 M40 44 L76 96 M24 64 L56 100" stroke="#8792ad" stroke-width="0.9"/>
        <path d="M150 104 L168 90 L190 90 L176 110Z" fill="#eef2fb"/><path d="M168 90 L190 90" stroke="#4fa8ff" stroke-width="2.5"/>
        <path d="M190 112 Q250 100 300 140 L300 ${H} L200 ${H}Z" fill="#eef2fb"/>
        <g transform="translate(222 48) rotate(-35)"><rect x="-11" y="5" width="22" height="4.5" rx="2.2" fill="#ffc21a"/><rect x="-4.5" y="-10" width="9" height="14" rx="4" fill="#2fbf71"/><circle cx="0" cy="-13" r="4.5" fill="#1c1d22"/></g>
        ${[[118, 12], [282, 20]].map(([x, y]) => `<rect x="${x}" y="${y}" width="3" height="${120 - y}" fill="#222"/><rect x="${x - 7}" y="${y - 5}" width="17" height="7" fill="#fff4cc"/><circle cx="${x + 1.5}" cy="${y}" r="20" fill="#ffd27a" opacity="0.18"/>`).join('')}
        <g>${Array.from({ length: 30 }, (_, i) => `<rect x="${206 + (i % 15) * 6}" y="${128 + ((i / 15) | 0) * 8}" width="4" height="6" fill="${['#ff4060', '#2f7dff', '#ffc21a', '#2fbf71', '#fff'][i % 5]}"/>`).join('')}</g>`;
    } else if (m.id === 'superpipe') {
      // looking down a floodlit halfpipe with a rider above the coping
      body = `<defs>${grad(gid, [[0, '#040a1c'], [0.6, '#123064'], [1, '#2a4f8a']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>${dots(30, '#fff', 55)}
        <path d="M-10 30 Q90 10 170 28 T320 18" stroke="#4dffa6" stroke-width="8" fill="none" opacity="0.3"/>
        ${peaks('#16244a', '#9fb2d8', 70, 121, 6)}
        <path d="M0 ${H} L0 70 L120 64 L180 64 L300 70 L300 ${H}Z" fill="#dfe7f8"/>
        <path d="M0 150 Q60 150 90 110 L136 66 L164 66 L210 110 Q240 150 300 150 L300 ${H} L0 ${H}Z" fill="#a9bde6"/>
        <path d="M30 ${H} Q100 ${H} 120 110 L144 72 L156 72 L180 110 Q200 ${H} 270 ${H}Z" fill="#eef3fd"/>
        <path d="M0 150 Q60 150 90 110 L136 66" stroke="#2f6dff" stroke-width="3" fill="none"/><path d="M300 150 Q240 150 210 110 L164 66" stroke="#2f6dff" stroke-width="3" fill="none"/>
        <g transform="translate(72 64) rotate(-150)"><rect x="-12" y="5" width="24" height="5" rx="2.5" fill="#ff4060"/><rect x="-5" y="-11" width="10" height="15" rx="4" fill="#ffc21a"/><circle cx="0" cy="-14" r="5" fill="#1c1d22"/></g>
        ${[[24, 34], [272, 34]].map(([x, y]) => `<rect x="${x}" y="${y}" width="2.5" height="${100 - y}" fill="#222"/><circle cx="${x + 1}" cy="${y}" r="12" fill="#ffd27a" opacity="0.35"/><circle cx="${x + 1}" cy="${y}" r="3.5" fill="#fff4cc"/>`).join('')}`;
    } else if (m.id === 'sbx') {
      // four riders racing into a banked turn
      const riders = [[118, 92, '#ff4060', -12], [150, 104, '#2fbf71', -8], [182, 98, '#2f7dff', -10], [140, 126, '#ffc21a', -6]];
      body = `<defs>${grad(gid, [[0, '#1c55c4'], [0.55, '#6fb0f2'], [1, '#f5f9ff']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <g fill="#fff" opacity="0.9"><ellipse cx="70" cy="22" rx="28" ry="7"/><ellipse cx="236" cy="30" rx="22" ry="6"/></g>
        ${peaks('#7d97c8', '#ffffff', 74, 131, 6)}
        <path d="M0 ${H} L0 86 Q150 70 300 84 L300 ${H}Z" fill="#ffffff"/>
        <path d="M40 ${H} Q60 110 150 92 Q260 70 300 96 L300 120 Q250 96 170 116 Q100 132 110 ${H}Z" fill="#e2ebfa"/>
        <path d="M300 96 Q260 70 150 92 Q60 110 40 ${H}" stroke="#ff4060" stroke-width="2" fill="none" stroke-dasharray="6 5"/>
        <path d="M300 120 Q250 96 170 116 Q100 132 110 ${H}" stroke="#2f7dff" stroke-width="2" fill="none" stroke-dasharray="6 5"/>
        ${riders.map(([x, y, c, rot]) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-9" y="4" width="18" height="3.6" rx="1.8" fill="#1c1d22"/><rect x="-3.6" y="-8" width="7.2" height="11" rx="3" fill="${c}"/><circle cx="0" cy="-10.5" r="3.6" fill="#1c1d22"/></g>`).join('')}
        ${pine(18, 96, 0.9, '#2f5a46', '#fff')}${pine(276, 88, 0.8, '#2f5a46', '#fff')}`;
    } else if (m.id === 'slopequal') {
      // golden-hour competition course: a kinked rail and a box up top, jumps below, crowd at the bottom
      body = `<defs>${grad(gid, [[0, '#2a2a66'], [0.45, '#c8577a'], [0.75, '#ff9a52'], [1, '#ffd27a']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <circle cx="60" cy="58" r="20" fill="#ffe6a8"/>${peaks('#5a2f62', '#ffb9a0', 82, 141, 6)}
        <path d="M0 ${H} L0 88 L300 96 L300 ${H}Z" fill="#ffe3d6"/>
        <path d="M40 104 L80 98 L104 104 L140 100" stroke="#5f6b80" stroke-width="3" fill="none"/><path d="M60 102 L60 110 M120 102 L120 110" stroke="#333" stroke-width="2"/>
        <path d="M168 104 L240 96 L240 102 L168 110Z" fill="#ff7a2e" stroke="#2a1b3a" stroke-width="1.2"/>
        ${[70, 150, 230].map((x) => `<path d="M${x - 26} 132 L${x} 114 L${x + 14} 114 L${x + 36} 132Z" fill="#fff4ec"/><path d="M${x} 114 L${x + 14} 114" stroke="#ffd23f" stroke-width="3"/>`).join('')}
        <g>${Array.from({ length: 40 }, (_, i) => `<rect x="${4 + (i % 20) * 4}" y="${136 + ((i / 20) | 0) * 7}" width="3" height="5" fill="${['#ff4060', '#2f7dff', '#ffc21a', '#2fbf71', '#fff'][i % 5]}"/>`).join('')}</g>
        <g>${Array.from({ length: 40 }, (_, i) => `<rect x="${216 + (i % 20) * 4}" y="${136 + ((i / 20) | 0) * 7}" width="3" height="5" fill="${['#ffc21a', '#fff', '#ff4060', '#2f7dff', '#2fbf71'][i % 5]}"/>`).join('')}</g>`;
    } else if (m.id === 'oly14') {
      // sunny Caucasus course: patchwork banners, rails up top, three kickers and the nesting doll
      const quilt = ['#ff2d87', '#2f7dff', '#ffc21a', '#2fbf71', '#9b4dff', '#ff7a1a'];
      body = `<defs>${grad(gid, [[0, '#1b5fd0'], [0.55, '#78b6f2'], [1, '#eef6ff']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <g fill="#fff" opacity="0.9"><ellipse cx="236" cy="26" rx="30" ry="8"/><ellipse cx="60" cy="40" rx="22" ry="6"/></g>
        ${peaks('#6d86b8', '#ffffff', 80, 151, 7)}
        <path d="M0 ${H} L0 86 L300 96 L300 ${H}Z" fill="#ffffff"/>
        <g>${Array.from({ length: 30 }, (_, i) => `<rect x="${i * 10}" y="${88 + i * 0.33}" width="10" height="4" fill="${quilt[i % 6]}"/>`).join('')}</g>
        <path d="M40 104 L76 112 M48 104 L48 113 M70 108 L70 115" stroke="#5f6b80" stroke-width="2.5"/>
        ${[[120, 1], [190, 1.15], [254, 1.3]].map(([x, k]) => `<path d="M${x - 24 * k} ${134} L${x} ${116 - 6 * k} L${x + 14 * k} ${116 - 6 * k} L${x + 34 * k} 134Z" fill="#e6eefb"/><path d="M${x} ${116 - 6 * k} L${x + 14 * k} ${116 - 6 * k}" stroke="#ff2d87" stroke-width="3"/>`).join('')}
        <g transform="translate(160 108)"><ellipse cx="0" cy="0" rx="13" ry="17" fill="#d81e18"/><circle cx="0" cy="-20" r="10" fill="#d81e18"/><ellipse cx="0" cy="-19" rx="6.5" ry="6" fill="#ffd8bd"/><path d="M-7 -24 Q0 -30 7 -24" stroke="#3a1a10" stroke-width="3" fill="none"/><ellipse cx="0" cy="3" rx="8" ry="10" fill="#ffc21a"/><circle cx="0" cy="3" r="4" fill="#2f7dff"/></g>`;
    } else if (m.id === 'oly18') {
      // cold blue day: a skate bowl, a wallride and skewed kickers between forested hills
      body = `<defs>${grad(gid, [[0, '#0b3fae'], [0.55, '#5c9cf0'], [1, '#eef5ff']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <path d="M0 78 Q40 58 90 70 Q140 50 190 66 Q240 52 300 70 L300 96 L0 96Z" fill="#3d4f62"/><path d="M0 78 Q40 58 90 70 Q140 50 190 66 Q240 52 300 70" stroke="#dfe8f5" stroke-width="3" fill="none"/>
        <path d="M0 ${H} L0 92 L300 100 L300 ${H}Z" fill="#ffffff"/>
        <ellipse cx="90" cy="118" rx="44" ry="13" fill="#c9d8f2"/><ellipse cx="90" cy="121" rx="34" ry="8" fill="#eef3fc"/><path d="M46 118 A44 13 0 0 1 134 118" stroke="#8a93a6" stroke-width="2.5" fill="none"/>
        <path d="M168 96 L168 120 L216 116 L216 92Z" fill="#f4f7fd" stroke="#10204a" stroke-width="1.5"/><path d="M168 96 L216 92" stroke="#2f7dff" stroke-width="3"/>
        ${[[244, -10], [274, 10]].map(([x, sk]) => `<path d="M${x - 22} 140 L${x - 2} ${120 + sk * 0.3} L${x + 10} ${118 - sk * 0.3} L${x + 26} 140Z" fill="#e6eefb"/><path d="M${x - 2} ${120 + sk * 0.3} L${x + 10} ${118 - sk * 0.3}" stroke="#2f7dff" stroke-width="3"/>`).join('')}
        ${pine(18, 100, 0.8, '#244a3a', '#fff')}${pine(150, 100, 0.7, '#244a3a', '#fff')}`;
    } else if (m.id === 'oly22') {
      // dry brown hills under a deep blue sky, the Great Wall and its watch tower beside the course
      let wall = '';
      for (let i = 0; i < 24; i++) wall += `<rect x="${12 + i * 7}" y="${70 + i * 1.5}" width="4" height="4" fill="#8f7f6c"/>`;
      body = `<defs>${grad(gid, [[0, '#0a2f9e'], [0.55, '#4f8de8'], [1, '#dfeafa']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <path d="M0 74 Q50 48 110 64 Q170 44 230 60 Q270 52 300 62 L300 100 L0 100Z" fill="#8a7462"/><path d="M60 56 L74 52 L84 58 M170 46 L184 44 L196 50" stroke="#eee" stroke-width="3" fill="none"/>
        <path d="M0 ${H} L0 86 L300 98 L300 ${H}Z" fill="#f7f9fd"/>
        <path d="M10 84 L180 112 L180 118 L10 90Z" fill="#a39079"/>${wall}
        <rect x="150" y="90" width="22" height="26" fill="#a39079"/><g fill="#8f7f6c">${[0, 1, 2, 3].map((k) => `<rect x="${150 + k * 6}" y="86" width="4" height="4"/>`).join('')}</g><path d="M157 116 L157 106 Q161 100 165 106 L165 116Z" fill="#3a2a22"/>
        <path d="M150 89 Q161 82 172 89" stroke="#c9ced8" stroke-width="2.5" fill="none"/>
        ${[[216, 1], [262, 1.2]].map(([x, k]) => `<path d="M${x - 22 * k} 140 L${x} ${120 - 5 * k} L${x + 14 * k} ${120 - 5 * k} L${x + 32 * k} 140Z" fill="#e6eefb"/><path d="M${x} ${120 - 5 * k} L${x + 14 * k} ${120 - 5 * k}" stroke="#6b5cff" stroke-width="3"/>`).join('')}`;
    } else if (m.id === 'oly26') {
      // snowy Alps, clean white modules and big kickers in falling snow
      let snow = '';
      for (let i = 0; i < 50; i++) snow += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(0.6 + r() * 0.9).toFixed(1)}" fill="#fff" opacity="0.85"/>`;
      body = `<defs>${grad(gid, [[0, '#6f7b8f'], [0.55, '#a9b6c8'], [1, '#f2f5f9'] ])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        ${peaks('#8a96aa', '#f4f6fa', 84, 171, 6)}
        <path d="M0 ${H} L0 92 L300 100 L300 ${H}Z" fill="#ffffff"/>
        <path d="M30 108 L110 102 L110 108 L30 114Z" fill="#e9edf3" stroke="#15c2b0" stroke-width="1.5"/>
        <path d="M128 100 L150 106 L170 106 L192 114" stroke="#5f6b80" stroke-width="3" fill="none"/>
        ${[[86, 1], [180, 1.25], [262, 1.3]].map(([x, k]) => `<path d="M${x - 26 * k} 144 L${x} ${124 - 4 * k} L${x + 16 * k} ${124 - 4 * k} L${x + 36 * k} 144Z" fill="#eef2f8"/><path d="M${x} ${124 - 4 * k} L${x + 16 * k} ${124 - 4 * k}" stroke="#15c2b0" stroke-width="3"/>`).join('')}
        ${pine(14, 104, 0.9, '#3b5446', '#fff')}${pine(290, 108, 0.85, '#3b5446', '#fff')}${snow}`;
    } else if (m.id === 'yog12') {
      // high Tyrolean peaks above the trees: a log slide on its legs, a stair set with a handrail, an orange box
      body = `<defs>${grad(gid, [[0, '#1556c9'], [0.55, '#6fa9ee'], [1, '#f4f8ff']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <g fill="#fff" opacity="0.9"><ellipse cx="226" cy="26" rx="30" ry="8"/><ellipse cx="80" cy="34" rx="22" ry="6"/></g>
        <path d="M0 96 L40 46 L62 64 L96 30 L130 70 L168 40 L206 74 L246 36 L300 84 L300 104 L0 104Z" fill="#5d6f8e"/>
        <path d="M40 46 L50 58 L44 56 L34 54Z M96 30 L108 46 L98 42 L88 44Z M168 40 L178 52 L168 50 L160 52Z M246 36 L258 50 L248 46 L238 50Z" fill="#fff"/>
        <path d="M0 ${H} L0 92 L300 102 L300 ${H}Z" fill="#ffffff"/>
        <g transform="rotate(8 70 112)"><rect x="34" y="106" width="72" height="9" rx="4.5" fill="#6b4426"/><ellipse cx="34" cy="110.5" rx="3" ry="4.5" fill="#e3c08e"/>
        <path d="M44 115 L40 126 M44 115 L50 126 M94 115 L90 126 M94 115 L100 126" stroke="#4a2f1a" stroke-width="2.5"/></g>
        <g fill="#eef3fb" stroke="#c8d4ea" stroke-width="1">${[0, 1, 2, 3, 4].map((k) => `<rect x="${150 + k * 9}" y="${100 + k * 6}" width="${40 - k * 9 + 30}" height="6"/>`).join('')}</g>
        <path d="M150 92 L196 122" stroke="#5f6b80" stroke-width="3"/><path d="M160 98 L160 106 M186 115 L186 122" stroke="#333" stroke-width="2"/>
        <path d="M218 136 L250 114 L266 114 L292 136Z" fill="#e6eefb"/><path d="M250 114 L266 114" stroke="#ff9a1a" stroke-width="3"/>
        <path d="M232 104 L272 100 L272 105 L232 109Z" fill="#ff9a1a" stroke="#4a2a0a" stroke-width="1"/>`;
    } else if (m.id === 'yog20') {
      // windy grey-blue day over the Swiss Alps: a step-up block with a rider over the gap, red and white banners
      let wind = '';
      for (let i = 0; i < 9; i++) { const y = 14 + i * 9, x = (r() * 220) | 0; wind += `<path d="M${x} ${y} q30 -4 60 0" stroke="#fff" stroke-width="1.2" fill="none" opacity="0.5"/>`; }
      body = `<defs>${grad(gid, [[0, '#4d6283'], [0.55, '#9eb0c8'], [1, '#f2f4f8']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>${wind}
        ${peaks('#6c7c96', '#f4f6fa', 88, 2020, 6)}
        <path d="M0 ${H} L0 94 L300 104 L300 ${H}Z" fill="#ffffff"/>
        <g>${Array.from({ length: 30 }, (_, i) => `<rect x="${i * 10}" y="${96 + i * 0.33}" width="10" height="4" fill="${i % 2 ? '#fff' : '#e8202a'}"/>`).join('')}</g>
        <path d="M60 140 L98 120 L104 120 L104 126 Z" fill="#e6eefb"/><path d="M98 120 L104 120" stroke="#e8202a" stroke-width="3"/>
        <path d="M118 140 L132 108 L196 112 L232 140Z" fill="#eef3fb"/><path d="M132 108 L196 112" stroke="#e8202a" stroke-width="3"/>
        <g transform="translate(116 92) rotate(-20)"><rect x="-10" y="4" width="20" height="4" rx="2" fill="#1c1d22"/><rect x="-4" y="-9" width="8" height="12" rx="3.5" fill="#e8202a"/><circle cx="0" cy="-12" r="4" fill="#fff"/></g>
        <rect x="246" y="96" width="22" height="16" fill="#e8202a"/><rect x="255" y="99" width="4" height="10" fill="#fff"/><rect x="251" y="102" width="12" height="4" fill="#fff"/>
        ${pine(22, 106, 0.85, '#2f5a46', '#fff')}${pine(286, 110, 0.75, '#2f5a46', '#fff')}`;
    } else if (m.id === 'yog24') {
      // low winter sun over rounded Korean hills: a pyramid funbox with a box over it, a wave box, kickers
      body = `<defs>${grad(gid, [[0, '#0b3aa8'], [0.55, '#5b97ea'], [1, '#ffe9f1']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <circle cx="256" cy="66" r="14" fill="#fff4d6"/><circle cx="256" cy="66" r="30" fill="#ffd9a0" opacity="0.25"/>
        <path d="M0 92 Q40 62 90 80 Q140 56 190 78 Q240 60 300 82 L300 104 L0 104Z" fill="#3c4f72"/><path d="M0 92 Q40 62 90 80 Q140 56 190 78 Q240 60 300 82" stroke="#e8eef8" stroke-width="3" fill="none"/>
        <path d="M0 ${H} L0 96 L300 104 L300 ${H}Z" fill="#ffffff"/>
        <path d="M78 132 L110 108 L150 108 L182 132Z" fill="#e2ebfa" stroke="#9fb3d6" stroke-width="1"/>
        <path d="M86 128 L112 106 L148 106 L174 128" stroke="#1fb8e0" stroke-width="4" fill="none"/>
        <path d="M16 116 q10 -8 20 0 q10 -8 20 0 q10 -8 20 0" stroke="#ff4d8a" stroke-width="4" fill="none"/>
        ${[[220, 1], [270, 1.1]].map(([x, k]) => `<path d="M${x - 22 * k} 142 L${x} ${124 - 4 * k} L${x + 12 * k} ${124 - 4 * k} L${x + 28 * k} 142Z" fill="#eef2f8"/><path d="M${x} ${124 - 4 * k} L${x + 12 * k} ${124 - 4 * k}" stroke="#1fb8e0" stroke-width="3"/>`).join('')}
        ${pine(196, 104, 0.7, '#244a3a', '#fff')}${pine(40, 100, 0.75, '#244a3a', '#fff')}`;
    } else if (m.id === 'bigair') {
      // a giant kicker with a rider spinning high above the landing hill
      let arc = '';
      for (let i = 0; i <= 10; i++) { const t = i / 10; arc += `${i ? 'L' : 'M'}${(118 + t * 150).toFixed(0)} ${(78 - 62 * Math.sin(t * Math.PI * 0.85) + t * 40).toFixed(0)} `; }
      body = `<defs>${grad(gid, [[0, '#2f6fd6'], [0.6, '#8ec0f5'], [1, '#eef6ff']])}</defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <g fill="#fff" opacity="0.95"><ellipse cx="60" cy="30" rx="36" ry="9"/><ellipse cx="84" cy="24" rx="20" ry="10"/><ellipse cx="236" cy="22" rx="30" ry="8"/></g>
        ${peaks('#7d97c8', '#ffffff', 92, 41, 6)}
        <path d="M0 ${H} L0 104 Q60 96 108 100 L122 74 L150 76 L300 140 L300 ${H}Z" fill="#ffffff"/>
        <path d="M108 100 L122 74 L150 76 L150 112Z" fill="#dbe8fb"/>
        <path d="M120 75 L150 76" stroke="#2f7dff" stroke-width="3"/>
        <path d="${arc}" stroke="#fff" stroke-width="2" stroke-dasharray="3 4" fill="none" opacity="0.9"/>
        <g transform="translate(205 26) rotate(-30)"><rect x="-13" y="6" width="26" height="5" rx="2.5" fill="#ff4060"/><rect x="-5" y="-12" width="10" height="16" rx="4" fill="#25a865"/><circle cx="0" cy="-15" r="5" fill="#1c1d22"/></g>
        ${pine(20, 112, 1, '#1f6b45', '#fff')}${pine(40, 118, 0.8, '#1f6b45', '#fff')}${pine(282, 136, 0.9, '#1f6b45', '#fff')}`;
    } else {
      let cr = '';
      const cols = ['#5ff4ff', '#a77bff', '#5fffc0', '#ff7ad9'];
      for (let i = 0; i < 9; i++) {
        const x = i < 5 ? 18 + i * 14 : 200 + (i - 5) * 22, y = 132 - (r() * 18) | 0, h = 14 + r() * 26, c = cols[i % 4];
        cr += `<path d="M${x - 5} ${y} L${x} ${y - h} L${x + 5} ${y}Z" fill="${c}"/><circle cx="${x}" cy="${y - h / 2}" r="12" fill="${c}" opacity="0.18"/>`;
      }
      let ic = '';
      for (let i = 0; i < 14; i++) { const x = 30 + i * 18 + r() * 6; ic += `<path d="M${x - 4} 0 L${x} ${16 + r() * 22} L${x + 4} 0Z" fill="#bfe7ff" opacity="0.8"/>`; }
      body = `<defs><radialGradient id="${gid}" cx="0.5" cy="0.6" r="0.6"><stop offset="0" stop-color="#e9fbff"/><stop offset="0.25" stop-color="#7cf0ff"/><stop offset="0.55" stop-color="#3a2aa0"/><stop offset="1" stop-color="#0a0620"/></radialGradient></defs>
        <rect width="${W}" height="${H}" fill="url(#${gid})"/>
        <path d="M0 0 L${W} 0 L${W} ${H} L250 ${H} Q240 60 150 50 Q60 60 50 ${H} L0 ${H}Z" fill="#160f33"/>
        <path d="M0 0 L${W} 0 L${W} 20 Q150 -6 0 20Z" fill="#241a4e"/>${ic}
        <path d="M50 ${H} Q150 112 250 ${H}Z" fill="#cfefff" opacity="0.9"/>${cr}`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  let previewTimer = 0;
  // the picker: every mountain in one list; pick one to see it behind the list (and its stars),
  // then RIDE. In multiplayer the same list is used to vote for the next mountain.
  let mapPage = 0;
  let mapSel = null;
  const RIDE_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function setMapPage(p, dir) { moveMapSel(dir || 0); }
  function moveMapSel(d) {
    const ids = SS.MAP_IDS, i = Math.max(0, ids.indexOf(mapSel));
    selectMap(ids[(i + d + ids.length) % ids.length], true);
  }
  function previewMap(id) {
    if (coarse || mode !== 'menu') return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (hidden(ui.maps) || (world && world.mapId === id)) return;
      previewLock = true;
      useWorld((Math.random() * 2147483647) | 0, id);
      startAttract();
    }, 380);
  }
  function selectMap(id, scroll) {
    mapSel = id;
    for (const c of ui.mapGrid.children) c.classList.toggle('sel', c.dataset.id === id);
    const card = ui.mapGrid.querySelector(`[data-id="${id}"]`);
    if (card && scroll) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const m = SS.MAPS[id], pr = prog(id), info = $('mapInfo');
    info.style.setProperty('--acc', m.accent);
    info.innerHTML = `<div class="mi-tags"><span class="on-dark">${pisteSign(m.diff)}</span>${sentence(m.time)} &middot; ${DIFF_WORD[m.diff]}${m.oly ? ' &middot; OLYMPIC STYLE' : ''}</div>
      <div class="mi-name">${esc(m.name)}</div>
      <p class="mi-sub">${esc(m.sub)}</p>
      <ul class="mi-goals">${m.goals.map((g, i) => `<li class="${pr.stars[i] ? 'on' : ''}">${esc(g.t)}</li>`).join('')}</ul>
      <div class="mi-best">BEST <b>${pr.best ? fmt(pr.best) : '&mdash;'}</b> &nbsp;&middot;&nbsp; STARS <b>${pr.stars.filter(Boolean).length}/3</b></div>
      <button id="mapGo" class="btn primary mi-go" type="button"><span class="brush">${mapVote ? (votes.mine === id ? 'Take back vote' : 'Vote') : 'Ride solo'}</span>${RIDE_ARROW}</button>`;
    $('mapGo').addEventListener('click', (e) => { e.currentTarget.blur(); rideMap(id); });
    previewMap(id);
  }
  function rideMap(id) {
    clearTimeout(previewTimer);
    if (mapVote) { net.send({ t: 'vote', map: id }); closeMaps(); return; }
    saveName();
    startSingle(false, id);
  }
  function buildMaps() {
    ui.mapGrid.innerHTML = '';
    for (const id of SS.MAP_IDS) {
      const m = SS.MAPS[id], pr = prog(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mapCard';
      b.dataset.id = id;
      b.style.setProperty('--acc', m.accent);
      b.innerHTML = `<div class="art">${mapArt(m)}<img class="shot" src="img/maps/${id}.jpg" alt="" loading="lazy" decoding="async" onerror="this.remove()">${m.oly ? '<span class="olyTag">OLYMPIC</span>' : ''}</div>
        <div class="mc-body"><div class="mc-name brush">${pisteSign(m.diff)}<span>${esc(m.name)}</span></div>
        <div class="mc-foot"><span class="stars">${pr.stars.map((v) => `<i class="${v ? 'on' : ''}">&#9733;</i>`).join('')}</span><span class="best">${pr.best ? 'Best ' + fmt(pr.best) : sentence(m.time)}</span></div></div>`;
      b.title = m.goals.map((g, i) => (pr.stars[i] ? '★ ' : '☆ ') + g.t).join('\n');
      if (mapVote) {
        const n = votes.counts[id] || 0;
        const tag = votes.mine === id ? 'YOUR VOTE' + (n > 1 ? ' + ' + (n - 1) : '') : n ? n + (n === 1 ? ' VOTE' : ' VOTES') : '';
        if (tag) b.querySelector('.art').insertAdjacentHTML('beforeend', `<span class="voteTag${votes.mine === id ? ' mine' : ''}">${tag}</span>`);
        if (world && world.mapId === id) b.querySelector('.art').insertAdjacentHTML('beforeend', '<span class="voteTag now">RIDING NOW</span>');
      }
      // one click picks it, a second click (or the button) rides it
      b.addEventListener('click', (e) => {
        e.currentTarget.blur();
        if (mapSel === id) rideMap(id);
        else selectMap(id);
      });
      ui.mapGrid.appendChild(b);
    }
  }
  // in multiplayer the same picker is used to vote for the next mountain
  let mapVote = false;
  const mapsHead = { h: null, lead: null };
  function openMaps(vote) {
    mapVote = !!vote;
    const h = ui.maps.querySelector('h2'), lead = ui.maps.querySelector('.lead');
    if (mapsHead.h === null) { mapsHead.h = h.textContent; mapsHead.lead = lead.textContent; }
    h.textContent = mapVote ? 'Vote for a mountain' : mapsHead.h;
    lead.textContent = mapVote ? 'The most votes picks the next round’s mountain. More than half the server voting for one switches to it right away.' : mapsHead.lead;
    if (mapVote) { show(ui.pauseMenu, false); show(ui.maps, true); }
    else hideOverlays();
    const cur = mapVote ? (votes.mine || (world && world.mapId)) : spMap;
    buildMaps();
    show(ui.maps, true);
    selectMap(SS.MAP_IDS.includes(cur) ? cur : SS.MAP_IDS[0], true);
  }
  function closeMaps() {
    clearTimeout(previewTimer);
    previewLock = false;
    show(ui.maps, false);
    if (mapVote) { mapVote = false; return; }
    if (mode === 'menu') show(ui.title, true);
    else toMenu();
  }

  // big map title card at the start of a run
  function showIntro(dur) {
    const m = world.map;
    ui.mapIntro.style.setProperty('--acc', m.accent);
    ui.miTime.innerHTML = `<span class="on-dark">${pisteSign(m.diff)}</span>${sentence(m.time)}, ${DIFF_WORD[m.diff].toLowerCase()}${m.oly ? '<span class="olyTag">OLYMPIC STYLE</span>' : ''}`;
    ui.miName.textContent = m.name.toUpperCase();
    ui.miGoals.innerHTML = mode === 'sp' ? m.goals.map((g) => `<span>${esc(g.t)}</span>`).join('') : '<span>' + esc(m.sub) + '</span>';
    ui.mapIntro.classList.remove('out');
    show(ui.mapIntro, true);
    introT = dur;
  }

  function leaveMp() {
    net.leave();
    if (voice) { voice.disable(); voice.leave(); }
    show($('voicePrompt'), false);
    show($('voiceBox'), false);
    if (mapVote) closeMaps();
    for (const r of remotes.values()) { r.tag.remove(); trails.delete(r.id); }
    remotes.clear();
    racers = new Set();
    myId = 0;
    mode = 'menu';
    show(ui.standings, false);
    show(ui.mpbar, false);
    show(ui.hud, false);
    show(ui.menuBtn, false);
    show(ui.touch, false);
    ui.feed.innerHTML = '';
    feedEls.length = 0;
  }

  let settingsBack = null;
  // settings and help open over whatever is on screen (the lobby stays behind them)
  function openSettings(back) {
    settingsBack = back;
    if (back !== ui.title) show(back, false);
    show(ui.settings, true);
    applySettings();
  }
  function closeSettings() {
    show(ui.settings, false);
    if (settingsBack && settingsBack !== ui.title) show(settingsBack, true);
    else if (mode === 'menu') show(ui.title, true);
  }
  let helpBack = null;
  function openHelp(back) {
    helpBack = back;
    if (back && back !== ui.title) show(back, false);
    show($('help'), true);
  }
  function closeHelp() {
    show($('help'), false);
    if (helpBack && helpBack !== ui.title) show(helpBack, true);
    helpBack = null;
  }

  function toggleMenu() {
    if (!hidden(ui.settings)) { closeSettings(); return; }
    if (!hidden($('help'))) { closeHelp(); return; }
    if (mode === 'menu') {
      if (!hidden(ui.servers)) { show(ui.servers, false); show(ui.title, true); stopServerPoll(); }
      else if (!hidden(ui.title) && ui.title.dataset.page !== 'ride') setPage('ride');
      return;
    }
    if (phase === 'results' && mode === 'sp') return;
    const open = hidden(ui.pauseMenu);
    show(ui.pauseMenu, open);
    if (mode === 'sp') paused = open;
    ui.restartBtn.querySelector('b').textContent = mode === 'mp' ? 'Leave server' : 'Restart run';
    $('pauseWhere').textContent = (world ? world.map.name : '') + (mode === 'mp' ? ' · MULTIPLAYER' : ' · SOLO');
    $('pauseMute').textContent = Sfx.muted ? 'Unmute audio' : 'Mute audio';
    show($('voteBtn'), mode === 'mp' && !oneMap);
    if (open) Sfx.silence();
  }

  // server browser
  let pollTimer = null;
  async function refreshServers() {
    try {
      const list = await SS.Net.servers();
      for (const s of list) {
        let row = ui.serverList.querySelector(`.srv[data-id="${s.id}"]`);
        if (!row) {
          if (!ui.serverList.querySelector('.srv')) ui.serverList.innerHTML = '';
          row = document.createElement('div');
          row.className = 'srv';
          row.dataset.id = s.id;
          row.innerHTML = `<div class="info"><div class="nm"><span class="sn"></span></div><div class="sub"><span class="mapTag"></span><span class="st"></span></div></div>
            <div class="cap"><div class="cnt"></div><div class="fill"><i></i></div></div>
            <button class="btn" type="button" data-id="${s.id}">JOIN</button>`;
          row.querySelector('.sn').textContent = s.name;
          row.querySelector('button').addEventListener('click', (e) => { e.currentTarget.blur(); joinServer(s.id); });
          ui.serverList.appendChild(row);
        }
        const full = s.players >= s.max;
        const tag = row.querySelector('.mapTag');
        const mm = SS.MAPS[s.map];
        tag.textContent = mm ? mm.name : '';
        tag.style.setProperty('--acc', mm ? mm.accent : '#fff');
        row.querySelector('.st').textContent = s.players === 0 ? 'Empty. Join to start a round' : s.phase === 'racing' ? 'Race in progress' : s.phase === 'countdown' ? 'Starting soon' : s.phase === 'results' ? 'Results are up, next mountain soon' : 'Open';
        row.querySelector('.cnt').textContent = s.players + '/' + s.max;
        row.querySelector('.fill i').style.width = (s.players / s.max) * 100 + '%';
        const btn = row.querySelector('button');
        btn.disabled = full;
        btn.textContent = full ? 'FULL' : 'JOIN';
      }
      show($('mpAcct'), needAccount());
      if (ui.serverMsg.dataset.sticky !== '1') ui.serverMsg.textContent = '';
    } catch (e) {
      ui.serverList.innerHTML = '';
      show($('mpAcct'), false);
      ui.serverMsg.dataset.sticky = '1';
      ui.serverMsg.innerHTML = '<b>Create an account to play multiplayer.</b> Accounts and multiplayer live on the online version of Shred Slope, so open it there to race other riders. Singleplayer works anywhere.';
    }
  }
  const needAccount = () => !!(SS.Account && SS.Account.online && !SS.Account.name);
  function openServers(msg) {
    hideOverlays();
    show(ui.servers, true);
    ui.serverMsg.dataset.sticky = msg ? '1' : '';
    ui.serverMsg.textContent = msg || '';
    if (!ui.serverList.querySelector('.srv')) ui.serverList.innerHTML = '<p class="small dim">Loading servers…</p>';
    refreshServers();
    stopServerPoll();
    pollTimer = setInterval(refreshServers, 2000);
    setTimeout(() => { ui.serverMsg.dataset.sticky = ''; }, 6000);
  }
  function stopServerPoll() { clearInterval(pollTimer); pollTimer = null; }

  function joinServer(id) {
    if (needAccount()) { SS.Account.open('up', ui.servers); return; }
    Sfx.init();
    stopServerPoll();
    hideOverlays();
    mode = 'mp';
    ai.on = false;
    phase = 'waiting';
    showLoading('JOINING THE SERVER');
    show(ui.standings, true);
    show(ui.mpbar, true);
    net.connect(id, playerName, settings.outfit | 0, SS.Account ? SS.Account.token : null);
  }

  // ---- studio shots: your rider alone on a clean backdrop with soft, even light (the season-pass
  // photo and the shop's try-on). Drawn into a small offscreen target, read back, and laid over a
  // painted backdrop, so they never depend on which mountain, light or slope is behind the menu.
  const studio = { t: null, w: 0, h: 0 };
  const STUDIO_WORLD = { nearLamps: () => null, Hk: () => 0, H: () => 0 };
  const STAND = { x: 0, y: 0, z: 0, heading: 0, spin: 0, stance: 0, flip: 0, lean: 0, crouch: 0.12, comp: 0, grab: false, air: false, tuck: false, slide: 0, wind: 0, bail: false, tumble: 0, tumbleRoll: 0, t: 0, wallRoll: 0, bailAge: 0, bailUp: 0, bailK: 0, spinV: 0, flipV: 0, grabType: 0, grabK: 0, airT: 0 };
  function studioShot(cv, o) {
    const W = cv.width, H = cv.height;
    if (!studio.t || studio.w !== W || studio.h !== H) {
      if (studio.t) engine.freeTarget(studio.t);
      studio.t = engine.makeTarget(W, H, true);
      studio.w = W; studio.h = H;
      studio.px = new Uint8Array(W * H * 4);
      studio.cv = document.createElement('canvas');
      studio.cv.width = W; studio.cv.height = H;
      studio.img = studio.cv.getContext('2d').createImageData(W, H);
    }
    if (!studio.t.ok) return false;
    const L = engine.light;
    const keep = { sky: L.sky, ground: L.ground, moonDir: L.moonDir, moonCol: L.moonCol, rim: engine.rim, fog: engine.fog, fogCol: engine.fogCol, w: engine.w, h: engine.h, shadowOn: engine.shadowOn };
    const eye = [Math.sin(o.yaw) * o.d, o.cy, Math.cos(o.yaw) * o.d], tgt = [0, o.ty, 0];
    // a soft key light from above the camera's left shoulder, sky fill and a cool rim
    const kx = Math.sin(o.yaw - 0.75) * 0.62, kz = Math.cos(o.yaw - 0.75) * 0.62, kl = Math.hypot(kx, 0.78, kz);
    L.sky = [0.6, 0.64, 0.74]; L.ground = [0.34, 0.33, 0.33];
    L.moonDir = [kx / kl, 0.78 / kl, kz / kl]; L.moonCol = [0.98, 0.95, 0.9];
    engine.rim = [0.3, 0.38, 0.5]; engine.fog = [5000, 9000]; engine.fogCol = [0.85, 0.9, 0.96];
    engine.shadowOn = false;
    engine.w = W; engine.h = H;
    STAND.t = o.t !== undefined ? o.t : time;
    STAND.pose = o.pose || null;
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, studio.t.fb);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      engine.setCamera(eye, tgt, o.fov || 0.6, o.roll || 0);
      engine.beginLit();
      SS.drawRider(engine, STUDIO_WORLD, STAND, o.look);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, studio.px);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      Object.assign(L, { sky: keep.sky, ground: keep.ground, moonDir: keep.moonDir, moonCol: keep.moonCol });
      Object.assign(engine, { rim: keep.rim, fog: keep.fog, fogCol: keep.fogCol, w: keep.w, h: keep.h, shadowOn: keep.shadowOn });
      gl.viewport(0, 0, engine.w, engine.h);
    }
    // the rows come back bottom-up
    const d = studio.img.data, row = W * 4;
    for (let y = 0; y < H; y++) d.set(studio.px.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    studio.cv.getContext('2d').putImageData(studio.img, 0, 0);
    // backdrop, a soft shadow on the floor, then the rider (or just the rider, on a clear background)
    const c2 = cv.getContext('2d');
    if (o.clear) { c2.clearRect(0, 0, W, H); c2.drawImage(studio.cv, 0, 0); return true; }
    const g = c2.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, o.top || '#a9cdf2'); g.addColorStop(0.6, o.mid || '#e4effc'); g.addColorStop(1, o.bottom || '#f4f8fd');
    c2.fillStyle = g;
    c2.fillRect(0, 0, W, H);
    if (o.floor) {
      const fy = H * o.floor, rx = W * 0.4;
      c2.save();
      c2.translate(W / 2, fy);
      c2.scale(1, 0.2);
      const r = c2.createRadialGradient(0, 0, 4, 0, 0, rx);
      r.addColorStop(0, 'rgba(16, 32, 74, 0.38)');
      r.addColorStop(1, 'rgba(16, 32, 74, 0)');
      c2.fillStyle = r;
      c2.beginPath(); c2.arc(0, 0, rx, 0, Math.PI * 2); c2.fill();
      c2.restore();
    }
    c2.drawImage(studio.cv, 0, 0);
    return true;
  }
  // the lobby shows your name under your rider, and the season pass card
  function drawAvatar() {
    const n = $('riderName');
    if (n) n.textContent = playerName || 'RIDER';
    // which rider you are, their style and stats
    const lk = myLook(), rd = SS.ITEMS.get('rider', lk && lk.rider) || SS.ITEMS.riders[0];
    const who = $('riderWho'), rs = $('riderStats');
    if (who) who.textContent = rd.name + ' · ' + rd.tag;
    if (rs && SS.statBars) rs.innerHTML = SS.statBars(rd.stats);
    const sub = $('passSub');
    if (sub) {
      const acc = SS.Account && SS.Account.name;
      sub.textContent = acc ? 'Saved to ' + acc : SS.Account && SS.Account.online ? 'Sign in to save your stars' : 'Saved on this computer';
    }
    updateStars();
  }

  // outfit picker (the free suits; the locker uses it for guests)
  function setOutfit(i) {
    settings.outfit = i;
    myColor = i;
    store.set(SET_KEY, settings);
    buildSwatches();
    accountChanged();
  }
  // which rider you are (guests; signed-in riders keep it in their locker on the server)
  function setRider(id) {
    if (!SS.ITEMS.RIDER_IDS.includes(id)) return;
    settings.rider = id;
    store.set(SET_KEY, settings);
    buildSwatches();
    accountChanged();
  }
  function buildSwatches() {
    const lk = myLook();
    const suit = typeof lk === 'object' ? SS.ITEMS.get('suit', lk.suit) : null;
    ui.outfitName.textContent = suit ? suit.name : SS.PALETTE[settings.outfit | 0].name;
    drawAvatar();
    if (SS.Shop && SS.Shop.refresh) SS.Shop.refresh();
  }

  // ---- lobby pages: RIDE, LOCKER, SHOP, PASS, CUPS, UPDATES
  function setPage(pg) {
    if (!ui.title) return;
    ui.title.dataset.page = pg;
    for (const b of document.querySelectorAll('#lobbyTabs button')) b.classList.toggle('sel', b.dataset.page === pg);
    if (pg === 'pass') renderPass();
    if (SS.Shop && SS.Shop.page) SS.Shop.page(pg);
    if (pg !== 'shop') setStageLook(null);
  }
  function renderPass() {
    const n = starCount(), all = SS.MAP_IDS.length * 3;
    $('passStars').textContent = n;
    $('passStars').nextElementSibling.textContent = '/ ' + all;
    $('passBar').style.width = (100 * n / all).toFixed(1) + '%';
    const tiers = all <= 12 ? Array.from({ length: all + 1 }, (_, i) => i) : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(all * f));
    $('passTiers').innerHTML = tiers.map((t) => `<span class="${n >= t ? 'on' : ''}">${t ? '&#9733; ' + t : 'START'}</span>`).join('');
    $('passList').innerHTML = SS.MAP_IDS.map((id) => {
      const m = SS.MAPS[id], pr = prog(id);
      return `<button type="button" class="pmap" data-map="${id}"><span class="pic" style="background-image:url('img/maps/${id}.jpg')"></span>
        <span class="bd"><span class="nm">${pisteSign(m.diff)}<span>${esc(m.name)}</span></span><ul class="gl">${m.goals.map((g, i) => `<li class="${pr.stars[i] ? 'on' : ''}">${esc(g.t)}</li>`).join('')}</ul></span>
        <span class="bst">BEST<b>${pr.best ? fmt(pr.best) : '&mdash;'}</b></span></button>`;
    }).join('');
  }
  function lobbyInit() {
    $('lobbyTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-page]');
      if (!b) return;
      b.blur();
      Sfx.init();
      setPage(b.dataset.page);
    });
    ui.title.addEventListener('click', (e) => {
      const g = e.target.closest('[data-goto]');
      if (g) { g.blur(); setPage(g.dataset.goto); return; }
      const o = e.target.closest('[data-open]');
      if (o) { o.blur(); if (o.dataset.open === 'help') openHelp(ui.title); else openSettings(ui.title); }
    });
    $('passList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-map]');
      if (!b) return;
      spMap = b.dataset.map;
      rideNow();
    });
    for (const b of document.querySelectorAll('#setTabs button')) b.addEventListener('click', () => {
      for (const x of document.querySelectorAll('#setTabs button')) x.classList.toggle('sel', x === b);
      for (const pane of document.querySelectorAll('.set-pane')) show(pane, pane.dataset.tab === b.dataset.tab);
    });
    click($('settingsX'), () => closeSettings());
    click($('helpX'), () => closeHelp());
    click($('helpDone'), () => closeHelp());
    click($('pauseX'), () => toggleMenu());
    click($('pauseHelpBtn'), () => openHelp(ui.pauseMenu));
    click($('pauseMute'), () => { Sfx.setMuted(!Sfx.muted); $('pauseMute').textContent = Sfx.muted ? 'Unmute audio' : 'Mute audio'; });
    click($('pauseFull'), () => {
      const d = document;
      if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen();
      else d.documentElement.requestFullscreen && d.documentElement.requestFullscreen().catch(() => {});
    });
  }

  // ---- little 3D pictures for the shop and the locker (a few each frame, cached)
  const thumbs = { cache: new Map(), queue: [], cv: null };
  const FRAMES = {
    suit: { pose: 'stand', yaw: Math.PI / 2 + 0.35, d: 2.7, cy: 1.32, ty: 1.12, fov: 0.6 },
    rider: { pose: 'stand', yaw: Math.PI / 2 + 0.2, d: 1.25, cy: 1.66, ty: 1.56, fov: 0.6 },
    helmet: { pose: 'stand', yaw: Math.PI / 2 + 0.55, d: 0.95, cy: 1.72, ty: 1.66, fov: 0.6 },
    goggles: { pose: 'stand', yaw: Math.PI / 2 + 0.25, d: 0.8, cy: 1.69, ty: 1.66, fov: 0.6 },
    board: { pose: 'board', yaw: Math.PI / 2 + 0.3, d: 2.3, cy: 0.05, ty: 0, fov: 0.6, roll: 0.95 },
  };
  function thumb(look, slot, cb) {
    const key = slot + '|' + JSON.stringify(look);
    const have = thumbs.cache.get(key);
    if (have) { cb(have); return have; }
    thumbs.queue.push({ key, look, slot, cb });
    return null;
  }
  function thumbTick() {
    if (!thumbs.queue.length || !engine) return;
    if (!thumbs.cv) { thumbs.cv = document.createElement('canvas'); thumbs.cv.width = 560; thumbs.cv.height = 420; }
    for (let n = 0; n < 2 && thumbs.queue.length; n++) {
      const j = thumbs.queue.shift();
      let url = thumbs.cache.get(j.key);
      if (!url) {
        studioShot(thumbs.cv, Object.assign({ look: j.look, clear: true, t: 1.2 }, FRAMES[j.slot] || FRAMES.suit));
        url = thumbs.cv.toDataURL('image/png');
        thumbs.cache.set(j.key, url);
      }
      try { j.cb(url); } catch (e) { /* the card went away */ }
    }
  }

  // buttons
  const click = (el, fn) => el.addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
  // RIDE: with one mountain it drops you straight in; with more it opens the picker
  function rideNow() {
    saveName();
    Sfx.init();
    if (oneMap) startSingle(false, SS.MAP_IDS[0]);
    else openMaps();
  }
  click(ui.spBtn, () => rideNow());
  click(ui.mapsBack, () => closeMaps());
  click(ui.mapPrev, () => setMapPage(mapPage - 1, -1));
  click(ui.mapNext, () => setMapPage(mapPage + 1, 1));
  click(ui.resMapsBtn, () => { mode = 'menu'; phase = 'attract'; show(ui.hud, false); show(ui.menuBtn, false); show(ui.touch, false); Sfx.silence(); startAttract(); openMaps(); });
  click(ui.mpBtn, () => { saveName(); Sfx.init(); openServers(); });
  click(ui.settingsBtn, () => { Sfx.init(); openSettings(ui.title); });
  click(ui.pauseSettingsBtn, () => openSettings(ui.pauseMenu));
  click(ui.settingsDone, () => closeSettings());
  click(ui.backBtn, () => { stopServerPoll(); show(ui.servers, false); show(ui.title, true); });
  click(ui.resumeBtn, () => toggleMenu());
  click(ui.restartBtn, () => { if (mode === 'mp') toMenu(); else startSingle(true); });
  click(ui.quitBtn, () => toMenu());
  click(ui.againBtn, () => startSingle(true));
  click(ui.newBtn, () => startSingle(false, spMap));
  click(ui.resMenuBtn, () => toMenu());
  click(ui.menuBtn, () => toggleMenu());
  click($('voteBtn'), () => { show(ui.pauseMenu, false); openMaps(true); });
  click($('mpVote'), () => { if (mode === 'mp') openMaps(true); });
  click($('mpSignUp'), () => SS.Account && SS.Account.open('up', ui.servers));
  click($('mpSignIn'), () => SS.Account && SS.Account.open('in', ui.servers));
  click($('vpOpen'), () => answerVoice('open'));
  click($('vpPtt'), () => answerVoice('ptt'));
  click($('vpOff'), () => answerVoice('off'));
  click($('vbMute'), () => { if (voice) voice.setSelfMuted(!voice.selfMuted); });
  $('vbList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b && voice) { b.blur(); voice.toggleMute(+b.dataset.id); }
  });
  {
    const talk = $('vbTalk');
    const down = (e) => { e.preventDefault(); if (voice) voice.setTalkKey(true); };
    const up = () => { if (voice) voice.setTalkKey(false); };
    talk.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) talk.addEventListener(ev, up);
  }
  document.querySelectorAll('.seg').forEach((seg) => {
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
      e.currentTarget.blur();
      settings[seg.dataset.key] = b.dataset.v;
      applySettings();
    }));
  });
  ui.nameInput.addEventListener('change', saveName);
  function saveName() {
    if (ui.nameInput.readOnly) return;
    const v = ui.nameInput.value.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
    if (v) { playerName = v; store.set(NAME_KEY, v); }
    ui.nameInput.value = playerName;
  }

  // ------------------------------------------------------------------ accounts (account.js does the talking)
  let applyingSave = false;
  function accountChanged() { if (!applyingSave && SS.Account) SS.Account.push(); }
  const accountSave = () => ({
    best: Math.round(best) || 0,
    progress: Object.fromEntries(Object.entries(progress).map(([id, p]) => [id, { best: Math.round(p.best) || 0, stars: [0, 1, 2].map((i) => !!(p.stars && p.stars[i])) }])),
    outfit: settings.outfit | 0,
    prefs: { camera: settings.camera, autoRail: settings.autoRail, rider: settings.rider },
  });
  function applyAccountSave(sv, replace) {
    applyingSave = true;
    if (replace) for (const k of Object.keys(progress)) delete progress[k];
    for (const [id, p] of Object.entries(sv.progress || {})) {
      if (!SS.MAPS[id]) continue;
      const o = replace ? { best: 0, stars: [false, false, false] } : prog(id);
      progress[id] = { best: Math.max(o.best, p.best || 0), stars: o.stars.map((v, i) => v || !!(p.stars && p.stars[i])) };
    }
    best = replace ? sv.best || 0 : Math.max(best, sv.best || 0);
    store.set(BEST_KEY, best);
    store.set(PROG_KEY, progress);
    ui.bestScore.textContent = fmt(best);
    updateStars();
    if (sv.outfit != null && SS.PALETTE[sv.outfit]) { settings.outfit = sv.outfit; myColor = sv.outfit; }
    if (sv.prefs) {
      if (['close', 'far', 'high'].includes(sv.prefs.camera)) settings.camera = sv.prefs.camera;
      if (sv.prefs.autoRail === 'on' || sv.prefs.autoRail === 'off') settings.autoRail = sv.prefs.autoRail;
      if (SS.ITEMS.RIDER_IDS.includes(sv.prefs.rider)) settings.rider = sv.prefs.rider;
    }
    applySettings();
    buildSwatches();
    applyingSave = false;
  }
  function setAccountName(name, locked) {
    ui.nameInput.readOnly = !!locked;
    ui.nameInput.classList.toggle('locked', !!locked);
    ui.nameInput.title = locked ? 'Your account name' : '';
    if (locked) playerName = name;
    else {
      playerName = String(store.get(NAME_KEY, '') || '').slice(0, 16) || 'Rider' + Math.floor(100 + Math.random() * 900);
    }
    ui.nameInput.value = playerName;
  }
  let toastT = null;
  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('on'), 3200);
  }

  // ------------------------------------------------------------------ HUD helpers
  const cache = {};
  const setText = (el, key, v, html) => { if (cache[key] !== v) { cache[key] = v; if (html) el.innerHTML = v; else el.textContent = v; } };
  let trickT = 0;
  function setTrick(name, sub, bad, dur, lines) {
    if (introT > 0.3) introT = 0.3;
    ui.trickName.textContent = name;
    ui.trickSub.innerHTML = sub;
    const tp = $('trickParts');
    if (tp) tp.innerHTML = (lines || []).slice(0, 6).map(([w, v], i) => `<li style="animation-delay:${(i * 0.06).toFixed(2)}s"><span>${esc(w)}</span><b>${v < 0 ? '−' : '+'}${fmt(Math.abs(v))}</b></li>`).join('');
    ui.trick.classList.toggle('bail', !!bad);
    ui.trick.classList.remove('fade');
    trickT = dur;
  }
  // the last few tricks you landed, under the score
  function pushRunFeed(names, pts, m) {
    const el = $('runFeed');
    if (!el || !pts) return;
    const nm = names.length ? names[names.length - 1] + (names.length > 1 ? ` +${names.length - 1}` : '') : 'COMBO';
    runFeedList.unshift({ nm, pts, m, t: time });
    runFeedList.length = Math.min(runFeedList.length, 4);
    el.innerHTML = runFeedList.map((f, i) => `<div class="${i === 0 ? 'new' : ''}"><b>+${fmt(f.pts)}</b><span>${esc(f.nm)}</span>${f.m > 1 ? `<em>x${f.m.toFixed(2)}</em>` : ''}</div>`).join('');
  }
  let landT = 0;
  let flash = 0;
  function showLand(qual) {
    ui.landTag.textContent = qual === 'perfect' ? 'STOMPED +15%' : qual === 'clean' ? 'CLEAN LANDING' : 'SKETCHY LANDING';
    ui.landTag.className = 'brush show ' + qual;
    landT = 1.6;
    if (qual === 'perfect') { Sfx.perfect(); flash = 0.5; }
  }
  let bigT = 0;
  function setBig(text, sub, dur) {
    ui.bigText.textContent = text;
    ui.bigSub.textContent = sub || '';
    ui.big.classList.remove('pulse');
    void ui.big.offsetWidth;
    ui.big.classList.add('pulse');
    show(ui.big, true);
    bigT = dur;
  }

  const mapCtx = ui.minimap.getContext('2d');
  function drawMap() {
    if (!world || !mapBase || !world.map || hidden(ui.hud)) return;
    mapCtx.clearRect(0, 0, ui.minimap.width, ui.minimap.height);
    mapCtx.drawImage(mapBase, 0, 0);
    for (const r of remotes.values()) {
      if (!r.st) continue;
      const p = world.mapPos(r.st.x, r.st.z);
      mapCtx.fillStyle = SS.PALETTE[r.color % 10].css;
      mapCtx.beginPath(); mapCtx.arc(p[0], p[1], 3, 0, TAU); mapCtx.fill();
    }
    const g = ghostState();
    if (g) {
      const p = world.mapPos(g.x, g.z);
      mapCtx.fillStyle = 'rgba(200,225,255,0.7)';
      mapCtx.beginPath(); mapCtx.arc(p[0], p[1], 3, 0, TAU); mapCtx.fill();
    }
    if (phase === 'riding' || phase === 'finished' || phase === 'countdown') {
      const p = world.mapPos(P.x, P.z);
      mapCtx.fillStyle = '#fff';
      mapCtx.strokeStyle = '#0b1530';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(p[0], p[1], 4.2, 0, TAU); mapCtx.fill(); mapCtx.stroke();
    }
  }

  function updateHud(dt, focus) {
    if (hidden(ui.hud)) return;
    const zn = world.zoneAt(focus.z).name;
    if (zn !== zoneName) {
      zoneName = zn;
      ui.zone.textContent = zn;
      ui.zone.classList.remove('flash'); void ui.zone.offsetWidth; ui.zone.classList.add('flash');
    }
    const mine = phase === 'riding' || phase === 'finished' || phase === 'countdown' || (mode === 'sp' && phase === 'results');
    const racing = mine && rivals.length > 0;
    show(ui.racePos, racing);
    if (racing) {
      const pl = run.place || 1;
      setText(ui.racePos, 'pos', ['', '1ST', '2ND', '3RD', '4TH'][pl] + '<small>/ 4</small>', true);
      ui.racePos.classList.toggle('lead', pl === 1);
    }
    setText(ui.score, 'score', fmt(mine ? run.score : (focus.score || 0)));
    setText(ui.tokenCount, 'tok', mine ? run.tokens + '/' + world.tokens.length : '-');
    const sp = mine ? (P.grounded ? P.speed : Math.hypot(P.vx, P.vz)) : focus.speed || 0;
    const air = mine && !P.grounded && P.airT > 0.3 && P.bailT <= 0;
    if (air) {
      setText(ui.speedLbl, 'lbl', 'AIR TIME');
      setText(ui.speedVal, 'sv', P.airT.toFixed(1));
      setText(ui.speedUnit, 'su', 'S');
      setText(ui.subStats, 'sub', Math.round(sp * 3.6) + ' KM/H  ' + Math.max(0, Math.round(P.y - world.ground(P.x, P.z))) + ' M');
    } else {
      setText(ui.speedLbl, 'lbl', P.slide > 0.4 && mine ? 'POWERSLIDE' : 'SPEED');
      setText(ui.speedVal, 'sv', String(Math.round(sp * 3.6)));
      setText(ui.speedUnit, 'su', 'KM/H');
      setText(ui.subStats, 'sub', mine && run.pot > 0 && mult() > 1 ? 'COMBO x' + mult().toFixed(2) : '');
    }
    ui.speedBar.style.width = (clamp(sp / MAX_SPEED, 0, 1) * 100).toFixed(1) + '%';
    // the round speed gauge: three quarters of a circle, full at 120 km/h (air time fills it too)
    const gk = air ? clamp(P.airT / 4, 0, 1) : clamp(sp * 3.6 / 120, 0, 1);
    const ga = (gk * 245).toFixed(1);
    if (cache.ga !== ga) { cache.ga = ga; $('speedArc').style.strokeDasharray = ga + ' 400'; }
    $('speedBox').classList.toggle('air', air);
    // how far down the course you are
    const pk = (clamp(focus.z / C.LENGTH, 0, 1) * 100).toFixed(1);
    if (cache.pk !== pk) { cache.pk = pk; $('progFill').style.width = pk + '%'; }
    const cm = mine && run.pot > 0 && P.bailT <= 0 ? mult() : 1;
    const cc = cm > 1 ? 'x' + cm.toFixed(2) + ' COMBO' : '';
    if (cache.cc !== cc) { cache.cc = cc; $('comboChip').textContent = cc; show($('comboChip'), !!cc); }
    const rf = $('runFeed');
    if (rf) for (let i = 0; i < rf.children.length; i++) rf.children[i].classList.toggle('old', !runFeedList[i] || time - runFeedList[i].t > 7);
    setText(ui.timer, 'tm', fmtTime(mine ? raceT : 0));
    setText(ui.alt, 'alt', fmt(world.altitude(focus.z)) + ' M');
    setText(ui.left, 'left', Math.max(0, (C.LENGTH - focus.z) / 1000).toFixed(1) + ' KM LEFT');

    // boost meter and rail balance
    const bst = mine ? run.boost : 0;
    ui.boostFill.style.width = (bst * 100).toFixed(0) + '%';
    ui.boostBox.classList.toggle('full', bst >= 0.999);
    ui.boostBox.classList.toggle('on', mine && P.boosting);
    const bal = mine && P.surf === 2 && P.grindRef && P.bailT <= 0;
    show(ui.balance, bal);
    if (bal) {
      ui.balMark.style.left = (50 + clamp(P.bal, -1, 1) * 50).toFixed(1) + '%';
      ui.balance.classList.toggle('danger', Math.abs(P.bal) > 0.7);
    }
    if (introT > 0) {
      introT -= dt;
      if (introT <= 0) { ui.mapIntro.classList.add('out'); setTimeout(() => { if (introT <= 0) show(ui.mapIntro, false); }, 420); }
    }
    // challenges done during the run pop up as you go
    if (mode === 'sp' && phase === 'riding' && world.map.goals) {
      world.map.goals.forEach((g, i) => {
        if (!run.goals[i] && g.k !== 'finish' && goalMet(g, false)) { run.goals[i] = true; feed('★ CHALLENGE DONE · ' + g.t.toUpperCase()); Sfx.perfect(); }
      });
    }
    const combo = mine && run.pot > 0 && P.bailT <= 0;
    show(ui.comboBar, combo);
    if (combo) ui.comboFill.style.width = (clamp(run.bankT / 2.4, 0, 1) * 100).toFixed(0) + '%';

    if (trickT > 0) {
      trickT -= dt;
      if (run.pot > 0 && !ui.trick.classList.contains('bail')) {
        const m = mult();
        ui.trickSub.innerHTML = '+' + fmt(run.pot * m) + (m > 1 ? `<span class="mult">x${m.toFixed(2)}</span>` : '');
      }
      if (trickT <= 0) ui.trick.classList.add('fade');
    }
    if (landT > 0) { landT -= dt; if (landT <= 0) ui.landTag.classList.remove('show'); }
    if (bigT > 0) { bigT -= dt; if (bigT <= 0) show(ui.big, false); }
    for (const f of feedEls) if (time - f.t > 5) f.d.style.opacity = '0';

    if (mode === 'mp') {
      updateVoiceLevels(dt);
      const left = (phaseEnds - performance.now()) / 1000;
      const label = serverPhase === 'countdown' ? 'STARTS IN ' + clock(left) : serverPhase === 'racing' ? 'ROUND ENDS IN ' + clock(left) : serverPhase === 'results' ? 'NEXT ROUND IN ' + clock(left) : '';
      setText(ui.mpTimer, 'mpt', label);
      let note = '';
      if (phase === 'spectate') {
        const t = spectateTarget();
        note = (racers.has(myId) ? 'FINISHED · ' : 'RACE IN PROGRESS · YOU JOIN NEXT ROUND · ') + (t ? 'WATCHING ' + t.name.toUpperCase() + ' (← →)' : 'WAITING');
      } else if (phase === 'waiting') note = 'NEXT ROUND STARTS IN ' + clock(left);
      else if (phase === 'countdown' && left > 3) note = 'GET READY · ROUND STARTS IN ' + clock(left);
      else if (phase === 'finished') note = 'FINISHED! WAITING FOR THE OTHERS';
      setText(ui.note, 'note', note);
      show(ui.note, !!note);
      standingsT -= dt;
      if (standingsT <= 0) { standingsT = 0.3; updateStandings(); }
    } else {
      show(ui.note, false);
    }
  }

  const tagOut = [0, 0, 0];
  function placeTag(tag, st) {
    if (!st || !world || !engine.project(st.x, st.y + 2.3, st.z, tagOut, 1 / dpr) || tagOut[2] > 220) {
      tag.style.display = 'none';
      return;
    }
    tag.style.display = 'block';
    tag.style.left = tagOut[0].toFixed(1) + 'px';
    tag.style.top = tagOut[1].toFixed(1) + 'px';
    tag.style.opacity = String(clamp(1.3 - tagOut[2] / 180, 0.35, 1));
  }
  function updateTags(g) {
    for (const r of remotes.values()) placeTag(r.tag, r.st);
    placeTag(ghostTag, g);
  }

  // speed lines and flashes on a 2D layer over the 3D view
  const streaks = [];
  // the 2D overlay (speed streaks, lens glare, flashes) is only cleared after something was drawn on it
  let fxDirty = true;
  function drawFx(dt) {
    const W = ui.fx.width, H = ui.fx.height;
    if (fxDirty) fxCtx.clearRect(0, 0, W, H);
    fxDirty = false;
    const mine = phase === 'riding' || phase === 'finished' || phase === 'attract';
    const sp = mine ? P.speed : 0;
    const k = Math.max(clamp((sp - 24) / 16, 0, 1) * (P.grounded || phase === 'attract' ? 1 : 0.6), mine && P.boosting ? 1 : 0);
    if (k > 0 && settings.quality !== 'low' && !paused) {
      fxDirty = true;
      while (streaks.length < 26) streaks.push({ a: rand(0, TAU), r: rand(0.3, 1.2), l: rand(0.08, 0.2), v: rand(1.2, 2.2) });
      const cx = W / 2, cy = H * 0.48, R = Math.hypot(W, H) * 0.5;
      fxCtx.lineCap = 'round';
      for (const s of streaks) {
        s.r += s.v * dt * (0.6 + k);
        if (s.r > 1.3) { s.r = rand(0.3, 0.5); s.a = rand(0, TAU); s.l = rand(0.08, 0.2); }
        const r0 = s.r * R, r1 = (s.r + s.l) * R;
        const a = Math.min(1, (s.r - 0.3) * 2) * 0.22 * k;
        fxCtx.strokeStyle = `rgba(230,240,255,${a.toFixed(3)})`;
        fxCtx.lineWidth = 1.2 + s.r * 1.5;
        fxCtx.beginPath();
        fxCtx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0);
        fxCtx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
        fxCtx.stroke();
      }
    }
    drawGlare(dt, W, H);
    if (flash > 0) {
      fxDirty = true;
      flash -= dt;
      fxCtx.fillStyle = `rgba(200,255,225,${(flash * 0.25).toFixed(3)})`;
      fxCtx.fillRect(0, 0, W, H);
    }
  }

  // lens glare when looking toward the sun on the day maps
  const sunOut = [0, 0, 0];
  function drawGlare(dt, W, H) {
    if (!world) return;
    const sk = world.map.sky;
    let target = 0;
    const sd = sk.dir;
    if (sk.stars < 0.5 && envK < 0.95 && engine.project(eyeV[0] + sd[0] * 1000, eyeV[1] + sd[1] * 1000, eyeV[2] + sd[2] * 1000, sunOut, 1 / dpr)) {
      const dx = sunOut[0] - W / 2, dy = sunOut[1] - H / 2;
      target = clamp(1.25 - Math.hypot(dx, dy) / (Math.hypot(W, H) * 0.42), 0, 1) * (1 - envK);
      // hidden behind the mountain?
      for (let d = 12; d < 220 && target > 0; d *= 1.45) {
        const x = eyeV[0] + sd[0] * d, z = eyeV[2] + sd[2] * d;
        if (world.ground(x, z) > eyeV[1] + sd[1] * d) target = 0;
      }
    }
    glare += (target - glare) * Math.min(1, dt * 5);
    if (glare < 0.01 || paused) return;
    fxDirty = true;
    const warm = world.mapId === 'sunset';
    const sx = sunOut[0], sy = sunOut[1], R = Math.min(W, H);
    const g = fxCtx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.55);
    g.addColorStop(0, `rgba(255,${warm ? 220 : 250},${warm ? 170 : 225},${(0.55 * glare).toFixed(3)})`);
    g.addColorStop(0.25, `rgba(255,${warm ? 180 : 240},${warm ? 120 : 200},${(0.16 * glare).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,240,200,0)');
    fxCtx.fillStyle = g;
    fxCtx.fillRect(0, 0, W, H);
    fxCtx.fillStyle = `rgba(255,${warm ? 200 : 245},${warm ? 160 : 230},${(0.06 * glare).toFixed(3)})`;
    fxCtx.fillRect(0, 0, W, H);
    // lens ghosts on the line through the centre of the screen
    const cx = W / 2, cy = H / 2;
    const ghosts = [[0.45, 0.05, '160,220,255', 0.08], [0.85, 0.09, '255,200,120', 0.06], [1.25, 0.03, '200,160,255', 0.1], [1.6, 0.13, '140,255,200', 0.04]];
    for (const [t, r, c, a] of ghosts) {
      fxCtx.fillStyle = `rgba(${c},${(a * glare).toFixed(3)})`;
      fxCtx.beginPath();
      fxCtx.arc(sx + (cx - sx) * t * 2, sy + (cy - sy) * t * 2, R * r, 0, TAU);
      fxCtx.fill();
    }
  }

  // ------------------------------------------------------------------ audio
  function updateAudio() {
    if (!Sfx.ctx) return;
    if (paused || mode === 'menu' || !(phase === 'riding' || phase === 'finished')) { Sfx.silence(); return; }
    const sp = P.speed / MAX_SPEED;
    const ground = P.grounded && P.bailT <= 0;
    Sfx.set('wind', 0.03 + sp * 0.16 + (!P.grounded ? 0.05 : 0) + (P.boosting ? 0.1 : 0), 300 + sp * 900 + (P.boosting ? 500 : 0));
    Sfx.set('carve', ground && P.surf !== 2 ? (0.02 + Math.abs(P.steerS) * 0.12) * Math.min(1, sp * 2.5) : 0, 900 + sp * 1200);
    Sfx.set('grind', ground && P.surf === 2 ? 0.18 : 0, 2600 + sp * 1000);
    Sfx.set('slide', ground ? P.slide * 0.3 * Math.min(1, sp * 3) : 0, 600 + sp * 600);
  }

  // ------------------------------------------------------------------ main loop
  const STEP = 1 / 120;
  function simulate(dt) {
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(STEP, left);
      physics(h);
      left -= h;
    }
    run.topSpeed = Math.max(run.topSpeed, P.speed);
    emitSpray(dt);
    trails.get('me').add(P.x, P.z, P.heading + P.yawOff * 0.5, P.grounded && P.surf === 0 && P.bailT <= 0 && P.speed > 2 && !P.pipeMode && !(world.pipeArr && world.sample(world.pipeArr, P.z) > 0.05), 1 + P.slide * 1.2);
  }

  // ---- the lobby's view: a slow drone shot down the mountain (your rider stands in front of it).
  // Every so often it moves on to the next mountain.
  const lob = { z: 0, t: 0, was: false, map: null };
  function lobbyOpen() { return mode === 'menu' && !!ui.title && !ui.title.classList.contains('hidden'); }
  function lobbyCam(dt) {
    if (!lob.was || lob.map !== world) {
      lob.was = true;
      lob.map = world;
      lob.z = P.z || 60;
      lob.t = 0;
      cam.snap = true;
    }
    lob.t += dt;
    lob.z += dt * 2.6;
    if (lob.t > 48 || lob.z > C.LENGTH - 120) { nextAttract(); return; }
    const z = lob.z, cx = world.center(z);
    const ex = cx + 7, ez = z;
    const ey = Math.max(world.ground(ex, ez), world.H(cx, z)) + 8.5;
    const zt = z + 64, xt = world.center(zt) - 3, yt = world.H(world.center(zt), zt) + 1.5;
    const k = cam.snap ? 1 : 1 - Math.exp(-dt * 2);
    cam.snap = false;
    cam.x = lerp(cam.x, ex, k); cam.y = lerp(cam.y, ey, k); cam.z = lerp(cam.z, ez, k);
    cam.tx = lerp(cam.tx, xt, k); cam.ty = lerp(cam.ty, yt, k); cam.tz = lerp(cam.tz, zt, k);
    cam.fov = lerp(cam.fov, 1.0, k); cam.roll = 0;
  }

  function update(dt) {
    time += dt;
    engine.time = time;
    shake = Math.max(0, shake - dt * 2);
    cam.bumpV += (-45 * cam.bump - 9 * cam.bumpV) * dt;
    cam.bump += cam.bumpV * dt;
    let focus = P;

    if (mode === 'menu') {
      if (world && phase === 'attract' && lobbyOpen()) lobbyCam(dt);
      else if (world && phase === 'attract') {
        if (lob.was) { lob.was = false; cam.snap = true; }
        aiThink();
        simulate(dt);
        if (P.finished || P.z > C.LENGTH - 30) nextAttract();
        else if (world.cave && P.z > world.cave[1] + 60) nextAttract();
        const wide = window.innerWidth > 760;
        follow(dt, P, { orbit: Math.sin(time * 0.11) * 0.55 + 0.25, far: true, side: wide ? -3.2 : 0 });
      }
    } else if (phase === 'countdown') {
      if (mode === 'sp') {
        const before = Math.ceil(countdownT);
        countdownT -= dt;
        const now = Math.ceil(countdownT);
        if (now !== before && now > 0 && now <= 3) { setBig(String(now), '', 0.9); Sfx.beep(false); if (introT > 0.3) introT = 0.3; }
        if (countdownT <= 0) go();
      } else {
        const left = (phaseEnds - performance.now()) / 1000;
        const n = Math.ceil(left);
        if (n <= 3 && n >= 1 && ui.bigText.textContent !== String(n)) { setBig(String(n), '', 0.95); Sfx.beep(false); if (introT > 0.3) introT = 0.3; }
      }
      P.crouch = lerp(P.crouch || 0, 0.35, dt * 4);
      if (world && P.x !== undefined) follow(dt, P);
    } else if (phase === 'riding' || phase === 'finished') {
      if (!paused) {
        simulate(dt);
        updateRivals(dt);
        if (!P.finished) { raceT += dt; recordGhost(dt); }
        if (!P.finished && P.z >= C.LENGTH) finish();
        if (P.finished) {
          phase = 'finished';
          if (mode === 'sp' && time - finishedAt > 3.5) showSpResults();
          if (mode === 'mp' && time - finishedAt > 4 && [...remotes.values()].some((r) => r.st && !r.st.fin && racers.has(r.id))) { phase = 'spectate'; cam.snap = true; }
        }
      }
      follow(dt, P);
    } else if (mode === 'mp') {
      const t = spectateTarget();
      if (t) { focus = t.st; follow(dt, t.st); }
      else if (world) {
        focus = { x: world.center(0), z: 0, y: world.H(world.center(0), 0), speed: 0, score: 0 };
        follow(dt, { x: focus.x, y: focus.y, z: focus.z, heading: 0, speed: 0 });
      }
    } else if (phase === 'results') {
      follow(dt, P);
    }

    const now = performance.now();
    for (const r of remotes.values()) {
      interpRemote(r, now);
      const tr = trails.get(r.id);
      if (tr && r.st) tr.add(r.st.x, r.st.z, r.st.heading + r.st.spin * 0.5, r.st.grounded && r.st.surf !== 2 && !r.st.bail, 1 + (r.st.slide || 0) * 1.2);
    }
    if (mode === 'mp' && myId && (phase === 'countdown' || phase === 'riding' || phase === 'finished') && now - lastSend > SEND_MS) {
      lastSend = now;
      sendState();
    }

    if (!paused) {
      updateParticles(dt);
      updateFlakes(dt);
      updateFireworks(dt);
    }
    if (world && mode !== 'menu') updateHud(dt, focus);
    updateAudio();
  }

  // long shadow cast away from a low sun (day maps)
  const SH = M4.create();
  function sunShadow(st, h, alpha) {
    const sd = world.L.sunDir;
    const hl = Math.hypot(sd[0], sd[2]) || 1;
    const ux = -sd[0] / hl, uz = -sd[2] / hl;
    const tanE = Math.max(0.2, sd[1] / hl);
    const len = Math.min(4, 1.7 / tanE);
    const off = Math.min(16, Math.max(0, h) / tanE) + len * 0.5 - 0.2;
    const x = st.x + ux * off, z = st.z + uz * off;
    const e = 0.5;
    const gx = (world.Hk(x + e, z) - world.Hk(x - e, z)) / (2 * e);
    const gz = (world.Hk(x, z + e) - world.Hk(x, z - e)) / (2 * e);
    const k = Math.max(0.25, 1 - h * 0.07);
    M4.identity(SH);
    M4.translate(SH, x, Math.max(world.Hk(x, z), world.H(x, z)) + 0.07, z);
    M4.rotX(SH, -Math.atan(gz));
    M4.rotZ(SH, Math.atan(gx));
    M4.rotY(SH, Math.atan2(ux, uz));
    M4.scale(SH, 0.4, 1, len * 0.5);
    engine.drawBaked(engine.disc, SH, 0.42 * k * (alpha === undefined ? 1 : alpha));
  }

  // where you'll come down if you let go now: a ring on the snow (green when it's on a rail or box)
  const MK = M4.create();
  let markMeshes = null;
  function ringData(col, seg = 32) {
    const out = [];
    const tri = (a, b, c) => out.push(...a, ...col, ...b, ...col, ...c, ...col);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const p = (r, a) => [Math.cos(a) * r, 0, Math.sin(a) * r];
      tri(p(0.72, a0), p(1, a0), p(1, a1));
      tri(p(0.72, a0), p(1, a1), p(0.72, a1));
      tri([0, 0, 0], p(0.16, a0), p(0.16, a1));
    }
    return new Float32Array(out);
  }
  function landingSpot() {
    if (P.grounded || P.bailT > 0 || P.finished || ai.on || mode === 'menu' || P.airT < 0.1) return null;
    const ss = world.surf, sr = world.surfRef;
    const g = P.giant ? GIANT_G : G, dt = 1 / 30;
    let x = P.x, y = P.y, z = P.z, vy = P.vy, hit = null;
    for (let i = 1; i < 200; i++) {
      vy -= g * dt; x += P.vx * dt; z += P.vz * dt; y += vy * dt;
      const h = world.H(x, z);
      if (y <= h) { hit = { x, z, y: h, rail: world.surf === 2, t: i * dt }; break; }
    }
    world.surf = ss; world.surfRef = sr;
    return hit && hit.t > 0.12 ? hit : null;
  }
  function drawLandingMark() {
    const m = landingSpot();
    if (!m) return;
    if (!markMeshes) markMeshes = [engine.mesh(ringData([1, 0.84, 0.32]), 6), engine.mesh(ringData([0.35, 1, 0.55]), 6)];
    const e = 0.5;
    const gx = m.rail ? 0 : (world.Hk(m.x + e, m.z) - world.Hk(m.x - e, m.z)) / (2 * e);
    const gz = m.rail ? 0 : (world.Hk(m.x, m.z + e) - world.Hk(m.x, m.z - e)) / (2 * e);
    const r = (m.rail ? 0.55 : 0.85) * (1 + 0.08 * Math.sin(time * 9));
    M4.identity(MK);
    M4.translate(MK, m.x, m.y + 0.09, m.z);
    M4.rotX(MK, -Math.atan(gz));
    M4.rotZ(MK, Math.atan(gx));
    M4.scale(MK, r, 1, r);
    engine.drawBaked(markMeshes[m.rail ? 1 : 0], MK, clamp(m.t * 2.5, 0.25, 0.8), 1.4);
  }

  const MV = M4.create();
  const riderList = [];
  const tokenGlow = new Float32Array(120 * 8);
  // light, fog and sky for the current spot on the mountain (the cave darkens everything)
  // colour grade, bloom, sun rays and shadow tint for each kind of light
  function setGrade(m) {
    const day = m.sky.stars < 0.5;
    const low = m.light.sunDir[1] < 0.35;
    const col = m.sky.col;
    const G = engine.grade;
    if (day && low) {
      // golden hour / sunset: warm highlights, violet shadows, long glowing rays
      Object.assign(G, { bloom: 0.34, thr: 0.82, sat: 1.16, con: 1.09, lift: [0.028, 0.004, 0.04], gain: [1.06, 0.99, 0.92], vig: 0.34 });
      G.shafts = [col[0] * 0.9, col[1] * 0.75, col[2] * 0.6];
      engine.shadowDark = [0.5, 0.48, 0.7];
      engine.cold = [0.88, 0.88, 1.08];
      engine.haze = [col[0] * 0.42, col[1] * 0.3, col[2] * 0.2];
      engine.mist = [30, 150, 0.65];
      engine.glare = [m.light.sun[0] * 0.55, m.light.sun[1] * 0.45, m.light.sun[2] * 0.35];
    } else if (day) {
      // clear day: crisper and a touch richer, less milky blue in the shadows, warmer sunlit snow
      Object.assign(G, { bloom: 0.22, thr: 0.9, sat: 1.17, con: 1.09, lift: [0.0, 0.004, 0.016], gain: [1.045, 1.005, 0.96], vig: 0.28 });
      G.shafts = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.5];
      engine.shadowDark = [0.45, 0.53, 0.78];
      engine.cold = [0.85, 0.92, 1.09];
      engine.haze = [col[0] * 0.22, col[1] * 0.2, col[2] * 0.16];
      engine.mist = [40, 190, 0.34];
      engine.glare = [m.light.sun[0] * 0.4, m.light.sun[1] * 0.4, m.light.sun[2] * 0.38];
    } else {
      // night: lights bloom, moonlight shadows are soft and blue
      Object.assign(G, { bloom: 0.3, thr: 0.9, sat: 1.1, con: 1.1, lift: [0.0, 0.01, 0.034], gain: [0.98, 1.0, 1.05], vig: 0.42 });
      G.shafts = [col[0] * 0.18, col[1] * 0.2, col[2] * 0.26];
      engine.shadowDark = [0.66, 0.7, 0.86];
      engine.cold = [0.92, 0.96, 1.05];
      engine.haze = [col[0] * 0.06, col[1] * 0.07, col[2] * 0.1];
      engine.mist = [40, 200, 0.45];
      engine.glare = [m.light.sun[0] * 0.25, m.light.sun[1] * 0.25, m.light.sun[2] * 0.3];
    }
  }

  // the far view needs the background worker (it's a lot of ground to build) and a map with open air
  function farView() {
    if (!q.far || !useWorker() || !world) return false;
    world.initChunks();
    return world.farOK && !(world.map.fogFar && world.map.fogFar < q.draw + 60);
  }
  function applyEnv() {
    const e = world.env(cam.z);
    envK = e.k;
    const L = engine.light;
    L.sky = e.sky; L.ground = e.ground; L.moonDir = e.sunDir; L.moonCol = e.sun;
    engine.rim = e.rim;
    engine.fogCol = e.fog;
    const mf = world.map;
    // with the far view the air is as clear as the day is (snowy maps keep their own murk)
    const far = world.farOn ? Math.min(q.far, mf.fogFar || q.far) : Math.min(q.fog, mf.fogFar || q.fog);
    engine.fog = [lerp(mf.fogNear || 80, 14, e.k), lerp(far, 250, e.k)];
  }

  function myState() {
    return {
      key: 'me', x: P.x, y: P.y, z: P.z, heading: P.heading, spin: P.spin + P.yawOff, stance: P.stance, flip: P.flip + (P.butterK || 0) * 0.3, lean: P.lean,
      crouch: P.crouch, comp: P.comp, grab: grabbing() && !P.grounded, air: !P.grounded, tuck: tuckInput() && P.grounded,
      slide: P.slide, wind: P.wind, bail: P.bailT > 0, tumble: P.tumble, tumbleRoll: P.tumbleRoll, t: time, wallRoll: P.wallRoll,
      bailAge: P.bailAge, bailUp: P.bailUp, bailK: P.bailT > 0 ? clamp(Math.abs(P.tumbleV) / 6 + Math.abs(P.rollV) / 6, 0, 1) : 0,
      spinV: P.grounded ? 0 : P.spinVel / SPIN_RATE, flipV: P.grounded ? 0 : P.flipVel / FLIP_RATE, grabType: P.grabType, grabK: P.grounded ? 0 : P.grabAmt, airT: P.grounded ? 0 : P.airT,
      grind: P.surf === 2 && P.grounded, bal: P.surf === 2 ? P.bal : 0, wob: P.wobble, skid: P.grounded ? P.skid || 0 : 0, vy: P.vy, speed: P.speed, charge: P.crouchT > 0 ? 1 : 0,
    };
  }
  const SC = [0, 0, 0];
  const sunUV = [0, 0];
  // ---- the stage: your rider standing in the menus (lobby, locker, shop try-on, results), drawn on
  // top of the mountain with a camera of its own. Where it stands comes from a .stage box in the
  // page; pages with data-blur / data-dim soften the mountain behind them.
  const stage = { els: [], fxEls: [], el: null, fx: null, look: null, t: 0, last: 0, drag: 0, held: -9 };
  const STAGE_ST = { x: 0, y: 0, z: 0, heading: 0, pose: 'stand', t: 0 };
  const STAGE_W = { nearLamps: () => null, Hk: () => 0, H: () => 0 };
  const STAGE_SM = M4.create();
  const shownEl = (el) => el.getClientRects().length > 0;
  function stageInit() {
    stage.els = [...document.querySelectorAll('.stage')];
    stage.fxEls = [...document.querySelectorAll('[data-blur]')];
    for (const el of stage.els) {
      let x0 = null;
      el.addEventListener('pointerdown', (e) => { x0 = e.clientX; el.setPointerCapture(e.pointerId); el.classList.add('grab'); });
      el.addEventListener('pointermove', (e) => {
        if (x0 === null) return;
        stage.drag += (e.clientX - x0) * 0.011;
        stage.held = stage.t;
        x0 = e.clientX;
      });
      const up = () => { x0 = null; el.classList.remove('grab'); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      for (const b of el.querySelectorAll('[data-turn]')) b.addEventListener('click', (e) => { e.stopPropagation(); stage.drag += +b.dataset.turn * 0.8; stage.held = stage.t; });
      for (const b of el.querySelectorAll('[data-turn]')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  }
  function stageTick(now) {
    stage.el = null; stage.fx = null;
    if (!world) return;
    for (const el of stage.els) if (shownEl(el)) { stage.el = el; break; }
    for (const el of stage.fxEls) if (shownEl(el)) { stage.fx = el; break; }
    const rdt = Math.min(0.1, Math.max(0, (now - (stage.last || now)) / 1000));
    stage.last = now;
    stage.t += rdt;
    // a few seconds after you let go, the rider turns back to face you
    const idle = stage.t - stage.held;
    if (idle > 2.5 && stage.drag) {
      const turns = Math.round(stage.drag / (Math.PI * 2)) * Math.PI * 2;
      stage.drag = turns + (stage.drag - turns) * Math.exp(-rdt * 2.2);
      if (Math.abs(stage.drag - turns) < 0.002) stage.drag = 0;
    }
  }
  function setStageLook(look) { stage.look = look || null; }
  function drawStage() {
    const fx = stage.fx;
    engine.backdrop(fx ? +fx.dataset.blur || 0 : 0, fx ? +fx.dataset.dim || 0 : 0);
    const el = stage.el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cv = engine.canvas, cw = cv.clientWidth || window.innerWidth, ch = cv.clientHeight || window.innerHeight;
    const kx = engine.w / cw, ky = engine.h / ch;
    const vx = Math.round(r.left * kx), vy = Math.round((ch - r.bottom) * ky);
    const vw = Math.max(1, Math.round(r.width * kx)), vh = Math.max(1, Math.round(r.height * ky));
    const d = el.dataset;
    const idle = stage.t - stage.held;
    const sway = idle > 2.5 ? Math.sin((idle - 2.5) * 0.45) * 0.22 * Math.min(1, (idle - 2.5) / 2) : 0;
    const yaw = Math.PI / 2 + (+d.yaw || 0.42) + stage.drag + sway;
    const dist = +d.d || 4.6, fov = +d.fov || 0.5;
    const eye = [Math.sin(yaw) * dist, +d.cy || 1.12, Math.cos(yaw) * dist], tgt = [0, +d.ty || 0.93, 0];
    const L = engine.light;
    const keep = { sky: L.sky, ground: L.ground, moonDir: L.moonDir, moonCol: L.moonCol, rim: engine.rim, fog: engine.fog, fogCol: engine.fogCol, w: engine.w, h: engine.h, shadowOn: engine.shadowOn, haze: engine.haze };
    // a soft key light from above the camera's left shoulder, sky fill and a cool rim
    const kx2 = Math.sin(yaw - 0.8) * 0.62, kz2 = Math.cos(yaw - 0.8) * 0.62, kl = Math.hypot(kx2, 0.8, kz2);
    L.sky = [0.58, 0.63, 0.74]; L.ground = [0.3, 0.3, 0.32];
    L.moonDir = [kx2 / kl, 0.8 / kl, kz2 / kl]; L.moonCol = [0.98, 0.95, 0.9];
    engine.rim = [0.34, 0.42, 0.56]; engine.fog = [5000, 9000]; engine.fogCol = [0.85, 0.9, 0.96];
    engine.shadowOn = false; engine.haze = [0, 0, 0];
    engine.w = vw; engine.h = vh;
    gl.viewport(vx, vy, vw, vh);
    try {
      engine.setCamera(eye, tgt, fov, 0);
      engine.beginBaked();
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      // a soft shadow under your feet and the board: a few see-through discs, smaller and darker inward
      for (let i = 0; i < 9; i++) {
        const k = 1 - i * 0.095;
        M4.identity(STAGE_SM);
        M4.translate(STAGE_SM, 0.04, 0.004 + i * 0.0004, 0.2);
        M4.scale(STAGE_SM, 0.52 * k, 1, 0.8 * k);
        engine.drawBaked(engine.disc, STAGE_SM, 0.05);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      STAGE_ST.t = time;
      engine.beginLit();
      SS.drawRider(engine, STAGE_W, STAGE_ST, stage.look || myLook());
    } finally {
      Object.assign(L, { sky: keep.sky, ground: keep.ground, moonDir: keep.moonDir, moonCol: keep.moonCol });
      Object.assign(engine, { rim: keep.rim, fog: keep.fog, fogCol: keep.fogCol, w: keep.w, h: keep.h, shadowOn: keep.shadowOn, haze: keep.haze });
      gl.viewport(0, 0, engine.w, engine.h);
    }
  }

  function render(g) {
    if (!world) { engine.beginFrame(false); engine.clear(engine.fogCol); return; }
    applyEnv();
    // sun shadows: riders near you are drawn from the sun into a shadow map
    engine.shadowOn = false;
    const shadowList = [];
    const showMe0 = !stage.el && !lobbyOpen() && (phase === 'attract' || phase === 'riding' || phase === 'finished' || phase === 'countdown' || (phase === 'results' && mode === 'sp'));
    if (q.shadows && envK < 0.6 && showMe0 && P.x !== undefined) {
      SC[0] = P.x; SC[1] = P.y + 0.8; SC[2] = P.z;
      engine.beginShadow(SC, world.L.sunDir, 10, q.shadows);
      shadowList.push(myState());
      SS.drawRider(engine, world, shadowList[0], 0);
      const near = [];
      if (rivals.length) { const o = []; rivalStates(o); for (const r of o) if (Math.abs(r.st.z - P.z) < 12 && Math.abs(r.st.x - P.x) < 12) near.push(r); }
      for (const r of remotes.values()) if (r.st && racers.has(r.id) && Math.abs(r.st.z - P.z) < 12 && Math.abs(r.st.x - P.x) < 12) near.push({ st: r.st, color: r.look || r.color });
      for (const r of near) { SS.drawRider(engine, world, r.st, r.color); shadowList.push(r.st); }
      engine.endShadow();
    }
    engine.postLite = q.post === 'lite';
    engine.beginFrame(q.post);
    engine.clear(engine.fogCol);
    const sx = shake ? (Math.random() - 0.5) * shake * 0.25 : 0;
    const sy = shake ? (Math.random() - 0.5) * shake * 0.2 : 0;
    eyeV[0] = cam.x + sx; eyeV[1] = cam.y + sy + cam.bump; eyeV[2] = cam.z;
    tgtV[0] = cam.tx + sx; tgtV[1] = cam.ty + sy + cam.bump * 0.6; tgtV[2] = cam.tz;
    engine.setCamera(eyeV, tgtV, cam.fov, cam.roll);

    // sky (procedural), stars and distant mountains
    if (envK < 0.99) {
      engine.drawSky(backdrop.sky);
      gl.depthMask(false);
      if (world.map.sky.stars > 0.5) engine.drawPoints(null, backdrop.starCount, { mesh: backdrop.stars, offset: eyeV, additive: true, max: 48 });
      engine.beginBaked(700, 2300);
      engine.groom(false);
      M4.identity(MV);
      M4.translate(MV, eyeV[0], eyeV[1] - 70, eyeV[2]);
      engine.drawBaked(world.mountains(engine), MV);
      gl.depthMask(true);
    }

    // the mountain
    engine.beginBaked();
    engine.setDetail(q.detail > 0);
    world.draw(engine, cam.z);
    if (world.farOn) world.drawFar(engine, cam.z, q.far);
    engine.setDetail(false);

    drawTrails();

    // who to draw
    riderList.length = 0;
    const showMe = !stage.el && !lobbyOpen() && (phase === 'attract' || phase === 'riding' || phase === 'finished' || phase === 'countdown' || (phase === 'results' && mode === 'sp'));
    if (showMe && P.x !== undefined) {
      riderList.push({ st: shadowList[0] || myState(), color: myLook(), alpha: 1 });
    }
    for (const r of remotes.values()) {
      if (r.st && racers.has(r.id) && Math.hypot(r.st.x - eyeV[0], r.st.y + 1 - eyeV[1], r.st.z - eyeV[2]) > 3.2) riderList.push({ st: r.st, color: r.look || r.color, alpha: 1 });
    }
    if (g && Math.hypot(g.x - eyeV[0], g.y + 1 - eyeV[1], g.z - eyeV[2]) > 3.2) riderList.push({ st: g, color: 8, alpha: 0.35 });
    if (rivals.length && showMe) rivalStates(riderList);

    engine.beginBaked();
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    const sunny = world.map.shadows && envK < 0.5;
    for (const r of riderList) {
      if (Math.abs(r.st.z - cam.z) > 260) continue;
      if (engine.shadowOn && r.alpha >= 1 && (shadowList.includes(r.st) || (Math.abs(r.st.z - P.z) < 9 && Math.abs(r.st.x - P.x) < 9))) continue;
      const h = r.st.y - world.Hk(r.st.x, r.st.z);
      if (sunny) sunShadow(r.st, h, r.alpha);
      else SS.drawShadow(engine, world, r.st.x, r.st.z, r.st.heading, h, r.alpha);
    }
    if (settings.marker !== false) drawLandingMark();
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    engine.beginLit();
    for (const r of riderList) {
      if (Math.abs(r.st.z - cam.z) > 300 || r.alpha < 1) continue;
      SS.drawRider(engine, world, r.st, r.color);
    }
    // tokens
    engine.setLights(null);
    const tz0 = cam.z - 5, tz1 = cam.z + 130;
    let glowN = 0;
    for (let b = ((tz0 - C.Z0) / 10) | 0; b <= ((tz1 - C.Z0) / 10) | 0; b++) {
      const list = world.tokenBuckets[b];
      if (!list) continue;
      for (const t of list) {
        if (tokenGot.has(t.id) && mode !== 'menu') continue;
        SS.drawToken(engine, t.x, t.y, t.z, time);
        if (glowN < 120) {
          const j = glowN * 8;
          tokenGlow[j] = t.x; tokenGlow[j + 1] = t.y + Math.sin(time * 2.2 + t.x) * 0.12; tokenGlow[j + 2] = t.z;
          tokenGlow[j + 3] = 0.35; tokenGlow[j + 4] = 0.85; tokenGlow[j + 5] = 1.0; tokenGlow[j + 6] = 0.28; tokenGlow[j + 7] = 1.8;
          glowN++;
        }
      }
    }
    // the ghost last, see-through
    for (const r of riderList) if (r.alpha < 1) SS.drawRider(engine, world, r.st, r.color, r.alpha);

    engine.drawPoints(null, world.glowCount || 0, { mesh: world.glows(engine), additive: true });
    engine.drawPoints(tokenGlow, glowN, { additive: true, soft: 1 });
    drawParticles();
    const sf = world.map.snowfall;
    if (motes) engine.drawPoints(flakes, FLAKES >> 1, { soft: 1, max: 5, additive: true });
    else if (sf > 0) engine.drawPoints(flakes, Math.round(FLAKES * Math.min(1, sf)), { soft: 1, max: sf > 1 ? 8 : 6 });
    else engine.drawPoints(flakes, 150, { soft: 1, max: 4, additive: true });

    if (stage.el || stage.fx) drawStage();

    // sun rays when the sun (or moon) is on or near the screen
    let rays = 0;
    if (q.rays && envK < 0.5 && !stage.fx) {
      const d = engine.sky.dir, m = engine.vp;
      const x = eyeV[0] + d[0] * 1000, y = eyeV[1] + d[1] * 1000, z = eyeV[2] + d[2] * 1000;
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw > 0) {
        sunUV[0] = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw) * 0.5 + 0.5;
        sunUV[1] = ((m[1] * x + m[5] * y + m[9] * z + m[13]) / cw) * 0.5 + 0.5;
        rays = clamp(1.6 - Math.max(Math.abs(sunUV[0] - 0.5), Math.abs(sunUV[1] - 0.5)) * 1.6, 0, 1) * (1 - envK * 2);
      }
    }
    engine.motion = phase === 'riding' && !paused && P.bailT <= 0 ? clamp((P.speed - 27) / 16, 0, 1) * 0.6 : 0;
    engine.endFrame(rays > 0 ? sunUV : null, rays);
  }

  // adaptive resolution for slower computers: it gives back the extra sharpness on high-DPI
  // screens, but never drops below one pixel per screen pixel (that's what made everything blurry)
  let perfAcc = 0, perfN = 0;
  function perf(dt) {
    perfAcc += dt;
    perfN++;
    if (perfN >= 90) {
      const avg = perfAcc / perfN;
      if (avg > 0.034 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); }
      perfAcc = 0;
      perfN = 0;
    }
  }

  // frame rate cap (30 / 60 / 90). The screen's own refresh interval is measured. At or above it,
  // every frame is drawn; when the screen is a whole multiple of the cap (30 on 60 Hz, 60 on 120 Hz)
  // exactly every 2nd/4th frame is drawn; otherwise frames are skipped until the next one is due,
  // keeping the average rate (90 on 144 Hz).
  let last = performance.now(), lastRaf = 0, rafDt = 16.7, lastDraw = 0, skipN = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (lastRaf) rafDt += (clamp(now - lastRaf, 3, 60) - rafDt) * 0.1;
    lastRaf = now;
    const step = 1000 / (+settings.fps || 60), ratio = step / rafDt, nInt = Math.round(ratio);
    if (ratio < 1.08) lastDraw = now;
    else if (nInt >= 2 && Math.abs(ratio - nInt) < 0.06 * nInt) {
      if (++skipN < nInt) return;
      skipN = 0;
      lastDraw = now;
    } else {
      const el = now - lastDraw;
      if (el < step - rafDt * 0.5) return;
      lastDraw = el < step * 2 ? lastDraw + step : now;
    }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (world) world.ensureChunks(engine, lobbyOpen() ? lob.z : P.z || 0, 1);
    update(dt);
    // a fresh season-pass photo, taken before the frame you see so it never shows on screen
    thumbTick();
    // the loading screen at start-up goes once the mountain has been drawn for a moment
    if (bootLoad && world && now > bootLoad) { bootLoad = 0; show(ui.loading, false); }
    stageTick(now);
    const g = ghostState();
    render(g);
    updateTags(g);
    drawMap();
    drawFx(dt);
    perf(dt);
  }

  // ------------------------------------------------------------------ boot
  let bootLoad = performance.now() + 1100;
  showLoading('PREPARING THE MOUNTAIN');
  stageInit();
  lobbyInit();
  applySettings();
  if (SS.Shop) {
    SS.Shop.init({
      stageLook: (look) => setStageLook(look),
      setPage: (pg) => setPage(pg),
      thumb,
      myLook: () => myLook(),
      lookChanged: () => buildSwatches(),
      outfit: () => settings.outfit | 0,
      setOutfit: (i) => setOutfit(i),
      rider: () => settings.rider,
      setRider: (id) => setRider(id),
      startCup,
      toast,
    });
  }
  if (SS.Account) SS.Account.init({ save: accountSave, apply: applyAccountSave, setName: setAccountName, toast, changed: () => drawAvatar() });
  buildSwatches();
  useWorld(20261117, spMap);
  startAttract();
  for (let i = 0; i < FLAKES; i++) resetFlake(i, true);
  requestAnimationFrame(frame);

  // test hook: open the game with ?debug to drive it from the browser console
  if (/[?&]debug\b/.test(location.search)) {
    window.ShredSlopeDebug = {
      lockCam(o) { camLock = o; },
      ideal(f) { return idealSpeed(f); },
      get voice() { return voice; },
      get q() { return q; },
      keys, P, run, cam, ai, engine,
      crash(reason) { bail(reason); },
      get world() { return world; },
      get spec() { const t = spectateTarget(); return t && t.st && { id: t.id, x: t.st.x, y: t.st.y, z: t.st.z, heading: t.st.heading, speed: t.st.speed }; },
      sim(seconds, bot) {
        const steps = Math.round(seconds / STEP);
        for (let i = 0; i < steps && (phase === 'riding' || (phase === 'finished' && rivals.length)); i++) {
          updateRivals(STEP);
          if (P.finished) continue;
          if (bot) bot(P, world, keys, ShredSlopeDebug);
          physics(STEP);
          if (!P.finished) { raceT += STEP; recordGhost(STEP); }
          run.topSpeed = Math.max(run.topSpeed, P.speed);
          if (!P.finished && P.z >= C.LENGTH) { finish(); phase = 'finished'; }
        }
        return { z: P.z, x: P.x, speed: P.speed, t: raceT, score: run.score, pot: run.pot, tricks: run.tricks, bails: run.bails, finished: P.finished, grounded: P.grounded, tokens: run.tokens, perfects: run.perfects };
      },
      startMap(id, seed) { spMap = id; lastSpSeed = seed === undefined ? null : seed; startSingle(seed !== undefined, id); },
      skipCountdown() { if (phase === 'countdown') { countdownT = 0.001; } },
      setBoost(v) { run.boost = v; },
      progress,
      pop() { if (P.grounded || P.coyote > 0) pop(); },
      get phase() { return phase; },
      // a studio photo of a rider (for checking how the model looks): returns a PNG data URL
      studio(o) {
        const cv = document.createElement('canvas');
        cv.width = o.w || 400; cv.height = o.h || 560;
        const keep = Object.assign({}, STAND);
        if (o.st) Object.assign(STAND, o.st);
        studioShot(cv, Object.assign({ look: myLook(), yaw: 0.62, d: 4.1, cy: 1.15, ty: 0.83, fov: 0.6, floor: 0.905 }, o));
        Object.assign(STAND, keep);
        return cv.toDataURL('image/png');
      },
      get ghost() { return bestGhost && { seed: bestGhost.seed, n: bestGhost.frames.length, first: bestGhost.frames[0], worldSeed: world.seed, state: ghostState() }; },
    };
  }

  window.ShredSlope = {
    get phase() { return phase; },
    get mode() { return mode; },
    get player() { return { x: P.x, y: P.y, z: P.z, speed: P.speed, grounded: P.grounded, surf: P.surf, bail: P.bailT > 0, finished: P.finished, boost: run.boost, bal: P.bal }; },
    get map() { return world && world.mapId; },
    get run() { return { ...run }; },
    get remotes() { return [...remotes.values()].map((r) => ({ id: r.id, name: r.name, st: r.st && { x: r.st.x, z: r.st.z } })); },
    get net() { return { id: myId, phase: serverPhase, server: serverInfo && serverInfo.name }; },
  };
})();
