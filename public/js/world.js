/*
 * Shred Slope: the mountains.
 * Each map has its own light, sky, course shape and zones. Courses are seeded: the same
 * map + seed gives everyone the exact same run, which keeps multiplayer races fair.
 * Static geometry is baked into 50 m chunks.
 */
(function () {
  'use strict';
  const SS = window.SS;
  const TAU = Math.PI * 2;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SS.rng = mulberry32;

  const C = {
    LENGTH: 2600,   // start gate at z = 0, finish arch at z = LENGTH
    RUNOUT: 170,
    HALF: 17,       // half-width of the groomed piste (set per map)
    CHUNK: 50,
    Z0: -90,
    DRAW: 440,
  };
  C.ZMAX = C.LENGTH + C.RUNOUT + 90;
  SS.COURSE = C;

  const KICK = {
    S: { Hk: 1.3, Lu: 6, Lt: 4, Ll: 11, w: 2.6 },
    M: { Hk: 2.1, Lu: 8, Lt: 7, Ll: 14, w: 3.2 },
    L: { Hk: 3.0, Lu: 10, Lt: 10, Ll: 18, w: 3.8 },
    XL: { Hk: 4.0, Lu: 13, Lt: 14, Ll: 24, w: 4.6 },
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const hash = (x, z) => {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  // ------------------------------------------------------------------ the maps
  const Z = (name, type) => ({ name, type });
  const MAPS = {
    night: {
      id: 'night', name: 'Floodlit Night', time: 'NIGHT', diff: 'MEDIUM',
      sub: 'The classic: a floodlit night run under the northern lights.',
      half: 17, curve: [34, 230, 12, 87], slope: 0.235, alt: 2840,
      zones: [Z('KICKER LINE', 'kickers'), Z('PINE ALLEY', 'trees'), Z('RAIL YARD', 'rails'), Z('ROLLER COASTER', 'rollers'), Z('BIG AIR', 'bigair'), Z('JIB GARDEN', 'jib')],
      shuffle: true, first: 'THE SUMMIT',
      light: { sky: [0.30, 0.34, 0.50], ground: [0.10, 0.11, 0.17], sunDir: norm3([0.35, 0.8, -0.45]), sun: [0.26, 0.29, 0.40], fog: [0.09, 0.13, 0.25], rim: [0.22, 0.3, 0.5], snow: [0.95, 0.97, 1.0], powder: [0.86, 0.9, 1.0] },
      sky: { zen: [0.012, 0.02, 0.058], hor: [0.10, 0.15, 0.28], dir: norm3([-0.45, 0.42, 0.78]), col: [0.7, 0.75, 0.9], disk: 0.99955, glow: [14, 0.28, 300, 0.35], aurora: 1, cloudDark: [0.05, 0.07, 0.14], cloudLit: [0.2, 0.24, 0.36], clouds: 0.85, stars: 1 },
      lamps: { every: 44, i: 1.8, col: [1, 0.93, 0.8] },
      trees: { near: 0.82, far: 0.75, snow: 1, green: [0.07, 0.17, 0.12] },
      snowfall: 1, nets: true, shadows: false,
      mtn: { dark: [0.07, 0.09, 0.16], cap: [0.32, 0.36, 0.5], k: [0.25, 0.55] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 12000, t: 'Score 12,000' }, { k: 'tokens', v: 30, t: 'Collect 30 tokens' }],
      card: 'linear-gradient(180deg,#050a1c 0%,#0f2348 55%,#1d3a6e 100%)', accent: '#59ffb0',
    },
    bluebird: {
      id: 'bluebird', name: 'Bluebird Peak', time: 'SUNNY DAY', diff: 'EASY',
      sub: 'Blue sky, fresh corduroy and the biggest kickers on the mountain.',
      half: 20, curve: [26, 260, 10, 110], slope: 0.245, alt: 3120,
      zones: [Z('KICKER PARADISE', 'kickers'), Z('GLACIER ROLLERS', 'rollers'), Z('JIB PARK', 'jib'), Z('MEGA AIR', 'mega'), Z('PINE GLADES', 'trees'), Z('SLOPESTYLE RAILS', 'rails')],
      first: 'SUNNY SUMMIT',
      light: { sky: [0.36, 0.44, 0.62], ground: [0.26, 0.27, 0.33], sunDir: norm3([-0.32, 0.42, 0.85]), sun: [0.62, 0.6, 0.53], fog: [0.7, 0.8, 0.94], rim: [0.25, 0.3, 0.38], snow: [0.9, 0.93, 0.97], powder: [0.86, 0.9, 0.97] },
      sky: { zen: [0.1, 0.32, 0.78], hor: [0.62, 0.78, 0.95], dir: norm3([-0.32, 0.42, 0.85]), col: [1.0, 0.95, 0.8], disk: 0.9993, glow: [8, 0.35, 120, 0.6], aurora: 0, cloudDark: [0.7, 0.76, 0.88], cloudLit: [1.0, 1.0, 1.0], clouds: 0.7, stars: 0 },
      lamps: null, banners: true,
      trees: { near: 0.6, far: 0.75, snow: 0.6, green: [0.09, 0.24, 0.15] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.4, 0.5, 0.7], cap: [0.95, 0.97, 1.0], k: [0.6, 0.45] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 15000, t: 'Score 15,000' }, { k: 'perfects', v: 4, t: 'Land 4 perfect landings' }],
      card: 'linear-gradient(180deg,#1a57c8 0%,#5aa0f0 55%,#cfe6ff 100%)', accent: '#ffd23f',
    },
    sunset: {
      id: 'sunset', name: 'Golden Ridge', time: 'SUNSET', diff: 'MEDIUM',
      sub: 'Golden hour on a winding ridge. Long shadows, fast rollers.',
      half: 15, curve: [34, 210, 14, 80], slope: 0.25, alt: 2980,
      zones: [Z('RIDGE ROLLERS', 'rollers'), Z('CANYON KICKERS', 'kickers'), Z('SUNSET RAILS', 'rails'), Z('LONG SHADOWS', 'trees'), Z('BIG AIR', 'bigair'), Z('AFTERGLOW JIBS', 'jib')],
      first: 'GOLDEN SUMMIT',
      light: { sky: [0.3, 0.27, 0.42], ground: [0.14, 0.1, 0.14], sunDir: norm3([0.75, 0.22, 0.62]), sun: [1.15, 0.68, 0.4], fog: [0.75, 0.48, 0.45], rim: [0.45, 0.28, 0.3], snow: [0.95, 0.94, 0.97], powder: [0.9, 0.88, 0.95] },
      sky: { zen: [0.16, 0.16, 0.38], hor: [1.0, 0.56, 0.36], dir: norm3([0.75, 0.16, 0.62]), col: [1.0, 0.6, 0.3], disk: 0.9992, glow: [5, 0.55, 60, 0.7], aurora: 0, cloudDark: [0.35, 0.22, 0.35], cloudLit: [1.0, 0.62, 0.45], clouds: 0.75, stars: 0.25 },
      lamps: { every: 60, i: 0.9, col: [1, 0.85, 0.62] },
      trees: { near: 0.55, far: 0.6, snow: 0.8, green: [0.08, 0.16, 0.11] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.25, 0.16, 0.26], cap: [1.0, 0.72, 0.6], k: [0.4, 0.6] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 13000, t: 'Score 13,000' }, { k: 'time', v: 110, t: 'Finish under 1:50' }],
      card: 'linear-gradient(180deg,#2a2a66 0%,#c8577a 45%,#ff9a52 75%,#ffd27a 100%)', accent: '#ffb14a',
    },
    woods: {
      id: 'woods', name: 'Moonlit Woods', time: 'NIGHT', diff: 'HARD',
      sub: 'A full moon over a dense, snow-heavy forest. Thread the trees.',
      half: 16, curve: [30, 190, 14, 70], slope: 0.24, alt: 2610,
      zones: [Z('DARK FOREST', 'trees'), Z('TREE SLALOM', 'slalom'), Z('KICKER LINE', 'kickers'), Z('FROSTBITE ROLLERS', 'rollers'), Z('MOON JUMP', 'bigair'), Z('OLD RAILS', 'rails')],
      first: 'MOONLIT START',
      light: { sky: [0.2, 0.26, 0.44], ground: [0.05, 0.06, 0.11], sunDir: norm3([0.25, 0.75, 0.6]), sun: [0.36, 0.44, 0.66], fog: [0.04, 0.06, 0.13], rim: [0.25, 0.35, 0.6], snow: [0.95, 0.97, 1.0], powder: [0.88, 0.92, 1.0] },
      sky: { zen: [0.01, 0.015, 0.05], hor: [0.06, 0.09, 0.2], dir: norm3([0.28, 0.3, 0.9]), col: [0.85, 0.9, 1.0], disk: 0.9988, glow: [10, 0.4, 200, 0.5], aurora: 0.25, cloudDark: [0.03, 0.04, 0.09], cloudLit: [0.25, 0.3, 0.45], clouds: 0.6, stars: 1 },
      lamps: { every: 72, i: 1.6, col: [1, 0.85, 0.6] },
      trees: { near: 1.0, far: 0.95, snow: 1.35, green: [0.05, 0.13, 0.1], dense: true },
      snowfall: 1.6, nets: false, shadows: false,
      mtn: { dark: [0.04, 0.05, 0.1], cap: [0.3, 0.36, 0.52], k: [0.2, 0.6] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 9000, t: 'Score 9,000' }, { k: 'nobail', t: 'Finish without bailing' }],
      card: 'radial-gradient(circle at 70% 25%,#e8efff 0 6%,#5d74a8 7%,#14214a 30%,#060b1e 75%)', accent: '#bcd2ff',
    },
    cave: {
      id: 'cave', name: 'Crystal Caverns', time: 'UNDERGROUND', diff: 'HARD',
      sub: 'Drop into the mountain. A glowing ice cave full of crystals, icicles and rails.',
      half: 14, curve: [22, 210, 9, 90], slope: 0.24, alt: 2450,
      zones: [Z('FROZEN GATE', 'rollers'), Z('CRYSTAL HALL', 'kickers'), Z('ICICLE CORRIDOR', 'pillars'), Z('DEEP CAVERN', 'bigair'), Z('UNDERGROUND RAILS', 'rails'), Z('THE LIGHT', 'jib')],
      first: 'SNOWY APPROACH', cave: [430, 2330],
      light: { sky: [0.24, 0.28, 0.44], ground: [0.08, 0.09, 0.15], sunDir: norm3([0.35, 0.8, -0.45]), sun: [0.22, 0.26, 0.38], fog: [0.07, 0.1, 0.2], rim: [0.3, 0.3, 0.55], snow: [0.93, 0.96, 1.0], powder: [0.85, 0.9, 1.0],
        caveSky: [0.03, 0.035, 0.07], caveGround: [0.02, 0.02, 0.04], caveFog: [0.025, 0.03, 0.08], caveRim: [0.25, 0.45, 0.8] },
      sky: { zen: [0.015, 0.02, 0.06], hor: [0.12, 0.13, 0.28], dir: norm3([-0.45, 0.42, 0.78]), col: [0.7, 0.75, 0.9], disk: 0.99955, glow: [14, 0.28, 300, 0.35], aurora: 0.6, cloudDark: [0.05, 0.06, 0.13], cloudLit: [0.2, 0.22, 0.36], clouds: 0.8, stars: 1 },
      lamps: { every: 50, i: 1.5, col: [1, 0.9, 0.75] },
      trees: { near: 0.8, far: 0.75, snow: 1.1, green: [0.06, 0.15, 0.11] },
      snowfall: 0.8, nets: false, shadows: false,
      mtn: { dark: [0.06, 0.07, 0.14], cap: [0.3, 0.33, 0.48], k: [0.25, 0.55] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 12000, t: 'Score 12,000' }, { k: 'tokens', v: 35, t: 'Collect 35 tokens' }],
      card: 'radial-gradient(ellipse at 50% 120%,#3ff0ff 0%,#5a3cff 25%,#1c1145 55%,#07051a 85%)', accent: '#7cf7ff',
    },
  };
  SS.MAPS = MAPS;
  SS.MAP_IDS = ['night', 'bluebird', 'sunset', 'woods', 'cave'];

  const CRYSTAL_COLS = [[0.35, 0.95, 1.0], [0.65, 0.45, 1.0], [0.3, 1.0, 0.75], [1.0, 0.45, 0.85]];

  class World {
    constructor(seed, mapId) {
      this.map = MAPS[mapId] || MAPS.night;
      this.mapId = this.map.id;
      this.seed = seed >>> 0;
      C.HALF = this.map.half;
      this.L = this.map.light;
      this.cave = this.map.cave || null;
      this.rnd = mulberry32((this.seed || 1) ^ (SS.MAP_IDS.indexOf(this.mapId) * 0x9e3779b1));
      this.surf = 0;
      this.surfRef = null;
      this.n = C.ZMAX - C.Z0 + 2;
      this.buildPath();
      this.buildZones();
      this.buildProfiles();
      this.place();
      this.chunks = [];
    }

    // 0 outside, 1 deep inside the cave
    caveK(z) {
      const c = this.cave;
      if (!c) return 0;
      return smooth(clamp((z - c[0] + 12) / 40, 0, 1)) * smooth(clamp((c[1] + 12 - z) / 40, 0, 1));
    }
    inCave(z) { return !!this.cave && z > this.cave[0] && z < this.cave[1]; }
    // roughly the underside of the cave roof above (x, z), ignoring its bumps
    ceilingY(x, z) {
      const RW = C.HALF + 9, d = (x - this.center(z)) / RW;
      const k = 1 - d * d;
      return this.base(z) + 7 + (k > 0 ? Math.sqrt(k) * 12.5 : 0);
    }

    // ---------------------------------------------------------------- path and profiles
    buildPath() {
      const r = this.rnd;
      this.p1 = r() * TAU;
      this.p2 = r() * TAU;
      this.p3 = r() * TAU;
      this.pr = r() * TAU;
      const cv = this.map.curve;
      const raw = (z) => cv[0] * Math.sin(z / cv[1] + this.p1) + cv[2] * Math.sin(z / cv[3] + this.p2);
      const c0 = raw(0);
      this.cArr = new Float32Array(this.n);
      for (let i = 0; i < this.n; i++) this.cArr[i] = raw(C.Z0 + i) - c0;
    }

    buildZones() {
      const mids = this.map.zones.slice();
      if (this.map.shuffle) {
        for (let i = mids.length - 1; i > 0; i--) {
          const j = Math.floor(this.rnd() * (i + 1));
          [mids[i], mids[j]] = [mids[j], mids[i]];
        }
      }
      this.zones = [{ name: this.map.first, type: 'summit', z0: C.Z0, z1: 220 }];
      let z = 220;
      for (const m of mids) {
        this.zones.push({ name: m.name, type: m.type, z0: z, z1: z + 380 });
        z += 380;
      }
      this.zones.push({ name: 'THE FINISH', type: 'finish', z0: z, z1: C.ZMAX + 10 });
    }

    zoneAt(z) {
      for (const zn of this.zones) if (z < zn.z1) return zn;
      return this.zones[this.zones.length - 1];
    }

    buildProfiles() {
      const n = this.n;
      const slope = new Float32Array(n), amp = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const z = C.Z0 + i;
        const t = this.zoneAt(z).type;
        let s = this.map.slope + 0.05 * Math.sin(z / 160 + this.p3);
        if (t === 'kickers') s += 0.02;
        else if (t === 'bigair' || t === 'mega') s += 0.03;
        else if (t === 'rails') s -= 0.03;
        else if (t === 'slalom') s -= 0.04;
        if (z < 30) s = lerp(0.1, s, clamp((z + 30) / 60, 0, 1));
        if (z > C.LENGTH + 10) s = lerp(s, 0.025, clamp((z - C.LENGTH - 10) / 70, 0, 1));
        slope[i] = s;
        amp[i] = t === 'rollers' ? 1.7 : t === 'summit' ? 0.35 : t === 'finish' ? 0.1 : 0.18;
        if (z < 20) amp[i] = 0;
      }
      const blur = (src, w) => {
        const out = new Float32Array(n);
        let acc = 0;
        const q = [];
        for (let i = 0; i < n + w; i++) {
          if (i < n) { acc += src[i]; q.push(src[i]); }
          if (q.length > 2 * w + 1) acc -= q.shift();
          const c = i - w;
          if (c >= 0 && c < n) out[c] = acc / q.length;
        }
        return out;
      };
      const sl = blur(slope, 15);
      this.ampArr = blur(amp, 20);
      this.bArr = new Float32Array(n);
      for (let i = 1; i < n; i++) this.bArr[i] = this.bArr[i - 1] - sl[i - 1];
      const b0 = this.sample(this.bArr, 0);
      for (let i = 0; i < n; i++) this.bArr[i] -= b0;
      // how cave-like each metre is (steeper walls inside)
      this.kArr = new Float32Array(n);
      for (let i = 0; i < n; i++) this.kArr[i] = this.caveK(C.Z0 + i);
    }

    sample(arr, z) {
      let f = z - C.Z0;
      if (f < 0) f = 0;
      else if (f > this.n - 1.001) f = this.n - 1.001;
      const i = f | 0, t = f - i;
      return arr[i] + (arr[i + 1] - arr[i]) * t;
    }

    center(z) { return this.sample(this.cArr, z); }
    base(z) { return this.sample(this.bArr, z); }
    altitude(z) { return Math.round(this.map.alt + this.base(z)); }

    // snow surface without park features
    ground(x, z) {
      const c = this.sample(this.cArr, z);
      const off = x - c;
      const e = Math.abs(off) - C.HALF;
      let y = this.sample(this.bArr, z);
      y += 0.3 * Math.sin(z * 0.045 + off * 0.11 + this.pr) + 0.2 * Math.sin(z * 0.11 - off * 0.07);
      const ra = this.sample(this.ampArr, z);
      if (ra > 0.01) {
        const fade = e < 0 ? 1 : Math.max(0, 1 - e / 6);
        y += ra * Math.sin((z * TAU) / 26 + this.pr) * fade;
      }
      if (e > 0) {
        const ck = this.cave ? this.sample(this.kArr, z) : 0;
        const ee = e < 38 ? e : 38;
        y += lerp(0.05, 0.13, ck) * ee * ee + (e > 38 ? (e - 38) * 0.9 : 0);
        y += Math.min(1, e / 15) * (1 - ck * 0.7) * (4 * Math.sin(x * 0.045 + z * 0.02) + 2.5 * Math.sin(z * 0.07 + x * 0.03));
      }
      return y;
    }

    kickerH(f, x, z) {
      const u = z - f.z0;
      if (u < 0 || u > f.len) return 0;
      const dx = Math.abs(x - (this.center(z) + f.off));
      if (dx >= f.w + 2.5) return 0;
      const lat = dx <= f.w ? 1 : smooth(1 - (dx - f.w) / 2.5);
      let p;
      if (u < f.Lu) p = f.Hk * Math.pow(u / f.Lu, 1.7);
      else if (u < f.Lu + f.Lt) p = f.Hk;
      else p = f.Hk * 0.5 * (1 + Math.cos(Math.PI * ((u - f.Lu - f.Lt) / f.Ll)));
      return p * lat;
    }

    // snow plus kickers (no rails): used for slope forces so rails don't disturb them
    Hk(x, z) {
      let y = this.ground(x, z);
      const b = this.fb[((z - C.Z0) / 10) | 0];
      if (b) for (let i = 0; i < b.length; i++) if (b[i].kind === 'kicker') y += this.kickerH(b[i], x, z);
      return y;
    }

    // full surface height; sets this.surf (0 snow, 1 kicker, 2 box/rail) and this.surfRef
    H(x, z) {
      let y = this.ground(x, z);
      this.surf = 0;
      this.surfRef = null;
      const b = this.fb[((z - C.Z0) / 10) | 0];
      if (!b) return y;
      const g = y;
      for (let i = 0; i < b.length; i++) {
        const f = b[i];
        if (f.kind === 'kicker') {
          const h = this.kickerH(f, x, z);
          if (h > 0.001) {
            y += h;
            this.surf = 1;
            this.surfRef = f;
          }
        } else {
          const rx = x - f.ax, rz = z - f.az;
          const t = rx * f.dx + rz * f.dz;
          if (t < -f.ramp || t > f.len) continue;
          const lat = Math.abs(rx * f.dz - rz * f.dx);
          if (lat > f.w) continue;
          let top;
          if (t >= 0) top = Math.max(lerp(f.g0, f.g1, t / f.len) + f.h, g + 0.25);
          else top = g + (f.h * (t + f.ramp)) / f.ramp;
          if (top > y) {
            y = top;
            this.surf = 2;
            this.surfRef = f;
          }
        }
      }
      return y;
    }

    // ---------------------------------------------------------------- placement
    place() {
      const r = this.rnd;
      const R = (a, b) => a + r() * (b - a);
      const M = this.map;
      const HALF = C.HALF;
      this.features = [];
      this.trees = [];
      this.lamps = [];
      this.poles = [];
      this.flags = [];
      this.banners = [];
      this.colliders = [];
      this.liftTowers = [];
      this.pillars = [];
      this.icicles = [];

      const kicker = (z0, off, size) => {
        const k = KICK[size];
        const f = { kind: 'kicker', size, z0, off, ...k, len: k.Lu + k.Lt + k.Ll };
        this.features.push(f);
        const lipZ = z0 + k.Lu;
        for (const s of [-1, 1]) this.flags.push({ x: this.center(lipZ) + off + s * (k.w + 1.4), z: lipZ });
        return f;
      };
      const rail = (zStart, off, type, len) => {
        const isBox = type === 'box';
        const zMid = zStart + len / 2;
        const ang = Math.atan((this.center(zMid + 1) - this.center(zMid - 1)) / 2);
        const dx = Math.sin(ang), dz = Math.cos(ang);
        const ax = this.center(zStart) + off, az = zStart;
        const f = {
          kind: 'rail', type, ax, az, dx, dz, len, ang,
          w: isBox ? 0.42 : 0.34, h: isBox ? 0.55 : 0.8, ramp: isBox ? 2.6 : 0,
          z0: az - (isBox ? 2.6 : 0), z1: az + dz * len,
        };
        f.g0 = this.ground(ax, az);
        f.g1 = this.ground(ax + dx * len, az + dz * len);
        this.features.push(f);
        return f;
      };
      const scatter = (z0, L, count, minD, make) => {
        const pts = [];
        for (let tries = 0; tries < count * 10 && pts.length < count; tries++) {
          const z = R(z0 + 20, z0 + L - 20);
          const off = R(-HALF + 2, HALF - 2);
          if (pts.every((p) => (p.z - z) ** 2 + (p.off - off) ** 2 > minD * minD)) pts.push({ z, off });
        }
        for (const p of pts) make(this.center(p.z) + p.off, p.z);
      };
      this.gates = [];
      this.gateFlags = [];

      for (const zn of this.zones) {
        const z0 = zn.z0, L = zn.z1 - zn.z0;
        switch (zn.type) {
          case 'summit':
            kicker(150, R(-5, 5), 'S');
            break;
          case 'kickers': {
            const sizes = ['S', 'M', 'M', 'L'];
            const at = [40, 125, 210, 295];
            let side = r() < 0.5 ? -1 : 1;
            sizes.forEach((s, i) => { kicker(z0 + at[i], side * R(2, 7), s); side = -side; });
            break;
          }
          case 'trees':
            scatter(z0, L, M.trees.dense ? 60 : 40, M.trees.dense ? 6 : 7, (x, z) => this.trees.push({ x, z, s: R(0.8, 1.15), near: true, solid: true }));
            break;
          case 'slalom': {
            // rows of trees with one gap each, swinging side to side
            let gap = R(-4, 4);
            for (let z = z0 + 30; z < z0 + L - 25; z += 42) {
              gap = clamp(-gap * 0.5 + R(-3.5, 3.5), -HALF + 6, HALF - 6);
              const c = this.center(z);
              for (let off = -HALF + 0.8; off <= HALF; off += 2.6) {
                if (Math.abs(off - gap) < 5) continue;
                this.trees.push({ x: c + off, z: z + R(-0.4, 0.4), s: R(0.85, 1.05), near: true, solid: true });
              }
              this.gates.push({ x: c + gap, z });
              this.gateFlags.push({ x: c + gap - 4.2, z, side: -1 }, { x: c + gap + 4.2, z, side: 1 });
            }
            break;
          }
          case 'pillars':
            scatter(z0, L, 34, 7.5, (x, z) => this.pillars.push({ x, z, s: R(0.8, 1.3) }));
            break;
          case 'rails':
            for (const at of [30, 100, 170, 240, 310]) {
              const flip = r() < 0.5 ? -1 : 1;
              rail(z0 + at, flip * R(4, Math.min(7, HALF - 6)), 'box', R(12, 16));
              rail(z0 + at + R(-3, 3), -flip * R(4, Math.min(7, HALF - 6)), 'rail', R(12, 17));
            }
            kicker(z0 + 58, R(-3, 3), 'S');
            kicker(z0 + 268, R(-3, 3), 'S');
            break;
          case 'rollers':
            break;
          case 'bigair':
            kicker(z0 + 40, R(-6, 6), 'M');
            kicker(z0 + 140, R(-5, 5), 'L');
            kicker(z0 + 255, R(-4, 4), 'XL');
            break;
          case 'mega':
            kicker(z0 + 40, R(-6, 6), 'L');
            kicker(z0 + 150, R(-5, 5), 'XL');
            kicker(z0 + 270, R(-4, 4), 'XL');
            break;
          case 'jib':
            rail(z0 + 30, R(-6, 6), 'box', 14);
            kicker(z0 + 80, R(-6, 6), 'S');
            rail(z0 + 150, R(-6, 6), r() < 0.5 ? 'rail' : 'box', 15);
            kicker(z0 + 205, R(-5, 5), 'M');
            rail(z0 + 285, -Math.min(6, HALF - 5), 'box', 13);
            rail(z0 + 285, Math.min(6, HALF - 5), 'rail', 13);
            kicker(z0 + 330, R(-4, 4), 'S');
            break;
          default:
            break;
        }
      }

      // bucket the features every 10 m
      this.fb = [];
      for (const f of this.features) {
        const za = f.kind === 'kicker' ? f.z0 : Math.min(f.z0, f.z1) - 1;
        const zb = f.kind === 'kicker' ? f.z0 + f.len : Math.max(f.az, f.z1) + 1;
        for (let b = ((za - C.Z0) / 10) | 0; b <= ((zb - C.Z0) / 10) | 0; b++) (this.fb[b] = this.fb[b] || []).push(f);
      }

      // forest on both banks (none inside the cave)
      const T = M.trees;
      for (let z = C.Z0; z < C.ZMAX; z += R(2.6, 4) / (T.dense ? 1.35 : 1)) {
        if (this.cave && z > this.cave[0] - 15 && z < this.cave[1] + 15) continue;
        const c = this.center(z);
        for (const side of [-1, 1]) {
          if (r() < T.near) {
            const e = 2.6 + Math.pow(r(), 1.3) * 28;
            this.trees.push({ x: c + side * (HALF + e), z: z + R(-1, 1), s: R(0.8, 1.5), near: true, solid: e < 26 });
          }
          if (r() < T.far) {
            const e = 30 + r() * 62;
            this.trees.push({ x: c + side * (HALF + e), z: z + R(-1.5, 1.5), s: R(0.9, 1.7), near: false, solid: false });
          }
        }
      }
      // keep trees and pillars off the kickers and rails
      const clear = (t) => {
        const b = this.fb[((t.z - C.Z0) / 10) | 0];
        if (!b) return true;
        for (const f of b) {
          if (f.kind === 'kicker') {
            if (t.z > f.z0 - 6 && t.z < f.z0 + f.len + 4 && Math.abs(t.x - (this.center(t.z) + f.off)) < f.w + 4) return false;
          } else {
            const rx = t.x - f.ax, rz = t.z - f.az;
            const tt = rx * f.dx + rz * f.dz;
            if (tt > -f.ramp - 5 && tt < f.len + 5 && Math.abs(rx * f.dz - rz * f.dx) < 3.5) return false;
          }
        }
        return true;
      };
      this.trees = this.trees.filter(clear);
      this.pillars = this.pillars.filter(clear);
      this.treeBuckets = [];
      for (const t of this.trees) {
        const b = ((t.z - C.Z0) / 10) | 0;
        (this.treeBuckets[b] = this.treeBuckets[b] || []).push(t);
      }

      // floodlights (outside the cave), alternating sides
      if (M.lamps) {
        let side = 1;
        for (let z = 8; z < C.LENGTH + 120; z += M.lamps.every) {
          if (this.cave && z > this.cave[0] - 8 && z < this.cave[1] + 8) continue;
          const c = this.center(z);
          const x = c + side * (HALF + 3.2);
          const gy = this.ground(x, z);
          const hx = x - side * 1.9;
          this.lamps.push({ kind: 'lamp', x, z, gy, side, hx, hy: gy + 10.2, lx: hx, ly: gy + 9.8, lz: z, i: M.lamps.i, c: M.lamps.col });
          this.colliders.push({ x, z, r: 0.35, top: gy + 11 });
          side = -side;
        }
      }
      // crystals light up the cave
      if (this.cave) {
        let side = 1;
        for (let z = this.cave[0] + 6; z < this.cave[1] - 4; z += R(9, 13)) {
          const c = this.center(z);
          const off = side * (HALF + R(2.5, 5));
          const x = c + off;
          const gy = this.ground(x, z);
          const col = CRYSTAL_COLS[(r() * CRYSTAL_COLS.length) | 0];
          this.lamps.push({ kind: 'crystal', x, z, gy, side, hx: x, hy: gy + 1.6, lx: x - side * 1.5, ly: gy + 2.5, lz: z, i: 1.6, c: col, s: R(0.8, 1.4) });
          side = -side;
          if (r() < 0.5) {
            const o2 = -side * (HALF + R(1.5, 3));
            const x2 = c + o2;
            const g2 = this.ground(x2, z + 4);
            this.lamps.push({ kind: 'crystal', x: x2, z: z + 4, gy: g2, side: -side, hx: x2, hy: g2 + 1.0, lx: x2, ly: g2 + 1.6, lz: z + 4, i: 0.8, c: CRYSTAL_COLS[(r() * CRYSTAL_COLS.length) | 0], s: R(0.5, 0.8) });
          }
        }
        for (let z = this.cave[0] + 3; z < this.cave[1] - 3; z += R(1.8, 3.2)) this.icicles.push({ z, a: R(0.45, Math.PI - 0.45), len: R(1.2, 4.2), r: R(0.18, 0.45) });
        for (const p of this.pillars) this.colliders.push({ x: p.x, z: p.z, r: 0.75 * p.s, top: 1e4 });
      }
      this.lampBuckets = [];
      for (const l of this.lamps) (this.lampBuckets[((l.z - C.Z0) / 50) | 0] = this.lampBuckets[((l.z - C.Z0) / 50) | 0] || []).push(l);

      // piste marker poles or bright race banners
      for (let z = 4; z < C.LENGTH + 100; z += M.banners ? 32 : 26) {
        if (this.inCave(z)) continue;
        for (const s of [-1, 1]) {
          if (this.lamps.some((l) => l.kind === 'lamp' && l.side === s && Math.abs(l.z - z) < 4)) continue;
          if (M.banners) this.banners.push({ x: this.center(z) + s * (HALF + 1.4), z, i: (z / 32 + (s > 0 ? 1 : 0)) | 0 });
          else this.poles.push({ x: this.center(z) + s * (HALF + 0.9), z });
        }
      }

      // chairlift up one bank (not over the cave)
      const ls = r() < 0.5 ? -1 : 1;
      this.liftSide = ls;
      for (let z = C.Z0 + 20; z < C.ZMAX; z += 65) {
        if (this.cave && z > this.cave[0] - 60 && z < this.cave[1] + 60) continue;
        const x = this.center(z) + ls * (HALF + 30);
        this.liftTowers.push({ x, z, gy: this.ground(x, z) });
      }

      for (const t of this.trees) if (t.solid) this.colliders.push({ x: t.x, z: t.z, r: 0.5 * t.s, top: this.ground(t.x, t.z) + 7 * t.s });
      for (const s of [-1, 1]) this.colliders.push({ x: this.center(C.LENGTH) + s * (HALF + 0.6), z: C.LENGTH, r: 0.8, top: 1e4 });

      // safety nets along the fast sections
      this.nets = [];
      if (M.nets) {
        for (const zn of this.zones) {
          if (!['kickers', 'bigair', 'mega', 'rollers', 'finish'].includes(zn.type)) continue;
          for (let z = Math.max(zn.z0, 10); z < Math.min(zn.z1, C.LENGTH + 40); z += 6) {
            for (const sd of [-1, 1]) if (r() < 0.92) this.nets.push({ z0: z, z1: z + 6, side: sd });
          }
        }
      }
      this.huts = [
        { x: this.center(-14) - (HALF + 7), z: -14, yaw: 0.25, sign: 'start' },
        { x: this.center(C.LENGTH + 55) + (HALF + 9), z: C.LENGTH + 55, yaw: -0.3, sign: 'lodge' },
      ];
      for (const h of this.huts) this.colliders.push({ x: h.x, z: h.z, r: 3.2, top: 1e4 });

      this.placeTokens(R);

      this.cb = [];
      for (const col of this.colliders) {
        const b = ((col.z - C.Z0) / 10) | 0;
        (this.cb[b] = this.cb[b] || []).push(col);
      }
    }

    // glowing snowflake tokens: along kicker arcs, over boxes and rails, through gates and in slalom lines
    placeTokens(R) {
      const tok = [];
      const add = (x, y, z) => tok.push({ x, y, z, id: tok.length });
      const G = 14, v = 23;
      for (const f of this.features) {
        if (f.kind === 'kicker') {
          const zl = f.z0 + f.Lu;
          const xl = this.center(zl) + f.off;
          const yl = this.Hk(xl, zl);
          const s = (this.Hk(xl, zl - 0.25) - this.Hk(xl, zl - 0.75)) / 0.5;
          const vy = v * s;
          for (const t of [0.35, 0.65, 0.95, 1.25]) {
            const z = zl + v * t;
            const y = yl + vy * t - 0.5 * G * t * t + 1.0;
            if (y < this.Hk(xl, z) + 1.4) break;
            add(xl, y, z);
          }
        } else {
          for (const k of [0.25, 0.5, 0.75]) {
            const x = f.ax + f.dx * f.len * k, z = f.az + f.dz * f.len * k;
            add(x, lerp(f.g0, f.g1, k) + f.h + 1.0, z);
          }
        }
      }
      for (const g of this.gates) add(g.x, this.ground(g.x, g.z) + 1.0, g.z);
      for (const zn of this.zones) {
        if (!['summit', 'rollers', 'trees', 'finish', 'pillars'].includes(zn.type)) continue;
        for (let z0 = Math.max(zn.z0, 40) + R(10, 40); z0 < Math.min(zn.z1, C.LENGTH - 30) - 50; z0 += R(80, 120)) {
          const off = R(-C.HALF + 5, C.HALF - 5), amp = R(2, 5), ph = R(0, Math.PI * 2);
          for (let i = 0; i < 6; i++) {
            const z = z0 + i * 8;
            const x = this.center(z) + clamp(off + amp * Math.sin(i * 0.8 + ph), -C.HALF + 2, C.HALF - 2);
            if (this.colliders.some((t) => Math.abs(t.z - z) < 2.5 && Math.abs(t.x - x) < 2.5)) continue;
            add(x, this.ground(x, z) + 1.0, z);
          }
        }
      }
      this.tokens = tok;
      this.tokenBuckets = [];
      for (const t of tok) {
        const b = ((t.z - C.Z0) / 10) | 0;
        (this.tokenBuckets[b] = this.tokenBuckets[b] || []).push(t);
      }
    }

    // colliders near (x, z): returns the first one the rider overlaps, or null
    hit(x, y, z, radius) {
      const b0 = ((z - C.Z0) / 10) | 0;
      for (let b = b0 - 1; b <= b0 + 1; b++) {
        const list = this.cb[b];
        if (!list) continue;
        for (const c of list) {
          const dx = x - c.x, dz = z - c.z, rr = c.r + radius;
          if (dx * dx + dz * dz < rr * rr && y < c.top) return c;
        }
      }
      return null;
    }

    // the 4 lights nearest a point (for lighting the riders)
    nearLamps(x, z, out) {
      out.length = 0;
      const b0 = ((z - C.Z0) / 50) | 0;
      for (let b = b0 - 1; b <= b0 + 1; b++) {
        const list = this.lampBuckets[b];
        if (!list) continue;
        for (const l of list) {
          const d = (l.lx - x) ** 2 + (l.lz - z) ** 2;
          if (out.length < 4) out.push({ l, d });
          else {
            let worst = 0;
            for (let i = 1; i < 4; i++) if (out[i].d > out[worst].d) worst = i;
            if (d < out[worst].d) out[worst] = { l, d };
          }
        }
      }
      for (let i = 0; i < out.length; i++) {
        const l = out[i].l;
        out[i] = { x: l.lx, y: l.ly, z: l.lz, i: l.i, c: l.c };
      }
      return out;
    }

    // light environment at a point along the course (for riders, fog and sky)
    env(z) {
      const L = this.L, k = this.caveK(z);
      if (!k) return { sky: L.sky, ground: L.ground, sun: L.sun, sunDir: L.sunDir, fog: L.fog, rim: L.rim, k: 0 };
      return {
        sky: mix3(L.sky, L.caveSky, k), ground: mix3(L.ground, L.caveGround, k), sun: mix3(L.sun, [0, 0, 0], k), sunDir: L.sunDir,
        fog: mix3(L.fog, L.caveFog, k), rim: mix3(L.rim, L.caveRim, k), k,
      };
    }

    // ---------------------------------------------------------------- baked lighting
    treeShadow(x, z) {
      const sd = this.L.sunDir;
      const elev = Math.max(0.15, sd[1]);
      const hl = Math.hypot(sd[0], sd[2]) || 1;
      const ux = -sd[0] / hl, uz = -sd[2] / hl;
      let s = 1;
      const b0 = ((z - C.Z0) / 10) | 0;
      for (let b = b0 - 2; b <= b0 + 2; b++) {
        const list = this.treeBuckets[b];
        if (!list) continue;
        for (const t of list) {
          const len = (3.2 * t.s * Math.sqrt(1 - elev * elev)) / elev;
          const cx = t.x + ux * len, cz = t.z + uz * len;
          const dx = x - cx, dz = z - cz;
          const along = dx * ux + dz * uz, across = dx * -uz + dz * ux;
          const rr = 1.5 * t.s;
          const d = Math.hypot(across / rr, along / (len + rr * 0.6));
          if (d < 1) s = Math.min(s, 1 - 0.5 * smooth(1 - d));
        }
      }
      return s;
    }

    light(nx, ny, nz, x, y, z, out, shadow) {
      const L = this.L;
      const k = this.cave ? this.caveK(z) : 0;
      const h = ny * 0.5 + 0.5;
      const sd = L.sunDir;
      const m = Math.max(0, nx * sd[0] + ny * sd[1] + nz * sd[2]) * (shadow === undefined ? 1 : shadow);
      const sky = k ? mix3(L.sky, L.caveSky, k) : L.sky, gnd = k ? mix3(L.ground, L.caveGround, k) : L.ground;
      const sun = 1 - k;
      let r = lerp(gnd[0], sky[0], h) + L.sun[0] * m * sun;
      let g = lerp(gnd[1], sky[1], h) + L.sun[1] * m * sun;
      let b = lerp(gnd[2], sky[2], h) + L.sun[2] * m * sun;
      const b0 = ((z - C.Z0) / 50) | 0;
      for (let q = b0 - 1; q <= b0 + 1; q++) {
        const list = this.lampBuckets[q];
        if (!list) continue;
        for (const l of list) {
          const dx = l.lx - x, dy = l.ly - y, dz = l.lz - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 4900) continue;
          const d = Math.sqrt(d2);
          const ndl = (nx * dx + ny * dy + nz * dz) / d;
          if (ndl <= 0) continue;
          const i = (l.i * ndl) / (1 + d2 * (l.kind === 'crystal' ? 0.012 : 0.0035));
          r += i * l.c[0]; g += i * l.c[1]; b += i * l.c[2];
        }
      }
      out[0] = r; out[1] = g; out[2] = b;
      return out;
    }

    // ---------------------------------------------------------------- meshes
    ensureChunks(engine, z, budget) {
      const n = Math.ceil((C.ZMAX - C.Z0) / C.CHUNK);
      if (!this.chunks.length) {
        for (let i = 0; i < n; i++) this.chunks.push({ i, z0: C.Z0 + i * C.CHUNK, z1: C.Z0 + (i + 1) * C.CHUNK, minZ: 0, maxZ: 0, tri: null, lines: null });
        this.assignObjects();
      }
      let done = 0;
      const ci = clamp(Math.floor((z - C.Z0) / C.CHUNK), 0, n - 1);
      for (let k = 0; k < n && done < budget; k++) {
        const c = this.chunks[ci + k] || null;
        if (c && !c.tri && c.z0 < z + C.DRAW + 60) { this.buildChunk(engine, c); done++; }
      }
      for (let k = 1; k < 3 && done < budget; k++) {
        const c = this.chunks[ci - k];
        if (c && !c.tri) { this.buildChunk(engine, c); done++; }
      }
      if (done < budget) {
        for (const c of this.chunks) {
          if (!c.tri) { this.buildChunk(engine, c); if (++done >= budget) break; }
        }
      }
      return done;
    }

    allBuilt() { return this.chunks.length && this.chunks.every((c) => c.tri); }

    assignObjects() {
      const idx = (z) => clamp(Math.floor((z - C.Z0) / C.CHUNK), 0, this.chunks.length - 1);
      for (const c of this.chunks) c.objs = [];
      const add = (z, o) => this.chunks[idx(z)].objs.push(o);
      for (const t of this.trees) add(t.z, { k: 'tree', o: t });
      for (const f of this.features) add(f.kind === 'kicker' ? f.z0 : f.az, { k: f.kind, o: f });
      for (const l of this.lamps) add(l.z, { k: l.kind, o: l });
      for (const p of this.poles) add(p.z, { k: 'pole', o: p });
      for (const b of this.banners) add(b.z, { k: 'banner', o: b });
      for (const f of this.flags) add(f.z, { k: 'flag', o: f });
      for (const f of this.gateFlags) add(f.z, { k: 'gate', o: f });
      for (const p of this.pillars) add(p.z, { k: 'pillar', o: p });
      for (const ic of this.icicles) add(ic.z, { k: 'icicle', o: ic });
      this.liftTowers.forEach((t, i) => add(t.z, { k: 'tower', o: t, next: this.liftTowers[i + 1] && this.liftTowers[i + 1].z - t.z < 70 ? this.liftTowers[i + 1] : null }));
      for (const n of this.nets) add(n.z0, { k: 'net', o: n });
      for (const h of this.huts) add(h.z, { k: 'hut', o: h });
      if (this.cave) {
        add(this.cave[0], { k: 'mouth', o: { z: this.cave[0], dir: -1 } });
        add(this.cave[1], { k: 'mouth', o: { z: this.cave[1], dir: 1 } });
      }
      add(C.LENGTH, { k: 'finish' });
      add(-3, { k: 'start' });
    }

    buildChunk(engine, ch) {
      const tri = new SS.FBuf(1 << 16), lines = new SS.FBuf(1024);
      const B = new Builder(this, tri, lines);
      ch.minZ = ch.z0;
      ch.maxZ = ch.z1;
      B.terrain(ch.z0, ch.z1);
      if (this.cave && ch.z1 > this.cave[0] && ch.z0 < this.cave[1]) B.ceiling(Math.max(ch.z0, this.cave[0]), Math.min(ch.z1, this.cave[1]));
      for (const it of ch.objs) {
        const o = it.o;
        switch (it.k) {
          case 'tree': B.tree(o); break;
          case 'kicker': B.kicker(o); ch.maxZ = Math.max(ch.maxZ, o.z0 + o.len); break;
          case 'rail': B.rail(o); ch.maxZ = Math.max(ch.maxZ, o.z1 + 1); ch.minZ = Math.min(ch.minZ, o.z0 - 1); break;
          case 'lamp': B.lamp(o); break;
          case 'crystal': B.crystal(o); break;
          case 'pole': B.pole(o); break;
          case 'banner': B.banner(o); break;
          case 'flag': B.flag(o); break;
          case 'gate': B.gateFlag(o); break;
          case 'pillar': B.pillar(o); break;
          case 'icicle': B.icicle(o); break;
          case 'tower': B.tower(o, it.next); if (it.next) ch.maxZ = Math.max(ch.maxZ, it.next.z); break;
          case 'net': B.net(o); break;
          case 'hut': B.hut(o); break;
          case 'mouth': B.mouth(o); break;
          case 'finish': B.arch(C.LENGTH, true); B.finishFlags(); break;
          case 'start': B.arch(-3, false); break;
        }
      }
      ch.minZ -= 12;
      ch.maxZ += 12;
      ch.tri = engine.mesh(tri.data(), 6);
      ch.lines = lines.n ? engine.mesh(lines.data(), 6, engine.gl.LINES) : null;
    }

    draw(engine, camZ) {
      const lo = camZ - 30, hi = camZ + C.DRAW;
      for (const c of this.chunks) {
        if (!c.tri || c.maxZ < lo || c.minZ > hi) continue;
        engine.drawBaked(c.tri);
        if (c.lines) engine.drawBaked(c.lines);
      }
    }

    dispose(engine) {
      for (const c of this.chunks) {
        engine.free(c.tri);
        engine.free(c.lines);
      }
      engine.free(this.glowMesh);
      engine.free(this.mtnMesh);
      this.chunks = [];
    }

    // lamp and crystal glows as a static point mesh: [x,y,z, r,g,b,a, size]
    glows(engine) {
      if (this.glowMesh) return this.glowMesh;
      const d = [];
      for (const l of this.lamps) {
        if (l.kind === 'crystal') {
          d.push(l.hx, l.hy, l.z, l.c[0], l.c[1], l.c[2], 0.5, 2.2 * l.s);
          d.push(l.hx, l.hy, l.z, l.c[0], l.c[1], l.c[2], 0.12, 12 * l.s);
        } else {
          d.push(l.hx, l.hy - 0.15, l.z, 1.0, 0.93, 0.78, 0.9 * (l.i / 1.8), 1.6);
          d.push(l.hx, l.hy - 0.3, l.z, 1.0, 0.88, 0.66, 0.16 * (l.i / 1.8), 11);
        }
      }
      if (this.map.lamps) {
        for (const h of this.huts) {
          const gy = this.ground(h.x, h.z);
          d.push(h.x, gy + 2, h.z, 1.0, 0.65, 0.3, 0.22, 14);
        }
      }
      if (this.cave) {
        // daylight pouring in through the cave exit
        const z = this.cave[1] + 6, c = this.center(z), y = this.base(z) + 9;
        d.push(c, y, z, 0.75, 0.85, 1.0, 0.55, 46);
        d.push(c, y - 2, z, 0.9, 0.95, 1.0, 0.35, 20);
      }
      const fc = this.center(C.LENGTH);
      for (let i = -3; i <= 3; i++) d.push(fc + i * 5.5, this.ground(fc, C.LENGTH) + 8.2, C.LENGTH, 1.0, 0.6, 0.3, 0.35, 3.5);
      this.glowCount = d.length / 8;
      this.glowMesh = engine.mesh(new Float32Array(d), 8, engine.gl.POINTS);
      return this.glowMesh;
    }

    // distant peaks coloured for this map
    mountains(engine) {
      if (this.mtnMesh) return this.mtnMesh;
      const P = this.map.mtn, sd = this.map.sky.dir;
      const mtn = new SS.FBuf(1 << 14);
      const lightFn = { light: (nx, ny, nz, x, y, z, out) => { const k = P.k[0] + Math.max(0, nx * sd[0] + ny * sd[1] + nz * sd[2]) * P.k[1]; out[0] = k; out[1] = k; out[2] = k; return out; } };
      const B = new Builder(lightFn, mtn, new SS.FBuf(8));
      const r = mulberry32(99);
      const peaks = 70;
      for (let i = 0; i < peaks; i++) {
        const a = (i / peaks) * TAU + r() * 0.05;
        const dist = 1050 + r() * 250;
        const h = 140 + r() * 260;
        const wdt = 120 + r() * 150;
        const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
        const tx = -Math.sin(a), tz = Math.cos(a);
        const apex = [cx + tx * (r() - 0.5) * 60, h, cz + tz * (r() - 0.5) * 60];
        const l = [cx - tx * wdt, -240, cz - tz * wdt], rr = [cx + tx * wdt, -240, cz + tz * wdt];
        const back = [cx * 1.08, -140, cz * 1.08];
        B.tri(l[0], l[1], l[2], rr[0], rr[1], rr[2], apex[0], apex[1], apex[2], P.dark, back[0], back[1], back[2]);
        const k = 0.3;
        const sl = [lerp(apex[0], l[0], k), lerp(apex[1], l[1], k), lerp(apex[2], l[2], k)];
        const sr = [lerp(apex[0], rr[0], k), lerp(apex[1], rr[1], k), lerp(apex[2], rr[2], k)];
        const tw = [-cx * 0.01, 0, -cz * 0.01];
        B.tri(sl[0] + tw[0], sl[1], sl[2] + tw[2], sr[0] + tw[0], sr[1], sr[2] + tw[2], apex[0] + tw[0], apex[1] + 0.5, apex[2] + tw[2], P.cap, back[0], back[1], back[2]);
      }
      this.mtnMesh = engine.mesh(mtn.data(), 6);
      return this.mtnMesh;
    }

    // minimap: the run drawn top-to-bottom
    drawMinimap(canvas) {
      const g = canvas.getContext('2d');
      const W = canvas.width, Hh = canvas.height;
      g.clearRect(0, 0, W, Hh);
      let lo = Infinity, hi = -Infinity;
      for (let z = 0; z <= C.LENGTH; z += 20) {
        const c = this.center(z);
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
      }
      const span = Math.max(60, hi - lo);
      this.map2d = { lo, span, W, H: Hh, pad: 8 };
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const path = (z0, z1) => {
        g.beginPath();
        for (let z = z0; z <= z1; z += 20) {
          const p = this.mapPos(this.center(z), z);
          if (z === z0) g.moveTo(p[0], p[1]);
          else g.lineTo(p[0], p[1]);
        }
      };
      g.strokeStyle = 'rgba(160,220,255,0.35)';
      g.lineWidth = 5;
      path(0, C.LENGTH);
      g.stroke();
      g.strokeStyle = 'rgba(220,245,255,0.85)';
      g.lineWidth = 1.5;
      g.setLineDash([2, 3]);
      g.stroke();
      g.setLineDash([]);
      if (this.cave) {
        g.strokeStyle = 'rgba(150,110,255,0.8)';
        g.lineWidth = 6;
        path(this.cave[0], this.cave[1]);
        g.stroke();
      }
    }

    mapPos(x, z) {
      const m = this.map2d;
      return [m.pad + ((x - m.lo) / m.span) * (m.W - m.pad * 2), m.pad + (clamp(z, 0, C.LENGTH) / C.LENGTH) * (m.H - m.pad * 2)];
    }
  }

  // ------------------------------------------------------------------ geometry builder with baked light
  const L3 = [0, 0, 0];
  class Builder {
    constructor(world, tri, lines) {
      this.w = world;
      this.t = tri;
      this.l = lines;
    }

    // flat-shaded triangle; (ox,oy,oz) is a point inside the object so normals face outward.
    // hint (optional) is an outward direction to use instead (more reliable for long boxes).
    tri(ax, ay, az, bx, by, bz, cx, cy, cz, col, ox, oy, oz, emissive, hint) {
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
      if (hint) {
        if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      } else if (ox !== undefined && nx * (mx - ox) + ny * (my - oy) + nz * (mz - oz) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      let r, g, b;
      if (emissive) {
        const e = emissive === true ? 1 : emissive;
        if (e >= 1) { r = col[0]; g = col[1]; b = col[2]; }
        else {
          this.w.light(nx, ny, nz, mx, my, mz, L3);
          r = col[0] * (L3[0] + e); g = col[1] * (L3[1] + e); b = col[2] * (L3[2] + e);
        }
      } else {
        this.w.light(nx, ny, nz, mx, my, mz, L3);
        r = col[0] * L3[0]; g = col[1] * L3[1]; b = col[2] * L3[2];
      }
      const t = this.t;
      t.v(ax, ay, az, r, g, b);
      t.v(bx, by, bz, r, g, b);
      t.v(cx, cy, cz, r, g, b);
    }

    quad(p0, p1, p2, p3, col, o, em) {
      const h = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4 - o[0], (p0[1] + p1[1] + p2[1] + p3[1]) / 4 - o[1], (p0[2] + p1[2] + p2[2] + p3[2]) / 4 - o[2]];
      this.tri(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], col, o[0], o[1], o[2], em, h);
      this.tri(p0[0], p0[1], p0[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], col, o[0], o[1], o[2], em, h);
    }

    box(cx, cy, cz, hx, hy, hz, yaw, col, em) {
      const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0);
      const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
      const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
      const o = [cx, cy, cz];
      const f = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
      for (const q of f) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], col, o, em);
    }

    beam(x0, y0, z0, x1, y1, z1, w, h, col) {
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz) || 1;
      const sx = (-dz / len) * w, sz = (dx / len) * w;
      const v = [
        [x0 - sx, y0 - h, z0 - sz], [x0 + sx, y0 - h, z0 + sz], [x0 + sx, y0 + h, z0 + sz], [x0 - sx, y0 + h, z0 - sz],
        [x1 - sx, y1 - h, z1 - sz], [x1 + sx, y1 - h, z1 + sz], [x1 + sx, y1 + h, z1 + sz], [x1 - sx, y1 + h, z1 - sz],
      ];
      const o = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      const f = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
      for (const q of f) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], col, o);
    }

    cyl(x, y0, z, r0, r1, h, sides, col, cap, em) {
      const o = [x, y0 + h * 0.4, z];
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * TAU, a1 = ((i + 1) / sides) * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const b0 = [x + c0 * r0, y0, z + s0 * r0], b1 = [x + c1 * r0, y0, z + s1 * r0];
        if (r1 <= 0.001) {
          this.tri(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], x, y0 + h, z, col, o[0], o[1], o[2], em);
        } else {
          const t0 = [x + c0 * r1, y0 + h, z + s0 * r1], t1 = [x + c1 * r1, y0 + h, z + s1 * r1];
          this.quad(b0, b1, t1, t0, col, o, em);
          if (cap) this.tri(t0[0], t0[1], t0[2], t1[0], t1[1], t1[2], x, y0 + h, z, col, x, y0, z, em);
        }
      }
    }

    line(x0, y0, z0, x1, y1, z1, col) {
      this.l.v(x0, y0, z0, col[0], col[1], col[2]);
      this.l.v(x1, y1, z1, col[0], col[1], col[2]);
    }

    // ---- terrain strip ----
    terrain(z0, z1) {
      const w = this.w;
      const M = w.map, LT = w.L;
      const offs = Builder.offs();
      const nc = offs.length;
      const rows = [];
      for (let z = z0; z <= z1 + 0.001; z += 2) rows.push(z);
      const nr = rows.length;
      const P = new Float32Array(nr * nc * 6);
      for (let i = 0; i < nr; i++) {
        const z = rows[i];
        const c = w.center(z);
        const ck = w.cave ? w.caveK(z) : 0;
        for (let j = 0; j < nc; j++) {
          const off = offs[j];
          const x = c + off;
          const y = w.ground(x, z);
          const e = 0.8;
          const gx = (w.ground(x + e, z) - w.ground(x - e, z)) / (2 * e);
          const gz = (w.ground(x, z + e) - w.ground(x, z - e)) / (2 * e);
          let nx = -gx, ny = 1, nz = -gz;
          const l = Math.hypot(nx, ny, nz);
          nx /= l; ny /= l; nz /= l;
          w.light(nx, ny, nz, x, y, z, L3, M.shadows ? w.treeShadow(x, z) : 1);
          const ao = Math.abs(off);
          let ar, ag, ab;
          if (ao < C.HALF) { ar = LT.snow[0]; ag = LT.snow[1]; ab = LT.snow[2]; }
          else { const k = Math.min(1, (ao - C.HALF) / 4); ar = lerp(LT.snow[0], LT.powder[0], k); ag = lerp(LT.snow[1], LT.powder[1], k); ab = lerp(LT.snow[2], LT.powder[2], k); }
          if (ck > 0) {
            // icy floor and rocky walls inside the cave
            const ice = [0.78, 0.9, 1.0];
            ar = lerp(ar, ice[0], ck * 0.7); ag = lerp(ag, ice[1], ck * 0.7); ab = lerp(ab, ice[2], ck * 0.7);
          }
          const steep = Math.hypot(gx, gz);
          const rockAt = ck > 0.5 ? 0.6 : 0.95;
          if (steep > rockAt) {
            const kk = Math.min(0.8, (steep - rockAt) * 1.4);
            const rock = ck > 0.5 ? [0.22, 0.24, 0.32] : [0.3, 0.32, 0.38];
            ar = lerp(ar, rock[0], kk); ag = lerp(ag, rock[1], kk); ab = lerp(ab, rock[2], kk);
          }
          const v = 0.97 + hash(x * 0.37, z * 0.29) * 0.05;
          const k6 = (i * nc + j) * 6;
          P[k6] = x; P[k6 + 1] = y; P[k6 + 2] = z;
          P[k6 + 3] = ar * L3[0] * v; P[k6 + 4] = ag * L3[1] * v; P[k6 + 5] = ab * L3[2] * v;
        }
      }
      const t = this.t;
      const put = (k) => { const q = k * 6; t.v(P[q], P[q + 1], P[q + 2], P[q + 3], P[q + 4], P[q + 5]); };
      for (let i = 0; i < nr - 1; i++) {
        for (let j = 0; j < nc - 1; j++) {
          const a = i * nc + j, b = a + 1, c2 = a + nc, d = c2 + 1;
          put(a); put(b); put(d);
          put(a); put(d); put(c2);
        }
      }
    }

    // the cave roof: a rocky, icy vault over the piste
    ceilingPoint(z, a) {
      const w = this.w;
      const c = w.center(z);
      const base = w.base(z);
      const RW = C.HALF + 9, RH = 15, WALL = 7;
      const n = 1.6 * Math.sin(z * 0.13 + a * 5) + 1.0 * Math.sin(z * 0.31 - a * 9) + 0.6 * Math.sin(z * 0.7 + a * 17);
      const rw = RW + n * 0.6, rh = RH + n;
      return [c + Math.cos(a) * rw, base + WALL + Math.sin(a) * rh, z];
    }

    ceiling(z0, z1) {
      const w = this.w;
      const N = 16;
      const rows = [];
      for (let z = z0; z <= z1 + 0.001; z += 2) rows.push(z);
      const pts = rows.map((z) => {
        const row = [];
        for (let j = 0; j <= N; j++) row.push(this.ceilingPoint(z, (j / N) * Math.PI));
        return row;
      });
      const rock = [0.24, 0.26, 0.34], ice = [0.62, 0.78, 0.95];
      for (let i = 0; i < rows.length - 1; i++) {
        const z = rows[i];
        const axis = [w.center(z), w.base(z) + 6, z];
        for (let j = 0; j < N; j++) {
          const a = pts[i][j], b = pts[i][j + 1], c = pts[i + 1][j + 1], d = pts[i + 1][j];
          const iceK = hash(j * 1.7, Math.floor(z / 4)) > 0.55 ? 0.7 : 0.15;
          const col = [lerp(rock[0], ice[0], iceK), lerp(rock[1], ice[1], iceK), lerp(rock[2], ice[2], iceK)];
          const inward = [axis[0] - (a[0] + c[0]) / 2, axis[1] - (a[1] + c[1]) / 2, 0];
          this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], col, 0, 0, 0, 0.04, inward);
          this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], col, 0, 0, 0, 0.04, inward);
        }
      }
    }

    icicle(ic) {
      const p = this.ceilingPoint(ic.z, ic.a);
      const w = this.w;
      const axis = [w.center(ic.z), w.base(ic.z) + 6];
      // pull it slightly inward so it hangs from the roof surface
      const x = lerp(p[0], axis[0], 0.04), y = lerp(p[1], axis[1], 0.04) + 0.2;
      this.cyl(x, y, ic.z, ic.r, 0.0, -ic.len, 5, [0.7, 0.88, 1.0], false, 0.35);
    }

    mouth(m) {
      // the rocky face around the cave entrance (dir -1) or exit (dir 1)
      const w = this.w;
      const N = 18, z = m.z;
      const c = w.center(z), base = w.base(z);
      const out = -m.dir; // the side the face looks toward
      const rings = [0, 0.18, 0.45, 1];
      const P = [];
      for (let i = 0; i < rings.length; i++) {
        const row = [];
        for (let j = 0; j <= N; j++) {
          const a = (j / N) * Math.PI;
          const inner = this.ceilingPoint(z, a);
          const o = [c + Math.cos(a) * (C.HALF + 70), base + 7 + Math.sin(a) * 58, z];
          const f = rings[i];
          const h = hash(i * 3.1 + j * 1.7, z);
          const jit = i === 0 || i === rings.length - 1 ? 0 : (h - 0.5) * 6;
          const bulge = i === 0 ? 0 : i === rings.length - 1 ? 0 : (1.5 + h * 3.5) * out;
          row.push([lerp(inner[0], o[0], f) + Math.cos(a) * jit, lerp(inner[1], o[1], f) + Math.sin(a) * jit, z + bulge]);
        }
        P.push(row);
      }
      const rock = [0.27, 0.29, 0.37], ice = [0.55, 0.72, 0.92], snowc = [0.9, 0.93, 1.0];
      for (let i = 0; i < rings.length - 1; i++) {
        for (let j = 0; j < N; j++) {
          const a = ((j + 0.5) / N) * Math.PI;
          const h = hash(j * 2.3 + i, z * 0.7);
          let col;
          if (i === 0) col = ice;
          else if (i === rings.length - 2 && Math.sin(a) > 0.55 && h > 0.35) col = snowc;
          else { const k = 0.82 + h * 0.36; col = [rock[0] * k, rock[1] * k, rock[2] * k]; }
          const behind = [(P[i][j][0] + P[i + 1][j + 1][0]) / 2, (P[i][j][1] + P[i + 1][j + 1][1]) / 2, z - out * 6];
          this.quad(P[i][j], P[i][j + 1], P[i + 1][j + 1], P[i + 1][j], col, behind);
        }
      }
      // side walls down into the ground
      for (const sd of [-1, 1]) {
        const a = sd > 0 ? 0 : Math.PI;
        const ip = this.ceilingPoint(z, a);
        const op = [c + sd * (C.HALF + 70), base + 7, z];
        const g0 = [ip[0], w.ground(ip[0], z) - 2, z], g1 = [op[0], w.ground(op[0], z) - 2, z];
        this.quad(g0, ip, op, g1, rock, [ip[0], ip[1], z - out]);
      }
    }

    crystal(l) {
      const w = this.w;
      const r = mulberry32(Math.floor(l.z * 13 + l.x * 7));
      const n = 3 + Math.floor(r() * 3);
      const col = l.c;
      for (let i = 0; i < n; i++) {
        const ox = (r() - 0.5) * 1.6 * l.s, oz = (r() - 0.5) * 1.6 * l.s;
        const h = (1.2 + r() * 2.2) * l.s, rad = (0.18 + r() * 0.22) * l.s;
        const x = l.x + ox, z = l.z + oz;
        const gy = w.ground(x, z) - 0.2;
        this.cyl(x, gy, z, rad, rad * 0.8, h * 0.75, 6, col, false, 1);
        this.cyl(x, gy + h * 0.75, z, rad * 0.8, 0, h * 0.35, 6, [Math.min(1.4, col[0] * 1.3), Math.min(1.4, col[1] * 1.3), Math.min(1.4, col[2] * 1.3)], false, 1);
      }
    }

    pillar(p) {
      const w = this.w;
      const gy = w.ground(p.x, p.z) - 0.3;
      const s = p.s;
      const ice = [0.55, 0.75, 0.95];
      this.cyl(p.x, gy, p.z, 1.0 * s, 0.75 * s, 2.0 * s, 7, ice, false, 0.25);
      this.cyl(p.x, gy + 2.0 * s, p.z, 0.75 * s, 0.45 * s, 2.5 * s, 7, ice, false, 0.25);
      this.cyl(p.x, gy + 4.5 * s, p.z, 0.45 * s, 0.0, 2.6 * s, 7, [0.75, 0.9, 1.0], false, 0.35);
      // matching stalactite above
      const top = this.ceilingPoint(p.z, Math.PI / 2 + (p.x - w.center(p.z)) / (C.HALF + 9) * -1.2);
      this.cyl(p.x, top[1] - 0.3, p.z, 0.7 * s, 0.0, -3.5 * s, 6, [0.6, 0.78, 0.95], false, 0.25);
    }

    tree(t) {
      const w = this.w;
      const T = w.map.trees;
      const s = t.s;
      const y = w.ground(t.x, t.z) - 0.25;
      const h1 = hash(t.x, t.z);
      const green = [T.green[0] + h1 * 0.03, T.green[1] + h1 * 0.05, T.green[2] + h1 * 0.03];
      const sn = T.snow;
      const snow = [lerp(0.6, 0.82, Math.min(1, sn)), lerp(0.66, 0.87, Math.min(1, sn)), lerp(0.75, 0.96, Math.min(1, sn))];
      this.cyl(t.x, y, t.z, 0.2 * s, 0.14 * s, 1.5 * s, 5, [0.2, 0.13, 0.08]);
      const tiers = t.near ? 4 : 3;
      const sides = t.near ? 7 : 6;
      for (let i = 0; i < tiers; i++) {
        const rb = (1.8 - i * (t.near ? 0.36 : 0.48)) * s;
        const y0 = y + (1.1 + i * (t.near ? 1.15 : 1.5)) * s;
        const hh = (2.4 - i * 0.25) * s;
        if (t.near) {
          const band = 0.38 * Math.min(1.4, sn);
          this.cyl(t.x, y0 - 0.05 * s, t.z, rb, rb * 0.8, band * s, sides, snow);
          this.cyl(t.x, y0 + (band - 0.05) * s, t.z, rb * 0.8, 0, hh - (band - 0.05) * s, sides, green);
        } else {
          this.cyl(t.x, y0, t.z, rb, 0, hh, sides, green);
        }
      }
      if (t.near) {
        const top = y + (1.1 + (tiers - 1) * 1.15) * s + (2.4 - (tiers - 1) * 0.25) * s;
        this.cyl(t.x, top - 0.7 * s, t.z, 0.32 * s, 0, 0.7 * s, sides, snow);
      }
    }

    kicker(f) {
      const w = this.w;
      const span = f.w + 2.5;
      const nu = Math.ceil(f.len / 0.7), nv = Math.ceil((span * 2) / 0.55);
      const grid = [];
      const sn = w.L.snow;
      for (let i = 0; i <= nu; i++) {
        const z = f.z0 + (i / nu) * f.len;
        const c = w.center(z) + f.off;
        const row = [];
        for (let j = 0; j <= nv; j++) {
          const x = c - span + (j / nv) * span * 2;
          const k = w.kickerH(f, x, z);
          const y = w.ground(x, z) + k + 0.03;
          const e = 0.3;
          const gx = (w.ground(x + e, z) + w.kickerH(f, x + e, z) - w.ground(x - e, z) - w.kickerH(f, x - e, z)) / (2 * e);
          const gz = (w.ground(x, z + e) + w.kickerH(f, x, z + e) - w.ground(x, z - e) - w.kickerH(f, x, z - e)) / (2 * e);
          const l = Math.hypot(gx, 1, gz);
          w.light(-gx / l, 1 / l, -gz / l, x, y, z, L3, w.map.shadows ? w.treeShadow(x, z) : 1);
          row.push([x, y, z, sn[0] * 1.03 * L3[0], sn[1] * 1.02 * L3[1], sn[2] * L3[2], k]);
        }
        grid.push(row);
      }
      const t = this.t;
      const put = (p) => t.v(p[0], p[1], p[2], p[3], p[4], p[5]);
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j], d = grid[i + 1][j + 1];
          if (a[6] + b[6] + c[6] + d[6] < 0.004) continue;
          put(a); put(b); put(d);
          put(a); put(d); put(c);
        }
      }
      const blue = w.mapId === 'sunset' ? [1.0, 0.5, 0.2] : w.cave && w.inCave(f.z0) ? [0.6, 0.4, 1.0] : [0.25, 0.55, 1.0];
      const lipI = Math.round((f.Lu / f.len) * nu);
      const j0 = Math.round(((span - f.w) / (span * 2)) * nv), j1 = nv - j0;
      for (let j = j0; j < j1; j++) {
        const a = grid[lipI][j], b = grid[lipI][j + 1];
        this.line(a[0], a[1] + 0.06, a[2], b[0], b[1] + 0.06, b[2], blue);
      }
      const endI = Math.round(((f.Lu + f.Lt + f.Ll * 0.6) / f.len) * nu);
      for (const j of [j0, j1]) {
        for (let i = 2; i < endI; i++) {
          const a = grid[i][j], b = grid[i + 1][j];
          this.line(a[0], a[1] + 0.06, a[2], b[0], b[1] + 0.06, b[2], blue);
        }
      }
    }

    rail(f) {
      const w = this.w;
      const isBox = f.type === 'box';
      const x0 = f.ax, z0 = f.az, x1 = f.ax + f.dx * f.len, z1 = f.az + f.dz * f.len;
      const t0 = f.g0 + f.h, t1 = f.g1 + f.h;
      const cave = w.cave && w.inCave(z0);
      if (isBox) {
        const hw = 0.3;
        const sx = f.dz * hw, sz = -f.dx * hw;
        const g0 = f.g0 - 0.4, g1 = f.g1 - 0.4;
        const v = [
          [x0 - sx, g0, z0 - sz], [x0 + sx, g0, z0 + sz], [x0 + sx, t0, z0 + sz], [x0 - sx, t0, z0 - sz],
          [x1 - sx, g1, z1 - sz], [x1 + sx, g1, z1 + sz], [x1 + sx, t1, z1 + sz], [x1 - sx, t1, z1 - sz],
        ];
        const o = [(x0 + x1) / 2, (t0 + g0) / 2, (z0 + z1) / 2];
        const side = cave ? [0.4, 0.9, 1.0] : w.mapId === 'sunset' ? [1.0, 0.45, 0.25] : [1.0, 0.72, 0.12];
        const em = cave ? 0.5 : 0;
        this.quad(v[3], v[2], v[6], v[7], [0.7, 0.76, 0.86], o);
        this.quad(v[0], v[1], v[2], v[3], side, o, em);
        this.quad(v[5], v[4], v[7], v[6], side, o, em);
        this.quad(v[4], v[0], v[3], v[7], side, o, em);
        this.quad(v[1], v[5], v[6], v[2], side, o, em);
        const rx = x0 - f.dx * f.ramp, rz = z0 - f.dz * f.ramp;
        const gr = w.ground(rx, rz) - 0.05;
        const r = [[rx - sx, gr, rz - sz], [rx + sx, gr, rz + sz], [x0 + sx, t0, z0 + sz], [x0 - sx, t0, z0 - sz]];
        this.quad(r[0], r[1], r[2], r[3], [0.75, 0.8, 0.9], [(rx + x0) / 2, gr - 1, (rz + z0) / 2]);
        this.tri(r[0][0], r[0][1], r[0][2], r[3][0], r[3][1], r[3][2], x0 - sx, g0, z0 - sz, side, undefined, undefined, undefined, em);
        this.tri(r[1][0], r[1][1], r[1][2], r[2][0], r[2][1], r[2][2], x0 + sx, g0, z0 + sz, side, undefined, undefined, undefined, em);
      } else {
        this.beam(x0, t0, z0, x1, t1, z1, 0.06, 0.06, [0.78, 0.83, 0.92]);
        const posts = Math.max(2, Math.round(f.len / 4.5));
        for (let i = 0; i <= posts; i++) {
          const k = i / posts;
          const px = lerp(x0, x1, k), pz = lerp(z0, z1, k), top = lerp(t0, t1, k);
          const gy = w.ground(px, pz) - 0.2;
          this.box(px, (top + gy) / 2, pz, 0.05, (top - gy) / 2, 0.05, f.ang, [0.2, 0.22, 0.26]);
        }
        this.box(x0, (f.g0 + t0) / 2 - 0.1, z0, 0.18, (t0 - f.g0) / 2 + 0.1, 0.06, f.ang, cave ? [0.5, 0.4, 1.0] : [0.9, 0.2, 0.15], cave ? 0.6 : 0);
      }
    }

    lamp(l) {
      const s = l.side;
      const base = l.gy - 0.3;
      this.box(l.x, base + 0.75, l.z, 0.26, 0.75, 0.26, 0, [0.75, 0.12, 0.08]);
      this.box(l.x, base + 5.4, l.z, 0.09, 5.1, 0.09, 0, [0.16, 0.17, 0.2]);
      this.beam(l.x, l.hy + 0.25, l.z, l.hx, l.hy + 0.25, l.z, 0.05, 0.05, [0.16, 0.17, 0.2]);
      this.box(l.hx, l.hy, l.z, 0.42, 0.18, 0.55, 0, [1.25, 1.18, 1.0], true);
      this.box(l.hx + s * 0.05, l.hy + 0.22, l.z, 0.48, 0.06, 0.62, 0, [0.12, 0.13, 0.15]);
    }

    pole(p) {
      const gy = this.w.ground(p.x, p.z);
      this.box(p.x, gy + 0.85, p.z, 0.05, 0.95, 0.05, 0, [0.95, 0.28, 0.1]);
      this.box(p.x, gy + 1.25, p.z, 0.055, 0.12, 0.055, 0, [0.12, 0.12, 0.14]);
    }

    // tall race banners for the sunny map
    banner(b) {
      const gy = this.w.ground(b.x, b.z);
      const cols = [[1, 0.25, 0.3], [1, 0.75, 0.1], [0.15, 0.55, 1], [0.15, 0.8, 0.45], [0.7, 0.35, 1]];
      const col = cols[b.i % cols.length];
      this.box(b.x, gy + 2.2, b.z, 0.04, 2.3, 0.04, 0, [0.85, 0.85, 0.9]);
      // teardrop-ish flag made of stacked panels
      const panels = [[0.5, 0.7], [0.55, 0.65], [0.5, 0.55], [0.42, 0.42], [0.3, 0.28]];
      let y = gy + 4.3;
      for (const [w2, h] of panels) {
        this.box(b.x, y - h / 2, b.z + w2 / 2 + 0.05, 0.015, h / 2, w2 / 2, 0, col);
        y -= h;
      }
    }

    flag(f) {
      const gy = this.w.ground(f.x, f.z);
      const cave = this.w.cave && this.w.inCave(f.z);
      this.box(f.x, gy + 1.3, f.z, 0.04, 1.4, 0.04, 0, [0.15, 0.15, 0.18]);
      this.box(f.x, gy + 2.3, f.z + 0.4, 0.02, 0.32, 0.42, 0, cave ? [0.5, 0.9, 1.0] : [1.0, 0.35, 0.12], cave ? 0.8 : 0);
    }

    // slalom gate: tall pole with a glowing panel, red on the left and blue on the right
    gateFlag(f) {
      const gy = this.w.ground(f.x, f.z);
      const col = f.side < 0 ? [1.2, 0.25, 0.2] : [0.25, 0.55, 1.3];
      this.box(f.x, gy + 1.6, f.z, 0.05, 1.7, 0.05, 0, [0.9, 0.9, 0.95]);
      this.box(f.x - f.side * 0.45, gy + 2.6, f.z, 0.45, 0.5, 0.03, 0, col, 0.6);
    }

    net(n) {
      const w = this.w;
      const off = n.side * (C.HALF + 1.7);
      const x0 = w.center(n.z0) + off, x1 = w.center(n.z1) + off;
      const g0 = w.ground(x0, n.z0), g1 = w.ground(x1, n.z1);
      w.light(-n.side, 0.3, 0, x0, g0 + 1, n.z0, L3);
      const k = Math.min(1.4, (L3[0] + L3[1] + L3[2]) / 3);
      const orange = [1.0 * k, 0.32 * k, 0.07 * k];
      const dim = [0.75 * k, 0.24 * k, 0.05 * k];
      this.box(x0, g0 + 0.8, n.z0, 0.04, 0.85, 0.04, 0, [0.15, 0.15, 0.17]);
      for (const h of [0.12, 0.85, 1.55]) this.line(x0, g0 + h, n.z0, x1, g1 + h, n.z1, orange);
      for (let i = 0; i < 6; i++) {
        const a = i / 6, b = (i + 1) / 6;
        const xa = lerp(x0, x1, a), xb = lerp(x0, x1, b), za = lerp(n.z0, n.z1, a), zb = lerp(n.z0, n.z1, b), ga = lerp(g0, g1, a), gb = lerp(g0, g1, b);
        this.line(xa, ga + 0.12, za, xb, gb + 1.55, zb, dim);
        this.line(xa, ga + 1.55, za, xb, gb + 0.12, zb, dim);
      }
    }

    hut(h) {
      const w = this.w;
      const gy = w.ground(h.x, h.z) - 0.3;
      const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
      const P = (x, y, z) => [h.x + x * c + z * s, gy + y, h.z - x * s + z * c];
      const wood = [0.42, 0.26, 0.15], dark = [0.24, 0.15, 0.09], snowc = [0.95, 0.97, 1.0];
      this.box(h.x, gy + 1.6, h.z, 3.0, 1.6, 2.3, h.yaw, wood);
      for (let y = 0.5; y < 3.1; y += 0.55) {
        const a = P(-3.02, y, 2.32), b = P(3.02, y, 2.32), a2 = P(-3.02, y, -2.32), b2 = P(3.02, y, -2.32);
        this.line(a[0], a[1], a[2], b[0], b[1], b[2], [0.12, 0.07, 0.04]);
        this.line(a2[0], a2[1], a2[2], b2[0], b2[1], b2[2], [0.12, 0.07, 0.04]);
      }
      const o = P(0, 3.4, 0);
      const r1 = P(-3.5, 3.1, -2.8), r2 = P(3.5, 3.1, -2.8), r3 = P(3.5, 4.9, 0), r4 = P(-3.5, 4.9, 0);
      const r5 = P(3.5, 3.1, 2.8), r6 = P(-3.5, 3.1, 2.8);
      this.quad(r1, r2, r3, r4, snowc, [o[0], o[1] - 2, o[2]]);
      this.quad(r4, r3, r5, r6, snowc, [o[0], o[1] - 2, o[2]]);
      this.tri(r1[0], r1[1], r1[2], r4[0], r4[1], r4[2], r6[0], r6[1], r6[2], dark, o[0], o[1] - 2, o[2]);
      this.tri(r2[0], r2[1], r2[2], r3[0], r3[1], r3[2], r5[0], r5[1], r5[2], dark, o[0], o[1] - 2, o[2]);
      const face = h.sign === 'start' ? 1 : -1;
      const day = !w.map.lamps;
      const win = day ? [0.35, 0.5, 0.7] : [1.6, 1.05, 0.5];
      for (const z of [-1.1, 1.1]) {
        const p = P(face * 3.02, 1.8, z);
        this.box(p[0], p[1], p[2], 0.04, 0.45, 0.5, h.yaw, win, !day);
      }
      const d = P(face * 3.02, 1.05, 0);
      this.box(d[0], d[1], d[2], 0.05, 1.05, 0.5, h.yaw, dark);
      const ch = P(1.6, 4.6, -1.0);
      this.box(ch[0], ch[1], ch[2], 0.3, 0.7, 0.3, h.yaw, [0.3, 0.3, 0.33]);
    }

    finishFlags() {
      const w = this.w;
      const cols = [[1, 0.25, 0.2], [1, 0.8, 0.15], [0.2, 0.55, 1], [0.2, 0.85, 0.45], [0.7, 0.35, 1]];
      for (let i = 0; i < 12; i++) {
        for (const sd of [-1, 1]) {
          const z = C.LENGTH - 60 + i * 9;
          const x = w.center(z) + sd * (C.HALF + 2.6);
          const gy = w.ground(x, z);
          this.box(x, gy + 1.9, z, 0.04, 2.0, 0.04, 0, [0.15, 0.15, 0.17]);
          this.box(x, gy + 3.2, z + 0.45, 0.02, 0.6, 0.45, 0, cols[(i + (sd > 0 ? 2 : 0)) % cols.length]);
        }
      }
    }

    tower(t, next) {
      const top = t.gy + 13;
      this.box(t.x, t.gy + 6.5, t.z, 0.35, 6.8, 0.35, 0, [0.22, 0.23, 0.27]);
      this.box(t.x, top, t.z, 3.0, 0.15, 0.25, 0, [0.22, 0.23, 0.27]);
      if (!next) return;
      const ntop = next.gy + 13;
      const cable = this.w.map.lamps ? [0.08, 0.09, 0.12] : [0.25, 0.27, 0.32];
      for (const s of [-2.6, 2.6]) {
        this.line(t.x + s, top - 0.2, t.z, next.x + s, ntop - 0.2, next.z, cable);
        const n = 4;
        for (let i = 1; i < n; i++) {
          const k = i / n;
          const cx = lerp(t.x, next.x, k) + s, cz = lerp(t.z, next.z, k), cy = lerp(top, ntop, k) - 0.2 - Math.sin(k * Math.PI) * 0.6;
          this.line(cx, cy, cz, cx, cy - 2.0, cz, cable);
          this.box(cx, cy - 2.2, cz, 0.7, 0.07, 0.35, 0, [0.3, 0.32, 0.38]);
          this.box(cx, cy - 1.85, cz + 0.32, 0.7, 0.32, 0.05, 0, [0.3, 0.32, 0.38]);
        }
      }
    }

    arch(z, finish) {
      const w = this.w;
      const c = w.center(z);
      const gy = w.ground(c, z);
      const hw = C.HALF + 0.6;
      const col = finish ? [1.0, 0.42, 0.1] : [0.2, 0.55, 1.0];
      for (const s of [-1, 1]) this.box(c + s * hw, gy + 4, z, 0.6, 4.3, 0.6, 0, col);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const x0 = c - hw + (i / n) * hw * 2, x1 = c - hw + ((i + 1) / n) * hw * 2;
        for (let r = 0; r < 2; r++) {
          const black = (i + r) % 2 === 0;
          const y0 = gy + 7.4 + r * 0.7, y1 = y0 + 0.7;
          const cc = black ? [0.06, 0.06, 0.08] : [1.25, 1.25, 1.25];
          this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], cc, [(x0 + x1) / 2, (y0 + y1) / 2, z + 1], !black);
        }
      }
      this.box(c, gy + 7.2, z, hw, 0.12, 0.3, 0, col);
      this.box(c, gy + 8.95, z, hw, 0.12, 0.3, 0, col);
    }
  }
  // lateral sample offsets for the terrain (depends on the map's piste width)
  Builder.offs = () => {
    if (Builder._half === C.HALF) return Builder._offs;
    const o = [];
    for (let v = -(C.HALF + 4); v <= C.HALF + 4 + 0.01; v += 1.75) o.push(+v.toFixed(2));
    for (const d of [6.5, 9.5, 13.5, 18.5, 25, 33, 43, 56, 72, 92, 118]) { o.push(C.HALF + d); o.unshift(-(C.HALF + d)); }
    Builder._half = C.HALF;
    Builder._offs = o;
    return o;
  };

  // ------------------------------------------------------------------ sky dome and stars (built once)
  SS.buildBackdrop = function (engine) {
    const sky = new SS.FBuf(1 << 15);
    const lat = 16, lon = 40, R = 1500;
    const P = (i, j) => {
      const t = -0.25 + (i / lat) * (Math.PI / 2 + 0.25), f = (j / lon) * TAU;
      return [Math.cos(t) * Math.cos(f) * R, Math.sin(t) * R, Math.cos(t) * Math.sin(f) * R];
    };
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        for (const v of [a, b, c, a, c, d]) sky.v(v[0], v[1], v[2], 0, 0, 0);
      }
    }
    const r = mulberry32(99);
    const stars = [];
    for (let i = 0; i < 520; i++) {
      const f = r() * TAU, t = 0.08 + Math.pow(r(), 0.7) * 1.4;
      const b = 0.35 + r() * 0.65;
      stars.push(Math.cos(t) * Math.cos(f) * 1400, Math.sin(t) * 1400, Math.cos(t) * Math.sin(f) * 1400, 0.8 * b, 0.86 * b, 1.0 * b, 0.9, 1.4 + r() * 2.6);
    }
    return {
      sky: engine.mesh(sky.data(), 6),
      stars: engine.mesh(new Float32Array(stars), 8, engine.gl.POINTS),
      starCount: stars.length / 8,
    };
  };

  SS.World = World;
})();
