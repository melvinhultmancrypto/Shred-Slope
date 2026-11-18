/*
 * Shred Slope: the snowboarder.
 * A detailed, posed model built once from lofted shapes: jacket with a colour-blocked yoke, side
 * panels, arm stripes, reflective wrist bands, hood with drawcords, zip, pocket and chest patch;
 * baggy pants with knee patches, cargo pockets and hem stripes; laced boots in strap bindings with
 * ratchets and highbacks; five-finger gloves with cuffs; a backpack with straps and a shovel; and a
 * helmet with a stripe, vents, ear pads, goggles and a strap.
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
  // style per outfit: 1 plaid flannel, 2 camo, 3 colour-block; some ride in a beanie
  const STYLES = [
    { pat: 1, patCol: '#10261a', beanie: true }, { pat: 3, patCol: '#2a3142' }, { pat: 0 }, { pat: 2, patCol: '#ffc7da' },
    { pat: 3, patCol: '#2b2d33', beanie: true }, { pat: 1, patCol: '#1a0f30' }, { pat: 0, beanie: true }, { pat: 1, patCol: '#141414', beanie: true },
    { pat: 2, patCol: '#a9b4c9' }, { pat: 3, patCol: '#1d3010' },
  ];
  const SKINS = ['#f0c4a0', '#8d5a3b', '#e3a982', '#c98e66', '#5c3a26', '#f5cfb3', '#b07a52', '#f2c9a8', '#6e4630', '#deaa85'];
  const HAIRS = ['#2b1d14', '#1a1a1a', '#d8b06a', '#6b3a1f', '#111111', '#a0522d', '#2b1d14', '#e0c27a', '#1a1a1a', '#4a2c1a'];
  PALETTE.forEach((p, i) => { p.skin = SKINS[i % SKINS.length]; p.hair = HAIRS[i % HAIRS.length]; Object.assign(p, STYLES[i % STYLES.length]); });
  for (const p of PALETTE) {
    for (const k of ['jacket', 'trim', 'pants', 'board', 'stripe', 'helmet', 'lens', 'boot', 'skin', 'hair']) p[k] = hex(p[k]);
    p.patCol = p.patCol ? hex(p.patCol) : p.trim;
    // knit beanie in the jacket's accent colour
    p.beanieCol = shade(p.trim[0] + p.trim[1] + p.trim[2] > 1.5 ? p.trim : p.jacket, 0.95);
    p.yoke = [p.jacket[0] * 0.68 + p.trim[0] * 0.32, p.jacket[1] * 0.68 + p.trim[1] * 0.32, p.jacket[2] * 0.68 + p.trim[2] * 0.32];
    p.lips = [p.skin[0] * 0.84, p.skin[1] * 0.64, p.skin[2] * 0.62];
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
  const PATCH = [0.92, 0.93, 0.95];
  const REFLECT = [0.78, 0.8, 0.84];
  const SHOVEL = [0.95, 0.42, 0.1];
  const LACE = [0.86, 0.85, 0.8];

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
  function loft(rings, segs0, opts) {
    const segs = Math.round(segs0 * 1.4); // smoother silhouettes
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
  const sphere = (n, s, rx, ry, rz, cx, cy, cz) => loft(sphereRings(Math.round(n * 1.3), rx, ry, rz, cx, cy, cz), s);

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
    // baggy fit: roomy sleeves, wide pants that stack over the boots
    const sleeveUp = loft([{ y: 0, rx: 0.079, rz: 0.079 }, { y: 0.3, rx: 0.086, rz: 0.084 }, { y: 0.75, rx: 0.079, rz: 0.077 }, { y: 1, rx: 0.071, rz: 0.07 }], 14);
    const sleeveLo = loft([{ y: 0, rx: 0.071, rz: 0.07 }, { y: 0.45, rx: 0.074, rz: 0.071 }, { y: 0.85, rx: 0.068, rz: 0.066 }, { y: 1, rx: 0.07, rz: 0.068 }], 14);
    const thigh = loft([{ y: 0, rx: 0.098, rz: 0.098 }, { y: 0.35, rx: 0.112, rz: 0.109 }, { y: 0.8, rx: 0.118, rz: 0.115 }, { y: 1, rx: 0.11, rz: 0.11 }], 16);
    const shin = loft([{ y: 0, rx: 0.136, rz: 0.12 }, { y: 0.07, rx: 0.13, rz: 0.115 }, { y: 0.22, rx: 0.114, rz: 0.104 }, { y: 0.55, rx: 0.1, rz: 0.096 }, { y: 1, rx: 0.097, rz: 0.095 }], 20, { capBottom: true });

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
    const pack = loft([tr(0.24, 0.1, 0.044, 0.196), tr(0.3, 0.115, 0.056, 0.201), tr(0.66, 0.118, 0.06, 0.204), tr(0.76, 0.104, 0.05, 0.2)], 18, { p: 3, capBottom: true, capTop: true });
    const packLid = loft([tr(0.62, 0.121, 0.063, 0.205), tr(0.78, 0.108, 0.055, 0.2)], 18, { p: 3, capTop: true });

    // ---- head, in head space: +x is where the rider looks ----
    const helmet = sphere(12, 20, 0.145, 0.1375, 0.1325, -0.006, 0.018, 0);
    const peak = sphere(6, 12, 0.04, 0.012, 0.09, 0.118, 0.085, 0);
    const vents = [];
    for (const z of [-0.042, 0, 0.042]) vents.push(...sphere(5, 10, 0.05, 0.006, 0.011, -0.004, 0.152 - Math.abs(z) * 0.35, z));
    const ears = [...sphere(6, 10, 0.05, 0.055, 0.016, -0.012, -0.022, 0.126), ...sphere(6, 10, 0.05, 0.055, 0.016, -0.012, -0.022, -0.126)];
    // face below the goggles: cheeks, nose, lips and chin; a neck gaiter pulled down; hair out the back
    const face = sphere(12, 18, 0.098, 0.082, 0.088, 0.03, -0.075, 0);
    const nose = sphere(8, 10, 0.019, 0.019, 0.0125, 0.125, -0.066, 0);
    const lips = sphere(6, 10, 0.008, 0.0068, 0.026, 0.118, -0.104, 0);
    const gaiter = [...sphere(10, 16, 0.098, 0.055, 0.098, -0.004, -0.17, 0), ...loft([{ y: -0.2, rx: 0.088, rz: 0.088, ox: -0.006 }, { y: -0.14, rx: 0.094, rz: 0.094, ox: -0.004 }], 16)];
    // knit beanie: a slouchy cap, a folded cuff and a pom-pom
    const beanie = sphere(12, 20, 0.143, 0.15, 0.135, -0.014, 0.03, 0);
    const beanieCuff = loft([{ y: -0.035, rx: 0.15, rz: 0.142, ox: -0.004 }, { y: 0.02, rx: 0.152, rz: 0.144, ox: -0.006 }, { y: 0.03, rx: 0.147, rz: 0.139, ox: -0.006 }], 20);
    const pom = sphere(8, 12, 0.045, 0.042, 0.045, -0.035, 0.185, 0);
    const hair = [...sphere(8, 12, 0.055, 0.07, 0.105, -0.108, -0.07, 0), ...sphere(6, 10, 0.034, 0.075, 0.034, -0.148, -0.13, 0)];
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
    // glove: padded back of the hand, four curled fingers and a thumb (hand space: y 0..1 = wrist..fingertips)
    const mitt = [...sphere(8, 12, 0.047, 0.32, 0.032, 0, 0.32, 0)];
    for (let i = 0; i < 4; i++) {
      const x = -0.03 + i * 0.02, lenK = [0.9, 1, 0.96, 0.82][i];
      const rows = [];
      for (let j = 0; j <= 4; j++) {
        const u = j / 4;
        rows.push({ y: 0.5 + u * 0.46 * lenK, rx: 0.0105 - u * 0.0015, rz: 0.0115 - u * 0.0015, ox: x, oz: -0.016 * u * u });
      }
      mitt.push(...loft(rows, 8, { capTop: true }));
    }
    mitt.push(...loft([{ y: 0.18, rx: 0.012, rz: 0.012, ox: 0.036, oz: -0.012 }, { y: 0.42, rx: 0.011, rz: 0.011, ox: 0.05, oz: -0.024 }, { y: 0.62, rx: 0.009, rz: 0.009, ox: 0.05, oz: -0.03 }], 8, { capTop: true }));
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

    // ---- extra detail ----
    // cargo pocket with a flap on the outside of the thigh (thigh space: knee 0 -> hip 1, outside is +x)
    const thighPocket = loft([{ y: 0.3, rx: 0.026, rz: 0.05, ox: 0.11 }, { y: 0.33, rx: 0.03, rz: 0.055, ox: 0.112 }, { y: 0.58, rx: 0.031, rz: 0.057, ox: 0.114 }, { y: 0.6, rx: 0.028, rz: 0.053, ox: 0.112 }], 14, { p: 4, capBottom: true, capTop: true });
    const thighFlap = loft([{ y: 0.56, rx: 0.034, rz: 0.06, ox: 0.115 }, { y: 0.64, rx: 0.03, rz: 0.058, ox: 0.116 }], 14, { p: 4, capBottom: true, capTop: true });
    // stripes: around the hem of the pants, the upper arm, and a reflective one at the wrist
    const shinBand = loft([{ y: 0.12, rx: 0.125, rz: 0.112 }, { y: 0.17, rx: 0.12, rz: 0.108 }], 20);
    const armBand = loft([{ y: 0.36, rx: 0.088, rz: 0.086 }, { y: 0.48, rx: 0.087, rz: 0.085 }], 14);
    const wristBand = loft([{ y: 0.76, rx: 0.071, rz: 0.069 }, { y: 0.83, rx: 0.07, rz: 0.068 }], 14);
    // jacket side panels, hood drawcords with toggles, a chest patch (torso space)
    const sidePanels = [];
    for (const c of [0, Math.PI]) {
      sidePanels.push(...loft(TR.slice(0, 4).map(([y, rx, rz, oz]) => ({ y, rx: rx + 0.003, rz: rz + 0.003, oz })), 6, { p: TP, a0: c - 0.32, a1: c + 0.32 }));
    }
    const cords = [], toggles = [];
    for (const sx of [-1, 1]) {
      const x0 = sx * 0.035, x1 = sx * 0.044;
      const A = [x0, 0.94, surfZ(x0, 0.94, -1, 0.01)], B = [x1, 0.8, surfZ(x1, 0.8, -1, 0.008)];
      quad(cords, [A[0] - 0.003, A[1], A[2]], [A[0] + 0.003, A[1], A[2]], [B[0] + 0.003, B[1], B[2]], [B[0] - 0.003, B[1], B[2]], [0, 0, -1]);
      toggles.push(...sphere(5, 8, 0.008, 0.028, 0.008, x1, 0.775, surfZ(x1, 0.78, -1, 0.012)));
    }
    const logo = [], logoStripe = [];
    quad(logo, pk(-0.145, 0.6, 0.004), pk(-0.065, 0.6, 0.004), pk(-0.065, 0.67, 0.004), pk(-0.145, 0.67, 0.004), [0, 0, -1]);
    quad(logoStripe, pk(-0.14, 0.62, 0.006), pk(-0.07, 0.62, 0.006), pk(-0.07, 0.64, 0.006), pk(-0.14, 0.64, 0.006), [0, 0, -1]);
    // backpack: two compression straps, a grab loop and a shovel handle poking out of the top
    const packStraps = [
      ...loft([tr(0.4, 0.121, 0.063, 0.205), tr(0.43, 0.121, 0.063, 0.205)], 18, { p: 3 }),
      ...loft([tr(0.54, 0.122, 0.063, 0.206), tr(0.57, 0.122, 0.063, 0.206)], 18, { p: 3 }),
      ...remap(loft([{ y: -0.012, rx: 0.03, rz: 0.06 }, { y: 0.012, rx: 0.03, rz: 0.06 }], 10, { a0: 0, a1: Math.PI }), (x, y, z) => [x, 0.79 + z, 0.2 + y]),
    ];
    const shovel = [
      ...loft([{ y: 0.74, rx: 0.011, rz: 0.011, ox: 0.055, oz: 0.212 }, { y: 0.93, rx: 0.011, rz: 0.011, ox: 0.057, oz: 0.216 }], 8, { capTop: true }),
      ...remap(loft([{ y: -0.04, rx: 0.012, rz: 0.012 }, { y: 0.04, rx: 0.012, rz: 0.012 }], 8, { capTop: true, capBottom: true }), (x, y, z) => [0.057 + y, 0.94 + z * 0.4, 0.216 + x]),
    ];
    // boot: a tongue up the front with laces across it (boot space, toe +x)
    const tongue = loft([{ y: 0.12, rx: 0.02, rz: 0.034, ox: 0.07 }, { y: 0.2, rx: 0.022, rz: 0.036, ox: 0.052 }, { y: 0.3, rx: 0.022, rz: 0.036, ox: 0.046 }], 10, { p: 4, capTop: true });
    const laces = [];
    for (const y of [0.15, 0.19, 0.23, 0.27]) {
      const x = 0.072 - (y - 0.15) * 0.22 + 0.016;
      quad(laces, [x, y, -0.036], [x + 0.004, y + 0.012, -0.036], [x + 0.004, y + 0.03, 0.036], [x, y + 0.018, 0.036], [1, 0.2, 0]);
      quad(laces, [x, y + 0.018, -0.036], [x + 0.004, y + 0.03, -0.036], [x + 0.004, y + 0.012, 0.036], [x, y, 0.036], [1, 0.2, 0]);
    }
    // stomp pad between the bindings and ratchet buckles on the straps (board / foot space)
    const stomp = [];
    for (let i = 0; i < 5; i++) {
      const z = -0.05 + i * 0.025;
      stomp.push(...loft([{ y: TH, rx: 0.07, rz: 0.006, oz: z }, { y: TH + 0.007, rx: 0.068, rz: 0.005, oz: z }], 8, { p: 4, capTop: true }));
    }
    const ratchet = loft([{ y: 0, rx: 0.016, rz: 0.012 }, { y: 0.02, rx: 0.015, rz: 0.011 }], 8, { p: 4, capTop: true, capBottom: true });
    // a stripe over the top of the helmet, front to back (head space)
    const helmetStripe = remap(loft([{ y: -0.022, rx: 0.149, rz: 0.141, ox: -0.006 }, { y: 0.022, rx: 0.149, rz: 0.141, ox: -0.006 }], 18, { a0: 0.55, a1: Math.PI + 0.3 }), (x, y, z) => [x, z + 0.018, y]);

    meshes = {
      thighPocket: mk(thighPocket), thighFlap: mk(thighFlap), shinBand: mk(shinBand), armBand: mk(armBand), wristBand: mk(wristBand),
      sidePanels: mk(sidePanels), cords: mk(cords), toggles: mk(toggles), logo: mk(logo), logoStripe: mk(logoStripe),
      packStraps: mk(packStraps), shovel: mk(shovel), tongue: mk(tongue), laces: mk(laces), stomp: mk(stomp), ratchet: mk(ratchet), helmetStripe: mk(helmetStripe),
      cyl: mk(cyl), sph: mk(sph), band: mk(band),
      sleeveUp: mk(sleeveUp), sleeveLo: mk(sleeveLo), thigh: mk(thigh), shin: mk(shin),
      body: mk(body), yoke: mk(yoke), hem: mk(hem), hood: mk(hood), collar: mk(collar), zip: mk(zip), pocket: mk(pocket), straps: mk(straps),
      pack: mk(pack), packLid: mk(packLid),
      helmet: mk(helmet), peak: mk(peak), vents: mk(vents), ears: mk(ears), gaiter: mk(gaiter), face: mk(face), nose: mk(nose), lips: mk(lips), hair: mk(hair), beanie: mk(beanie), beanieCuff: mk(beanieCuff), pom: mk(pom), frame: mk(frame), lens: mk(lens), strap: mk(strap),
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
  const SIDE = [0, 0, 1], SIDE_B = [0, 0, -1];

  // a limb from p0 to p1 using one of the clothing meshes (radii are already in metres)
  function limb(engine, base, mesh, p0, p1, col, spec, side) {
    engine.drawLit(mesh, seg(base, p0, p1, 1, 1, side || SIDE), col, 0, spec);
  }
  function ball(engine, base, p, r, col, spec) {
    engine.drawLit(meshes.sph, at(base, p, r * 2, r * 2, r * 2), col, 0, spec);
  }

  // ------------------------------------------------------------------ posing
  // Grab poses: which hand (1 = front/nose side, -1 = back), the point on the board it holds
  // (board frame), and how the board is tweaked: [dx, dy, pitch, roll, yaw]. Order matches game.js GRABS.
  const GRAB_POSES = [
    { hand: 1, pt: [-0.15, 0.03, 0.06], tw: [-0.16, 0.24, 0.05, -0.85, 0.15] },  // METHOD: heel edge, board pulled up behind
    { hand: -1, pt: [0.15, 0.03, -0.04], tw: [0.03, 0.26, 0, 0.3, 0] },          // INDY: back hand, toe edge
    { hand: 1, pt: [0.15, 0.03, 0.08], tw: [0.03, 0.26, 0, 0.3, 0.15] },         // MUTE: front hand, toe edge
    { hand: 1, pt: [-0.15, 0.03, 0.1], tw: [-0.1, 0.24, 0, -0.5, 0] },           // MELON: front hand, heel edge
    { hand: -1, pt: [-0.15, 0.03, -0.1], tw: [-0.12, 0.24, 0, -0.55, 0] },       // STALEFISH: back hand, heel edge
    { hand: 1, pt: [0, 0.05, 0.62], tw: [0.06, 0.24, -0.55, 0, 0] },             // NOSE GRAB: front hand, nose up
    { hand: -1, pt: [0, 0.05, -0.62], tw: [0.06, 0.24, 0.55, 0, 0] },            // TAIL GRAB: back hand, tail up
    { hand: 1, pt: [0.15, 0.03, 0.34], tw: [-0.2, 0.3, 0.3, 0.95, -0.25] },      // JAPAN: board tweaked hard behind
  ];
  const LEG_T = 0.42, LEG_S = 0.37, ARM_U = 0.29, ARM_F = 0.28;
  const BT = M4.create(); // board tweak relative to the body
  const BM = M4.create(); // board frame
  const PT = [0, 0, 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);

  // two-bone reach: joint position between a and b, bending toward `bend`
  function ik(a, b, l1, l2, bend) {
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const d = Math.hypot(dx, dy, dz) || 1e-4;
    dx /= d; dy /= d; dz /= d;
    const dc = Math.min(d, l1 + l2 - 1e-3);
    const along = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    let bx = bend[0], by = bend[1], bz = bend[2];
    const p = bx * dx + by * dy + bz * dz;
    bx -= dx * p; by -= dy * p; bz -= dz * p;
    const bl = Math.hypot(bx, by, bz) || 1;
    return [a[0] + dx * along + (bx / bl) * h, a[1] + dy * along + (by / bl) * h, a[2] + dz * along + (bz / bl) * h];
  }
  // pull a target back within reach of a limb rooted at a
  function reach(a, b, max) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = len3(d);
    if (l <= max) return b;
    const k = max / l;
    return [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];
  }
  const boardPt = (p) => { M4.point(BT, p[0], p[1], p[2], PT); return [PT[0], PT[1], PT[2]]; };

  /*
   * st: { x, y, z, heading, spin, stance, flip, lean, crouch, comp, grab, grabK, grabType, tuck, slide, air, airT,
   *       spinV, flipV, bail, tumble, tumbleRoll, wind, t }
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
    if (st.wallRoll) M4.rotZ(M, st.wallRoll); // standing square to a halfpipe wall
    M4.rotY(M, st.heading || 0);
    const t = st.t || 0;
    const air = !!st.air && !st.bail;
    const mode = st.bail ? 'bail' : air ? 'air' : st.slide > 0.3 ? 'slide' : st.tuck ? 'tuck' : 'ride';
    // crash: tumbling (bk), flat on the snow, then getting up (bu)
    const bk = st.bail ? clamp(st.bailK || 0, 0, 1) : 0;
    const bu = st.bail ? clamp(st.bailUp || 0, 0, 1) : 0;
    const lieSide = (st.tumbleRoll || 0) >= 0 ? 1 : -1;
    if (st.bail) {
      // turn about the middle of the body; the lower it lies, the lower that middle sits
      const tu = st.tumble || 0, ro = st.tumbleRoll || 0;
      const upY = Math.cos(tu) * Math.cos(ro);
      const piv = 0.82;
      M4.translate(M, 0, piv * Math.abs(upY) + 0.2 * (1 - Math.abs(upY)), 0);
      M4.rotX(M, tu);
      M4.rotZ(M, ro);
      M4.translate(M, 0, -piv, 0);
    } else {
      M4.translate(M, 0, 0.8, 0);
      M4.rotY(M, (st.spin || 0) + (st.stance || 0));
      M4.rotX(M, st.flip || 0);
      M4.translate(M, 0, -0.8, 0);
      M4.rotZ(M, -(st.lean || 0));
    }

    // ---- how the body moves: crouch, pop, tuck, grab ----
    const spinV = air ? clamp(st.spinV || 0, -1, 1) : 0;
    const flipV = air ? clamp(st.flipV || 0, -1, 1) : 0;
    const gk = air ? clamp(st.grabK !== undefined ? st.grabK : st.grab ? 1 : 0, 0, 1) : 0;
    const G = GRAB_POSES[(st.grabType | 0) % GRAB_POSES.length];
    const airT = st.airT || 0;
    // pop: legs snap straight off the lip, then the knees come up
    const ext = air && airT < 0.24 ? Math.sin((airT / 0.24) * Math.PI) : 0;
    const tuckAir = air ? clamp(0.28 + 0.3 * Math.abs(spinV) + 0.65 * Math.abs(flipV), 0, 1) * (1 - ext) * clamp(airT / 0.3, 0, 1) : 0;
    let k = clamp((st.crouch || 0) * 0.85 + (st.comp || 0) * 0.6 + (mode === 'tuck' ? 0.2 : 0), 0, 1);
    if (air) k = 0.2 - ext * 0.15;
    // balled up while tumbling, loose when flat, then a deep squat to stand up
    if (st.bail) k = bu > 0 ? lerp(0.95, 0.25, bu * bu * (3 - 2 * bu)) : lerp(0.3, 0.85, bk);
    const back = mode === 'slide' ? -0.12 : 0;
    const hip = [-0.05 - 0.05 * k + back, 0.93 - 0.38 * k, 0];

    // board tweak relative to the body
    M4.identity(BT);
    M4.translate(BT, G.tw[0] * gk, tuckAir * 0.26 + G.tw[1] * gk - ext * 0.06 + 0.16 * bk, 0);
    M4.rotX(BT, G.tw[2] * gk - ext * 0.22 + flipV * 0.1);
    M4.rotZ(BT, G.tw[3] * gk);
    M4.rotY(BT, G.tw[4] * gk);
    M4.mul(BM, M, BT);

    // ---- board ----
    engine.drawLit(meshes.top, BM, pal.board, 0, SH_BOARD);
    engine.drawLit(meshes.gfx, BM, pal.stripe, 0, SH_BOARD);
    engine.drawLit(meshes.base, BM, BASE);
    engine.drawLit(meshes.baseGfx, BM, pal.board);
    engine.drawLit(meshes.side, BM, DARK);
    if (!far) { engine.drawLit(meshes.edge, BM, STEEL, 0, SH_STEEL); engine.drawLit(meshes.stomp, BM, DARK, 0, SH_BOOT); }

    // ---- feet: bindings and boots, front foot angled toward the nose, back foot ducked out ----
    const TH = 0.026;
    for (const [fz, yaw] of [[0.25, -0.27], [-0.25, 0.12]]) {
      M4.identity(L);
      M4.translate(L, 0.0, TH, fz);
      M4.rotY(L, yaw);
      M4.mul(FF, BM, L);
      engine.drawLit(meshes.plate, FF, BIND);
      if (!far) engine.drawLit(meshes.highback, FF, BIND, 0, SH_BOOT);
      M4.identity(L); M4.translate(L, 0, 0.022, 0);
      const BF = M4.mul(W, FF, L);
      engine.drawLit(meshes.sole, BF, SOLE);
      engine.cloth(0, null, 0, 0.35, 0);
      engine.drawLit(meshes.boot, BF, pal.boot, 0, SH_BOOT);
      engine.cloth(0);
      if (!far) {
        engine.drawLit(meshes.tongue, BF, pal.trim, 0, SH_BOOT);
        engine.drawLit(meshes.laces, BF, LACE, 0, SH_PANTS);
        M4.identity(L); M4.translate(L, 0.01, 0.1, 0.094);
        engine.drawLit(meshes.ratchet, M4.mul(W, FF, L), STEEL, 0, SH_STEEL);
        // ankle strap over the instep and a toe strap
        M4.identity(L); M4.translate(L, 0.0, 0.09, 0); M4.rotZ(L, -0.45); M4.scale(L, 0.07, 0.2, 0.086);
        engine.drawLit(meshes.arch, M4.mul(W, FF, L), pal.board, 0, SH_BOOT);
        M4.identity(L); M4.translate(L, 0.125, 0.06, 0); M4.scale(L, 0.045, 0.1, 0.08);
        engine.drawLit(meshes.arch, M4.mul(W, FF, L), BIND, 0, SH_BOOT);
      }
    }

    // ---- legs: knees found from the hips and the boots ----
    const ankF = boardPt([-0.025, 0.2, 0.25]), ankB = boardPt([-0.025, 0.2, -0.25]);
    const knees = [];
    for (const [ank, hz] of [[ankF, 0.115], [ankB, -0.115]]) {
      const hp = add(hip, [0, -0.02, hz]);
      const knee = ik(ank, hp, LEG_S, LEG_T, [1, 0.1, hz * 2.4]);
      knees.push(knee);
      engine.cloth(0, null, 1.1, 0.55, 1);
      limb(engine, M, meshes.shin, ank, knee, pal.pants, SH_PANTS);
      engine.cloth(0, null, 0.9, 0.06, 1);
      limb(engine, M, meshes.thigh, knee, hp, pal.pants, SH_PANTS);
      engine.cloth(0);
      if (!far) {
        const out = hz > 0 ? SIDE : SIDE_B;
        limb(engine, M, meshes.thighPocket, knee, hp, pal.pants, SH_PANTS, out);
        limb(engine, M, meshes.thighFlap, knee, hp, pal.pantsPatch, SH_PANTS, out);
        limb(engine, M, meshes.shinBand, ank, knee, pal.pantsPatch, SH_PANTS);
      }
      ball(engine, M, knee, 0.104, pal.pants, SH_PANTS);
      if (!far) {
        // reinforced knee patch on the front of the knee
        const dir = nrm(sub(knee, ank));
        const fwd = nrm(sub(knee, mix(ank, hp, 0.5)));
        const kp = add(knee, [fwd[0] * 0.074 - dir[0] * 0.03, fwd[1] * 0.074 - dir[1] * 0.03, fwd[2] * 0.074 - dir[2] * 0.03]);
        engine.drawLit(meshes.sph, segC(M, add(kp, [-dir[0] * 0.07, -dir[1] * 0.07, -dir[2] * 0.07]), add(kp, [dir[0] * 0.07, dir[1] * 0.07, dir[2] * 0.07]), 0.13, 0.06, [0, 0, 1]), pal.pantsPatch, 0, SH_PANTS);
      }
    }
    // seat
    engine.drawLit(meshes.sph, at(M, add(hip, [-0.01, -0.03, 0]), 0.29, 0.25, 0.37), pal.pants, 0, SH_PANTS);

    // ---- upper body: shoulders lead a spin, lean into a grab ----
    let twist = -0.42 + (air ? spinV * 0.85 : (st.wind || 0) * 0.5);
    if (st.bail) twist += Math.sin(t * 7.3) * 0.35 * bk;
    if (mode === 'tuck') twist = -0.75;
    const lean = mode === 'tuck' ? 0.18 : mode === 'slide' ? -0.1 : air ? 0.06 + flipV * 0.12 + tuckAir * 0.08 : 0;
    let sh = add(hip, tw([0.1 + 0.15 * k + lean, 0.53 - 0.06 * k - tuckAir * 0.05, 0.02], twist));
    const gp = gk > 0 ? boardPt(G.pt) : null;
    if (gp) {
      // reach down toward the grab
      const gs = add(sh, tw([0, -0.04, G.hand * 0.205], twist));
      const d = sub(gp, gs), dl = len3(d);
      const need = Math.max(0, dl - (ARM_U + ARM_F) * 0.92);
      const k2 = gk * Math.min(0.32, need * 0.75) / (dl || 1);
      sh = add(sh, [d[0] * k2, d[1] * k2 - gk * 0.04, d[2] * k2 * 0.6]);
    }
    const waist = add(hip, tw([-0.005, -0.03, 0], twist));
    const neck = add(sh, tw([0.012, 0.11, 0], twist));
    const across = tw([0, 0, 1], twist);
    seg(M, waist, neck, 1, 1, across, TF);
    engine.cloth(pal.pat, pal.patCol, 0.55, 0, 0);
    engine.drawLit(meshes.body, TF, pal.jacket, 0, SH_JACKET);
    engine.drawLit(meshes.yoke, TF, pal.pat ? pal.jacket : pal.yoke, 0, SH_JACKET);
    engine.cloth(0);
    engine.drawLit(meshes.hem, TF, pal.trim, 0, SH_JACKET);
    engine.drawLit(meshes.collar, TF, pal.jacket, 0, SH_JACKET);
    engine.cloth(0, null, 0.8, 0, 0);
    engine.drawLit(meshes.hood, TF, pal.jacket, 0, SH_JACKET);
    engine.cloth(0);
    engine.drawLit(meshes.pack, TF, PACK, 0, SH_JACKET);
    if (!far) {
      engine.drawLit(meshes.packLid, TF, pal.trim, 0, SH_JACKET);
      engine.drawLit(meshes.zip, TF, ZIP, 0, SH_STEEL);
      engine.drawLit(meshes.pocket, TF, pal.trim, 0, SH_JACKET);
      engine.drawLit(meshes.straps, TF, DARK, 0, SH_JACKET);
      engine.drawLit(meshes.sidePanels, TF, pal.trim, 0, SH_JACKET);
      engine.drawLit(meshes.cords, TF, pal.trim, 0, SH_PANTS);
      engine.drawLit(meshes.toggles, TF, STEEL, 0, SH_STEEL);
      engine.drawLit(meshes.logo, TF, PATCH, 0, SH_JACKET);
      engine.drawLit(meshes.logoStripe, TF, pal.board, 0, SH_JACKET);
      engine.drawLit(meshes.packStraps, TF, DARK, 0, SH_JACKET);
      engine.drawLit(meshes.shovel, TF, SHOVEL, 0, SH_BOOT);
    }

    // ---- head: looks ahead into the spin, down at a grab ----
    const head = add(sh, tw([0.05, 0.25, 0], twist));
    M4.identity(L);
    M4.translate(L, head[0], head[1], head[2]);
    M4.rotY(L, twist + spinV * 0.55);
    M4.rotZ(L, -0.3 * gk - 0.15 * Math.abs(flipV) + (st.bail ? Math.sin(t * 9.1) * 0.35 * bk + 0.25 * (1 - bk) * (1 - bu) : 0));
    M4.scale(L, 0.93, 0.93, 0.93); // a touch smaller: closer to real proportions
    M4.mul(HF, M, L);
    engine.drawLit(meshes.face, HF, pal.skin, 0, null, 2);
    engine.drawLit(meshes.gaiter, HF, pal.trim, 0, SH_PANTS);
    if (!far) {
      engine.drawLit(meshes.nose, HF, pal.skin, 0, null, 2);
      engine.drawLit(meshes.lips, HF, pal.lips, 0, null, 2);
      engine.drawLit(meshes.hair, HF, pal.hair, 0, [0.15, 18]);
    }
    if (pal.beanie) {
      engine.cloth(0, null, 1, 0, 2);
      engine.drawLit(meshes.beanie, HF, pal.beanieCol, 0, SH_PANTS);
      engine.drawLit(meshes.beanieCuff, HF, pal.beanieCol, 0, SH_PANTS);
      engine.cloth(0, null, 0.6, 0, 2);
      engine.drawLit(meshes.pom, HF, PATCH, 0, SH_PANTS);
      engine.cloth(0);
    } else engine.drawLit(meshes.helmet, HF, pal.helmet, 0, SH_HELMET);
    engine.drawLit(meshes.strap, HF, pal.jacket, 0, SH_JACKET);
    engine.drawLit(meshes.frame, HF, DARK, 0, SH_HELMET);
    engine.drawLit(meshes.lens, HF, pal.lens, 0, SH_LENS, 3);
    if (!far) {
      if (!pal.beanie) {
        engine.drawLit(meshes.peak, HF, pal.helmet, 0, SH_HELMET);
        engine.drawLit(meshes.helmetStripe, HF, pal.jacket, 0, SH_HELMET);
        engine.drawLit(meshes.vents, HF, DARK, 0, SH_HELMET);
        engine.drawLit(meshes.ears, HF, pal.helmetDark, 0, SH_PANTS);
      }
    }

    // ---- arms: hands go to targets, elbows find themselves ----
    const sf = add(sh, tw([0, -0.04, 0.205], twist)), sb = add(sh, tw([0, -0.04, -0.205], twist));
    const sway = Math.sin(t * 2.6) * 0.03;
    const carve = st.lean || 0;
    let hf, hb;
    switch (mode) {
      case 'bail': {
        // flailing while it's going wrong, spread out flat on the snow, then pushing back up
        const w1 = t * 12.5, w2 = t * 12.5 + 2.1;
        const flF = add(sf, [0.12 + 0.24 * Math.cos(w1), 0.28 + 0.3 * Math.sin(w1), 0.44]);
        const flB = add(sb, [0.08 + 0.24 * Math.cos(w2), 0.28 + 0.3 * Math.sin(w2), -0.44]);
        const lyF = add(sf, [-0.14 * lieSide, 0.34, 0.42]), lyB = add(sb, [-0.14 * lieSide, 0.3, -0.44]);
        hf = mix(lyF, flF, bk); hb = mix(lyB, flB, bk);
        if (bu > 0) {
          // back hand plants in the snow beside the hip, front hand pushes off the knee
          const e = bu * bu * (3 - 2 * bu);
          const plantB = add(hip, [-0.3 * lieSide, 0.02, -0.3]);
          const pushF = add(knees[0], [0.13, 0.06, 0.02]);
          const rideF = add(sf, tw([0.22, -0.34, 0.36], twist)), rideB = add(sb, tw([0.15, -0.42, -0.28], twist));
          const m1 = clamp(bu * 2.2, 0, 1);
          hf = mix(mix(hf, pushF, m1), rideF, clamp((e - 0.55) / 0.45, 0, 1));
          hb = mix(mix(hb, plantB, m1), rideB, clamp((e - 0.55) / 0.45, 0, 1));
        }
        break;
      }
      case 'tuck':
        hf = add(knees[0], tw([0.13, 0.06, -0.02], twist)); hb = add(knees[1], tw([0.13, 0.08, 0.04], twist));
        break;
      case 'slide':
        hf = add(sf, tw([0.38, -0.2, 0.3], twist)); hb = add(sb, tw([0.4, -0.24, -0.08], twist));
        break;
      case 'air': {
        // balance: arms out wide; spinning pulls them in; flipping grabs the shins
        hf = add(sf, tw([0.1, -0.06 + Math.sin(t * 5) * 0.04, 0.5], twist));
        hb = add(sb, tw([0.06, -0.02 - Math.sin(t * 5) * 0.04, -0.5], twist));
        const sp = Math.min(1, Math.abs(spinV) * 0.9);
        if (sp > 0) {
          hf = mix(hf, add(sh, tw([0.32, -0.16, -0.06 * Math.sign(spinV || 1)], twist)), sp);
          hb = mix(hb, add(sh, tw([0.3, -0.1, 0.1], twist)), sp);
        }
        const fp = Math.min(1, Math.abs(flipV) * 0.85);
        if (fp > 0) {
          hf = mix(hf, add(knees[0], [0.1, 0.02, 0]), fp);
          hb = mix(hb, add(knees[1], [0.1, 0.02, 0]), fp);
        }
        if (gp) {
          // the grabbing hand goes to the board, the other one is thrown out for style
          if (G.hand > 0) { hf = mix(hf, gp, gk); hb = mix(hb, add(sb, tw([-0.08, 0.3, -0.38], twist)), gk); }
          else { hb = mix(hb, gp, gk); hf = mix(hf, add(sf, tw([0.02, 0.3, 0.4], twist)), gk); }
        }
        break;
      }
      default:
        // relaxed: hands low and loose, front hand just ahead of the knee
        hf = add(sf, tw([0.2, -0.4 + sway - carve * 0.18, 0.3], twist));
        hb = add(sb, tw([0.1, -0.47 - sway + carve * 0.15, -0.2], twist));
    }
    for (const [s0, h1, side] of [[sf, hf, 1], [sb, hb, -1]]) {
      const hand = reach(s0, h1, ARM_U + ARM_F - 0.005);
      const elbow = ik(s0, hand, ARM_U, ARM_F, tw([-0.55, -0.6, side * 0.75], twist));
      engine.cloth(pal.pat, pal.patCol, 0.9, 0, 1);
      ball(engine, M, s0, 0.096, pal.jacket, SH_JACKET);
      limb(engine, M, meshes.sleeveUp, s0, elbow, pal.jacket, SH_JACKET);
      if (!far) limb(engine, M, meshes.armBand, s0, elbow, pal.trim, SH_JACKET);
      ball(engine, M, elbow, 0.077, pal.jacket, SH_JACKET);
      // forearm stops short of the hand; the cuff and mitt cover the wrist
      const dir = nrm(sub(hand, elbow));
      const wrist = add(hand, [-dir[0] * 0.03, -dir[1] * 0.03, -dir[2] * 0.03]);
      limb(engine, M, meshes.sleeveLo, elbow, wrist, pal.jacket, SH_JACKET);
      engine.cloth(0);
      if (!far) limb(engine, M, meshes.wristBand, elbow, wrist, REFLECT, SH_STEEL);
      const tip = add(hand, [dir[0] * 0.12, dir[1] * 0.12, dir[2] * 0.12]);
      const palmSide = nrm(cross(dir, [0, 1, 0]));
      if (!far) {
        const c1 = add(wrist, [dir[0] * 0.05, dir[1] * 0.05, dir[2] * 0.05]);
        engine.drawLit(meshes.cuff, seg(M, wrist, c1, 1, 1, palmSide), pal.trim, 0, SH_JACKET);
      }
      engine.cloth(0, null, 0.3, 0.25, 0);
      engine.drawLit(meshes.mitt, seg(M, add(hand, [-dir[0] * 0.02, -dir[1] * 0.02, -dir[2] * 0.02]), tip, 1, 1, palmSide), pal.glove, 0, SH_BOOT);
      engine.cloth(0);
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
