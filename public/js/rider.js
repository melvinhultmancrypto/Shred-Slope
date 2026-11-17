/*
 * Shred Slope: the snowboarder.
 * A detailed, posed model built once from lofted shapes: jacket with a colour-blocked yoke,
 * hood, zip and pocket, baggy pants with knee patches, boots in strap bindings with highbacks,
 * mitts with cuffs, a backpack, and a helmet with vents, ear pads, goggles and a strap.
 * Body frame: board along +z, rider faces +x (regular stance), up is +y.
 */
(function () {
  'use strict';
  const SS = window.SS;
  const M4 = SS.M4;
  const TAU = Math.PI * 2;

  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  // 10 outfits (one per player slot on a server)
  const PALETTE = [
    { name: 'Forest', css: '#2fbf71', jacket: '#25a865', trim: '#163b2b', pants: '#202227', board: '#f0384a', stripe: '#ffffff', helmet: '#1c1d22', lens: '#ffa62b', boot: '#2b2a2e' },
    { name: 'Blaze', css: '#ff7a1f', jacket: '#ff6d17', trim: '#2b1a10', pants: '#2a3142', board: '#1d2a4a', stripe: '#ffcc33', helmet: '#f2f2f4', lens: '#38c6ff', boot: '#3a2a20' },
    { name: 'Glacier', css: '#3d8bff', jacket: '#2f7dff', trim: '#0f1f3d', pants: '#e9edf5', board: '#ffcc22', stripe: '#141414', helmet: '#1c1d22', lens: '#ff7a2e', boot: '#24262c' },
    { name: 'Bubblegum', css: '#ff4f8b', jacket: '#ff4a86', trim: '#3d1023', pants: '#1f1f26', board: '#7c4dff', stripe: '#ffffff', helmet: '#f2f2f4', lens: '#a98bff', boot: '#2b2a2e' },
    { name: 'Lemon', css: '#ffd23f', jacket: '#ffcf2e', trim: '#3a2f06', pants: '#2b2d33', board: '#2f7dff', stripe: '#ffffff', helmet: '#1c1d22', lens: '#ff4fa0', boot: '#c99a63' },
    { name: 'Ultraviolet', css: '#a46bff', jacket: '#9a5cff', trim: '#21123f', pants: '#16161b', board: '#19d3c5', stripe: '#141414', helmet: '#1c1d22', lens: '#4dffa6', boot: '#24262c' },
    { name: 'Lagoon', css: '#19d3c5', jacket: '#12c4b6', trim: '#0b3533', pants: '#2c2f3a', board: '#ff5a36', stripe: '#ffffff', helmet: '#f2f2f4', lens: '#ffd23f', boot: '#2b2a2e' },
    { name: 'Inferno', css: '#ff3b30', jacket: '#ec2a22', trim: '#2a0b09', pants: '#141418', board: '#f2f2f4', stripe: '#ec2a22', helmet: '#1c1d22', lens: '#ffb02e', boot: '#1d1d21' },
    { name: 'Whiteout', css: '#e9eef7', jacket: '#e7ecf5', trim: '#9aa6bd', pants: '#3a4253', board: '#ff7a1f', stripe: '#141414', helmet: '#2f7dff', lens: '#ff4fa0', boot: '#d9d4c7' },
    { name: 'Acid', css: '#8bd346', jacket: '#84cf3a', trim: '#1d3010', pants: '#26272c', board: '#a46bff', stripe: '#ffffff', helmet: '#1c1d22', lens: '#6f9cff', boot: '#2b2a2e' },
  ];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  for (const p of PALETTE) {
    for (const k of ['jacket', 'trim', 'pants', 'board', 'stripe', 'helmet', 'lens', 'boot']) p[k] = hex(p[k]);
    p.pantsPatch = shade(p.pants, p.pants[0] > 0.6 ? 0.82 : 1.45);
    p.helmetDark = shade(p.helmet, p.helmet[0] > 0.6 ? 0.7 : 1.6);
    p.glove = p.trim[0] + p.trim[1] + p.trim[2] > 1.2 ? [0.16, 0.17, 0.2] : shade(p.trim, 1.25);
  }
  SS.PALETTE = PALETTE;

  const DARK = [0.06, 0.06, 0.07];
  const BIND = [0.13, 0.135, 0.15];
  const BASE = [0.07, 0.075, 0.095];
  const STEEL = [0.62, 0.65, 0.7];
  const SOLE = [0.1, 0.1, 0.11];
  const PACK = [0.16, 0.17, 0.2];
  const ZIP = [0.08, 0.08, 0.09];

  // shine presets [strength, sharpness]
  const SH_HELMET = [0.55, 42];
  const SH_LENS = [1.25, 90];
  const SH_BOARD = [0.35, 34];
  const SH_JACKET = [0.1, 10];
  const SH_PANTS = [0.05, 6];
  const SH_BOOT = [0.2, 18];
  const SH_STEEL = [0.9, 60];

  // ------------------------------------------------------------------ mesh building
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

  // a smooth shape lofted through rings stacked along y; each ring is a superellipse {y, rx, rz, ox, oz}
  function loft(rings, segs, opts) {
    const o = opts || {};
    const e = 2 / (o.p || 2);
    const a0 = o.a0 === undefined ? 0 : o.a0, a1 = o.a1 === undefined ? TAU : o.a1;
    const closed = a1 - a0 >= TAU - 1e-6;
    const cols = closed ? segs : segs + 1;
    const P = rings.map((r) => {
      const row = [];
      for (let j = 0; j < cols; j++) {
        const a = a0 + ((a1 - a0) * j) / segs;
        row.push([(r.ox || 0) + sgnPow(Math.cos(a), e) * r.rx, r.y, (r.oz || 0) + sgnPow(Math.sin(a), e) * r.rz]);
      }
      return row;
    });
    const nr = rings.length;
    const N = P.map((row, i) => row.map((p, j) => {
      const jn = closed ? (j + 1) % cols : Math.min(cols - 1, j + 1), jp = closed ? (j - 1 + cols) % cols : Math.max(0, j - 1);
      const t = sub(row[jn], row[jp]);
      const b = sub(P[Math.min(nr - 1, i + 1)][j], P[Math.max(0, i - 1)][j]);
      let n = nrm(cross(t, b));
      const c = [rings[i].ox || 0, p[1], rings[i].oz || 0];
      const out = sub(p, c);
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
      if (o.inside) n = [-n[0], -n[1], -n[2]];
      return n;
    }));
    const d = [];
    const put = (i, j) => { const p = P[i][j], n = N[i][j]; d.push(p[0], p[1], p[2], n[0], n[1], n[2]); };
    for (let i = 0; i < nr - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const j1 = closed ? (j + 1) % cols : j + 1;
        put(i, j); put(i + 1, j); put(i + 1, j1);
        put(i, j); put(i + 1, j1); put(i, j1);
      }
    }
    const cap = (i, ny) => {
      const r = rings[i], c = [r.ox || 0, r.y, r.oz || 0];
      for (let j = 0; j < segs; j++) {
        const j1 = closed ? (j + 1) % cols : j + 1;
        const p0 = P[i][j], p1 = P[i][j1];
        if (ny > 0) d.push(c[0], c[1], c[2], 0, 1, 0, p0[0], p0[1], p0[2], 0, 1, 0, p1[0], p1[1], p1[2], 0, 1, 0);
        else d.push(c[0], c[1], c[2], 0, -1, 0, p1[0], p1[1], p1[2], 0, -1, 0, p0[0], p0[1], p0[2], 0, -1, 0);
      }
    };
    if (o.capBottom) cap(0, -1);
    if (o.capTop) cap(nr - 1, 1);
    return d;
  }

  // unit sphere (radius 0.5) as rings
  function sphereRings(n, rx, ry, rz, cx, cy, cz) {
    const r = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI;
      const k = Math.max(1e-3, Math.sin(t));
      r.push({ y: (cy || 0) - Math.cos(t) * ry, rx: k * rx, rz: k * rz, ox: cx || 0, oz: cz || 0 });
    }
    return r;
  }
  const sphere = (n, s, rx, ry, rz, cx, cy, cz) => loft(sphereRings(n, rx, ry, rz, cx, cy, cz), s);

  // swap axes of a finished mesh (so lofts along y can lie along x or z)
  function remap(d, f) {
    const o = [];
    for (let i = 0; i < d.length; i += 6) {
      const p = f(d[i], d[i + 1], d[i + 2]), n = f(d[i + 3], d[i + 4], d[i + 5]);
      o.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    }
    return o;
  }

  // flat quad (two triangles) with a face normal pointing toward `up`
  function quad(out, a, b, c, dd, up) {
    let n = nrm(cross(sub(b, a), sub(dd, a)));
    if (up && n[0] * up[0] + n[1] * up[1] + n[2] * up[2] < 0) { n = [-n[0], -n[1], -n[2]]; const t = b; b = dd; dd = t; }
    for (const p of [a, b, c, a, c, dd]) out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
  }

  let meshes = null;
  function build(engine) {
    const mk = (d) => engine.mesh(new Float32Array(d), 6);

    // ---- basic shapes (unit sized) ----
    const cyl = loft([{ y: -0.5, rx: 0.5, rz: 0.5 }, { y: 0.5, rx: 0.5, rz: 0.5 }], 14, { capTop: true, capBottom: true });
    const sph = sphere(12, 18, 0.5, 0.5, 0.5);
    const band = loft([{ y: -0.5, rx: 0.5, rz: 0.5 }, { y: 0.5, rx: 0.5, rz: 0.5 }], 22);

    // ---- clothing: limbs with real radii (metres), length 1 along y ----
    const sleeveUp = loft([{ y: 0, rx: 0.072, rz: 0.072 }, { y: 0.3, rx: 0.077, rz: 0.076 }, { y: 0.75, rx: 0.07, rz: 0.069 }, { y: 1, rx: 0.064, rz: 0.064 }], 14);
    const sleeveLo = loft([{ y: 0, rx: 0.064, rz: 0.064 }, { y: 0.45, rx: 0.066, rz: 0.064 }, { y: 1, rx: 0.06, rz: 0.058 }], 14);
    const thigh = loft([{ y: 0, rx: 0.088, rz: 0.088 }, { y: 0.35, rx: 0.1, rz: 0.098 }, { y: 0.8, rx: 0.106, rz: 0.104 }, { y: 1, rx: 0.1, rz: 0.1 }], 16);
    // shin of baggy pants, flaring over the boot
    const shin = loft([{ y: 0, rx: 0.118, rz: 0.104 }, { y: 0.06, rx: 0.114, rz: 0.1 }, { y: 0.2, rx: 0.102, rz: 0.094 }, { y: 0.55, rx: 0.09, rz: 0.086 }, { y: 1, rx: 0.087, rz: 0.085 }], 20, { capBottom: true });

    // ---- jacket, in torso space: x across the shoulders, y up the spine (0..1), z toward the back ----
    const TP = 2.6;
    const tr = (y, rx, rz, oz) => ({ y, rx, rz, oz: oz || 0 });
    const body = loft([tr(0.04, 0.178, 0.138), tr(0.2, 0.182, 0.14), tr(0.42, 0.188, 0.142, -0.004), tr(0.6, 0.198, 0.142, -0.008)], 22, { p: TP });
    const yoke = loft([tr(0.6, 0.198, 0.142, -0.008), tr(0.72, 0.207, 0.137, -0.006), tr(0.84, 0.206, 0.124), tr(0.92, 0.17, 0.108), tr(0.97, 0.11, 0.09), tr(1.0, 0.06, 0.07)], 22, { p: TP, capTop: true });
    const hem = loft([tr(-0.04, 0.184, 0.144), tr(0.06, 0.186, 0.146)], 22, { p: TP, capBottom: true });
    // hood bunched at the back of the neck, and a stand-up collar
    const hood = sphere(8, 12, 0.125, 0.11, 0.085, 0, 0.92, 0.1);
    const collar = loft([{ y: 0.9, rx: 0.088, rz: 0.084, oz: -0.004 }, { y: 1.08, rx: 0.08, rz: 0.078, oz: -0.012 }], 16, { capTop: true });
    // where the jacket surface is, so the zip, pocket and pack straps sit right on it
    const TR = [[0.04, 0.178, 0.138, 0], [0.2, 0.182, 0.14, 0], [0.42, 0.188, 0.142, -0.004], [0.6, 0.198, 0.142, -0.008], [0.72, 0.207, 0.137, -0.006], [0.84, 0.206, 0.124, 0], [0.92, 0.17, 0.108, 0], [0.97, 0.11, 0.09, 0], [1.0, 0.06, 0.07, 0]];
    const ringAt = (y) => {
      let i = 0;
      while (i < TR.length - 2 && y > TR[i + 1][0]) i++;
      const A = TR[i], B = TR[i + 1], k = Math.min(1, Math.max(0, (y - A[0]) / (B[0] - A[0])));
      return [A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k, A[3] + (B[3] - A[3]) * k];
    };
    // z of the jacket surface at (x, y): side -1 = front, +1 = back
    const surfZ = (x, y, sideZ, lift) => {
      const [rx, rz, oz] = ringAt(y);
      const u = Math.min(0.999, Math.abs(x) / rx);
      return oz + sideZ * (rz * Math.pow(1 - Math.pow(u, TP), 1 / TP) + (lift || 0.003));
    };
    const zip = [], pocket = [], straps = [];
    for (let i = 0; i < 14; i++) {
      const y0 = 0.05 + i * 0.058, y1 = y0 + 0.058;
      quad(zip, [-0.01, y0, surfZ(0, y0, -1)], [0.01, y0, surfZ(0, y0, -1)], [0.01, y1, surfZ(0, y1, -1)], [-0.01, y1, surfZ(0, y1, -1)], [0, 0, -1]);
    }
    // chest pocket with a little flap
    const pk = (x, y, l) => [x, y, surfZ(x, y, -1, l)];
    quad(pocket, pk(0.035, 0.47, 0.004), pk(0.135, 0.47, 0.004), pk(0.135, 0.6, 0.004), pk(0.035, 0.6, 0.004), [0, 0, -1]);
    quad(pocket, pk(0.03, 0.6, 0.004), pk(0.14, 0.6, 0.004), pk(0.14, 0.625, 0.012), pk(0.03, 0.625, 0.012), [0, 0.3, -1]);
    // pack straps: up the back from under the pack, over the shoulder, down the chest
    for (const sx of [-1, 1]) {
      const x = sx * 0.112;
      let yTop = 0.9;
      while (yTop < 1 && ringAt(yTop)[0] > Math.abs(x) + 0.01) yTop += 0.005;
      const pts = [];
      for (const y of [0.74, 0.8, 0.86, yTop - 0.03]) pts.push([x, y, surfZ(x, y, 1, 0.008)]);
      pts.push([x, yTop + 0.02, ringAt(yTop)[2]]);
      for (const y of [yTop - 0.03, 0.86, 0.78, 0.68, 0.56, 0.46]) pts.push([x, y, surfZ(x, y, -1, 0.008)]);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const c = ringAt(mid[1]);
        const out = nrm([0, mid[1] > yTop - 0.04 ? 0.6 : 0, mid[2] - c[2]]);
        quad(straps, [a[0] - 0.021, a[1], a[2]], [a[0] + 0.021, a[1], a[2]], [b[0] + 0.021, b[1], b[2]], [b[0] - 0.021, b[1], b[2]], out);
      }
    }
    // backpack: rounded box with a lid
    const pack = loft([tr(0.22, 0.12, 0.05, 0.198), tr(0.28, 0.13, 0.06, 0.203), tr(0.7, 0.13, 0.064, 0.206), tr(0.79, 0.118, 0.055, 0.202)], 18, { p: 4, capBottom: true, capTop: true });
    const packLid = loft([tr(0.66, 0.133, 0.067, 0.207), tr(0.82, 0.122, 0.06, 0.203)], 18, { p: 4, capTop: true });

    // ---- head, in head space: +x is where the rider looks ----
    const helmet = sphere(12, 20, 0.145, 0.1375, 0.1325, -0.006, 0.018, 0);
    const peak = sphere(6, 12, 0.04, 0.012, 0.09, 0.118, 0.085, 0);
    const vents = [];
    for (const z of [-0.042, 0, 0.042]) vents.push(...sphere(5, 10, 0.05, 0.006, 0.011, -0.004, 0.152 - Math.abs(z) * 0.35, z));
    const ears = [...sphere(6, 10, 0.05, 0.055, 0.016, -0.012, -0.022, 0.126), ...sphere(6, 10, 0.05, 0.055, 0.016, -0.012, -0.022, -0.126)];
    const gaiter = sphere(8, 14, 0.108, 0.078, 0.104, 0.022, -0.09, 0);
    // goggles wrap around the front of the helmet
    const R = 0.142;
    const goggleArc = (r, h0, h1, aMax, inset) => {
      const rows = [];
      for (const y of [h0, (h0 + h1) / 2, h1]) rows.push({ y, rx: r + (y === (h0 + h1) / 2 ? 0.004 : 0), rz: (r + (y === (h0 + h1) / 2 ? 0.004 : 0)) * 1.04 });
      return loft(rows, 16, { a0: -aMax, a1: aMax, inside: inset });
    };
    const frame = [...goggleArc(R + 0.012, -0.05, 0.042, 1.18), ...goggleArc(R, -0.05, 0.042, 1.18, true)];
    // top and bottom rims of the frame
    for (const y of [-0.05, 0.042]) {
      for (let j = 0; j < 16; j++) {
        const a = -1.18 + (2.36 * j) / 16, b = -1.18 + (2.36 * (j + 1)) / 16;
        const P = (r, ang) => [Math.cos(ang) * r, y, Math.sin(ang) * r * 1.04];
        quad(frame, P(R, a), P(R + 0.012, a), P(R + 0.012, b), P(R, b), [0, y > 0 ? 1 : -1, 0]);
      }
    }
    const lens = goggleArc(R + 0.0135, -0.04, 0.033, 1.02);
    const strap = loft([{ y: -0.018, rx: 0.152, rz: 0.142 }, { y: 0.018, rx: 0.152, rz: 0.142 }], 24);

    // ---- hands: mitt with a thumb and a gauntlet cuff (mitt points along +y) ----
    const mitt = [...sphere(8, 12, 0.05, 0.5, 0.04, 0, 0.5, 0), ...sphere(6, 10, 0.02, 0.22, 0.02, 0.034, 0.36, 0.022)];
    const cuff = loft([{ y: 0, rx: 0.074, rz: 0.07 }, { y: 1, rx: 0.07, rz: 0.066 }], 14, { capTop: true, capBottom: true });

    // ---- feet: boot (toe toward +x), sole, binding plate, highback, straps ----
    const boot = loft([
      { y: 0.0, rx: 0.155, rz: 0.062, ox: 0.02 }, { y: 0.05, rx: 0.162, rz: 0.066, ox: 0.02 }, { y: 0.1, rx: 0.15, rz: 0.064, ox: 0.01 },
      { y: 0.14, rx: 0.11, rz: 0.062, ox: -0.025 }, { y: 0.22, rx: 0.088, rz: 0.06, ox: -0.035 }, { y: 0.28, rx: 0.084, rz: 0.06, ox: -0.035 },
    ], 18, { p: 3, capTop: true });
    const sole = loft([{ y: -0.01, rx: 0.165, rz: 0.069, ox: 0.02 }, { y: 0.025, rx: 0.166, rz: 0.07, ox: 0.02 }], 18, { p: 4, capBottom: true, capTop: true });
    const plate = loft([{ y: 0, rx: 0.15, rz: 0.085, ox: -0.005 }, { y: 0.022, rx: 0.15, rz: 0.085, ox: -0.005 }], 16, { p: 5, capTop: true, capBottom: true });
    const highback = [
      ...loft([{ y: 0.02, rx: 0.1, rz: 0.08, ox: -0.02 }, { y: 0.18, rx: 0.106, rz: 0.084, ox: -0.03 }, { y: 0.34, rx: 0.1, rz: 0.08, ox: -0.05 }], 12, { a0: Math.PI * 0.62, a1: Math.PI * 1.38 }),
      ...loft([{ y: 0.02, rx: 0.088, rz: 0.07, ox: -0.02 }, { y: 0.18, rx: 0.094, rz: 0.074, ox: -0.03 }, { y: 0.34, rx: 0.088, rz: 0.07, ox: -0.05 }], 12, { a0: Math.PI * 0.62, a1: Math.PI * 1.38, inside: true }),
    ];
    // a strap arching over the boot from one side to the other (in the y-z plane, width along x)
    const arch = remap(loft([{ y: -0.5, rx: 1, rz: 1 }, { y: 0.5, rx: 1, rz: 1 }], 12, { a0: 0, a1: Math.PI }), (x, y, z) => [y, z, x]);
    const archIn = remap(loft([{ y: -0.5, rx: 0.86, rz: 0.86 }, { y: 0.5, rx: 0.86, rz: 0.86 }], 12, { a0: 0, a1: Math.PI, inside: true }), (x, y, z) => [y, z, x]);

    // ---- snowboard: sidecut, rounded tips, kicked-up nose and tail ----
    const top = [], side = [], edge = [], base = [], gfx = [], baseGfx = [];
    const NB = 44, HL = 0.79, TH = 0.026;
    const prof = (t) => {
      const at = Math.abs(t);
      let w = 0.148 - 0.022 * (1 - t * t);
      if (at > 0.86) w *= Math.sqrt(Math.max(0, 1 - Math.pow((at - 0.86) / 0.14, 2)));
      const y = at > 0.78 ? 0.11 * Math.pow((at - 0.78) / 0.22, 2) : 0;
      return { w: Math.max(0.004, w), y };
    };
    const rowAt = (t) => { const p = prof(t); return { w: p.w, y: p.y, z: t * HL }; };
    for (let i = 0; i < NB; i++) {
      const t0 = -1 + (2 * i) / NB, t1 = -1 + (2 * (i + 1)) / NB;
      const a = rowAt(t0), b = rowAt(t1);
      const E = 0.006; // steel edge height
      quad(top, [-a.w, a.y + TH, a.z], [-b.w, b.y + TH, b.z], [b.w, b.y + TH, b.z], [a.w, a.y + TH, a.z], [0, 1, 0]);
      quad(base, [-a.w + 0.004, a.y, a.z], [a.w - 0.004, a.y, a.z], [b.w - 0.004, b.y, b.z], [-b.w + 0.004, b.y, b.z], [0, -1, 0]);
      for (const s of [-1, 1]) {
        quad(side, [s * a.w, a.y + E, a.z], [s * b.w, b.y + E, b.z], [s * b.w, b.y + TH, b.z], [s * a.w, a.y + TH, a.z], [s, 0, 0]);
        quad(edge, [s * a.w, a.y, a.z], [s * b.w, b.y, b.z], [s * b.w, b.y + E, b.z], [s * a.w, a.y + E, a.z], [s, 0, 0]);
        quad(edge, [s * a.w, a.y, a.z], [s * (a.w - 0.004), a.y, a.z], [s * (b.w - 0.004), b.y, b.z], [s * b.w, b.y, b.z], [0, -1, 0]);
      }
      // top-sheet pinstripes along both edges, and a base stripe
      for (const s of [-1, 1]) {
        if (Math.abs(t0) < 0.84 && Math.abs(t1) < 0.84) {
          quad(gfx, [s * (a.w - 0.018), a.y + TH + 0.0015, a.z], [s * (a.w - 0.03), a.y + TH + 0.0015, a.z], [s * (b.w - 0.03), b.y + TH + 0.0015, b.z], [s * (b.w - 0.018), b.y + TH + 0.0015, b.z], [0, 1, 0]);
        }
      }
      if (Math.abs(t0) < 0.9 && Math.abs(t1) < 0.9) {
        const k0 = 0.03 + 0.03 * Math.cos(t0 * 2.2), k1 = 0.03 + 0.03 * Math.cos(t1 * 2.2);
        quad(baseGfx, [-k0, a.y - 0.0015, a.z], [k0, a.y - 0.0015, a.z], [k1, b.y - 0.0015, b.z], [-k1, b.y - 0.0015, b.z], [0, -1, 0]);
      }
    }
    // chevrons pointing at the nose and tail, and a diamond logo in the middle
    const onTop = (x, z) => [x, prof(z / HL).y + TH + 0.0018, z];
    for (const dir of [1, -1]) {
      for (const zc of [0.5, 0.57]) {
        const z = zc * dir, tip = 0.075 * dir, th = 0.028 * dir;
        for (const s of [-1, 1]) {
          quad(gfx, onTop(s * 0.1, z), onTop(0, z + tip), onTop(0, z + tip - th), onTop(s * 0.1, z - th), [0, 1, 0]);
        }
      }
    }
    quad(gfx, onTop(0, 0.07), onTop(0.05, 0), onTop(0, -0.07), onTop(-0.05, 0), [0, 1, 0]);

    meshes = {
      cyl: mk(cyl), sph: mk(sph), band: mk(band),
      sleeveUp: mk(sleeveUp), sleeveLo: mk(sleeveLo), thigh: mk(thigh), shin: mk(shin),
      body: mk(body), yoke: mk(yoke), hem: mk(hem), hood: mk(hood), collar: mk(collar), zip: mk(zip), pocket: mk(pocket), straps: mk(straps),
      pack: mk(pack), packLid: mk(packLid),
      helmet: mk(helmet), peak: mk(peak), vents: mk(vents), ears: mk(ears), gaiter: mk(gaiter), frame: mk(frame), lens: mk(lens), strap: mk(strap),
      mitt: mk(mitt), cuff: mk(cuff),
      boot: mk(boot), sole: mk(sole), plate: mk(plate), highback: mk(highback), arch: mk([...arch, ...archIn]),
      top: mk(top), side: mk(side), edge: mk(edge), base: mk(base), gfx: mk(gfx), baseGfx: mk(baseGfx),
    };
  }

  // ------------------------------------------------------------------ helpers
  const M = M4.create();
  const W = M4.create();
  const L = M4.create();
  const TF = M4.create(); // torso frame
  const HF = M4.create(); // head frame
  const FF = M4.create(); // foot frame
  const nearL = [];

  // model matrix that stretches a shape from p0 to p1 (body frame); a scales across (along `side`), b the other way
  function seg(base, p0, p1, a, b, side, out) {
    let yx = p1[0] - p0[0], yy = p1[1] - p0[1], yz = p1[2] - p0[2];
    const len = Math.hypot(yx, yy, yz) || 1e-4;
    yx /= len; yy /= len; yz /= len;
    let sx = side[0], sy = side[1], sz = side[2];
    const d = sx * yx + sy * yy + sz * yz;
    sx -= yx * d; sy -= yy * d; sz -= yz * d;
    let sl = Math.hypot(sx, sy, sz);
    if (sl < 1e-4) { sx = 1; sy = 0; sz = 0; sl = 1; }
    sx /= sl; sy /= sl; sz /= sl;
    const zx = sy * yz - sz * yy, zy = sz * yx - sx * yz, zz = sx * yy - sy * yx;
    L[0] = sx * a; L[1] = sy * a; L[2] = sz * a; L[3] = 0;
    L[4] = yx * len; L[5] = yy * len; L[6] = yz * len; L[7] = 0;
    L[8] = zx * b; L[9] = zy * b; L[10] = zz * b; L[11] = 0;
    L[12] = p0[0]; L[13] = p0[1]; L[14] = p0[2]; L[15] = 1;
    return M4.mul(out || W, base, L);
  }
  // same, but centred between p0 and p1 (for unit shapes centred on the origin)
  function segC(base, p0, p1, a, b, side) {
    const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    return seg(base, m, [m[0] + p1[0] - p0[0], m[1] + p1[1] - p0[1], m[2] + p1[2] - p0[2]], a, b, side);
  }
  function at(base, p, sx, sy, sz, yaw) {
    M4.identity(L);
    M4.translate(L, p[0], p[1], p[2]);
    if (yaw) M4.rotY(L, yaw);
    M4.scale(L, sx, sy, sz);
    return M4.mul(W, base, L);
  }
  const tw = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const SIDE = [0, 0, 1];

  // a limb from p0 to p1 using one of the clothing meshes (radii are already in metres)
  function limb(engine, base, mesh, p0, p1, col, spec, side) {
    engine.drawLit(mesh, seg(base, p0, p1, 1, 1, side || SIDE), col, 0, spec);
  }
  function ball(engine, base, p, r, col, spec) {
    engine.drawLit(meshes.sph, at(base, p, r * 2, r * 2, r * 2), col, 0, spec);
  }

  /*
   * st: { x, y, z, heading, spin, stance, flip, lean, crouch, comp, grab, tuck, slide, air, bail, tumble, tumbleRoll, wind, t }
   */
  SS.drawRider = function (engine, world, st, colorIdx, alpha) {
    if (!meshes) build(engine);
    const pal = PALETTE[((colorIdx % PALETTE.length) + PALETTE.length) % PALETTE.length];
    const a = alpha === undefined ? 1 : alpha;
    engine.setLights(world.nearLamps(st.x, st.z, nearL));
    engine.setLitAlpha(a);
    // far away (or a see-through ghost) gets the lighter version
    const eye = engine.eye;
    const far = a < 1 || Math.hypot(st.x - eye[0], st.z - eye[2]) > 48;

    M4.identity(M);
    M4.translate(M, st.x, st.y, st.z);
    M4.rotY(M, st.heading || 0);
    const t = st.t || 0;
    const mode = st.bail ? 'bail' : st.grab ? 'grab' : st.air ? 'air' : st.slide > 0.3 ? 'slide' : st.tuck ? 'tuck' : 'ride';
    if (st.bail) {
      M4.translate(M, 0, 0.45, 0);
      M4.rotX(M, st.tumble || 0);
      M4.rotZ(M, st.tumbleRoll || 0);
      M4.translate(M, 0, -0.45, 0);
    } else {
      M4.translate(M, 0, 0.9, 0);
      M4.rotY(M, (st.spin || 0) + (st.stance || 0));
      M4.rotX(M, st.flip || 0);
      M4.translate(M, 0, -0.9, 0);
      M4.rotZ(M, -(st.lean || 0));
    }

    // ---- board ----
    engine.drawLit(meshes.top, M, pal.board, 0, SH_BOARD);
    engine.drawLit(meshes.gfx, M, pal.stripe, 0, SH_BOARD);
    engine.drawLit(meshes.base, M, BASE);
    engine.drawLit(meshes.baseGfx, M, pal.board);
    engine.drawLit(meshes.side, M, DARK);
    if (!far) engine.drawLit(meshes.edge, M, STEEL, 0, SH_STEEL);

    // ---- feet: bindings and boots, front foot angled toward the nose, back foot ducked out ----
    const TH = 0.026;
    for (const [fz, yaw] of [[0.25, -0.27], [-0.25, 0.12]]) {
      M4.identity(L);
      M4.translate(L, 0.0, TH, fz);
      M4.rotY(L, yaw);
      M4.mul(FF, M, L);
      engine.drawLit(meshes.plate, FF, BIND);
      if (!far) engine.drawLit(meshes.highback, FF, BIND, 0, SH_BOOT);
      M4.identity(L); M4.translate(L, 0, 0.022, 0);
      const BF = M4.mul(W, FF, L);
      engine.drawLit(meshes.sole, BF, SOLE);
      engine.drawLit(meshes.boot, BF, pal.boot, 0, SH_BOOT);
      if (!far) {
        // ankle strap over the instep and a toe strap
        M4.identity(L); M4.translate(L, 0.0, 0.09, 0); M4.rotZ(L, -0.45); M4.scale(L, 0.07, 0.2, 0.086);
        engine.drawLit(meshes.arch, M4.mul(W, FF, L), pal.board, 0, SH_BOOT);
        M4.identity(L); M4.translate(L, 0.125, 0.06, 0); M4.scale(L, 0.045, 0.1, 0.08);
        engine.drawLit(meshes.arch, M4.mul(W, FF, L), BIND, 0, SH_BOOT);
      }
    }

    // ---- legs ----
    const k = Math.min(1, Math.max(0, (st.crouch || 0) * 0.85 + (st.comp || 0) * 0.6 + (mode === 'tuck' ? 0.2 : 0)));
    const back = mode === 'slide' ? -0.12 : 0;
    const hip = [-0.05 - 0.05 * k + back, 0.93 - 0.38 * k, 0];
    const kneeF = [0.13 + 0.17 * k + back * 0.5, 0.53 - 0.19 * k, 0.23];
    const kneeB = [0.13 + 0.17 * k + back * 0.5, 0.53 - 0.19 * k, -0.22];
    const ankF = [-0.025, 0.2, 0.25], ankB = [-0.025, 0.2, -0.25];
    for (const [ank, knee, hz] of [[ankF, kneeF, 0.115], [ankB, kneeB, -0.115]]) {
      const hp = add(hip, [0, -0.02, hz]);
      limb(engine, M, meshes.shin, ank, knee, pal.pants, SH_PANTS);
      limb(engine, M, meshes.thigh, knee, hp, pal.pants, SH_PANTS);
      ball(engine, M, knee, 0.094, pal.pants, SH_PANTS);
      // reinforced knee patch on the front of the knee
      if (!far) {
        const dir = nrm(sub(knee, ank));
        const fwd = nrm(cross(dir, [0, 0, 1]));
        const kp = add(knee, [fwd[0] * 0.074 - dir[0] * 0.03, fwd[1] * 0.074 - dir[1] * 0.03, 0]);
        engine.drawLit(meshes.sph, segC(M, add(kp, [-dir[0] * 0.07, -dir[1] * 0.07, 0]), add(kp, [dir[0] * 0.07, dir[1] * 0.07, 0]), 0.13, 0.06, [0, 0, 1]), pal.pantsPatch, 0, SH_PANTS);
      }
    }
    // seat
    engine.drawLit(meshes.sph, at(M, add(hip, [-0.01, -0.03, 0]), 0.29, 0.25, 0.37), pal.pants, 0, SH_PANTS);

    // ---- upper body (twisted toward the nose, more with a spin wind-up) ----
    let twist = -0.42 + (st.wind || 0) * 0.5;
    if (mode === 'tuck') twist = -0.75;
    const lean = mode === 'tuck' ? 0.18 : mode === 'slide' ? -0.1 : 0;
    const sh = add(hip, tw([0.1 + 0.15 * k + lean, 0.53 - 0.06 * k, 0.02], twist));
    const waist = add(hip, tw([-0.005, -0.03, 0], twist));
    const neck = add(sh, tw([0.012, 0.11, 0], twist));
    const across = tw([0, 0, 1], twist);
    seg(M, waist, neck, 1, 1, across, TF);
    engine.drawLit(meshes.body, TF, pal.jacket, 0, SH_JACKET);
    engine.drawLit(meshes.yoke, TF, pal.trim, 0, SH_JACKET);
    engine.drawLit(meshes.hem, TF, pal.trim, 0, SH_JACKET);
    engine.drawLit(meshes.collar, TF, pal.jacket, 0, SH_JACKET);
    engine.drawLit(meshes.hood, TF, pal.jacket, 0, SH_JACKET);
    engine.drawLit(meshes.pack, TF, PACK, 0, SH_JACKET);
    if (!far) {
      engine.drawLit(meshes.packLid, TF, pal.trim, 0, SH_JACKET);
      engine.drawLit(meshes.zip, TF, ZIP, 0, SH_STEEL);
      engine.drawLit(meshes.pocket, TF, pal.trim, 0, SH_JACKET);
      engine.drawLit(meshes.straps, TF, DARK, 0, SH_JACKET);
    }

    // ---- head ----
    const head = add(sh, tw([0.05, 0.25, 0], twist));
    M4.identity(L);
    M4.translate(L, head[0], head[1], head[2]);
    M4.rotY(L, twist);
    M4.mul(HF, M, L);
    engine.drawLit(meshes.gaiter, HF, pal.trim, 0, SH_PANTS);
    engine.drawLit(meshes.helmet, HF, pal.helmet, 0, SH_HELMET);
    engine.drawLit(meshes.strap, HF, pal.jacket, 0, SH_JACKET);
    engine.drawLit(meshes.frame, HF, DARK, 0, SH_HELMET);
    engine.drawLit(meshes.lens, HF, pal.lens, 0.3, SH_LENS);
    if (!far) {
      engine.drawLit(meshes.peak, HF, pal.helmet, 0, SH_HELMET);
      engine.drawLit(meshes.vents, HF, DARK, 0, SH_HELMET);
      engine.drawLit(meshes.ears, HF, pal.helmetDark, 0, SH_PANTS);
    }

    // ---- arms ----
    const sf = add(sh, tw([0, -0.04, 0.205], twist)), sb = add(sh, tw([0, -0.04, -0.205], twist));
    const sway = Math.sin(t * 2.6) * 0.03;
    const carve = st.lean || 0;
    let ef, hf, eb, hb;
    switch (mode) {
      case 'bail': {
        const f = Math.sin(t * 13) * 0.15;
        ef = add(sf, [0.05, 0.22 + f, 0.18]); hf = add(ef, [0.05, 0.26 - f, 0.17]);
        eb = add(sb, [0.05, 0.22 - f, -0.18]); hb = add(eb, [0.05, 0.26 + f, -0.17]);
        break;
      }
      case 'grab': {
        ef = add(sf, tw([0.2, -0.24, 0.06], twist)); hf = [0.2, 0.2, 0.13];
        eb = add(sb, tw([0.02, 0.12, -0.24], twist)); hb = add(eb, tw([0.05, 0.24, -0.17], twist));
        break;
      }
      case 'air':
        ef = add(sf, tw([0.08, 0.02, 0.28], twist)); hf = add(ef, tw([0.08, 0.12, 0.26], twist));
        eb = add(sb, tw([0.06, 0.02, -0.26], twist)); hb = add(eb, tw([0.06, 0.13, -0.25], twist));
        break;
      case 'tuck':
        ef = add(sf, tw([0.22, -0.2, 0.05], twist)); hf = mix(kneeF, ef, 0.3); hf[0] += 0.1; hf[1] += 0.08;
        eb = add(sb, tw([0.22, -0.2, -0.02], twist)); hb = mix(kneeB, eb, 0.3); hb[0] += 0.1; hb[1] += 0.1;
        break;
      case 'slide':
        ef = add(sf, tw([0.22, -0.1, 0.22], twist)); hf = add(ef, tw([0.21, -0.05, 0.23], twist));
        eb = add(sb, tw([0.2, -0.12, -0.1], twist)); hb = add(eb, tw([0.23, -0.05, -0.05], twist));
        break;
      default:
        ef = add(sf, tw([0.12, -0.2 + sway - carve * 0.12, 0.23], twist)); hf = add(ef, tw([0.15, -0.17 - sway - carve * 0.15, 0.3], twist));
        eb = add(sb, tw([0.07, -0.23 - sway + carve * 0.1, -0.17], twist)); hb = add(eb, tw([0.11, -0.28 + sway + carve * 0.12, -0.23], twist));
    }
    for (const [s0, e0, h0] of [[sf, ef, hf], [sb, eb, hb]]) {
      ball(engine, M, s0, 0.088, pal.jacket, SH_JACKET);
      limb(engine, M, meshes.sleeveUp, s0, e0, pal.jacket, SH_JACKET);
      ball(engine, M, e0, 0.07, pal.jacket, SH_JACKET);
      // forearm stops short of the hand; the cuff and mitt cover the wrist
      const dir = nrm(sub(h0, e0));
      const wrist = add(h0, [-dir[0] * 0.03, -dir[1] * 0.03, -dir[2] * 0.03]);
      limb(engine, M, meshes.sleeveLo, e0, wrist, pal.jacket, SH_JACKET);
      const tip = add(h0, [dir[0] * 0.12, dir[1] * 0.12, dir[2] * 0.12]);
      const palmSide = nrm(cross(dir, [0, 1, 0]));
      if (!far) {
        const c1 = add(wrist, [dir[0] * 0.05, dir[1] * 0.05, dir[2] * 0.05]);
        engine.drawLit(meshes.cuff, seg(M, wrist, c1, 1, 1, palmSide), pal.trim, 0, SH_JACKET);
      }
      engine.drawLit(meshes.mitt, seg(M, add(h0, [-dir[0] * 0.02, -dir[1] * 0.02, -dir[2] * 0.02]), tip, 1, 1, palmSide), pal.glove, 0, SH_BOOT);
    }
    engine.setLitAlpha(1);
  };

  // glowing snowflake token
  SS.drawToken = function (engine, x, y, z, t) {
    if (!meshes) build(engine);
    M4.identity(M);
    M4.translate(M, x, y + Math.sin(t * 2.2 + x) * 0.12, z);
    M4.rotY(M, t * 2.4 + z * 0.3);
    M4.rotX(M, Math.PI / 2);
    M4.scale(M, 0.78, 0.07, 0.78);
    engine.drawLit(meshes.cyl, M, [0.25, 0.8, 1.0], 1.6);
    M4.scale(M, 0.55, 1.6, 0.55);
    engine.drawLit(meshes.cyl, M, [0.9, 0.98, 1.0], 1.2);
  };

  const S = M4.create();
  SS.drawShadow = function (engine, world, x, z, heading, height, alpha) {
    const gy = world.Hk(x, z);
    const e = 0.5;
    const gx = (world.Hk(x + e, z) - world.Hk(x - e, z)) / (2 * e);
    const gz = (world.Hk(x, z + e) - world.Hk(x, z - e)) / (2 * e);
    M4.identity(S);
    M4.translate(S, x, Math.max(gy, world.H(x, z)) + 0.05, z);
    M4.rotX(S, -Math.atan(gz));
    M4.rotZ(S, Math.atan(gx));
    M4.rotY(S, heading);
    const k = Math.max(0.3, 1 - height * 0.08);
    M4.scale(S, 0.45 * k, 1, 1.0 * k);
    engine.drawBaked(engine.disc, S, 0.5 * k * (alpha === undefined ? 1 : alpha));
  };
})();
