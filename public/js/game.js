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
  const G = 14;              // gravity in the air (a bit floaty)
  const SPIN_RATE = 7.6;     // rad/s while holding left/right in the air
  const FLIP_RATE = 6.0;     // rad/s while holding up/down in the air
  const MAX_SPEED = 42;      // m/s
  const TARGET_TIME = 150;   // s: finishing faster than this earns a time bonus
  const SPIN_PTS = [0, 150, 350, 700, 1100, 1600, 2300, 3100, 4000];
  const GRABS = ['METHOD', 'INDY', 'MUTE', 'STALEFISH', 'MELON', 'TAIL GRAB', 'NOSE GRAB'];
  const SEND_MS = 1000 / 12;
  const BEST_KEY = 'shredSlope3d.best';
  const NAME_KEY = 'shredSlope.name';
  const MUTE_KEY = 'shredSlope.muted';

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
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ui = {};
  ['hud', 'zone', 'mpbar', 'mpServer', 'mpTimer', 'score', 'trick', 'trickName', 'trickSub', 'speedLbl', 'speedVal', 'speedUnit',
    'speedBar', 'subStats', 'timer', 'minimap', 'alt', 'left', 'popMeter', 'popBar', 'standings', 'feed', 'big', 'bigText', 'bigSub',
    'note', 'tags', 'menuBtn', 'title', 'nameInput', 'spBtn', 'mpBtn', 'bestScore', 'servers', 'serverList', 'serverMsg', 'backBtn',
    'pauseMenu', 'resumeBtn', 'restartBtn', 'quitBtn', 'results', 'resTitle', 'resBody', 'againBtn', 'resMenuBtn', 'resNote',
    'loading', 'loadingText', 'nogl', 'touch'].forEach((id) => { ui[id] = $(id); });

  // ------------------------------------------------------------------ engine
  let engine;
  try {
    engine = new SS.Engine($('gl'));
  } catch (e) {
    show(ui.title, false);
    show(ui.nogl, true);
    console.error(e);
    return;
  }
  const gl = engine.gl;
  const backdrop = SS.buildBackdrop(engine);
  let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  function resize() { engine.resize(window.innerWidth, window.innerHeight, dpr); }
  resize();
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------------ state
  let mode = 'menu';      // menu | sp | mp
  let phase = 'menu';     // menu | countdown | riding | finished | waiting | spectate | results
  let paused = false;
  let world = null;
  let time = 0;
  let raceT = 0;
  let countdownT = 0;
  let finishedAt = 0;
  let myColor = 0;
  let shake = 0;
  let lastSend = 0;
  let zoneName = '';

  const P = {
    x: 0, y: 0, z: 0, speed: 0, heading: 0, slip: 0, vx: 0, vy: 0, vz: 0,
    grounded: true, surf: 0, grindRef: null, grind: 0, airT: 0,
    spin: 0, flip: 0, spinVel: 0, flipVel: 0, spinLock: 0, flipLock: 0, grabT: 0,
    stance: 0, lean: 0, crouch: 0, charge: 0, charging: false, coyote: 0,
    bailT: 0, tumble: 0, tumbleRoll: 0, tumbleV: 0, inv: 0, finished: false, yawOff: 0,
  };
  const run = { score: 0, pot: 0, combo: 0, bankT: 0, tricks: 0, bails: 0, topSpeed: 0, bigAir: 0, finalTime: 0, bonus: 0 };
  let best = Number(store.get(BEST_KEY, 0)) || 0;
  ui.bestScore.textContent = fmt(best);

  let playerName = String(store.get(NAME_KEY, '') || '').slice(0, 16);
  if (!playerName) playerName = 'Rider' + Math.floor(100 + Math.random() * 900);
  ui.nameInput.value = playerName;
  Sfx.muted = !!store.get(MUTE_KEY, false);

  // ------------------------------------------------------------------ input
  const keys = { left: false, right: false, up: false, down: false, grab: false };
  const touch = { left: false, right: false, flip: false, pop: false };
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ShiftLeft: 'grab', ShiftRight: 'grab', KeyE: 'grab' };
  const steerInput = () => (keys.right || touch.right ? 1 : 0) - (keys.left || touch.left ? 1 : 0);
  const flipInput = () => (keys.up ? 1 : 0) - (keys.down || touch.flip ? 1 : 0);
  const grabbing = () => keys.grab || (touch.pop && !P.grounded);
  const typing = () => document.activeElement === ui.nameInput;

  window.addEventListener('keydown', (e) => {
    if (typing()) {
      if (e.code === 'Enter') ui.nameInput.blur();
      return;
    }
    const k = KEYMAP[e.code];
    if (k) {
      keys[k] = true;
      e.preventDefault();
      if (phase === 'spectate' && !e.repeat && (k === 'left' || k === 'right')) cycleSpectate(k === 'right' ? 1 : -1);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) chargeStart();
    } else if (e.code === 'Escape') {
      if (!e.repeat) toggleMenu();
    } else if (e.code === 'KeyM') {
      if (!e.repeat) toggleMute();
    } else if (e.code === 'Enter' && phase === 'results' && mode === 'sp') {
      startSingle();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
    if (e.code === 'Space') chargeRelease();
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    for (const k in touch) touch[k] = false;
    if (mode === 'sp' && (phase === 'riding' || phase === 'countdown') && !paused) toggleMenu();
  });

  function chargeStart() {
    if (phase !== 'riding' || paused || P.bailT > 0 || P.finished) return;
    P.charging = true;
    P.charge = 0;
  }
  function chargeRelease() {
    if (!P.charging) return;
    P.charging = false;
    show(ui.popMeter, false);
    if (phase !== 'riding' || P.bailT > 0) return;
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
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enableTouch();
  window.addEventListener('touchstart', enableTouch, { passive: true });
  ui.touch.querySelectorAll('button').forEach((b) => {
    const k = b.dataset.k;
    const set = (on) => {
      if (touch[k] === on) return;
      touch[k] = on;
      b.classList.toggle('on', on);
      if (k === 'pop') { if (on) chargeStart(); else chargeRelease(); }
      if (on && phase === 'spectate' && (k === 'left' || k === 'right')) cycleSpectate(k === 'right' ? 1 : -1);
    };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* ok */ } set(true); });
    b.addEventListener('pointerup', () => set(false));
    b.addEventListener('pointercancel', () => set(false));
    b.addEventListener('lostpointercapture', () => set(false));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ------------------------------------------------------------------ world
  let mapBase = null;
  function useWorld(seed) {
    if (world && world.seed === (seed >>> 0)) return;
    if (world) world.dispose(engine);
    world = new SS.World(seed);
    world.ensureChunks(engine, 0, 14);
    mapBase = document.createElement('canvas');
    mapBase.width = ui.minimap.width;
    mapBase.height = ui.minimap.height;
    world.drawMinimap(mapBase);
  }

  function resetRider() {
    const z = 2;
    Object.assign(P, {
      x: world.center(z), z, speed: 0, heading: 0, slip: 0, vx: 0, vy: 0, vz: 0,
      grounded: true, surf: 0, grindRef: null, grind: 0, airT: 0,
      spin: 0, flip: 0, spinVel: 0, flipVel: 0, spinLock: 0, flipLock: 0, grabT: 0,
      stance: 0, lean: 0, crouch: 0.2, charge: 0, charging: false, coyote: 0,
      bailT: 0, tumble: 0, tumbleRoll: 0, tumbleV: 0, inv: 0, finished: false, yawOff: -0.3,
    });
    P.y = world.H(P.x, P.z);
    Object.assign(run, { score: 0, pot: 0, combo: 0, bankT: 0, tricks: 0, bails: 0, topSpeed: 0, bigAir: 0, finalTime: 0, bonus: 0 });
    raceT = 0;
    zoneName = '';
    cam.snap = true;
    setTrick('', '', false, 0);
  }

  // ------------------------------------------------------------------ particles
  const PMAX = 1600;
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
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      emit(x, y + 0.1, z, vx * 0.5 + Math.cos(a) * power * rand(0.3, 1), rand(1, 3) * power * 0.5, vz * 0.5 + Math.sin(a) * power * rand(0.3, 1),
        rand(0.5, 1.2), rand(0.12, 0.3), 0.92, 0.95, 1.0, 0.85, false);
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
      pp[o + 4] -= (add ? 9 : 5) * dt;
      const drag = Math.exp(-(add ? 0.5 : 1.6) * dt);
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
      out[j + 6] = pp[o + 12] * Math.min(1, k * 1.5);
      out[j + 7] = pp[o + 8] * (add ? 1 : 0.6 + (1 - k) * 0.8);
    }
    engine.drawPoints(outA, na, { soft: 1 });
    engine.drawPoints(outB, nb, { soft: 1, additive: true });
  }

  // falling snow around the camera
  const FLAKES = 700;
  const flakes = new Float32Array(FLAKES * 8);
  function initFlakes() {
    for (let i = 0; i < FLAKES; i++) resetFlake(i, true);
  }
  function resetFlake(i, anywhere) {
    const o = i * 8;
    flakes[o] = cam.x + rand(-35, 35);
    flakes[o + 1] = cam.y + (anywhere ? rand(-8, 22) : rand(14, 24));
    flakes[o + 2] = cam.z + rand(-10, 70);
    flakes[o + 3] = 0.9; flakes[o + 4] = 0.93; flakes[o + 5] = 1.0; flakes[o + 6] = rand(0.35, 0.8); flakes[o + 7] = rand(0.04, 0.09);
  }
  function updateFlakes(dt) {
    const sway = Math.sin(time * 0.7) * 0.6;
    for (let i = 0; i < FLAKES; i++) {
      const o = i * 8;
      flakes[o + 1] -= 1.6 * dt;
      flakes[o] += sway * dt;
      const dx = flakes[o] - cam.x, dy = flakes[o + 1] - cam.y, dz = flakes[o + 2] - cam.z;
      if (dy < -10 || dz < -12 || dz > 75 || Math.abs(dx) > 40) resetFlake(i, dz < -12 || dz > 75 || Math.abs(dx) > 40);
    }
  }

  // ------------------------------------------------------------------ rider physics
  function pop() {
    const c = P.charge;
    if (P.grounded) {
      const sh = Math.sin(P.heading), ch = Math.cos(P.heading);
      const vx = sh * P.speed + ch * P.slip, vz = ch * P.speed - sh * P.slip;
      takeoff(vx, vz);
      P.coyote = 0;
      P.vy += 3.2 + 3.8 * c;
    } else {
      P.vy += 2.6 + 3.0 * c; // late pop off a lip
      P.coyote = 0;
    }
    P.charge = 0;
    Sfx.pop();
    burst(P.x, P.y, P.z, 8, 2, P.vx, P.vz);
  }

  function takeoff(vx, vz) {
    if (P.surf === 2) endGrind();
    P.grounded = false;
    P.vx = vx;
    P.vz = vz;
    P.airT = 0;
    P.spin = 0;
    P.flip = 0;
    P.spinVel = 0;
    P.flipVel = 0;
    P.grabT = 0;
    P.spinLock = steerInput();
    P.flipLock = flipInput();
    P.surf = 0;
    P.coyote = 0.14;
  }

  function startGrind(f) {
    P.grindRef = f;
    P.grind = 0;
  }

  function endGrind() {
    const f = P.grindRef;
    if (f && P.grind > 0.25) addTrick(f.type === 'box' ? 'BOX 50-50' : 'RAIL 50-50', Math.round(150 + P.grind * 450));
    P.grindRef = null;
    P.grind = 0;
  }

  function groundStep(dt, steer) {
    const w = world;
    const grinding = P.surf === 2 && P.grindRef;
    if (grinding) {
      const f = P.grindRef;
      P.heading = lerpAngle(P.heading, f.ang, Math.min(1, dt * 12));
      const lat = (P.x - f.ax) * f.dz - (P.z - f.az) * f.dx;
      const k = Math.min(1, dt * 10);
      P.x -= f.dz * lat * k;
      P.z += f.dx * lat * k;
      P.slip = 0;
    } else {
      const turn = lerp(2.3, 1.3, clamp(P.speed / 35, 0, 1));
      P.heading += steer * turn * dt;
      if (!steer) P.heading *= Math.exp(-0.35 * dt);
      P.heading = clamp(P.heading, -1.3, 1.3);
    }

    const e = 0.35;
    let gx, gz;
    if (grinding) { gx = 0; gz = 0; }
    else {
      gx = (w.Hk(P.x + e, P.z) - w.Hk(P.x - e, P.z)) / (2 * e);
      gz = (w.Hk(P.x, P.z + e) - w.Hk(P.x, P.z - e)) / (2 * e);
    }
    const sh = Math.sin(P.heading), ch = Math.cos(P.heading);
    let along = grinding ? -(P.grindRef.g1 - P.grindRef.g0) / P.grindRef.len : -(gx * sh + gz * ch);
    const sinA = along / Math.sqrt(1 + along * along);
    const tuck = (keys.down || false) && !grinding;
    const brake = (keys.up || P.finished) && !grinding;
    const mu = grinding ? 0.015 : 0.035 + 0.06 * Math.abs(steer) + (brake ? 0.45 : 0) + (P.charging ? 0.02 : 0);
    let acc = 9.8 * sinA - 9.8 * mu - (tuck ? 0.0005 : 0.0008) * P.speed * P.speed;
    P.speed = clamp(P.speed + acc * dt, P.finished ? 0 : 1.2, MAX_SPEED);

    if (!grinding) {
      const cross = -(gx * ch - gz * sh);
      P.slip += 9.8 * cross * 0.85 * dt;
      P.slip *= Math.exp(-2.2 * dt);
    }
    const vx = sh * P.speed + ch * P.slip, vz = ch * P.speed - sh * P.slip;
    const nx = P.x + vx * dt, nz = P.z + vz * dt;
    const nh = w.H(nx, nz);
    const nSurf = w.surf, nRef = w.surfRef;

    if (nSurf === 2 && P.surf !== 2 && nh - P.y > 0.3) {
      P.x = nx; P.z = nz;
      bail('CAUGHT AN EDGE');
      return;
    }
    const yb = P.y + P.vy * dt - 0.5 * G * dt * dt;
    if (nh < yb - 0.04 && P.speed > 4) {
      takeoff(vx, vz);
      P.x = nx; P.z = nz; P.y = yb;
      P.vy -= G * dt;
      return;
    }
    P.vy = clamp((nh - P.y) / dt, -60, 60);
    P.x = nx; P.z = nz; P.y = nh;
    const wasGrind = P.surf === 2;
    P.surf = nSurf;
    if (nSurf === 2) {
      if (!wasGrind || P.grindRef !== nRef) startGrind(nRef);
      P.grind += dt;
    } else if (wasGrind) endGrind();

    P.lean = lerp(P.lean, grinding ? 0 : steer * clamp(P.speed / 18, 0.35, 1) * 0.42, Math.min(1, dt * 6));
    // the board rides a little across the fall line, more when carving
    P.yawOff = lerp(P.yawOff, grinding ? 0 : -0.3 - steer * 0.16, Math.min(1, dt * 5));
    const cTarget = P.charging ? 0.45 + P.charge * 0.5 : tuck ? 0.75 : 0.18 + Math.abs(steer) * 0.15;
    P.crouch = lerp(P.crouch, cTarget, Math.min(1, dt * 10));
    if (run.pot > 0 && P.surf !== 2) {
      run.bankT -= dt;
      if (run.bankT <= 0) bank();
    }
  }

  function airStep(dt, steer) {
    P.airT += dt;
    if (P.coyote > 0) P.coyote -= dt;
    P.vy -= G * dt;
    P.x += P.vx * dt;
    P.z += P.vz * dt;
    P.y += P.vy * dt;

    if (P.spinLock && steer !== P.spinLock) P.spinLock = 0;
    const s = P.spinLock ? 0 : steer;
    const fi = flipInput();
    if (P.flipLock && fi !== P.flipLock) P.flipLock = 0;
    const f = P.flipLock ? 0 : fi;
    if (s) P.spinVel += (s * SPIN_RATE - P.spinVel) * Math.min(1, dt * 9);
    else {
      P.spinVel *= Math.exp(-7 * dt);
      const tgt = Math.round((P.spin + P.stance) / Math.PI) * Math.PI - P.stance;
      P.spin += clamp(tgt - P.spin, -2.6 * dt, 2.6 * dt);
    }
    P.spin += P.spinVel * dt;
    if (f) P.flipVel += (f * FLIP_RATE - P.flipVel) * Math.min(1, dt * 9);
    else {
      P.flipVel *= Math.exp(-7 * dt);
      const tgt = Math.round(P.flip / TAU) * TAU;
      P.flip += clamp(tgt - P.flip, -2.3 * dt, 2.3 * dt);
    }
    P.flip += P.flipVel * dt;
    if (grabbing()) P.grabT += dt;
    P.lean *= Math.exp(-4 * dt);
    P.crouch = lerp(P.crouch, grabbing() ? 0.5 : 0.25, Math.min(1, dt * 8));

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
    if (flipErr > 0.85 || spinErr > 0.95) {
      P.grounded = true;
      P.vy = 0;
      bail(flipErr > 0.85 ? 'HEAD PLANT' : 'LANDED SIDEWAYS');
      return;
    }
    const e = 0.4;
    const gx = (world.Hk(P.x + e, P.z) - world.Hk(P.x - e, P.z)) / (2 * e);
    const gz = (world.Hk(P.x, P.z + e) - world.Hk(P.x, P.z - e)) / (2 * e);
    const groundVy = gx * P.vx + gz * P.vz;
    const impact = Math.max(0, groundVy - P.vy);
    const hs = Math.hypot(P.vx, P.vz);
    P.heading = clamp(Math.atan2(P.vx, P.vz), -1.3, 1.3);
    P.speed = hs * clamp(1 - Math.max(0, impact - 7) * 0.02, 0.65, 1);
    P.vy = groundVy;
    P.slip = 0;
    P.grounded = true;
    const half = Math.abs(Math.round(P.spin / Math.PI));
    P.stance = (Math.abs(n) % 2) * Math.PI;
    const air = P.airT, grabT = P.grabT;
    P.spin = 0; P.flip = 0; P.spinVel = 0; P.flipVel = 0;
    P.surf = surf;
    if (surf === 2) startGrind(ref);
    run.bigAir = Math.max(run.bigAir, air);
    awardAir(half, Math.abs(m), Math.sign(m), grabT, air);
    if (air > 0.3) {
      Sfx.land(impact > 11);
      burst(P.x, P.y, P.z, Math.min(40, 10 + Math.round(impact * 2)), 2.5 + impact * 0.12, P.vx, P.vz);
      shake = Math.max(shake, Math.min(0.6, impact * 0.03));
    }
  }

  function awardAir(half, flips, dir, grabT, air) {
    if (air < 0.35) return;
    let name = '';
    let pts = 0;
    const deg = half * 180;
    if (flips) {
      const base = dir < 0 ? (half ? 'RODEO' : 'BACKFLIP') : (half ? 'MISTY' : 'FRONTFLIP');
      name = (flips === 2 ? 'DOUBLE ' : flips >= 3 ? 'TRIPLE ' : '') + base + (half ? ' ' + deg : '');
      pts = flips * (dir < 0 ? 900 : 800) + SPIN_PTS[Math.min(half, 8)];
      if (half) pts *= 1.3;
    } else if (half) {
      name = String(deg);
      pts = SPIN_PTS[Math.min(half, 8)];
    }
    if (grabT > 0.2) {
      const g = GRABS[Math.floor((P.x * 7 + P.z) % GRABS.length + GRABS.length) % GRABS.length];
      name = name ? name + ' ' + g : g;
      pts += 150 + grabT * 300;
    }
    if (air > 1.1) {
      pts += (air - 1.1) * 250;
      if (!name) name = 'BIG AIR';
    }
    if (name) addTrick(name, Math.round(pts));
  }

  const mult = () => Math.min(3, 1 + 0.15 * Math.max(0, run.combo - 1));

  function addTrick(name, pts) {
    run.combo++;
    run.pot += pts;
    run.tricks++;
    run.bankT = 2.4;
    const m = mult();
    setTrick(name, '+' + fmt(run.pot * m) + (m > 1 ? `<span class="mult">x${m.toFixed(2)}</span>` : ''), false, 2.6);
    Sfx.trick();
    if (mode === 'mp' && pts >= 600) net.send({ t: 'ev', txt: name });
  }

  function bank() {
    if (run.pot <= 0) return;
    const v = Math.round(run.pot * mult());
    run.score += v;
    run.pot = 0;
    run.combo = 0;
    Sfx.bank();
  }

  function bail(reason) {
    if (P.bailT > 0) return;
    const lost = Math.round(run.pot * mult());
    run.pot = 0;
    run.combo = 0;
    run.bails++;
    if (P.surf === 2) { P.grindRef = null; P.grind = 0; }
    P.bailT = 1.7;
    P.tumble = 0;
    P.tumbleRoll = 0;
    P.tumbleV = 8 + P.speed * 0.15;
    P.charging = false;
    P.spin = 0; P.flip = 0;
    show(ui.popMeter, false);
    setTrick('BAIL', lost > 0 ? 'LOST ' + fmt(lost) : reason, true, 2);
    Sfx.bail();
    shake = 1;
    burst(P.x, P.y, P.z, 50, 5, P.vx || 0, P.vz || 0);
    if (mode === 'mp') net.send({ t: 'ev', txt: 'BAILED' });
  }

  function bailStep(dt) {
    P.bailT -= dt;
    P.speed *= Math.exp(-1.7 * dt);
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
      if (P.y <= h) { P.y = h; P.grounded = true; P.speed = Math.hypot(P.vx, P.vz) * 0.5; P.heading = clamp(Math.atan2(P.vx, P.vz), -1.3, 1.3); }
    }
    P.tumble += P.tumbleV * dt;
    P.tumbleV *= Math.exp(-2.2 * dt);
    P.tumbleRoll = lerp(P.tumbleRoll, 1.45, Math.min(1, dt * 3));
    if (P.speed > 3 && Math.random() < 0.6) emit(P.x, P.y + 0.2, P.z, rand(-1, 1), rand(1, 2.5), rand(-1, 1), 0.7, 0.25, 0.92, 0.95, 1, 0.8, false);
    if (P.bailT <= 0) respawn();
  }

  function respawn() {
    const c = world.center(P.z);
    P.x = clamp(P.x, c - C.HALF + 3, c + C.HALF - 3);
    P.y = world.H(P.x, P.z);
    Object.assign(P, { heading: 0, speed: 7, slip: 0, vy: 0, vx: 0, vz: 0, grounded: true, stance: 0, spin: 0, flip: 0, inv: 1.3, surf: 0, tumble: 0, tumbleRoll: 0, lean: 0 });
    setTrick('BACK ON YOUR FEET', '', false, 1.6);
  }

  function physics(dt) {
    if (P.bailT > 0) { bailStep(dt); return; }
    if (P.inv > 0) P.inv -= dt;
    if (P.charging) P.charge = Math.min(1, P.charge + dt / 0.45);
    const steer = P.finished ? 0 : steerInput();
    if (P.grounded) groundStep(dt, steer);
    else airStep(dt, steer);
    if (P.bailT <= 0 && P.inv <= 0) {
      const hit = world.hit(P.x, P.y, P.z, 0.32);
      if (hit) bail(hit.r > 0.6 ? 'WALL' : 'TREE');
    }
    // way off the course: put them back
    if (Math.abs(P.x - world.center(P.z)) > C.HALF + 55 && P.bailT <= 0) bail('OUT OF BOUNDS');
  }

  function emitSpray(dt) {
    if (P.bailT > 0 || !P.grounded || P.speed < 4) return;
    const steer = steerInput();
    const carve = Math.abs(steer);
    const grinding = P.surf === 2;
    const n = Math.round((P.speed * 0.5 + carve * 6) * dt * 60 * 0.35 + Math.random());
    const sh = Math.sin(P.heading), ch = Math.cos(P.heading);
    for (let i = 0; i < n; i++) {
      if (grinding && P.grindRef.type === 'rail') {
        emit(P.x, P.y + 0.05, P.z, rand(-1.5, 1.5) + sh * P.speed * 0.4, rand(0.5, 2.5), ch * P.speed * 0.4 + rand(-1, 1), rand(0.2, 0.5), rand(0.05, 0.1), 1.0, rand(0.5, 0.8), 0.2, 1, true);
        continue;
      }
      const side = steer ? -steer : (Math.random() < 0.5 ? -1 : 1);
      const back = rand(0.2, 0.8);
      emit(P.x - sh * back + ch * side * 0.25, P.y + 0.06, P.z - ch * back - sh * side * 0.25,
        sh * P.speed * 0.55 + ch * side * rand(1, 2 + carve * 4), rand(0.6, 1.6 + carve * 2.2), ch * P.speed * 0.55 - sh * side * rand(1, 2 + carve * 4),
        rand(0.35, 0.8), rand(0.12, 0.26), 0.9, 0.94, 1.0, 0.75, false);
    }
  }

  // ------------------------------------------------------------------ camera
  const cam = { x: 0, y: 30, z: -40, tx: 0, ty: 0, tz: 0, head: 0, fov: 1.1, snap: true };
  const eyeV = [0, 0, 0], tgtV = [0, 0, 0];

  function follow(dt, t) {
    const travel = t.grounded === false && Math.hypot(t.vx || 0, t.vz || 0) > 1 ? Math.atan2(t.vx, t.vz) : t.heading;
    const k = cam.snap ? 1 : 1 - Math.exp(-dt * 3.2);
    cam.head = cam.snap ? travel : lerpAngle(cam.head, travel, k);
    const sp = t.speed || 0;
    const dist = 6.4 + sp * 0.05, hgt = 2.3 + sp * 0.02;
    const ex = t.x - Math.sin(cam.head) * dist, ez = t.z - Math.cos(cam.head) * dist;
    const ey = Math.max(t.y + hgt, world.ground(ex, ez) + 1.5);
    const kp = cam.snap ? 1 : 1 - Math.exp(-dt * 9), ky = cam.snap ? 1 : 1 - Math.exp(-dt * 5);
    cam.x += (ex - cam.x) * kp;
    cam.z += (ez - cam.z) * kp;
    cam.y += (ey - cam.y) * ky;
    const tx = t.x + Math.sin(cam.head) * 7, tz = t.z + Math.cos(cam.head) * 7;
    const ty = t.y + 0.4;
    cam.tx += (tx - cam.tx) * kp;
    cam.tz += (tz - cam.tz) * kp;
    cam.ty += (ty - cam.ty) * (cam.snap ? 1 : 1 - Math.exp(-dt * 6));
    cam.fov = lerp(cam.fov, (62 + clamp(sp / MAX_SPEED, 0, 1) * 12) * (Math.PI / 180), cam.snap ? 1 : Math.min(1, dt * 2));
    cam.snap = false;
  }

  function attract(dt) {
    const z = 40 + ((time * 15) % (C.LENGTH - 200));
    const c = world.center(z);
    const x = c + Math.sin(time * 0.13) * 12;
    cam.x = x;
    cam.z = z;
    cam.y = world.ground(x, z) + 9;
    cam.tx = world.center(z + 45);
    cam.tz = z + 45;
    cam.ty = world.ground(cam.tx, cam.tz) + 1.5;
    cam.fov = 1.15;
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
        break;
      case 'phase':
        onPhase(m);
        break;
      case 'join':
        addRemote(m.p);
        if (m.racers) racers = new Set(m.racers);
        feed(m.p.name + ' joined', m.p.color);
        break;
      case 'leave': {
        const r = remotes.get(m.id);
        if (r) { feed(r.name + ' left', r.color); r.tag.remove(); remotes.delete(m.id); }
        break;
      }
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
    openServers(msg);
  }

  function mpError(msg) {
    net.leave();
    mode = 'menu';
    phase = 'menu';
    show(ui.loading, false);
    openServers(msg);
  }

  function addRemote(p) {
    if (p.id === myId || remotes.has(p.id)) return;
    const tag = document.createElement('div');
    tag.className = 'tagEl';
    tag.textContent = p.name;
    tag.style.setProperty('--c', SS.PALETTE[p.color % 10].css);
    tag.style.display = 'none';
    ui.tags.appendChild(tag);
    remotes.set(p.id, { id: p.id, name: p.name, color: p.color, buf: [], tag, st: null });
  }

  function onPhase(m) {
    serverPhase = m.phase;
    phaseEnds = performance.now() + (m.ends || 0);
    racers = new Set(m.racers || []);
    if (m.seed !== undefined && m.phase !== 'idle') useWorld(m.seed);
    const amRacer = racers.has(myId);
    if (m.phase === 'countdown') {
      show(ui.results, false);
      if (amRacer) {
        resetRider();
        phase = 'countdown';
        Sfx.beep(false);
      } else phase = 'waiting';
    } else if (m.phase === 'racing') {
      if (amRacer && (phase === 'countdown' || phase === 'menu')) {
        if (phase === 'menu') resetRider();
        go();
      } else if (!amRacer || phase !== 'riding') {
        phase = 'spectate';
      }
    } else if (m.phase === 'results') {
      if (phase === 'riding' && !P.finished) bank();
      phase = 'results';
      showMpResults(m.results || []);
    }
    show(ui.hud, true);
    show(ui.menuBtn, true);
    if (touchMode) show(ui.touch, true);
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
    st.bail = !!(flags & 4);
    if (st.bail) { st.tumble = lerp(A[4], B[4], k); st.tumbleRoll = lerp(A[5], B[5], k); st.spin = 0; st.flip = 0; }
    else { st.spin = lerpAngle(A[4], B[4], k); st.flip = lerpAngle(A[5], B[5], k); }
    st.stance = 0;
    st.lean = lerp(A[6], B[6], k);
    st.crouch = lerp(A[7], B[7], k);
    st.grounded = !!(flags & 1);
    st.grab = !!(flags & 2);
    st.fin = !!(flags & 8);
    st.score = B[9];
    st.dist = B[10];
    const dt = (c.t - a.t) / 1000 || 0.08;
    st.vx = (B[0] - A[0]) / dt; st.vz = (B[2] - A[2]) / dt;
    st.speed = Math.hypot(st.vx, st.vz);
    st.t = time;
    if (now - c.t > 3000) r.st = null; // stale
  }

  function sendState() {
    const flags = (P.grounded ? 1 : 0) | (grabbing() && !P.grounded ? 2 : 0) | (P.bailT > 0 ? 4 : 0) | (P.finished ? 8 : 0) | (P.surf === 2 ? 16 : 0);
    const bailing = P.bailT > 0;
    net.send({
      t: 's',
      d: [
        +P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2), +P.heading.toFixed(3),
        +(bailing ? P.tumble : P.spin + P.stance + P.yawOff).toFixed(3), +(bailing ? P.tumbleRoll : P.flip).toFixed(3),
        +P.lean.toFixed(2), +P.crouch.toFixed(2), flags, Math.round(run.score + run.pot), Math.round(Math.max(0, P.z)),
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
    P.speed = Math.max(P.speed, 9);
    setBig('GO!', '', 1.0);
    Sfx.beep(true);
    Sfx.init();
  }

  function startSingle() {
    Sfx.init();
    mode = 'sp';
    paused = false;
    hideOverlays();
    show(ui.loading, true);
    // let the loading screen paint, then build
    setTimeout(() => {
      useWorld((Math.random() * 2147483647) | 0);
      resetRider();
      show(ui.loading, false);
      phase = 'countdown';
      countdownT = 3.2;
      show(ui.hud, true);
      show(ui.menuBtn, true);
      show(ui.standings, false);
      show(ui.mpbar, false);
      if (touchMode) show(ui.touch, true);
    }, 30);
  }

  function finish() {
    P.finished = true;
    bank();
    run.finalTime = raceT;
    run.bonus = Math.max(0, Math.round((TARGET_TIME - raceT) * 20));
    run.score += run.bonus;
    finishedAt = time;
    Sfx.finish();
    setBig('FINISH!', fmtTime(raceT) + (run.bonus ? '   +' + fmt(run.bonus) + ' TIME BONUS' : ''), 3);
    if (mode === 'mp') net.send({ t: 'fin', score: Math.round(run.score), time: Math.round(raceT * 1000), dist: C.LENGTH });
  }

  function showSpResults() {
    phase = 'results';
    const newBest = run.score > best;
    if (newBest) { best = Math.round(run.score); store.set(BEST_KEY, best); ui.bestScore.textContent = fmt(best); }
    ui.resTitle.textContent = 'RUN COMPLETE';
    ui.resBody.innerHTML = `<div class="stats">
      <div class="total"><span>SCORE</span><b>${fmt(run.score)}</b></div>
      <div><span>TIME</span><b>${fmtTime(run.finalTime)}</b></div>
      <div><span>TRICKS</span><b>${run.tricks}</b></div>
      <div><span>BAILS</span><b>${run.bails}</b></div>
      <div><span>TOP SPEED</span><b>${Math.round(run.topSpeed * 3.6)} km/h</b></div>
      <div><span>BIGGEST AIR</span><b>${run.bigAir.toFixed(1)} s</b></div>
      <div><span>TIME BONUS</span><b>+${fmt(run.bonus)}</b></div>
    </div>${newBest ? '<div class="newbest">NEW BEST!</div>' : ''}`;
    ui.againBtn.textContent = 'RIDE AGAIN';
    show(ui.againBtn, true);
    ui.resMenuBtn.textContent = 'MENU';
    ui.resNote.textContent = 'Every run is a new mountain. Press Enter to go again.';
    show(ui.results, true);
  }

  function showMpResults(rows) {
    ui.resTitle.textContent = 'ROUND RESULTS';
    ui.resBody.innerHTML = rows.length
      ? `<table class="rank">${rows.map((r, i) => `<tr class="${r.id === myId ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${SS.PALETTE[r.color % 10].css}"></span>${esc(r.name)}</td><td class="n">${r.fin ? fmtTime(r.time / 1000) : 'DNF · ' + fmt(r.dist) + ' m'}</td><td class="n"><b>${fmt(r.score)}</b></td></tr>`).join('')}</table>`
      : '<p class="small">Nobody finished this round.</p>';
    show(ui.againBtn, false);
    ui.resMenuBtn.textContent = 'LEAVE SERVER';
    show(ui.results, true);
  }

  function hideOverlays() {
    for (const el of [ui.title, ui.servers, ui.pauseMenu, ui.results, ui.nogl]) show(el, false);
  }

  function toMenu() {
    if (mode === 'mp') leaveMp();
    mode = 'menu';
    phase = 'menu';
    paused = false;
    hideOverlays();
    show(ui.hud, false);
    show(ui.menuBtn, false);
    show(ui.touch, false);
    show(ui.title, true);
    Sfx.silence();
  }

  function leaveMp() {
    net.leave();
    for (const r of remotes.values()) r.tag.remove();
    remotes.clear();
    racers = new Set();
    myId = 0;
    mode = 'menu';
    phase = 'menu';
    show(ui.standings, false);
    show(ui.mpbar, false);
    show(ui.hud, false);
    show(ui.menuBtn, false);
    show(ui.touch, false);
    ui.feed.innerHTML = '';
    feedEls.length = 0;
  }

  function toggleMenu() {
    if (mode === 'menu') {
      if (!ui.servers.classList.contains('hidden')) { show(ui.servers, false); show(ui.title, true); stopServerPoll(); }
      return;
    }
    if (phase === 'results' && mode === 'sp') return;
    const open = ui.pauseMenu.classList.contains('hidden');
    show(ui.pauseMenu, open);
    if (mode === 'sp') paused = open;
    ui.restartBtn.textContent = mode === 'mp' ? 'LEAVE SERVER' : 'RESTART RUN';
    if (open) Sfx.silence();
  }

  function toggleMute() {
    Sfx.setMuted(!Sfx.muted);
    store.set(MUTE_KEY, Sfx.muted);
  }

  // server browser
  let pollTimer = null;
  async function refreshServers() {
    try {
      const list = await SS.Net.servers();
      // update rows in place so a click on JOIN is never lost to a redraw
      for (const s of list) {
        let row = ui.serverList.querySelector(`.srv[data-id="${s.id}"]`);
        if (!row) {
          if (!ui.serverList.querySelector('.srv')) ui.serverList.innerHTML = '';
          row = document.createElement('div');
          row.className = 'srv';
          row.dataset.id = s.id;
          row.innerHTML = `<div class="info"><div class="nm"></div><div class="st"></div></div>
            <div><div class="cnt"></div><div class="fill"><i></i></div></div>
            <button class="btn" type="button" data-id="${s.id}">JOIN</button>`;
          row.querySelector('.nm').textContent = s.name;
          row.querySelector('button').addEventListener('click', (e) => { e.currentTarget.blur(); joinServer(s.id); });
          ui.serverList.appendChild(row);
        }
        const full = s.players >= s.max;
        row.querySelector('.st').textContent = s.players === 0 ? 'EMPTY \u00b7 JOIN TO START A ROUND' : s.phase === 'racing' ? 'RACE IN PROGRESS' : s.phase === 'countdown' ? 'STARTING SOON' : s.phase === 'results' ? 'RESULTS' : 'OPEN';
        row.querySelector('.cnt').textContent = s.players + '/' + s.max;
        row.querySelector('.fill i').style.width = (s.players / s.max) * 100 + '%';
        const btn = row.querySelector('button');
        btn.disabled = full;
        btn.textContent = full ? 'FULL' : 'JOIN';
      }
      if (ui.serverMsg.dataset.sticky !== '1') ui.serverMsg.textContent = '';
    } catch (e) {
      ui.serverList.innerHTML = '';
      ui.serverMsg.dataset.sticky = '1';
      ui.serverMsg.textContent = 'Multiplayer needs the online version of Shred Slope (running on the Render server). Singleplayer works anywhere.';
    }
  }
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
    Sfx.init();
    stopServerPoll();
    hideOverlays();
    mode = 'mp';
    phase = 'menu';
    ui.loadingText.textContent = 'Joining server…';
    show(ui.loading, true);
    show(ui.standings, true);
    show(ui.mpbar, true);
    net.connect(id, playerName);
  }

  // buttons
  const click = (el, fn) => el.addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
  click(ui.spBtn, () => { saveName(); ui.loadingText.textContent = 'Building the mountain…'; startSingle(); });
  click(ui.mpBtn, () => { saveName(); openServers(); });
  click(ui.backBtn, () => { stopServerPoll(); show(ui.servers, false); show(ui.title, true); });
  click(ui.resumeBtn, () => toggleMenu());
  click(ui.restartBtn, () => { if (mode === 'mp') toMenu(); else startSingle(); });
  click(ui.quitBtn, () => toMenu());
  click(ui.againBtn, () => startSingle());
  click(ui.resMenuBtn, () => toMenu());
  click(ui.menuBtn, () => toggleMenu());
  ui.nameInput.addEventListener('change', saveName);
  function saveName() {
    const v = ui.nameInput.value.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
    if (v) { playerName = v; store.set(NAME_KEY, v); }
    ui.nameInput.value = playerName;
  }

  // ------------------------------------------------------------------ HUD helpers
  const cache = {};
  const setText = (el, key, v) => { if (cache[key] !== v) { cache[key] = v; el.textContent = v; } };
  let trickT = 0;
  function setTrick(name, sub, bad, dur) {
    ui.trickName.textContent = name;
    ui.trickSub.innerHTML = sub;
    ui.trick.classList.toggle('bail', !!bad);
    ui.trick.classList.remove('fade');
    trickT = dur;
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
    if (!world || !mapBase || !world.map) return;
    mapCtx.clearRect(0, 0, ui.minimap.width, ui.minimap.height);
    mapCtx.drawImage(mapBase, 0, 0);
    for (const r of remotes.values()) {
      if (!r.st) continue;
      const p = world.mapPos(r.st.x, r.st.z);
      mapCtx.fillStyle = SS.PALETTE[r.color % 10].css;
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
    if (ui.hud.classList.contains('hidden')) return;
    const zn = world.zoneAt(focus.z).name;
    if (zn !== zoneName) {
      zoneName = zn;
      ui.zone.textContent = zn;
      ui.zone.classList.remove('flash'); void ui.zone.offsetWidth; ui.zone.classList.add('flash');
    }
    const riding = phase === 'riding' || phase === 'finished' || phase === 'countdown';
    setText(ui.score, 'score', fmt(riding ? run.score : (focus.score || 0)));
    const sp = riding ? P.speed : focus.speed || 0;
    const air = riding && !P.grounded && P.airT > 0.3 && P.bailT <= 0;
    if (air) {
      setText(ui.speedLbl, 'lbl', 'AIR TIME');
      setText(ui.speedVal, 'sv', P.airT.toFixed(1));
      setText(ui.speedUnit, 'su', 'S');
      setText(ui.subStats, 'sub', Math.round(sp * 3.6) + ' KM/H  ' + Math.max(0, Math.round(P.y - world.ground(P.x, P.z))) + ' M');
    } else {
      setText(ui.speedLbl, 'lbl', 'SPEED');
      setText(ui.speedVal, 'sv', String(Math.round(sp * 3.6)));
      setText(ui.speedUnit, 'su', 'KM/H');
      setText(ui.subStats, 'sub', riding && run.pot > 0 && mult() > 1 ? 'COMBO x' + mult().toFixed(2) : '');
    }
    ui.speedBar.style.width = (clamp(sp / MAX_SPEED, 0, 1) * 100).toFixed(1) + '%';
    setText(ui.timer, 'tm', fmtTime(riding ? raceT : 0));
    setText(ui.alt, 'alt', fmt(world.altitude(focus.z)) + ' M');
    setText(ui.left, 'left', Math.max(0, (C.LENGTH - focus.z) / 1000).toFixed(1) + ' KM LEFT');
    show(ui.popMeter, P.charging && phase === 'riding');
    if (P.charging) ui.popBar.style.width = (P.charge * 100).toFixed(0) + '%';

    if (trickT > 0) {
      trickT -= dt;
      if (run.pot > 0 && !ui.trick.classList.contains('bail')) {
        const m = mult();
        ui.trickSub.innerHTML = '+' + fmt(run.pot * m) + (m > 1 ? `<span class="mult">x${m.toFixed(2)}</span>` : '');
      }
      if (trickT <= 0) ui.trick.classList.add('fade');
    }
    if (bigT > 0) {
      bigT -= dt;
      if (bigT <= 0) show(ui.big, false);
    }
    for (const f of feedEls) if (time - f.t > 5) f.d.style.opacity = '0';

    // multiplayer bar and notes
    if (mode === 'mp') {
      const left = (phaseEnds - performance.now()) / 1000;
      const label = serverPhase === 'countdown' ? 'STARTS IN ' + clock(left) : serverPhase === 'racing' ? 'ROUND ENDS IN ' + clock(left) : serverPhase === 'results' ? 'NEXT ROUND IN ' + clock(left) : '';
      setText(ui.mpTimer, 'mpt', label);
      let note = '';
      if (phase === 'spectate') {
        const t = spectateTarget();
        note = (racers.has(myId) ? 'FINISHED · ' : 'RACE IN PROGRESS · YOU JOIN NEXT ROUND · ') + (t ? 'WATCHING ' + t.name.toUpperCase() + ' (← →)' : 'WAITING');
      } else if (phase === 'waiting') note = 'NEXT ROUND STARTS IN ' + clock(left);
      else if (phase === 'countdown' && left > 3) note = 'GET READY \u00b7 ROUND STARTS IN ' + clock(left);
      else if (phase === 'finished') note = 'FINISHED! WAITING FOR THE OTHERS';
      setText(ui.note, 'note', note);
      show(ui.note, !!note);
      standingsT -= dt;
      if (standingsT <= 0) { standingsT = 0.3; updateStandings(); }
    } else {
      show(ui.note, false);
    }
  }

  function updateTags() {
    const out = [0, 0, 0];
    const css = 1 / dpr;
    for (const r of remotes.values()) {
      const st = r.st;
      if (!st || !world || !engine.project(st.x, st.y + 2.2, st.z, out, css) || out[2] > 220) {
        r.tag.style.display = 'none';
        continue;
      }
      r.tag.style.display = 'block';
      r.tag.style.left = out[0].toFixed(1) + 'px';
      r.tag.style.top = out[1].toFixed(1) + 'px';
      r.tag.style.opacity = String(clamp(1.3 - out[2] / 180, 0.35, 1));
    }
  }

  // ------------------------------------------------------------------ audio
  function updateAudio() {
    if (!Sfx.ctx) return;
    if (paused || mode === 'menu' || !(phase === 'riding' || phase === 'finished')) { Sfx.silence(); return; }
    const sp = P.speed / MAX_SPEED;
    const ground = P.grounded && P.bailT <= 0;
    Sfx.set('wind', 0.03 + sp * 0.16 + (!P.grounded ? 0.05 : 0), 300 + sp * 900);
    Sfx.set('carve', ground && P.surf !== 2 ? (0.02 + Math.abs(steerInput()) * 0.12) * Math.min(1, sp * 2.5) : 0, 900 + sp * 1200);
    Sfx.set('grind', ground && P.surf === 2 ? 0.18 : 0, 2600 + sp * 1000);
  }

  // ------------------------------------------------------------------ main loop
  const STEP = 1 / 120;
  function update(dt) {
    time += dt;
    shake = Math.max(0, shake - dt * 2);
    let focus = P;

    if (mode === 'menu' || !world) {
      if (world) attract(dt);
    } else if (phase === 'countdown') {
      if (mode === 'sp') {
        const before = Math.ceil(countdownT);
        countdownT -= dt;
        const now = Math.ceil(countdownT);
        if (now !== before && now > 0 && now <= 3) { setBig(String(now), '', 0.9); Sfx.beep(false); }
        if (countdownT <= 0) go();
      } else {
        const left = (phaseEnds - performance.now()) / 1000;
        const n = Math.ceil(left);
        if (n <= 3 && n >= 1 && ui.bigText.textContent !== String(n)) { setBig(String(n), '', 0.95); Sfx.beep(false); }
      }
      P.crouch = lerp(P.crouch, 0.35, dt * 4);
      follow(dt, P);
    } else if (phase === 'riding' || phase === 'finished') {
      if (!paused) {
        let left = dt;
        while (left > 1e-6) {
          const h = Math.min(STEP, left);
          physics(h);
          left -= h;
        }
        if (!P.finished) raceT += dt;
        run.topSpeed = Math.max(run.topSpeed, P.speed);
        if (!P.finished && P.z >= C.LENGTH) finish();
        if (P.finished) {
          phase = 'finished';
          if (mode === 'sp' && time - finishedAt > 3.5) showSpResults();
          if (mode === 'mp' && time - finishedAt > 4 && [...remotes.values()].some((r) => r.st && !r.st.fin && racers.has(r.id))) { phase = 'spectate'; cam.snap = true; }
        }
        emitSpray(dt);
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
    for (const r of remotes.values()) interpRemote(r, now);
    if (mode === 'mp' && myId && (phase === 'countdown' || phase === 'riding' || phase === 'finished') && now - lastSend > SEND_MS) {
      lastSend = now;
      sendState();
    }

    updateParticles(dt);
    updateFlakes(dt);
    if (world && mode !== 'menu') updateHud(dt, focus);
    updateAudio();
  }

  const MV = M4.create();
  function render() {
    engine.clear(engine.fogCol);
    if (!world) return;
    const sx = shake ? (Math.random() - 0.5) * shake * 0.25 : 0;
    const sy = shake ? (Math.random() - 0.5) * shake * 0.2 : 0;
    eyeV[0] = cam.x + sx; eyeV[1] = cam.y + sy; eyeV[2] = cam.z;
    tgtV[0] = cam.tx + sx; tgtV[1] = cam.ty + sy; tgtV[2] = cam.tz;
    engine.setCamera(eyeV, tgtV, cam.fov);

    // sky, stars, mountains
    gl.depthMask(false);
    engine.beginBaked(1e6, 1e6 + 1);
    M4.identity(MV);
    M4.translate(MV, eyeV[0], eyeV[1], eyeV[2]);
    engine.drawBaked(backdrop.sky, MV);
    engine.drawPoints(null, backdrop.starCount, { mesh: backdrop.stars, offset: eyeV, additive: true, max: 64 });
    engine.beginBaked(700, 2300);
    M4.identity(MV);
    M4.translate(MV, eyeV[0], eyeV[1] - 70, eyeV[2]);
    engine.drawBaked(backdrop.mountains, MV);
    gl.depthMask(true);

    // the mountain
    engine.beginBaked();
    world.draw(engine, cam.z);

    // blob shadows
    const riders = [];
    if (mode !== 'menu' && (phase === 'riding' || phase === 'finished' || phase === 'countdown' || (phase === 'results' && mode === 'sp'))) {
      riders.push({ st: P, color: mode === 'mp' ? myColor : 0, t: time });
    }
    for (const r of remotes.values()) {
      // skip other riders that are right on top of the camera (they would fill the screen)
      if (r.st && racers.has(r.id) && Math.hypot(r.st.x - eyeV[0], r.st.y + 1 - eyeV[1], r.st.z - eyeV[2]) > 3.2) riders.push({ st: r.st, color: r.color });
    }
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    for (const r of riders) {
      if (Math.abs(r.st.z - cam.z) > 260) continue;
      SS.drawShadow(engine, world, r.st.x, r.st.z, r.st.heading, r.st.y - world.H(r.st.x, r.st.z));
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // riders
    engine.beginLit();
    for (const r of riders) {
      if (Math.abs(r.st.z - cam.z) > 300) continue;
      const st = r.st;
      SS.drawRider(engine, world, {
        x: st.x, y: st.y, z: st.z, heading: st.heading, spin: st.spin + (st === P ? P.yawOff : 0), stance: st.stance, flip: st.flip,
        lean: st.lean, crouch: st.crouch, grab: st === P ? grabbing() && !P.grounded : st.grab,
        bail: st === P ? P.bailT > 0 : st.bail, tumble: st.tumble, tumbleRoll: st.tumbleRoll, t: time,
      }, r.color);
    }

    // lamp glows, spray, falling snow
    engine.drawPoints(null, world.glowCount || 0, { mesh: world.glows(engine), additive: true });
    drawParticles();
    engine.drawPoints(flakes, FLAKES, { soft: 1, max: 6 });
  }

  // adaptive resolution for slower computers
  let perfAcc = 0, perfN = 0;
  function perf(dt) {
    perfAcc += dt;
    perfN++;
    if (perfN >= 90) {
      const avg = perfAcc / perfN;
      if (avg > 0.034 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); }
      else if (avg > 0.034 && dpr > 0.75) { dpr -= 0.125; resize(); }
      perfAcc = 0;
      perfN = 0;
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (world) world.ensureChunks(engine, mode === 'menu' ? cam.z : P.z, 1);
    update(dt);
    render();
    updateTags();
    drawMap();
    perf(dt);
    requestAnimationFrame(frame);
  }

  // boot: a mountain for the title screen
  useWorld(20261117);
  attract(0);
  initFlakes();
  requestAnimationFrame(frame);

  // test hook: open the game with ?debug to drive it from the browser console
  if (/[?&]debug\b/.test(location.search)) {
    window.ShredSlopeDebug = {
      keys, P, run, cam,
      get world() { return world; },
      get spec() { const t = spectateTarget(); return t && t.st && { id: t.id, x: t.st.x, y: t.st.y, z: t.st.z, heading: t.st.heading, speed: t.st.speed, grounded: t.st.grounded, bail: t.st.bail }; },
      sim(seconds, bot) {
        const steps = Math.round(seconds / STEP);
        for (let i = 0; i < steps && phase === 'riding'; i++) {
          if (bot) bot(P, world, keys, ShredSlopeDebug);
          physics(STEP);
          if (!P.finished) raceT += STEP;
          run.topSpeed = Math.max(run.topSpeed, P.speed);
          if (!P.finished && P.z >= C.LENGTH) { finish(); phase = 'finished'; }
        }
        return { z: P.z, x: P.x, speed: P.speed, t: raceT, score: run.score, pot: run.pot, tricks: run.tricks, bails: run.bails, finished: P.finished, grounded: P.grounded };
      },
      pop(charge) { P.charging = true; P.charge = charge === undefined ? 1 : charge; chargeRelease(); },
      get phase() { return phase; },
    };
  }

  window.ShredSlope = {
    get phase() { return phase; },
    get mode() { return mode; },
    get player() { return { x: P.x, y: P.y, z: P.z, speed: P.speed, grounded: P.grounded, surf: P.surf, bail: P.bailT > 0, finished: P.finished }; },
    get run() { return { ...run }; },
    get remotes() { return [...remotes.values()].map((r) => ({ id: r.id, name: r.name, st: r.st && { x: r.st.x, z: r.st.z } })); },
    get world() { return world; },
    get net() { return { id: myId, phase: serverPhase, server: serverInfo && serverInfo.name }; },
  };
})();
