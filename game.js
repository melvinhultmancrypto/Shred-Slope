/*
 * Shred Slope: a snowboarding game for the browser.
 * Plain JavaScript + Canvas 2D. No libraries, no build step: open index.html and ride.
 *
 * World units are metres. +z points down the mountain (away from the camera),
 * +x points to the right, +y points up.
 */
(() => {
  'use strict';

  // ------------------------------------------------------------------ tuning
  const CFG = {
    HALF: 10,            // half-width of the groomed piste (m)
    DRAW: 150,           // draw distance (m)
    CAM_BACK: 9,         // camera distance behind the rider (m)
    START_SPEED: 15,     // m/s when a run starts
    MAX_SPEED: 42,       // m/s top speed (about 150 km/h)
    SPEED_GAIN: 0.012,   // extra m/s for every metre ridden
    GRAVITY: 22,
    JUMP_V: 7.2,         // ollie take-off speed
    RAMP_V: 8.5,         // kicker take-off speed (plus a bit per m/s of speed)
    SPIN_RATE: 12,       // rad/s while spinning in the air
    COIN_VALUE: 25,
    CLEAR_START: 45,     // metres of empty slope at the start of a run
    RAMP_HALF_W: 1.7,
    RAMP_LEN: 3,
    RAMP_H: 1.0,
  };
  const SPIN_POINTS = [0, 100, 250, 450, 700, 1000, 1400, 1900];
  const BEST_KEY = 'shredSlope.best';
  const MUTE_KEY = 'shredSlope.muted';
  const CRASH_LINES = {
    tree: ['Face, meet tree.', 'That pine came out of nowhere.', 'Timber!'],
    rock: ['Rocked.', 'Should have jumped that one.', 'Rock 1, you 0.'],
    snowman: ['Sorry, Frosty.', 'The snowman wins this round.', 'You flattened Frosty.'],
  };

  // ------------------------------------------------------------------ helpers
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
  };

  function seeded(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = {
    hud: $('hud'), score: $('score'), dist: $('dist'), coins: $('coins'), speed: $('speed'), best: $('best'),
    title: $('title'), titleBest: $('titleBest'),
    over: $('over'), reason: $('reason'), oDist: $('oDist'), oCoins: $('oCoins'), oTricks: $('oTricks'),
    oScore: $('oScore'), oBest: $('oBest'), newBest: $('newBest'),
    pause: $('pause'), popup: $('popup'), hint: $('hint'), touch: $('touch'),
    muteBtn: $('muteBtn'), pauseBtn: $('pauseBtn'),
  };
  const show = (el, on) => el.classList.toggle('hidden', !on);

  // ------------------------------------------------------------------ sound (synthesised, no files)
  const Sfx = {
    ctx: null, master: null, noise: null, carveGain: null, carveFilter: null,
    muted: !!store.get(MUTE_KEY, false),

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ac = new AC();
        this.ctx = ac;
        this.master = ac.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        this.master.connect(ac.destination);

        const len = ac.sampleRate * 2;
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noise = buf;

        // continuous "board on snow" hiss
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const f = ac.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 0.8;
        const g = ac.createGain();
        g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start();
        this.carveFilter = f;
        this.carveGain = g;
      } catch (e) {
        this.ctx = null;
      }
    },

    setMuted(m) {
      this.muted = m;
      if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
    },

    carve(level, freq) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.carveGain.gain.setTargetAtTime(level, t, 0.06);
      this.carveFilter.frequency.setTargetAtTime(freq, t, 0.08);
    },

    tone(freq, dur, type = 'sine', vol = 0.2, to = 0, delay = 0) {
      if (!this.ctx) return;
      const ac = this.ctx;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    hiss(dur, vol = 0.3, freq = 1000, type = 'lowpass', delay = 0) {
      if (!this.ctx) return;
      const ac = this.ctx;
      const t = ac.currentTime + delay;
      const s = ac.createBufferSource();
      s.buffer = this.noise;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t, Math.random());
      s.stop(t + dur + 0.02);
    },

    coin() { this.tone(988, 0.08, 'square', 0.07); this.tone(1480, 0.16, 'square', 0.07, 0, 0.07); },
    jump(big) { this.tone(big ? 220 : 320, 0.22, 'triangle', 0.18, big ? 640 : 560); this.hiss(0.18, 0.12, 2500, 'highpass'); },
    land() { this.hiss(0.2, 0.35, 700); this.tone(110, 0.12, 'sine', 0.2, 70); },
    crash() { this.hiss(0.6, 0.6, 450); this.tone(160, 0.45, 'sawtooth', 0.12, 50); },
    trick() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.12, 0, i * 0.065)); },
  };

  // ------------------------------------------------------------------ sprites (drawn once, reused every frame)
  function makeSprite(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }

  // A snowy pine. 256x512 px = 2.4 x 4.8 m.
  function treeSprite(light, mid, dark, snow) {
    return makeSprite(256, 512, (g, w, h) => {
      const cx = w / 2;
      g.fillStyle = '#5b3a24';
      g.fillRect(cx - 12, h - 90, 24, 90);

      for (let i = 0; i < 4; i++) {
        const bottom = h - 60 - i * 88;
        const top = bottom - 150;
        const half = 124 - i * 26;
        const teeth = 6;
        const seg = (2 * half) / teeth;

        // branches
        const grad = g.createLinearGradient(cx - half, 0, cx + half, 0);
        grad.addColorStop(0, light);
        grad.addColorStop(0.5, mid);
        grad.addColorStop(1, dark);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(cx, top);
        g.lineTo(cx + half, bottom);
        for (let t = 1; t <= teeth; t++) {
          g.lineTo(cx + half - (t - 0.5) * seg, bottom - 13);
          g.lineTo(cx + half - t * seg, bottom);
        }
        g.closePath();
        g.fill();

        // sunlit side
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.beginPath();
        g.moveTo(cx - 3, top + 12);
        g.lineTo(cx - half + 12, bottom - 4);
        g.lineTo(cx - half * 0.45, bottom - 4);
        g.closePath();
        g.fill();

        // snow resting on the branch tips
        const th = snow * (20 - i * 2);
        const hu = half * (1 - th / (bottom - top));
        const segU = (2 * hu) / teeth;
        g.fillStyle = '#f4f9ff';
        g.beginPath();
        g.moveTo(cx - half + 2, bottom - 2);
        for (let t = 1; t <= teeth; t++) {
          const x0 = cx - half + (t - 1) * seg;
          const x1 = cx - half + t * seg;
          g.quadraticCurveTo((x0 + x1) / 2, bottom + 7, t === teeth ? x1 - 2 : x1, bottom - 2);
        }
        g.lineTo(cx + hu, bottom - th);
        for (let t = teeth - 1; t >= 0; t--) {
          const x = cx - hu + t * segU;
          g.quadraticCurveTo(x + segU / 2, bottom - th - 6, x, bottom - th + (t % 2 ? 3 : -2));
        }
        g.closePath();
        g.fill();
      }

      // snow cap on the very top
      const apex = h - 60 - 3 * 88 - 150;
      g.fillStyle = '#f7fbff';
      g.beginPath();
      g.moveTo(cx, apex);
      g.lineTo(cx + 17, apex + 34);
      g.quadraticCurveTo(cx + 8, apex + 28, cx + 2, apex + 36);
      g.quadraticCurveTo(cx - 6, apex + 26, cx - 17, apex + 34);
      g.closePath();
      g.fill();
    });
  }

  // 256x160 px = 1.9 x 1.2 m
  const ROCK = makeSprite(256, 160, (g, w, h) => {
    g.fillStyle = '#e4eef9';
    g.beginPath(); g.ellipse(w / 2, h - 8, 124, 12, 0, 0, TAU); g.fill();
    g.fillStyle = '#6f7a8a';
    g.beginPath();
    g.moveTo(14, h - 8); g.lineTo(30, 70); g.lineTo(78, 28); g.lineTo(140, 14);
    g.lineTo(196, 40); g.lineTo(236, 88); g.lineTo(244, h - 8);
    g.closePath(); g.fill();
    g.fillStyle = '#556072';
    g.beginPath();
    g.moveTo(140, 14); g.lineTo(196, 40); g.lineTo(236, 88); g.lineTo(244, h - 8);
    g.lineTo(150, h - 8); g.lineTo(128, 72);
    g.closePath(); g.fill();
    g.fillStyle = '#8994a5';
    g.beginPath();
    g.moveTo(30, 70); g.lineTo(78, 28); g.lineTo(102, 62); g.lineTo(62, h - 8); g.lineTo(14, h - 8);
    g.closePath(); g.fill();
    g.fillStyle = '#f5faff';
    g.beginPath();
    g.moveTo(38, 62); g.lineTo(78, 28); g.lineTo(140, 14); g.lineTo(196, 40); g.lineTo(222, 68);
    g.quadraticCurveTo(204, 76, 188, 62);
    g.quadraticCurveTo(170, 82, 150, 58);
    g.quadraticCurveTo(128, 76, 110, 54);
    g.quadraticCurveTo(90, 78, 72, 60);
    g.quadraticCurveTo(54, 76, 38, 62);
    g.fill();
    g.fillStyle = '#eef4fb';
    g.beginPath(); g.ellipse(w / 2, h - 6, 126, 9, 0, 0, Math.PI); g.fill();
  });

  // 200x320 px = 1.25 x 2.0 m
  const SNOWMAN = makeSprite(200, 320, (g) => {
    const ball = (x, y, r) => {
      const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(1, '#c9dbef');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    };
    const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };

    g.strokeStyle = '#6b4526';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(64, 170); g.lineTo(14, 128); g.moveTo(30, 141); g.lineTo(14, 150);
    g.moveTo(136, 170); g.lineTo(186, 130); g.moveTo(171, 142); g.lineTo(188, 146);
    g.stroke();

    ball(100, 262, 56);
    ball(100, 176, 42);
    ball(100, 106, 32);

    g.fillStyle = '#e8324a';
    g.fillRect(68, 130, 64, 14);
    g.fillRect(110, 138, 15, 34);

    g.fillStyle = '#1b1f2e';
    g.fillRect(68, 72, 64, 9);
    g.fillRect(80, 28, 40, 48);
    g.fillStyle = '#e8324a';
    g.fillRect(80, 62, 40, 8);

    g.fillStyle = '#1b1f2e';
    dot(89, 99, 4.5); dot(111, 99, 4.5);
    dot(86, 117, 2.5); dot(93, 121, 2.5); dot(100, 122, 2.5); dot(107, 121, 2.5); dot(114, 117, 2.5);
    dot(100, 166, 4); dot(100, 188, 4); dot(100, 246, 4.5);

    g.fillStyle = '#ff8a1a';
    g.beginPath(); g.moveTo(100, 104); g.lineTo(130, 110); g.lineTo(100, 113); g.closePath(); g.fill();
  });

  const TREES = [
    treeSprite('#3b9a63', '#25744b', '#174f33', 1.0),
    treeSprite('#4aa775', '#2a7d55', '#1a5a3b', 0.75),
    treeSprite('#3f8f5d', '#2a6a43', '#1b4a2e', 1.25),
  ];

  // ------------------------------------------------------------------ view / projection
  let W = 800, H = 600, DPR = 1, F = 600, HORIZON = 200, CAM_H = 4;
  let PX = 0, PY = 0, PS = 0; // results of the last proj() call

  function proj(x, y, z) {
    const dz = z - cam.z;
    if (dz < 0.25) return false;
    PS = F / dz;
    PX = W * 0.5 + (x - cam.x) * PS;
    PY = HORIZON + (CAM_H - y) * PS;
    return true;
  }

  // The piste winds left and right as you go down the mountain.
  function center(z) {
    return 14 * Math.sin(z / 230) + 6 * Math.sin(z / 97 + 1.3) + 3 * Math.sin(z / 41 + 0.4);
  }

  // ------------------------------------------------------------------ game state
  let state = 'title'; // title | playing | crashing | over | paused
  let time = 0;
  let shake = 0;
  let roll = 0;
  let touchMode = false;

  const cam = { x: 0, z: 0 };
  const p = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, v: 11,
    grounded: true, ramp: null,
    spin: 0, spinLock: 0, grabT: 0, airT: 0,
    lean: 0, crashT: 0, crashDir: 1,
  };
  const run = {
    startZ: 0, coins: 0, trickPts: 0, tricks: 0,
    best: Number(store.get(BEST_KEY, 0)) || 0, newBest: false, overAt: 0, reason: '',
  };
  const keys = { left: false, right: false, down: false, tLeft: false, tRight: false, tGrab: false };

  const objs = [];
  const parts = [];
  const flakes = [];
  const trail = [];
  const vis = [];
  let nextDecoZ = 0, nextPoleZ = 0, nextRowZ = Infinity, lastGap = 0, trailLastZ = -1e9;

  const steerInput = () => (keys.right || keys.tRight ? 1 : 0) - (keys.left || keys.tLeft ? 1 : 0);
  const grabInput = () => keys.down || keys.tGrab;
  const maxLateral = () => 8 + p.v * 0.2;
  const distance = () => Math.max(0, p.z - run.startZ);
  const currentScore = () => Math.floor(distance()) + run.coins * CFG.COIN_VALUE + run.trickPts;
  const speedAt = (z) => Math.min(CFG.MAX_SPEED, CFG.START_SPEED + Math.max(0, z - run.startZ) * CFG.SPEED_GAIN);
  const difficultyAt = (z) => clamp((z - run.startZ) / 3000, 0, 1);

  // ------------------------------------------------------------------ world building
  const addObj = (o) => { objs.push(o); return o; };
  const tree = (x, z, sc, deco) => addObj({ t: 'tree', x, z, sc, r: 0.75 * sc, h: 4.6 * sc, v: (Math.random() * TREES.length) | 0, deco });
  const rock = (x, z, sc = 1, deco = false) => addObj({ t: 'rock', x, z, sc, r: 0.85 * sc, h: 1.0 * sc, deco });
  const snowman = (x, z, deco = false) => addObj({ t: 'snowman', x, z, sc: 1, r: 0.55, h: 1.9, deco });
  const coin = (x, y, z) => addObj({ t: 'coin', x, y, z, taken: false });
  const pole = (x, z) => addObj({ t: 'pole', x, z, deco: true });
  const ramp = (x, z) => addObj({ t: 'ramp', x, z, w: CFG.RAMP_HALF_W, L: CFG.RAMP_LEN, h: CFG.RAMP_H });

  function obstacle(x, z) {
    const r = Math.random();
    if (r < 0.55) tree(x, z, rand(0.9, 1.2), false);
    else if (r < 0.8) rock(x, z);
    else snowman(x, z);
  }

  // forest on both sides of the piste
  function spawnDeco(z) {
    const c = center(z);
    for (const side of [-1, 1]) {
      const n = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const off = CFG.HALF + 2.2 + Math.pow(Math.random(), 1.6) * 30;
        tree(c + side * off, z + rand(-2, 2), rand(0.8, 1.6), true);
      }
      if (Math.random() < 0.1) rock(c + side * (CFG.HALF + rand(2.5, 9)), z + rand(-2, 2), rand(0.8, 1.5), true);
      if (Math.random() < 0.03) snowman(c + side * (CFG.HALF + rand(2.5, 6)), z, true);
    }
  }

  const spacing = (d) => lerp(16, 8.5, d) + rand(0, 4);
  const maxShift = (d) => lerp(6, 3, d);

  // a row of obstacles that always leaves a gap
  function patScatter(z, d) {
    const lim = CFG.HALF - 0.8;
    const gap = clamp(lastGap + rand(-1, 1) * maxShift(d), -lim + 2, lim - 2);
    const gapHalf = 2.4 - d * 0.5;
    const n = 2 + ((Math.random() * (2 + d * 4)) | 0);
    for (let i = 0; i < n; i++) {
      const off = rand(-lim, lim);
      if (Math.abs(off - gap) < gapHalf) continue;
      const zz = z + rand(-2.5, 2.5);
      obstacle(center(zz) + off, zz);
    }
    if (Math.random() < 0.35) coin(center(z) + gap, 0.9, z);
    lastGap = gap;
    return spacing(d);
  }

  // a line of coins with a few things to dodge beside it
  function patCoinLine(z, d) {
    const lim = CFG.HALF - 2;
    const off = clamp(lastGap + rand(-1, 1) * maxShift(d), -lim, lim);
    for (let i = 0; i < 6; i++) {
      const zz = z + i * 3;
      coin(center(zz) + off, 0.9, zz);
    }
    if (Math.random() < 0.75) {
      for (let i = 0; i < 3; i++) {
        const zz = z + i * 6 + rand(0, 2);
        const x = off + (Math.random() < 0.5 ? -1 : 1) * rand(2.6, 4.5);
        if (Math.abs(x) < CFG.HALF - 0.6) obstacle(center(zz) + x, zz);
      }
    }
    lastGap = off;
    return 18 + spacing(d);
  }

  // a wall of trees with one gap
  function patGate(z, d) {
    const gw = lerp(5.5, 3.6, d);
    const lim = CFG.HALF - gw / 2 - 0.5;
    const gap = clamp(lastGap + rand(-1, 1) * maxShift(d), -lim, lim);
    const c = center(z);
    for (let x = -CFG.HALF + 0.2; x <= CFG.HALF; x += 1.7) {
      if (Math.abs(x - gap) < gw / 2 + 0.6) continue;
      tree(c + x, z + rand(-0.3, 0.3), rand(0.85, 1.05), false);
    }
    coin(c + gap, 0.9, z);
    lastGap = gap;
    return spacing(d) + 4;
  }

  // a row of rocks you have to jump
  function patRocks(z, d) {
    const c = center(z);
    for (let x = -CFG.HALF + 0.6; x <= CFG.HALF; x += rand(1.6, 2.1)) rock(c + x, z + rand(-0.4, 0.4));
    const off = clamp(lastGap, -CFG.HALF + 1, CFG.HALF - 1);
    for (let i = -1; i <= 1; i++) coin(center(z + i * 2.5) + off, 1.7, z + i * 2.5);
    return spacing(d) + 6;
  }

  // a kicker with a trail of coins along the jump arc
  function patRamp(z, d) {
    const off = clamp(lastGap + rand(-1, 1) * maxShift(d), -CFG.HALF + 2.5, CFG.HALF - 2.5);
    const x = center(z) + off;
    const o = ramp(x, z);
    const v = speedAt(z);
    const vy = CFG.RAMP_V + v * 0.13;
    const g = CFG.GRAVITY;
    for (let t = 0.14; t < 3; t += 0.14) {
      const y = o.h + vy * t - 0.5 * g * t * t;
      if (y < 0.9) break;
      coin(x, y + 0.6, z + o.L + v * t);
    }
    const air = (vy + Math.sqrt(vy * vy + 2 * g * o.h)) / g;
    lastGap = off;
    return o.L + v * air + spacing(d) + 4;
  }

  function spawnPattern(z) {
    const d = difficultyAt(z);
    const r = Math.random();
    const since = z - run.startZ;
    if (r < 0.14 && since > 120) return patRamp(z, d);
    if (r < 0.3) return patCoinLine(z, d);
    if (r < 0.42 && since > 250) return patGate(z, d);
    if (r < 0.52 && since > 150) return patRocks(z, d);
    return patScatter(z, d);
  }

  function spawnAhead() {
    const limit = p.z + CFG.DRAW + 20;
    while (nextDecoZ < limit) {
      spawnDeco(nextDecoZ);
      nextDecoZ += rand(4.5, 7);
    }
    while (nextPoleZ < limit) {
      const c = center(nextPoleZ);
      pole(c - CFG.HALF - 0.4, nextPoleZ);
      pole(c + CFG.HALF + 0.4, nextPoleZ);
      nextPoleZ += 24;
    }
    while (nextRowZ < limit) nextRowZ += spawnPattern(nextRowZ);
  }

  function cleanup() {
    const minZ = cam.z - 2;
    let j = 0;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.z + (o.L || 0) > minZ && !(o.t === 'coin' && o.taken)) objs[j++] = o;
    }
    objs.length = j;
  }

  // ------------------------------------------------------------------ particles
  function emit(x, y, z, vx, vy, vz, life, size, color) {
    if (parts.length >= 600) return;
    parts.push({ x, y, z, vx, vy, vz, life, max: life, size, color });
  }

  function burst(x, y, z, n, power, color = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      emit(
        x + rand(-0.3, 0.3), y, z,
        Math.cos(a) * rand(0.4, 1) * power,
        rand(1, 2.2) * power * 0.6,
        p.v * 0.5 + Math.sin(a) * power * 0.6,
        rand(0.5, 1.1), rand(0.07, 0.18), color
      );
    }
  }

  let sprayAcc = 0;
  function emitSpray(dt) {
    const riding = state === 'playing' || state === 'title';
    const tumbling = state === 'crashing' && p.v > 3;
    if (!(riding && p.grounded) && !tumbling) return;
    const carve = clamp(Math.abs(p.vx) / maxLateral(), 0, 1);
    sprayAcc += (tumbling ? 120 : 20 + carve * 140 + p.v * 1.5) * dt;
    while (sprayAcc >= 1) {
      sprayAcc -= 1;
      const dir = Math.sign(p.vx) || (Math.random() < 0.5 ? -1 : 1);
      emit(
        p.x - dir * rand(0.2, 0.8), p.y + 0.05, p.z - rand(0.1, 0.6),
        -dir * rand(1, 3 + carve * 5) + rand(-1, 1),
        rand(1.2, 2.5 + carve * 3),
        p.v * rand(0.35, 0.75),
        rand(0.35, 0.8), rand(0.05, 0.13), 0
      );
    }
  }

  function updateParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0 || q.z < cam.z + 0.3) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      q.vy -= 9 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.y < 0) {
        q.y = 0;
        q.vy *= -0.25;
        q.vx *= 0.6;
        q.vz *= 0.6;
      }
    }
  }

  function resetFlake(f, anywhere) {
    f.x = cam.x + rand(-22, 22);
    f.y = rand(0, 14);
    f.z = cam.z + (anywhere ? rand(1, 70) : rand(40, 70));
    f.s = rand(0.02, 0.05);
  }

  function updateFlakes(dt) {
    for (const f of flakes) {
      f.y -= 1.4 * dt;
      f.x += Math.sin(time * 0.8 + f.z) * 0.6 * dt;
      if (f.y < 0 || f.z < cam.z + 0.8 || Math.abs(f.x - cam.x) > 26) resetFlake(f, false);
    }
  }

  // ------------------------------------------------------------------ rider actions
  function launch(vy, y0, big) {
    p.grounded = false;
    p.ramp = null;
    p.y = y0;
    p.vy = vy;
    p.airT = 0;
    p.spin = 0;
    p.grabT = 0;
    p.spinLock = steerInput(); // keys already held at take-off don't start a spin
    Sfx.jump(big);
    burst(p.x, 0.05 + y0, p.z, 10, 2.5);
    if (big) shake = Math.max(shake, 0.15);
  }

  function jump() {
    if (!p.grounded) return;
    if (p.ramp) launch(CFG.RAMP_V + p.v * 0.13 + 1.5, p.y, true);
    else launch(CFG.JUMP_V, 0, false);
    ui.hint.classList.add('fade');
  }

  function land() {
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
    const half = Math.round(p.spin / Math.PI);
    const off = Math.abs(p.spin - half * Math.PI);
    if (off > 0.96) { // more than ~55 degrees off: you land sideways
      crash('Landed sideways. Ouch.');
      return;
    }
    const turns = Math.abs(half);
    const names = [];
    let pts = 0;
    if (turns >= 1) {
      pts += SPIN_POINTS[Math.min(turns, SPIN_POINTS.length - 1)];
      names.push(String(turns * 180));
    }
    if (p.grabT > 0.25) {
      pts += 60 + Math.round(p.grabT * 120);
      names.push('GRAB');
    }
    if (p.airT > 1.0) {
      pts += 30 + Math.round((p.airT - 1.0) * 100);
      if (!names.length) names.push('BIG AIR');
    }
    if (pts > 0) {
      run.trickPts += pts;
      run.tricks++;
      popup(names.join(' + '), pts);
      Sfx.trick();
    }
    Sfx.land();
    burst(p.x, 0.05, p.z, 18 + Math.round(p.airT * 10), 3);
    shake = Math.max(shake, Math.min(0.35, p.airT * 0.2));
    p.spin = 0;
    p.grabT = 0;
  }

  function collectCoin(o) {
    o.taken = true;
    run.coins++;
    Sfx.coin();
    burst(o.x, o.y, o.z, 8, 2.5, 1);
  }

  function crash(reason) {
    if (state !== 'playing') return;
    state = 'crashing';
    run.reason = reason;
    p.crashT = 0;
    p.crashDir = Math.sign(p.vx) || 1;
    p.ramp = null;
    shake = 1;
    Sfx.crash();
    burst(p.x, 0.5, p.z, 70, 6);
    show(ui.pauseBtn, false);
  }

  function collide(prevZ) {
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.z > p.z + 2 || o.z + (o.L || 0) < prevZ - 2) continue;
      if (o.t === 'coin') {
        if (!o.taken && o.z >= prevZ - 0.7 && o.z <= p.z + 0.7 &&
            Math.abs(o.x - p.x) < 1.0 && o.y >= p.y - 0.3 && o.y <= p.y + 2.0) collectCoin(o);
      } else if (o.t === 'ramp') {
        if (p.grounded && !p.ramp && prevZ <= o.z && p.z > o.z && Math.abs(p.x - o.x) < o.w) {
          p.ramp = o;
          p.y = o.h * (p.z - o.z) / o.L;
        }
      } else if (!o.deco) {
        const depth = o.r * 0.7 + 0.25;
        if (o.z >= prevZ - depth && o.z <= p.z + depth &&
            Math.abs(o.x - p.x) < o.r + 0.32 && p.y < o.h * 0.85) {
          crash(pick(CRASH_LINES[o.t]));
          return;
        }
      }
    }
  }

  // ------------------------------------------------------------------ update
  function updateTitle(dt) {
    // attract mode: the rider cruises down by itself
    p.v = 11;
    p.z += p.v * dt;
    const target = center(p.z + 6) + Math.sin(time * 0.55) * 6.5;
    const want = clamp((target - p.x) * 2.2, -9, 9);
    p.vx += (want - p.vx) * Math.min(1, dt * 4);
    p.x += p.vx * dt;
  }

  function updatePlaying(dt) {
    const steer = steerInput();
    const prevZ = p.z;

    // forward speed builds up the further you ride; carving bleeds a little
    const target = speedAt(p.z) * (p.grounded ? 1 - 0.06 * Math.abs(steer) : 1);
    p.v += (target - p.v) * Math.min(1, dt * 1.5);
    p.z += p.v * dt;

    // sideways
    if (p.grounded) p.vx += (steer * maxLateral() - p.vx) * Math.min(1, dt * 6);
    else p.vx *= Math.pow(0.6, dt);
    p.x += p.vx * dt;

    // stay on the piste
    const c = center(p.z);
    const lim = CFG.HALF - 0.6;
    if (p.x > c + lim || p.x < c - lim) {
      const side = p.x > c ? 1 : -1;
      p.x = c + side * lim;
      if (p.vx * side > 0) p.vx = 0;
    }

    // up and down
    if (p.grounded) {
      if (p.ramp) {
        const o = p.ramp;
        if (Math.abs(p.x - o.x) > o.w + 0.25) {
          p.ramp = null; // slid off the side
          p.y = 0;
        } else if (p.z >= o.z + o.L) {
          launch(CFG.RAMP_V + p.v * 0.13, o.h, true);
        } else {
          p.y = o.h * clamp((p.z - o.z) / o.L, 0, 1);
        }
      }
    } else {
      p.airT += dt;
      p.vy -= CFG.GRAVITY * dt;
      p.y += p.vy * dt;

      if (p.spinLock !== 0 && steer !== p.spinLock) p.spinLock = 0;
      const spinIn = p.spinLock === 0 ? steer : 0;
      if (spinIn !== 0) {
        p.spin += spinIn * CFG.SPIN_RATE * dt;
      } else {
        // let go and the rider straightens up toward the nearest half turn
        const snap = Math.round(p.spin / Math.PI) * Math.PI;
        p.spin += clamp(snap - p.spin, -4 * dt, 4 * dt);
      }
      if (grabInput()) p.grabT += dt;
      if (p.y <= 0 && p.vy < 0) land();
    }

    if (state === 'playing') collide(prevZ);
  }

  function updateCrashing(dt) {
    p.crashT += dt;
    p.v *= Math.pow(0.12, dt);
    p.z += p.v * dt;
    p.vx *= Math.pow(0.1, dt);
    p.x += p.vx * dt;
    if (!p.grounded) {
      p.vy -= CFG.GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.grounded = true; }
    } else {
      p.y = Math.max(0, p.y - dt * 3);
    }
    if (p.crashT > 1.2) gameOver();
  }

  function update(dt) {
    time += dt;
    if (state === 'title') updateTitle(dt);
    else if (state === 'playing') updatePlaying(dt);
    else if (state === 'crashing') updateCrashing(dt);

    const riding = state === 'playing' || state === 'title';
    const leanTarget = riding ? clamp(p.vx / maxLateral(), -1, 1) * 0.38 : 0;
    p.lean += (leanTarget - p.lean) * Math.min(1, dt * 10);

    // on the title screen the camera hangs back so the rider sweeps across the view
    const camTarget = state === 'title' ? lerp(center(p.z), p.x, 0.25) : p.x;
    cam.x += (camTarget - cam.x) * Math.min(1, dt * (state === 'title' ? 2 : 5));
    cam.z = p.z - CFG.CAM_BACK;
    roll += (-p.lean * 0.07 - roll) * Math.min(1, dt * 4);
    shake = Math.max(0, shake - dt * 2.2);

    if (riding && p.z - trailLastZ > 0.6) {
      trail.push(p.grounded ? { x: p.x, y: p.y, z: p.z } : null);
      if (trail.length > 24) trail.shift();
      trailLastZ = p.z;
    }

    spawnAhead();
    cleanup();
    emitSpray(dt);
    updateParticles(dt);
    updateFlakes(dt);
    updateAudio();
    updateHud();
  }

  function updateAudio() {
    if (!Sfx.ctx) return;
    let level = 0;
    let freq = 900;
    if ((state === 'playing' || state === 'crashing') && p.grounded) {
      const carve = clamp(Math.abs(p.vx) / maxLateral(), 0, 1);
      level = 0.03 + (p.v / CFG.MAX_SPEED) * 0.08 + carve * 0.12;
      freq = 600 + p.v * 25 + carve * 900;
      if (state === 'crashing') level *= clamp(p.v / 20, 0, 1);
    }
    Sfx.carve(level, freq);
  }

  // ------------------------------------------------------------------ HUD
  const hudCache = {};
  function setText(el, key, value) {
    if (hudCache[key] !== value) {
      hudCache[key] = value;
      el.textContent = value;
    }
  }

  function updateHud() {
    if (state !== 'playing' && state !== 'crashing') return;
    const score = currentScore();
    setText(ui.score, 'score', fmt(score));
    setText(ui.dist, 'dist', fmt(distance()));
    setText(ui.coins, 'coins', String(run.coins));
    setText(ui.speed, 'speed', String(Math.round(p.v * 3.6)));
    setText(ui.best, 'best', fmt(Math.max(run.best, score)));
  }

  function popup(name, pts) {
    ui.popup.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = name + '!';
    const s = document.createElement('span');
    s.textContent = '+' + pts;
    ui.popup.append(b, s);
    ui.popup.classList.remove('show');
    void ui.popup.offsetWidth; // restart the animation
    ui.popup.classList.add('show');
  }

  let hintTimer = null;
  function showHint() {
    ui.hint.textContent = touchMode
      ? 'Hold ◀ ▶ to carve · tap JUMP'
      : '← → carve  ·  SPACE jump  ·  ← → in the air to spin';
    ui.hint.classList.remove('fade');
    show(ui.hint, true);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => ui.hint.classList.add('fade'), 4500);
  }

  // ------------------------------------------------------------------ flow
  function startRun() {
    Sfx.init();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    // keep the scenery, clear the obstacles
    let j = 0;
    for (let i = 0; i < objs.length; i++) if (objs[i].deco) objs[j++] = objs[i];
    objs.length = j;

    run.startZ = p.z;
    run.coins = 0;
    run.trickPts = 0;
    run.tricks = 0;
    run.newBest = false;
    Object.assign(p, {
      y: 0, vx: 0, vy: 0, v: CFG.START_SPEED, grounded: true, ramp: null,
      spin: 0, spinLock: 0, grabT: 0, airT: 0, crashT: 0,
    });
    const c = center(p.z);
    p.x = clamp(p.x, c - CFG.HALF + 1, c + CFG.HALF - 1);
    lastGap = p.x - c;
    nextRowZ = p.z + CFG.CLEAR_START;

    state = 'playing';
    show(ui.title, false);
    show(ui.over, false);
    show(ui.pause, false);
    show(ui.hud, true);
    show(ui.pauseBtn, true);
    showHint();
    canvas.focus({ preventScroll: true });
  }

  function gameOver() {
    state = 'over';
    run.overAt = time;
    const score = currentScore();
    run.newBest = score > run.best;
    if (run.newBest) {
      run.best = score;
      store.set(BEST_KEY, score);
    }
    ui.reason.textContent = run.reason;
    ui.oDist.textContent = fmt(distance()) + ' m';
    ui.oCoins.textContent = String(run.coins);
    ui.oTricks.textContent = String(run.tricks);
    ui.oScore.textContent = fmt(score);
    ui.oBest.textContent = fmt(run.best);
    ui.titleBest.textContent = fmt(run.best);
    show(ui.newBest, run.newBest);
    show(ui.hud, false);
    show(ui.hint, false);
    show(ui.over, true);
    Sfx.carve(0, 800);
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      show(ui.pause, true);
      Sfx.carve(0, 800);
    } else if (state === 'paused') {
      state = 'playing';
      show(ui.pause, false);
      canvas.focus({ preventScroll: true });
    }
  }

  function toggleMute() {
    Sfx.setMuted(!Sfx.muted);
    store.set(MUTE_KEY, Sfx.muted);
    ui.muteBtn.innerHTML = Sfx.muted ? '&#128263;' : '&#128266;';
  }

  // Space / tap / click: does the obvious thing for the current screen
  function onAction() {
    if (state === 'title') startRun();
    else if (state === 'playing') jump();
    else if (state === 'paused') togglePause();
    else if (state === 'over' && time - run.overAt > 0.6) startRun();
  }

  // ------------------------------------------------------------------ rendering
  let skyGrad, groundGrad, fogGrad, sunGrad, vignetteGrad;
  let sunX = 0, sunY = 0, sunR = 30;
  let mtnFar = [], mtnNear = [], clouds = [], mtnSpan = 1;

  function makeRange(rnd, span, wMin, wMax, hMin, hMax) {
    const arr = [];
    let x = 0;
    while (x < span) {
      const w = wMin + rnd() * (wMax - wMin);
      arr.push({ x, w, h: hMin + rnd() * (hMax - hMin), skew: (rnd() - 0.5) * 0.35 });
      x += w * (0.6 + rnd() * 0.4);
    }
    return arr;
  }

  function buildBackdrop() {
    skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON);
    skyGrad.addColorStop(0, '#2f7fd6');
    skyGrad.addColorStop(0.55, '#74b6f0');
    skyGrad.addColorStop(1, '#d6ebff');

    groundGrad = ctx.createLinearGradient(0, HORIZON, 0, H);
    groundGrad.addColorStop(0, '#cddff2');
    groundGrad.addColorStop(1, '#e2edf9');

    fogGrad = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + (H - HORIZON) * 0.25);
    fogGrad.addColorStop(0, 'rgba(214,235,255,1)');
    fogGrad.addColorStop(1, 'rgba(214,235,255,0)');

    sunX = W * 0.78;
    sunY = HORIZON * 0.36;
    sunR = Math.max(24, H * 0.04);
    sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 5);
    sunGrad.addColorStop(0, 'rgba(255,255,245,1)');
    sunGrad.addColorStop(0.18, 'rgba(255,252,230,0.95)');
    sunGrad.addColorStop(0.3, 'rgba(255,240,200,0.35)');
    sunGrad.addColorStop(1, 'rgba(255,240,200,0)');

    vignetteGrad = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
    vignetteGrad.addColorStop(0, 'rgba(10,30,60,0)');
    vignetteGrad.addColorStop(1, 'rgba(10,30,60,0.28)');

    const rnd = seeded(11);
    const k = H / 800;
    mtnSpan = Math.max(W, 900) * 2;
    mtnFar = makeRange(rnd, mtnSpan, 140, 300, 70 * k, 170 * k);
    mtnNear = makeRange(rnd, mtnSpan, 90, 200, 35 * k, 95 * k);
    clouds = [];
    for (let i = 0; i < 7; i++) {
      clouds.push({ x: rnd() * mtnSpan, y: HORIZON * (0.1 + rnd() * 0.45), s: (0.6 + rnd() * 0.8) * Math.max(0.7, k) });
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, window.innerWidth);
    H = Math.max(240, window.innerHeight);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    F = Math.min(H * 0.95, W * 0.9);
    HORIZON = H * 0.34;
    const feetY = H * 0.82;
    CAM_H = ((feetY - HORIZON) * CFG.CAM_BACK) / F;
    ctx.imageSmoothingQuality = 'high';
    buildBackdrop();
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  function drawRange(arr, offset, color, capAlpha) {
    const base = HORIZON + 2;
    const o = ((offset % mtnSpan) + mtnSpan) % mtnSpan - mtnSpan * 0.25;
    const each = (fn) => {
      for (let rep = -1; rep <= 1; rep++) {
        const ox = o + rep * mtnSpan;
        for (const m of arr) {
          const cx = m.x + ox;
          if (cx + m.w < -W * 0.3 || cx - m.w > W * 1.3) continue;
          fn(m, cx, cx + m.skew * m.w, base - m.h);
        }
      }
    };

    ctx.fillStyle = color;
    ctx.beginPath();
    each((m, cx, ax, ay) => {
      ctx.moveTo(cx - m.w, base);
      ctx.lineTo(ax, ay);
      ctx.lineTo(cx + m.w, base);
      ctx.closePath();
    });
    ctx.fill();

    ctx.fillStyle = 'rgba(10,30,70,0.08)';
    ctx.beginPath();
    each((m, cx, ax, ay) => {
      ctx.moveTo(ax, ay);
      ctx.lineTo(cx + m.w, base);
      ctx.lineTo(ax + m.w * 0.15, base);
      ctx.closePath();
    });
    ctx.fill();

    ctx.fillStyle = `rgba(255,255,255,${capAlpha})`;
    ctx.beginPath();
    each((m, cx, ax, ay) => {
      const t = 0.32;
      const ly = ay + m.h * t;
      const lx = ax + (cx - m.w - ax) * t;
      const rx = ax + (cx + m.w - ax) * t;
      ctx.moveTo(ax, ay);
      ctx.lineTo(rx, ly);
      ctx.lineTo(lerp(lx, rx, 0.72), ay + m.h * t * 0.74);
      ctx.lineTo(lerp(lx, rx, 0.48), ay + m.h * t * 1.06);
      ctx.lineTo(lerp(lx, rx, 0.22), ay + m.h * t * 0.8);
      ctx.lineTo(lx, ly);
      ctx.closePath();
    });
    ctx.fill();
  }

  function drawSky() {
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-W, -H, W * 3, HORIZON + H + 2);
    ctx.fillStyle = sunGrad;
    ctx.fillRect(sunX - sunR * 5, sunY - sunR * 5, sunR * 10, sunR * 10);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    const off = time * 8 - cam.x * 1.5;
    for (const c of clouds) {
      const x = (((c.x + off) % mtnSpan) + mtnSpan) % mtnSpan - mtnSpan * 0.25;
      const s = c.s * 40;
      const blobs = [[0, 0, 2.2, 0.7], [-1.3, 0.2, 1.3, 0.5], [1.4, 0.15, 1.5, 0.55], [0.3, -0.45, 1.1, 0.6]];
      for (const [bx, by, rx, ry] of blobs) {
        ctx.moveTo(x + bx * s + rx * s, c.y + by * s);
        ctx.ellipse(x + bx * s, c.y + by * s, rx * s, ry * s, 0, 0, TAU);
      }
    }
    ctx.fill();

    drawRange(mtnFar, -cam.x * 1.2, '#a9c4e4', 0.9);
    drawRange(mtnNear, -cam.x * 2.5, '#86a6cf', 0.85);
  }

  const gz = [], gy = [], gs = [], gc = [];
  function quad(lA, rA, yA, lB, rB, yB) {
    ctx.beginPath();
    ctx.moveTo(lA, yA);
    ctx.lineTo(rA, yA);
    ctx.lineTo(rB, yB);
    ctx.lineTo(lB, yB);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround() {
    ctx.fillStyle = groundGrad;
    ctx.fillRect(-W, HORIZON, W * 3, H * 2);

    // sample the winding piste from far to near on a fixed world grid
    const step = 2;
    const zNear = cam.z + 0.8;
    let n = 0;
    for (let z = Math.floor((cam.z + CFG.DRAW) / step) * step; ; z -= step) {
      const zz = z > zNear ? z : zNear;
      const s = F / (zz - cam.z);
      gz[n] = zz;
      gs[n] = s;
      gy[n] = HORIZON + CAM_H * s;
      gc[n] = W * 0.5 + (center(zz) - cam.x) * s;
      n++;
      if (zz === zNear) break;
    }

    const HALF = CFG.HALF;
    for (let i = 0; i < n - 1; i++) {
      const sA = gs[i], sB = gs[i + 1], cA = gc[i], cB = gc[i + 1], yA = gy[i], yB = gy[i + 1];
      // shaded shoulder where the forest starts
      ctx.fillStyle = '#d3e2f2';
      quad(cA - (HALF + 4) * sA, cA + (HALF + 4) * sA, yA, cB - (HALF + 4) * sB, cB + (HALF + 4) * sB, yB);
      // groomed piste with bands that rush past
      ctx.fillStyle = Math.floor(gz[i + 1] / 8) & 1 ? '#f4f9ff' : '#e9f1fb';
      quad(cA - HALF * sA, cA + HALF * sA, yA, cB - HALF * sB, cB + HALF * sB, yB);
      // piste edges
      ctx.fillStyle = '#c3d6ec';
      quad(cA - HALF * sA, cA - (HALF - 0.35) * sA, yA, cB - HALF * sB, cB - (HALF - 0.35) * sB, yB);
      quad(cA + (HALF - 0.35) * sA, cA + HALF * sA, yA, cB + (HALF - 0.35) * sB, cB + HALF * sB, yB);
    }

    // corduroy grooming lines
    ctx.strokeStyle = 'rgba(150,180,215,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = -6; k <= 6; k++) {
      const off = k * 1.45;
      for (let i = 0; i < n; i++) {
        const x = gc[i] + off * gs[i];
        if (i === 0) ctx.moveTo(x, gy[i]);
        else ctx.lineTo(x, gy[i]);
      }
    }
    ctx.stroke();

    // the line your board carves into the snow
    ctx.strokeStyle = 'rgba(130,165,210,0.55)';
    ctx.lineCap = 'round';
    for (let i = 1; i <= trail.length; i++) {
      const a = trail[i - 1];
      const b = i < trail.length ? trail[i] : (p.grounded && (state === 'playing' || state === 'title') ? p : null);
      if (!a || !b) continue;
      if (!proj(b.x, b.y, b.z)) continue;
      const bx = PX, by = PY, bs = PS;
      if (!proj(a.x, a.y, a.z)) continue;
      ctx.lineWidth = Math.max(1, 0.12 * bs);
      ctx.beginPath();
      ctx.moveTo(PX, PY);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // haze toward the horizon
    ctx.fillStyle = fogGrad;
    ctx.fillRect(-W, HORIZON - 1, W * 3, (H - HORIZON) * 0.25 + 1);
  }

  function shadow(x, y, rx, ry, alpha) {
    ctx.fillStyle = `rgba(55,90,145,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  function drawSprite(o, img, ww, wh) {
    if (!proj(o.x, 0, o.z)) return;
    const w = ww * o.sc * PS;
    const h = wh * o.sc * PS;
    if (PX + w < -W * 0.25 || PX - w > W * 1.25) return;
    const squash = clamp(CAM_H / o.dz, 0.08, 0.6);
    shadow(PX + w * 0.06, PY, w * 0.42, w * 0.42 * squash, 0.2);
    ctx.drawImage(img, PX - w / 2, PY - h, w, h);
  }

  function drawCoin(o) {
    const bob = Math.sin(time * 3 + o.z) * 0.08;
    if (!proj(o.x, o.y + bob, o.z)) return;
    const r = 0.34 * PS;
    if (r < 0.7) return;
    const spin = Math.abs(Math.cos(time * 3.2 + o.z * 0.5));
    const rx = Math.max(r * 0.14, r * spin);
    ctx.fillStyle = '#e39400';
    ctx.beginPath(); ctx.ellipse(PX, PY, rx, r, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.ellipse(PX, PY, rx * 0.78, r * 0.78, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(PX - rx * 0.25, PY - r * 0.3, rx * 0.18, r * 0.22, 0, 0, TAU); ctx.fill();
  }

  function drawPole(o) {
    if (!proj(o.x, 0, o.z)) return;
    const w = Math.max(1, 0.09 * PS);
    const h = 1.7 * PS;
    const seg = h / 5;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#1d2440' : '#ff6a00';
      ctx.fillRect(PX - w / 2, PY - h + i * seg, w, seg + 0.5);
    }
  }

  function drawRamp(o) {
    const x0 = o.x - o.w, x1 = o.x + o.w, z0 = o.z, z1 = o.z + o.L;
    if (z0 - cam.z < 0.6) return;
    proj(x0, 0, z0); const ax = PX, ay = PY;
    proj(x1, 0, z0); const bx = PX, by = PY;
    proj(x1, o.h, z1); const cx = PX, cy = PY, cs = PS;
    proj(x0, o.h, z1); const dx = PX, dy = PY;
    proj(x0, 0, z1); const ex = PX, ey = PY;
    proj(x1, 0, z1); const fx = PX, fy = PY;

    // sides
    ctx.fillStyle = '#5f95cc';
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(dx, dy); ctx.lineTo(ex, ey); ctx.closePath();
    ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(fx, fy); ctx.closePath();
    ctx.fill();

    // riding surface (blue, so it stands out from the snow)
    const g = ctx.createLinearGradient(0, dy, 0, ay);
    g.addColorStop(0, '#d5ebff');
    g.addColorStop(1, '#86bdf0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath();
    ctx.fill();

    // stripes and lip
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1, 0.06 * cs);
    ctx.beginPath();
    for (const t of [0.25, 0.5, 0.75]) {
      ctx.moveTo(lerp(ax, dx, t), lerp(ay, dy, t));
      ctx.lineTo(lerp(bx, cx, t), lerp(by, cy, t));
    }
    ctx.stroke();
    ctx.strokeStyle = '#ff6a1a';
    ctx.lineWidth = Math.max(2, 0.1 * cs);
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }

  const JACKET = '#ff6b1a';
  const JACKET_DARK = '#d9530c';

  function drawRider(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s); // from here on, 1 unit = 1 metre, up is negative y

    let crouch = 0;
    const grabbing = !p.grounded && grabInput() && state === 'playing';
    if (state === 'crashing' || state === 'over') {
      const k = clamp(p.crashT / 0.9, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const lift = Math.sin(k * Math.PI) * 0.6;
      ctx.translate(0, -0.85 - lift + e * 0.6);
      ctx.rotate(e * (TAU + Math.PI / 2) * p.crashDir);
      ctx.translate(0, 0.85);
    } else {
      ctx.rotate(p.lean);
      crouch = p.grounded ? 0.06 + Math.abs(p.lean) * 0.25 : grabbing ? 0.3 : 0.12;
    }

    const c = Math.cos(p.spin);
    const front = c < 0;
    ctx.scale(Math.max(0.16, Math.abs(c)), 1);

    const hipY = -0.9 + crouch;
    const kneeY = (hipY - 0.16) / 2;
    const shY = hipY - 0.5;
    const headY = shY - 0.25;

    // board
    ctx.fillStyle = '#18213f';
    rr(-0.86, -0.12, 1.72, 0.12, 0.06); ctx.fill();
    ctx.fillStyle = '#ff3d6e';
    rr(-0.8, -0.05, 1.6, 0.04, 0.02); ctx.fill();

    // legs and boots
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2b3a6b';
    ctx.lineWidth = 0.19;
    ctx.beginPath();
    ctx.moveTo(-0.36, -0.16); ctx.lineTo(-0.42, kneeY); ctx.lineTo(-0.13, hipY);
    ctx.moveTo(0.36, -0.16); ctx.lineTo(0.42, kneeY); ctx.lineTo(0.13, hipY);
    ctx.stroke();
    ctx.fillStyle = '#121626';
    rr(-0.49, -0.21, 0.26, 0.11, 0.04); ctx.fill();
    rr(0.23, -0.21, 0.26, 0.11, 0.04); ctx.fill();

    // jacket
    ctx.fillStyle = JACKET;
    rr(-0.27, shY - 0.04, 0.54, hipY - shY + 0.16, 0.12); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-0.27, shY + 0.2, 0.54, 0.07);

    // arms out for balance (or reaching for a grab)
    const wave = Math.sin(time * 6) * 0.03;
    const handL = [-0.72, shY + 0.32 + wave];
    const handR = grabbing ? [0.32, -0.16] : [0.72, shY + 0.32 - wave];
    ctx.strokeStyle = JACKET;
    ctx.lineWidth = 0.15;
    ctx.beginPath();
    ctx.moveTo(-0.22, shY + 0.08); ctx.lineTo(-0.5, shY + 0.2 - wave); ctx.lineTo(handL[0], handL[1]);
    ctx.moveTo(0.22, shY + 0.08);
    if (grabbing) ctx.lineTo(0.42, hipY + 0.05);
    else ctx.lineTo(0.5, shY + 0.2 + wave);
    ctx.lineTo(handR[0], handR[1]);
    ctx.stroke();
    ctx.fillStyle = '#15192b';
    ctx.beginPath();
    ctx.arc(handL[0], handL[1], 0.075, 0, TAU);
    ctx.arc(handR[0], handR[1], 0.075, 0, TAU);
    ctx.fill();

    // collar and head
    ctx.fillStyle = JACKET_DARK;
    rr(-0.15, shY - 0.11, 0.3, 0.13, 0.05); ctx.fill();
    ctx.fillStyle = front ? '#f2c8a0' : '#5a3b26';
    ctx.beginPath(); ctx.arc(0, headY, 0.17, 0, TAU); ctx.fill();

    // beanie with a pom-pom
    ctx.fillStyle = '#1fb5ff';
    ctx.beginPath(); ctx.arc(0, headY + 0.01, 0.185, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1590d6';
    rr(-0.19, headY - 0.03, 0.38, 0.07, 0.03); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, headY - 0.2, 0.07, 0, TAU); ctx.fill();

    // goggles (strap from behind, lens from the front)
    ctx.fillStyle = '#20232f';
    rr(-0.18, headY + 0.05, 0.36, 0.06, 0.02); ctx.fill();
    if (front) {
      ctx.fillStyle = '#ff9a2e';
      rr(-0.14, headY + 0.03, 0.28, 0.1, 0.04); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(-0.1, headY + 0.045, 0.08, 0.025);
    }

    ctx.restore();
  }

  function drawPlayer() {
    const groundY = p.ramp ? p.y : 0;
    if (proj(p.x, groundY, p.z)) {
      const h = p.y - groundY;
      const a = clamp(0.3 - h * 0.05, 0.08, 0.3);
      const squash = clamp(CAM_H / CFG.CAM_BACK, 0.1, 0.6) * 0.5;
      shadow(PX, PY, 0.95 * PS, 0.95 * PS * squash, a);
    }
    if (proj(p.x, p.y, p.z)) drawRider(PX, PY, PS);
  }

  const playerToken = { t: 'player', dz: 0 };
  const byDepth = (a, b) => b.dz - a.dz;

  function drawWorld() {
    vis.length = 0;
    for (const o of objs) {
      if (o.t === 'coin' && o.taken) continue;
      const near = o.z - cam.z;
      const dz = near + (o.L || 0);
      if (near < 0.6 || near > CFG.DRAW) continue;
      o.dz = dz;
      vis.push(o);
    }
    playerToken.dz = p.z - cam.z + 0.01;
    vis.push(playerToken);
    vis.sort(byDepth);

    for (const o of vis) {
      ctx.globalAlpha = clamp((CFG.DRAW - (o.dz - (o.L || 0))) / 30, 0, 1);
      switch (o.t) {
        case 'tree': drawSprite(o, TREES[o.v], 2.4, 4.8); break;
        case 'rock': drawSprite(o, ROCK, 1.9, 1.2); break;
        case 'snowman': drawSprite(o, SNOWMAN, 1.25, 2.0); break;
        case 'coin': drawCoin(o); break;
        case 'ramp': drawRamp(o); break;
        case 'pole': drawPole(o); break;
        case 'player': drawPlayer(); break;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    // a soft blue shadow under each white puff so spray reads against white snow
    for (let color = 0; color < 2; color++) {
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = color === 0 ? (pass === 0 ? '#9fbbe0' : '#ffffff') : (pass === 0 ? '#e39400' : '#ffe27a');
        for (const q of parts) {
          if (q.color !== color || !proj(q.x, q.y, q.z)) continue;
          const r = clamp(q.size * PS, 0.8, 9);
          const nearFade = clamp((q.z - cam.z - 0.3) / 2.5, 0, 1);
          ctx.globalAlpha = clamp(q.life / q.max, 0, 1) * nearFade * (pass === 0 ? 0.45 : 0.95);
          ctx.beginPath();
          if (pass === 0) ctx.arc(PX + r * 0.15, PY + r * 0.22, r, 0, TAU);
          else ctx.arc(PX, PY, r * 0.9, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFlakes() {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    for (const f of flakes) {
      if (!proj(f.x, f.y, f.z)) continue;
      const r = clamp(f.s * PS, 0.6, 3.5);
      ctx.moveTo(PX + r, PY);
      ctx.arc(PX, PY, r, 0, TAU);
    }
    ctx.fill();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save();
    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 16 : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake * 12 : 0;
    const pivotY = H * 0.75;
    ctx.translate(W / 2 + sx, pivotY + sy);
    ctx.rotate(roll);
    ctx.translate(-W / 2, -pivotY);

    drawSky();
    drawGround();
    drawWorld();
    drawParticles();
    drawFlakes();
    ctx.restore();

    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------------ input
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down' };

  function clearKeys() {
    for (const k in keys) keys[k] = false;
    ui.touch.querySelectorAll('button.on').forEach((b) => b.classList.remove('on'));
  }

  window.addEventListener('keydown', (e) => {
    const k = KEYS[e.code];
    if (k) {
      keys[k] = true;
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'Space': case 'ArrowUp': case 'KeyW': case 'Enter':
        e.preventDefault();
        if (!e.repeat) onAction();
        break;
      case 'KeyP': case 'Escape':
        if (!e.repeat) togglePause();
        break;
      case 'KeyM':
        if (!e.repeat) toggleMute();
        break;
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYS[e.code];
    if (k) keys[k] = false;
  });
  window.addEventListener('blur', () => {
    clearKeys();
    if (state === 'playing') togglePause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') togglePause();
  });
  window.addEventListener('resize', resize);

  // overlays: click anywhere on them (the buttons included)
  ui.title.addEventListener('click', () => { if (state === 'title') startRun(); });
  ui.over.addEventListener('click', () => { if (state === 'over' && time - run.overAt > 0.6) startRun(); });
  ui.pause.addEventListener('click', () => { if (state === 'paused') togglePause(); });
  ui.muteBtn.addEventListener('click', (e) => { toggleMute(); e.currentTarget.blur(); });
  ui.pauseBtn.addEventListener('click', (e) => { togglePause(); e.currentTarget.blur(); });
  canvas.addEventListener('pointerdown', () => { if (state === 'over') onAction(); });

  // touch controls
  function enableTouch() {
    if (touchMode) return;
    touchMode = true;
    document.body.classList.add('touch');
    show(ui.touch, true);
  }
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enableTouch();
  window.addEventListener('touchstart', enableTouch, { passive: true });

  ui.touch.querySelectorAll('button').forEach((b) => {
    const k = b.dataset.k;
    const set = (on) => {
      b.classList.toggle('on', on);
      if (k === 'left') keys.tLeft = on;
      else if (k === 'right') keys.tRight = on;
      else keys.tGrab = on;
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
      set(true);
      if (k === 'jump') onAction();
    });
    b.addEventListener('pointerup', () => set(false));
    b.addEventListener('pointercancel', () => set(false));
    b.addEventListener('lostpointercapture', () => set(false));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ------------------------------------------------------------------ boot
  resize();
  p.z = 0;
  p.x = center(0);
  cam.x = p.x;
  cam.z = p.z - CFG.CAM_BACK;
  nextDecoZ = cam.z - 4;
  nextPoleZ = 0;
  for (let i = 0; i < 170; i++) {
    const f = {};
    resetFlake(f, true);
    flakes.push(f);
  }
  spawnAhead();
  ui.titleBest.textContent = fmt(run.best);
  ui.best.textContent = fmt(run.best);
  if (Sfx.muted) ui.muteBtn.innerHTML = '&#128263;';

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (state !== 'paused') update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // small read-only handle, handy for debugging in the browser console
  window.ShredSlope = {
    get state() { return state; },
    get score() { return currentScore(); },
    get player() { return { x: p.x, y: p.y, z: p.z, v: p.v, grounded: p.grounded }; },
  };
})();
