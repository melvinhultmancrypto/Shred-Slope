/*
 * Shred Slope: the mountain.
 * A seeded course: everyone with the same seed gets the exact same run, which is what
 * keeps multiplayer races fair. Static geometry is baked into 50 m chunks.
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
    HALF: 17,       // half-width of the groomed piste
    CHUNK: 50,
    Z0: -90,
    DRAW: 440,
    TOP_ALT: 2840,  // altitude shown on the HUD at the start
  };
  C.ZMAX = C.LENGTH + C.RUNOUT + 90;
  SS.COURSE = C;

  const KICK = {
    S: { Hk: 1.3, Lu: 6, Lt: 4, Ll: 11, w: 2.6 },
    M: { Hk: 2.1, Lu: 8, Lt: 7, Ll: 14, w: 3.2 },
    L: { Hk: 3.0, Lu: 10, Lt: 10, Ll: 18, w: 3.8 },
    XL: { Hk: 4.0, Lu: 13, Lt: 14, Ll: 24, w: 4.6 },
  };

  // baked light
  const SKY = [0.30, 0.34, 0.50], GROUND = [0.10, 0.11, 0.17];
  const MOON_DIR = (() => { const v = [0.35, 0.8, -0.45], l = Math.hypot(...v); return v.map((a) => a / l); })();
  const MOON = [0.26, 0.29, 0.40];
  const LAMP_I = 1.8;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const hash = (x, z) => {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  class World {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.rnd = mulberry32(this.seed || 1);
      this.surf = 0;
      this.surfRef = null;
      this.n = C.ZMAX - C.Z0 + 2;
      this.buildPath();
      this.buildZones();
      this.buildProfiles();
      this.place();
      this.chunks = [];
      this.built = 0;
    }

    // ---------------------------------------------------------------- path and profiles
    buildPath() {
      const r = this.rnd;
      this.p1 = r() * TAU;
      this.p2 = r() * TAU;
      this.p3 = r() * TAU;
      this.pr = r() * TAU;
      const raw = (z) => 34 * Math.sin(z / 230 + this.p1) + 12 * Math.sin(z / 87 + this.p2);
      const c0 = raw(0);
      this.cArr = new Float32Array(this.n);
      for (let i = 0; i < this.n; i++) this.cArr[i] = raw(C.Z0 + i) - c0;
    }

    buildZones() {
      const mids = ['KICKER LINE', 'PINE ALLEY', 'RAIL YARD', 'ROLLER COASTER', 'BIG AIR', 'JIB GARDEN'];
      for (let i = mids.length - 1; i > 0; i--) {
        const j = Math.floor(this.rnd() * (i + 1));
        [mids[i], mids[j]] = [mids[j], mids[i]];
      }
      this.zones = [{ name: 'THE SUMMIT', z0: C.Z0, z1: 220 }];
      let z = 220;
      for (const m of mids) {
        this.zones.push({ name: m, z0: z, z1: z + 380 });
        z += 380;
      }
      this.zones.push({ name: 'THE FINISH', z0: z, z1: C.ZMAX + 10 });
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
        const zn = this.zoneAt(z).name;
        let s = 0.235 + 0.05 * Math.sin(z / 160 + this.p3);
        if (zn === 'KICKER LINE') s += 0.02;
        else if (zn === 'BIG AIR') s += 0.03;
        else if (zn === 'RAIL YARD') s -= 0.03;
        if (z < 30) s = lerp(0.1, s, clamp((z + 30) / 60, 0, 1));
        if (z > C.LENGTH + 10) s = lerp(s, 0.025, clamp((z - C.LENGTH - 10) / 70, 0, 1));
        slope[i] = s;
        amp[i] = zn === 'ROLLER COASTER' ? 1.7 : zn === 'THE SUMMIT' ? 0.35 : zn === 'THE FINISH' ? 0.1 : 0.18;
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
    altitude(z) { return Math.round(C.TOP_ALT + this.base(z)); }

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
        const ee = e < 38 ? e : 38;
        y += 0.05 * ee * ee + (e > 38 ? (e - 38) * 0.9 : 0);
        y += Math.min(1, e / 15) * (4 * Math.sin(x * 0.045 + z * 0.02) + 2.5 * Math.sin(z * 0.07 + x * 0.03));
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
      this.features = [];
      this.trees = [];
      this.lamps = [];
      this.poles = [];
      this.flags = [];
      this.colliders = [];
      this.liftTowers = [];

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

      for (const zn of this.zones) {
        const z0 = zn.z0, L = zn.z1 - zn.z0;
        switch (zn.name) {
          case 'THE SUMMIT':
            kicker(150, R(-5, 5), 'S');
            break;
          case 'KICKER LINE': {
            const sizes = ['S', 'M', 'M', 'L'];
            const at = [40, 125, 210, 295];
            let side = r() < 0.5 ? -1 : 1;
            sizes.forEach((s, i) => { kicker(z0 + at[i], side * R(2, 7), s); side = -side; });
            break;
          }
          case 'PINE ALLEY': {
            const pts = [];
            for (let tries = 0; tries < 400 && pts.length < 40; tries++) {
              const z = R(z0 + 20, z0 + L - 20);
              const off = R(-C.HALF + 2, C.HALF - 2);
              if (pts.every((p) => (p.z - z) ** 2 + (p.off - off) ** 2 > 49)) pts.push({ z, off });
            }
            for (const p of pts) this.trees.push({ x: this.center(p.z) + p.off, z: p.z, s: R(0.8, 1.15), near: true, solid: true });
            break;
          }
          case 'RAIL YARD':
            for (const at of [30, 100, 170, 240, 310]) {
              const flip = r() < 0.5 ? -1 : 1;
              rail(z0 + at, flip * R(4, 7), 'box', R(12, 16));
              rail(z0 + at + R(-3, 3), -flip * R(4, 7), 'rail', R(12, 17));
            }
            kicker(z0 + 58, R(-3, 3), 'S');
            kicker(z0 + 268, R(-3, 3), 'S');
            break;
          case 'ROLLER COASTER':
            break;
          case 'BIG AIR':
            kicker(z0 + 40, R(-6, 6), 'M');
            kicker(z0 + 140, R(-5, 5), 'L');
            kicker(z0 + 255, R(-4, 4), 'XL');
            break;
          case 'JIB GARDEN':
            rail(z0 + 30, R(-6, 6), 'box', 14);
            kicker(z0 + 80, R(-6, 6), 'S');
            rail(z0 + 150, R(-6, 6), r() < 0.5 ? 'rail' : 'box', 15);
            kicker(z0 + 205, R(-5, 5), 'M');
            rail(z0 + 285, -6, 'box', 13);
            rail(z0 + 285, 6, 'rail', 13);
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

      // forest on both banks
      for (let z = C.Z0; z < C.ZMAX; z += R(2.6, 4)) {
        const c = this.center(z);
        for (const side of [-1, 1]) {
          if (r() < 0.82) {
            const e = 2.6 + Math.pow(r(), 1.3) * 28;
            this.trees.push({ x: c + side * (C.HALF + e), z: z + R(-1, 1), s: R(0.8, 1.5), near: true, solid: e < 26 });
          }
          if (r() < 0.75) {
            const e = 30 + r() * 62;
            this.trees.push({ x: c + side * (C.HALF + e), z: z + R(-1.5, 1.5), s: R(0.9, 1.7), near: false, solid: false });
          }
        }
      }
      // keep trees off the kickers and rails
      this.trees = this.trees.filter((t) => {
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
      });

      // floodlights, alternating sides
      let side = 1;
      for (let z = 8; z < C.LENGTH + 120; z += 44) {
        const c = this.center(z);
        const x = c + side * (C.HALF + 3.2);
        const gy = this.ground(x, z);
        const hx = x - side * 1.9;
        this.lamps.push({ x, z, gy, side, hx, hy: gy + 10.2, lx: hx, ly: gy + 9.8, lz: z, i: LAMP_I });
        this.colliders.push({ x, z, r: 0.35, top: gy + 11 });
        side = -side;
      }
      this.lampBuckets = [];
      for (const l of this.lamps) (this.lampBuckets[((l.z - C.Z0) / 50) | 0] = this.lampBuckets[((l.z - C.Z0) / 50) | 0] || []).push(l);

      // piste marker poles
      for (let z = 4; z < C.LENGTH + 100; z += 26) {
        for (const s of [-1, 1]) {
          if (this.lamps.some((l) => l.side === s && Math.abs(l.z - z) < 4)) continue;
          this.poles.push({ x: this.center(z) + s * (C.HALF + 0.9), z });
        }
      }

      // chairlift up one bank
      const ls = r() < 0.5 ? -1 : 1;
      this.liftSide = ls;
      for (let z = C.Z0 + 20; z < C.ZMAX; z += 65) {
        const x = this.center(z) + ls * (C.HALF + 30);
        this.liftTowers.push({ x, z, gy: this.ground(x, z) });
      }

      // solid trees become colliders
      for (const t of this.trees) if (t.solid) this.colliders.push({ x: t.x, z: t.z, r: 0.5 * t.s, top: this.ground(t.x, t.z) + 7 * t.s });
      // finish arch pillars
      for (const s of [-1, 1]) this.colliders.push({ x: this.center(C.LENGTH) + s * (C.HALF + 0.6), z: C.LENGTH, r: 0.8, top: 1e4 });

      this.cb = [];
      for (const col of this.colliders) {
        const b = ((col.z - C.Z0) / 10) | 0;
        (this.cb[b] = this.cb[b] || []).push(col);
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

    // the 4 floodlights nearest a point (for lighting the riders)
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
        out[i] = { x: l.lx, y: l.ly, z: l.lz, i: l.i };
      }
      return out;
    }

    // ---------------------------------------------------------------- baked lighting
    light(nx, ny, nz, x, y, z, out) {
      const h = ny * 0.5 + 0.5;
      const m = Math.max(0, nx * MOON_DIR[0] + ny * MOON_DIR[1] + nz * MOON_DIR[2]);
      let r = lerp(GROUND[0], SKY[0], h) + MOON[0] * m;
      let g = lerp(GROUND[1], SKY[1], h) + MOON[1] * m;
      let b = lerp(GROUND[2], SKY[2], h) + MOON[2] * m;
      const b0 = ((z - C.Z0) / 50) | 0;
      for (let k = b0 - 1; k <= b0 + 1; k++) {
        const list = this.lampBuckets[k];
        if (!list) continue;
        for (const l of list) {
          const dx = l.lx - x, dy = l.ly - y, dz = l.lz - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 4900) continue;
          const d = Math.sqrt(d2);
          const ndl = (nx * dx + ny * dy + nz * dz) / d;
          if (ndl <= 0) continue;
          const i = (l.i * ndl) / (1 + d2 * 0.0035);
          r += i; g += i * 0.93; b += i * 0.8;
        }
      }
      out[0] = r; out[1] = g; out[2] = b;
      return out;
    }

    // ---------------------------------------------------------------- meshes
    // Build chunk meshes lazily: call ensureChunks every frame.
    ensureChunks(engine, z, budget) {
      const n = Math.ceil((C.ZMAX - C.Z0) / C.CHUNK);
      if (!this.chunks.length) {
        for (let i = 0; i < n; i++) this.chunks.push({ i, z0: C.Z0 + i * C.CHUNK, z1: C.Z0 + (i + 1) * C.CHUNK, minZ: 0, maxZ: 0, tri: null, lines: null });
        this.assignObjects();
      }
      let done = 0;
      // nearest first
      const ci = clamp(Math.floor((z - C.Z0) / C.CHUNK), 0, n - 1);
      for (let k = 0; k < n && done < budget; k++) {
        const c = this.chunks[ci + k] || null;
        if (c && !c.tri && c.z0 < z + C.DRAW + 60) { this.buildChunk(engine, c); done++; }
      }
      for (let k = 1; k < 3 && done < budget; k++) {
        const c = this.chunks[ci - k];
        if (c && !c.tri) { this.buildChunk(engine, c); done++; }
      }
      // then everything else in the background
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
      for (const l of this.lamps) add(l.z, { k: 'lamp', o: l });
      for (const p of this.poles) add(p.z, { k: 'pole', o: p });
      for (const f of this.flags) add(f.z, { k: 'flag', o: f });
      this.liftTowers.forEach((t, i) => add(t.z, { k: 'tower', o: t, next: this.liftTowers[i + 1] }));
      add(C.LENGTH, { k: 'finish' });
      add(-3, { k: 'start' });
    }

    buildChunk(engine, ch) {
      const tri = new SS.FBuf(1 << 16), lines = new SS.FBuf(1024);
      const B = new Builder(this, tri, lines);
      ch.minZ = ch.z0;
      ch.maxZ = ch.z1;
      B.terrain(ch.z0, ch.z1);
      for (const it of ch.objs) {
        const o = it.o;
        switch (it.k) {
          case 'tree': B.tree(o); break;
          case 'kicker': B.kicker(o); ch.maxZ = Math.max(ch.maxZ, o.z0 + o.len); break;
          case 'rail': B.rail(o); ch.maxZ = Math.max(ch.maxZ, o.z1 + 1); ch.minZ = Math.min(ch.minZ, o.z0 - 1); break;
          case 'lamp': B.lamp(o); break;
          case 'pole': B.pole(o); break;
          case 'flag': B.flag(o); break;
          case 'tower': B.tower(o, it.next); if (it.next) ch.maxZ = Math.max(ch.maxZ, it.next.z); break;
          case 'finish': B.arch(C.LENGTH, true); break;
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
      this.chunks = [];
    }

    // lamp glows as a static point mesh: [x,y,z, r,g,b,a, size]
    glows(engine) {
      if (this.glowMesh) return this.glowMesh;
      const d = [];
      for (const l of this.lamps) {
        d.push(l.hx, l.hy - 0.15, l.z, 1.0, 0.93, 0.78, 0.9, 1.6);
        d.push(l.hx, l.hy - 0.3, l.z, 1.0, 0.88, 0.66, 0.16, 11);
      }
      const fc = this.center(C.LENGTH);
      for (let i = -3; i <= 3; i++) d.push(fc + i * 5.5, this.ground(fc, C.LENGTH) + 8.2, C.LENGTH, 1.0, 0.6, 0.3, 0.35, 3.5);
      this.glowCount = d.length / 8;
      this.glowMesh = engine.mesh(new Float32Array(d), 8, engine.gl.POINTS);
      return this.glowMesh;
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
      this.map = { lo, span, W, H: Hh, pad: 8 };
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(160,220,255,0.35)';
      g.lineWidth = 5;
      g.beginPath();
      for (let z = 0; z <= C.LENGTH; z += 20) {
        const p = this.mapPos(this.center(z), z);
        if (z === 0) g.moveTo(p[0], p[1]);
        else g.lineTo(p[0], p[1]);
      }
      g.stroke();
      g.strokeStyle = 'rgba(220,245,255,0.85)';
      g.lineWidth = 1.5;
      g.setLineDash([2, 3]);
      g.stroke();
      g.setLineDash([]);
    }

    mapPos(x, z) {
      const m = this.map;
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
      if (emissive) { r = col[0]; g = col[1]; b = col[2]; }
      else {
        this.w.light(nx, ny, nz, mx, my, mz, L3);
        r = col[0] * L3[0]; g = col[1] * L3[1]; b = col[2] * L3[2];
      }
      const t = this.t;
      t.v(ax, ay, az, r, g, b);
      t.v(bx, by, bz, r, g, b);
      t.v(cx, cy, cz, r, g, b);
    }

    quad(p0, p1, p2, p3, col, o, em) {
      // the quad's centre seen from the object's centre points outward
      const h = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4 - o[0], (p0[1] + p1[1] + p2[1] + p3[1]) / 4 - o[1], (p0[2] + p1[2] + p2[2] + p3[2]) / 4 - o[2]];
      this.tri(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], col, o[0], o[1], o[2], em, h);
      this.tri(p0[0], p0[1], p0[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], col, o[0], o[1], o[2], em, h);
    }

    // oriented box: centre, half sizes, yaw
    box(cx, cy, cz, hx, hy, hz, yaw, col, em) {
      const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0);
      const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
      const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
      const o = [cx, cy, cz];
      const f = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
      for (const q of f) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], col, o, em);
    }

    // box between two points (for beams and rails), with thickness w (sideways) and h (up)
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

    // cone or cylinder frustum
    cyl(x, y0, z, r0, r1, h, sides, col, cap) {
      const o = [x, y0 + h * 0.4, z];
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * TAU, a1 = ((i + 1) / sides) * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const b0 = [x + c0 * r0, y0, z + s0 * r0], b1 = [x + c1 * r0, y0, z + s1 * r0];
        if (r1 <= 0.001) {
          this.tri(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], x, y0 + h, z, col, o[0], o[1], o[2]);
        } else {
          const t0 = [x + c0 * r1, y0 + h, z + s0 * r1], t1 = [x + c1 * r1, y0 + h, z + s1 * r1];
          this.quad(b0, b1, t1, t0, col, o);
          if (cap) this.tri(t0[0], t0[1], t0[2], t1[0], t1[1], t1[2], x, y0 + h, z, col, x, y0, z);
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
      const offs = Builder.OFFS;
      const nc = offs.length;
      const rows = [];
      for (let z = z0; z <= z1 + 0.001; z += 2) rows.push(z);
      const nr = rows.length;
      const P = new Float32Array(nr * nc * 6);
      for (let i = 0; i < nr; i++) {
        const z = rows[i];
        const c = w.center(z);
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
          w.light(nx, ny, nz, x, y, z, L3);
          const ao = Math.abs(off);
          let ar, ag, ab;
          if (ao < C.HALF) { ar = 0.95; ag = 0.97; ab = 1.0; }
          else { const k = Math.min(1, (ao - C.HALF) / 4); ar = lerp(0.95, 0.86, k); ag = lerp(0.97, 0.9, k); ab = 1.0; }
          const steep = Math.hypot(gx, gz);
          if (steep > 0.95) {
            const k = Math.min(0.75, (steep - 0.95) * 1.4);
            ar = lerp(ar, 0.3, k); ag = lerp(ag, 0.32, k); ab = lerp(ab, 0.38, k);
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

    tree(t) {
      const w = this.w;
      const s = t.s;
      const y = w.ground(t.x, t.z) - 0.25;
      const h1 = hash(t.x, t.z);
      const green = [0.07 + h1 * 0.03, 0.17 + h1 * 0.05, 0.12 + h1 * 0.03];
      const snow = [0.82, 0.87, 0.96];
      this.cyl(t.x, y, t.z, 0.2 * s, 0.14 * s, 1.5 * s, 5, [0.2, 0.13, 0.08]);
      const tiers = t.near ? 4 : 3;
      const sides = t.near ? 7 : 6;
      for (let i = 0; i < tiers; i++) {
        const rb = (1.8 - i * (t.near ? 0.36 : 0.48)) * s;
        const y0 = y + (1.1 + i * (t.near ? 1.15 : 1.5)) * s;
        const hh = (2.4 - i * 0.25) * s;
        if (t.near) {
          // snow on the branch tips
          this.cyl(t.x, y0 - 0.05 * s, t.z, rb, rb * 0.8, 0.38 * s, sides, snow);
          this.cyl(t.x, y0 + 0.33 * s, t.z, rb * 0.8, 0, hh - 0.33 * s, sides, green);
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
          w.light(-gx / l, 1 / l, -gz / l, x, y, z, L3);
          row.push([x, y, z, 0.98 * L3[0], 0.99 * L3[1], 1.0 * L3[2], k]);
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
      // blue edge lines like a groomed park jump
      const blue = [0.25, 0.55, 1.0];
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
      if (isBox) {
        const hw = 0.3;
        const sx = f.dz * hw, sz = -f.dx * hw;
        const g0 = f.g0 - 0.4, g1 = f.g1 - 0.4;
        const v = [
          [x0 - sx, g0, z0 - sz], [x0 + sx, g0, z0 + sz], [x0 + sx, t0, z0 + sz], [x0 - sx, t0, z0 - sz],
          [x1 - sx, g1, z1 - sz], [x1 + sx, g1, z1 + sz], [x1 + sx, t1, z1 + sz], [x1 - sx, t1, z1 - sz],
        ];
        const o = [(x0 + x1) / 2, (t0 + g0) / 2, (z0 + z1) / 2];
        const side = [1.0, 0.72, 0.12];
        this.quad(v[3], v[2], v[6], v[7], [0.7, 0.76, 0.86], o);
        this.quad(v[0], v[1], v[2], v[3], side, o);
        this.quad(v[5], v[4], v[7], v[6], side, o);
        this.quad(v[4], v[0], v[3], v[7], side, o);
        this.quad(v[1], v[5], v[6], v[2], side, o);
        // ride-on ramp
        const rx = x0 - f.dx * f.ramp, rz = z0 - f.dz * f.ramp;
        const gr = w.ground(rx, rz) - 0.05;
        const r = [[rx - sx, gr, rz - sz], [rx + sx, gr, rz + sz], [x0 + sx, t0, z0 + sz], [x0 - sx, t0, z0 - sz]];
        this.quad(r[0], r[1], r[2], r[3], [0.75, 0.8, 0.9], [ (rx + x0) / 2, gr - 1, (rz + z0) / 2 ]);
        this.tri(r[0][0], r[0][1], r[0][2], r[3][0], r[3][1], r[3][2], x0 - sx, g0, z0 - sz, side);
        this.tri(r[1][0], r[1][1], r[1][2], r[2][0], r[2][1], r[2][2], x0 + sx, g0, z0 + sz, side);
      } else {
        this.beam(x0, t0, z0, x1, t1, z1, 0.06, 0.06, [0.78, 0.83, 0.92]);
        const posts = Math.max(2, Math.round(f.len / 4.5));
        for (let i = 0; i <= posts; i++) {
          const k = i / posts;
          const px = lerp(x0, x1, k), pz = lerp(z0, z1, k), top = lerp(t0, t1, k);
          const gy = w.ground(px, pz) - 0.2;
          this.box(px, (top + gy) / 2, pz, 0.05, (top - gy) / 2, 0.05, f.ang, [0.2, 0.22, 0.26]);
        }
        this.box(x0, (f.g0 + t0) / 2 - 0.1, z0, 0.18, (t0 - f.g0) / 2 + 0.1, 0.06, f.ang, [0.9, 0.2, 0.15]);
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

    flag(f) {
      const gy = this.w.ground(f.x, f.z);
      this.box(f.x, gy + 1.3, f.z, 0.04, 1.4, 0.04, 0, [0.15, 0.15, 0.18]);
      this.box(f.x, gy + 2.3, f.z + 0.4, 0.02, 0.32, 0.42, 0, [1.0, 0.35, 0.12]);
    }

    tower(t, next) {
      const top = t.gy + 13;
      this.box(t.x, t.gy + 6.5, t.z, 0.35, 6.8, 0.35, 0, [0.22, 0.23, 0.27]);
      this.box(t.x, top, t.z, 3.0, 0.15, 0.25, 0, [0.22, 0.23, 0.27]);
      if (!next) return;
      const ntop = next.gy + 13;
      const cable = [0.08, 0.09, 0.12];
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
      // checkered banner
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
  Builder.OFFS = (() => {
    const o = [];
    for (let v = -(C.HALF + 4); v <= C.HALF + 4 + 0.01; v += 1.75) o.push(+v.toFixed(2));
    const outer = [C.HALF + 6.5, C.HALF + 9.5, C.HALF + 13.5, C.HALF + 18.5, C.HALF + 25, C.HALF + 33, C.HALF + 43, C.HALF + 56, C.HALF + 72, C.HALF + 92, C.HALF + 118];
    for (const v of outer) { o.push(v); o.unshift(-v); }
    return o;
  })();

  // ------------------------------------------------------------------ sky, stars and distant mountains (built once)
  SS.buildBackdrop = function (engine) {
    const sky = new SS.FBuf(1 << 15);
    const lat = 16, lon = 40, R = 1500;
    const zen = [0.02, 0.035, 0.09], hor = [0.11, 0.16, 0.30], below = [0.07, 0.1, 0.19];
    const col = (x, y, z) => {
      const el = y / R;
      if (el < 0) return below;
      const k = Math.pow(el, 0.55);
      const cloud = Math.max(0, Math.sin(x * 0.004 + z * 0.002) * Math.sin(z * 0.006 - x * 0.002 + 1.3)) * 0.35 * (1 - k);
      return [lerp(hor[0], zen[0], k) + cloud * 0.12, lerp(hor[1], zen[1], k) + cloud * 0.14, lerp(hor[2], zen[2], k) + cloud * 0.2];
    };
    const P = (i, j) => {
      const t = -0.25 + (i / lat) * (Math.PI / 2 + 0.25), f = (j / lon) * TAU;
      return [Math.cos(t) * Math.cos(f) * R, Math.sin(t) * R, Math.cos(t) * Math.sin(f) * R];
    };
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        for (const v of [a, b, c, a, c, d]) {
          const cc = col(v[0], v[1], v[2]);
          sky.v(v[0], v[1], v[2], cc[0], cc[1], cc[2]);
        }
      }
    }
    const r = mulberry32(99);
    const stars = [];
    for (let i = 0; i < 520; i++) {
      const f = r() * TAU, t = 0.08 + Math.pow(r(), 0.7) * 1.4;
      const b = 0.35 + r() * 0.65;
      stars.push(Math.cos(t) * Math.cos(f) * 1400, Math.sin(t) * 1400, Math.cos(t) * Math.sin(f) * 1400, 0.8 * b, 0.86 * b, 1.0 * b, 0.9, 1.4 + r() * 2.6);
    }
    // the moon
    stars.push(-600, 820, -760, 0.95, 0.96, 1.0, 1.0, 55, -600, 820, -760, 0.5, 0.6, 0.9, 0.22, 260);

    const mtn = new SS.FBuf(1 << 14);
    const B = new Builder({ light: (nx, ny, nz, x, y, z, out) => { const k = 0.25 + Math.max(0, nx * MOON_DIR[0] + ny * MOON_DIR[1] + nz * MOON_DIR[2]) * 0.55; out[0] = k; out[1] = k; out[2] = k; return out; } }, mtn, new SS.FBuf(8));
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
      const back = [cx * 1.08, -240, cz * 1.08];
      const dark = [0.07, 0.09, 0.16], snowc = [0.32, 0.36, 0.5];
      B.tri(l[0], l[1], l[2], rr[0], rr[1], rr[2], apex[0], apex[1], apex[2], dark, back[0], back[1] + 100, back[2]);
      const k = 0.3;
      const sl = [lerp(apex[0], l[0], k), lerp(apex[1], l[1], k), lerp(apex[2], l[2], k)];
      const sr = [lerp(apex[0], rr[0], k), lerp(apex[1], rr[1], k), lerp(apex[2], rr[2], k)];
      const toward = [-cx * 0.01, 0, -cz * 0.01];
      B.tri(sl[0] + toward[0], sl[1], sl[2] + toward[2], sr[0] + toward[0], sr[1], sr[2] + toward[2], apex[0] + toward[0], apex[1] + 0.5, apex[2] + toward[2], snowc, back[0], back[1] + 100, back[2]);
    }
    return {
      sky: engine.mesh(sky.data(), 6),
      stars: engine.mesh(new Float32Array(stars), 8, engine.gl.POINTS),
      starCount: stars.length / 8,
      mountains: engine.mesh(mtn.data(), 6),
    };
  };

  SS.World = World;
})();
