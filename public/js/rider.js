/*
 * Shred Slope: the snowboarder.
 * A clean, posed model built once from lofted shapes: a smooth puffer jacket with a broad band
 * across the chest and arms, a tall funnel collar zipped up to the chin, zip, pocket and chest
 * patch; baggy pants with cargo pockets and hem stripes; laced boots in strap bindings with ratchets
 * and highbacks; big mitts with cuffs; and a helmet with big framed goggles and a strap, with the
 * face showing underneath.
 * Body frame: board along +z, rider faces +x (regular stance), up is +y.
 * st.pose 'stand': standing up, holding the board upright beside you (the lobby and the results);
 * st.pose 'board': just the board, standing up (the shop's pictures).
 */
(function () {
  'use strict';
  const SS = window.SS;
  const M4 = SS.M4;
  const TAU = Math.PI * 2;

  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  // 10 outfits (one per player slot on a server)
  const PALETTE = [
    { name: 'Forest', css: '#2fbf71', jacket: '#23a062', trim: '#2b3138', pants: '#1f2a3d', board: '#f0384a', stripe: '#ffffff', helmet: '#16171b', lens: '#ffa62b', boot: '#2b2a2e' },
    { name: 'Blaze', css: '#ff7a1f', jacket: '#f26a17', trim: '#2b3138', pants: '#232a38', board: '#1d2a4a', stripe: '#ffcc33', helmet: '#16171b', lens: '#38c6ff', boot: '#3a2a20' },
    { name: 'Glacier', css: '#3d8bff', jacket: '#2c78f0', trim: '#e9eef6', pants: '#1c2333', board: '#ffcc22', stripe: '#141414', helmet: '#f2f2f4', lens: '#ff7a2e', boot: '#24262c' },
    { name: 'Bubblegum', css: '#ff4f8b', jacket: '#f2487f', trim: '#2b3138', pants: '#1f1f26', board: '#7c4dff', stripe: '#ffffff', helmet: '#f2f2f4', lens: '#a98bff', boot: '#2b2a2e' },
    { name: 'Lemon', css: '#ffd23f', jacket: '#f6c52a', trim: '#2b3138', pants: '#252a33', board: '#2f7dff', stripe: '#ffffff', helmet: '#16171b', lens: '#ff4fa0', boot: '#c99a63' },
    { name: 'Ultraviolet', css: '#a46bff', jacket: '#8d55f2', trim: '#1e1d2b', pants: '#16161b', board: '#19d3c5', stripe: '#141414', helmet: '#16171b', lens: '#4dffa6', boot: '#24262c' },
    { name: 'Lagoon', css: '#19d3c5', jacket: '#169c9c', trim: '#2b3138', pants: '#1c2336', board: '#ff5a36', stripe: '#ffffff', helmet: '#e9ecf1', lens: '#ff8a2a', boot: '#2b2a2e' },
    { name: 'Inferno', css: '#ff3b30', jacket: '#d9271f', trim: '#1c1d22', pants: '#141418', board: '#f2f2f4', stripe: '#ec2a22', helmet: '#16171b', lens: '#ffb02e', boot: '#1d1d21' },
    { name: 'Whiteout', css: '#e9eef7', jacket: '#e4e9f2', trim: '#2f7dff', pants: '#2e3646', board: '#ff7a1f', stripe: '#141414', helmet: '#2f7dff', lens: '#ff4fa0', boot: '#d9d4c7' },
    { name: 'Acid', css: '#8bd346', jacket: '#78c232', trim: '#2b3138', pants: '#26272c', board: '#a46bff', stripe: '#ffffff', helmet: '#16171b', lens: '#6f9cff', boot: '#2b2a2e' },
  ];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  // streetwear: every outfit is an oversized hoodie and baggy pants. The print on the hoodie
  // changes: plain, a band across the chest (3) or two-tone shoulders (4)
  const STYLES = [
    { pat: 3 }, { pat: 0 }, { pat: 4 }, { pat: 3 }, { pat: 0 }, { pat: 4 }, { pat: 3 }, { pat: 0 }, { pat: 4 }, { pat: 3 },
  ];
  // the riders: all in full kit (helmet, goggles, face mask), so no faces show. What tells them
  // apart is the helmet, the mask, a ponytail or a hood, and their size. The suit brings the colours.
  //   helmet: vent | peak (short visor) | pads (soft ear pads);  mask: gaiter | balaclava
  const RIDER_LOOKS = {
    kai: { helmet: 'vent', skin: '#c98e66', size: 1.0 },
    mia: { helmet: 'vent', skin: '#e2b48e', hairStyle: 'pony', hair: '#8a4a22', size: 0.95 },
    dre: { helmet: 'vent', skin: '#7f5236', size: 1.05 },
    yuki: { helmet: 'vent', skin: '#e8c39e', size: 0.98 },
    rio: { helmet: 'pads', skin: '#a8714b', size: 1.02 },
  };
  const RIDER_IDS = Object.keys(RIDER_LOOKS);
  SS.RIDER_LOOKS = RIDER_LOOKS;
  const SKINS = ['#f0c4a0', '#8d5a3b', '#e3a982', '#c98e66', '#5c3a26', '#f5cfb3', '#b07a52', '#f2c9a8', '#6e4630', '#deaa85'];
  const HAIRS = ['#2b1d14', '#1a1a1a', '#d8b06a', '#6b3a1f', '#111111', '#a0522d', '#2b1d14', '#e0c27a', '#1a1a1a', '#4a2c1a'];
  // the free outfits on their own (ghosts, bots, guests in old saves) get a rider by slot number
  PALETTE.forEach((p, i) => { Object.assign(p, STYLES[i % STYLES.length]); p.riderId = RIDER_IDS[i % RIDER_IDS.length]; });
  function applyRider(p, id) {
    const r = RIDER_LOOKS[id] || RIDER_LOOKS.kai;
    p.riderId = RIDER_LOOKS[id] ? id : 'kai';
    p.skin = r.skin || '#c98e66'; p.hair = r.hair || '#2b1d14';
    p.helmetType = r.helmet; p.mask = r.mask; p.maskCol = r.maskCol; p.hoodUp = !!r.hood; p.hairStyle = r.hairStyle || 'none';
    p.eyes = 'goggles'; p.size = r.size || 1;
    return p;
  }
  PALETTE.forEach((p) => applyRider(p, p.riderId));
  // turn a palette of #hex colours into the ready-to-draw one (done once per outfit or look)
  function prep(p) {
    for (const k of ['jacket', 'trim', 'pants', 'board', 'stripe', 'helmet', 'lens', 'boot', 'skin', 'hair', 'maskCol']) if (typeof p[k] === 'string') p[k] = hex(p[k]);
    p.patCol = typeof p.patCol === 'string' ? hex(p.patCol) : p.patCol || p.trim;
    // the hat takes the helmet colour; a white one gets a touch of warmth so it reads as knit
    p.hatCol = p.helmet;
    p.hatDark = shade(p.helmet, p.helmet[0] + p.helmet[1] + p.helmet[2] > 1.8 ? 0.82 : 0.7);
    p.hoodIn = shade(p.jacket, 0.42);
    p.cordCol = p.trim[0] + p.trim[1] + p.trim[2] > 0.6 ? p.trim : [0.92, 0.92, 0.94];
    p.eyeCol = [0.16, 0.11, 0.07];
    // knit beanie in the jacket's accent colour
    p.beanieCol = shade(p.trim[0] + p.trim[1] + p.trim[2] > 1.5 ? p.trim : p.jacket, 0.95);
    p.yoke = [p.jacket[0] * 0.68 + p.trim[0] * 0.32, p.jacket[1] * 0.68 + p.trim[1] * 0.32, p.jacket[2] * 0.68 + p.trim[2] * 0.32];
    p.lips = [p.skin[0] * 0.84, p.skin[1] * 0.64, p.skin[2] * 0.62];
    p.pouch = shade(p.jacket, p.jacket[0] + p.jacket[1] + p.jacket[2] > 2.2 ? 0.86 : 0.8);
    p.pantsPatch = shade(p.pants, p.pants[0] > 0.6 ? 0.82 : 1.45);
    p.helmetDark = shade(p.helmet, p.helmet[0] > 0.6 ? 0.7 : 1.6);
    p.glove = [0.075, 0.078, 0.088];
    // goggle frame: white on a dark helmet, dark on a light one
    // goggle frame: black, unless the goggles bring their own colour
    p.frameCol = typeof p.frame === 'string' ? hex(p.frame) : [0.9, 0.91, 0.93];
    // the goggle strap: the jacket's accent, so it stands out on the helmet
    p.strapCol = p.helmet[0] + p.helmet[1] + p.helmet[2] < 1.2 ? [0.88, 0.89, 0.91] : [0.12, 0.13, 0.15];
    return p;
  }
  const RAW = PALETTE.map((p) => Object.assign({}, p)); // the free outfits as #hex, for building looks
  PALETTE.forEach(prep);
  SS.PALETTE = PALETTE;

  // a look from the locker: a suit, plus a board, helmet and goggles that can each be "stock"
  // (whatever comes with the suit). Built once per combination.
  const looks = new Map();
  function lookPalette(look) {
    const I = SS.ITEMS;
    const key = look.rider + '|' + look.suit + '|' + look.board + '|' + look.helmet + '|' + look.goggles;
    let p = looks.get(key);
    if (p) return p;
    const suit = (I && I.get('suit', look.suit)) || null;
    let raw;
    if (!suit || suit.pal !== undefined) raw = Object.assign({}, RAW[suit ? suit.pal : 0]);
    else {
      raw = { name: suit.name, pat: suit.pat !== undefined ? suit.pat : 3 };
      for (const f of ['jacket', 'trim', 'pants', 'board', 'stripe', 'helmet', 'lens', 'boot', 'patCol']) if (suit[f]) raw[f] = suit[f];
    }
    applyRider(raw, look.rider || 'kai');
    const b = I && I.get('board', look.board), h = I && I.get('helmet', look.helmet), g = I && I.get('goggles', look.goggles);
    if (b && b.board) { raw.board = b.board; raw.stripe = b.stripe; raw.boardSh = b.shine; }
    if (h && h.helmet) { raw.helmet = h.helmet; raw.helmetSh = h.shine; }
    if (g && g.lens) { raw.lens = g.lens; if (g.frame) raw.frame = g.frame; }
    p = prep(raw);
    looks.set(key, p);
    return p;
  }
  SS.lookPalette = lookPalette;

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
  const SH_SHELL = [0.07, 9]; // a matte helmet shell, not a bowling ball
  const VENT = [0.06, 0.065, 0.075];
  const SH_LENS = [1.25, 90];
  const SH_BOARD = [0.35, 34];
  const SH_JACKET = [0.2, 14]; // nylon shell: a soft satin sheen
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
    // oversized streetwear: big drop-shoulder sleeves that bunch at a ribbed cuff, and wide pants
    // that stack in folds over the boots
    const sleeveUp = loft([{ y: 0, rx: 0.1, rz: 0.1 }, { y: 0.3, rx: 0.107, rz: 0.104 }, { y: 0.75, rx: 0.1, rz: 0.097 }, { y: 1, rx: 0.093, rz: 0.09 }], 18);
    const sleeveLo = loft([{ y: 0, rx: 0.093, rz: 0.09 }, { y: 0.4, rx: 0.097, rz: 0.093 }, { y: 0.66, rx: 0.094, rz: 0.09 }, { y: 0.76, rx: 0.098, rz: 0.094 }, { y: 0.84, rx: 0.088, rz: 0.085 }, { y: 0.9, rx: 0.068, rz: 0.066 }, { y: 1, rx: 0.064, rz: 0.062 }], 18);
    const thigh = loft([{ y: 0, rx: 0.12, rz: 0.118 }, { y: 0.35, rx: 0.13, rz: 0.126 }, { y: 0.8, rx: 0.133, rz: 0.13 }, { y: 1, rx: 0.128, rz: 0.128 }], 18);
    const shin = loft([{ y: 0, rx: 0.142, rz: 0.13 }, { y: 0.05, rx: 0.136, rz: 0.125 }, { y: 0.1, rx: 0.145, rz: 0.132 }, { y: 0.17, rx: 0.132, rz: 0.122 }, { y: 0.25, rx: 0.139, rz: 0.127 }, { y: 0.4, rx: 0.126, rz: 0.12 }, { y: 0.7, rx: 0.122, rz: 0.118 }, { y: 1, rx: 0.12, rz: 0.118 }], 20, { capBottom: true });

    // ---- jacket, in torso space: x across the shoulders, y up the spine (0..1), z toward the back ----
    const TP = 2.6;
    const tr = (y, rx, rz, oz) => ({ y, rx, rz, oz: oz || 0 });
    // an oversized hoodie: long (down over the hips), wide, with dropped shoulders and a ribbed hem
    const body = loft([tr(-0.21, 0.214, 0.164, 0.004), tr(-0.1, 0.222, 0.168), tr(0.06, 0.224, 0.168), tr(0.24, 0.226, 0.167), tr(0.42, 0.229, 0.166, -0.004), tr(0.6, 0.234, 0.163, -0.008)], 26, { p: TP });
    const yoke = loft([tr(0.6, 0.234, 0.163, -0.008), tr(0.72, 0.238, 0.157, -0.006), tr(0.84, 0.228, 0.141), tr(0.92, 0.184, 0.12), tr(0.97, 0.124, 0.1), tr(1.0, 0.078, 0.08)], 26, { p: TP, capTop: true });
    const hem = loft([tr(-0.28, 0.2, 0.152, 0.004), tr(-0.2, 0.211, 0.161, 0.004)], 26, { p: TP, capBottom: true });
    // a crew neckline where the hood joins, and the neck
    const neckline = loft([tr(0.93, 0.104, 0.09, 0.006), tr(0.985, 0.096, 0.084, 0.008), tr(1.0, 0.086, 0.076, 0.008)], 22);
    const neck = loft([{ y: 0.9, rx: 0.058, rz: 0.055, oz: 0.004 }, { y: 1.2, rx: 0.054, rz: 0.052, oz: 0.004 }], 14);
    // a tall funnel collar zipped up to the chin: puffy, flaring a little at the top, lower at the
    // front so the chin shows (with a lining, so the inside shows)
    const collarRings = [{ y: 0.84, rx: 0.15, rz: 0.13, oz: -0.004 }, { y: 0.93, rx: 0.138, rz: 0.124, oz: -0.008 }, { y: 1.0, rx: 0.132, rz: 0.12, oz: -0.012 }, { y: 1.05, rx: 0.136, rz: 0.125, oz: -0.014 }];
    const CS = 30;
    const collarTop = (a) => { const f = Math.max(0, -Math.sin(a)); return -0.07 * Math.pow(f, 3); }; // front (-z) sits lower
    const collar = [];
    {
      const ringPt = (i, a, k) => {
        const r = collarRings[i];
        const u = (r.y - collarRings[0].y) / (collarRings[collarRings.length - 1].y - collarRings[0].y);
        return [Math.cos(a) * (r.rx - k), r.y + collarTop(a) * u * u, Math.sin(a) * (r.rz - k) + r.oz];
      };
      for (const [k, inside] of [[0, false], [0.014, true]]) {
        for (let i = 0; i < collarRings.length - 1; i++) {
          for (let j = 0; j < CS; j++) {
            const a0 = (j / CS) * TAU, a1 = ((j + 1) / CS) * TAU;
            const p00 = ringPt(i, a0, k), p01 = ringPt(i, a1, k), p10 = ringPt(i + 1, a0, k), p11 = ringPt(i + 1, a1, k);
            const am = (a0 + a1) / 2, out = [Math.cos(am) * (inside ? -1 : 1), 0, Math.sin(am) * (inside ? -1 : 1)];
            quad(collar, p00, p10, p11, p01, out);
          }
        }
      }
      for (let j = 0; j < CS; j++) {
        // rolled top edge between the shell and the lining
        const a0 = (j / CS) * TAU, a1 = ((j + 1) / CS) * TAU, n = collarRings.length - 1;
        quad(collar, ringPt(n, a0, 0.014), ringPt(n, a0, 0), ringPt(n, a1, 0), ringPt(n, a1, 0.014), [0, 1, 0]);
      }
    }
    // the hood, down, piled up behind the neck
    const hood = [...sphere(10, 16, 0.165, 0.1, 0.1, 0, 0.95, 0.1), ...sphere(8, 12, 0.135, 0.075, 0.075, 0, 0.87, 0.155), ...sphere(6, 10, 0.1, 0.05, 0.05, 0, 0.8, 0.18)];
    // where the hoodie surface is, so the pocket and drawcords sit right on it
    const TR = [[-0.21, 0.214, 0.164, 0.004], [-0.1, 0.222, 0.168, 0], [0.06, 0.224, 0.168, 0], [0.24, 0.226, 0.167, 0], [0.42, 0.229, 0.166, -0.004], [0.6, 0.234, 0.163, -0.008], [0.72, 0.238, 0.157, -0.006], [0.84, 0.228, 0.141, 0], [0.92, 0.184, 0.12, 0], [0.97, 0.124, 0.1, 0], [1.0, 0.078, 0.08, 0]];
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
    // a half zip: from the middle of the chest up (it's a pullover)
    for (let i = 0; i < 5; i++) {
      const y0 = 0.6 + i * 0.052, y1 = y0 + 0.052;
      quad(zip, [-0.006, y0, surfZ(0, y0, -1)], [0.006, y0, surfZ(0, y0, -1)], [0.006, y1, surfZ(0, y1, -1)], [-0.006, y1, surfZ(0, y1, -1)], [0, 0, -1]);
    }
    // zip pull
    quad(zip, [-0.012, 0.56, surfZ(0, 0.56, -1, 0.006)], [0.012, 0.56, surfZ(0, 0.56, -1, 0.006)], [0.012, 0.61, surfZ(0, 0.61, -1, 0.006)], [-0.012, 0.61, surfZ(0, 0.61, -1, 0.006)], [0, 0, -1]);
    // the big kangaroo pocket across the belly, with slanted openings at the sides and a top seam
    const kanga = [];
    {
      const K = 10, lift = 0.011;
      const edge = (t) => 0.165 - 0.04 * t; // narrower toward the top
      for (let i = 0; i < K; i++) {
        const t0 = i / K, t1 = (i + 1) / K, y0 = 0.0 + t0 * 0.3, y1 = 0.0 + t1 * 0.3;
        const x00 = -edge(t0), x01 = edge(t0), x10 = -edge(t1), x11 = edge(t1);
        for (let j = 0; j < 6; j++) {
          const a0 = j / 6, a1 = (j + 1) / 6;
          const P = (x0, x1, a, y) => { const x = x0 + (x1 - x0) * a; return [x, y, surfZ(x, y, -1, lift)]; };
          quad(kanga, P(x00, x01, a0, y0), P(x00, x01, a1, y0), P(x10, x11, a1, y1), P(x10, x11, a0, y1), [0, 0, -1]);
        }
      }
      // the rolled top edge of the pocket
      for (let j = 0; j < 6; j++) {
        const xa = -0.125 + (j / 6) * 0.25, xb = -0.125 + ((j + 1) / 6) * 0.25, y = 0.3;
        quad(kanga, [xa, y, surfZ(xa, y, -1, lift)], [xb, y, surfZ(xb, y, -1, lift)], [xb, y + 0.012, surfZ(xb, y + 0.012, -1, 0.004)], [xa, y + 0.012, surfZ(xa, y + 0.012, -1, 0.004)], [0, 0.6, -1]);
      }
    }
    // and on up the front of the collar to its notch
    for (let i = 0; i < 3; i++) {
      const y0 = 0.86 + i * 0.05, y1 = y0 + 0.05;
      const zf = (y) => { let r = collarRings[0]; for (const q of collarRings) if (q.y <= y) r = q; return r.oz - r.rz - 0.003; };
      quad(zip, [-0.006, y0, zf(y0)], [0.006, y0, zf(y0)], [0.006, y1, zf(y1)], [-0.006, y1, zf(y1)], [0, 0, -1]);
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
    // a sculpted shell: the front edge sits up over the goggles, the sides come down over the ears
    // and the back a little lower; a rolled rim round the edge, a short brim and slotted vents on top
    const HX = 0.148, HY = 0.142, HZ = 0.14, HCX = -0.008, HCY = 0.012;
    const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
    const rimPh = (th) => {
      const f = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
      return 1.16 + 0.7 * smooth((f - 0.32) / 1.05) - 0.12 * smooth((f - 1.9) / 1.1);
    };
    const shellPt = (th, ph, k) => [Math.sin(ph) * Math.cos(th) * HX * k + HCX, Math.cos(ph) * HY * k + HCY, Math.sin(ph) * Math.sin(th) * HZ * k];
    const shellN = (p) => nrm([(p[0] - HCX) / (HX * HX), (p[1] - HCY) / (HY * HY), p[2] / (HZ * HZ)]);
    const helmet = [], helmetRim = [];
    {
      const NT = 32, NP = 11;
      const V = (th, j) => { const p = shellPt(th, (j / NP) * rimPh(th), 1); const n = shellN(p); return [p[0], p[1], p[2], n[0], n[1], n[2]]; };
      for (let i = 0; i < NT; i++) {
        const t0 = (i / NT) * TAU, t1 = ((i + 1) / NT) * TAU;
        for (let j = 0; j < NP; j++) {
          const a = V(t0, j), b = V(t1, j), c = V(t1, j + 1), d = V(t0, j + 1);
          helmet.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
        // the rolled rim: out over the edge and back in underneath
        const R = (th, dph, k) => shellPt(th, rimPh(th) + dph, k);
        const ring = [[0, 1.0], [0.05, 1.012], [0.1, 0.99], [0.09, 0.95]];
        for (let r = 0; r < ring.length - 1; r++) {
          const [p0, k0] = ring[r], [p1, k1] = ring[r + 1];
          quad(helmetRim, R(t0, p0, k0), R(t1, p0, k0), R(t1, p1, k1), R(t0, p1, k1), nrm([Math.cos((t0 + t1) / 2), -0.3, Math.sin((t0 + t1) / 2)]));
        }
      }
    }
    // a short brim over the goggles
    const peak = sphere(6, 14, 0.032, 0.007, 0.088, 0.142, 0.07, 0);
    // vent slots along the top, front to back
    const vents = [];
    const topY = (x, z) => HCY + HY * Math.sqrt(Math.max(0, 1 - ((x - HCX) / HX) ** 2 - (z / HZ) ** 2));
    for (const [x, z, l] of [[0.02, 0.03, 0.035], [0.02, -0.03, 0.035], [-0.03, 0.07, 0.03], [-0.03, -0.07, 0.03], [-0.07, 0, 0.03]]) vents.push(...sphere(5, 10, l, 0.006, 0.009, x, topY(x, z) - 0.002, z));
    const ears = [];
    // face below the goggles: cheeks, nose, lips and chin; a neck gaiter pulled down; hair out the back
    const face = sphere(14, 20, 0.1, 0.098, 0.094, 0.022, -0.066, 0);
    const nose = sphere(8, 10, 0.018, 0.019, 0.013, 0.124, -0.064, 0);
    const lips = sphere(6, 10, 0.006, 0.0045, 0.019, 0.117, -0.11, 0);
    const chin = [];
    // a neck warmer pulled up over the chin and mouth, to just under the nose
    const gaiter = loft([{ y: -0.225, rx: 0.094, rz: 0.094, ox: -0.004 }, { y: -0.17, rx: 0.112, rz: 0.104, ox: 0.01 }, { y: -0.125, rx: 0.118, rz: 0.104, ox: 0.024 }, { y: -0.098, rx: 0.112, rz: 0.1, ox: 0.028 }, { y: -0.09, rx: 0.106, rz: 0.096, ox: 0.028 }], 20);
    // knit beanie: a slouchy cap, a folded cuff and a pom-pom
    const beanie = sphere(12, 20, 0.143, 0.15, 0.135, -0.014, 0.03, 0);
    const beanieCuff = loft([{ y: -0.035, rx: 0.15, rz: 0.142, ox: -0.004 }, { y: 0.02, rx: 0.152, rz: 0.144, ox: -0.006 }, { y: 0.03, rx: 0.147, rz: 0.139, ox: -0.006 }], 20);
    const pom = sphere(8, 12, 0.045, 0.042, 0.045, -0.035, 0.185, 0);
    const hair = [...sphere(8, 12, 0.055, 0.07, 0.105, -0.108, -0.07, 0), ...sphere(6, 10, 0.034, 0.075, 0.034, -0.148, -0.13, 0)];
    // slim goggles wrapped round the face at eye level, under the helmet's brim
    const R = 0.133;
    const goggleArc = (r, h0, h1, aMax, inset) => {
      const rows = [];
      for (const y of [h0, (h0 + h1) / 2, h1]) rows.push({ y, rx: r + (y === (h0 + h1) / 2 ? 0.004 : 0), rz: (r + (y === (h0 + h1) / 2 ? 0.004 : 0)) * 1.04 });
      return loft(rows, 16, { a0: -aMax, a1: aMax, inside: inset });
    };
    // a slim frame round a curved, mirrored lens
    const GY0 = -0.052, GY1 = 0.018, GA = 1.12, GT = 0.01;
    const frame = [...goggleArc(R + GT, GY0, GY1, GA), ...goggleArc(R, GY0, GY1, GA, true)];
    // top and bottom rims of the frame, and its two ends
    for (const y of [GY0, GY1]) {
      for (let j = 0; j < 16; j++) {
        const a = -GA + (2 * GA * j) / 16, b = -GA + (2 * GA * (j + 1)) / 16;
        const P = (r, ang) => [Math.cos(ang) * r, y, Math.sin(ang) * r * 1.04];
        quad(frame, P(R, a), P(R + GT, a), P(R + GT, b), P(R, b), [0, y > 0 ? 1 : -1, 0]);
      }
    }
    for (const a of [-GA, GA]) {
      const P = (r, y) => [Math.cos(a) * r, y, Math.sin(a) * r * 1.04];
      quad(frame, P(R, GY0), P(R + GT, GY0), P(R + GT, GY1), P(R, GY1), [-Math.sin(a), 0, Math.cos(a) * Math.sign(a)]);
    }
    const lens = goggleArc(R + GT + 0.0015, GY0 + 0.008, GY1 - 0.007, GA - 0.09);
    // the strap round the back of the helmet (or a hood), and a tighter one round a knit hat
    const strap = loft([{ y: -0.036, rx: 0.155, rz: 0.149 }, { y: -0.006, rx: 0.155, rz: 0.149 }], 28, { a0: 1.08, a1: TAU - 1.08 });
    const strapKnit = loft([{ y: -0.036, rx: 0.13, rz: 0.124, ox: -0.006 }, { y: -0.006, rx: 0.13, rz: 0.124, ox: -0.006 }], 28, { a0: 1.08, a1: TAU - 1.08 });

    // ---- the streetwear head: a real head under a knit beanie, a hood or a bucket hat ----
    // a cap over an ellipsoid: for each angle round the head th (0 = the face) it covers from
    // `from(th)` (0 = the crown) down to `rim(th)`; k > 1 puffs it out a little (a folded cuff)
    const capShell = (o) => {
      const out = [], NT = o.NT || 32, NP = o.NP || 10, k = o.k || 1;
      const P = (th, ph) => [Math.sin(ph) * Math.cos(th) * o.hx * k + o.cx, Math.cos(ph) * o.hy * k + o.cy, Math.sin(ph) * Math.sin(th) * o.hz * k];
      const N = (q) => { const n = nrm([(q[0] - o.cx) / (o.hx * o.hx), (q[1] - o.cy) / (o.hy * o.hy), q[2] / (o.hz * o.hz)]); return o.inside ? [-n[0], -n[1], -n[2]] : n; };
      for (let i = 0; i < NT; i++) {
        const t0 = (i / NT) * TAU, t1 = ((i + 1) / NT) * TAU;
        const f0 = o.from ? o.from(t0) : 0, f1 = o.from ? o.from(t1) : 0, r0 = Math.max(f0, o.rim(t0)), r1 = Math.max(f1, o.rim(t1));
        if (r0 - f0 < 0.02 && r1 - f1 < 0.02) continue;
        for (let j = 0; j < NP; j++) {
          const V = (th, f, r, jj) => { const q = P(th, f + (r - f) * (jj / NP)); const n = N(q); return [q[0], q[1], q[2], n[0], n[1], n[2]]; };
          const a = V(t0, f0, r0, j), b = V(t1, f1, r1, j), c = V(t1, f1, r1, j + 1), d = V(t0, f0, r0, j + 1);
          out.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
      }
      return out;
    };
    const wrapA = (th) => Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
    const skull = sphere(14, 20, 0.104, 0.118, 0.095, -0.008, 0.004, 0);
    const headEars = [...sphere(6, 8, 0.014, 0.026, 0.012, -0.004, -0.036, 0.097), ...sphere(6, 8, 0.014, 0.026, 0.012, -0.004, -0.036, -0.097)];
    const eyeW = [], eyeI = [], brows = [];
    for (const z of [0.035, -0.035]) {
      eyeW.push(...sphere(6, 10, 0.012, 0.0105, 0.0145, 0.097, -0.014, z));
      eyeI.push(...sphere(5, 8, 0.004, 0.0075, 0.0075, 0.107, -0.014, z * 0.97));
      brows.push(...sphere(5, 8, 0.006, 0.0038, 0.018, 0.103, 0.009, z * 1.03));
    }
    // knit beanie: higher over the forehead, down over the tops of the ears, low at the back
    const BX = 0.118, BY = 0.132, BZ = 0.11, BCX = -0.012, BCY = 0.016;
    const bRim = (th) => { const f = wrapA(th); return 1.36 + 0.62 * smooth((f - 0.25) / 1.3) + 0.15 * smooth((f - 1.6) / 1.2); };
    const knit = capShell({ hx: BX, hy: BY, hz: BZ, cx: BCX, cy: BCY, rim: bRim, NT: 36, NP: 12 });
    const knitCuff = capShell({ hx: BX, hy: BY, hz: BZ, cx: BCX, cy: BCY, k: 1.06, from: (th) => bRim(th) - 0.38, rim: (th) => bRim(th) + 0.03, NT: 36, NP: 3 });
    const knitSlouch = sphere(10, 16, 0.1, 0.088, 0.1, -0.07, 0.105, 0);
    const knitPom = sphere(8, 12, 0.044, 0.042, 0.044, -0.02, 0.168, 0);
    // the hood pulled up (over a beanie): it frames the face and falls to the neck
    const HHX = 0.16, HHY = 0.17, HHZ = 0.15, HHCX = -0.036;
    const hRim = (th) => 0.8 + 1.72 * smooth((wrapA(th) - 0.5) / 0.95);
    const hoodUp = capShell({ hx: HHX, hy: HHY, hz: HHZ, cx: HHCX, cy: 0, rim: hRim, NT: 36, NP: 14 });
    const hoodUpIn = capShell({ hx: HHX, hy: HHY, hz: HHZ, cx: HHCX, cy: 0, k: 0.95, rim: hRim, NT: 36, NP: 14, inside: true });
    // the hood's edge: a soft rolled seam round the opening
    const hoodEdge = capShell({ hx: HHX, hy: HHY, hz: HHZ, cx: HHCX, cy: 0, k: 1.012, from: (th) => hRim(th) - 0.08, rim: (th) => hRim(th) + 0.02, NT: 36, NP: 2 });
    // bucket hat: a soft crown and a wide brim angled down
    const bucket = loft([{ y: 0.012, rx: 0.129, rz: 0.12, ox: -0.012 }, { y: 0.1, rx: 0.124, rz: 0.116, ox: -0.014 }, { y: 0.15, rx: 0.112, rz: 0.104, ox: -0.016 }, { y: 0.168, rx: 0.09, rz: 0.084, ox: -0.016 }], 26, { capTop: true });
    const brimR = [{ y: 0.03, rx: 0.13, rz: 0.122, ox: -0.012 }, { y: 0.004, rx: 0.172, rz: 0.165, ox: -0.01 }, { y: -0.02, rx: 0.2, rz: 0.193, ox: -0.008 }];
    const brim = [...loft(brimR, 30), ...loft(brimR.map((q) => ({ ...q, y: q.y - 0.006 })), 30, { inside: true })];
    // hair: short tufts and sideburns, a ponytail, a bob, curls, and a beard
    const hairShort = [...hair, ...sphere(5, 8, 0.012, 0.026, 0.007, 0.028, -0.044, 0.097), ...sphere(5, 8, 0.012, 0.026, 0.007, 0.028, -0.044, -0.097)];
    const hairPony = [
      ...loft([{ y: 0.0, rx: 0.036, rz: 0.042, ox: -0.126 }, { y: -0.07, rx: 0.042, rz: 0.038, ox: -0.142 }, { y: -0.16, rx: 0.032, rz: 0.03, ox: -0.152 }, { y: -0.25, rx: 0.014, rz: 0.014, ox: -0.148 }], 12, { capTop: true, capBottom: true }),
    ];
    const hairTie = loft([{ y: -0.005, rx: 0.04, rz: 0.045, ox: -0.128 }, { y: -0.02, rx: 0.041, rz: 0.046, ox: -0.131 }], 12);
    const hairBob = capShell({ hx: 0.122, hy: 0.132, hz: 0.114, cx: -0.012, cy: 0.004, from: (th) => bRim(th) - 0.12, rim: (th) => { const f = wrapA(th); return bRim(th) - 0.12 + (2.42 - bRim(th) + 0.12) * smooth((f - 0.72) / 0.5); }, NT: 32, NP: 6 });
    const hairCurls = [];
    for (let i = 0; i < 22; i++) {
      const th = 0.85 + (i / 21) * (TAU - 1.7), ph = bRim(th) + 0.1;
      const r = 0.021 + 0.006 * Math.sin(i * 2.7);
      hairCurls.push(...sphere(5, 7, r, r, r, Math.sin(ph) * Math.cos(th) * BX * 0.98 + BCX, Math.cos(ph) * BY * 0.98 + BCY, Math.sin(ph) * Math.sin(th) * BZ * 0.98));
    }
    const beardM = [...sphere(10, 14, 0.082, 0.06, 0.098, 0.036, -0.116, 0), ...sphere(6, 10, 0.007, 0.008, 0.027, 0.117, -0.093, 0)];

    // ---- hands: mitt with a thumb and a gauntlet cuff (mitt points along +y) ----
    // glove: padded back of the hand, four curled fingers and a thumb (hand space: y 0..1 = wrist..fingertips)
    const mitt = [...sphere(9, 14, 0.05, 0.5, 0.036, 0, 0.42, 0)];
    for (let i = 0; i < 0; i++) {
      const x = -0.03 + i * 0.02, lenK = [0.9, 1, 0.96, 0.82][i];
      const rows = [];
      for (let j = 0; j <= 4; j++) {
        const u = j / 4;
        rows.push({ y: 0.5 + u * 0.46 * lenK, rx: 0.0105 - u * 0.0015, rz: 0.0115 - u * 0.0015, ox: x, oz: -0.016 * u * u });
      }
      mitt.push(...loft(rows, 8, { capTop: true }));
    }
    mitt.push(...loft([{ y: 0.18, rx: 0.016, rz: 0.016, ox: 0.04, oz: -0.012 }, { y: 0.42, rx: 0.015, rz: 0.015, ox: 0.054, oz: -0.024 }, { y: 0.6, rx: 0.012, rz: 0.012, ox: 0.052, oz: -0.03 }], 10, { capTop: true }));
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
      const x0 = sx * 0.045, x1 = sx * 0.056;
      const A = [x0, 0.95, surfZ(x0, 0.95, -1, 0.012)], B = [x1, 0.72, surfZ(x1, 0.72, -1, 0.01)];
      quad(cords, [A[0] - 0.004, A[1], A[2]], [A[0] + 0.004, A[1], A[2]], [B[0] + 0.004, B[1], B[2]], [B[0] - 0.004, B[1], B[2]], [0, 0, -1]);
      toggles.push(...sphere(5, 8, 0.009, 0.03, 0.009, x1, 0.7, surfZ(x1, 0.7, -1, 0.014)));
    }
    const logo = [], logoStripe = [];
    // a small woven patch on the chest, in strips so it follows the curve of the jacket
    for (let j = 0; j < 4; j++) {
      const xa = -0.15 + j * 0.02, xb = xa + 0.02;
      quad(logo, pk(xa, 0.5, 0.006), pk(xb, 0.5, 0.006), pk(xb, 0.555, 0.006), pk(xa, 0.555, 0.006), [0, 0, -1]);
    }
    quad(logoStripe, pk(-0.145, 0.52, 0.006), pk(-0.075, 0.52, 0.006), pk(-0.075, 0.54, 0.006), pk(-0.145, 0.54, 0.006), [0, 0, -1]);
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
      body: mk(body), yoke: mk(yoke), hem: mk(hem), collar: mk(collar), hood: mk(hood), kanga: mk(kanga), zip: mk(zip), pocket: mk(pocket), straps: mk(straps),
      pack: mk(pack), packLid: mk(packLid),
      strapKnit: mk(strapKnit), skull: mk(skull), headEars: mk(headEars), eyeW: mk(eyeW), eyeI: mk(eyeI), brows: mk(brows),
      knit: mk(knit), knitCuff: mk(knitCuff), knitSlouch: mk(knitSlouch), knitPom: mk(knitPom), hoodUp: mk(hoodUp), hoodUpIn: mk(hoodUpIn), hoodEdge: mk(hoodEdge),
      bucket: mk(bucket), brim: mk(brim), hairShort: mk(hairShort), hairPony: mk(hairPony), hairTie: mk(hairTie), hairBob: mk(hairBob), hairCurls: mk(hairCurls), beardM: mk(beardM),
      neckline: mk(neckline), neck: mk(neck),
      helmet: mk(helmet), helmetRim: mk(helmetRim), peak: mk(peak), vents: mk(vents), ears: mk(ears), gaiter: mk(gaiter), face: mk(face), nose: mk(nose), lips: mk(lips), chin: mk(chin), hair: mk(hair), beanie: mk(beanie), beanieCuff: mk(beanieCuff), pom: mk(pom), frame: mk(frame), lens: mk(lens), strap: mk(strap),
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

  // ---- parts shared by every pose
  const TH_B = 0.026;
  function drawBoard(engine, pal, BMx, far) {
    engine.drawLit(meshes.top, BMx, pal.board, 0, pal.boardSh || SH_BOARD);
    engine.drawLit(meshes.gfx, BMx, pal.stripe, 0, pal.boardSh || SH_BOARD);
    engine.drawLit(meshes.base, BMx, BASE);
    engine.drawLit(meshes.baseGfx, BMx, pal.board);
    engine.drawLit(meshes.side, BMx, DARK);
    if (!far) { engine.drawLit(meshes.edge, BMx, STEEL, 0, SH_STEEL); engine.drawLit(meshes.stomp, BMx, DARK, 0, SH_BOOT); }
  }
  // a boot standing at frame BF (sole on y = 0)
  function drawBoot(engine, pal, BF, far) {
    engine.drawLit(meshes.sole, BF, SOLE);
    engine.cloth(0, null, 0, 0.35, 0);
    engine.drawLit(meshes.boot, BF, pal.boot, 0, SH_BOOT);
    engine.cloth(0);
    if (!far) {
      engine.drawLit(meshes.tongue, BF, pal.trim, 0, SH_BOOT);
      engine.drawLit(meshes.laces, BF, LACE, 0, SH_PANTS);
    }
  }
  const FB = M4.create();
  function drawBindings(engine, pal, BMx, far, boots) {
    for (const [fz, yaw] of [[0.25, -0.27], [-0.25, 0.12]]) {
      M4.identity(L);
      M4.translate(L, 0.0, TH_B, fz);
      M4.rotY(L, yaw);
      M4.mul(FF, BMx, L);
      engine.drawLit(meshes.plate, FF, BIND);
      if (!far) engine.drawLit(meshes.highback, FF, BIND, 0, SH_BOOT);
      if (boots) {
        M4.identity(L); M4.translate(L, 0, 0.022, 0);
        M4.mul(FB, FF, L);
        drawBoot(engine, pal, FB, far);
      }
      if (!far) {
        M4.identity(L); M4.translate(L, 0.01, 0.1, 0.094);
        engine.drawLit(meshes.ratchet, M4.mul(W, FF, L), STEEL, 0, SH_STEEL);
        // ankle strap over the instep and a toe strap (empty bindings: the straps lie open)
        M4.identity(L); M4.translate(L, 0.0, boots ? 0.09 : 0.05, 0); M4.rotZ(L, -0.45); M4.scale(L, 0.07, boots ? 0.2 : 0.14, 0.086);
        engine.drawLit(meshes.arch, M4.mul(W, FF, L), pal.board, 0, SH_BOOT);
        M4.identity(L); M4.translate(L, 0.125, boots ? 0.06 : 0.035, 0); M4.scale(L, 0.045, boots ? 0.1 : 0.07, 0.08);
        engine.drawLit(meshes.arch, M4.mul(W, FF, L), BIND, 0, SH_BOOT);
      }
    }
  }
  // the oversized hoodie: body, ribbed hem, the hood down behind the neck (unless it's up),
  // kangaroo pocket and drawcords (torso frame TF)
  const SH_HOODIE = [0.05, 8];
  function drawJacket(engine, pal, far) {
    engine.cloth(pal.pat, pal.patCol, 0.42, 0, 0);
    engine.drawLit(meshes.body, TF, pal.jacket, 0, SH_HOODIE);
    engine.drawLit(meshes.yoke, TF, pal.jacket, 0, SH_HOODIE);
    engine.cloth(0, null, 0.9, 0, 2);
    engine.drawLit(meshes.hem, TF, pal.pouch, 0, SH_HOODIE);
    engine.drawLit(meshes.neckline, TF, pal.pat === 4 ? pal.patCol : pal.jacket, 0, SH_HOODIE);
    engine.cloth(0, null, 0.7, 0, 0);
    if (pal.hat !== 'hood') engine.drawLit(meshes.hood, TF, pal.pat === 4 ? pal.patCol : pal.jacket, 0, SH_HOODIE);
    engine.cloth(0);
    engine.drawLit(meshes.neck, TF, pal.skin, 0, null, 2);
    engine.drawLit(meshes.kanga, TF, pal.pouch, 0, SH_HOODIE);
    if (!far) {
      engine.drawLit(meshes.cords, TF, pal.cordCol, 0, SH_HOODIE);
      engine.drawLit(meshes.toggles, TF, pal.cordCol, 0, SH_JACKET);
    }
  }
  // the head: face, eyes when the goggles are up, hair, the hat, a neck gaiter, goggles (head frame HF)
  const GU = M4.create();
  function drawHead(engine, pal, far) {
    const hood = pal.hat === 'hood';
    engine.drawLit(meshes.skull, HF, pal.skin, 0, null, 2);
    engine.drawLit(meshes.face, HF, pal.skin, 0, null, 2);
    if (!far) {
      engine.drawLit(meshes.headEars, HF, pal.skin, 0, null, 2);
      engine.drawLit(meshes.nose, HF, pal.skin, 0, null, 2);
      if (!pal.gaiterOn) engine.drawLit(meshes.lips, HF, pal.lips, 0, null, 2);
      if (pal.eyes === 'up') {
        engine.drawLit(meshes.eyeW, HF, [0.93, 0.93, 0.92], 0, [0.4, 40]);
        engine.drawLit(meshes.eyeI, HF, pal.eyeCol, 0, [0.6, 60]);
        engine.drawLit(meshes.brows, HF, pal.hair, 0, null);
      }
    }
    // hair under the hat
    const hs = pal.hairStyle;
    if (!hood && hs && hs !== 'none') {
      const hm = hs === 'pony' ? meshes.hairPony : hs === 'bob' ? meshes.hairBob : hs === 'curls' ? meshes.hairCurls : meshes.hairShort;
      engine.cloth(0, null, 0.5, 0, 0);
      engine.drawLit(hm, HF, pal.hair, 0, [0.18, 20]);
      engine.cloth(0);
      if (hs === 'pony' && !far) engine.drawLit(meshes.hairTie, HF, pal.trim, 0, SH_JACKET);
    }
    if (pal.beard) engine.drawLit(meshes.beardM, HF, pal.hair, 0, [0.1, 10]);
    // the hat
    if (pal.hat === 'bucket') {
      engine.cloth(0, null, 0.35, 0, 0);
      engine.drawLit(meshes.bucket, HF, pal.hatCol, 0, pal.helmetSh || SH_PANTS);
      engine.drawLit(meshes.brim, HF, pal.hatCol, 0, pal.helmetSh || SH_PANTS);
      engine.cloth(0);
    } else {
      engine.cloth(0, null, 1, 0, 2);
      engine.drawLit(meshes.knit, HF, pal.hatCol, 0, pal.helmetSh || SH_PANTS);
      if (pal.cuffOn) engine.drawLit(meshes.knitCuff, HF, pal.hatDark, 0, pal.helmetSh || SH_PANTS);
      if (pal.slouch && !hood) engine.drawLit(meshes.knitSlouch, HF, pal.hatCol, 0, pal.helmetSh || SH_PANTS);
      if (pal.pomOn && !hood) {
        engine.cloth(0, null, 0.6, 0, 2);
        engine.drawLit(meshes.knitPom, HF, pal.cordCol, 0, SH_PANTS);
      }
      engine.cloth(0);
    }
    if (hood) {
      engine.cloth(0, null, 0.55, 0, 0);
      engine.drawLit(meshes.hoodUp, HF, pal.jacket, 0, SH_HOODIE);
      engine.drawLit(meshes.hoodUpIn, HF, pal.hoodIn, 0, null);
      engine.drawLit(meshes.hoodEdge, HF, pal.pat === 4 ? pal.patCol : pal.pouch, 0, SH_HOODIE);
      engine.cloth(0);
    }
    if (pal.gaiterOn) {
      engine.cloth(0, null, 0.8, 0, 0);
      engine.drawLit(meshes.gaiter, HF, pal.trim[0] + pal.trim[1] + pal.trim[2] > 0.5 ? pal.trim : pal.pouch, 0, SH_PANTS);
      engine.cloth(0);
    }
    // goggles: over the eyes, or pushed up onto the hat
    let G = HF;
    if (pal.eyes === 'up') {
      M4.identity(L);
      if (pal.hat === 'bucket') {
        // round the crown of the bucket hat, like a hat band
        M4.translate(L, -0.008, 0.1, 0);
        M4.rotZ(L, 0.1);
        M4.scale(L, 0.97, 0.97, 0.97);
      } else {
        M4.translate(L, -0.006, 0.072, 0);
        M4.rotZ(L, 0.42);
        M4.scale(L, 0.9, 0.9, 0.9);
      }
      G = M4.mul(GU, HF, L);
    }
    engine.drawLit(hood ? meshes.strap : meshes.strapKnit, G, pal.strapCol, 0, SH_JACKET);
    engine.drawLit(meshes.frame, G, pal.frameCol, 0, SH_SHELL);
    engine.drawLit(meshes.lens, G, pal.lens, 0, SH_LENS, 3);
  }
  // an arm from shoulder s0 to hand target h1, the elbow bending toward `bend` (body frame)
  function drawArm(engine, pal, base, s0, h1, bend, far) {
    const hand = reach(s0, h1, ARM_U + ARM_F - 0.005);
    const elbow = ik(s0, hand, ARM_U, ARM_F, bend);
    engine.cloth(0, null, 0.3, 0, 0);
    ball(engine, base, s0, 0.104, pal.pat === 4 ? pal.patCol : pal.jacket, SH_HOODIE);
    ball(engine, base, elbow, 0.096, pal.jacket, SH_HOODIE);
    engine.cloth(pal.pat, pal.patCol, 0.5, 0, 1);
    limb(engine, base, meshes.sleeveUp, s0, elbow, pal.jacket, SH_HOODIE);
    const dir = nrm(sub(hand, elbow));
    const wrist = add(hand, [-dir[0] * 0.03, -dir[1] * 0.03, -dir[2] * 0.03]);
    engine.cloth(0, null, 0.6, 0, 1);
    limb(engine, base, meshes.sleeveLo, elbow, wrist, pal.jacket, SH_HOODIE);
    engine.cloth(0);
    const tip = add(hand, [dir[0] * 0.12, dir[1] * 0.12, dir[2] * 0.12]);
    const palmSide = nrm(cross(dir, [0, 1, 0]));
    if (!far) {
      const c1 = add(wrist, [dir[0] * 0.05, dir[1] * 0.05, dir[2] * 0.05]);
      engine.drawLit(meshes.cuff, seg(base, wrist, c1, 1, 1, palmSide), pal.glove, 0, SH_JACKET);
    }
    engine.cloth(0, null, 0.3, 0.25, 0);
    engine.drawLit(meshes.mitt, seg(base, add(hand, [-dir[0] * 0.02, -dir[1] * 0.02, -dir[2] * 0.02]), tip, 1, 1, palmSide), pal.glove, 0, SH_BOOT);
    engine.cloth(0);
  }

  // ================================================================== sculpted riders
  // One continuous body (hoodie, sleeves, mitts, baggy pants, neck) sculpted in a rest pose and
  // skinned to 11 bones, and a sculpted head per rider (face, hat, hair, goggles) that rides on the
  // head bone. Built the first time they're needed. Rest pose: standing on the board, body frame
  // (x toward the toes, y up, z toward the nose; the front arm and leg are on +z).
  const S3 = SS.Sculpt;
  const BN = { pelvis: 0, spine: 1, head: 2, thighF: 3, shinF: 4, thighB: 5, shinB: 6, upF: 7, foreF: 8, upB: 9, foreB: 10 };
  const NB = 11;
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vsc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
  const vn = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const vx = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const perp = (v, d) => vsub(v, vsc(d, vdot(v, d)));
  // the rest skeleton
  const R0 = (() => {
    const r = { P0: [-0.03, 0.94, 0], W0: [-0.035, 0.91, 0], N0: [0.012, 1.595, 0], H0: [0.045, 1.735, 0] };
    for (const [k, s] of [['F', 1], ['B', -1]]) {
      const hj = [-0.03, 0.92, 0.115 * s], an = [-0.03, 0.145, 0.26 * s];
      r['hj' + k] = hj; r['an' + k] = an;
      r['kn' + k] = vadd(hj, vsc(vn(vsub(an, hj)), LEG_T));
      r['lb' + k] = [1, 0.1, 0.276 * s];
      // built in an A-pose, arms held out from the body, so the jacket never gets tied to the forearms
      const sj = [0, 1.445, 0.205 * s], hand = vadd(sj, [0.07, -0.47, 0.26 * s]), ab = [-0.55, -0.6, 0.75 * s];
      r['sj' + k] = sj; r['ha' + k] = hand; r['ab' + k] = ab;
      r['el' + k] = ik(sj, hand, ARM_U, ARM_F, ab);
    }
    return r;
  })();
  // a bone frame: origin o, y along d, z the joint's hinge (columns, like M4)
  function frame(o, d, hinge, out) {
    const y = vn(d);
    let z = perp(hinge, y);
    if (vlen(z) < 1e-5) z = perp([0, 0, 1], y);
    z = vn(z);
    const x = vx(y, z);
    out[0] = x[0]; out[1] = x[1]; out[2] = x[2]; out[3] = 0;
    out[4] = y[0]; out[5] = y[1]; out[6] = y[2]; out[7] = 0;
    out[8] = z[0]; out[9] = z[1]; out[10] = z[2]; out[11] = 0;
    out[12] = o[0]; out[13] = o[1]; out[14] = o[2]; out[15] = 1;
    return out;
  }
  // the torso frame, same as seg(): x across, y from waist to neck (scaled to its length)
  function torsoFrame(w, n, across, out) {
    const d = vsub(n, w), len = vlen(d) || 1e-4, y = vsc(d, 1 / len);
    let s = perp(across, y);
    if (vlen(s) < 1e-5) s = [0, 0, 1];
    s = vn(s);
    const z = vx(s, y);
    out[0] = s[0]; out[1] = s[1]; out[2] = s[2]; out[3] = 0;
    out[4] = y[0] * len; out[5] = y[1] * len; out[6] = y[2] * len; out[7] = 0;
    out[8] = z[0]; out[9] = z[1]; out[10] = z[2]; out[11] = 0;
    out[12] = w[0]; out[13] = w[1]; out[14] = w[2]; out[15] = 1;
    return out;
  }
  function inv4(m, out) {
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1e-9, k = 1 / det;
    out[0] = A * k; out[1] = -(b * i - c * h) * k; out[2] = (b * f - c * e) * k; out[3] = 0;
    out[4] = B * k; out[5] = (a * i - c * g) * k; out[6] = -(a * f - c * d) * k; out[7] = 0;
    out[8] = C * k; out[9] = -(a * h - b * g) * k; out[10] = (a * e - b * d) * k; out[11] = 0;
    const tx = m[12], ty = m[13], tz = m[14];
    out[12] = -(out[0] * tx + out[4] * ty + out[8] * tz);
    out[13] = -(out[1] * tx + out[5] * ty + out[9] * tz);
    out[14] = -(out[2] * tx + out[6] * ty + out[10] * tz);
    out[15] = 1;
    return out;
  }
  const hingeOf = (a, b, bend) => { const d = vn(vsub(b, a)); return vn(vx(d, perp(bend, d))); };
  // rest frames (inverted), so a bone's matrix = its current frame * this
  const RI = [];
  {
    const T = M4.create();
    for (let b = 0; b < NB; b++) RI.push(M4.create());
    M4.identity(T); M4.translate(T, R0.P0[0], R0.P0[1], R0.P0[2]); inv4(T, RI[BN.pelvis]);
    inv4(torsoFrame(R0.W0, R0.N0, [0, 0, 1], T), RI[BN.spine]);
    M4.identity(T); M4.translate(T, R0.H0[0], R0.H0[1], R0.H0[2]); M4.scale(T, 1.1, 1.1, 1.1); inv4(T, RI[BN.head]);
    for (const k of ['F', 'B']) {
      const hL = hingeOf(R0['hj' + k], R0['an' + k], R0['lb' + k]);
      inv4(frame(R0['hj' + k], vsub(R0['kn' + k], R0['hj' + k]), hL, T), RI[BN['thigh' + k]]);
      inv4(frame(R0['kn' + k], vsub(R0['an' + k], R0['kn' + k]), hL, T), RI[BN['shin' + k]]);
      const hA = hingeOf(R0['sj' + k], R0['ha' + k], R0['ab' + k]);
      inv4(frame(R0['sj' + k], vsub(R0['el' + k], R0['sj' + k]), hA, T), RI[BN['up' + k]]);
      inv4(frame(R0['el' + k], vsub(R0['ha' + k], R0['el' + k]), hA, T), RI[BN['fore' + k]]);
    }
  }

  // body materials
  const BM_SKIN = 0, BM_JACKET = 1, BM_YOKE = 2, BM_BAND = 3, BM_POUCH = 4, BM_PANTS = 5, BM_GLOVE = 6, BM_HOOD = 7, BM_LOGO = 8, BM_ZIP = 9;
  // the zipped hand pockets: a slanted slit low on each side of the front
  const pocketF = (x, y, z) => (y < 0.87 || y > 0.99 ? 1 : Math.abs(Math.abs(z) - 0.118) - 0.0045);
  const zipF = (x, y, z) => Math.abs(z) - 0.0075;
  // the woven brand tag on the left chest
  const tagF = [(x, y) => Math.abs(y - 1.338) - 0.019, (x, y, z) => Math.abs(z + 0.092) - 0.034];
  function bodyNodes() {
    const { ell, tube, box, torus, plane, group } = S3;
    const L = [];
    // ---- the jacket: clean and roomy, straight down to a thin dark hem; a tall funnel collar zipped
    // up under the goggles, a front zip, two pocket slits, the hood lying flat behind the collar
    const hoodiePaint = (x, y, z, m) => {
      if (y < 0.765) return BM_POUCH;                                    // hem band
      if (x > 0.05 && y < 1.71 && zipF(x, y, z) < 0) return BM_ZIP;      // front zip
      if (x > 0.06 && pocketF(x, y, z) < 0) return BM_ZIP;               // pocket slits
      if (x > 0.03 && tagF[0](x, y, z) < 0 && tagF[1](x, y, z) < 0) return BM_LOGO; // brand tag
      if (y > 1.372 - 0.02 * Math.cos(Math.atan2(z, x) * 2)) return BM_YOKE; // shoulders and collar
      if (Math.abs(y - 1.235) < 0.055) return BM_BAND;                    // band across the chest
      return m;
    };
    const jk = group([
      // a real build under the jacket: chest and shoulder blades up top, a narrower waist,
      // the jacket falling over the hips; shoulders sloping down from the neck to round caps
      // a puffy jacket standing off the body: full through the chest and back, falling straight
      ell([0.0, 1.27, 0], [0.152, 0.2, 0.232], { mat: BM_JACKET, paint: hoodiePaint }),
      ell([-0.04, 1.3, 0], [0.13, 0.17, 0.222], { k: 0.06, mat: BM_JACKET, paint: hoodiePaint }),
      ell([-0.01, 1.04, 0], [0.155, 0.24, 0.236], { k: 0.09, mat: BM_JACKET, paint: hoodiePaint }),
      ell([-0.02, 0.86, 0], [0.172, 0.3, 0.272], { k: 0.09, mat: BM_JACKET, paint: hoodiePaint }),
      // rounded, dropped shoulders
      tube([-0.01, 1.51, -0.05], [-0.006, 1.44, -0.2], 0.078, 0.082, { k: 0.05, mat: BM_JACKET, paint: hoodiePaint }),
      tube([-0.01, 1.51, 0.05], [-0.006, 1.44, 0.2], 0.078, 0.082, { k: 0.05, mat: BM_JACKET, paint: hoodiePaint }),
      ell([0.0, 1.415, -0.215], [0.09, 0.09, 0.088], { k: 0.04, mat: BM_JACKET, paint: hoodiePaint }),
      ell([0.0, 1.415, 0.215], [0.09, 0.09, 0.088], { k: 0.04, mat: BM_JACKET, paint: hoodiePaint }),
      // a tall funnel collar, zipped right up round the chin, a little wider at the top
      tube([0.004, 1.45, 0], [0.058, 1.7, 0], 0.104, 0.122, { k: 0.03, mat: BM_JACKET, paint: hoodiePaint }),
      plane([0, 0.715, 0], [0, -1, 0], { op: 'int', k: 0.012 }),
    ], { bone: BN.spine, mat: BM_JACKET });
    L.push(jk);
    // the chest band: a panel sewn on round the body, standing a few mm proud
    L.push(S3.custom((x, y, z) => Math.max(jk.d(x, y, z) - 0.004, Math.abs(y - 1.235) - 0.055),
      [-0.3, 1.17, -0.3, 0.3, 1.3, 0.3], { bone: BN.spine, mat: BM_BAND, bias: 0.002 }));
    // ---- neck (inside the collar)
    L.push(tube([0.004, 1.47, 0], [0.018, 1.6, 0], 0.056, 0.054, { k: 0.014, bone: BN.spine, mat: BM_SKIN }));
    L.push(tube([0.018, 1.6, 0], [0.032, 1.69, 0], 0.053, 0.052, { k: 0.02, bone: BN.head, mat: BM_SKIN }));
    // ---- smooth sleeves, a dark cuff and chunky mitts
    for (const k of ['F', 'B']) {
      const sj = R0['sj' + k], el = R0['el' + k], ha = R0['ha' + k];
      const du = vn(vsub(el, sj)), df = vn(vsub(ha, el));
      const upPaint = (x, y, z, m) => {
        const t = vdot(vsub([x, y, z], sj), du) / ARM_U;
        if (t < 0.4) return BM_YOKE;
        if (Math.abs(t - 0.62) < 0.13) return BM_BAND;
        return m;
      };
      L.push(tube(vadd(sj, vsc(du, -0.03)), el, 0, 0, { prof: (t) => 0.094 - 0.005 * t, k: 0.035, bone: BN['up' + k], mat: BM_JACKET, paint: upPaint }));
      L.push(ell(el, [0.09, 0.09, 0.09], { k: 0.03, bone: BN['fore' + k], mat: BM_JACKET }));
      const wr = vadd(ha, vsc(df, -0.07));
      L.push(tube(el, wr, 0, 0, { prof: (t) => 0.088 - 0.01 * t, k: 0.03, bone: BN['fore' + k], mat: BM_JACKET }));
      const hinge = hingeOf(sj, ha, R0['ab' + k]);
      const v = vn(perp(hinge, df));
      let w = vx(df, v);
      if (w[0] < 0) w = vsc(w, -1);
      const mc = vadd(ha, vsc(df, 0.03));
      L.push(ell(mc, [0.074, 0.046, 0.058], { ax: [df, v, w], k: 0.025, bone: BN['fore' + k], mat: BM_GLOVE }));
      L.push(tube(vadd(vadd(ha, vsc(df, -0.01)), vsc(w, 0.04)), vadd(vadd(ha, vsc(df, 0.04)), vsc(w, 0.072)), 0.026, 0.022, { k: 0.018, bone: BN['fore' + k], mat: BM_GLOVE }));
      L.push(tube(vadd(ha, vsc(df, -0.05)), vadd(ha, vsc(df, -0.005)), 0.058, 0.06, { k: 0.02, bone: BN['fore' + k], mat: BM_GLOVE }));
    }
    // ---- straight, wide pants down over the boots
    L.push(ell([-0.03, 0.84, 0], [0.12, 0.11, 0.19], { bone: BN.pelvis, mat: BM_PANTS }));
    L.push(ell([0.025, 0.84, 0], [0.1, 0.1, 0.18], { k: 0.06, bone: BN.pelvis, mat: BM_PANTS }));
    for (const k of ['F', 'B']) {
      const hj = R0['hj' + k], kn = R0['kn' + k], an = R0['an' + k];
      const dl = vn(vsub(an, kn));
      // the leg starts a little below the hip joint, so its top stays inside the jacket
      L.push(tube(vadd(hj, vsc(vn(vsub(kn, hj)), 0.12)), kn, 0, 0, { prof: (t) => { const q = Math.min(1, t / 0.4); return 0.085 + 0.045 * q * q * (3 - 2 * q); }, k: 0.07, bone: BN['thigh' + k], mat: BM_PANTS }));
      L.push(ell(kn, [0.124, 0.124, 0.124], { k: 0.05, bone: BN['shin' + k], mat: BM_PANTS }));
      L.push(tube(kn, vadd(an, vsc(dl, 0.04)), 0, 0, { prof: (t) => 0.12 + 0.022 * t, k: 0.04, bone: BN['shin' + k], mat: BM_PANTS, disp: (x, y, z) => (y < 0.36 ? 0.007 * Math.sin(y * 55) * (1 - y / 0.36) : 0) }));
    }
    return L;
  }

  // head materials
  const HM_SKIN = 0, HM_MASK = 1, HM_HAIR = 2, HM_HAT = 3, HM_VENT = 4, HM_PAD = 5, HM_HOOD = 6, HM_HOODIN = 7, HM_FRAME = 8, HM_LENS = 9, HM_STRAP = 10, HM_TIE = 12;
  // the helmet shell, and its rim: low at the back and over the ears, up at the brow
  const SHELL_C = [-0.016, 0.03, 0], SHELL_R = [0.134, 0.142, 0.12];
  const RIM_N = vn([0.6, -1, 0]);
  const rimF = (x, y, z) => x * RIM_N[0] + (y + 0.02) * RIM_N[1];
  const VENTS = [-0.062, -0.022, 0.022, 0.062];
  const ventF = (x, y, z) => { if (y < 0.1 || Math.abs(x + 0.004) > 0.058) return 1; let d = 1; for (const zc of VENTS) d = Math.min(d, Math.abs(z - zc) - 0.0072); return d; };
  const HOOD_C = [-0.04, 0.02, 0], HOOD_R = [0.168, 0.182, 0.158];
  function headNodes(r) {
    const { ell, tube, torus, plane, group } = S3;
    const L = [];
    const cuts = [];
    L.cuts = cuts;
    const skinMat = HM_SKIN;
    // r.part: none for the head itself; 'goggles' for the goggles alone (built finer, on their own);
    // 'helmet' for the shop's picture of a helmet on its own
    const onlyGog = r.part === 'goggles', onlyHelm = r.part === 'helmet';
    if (!r.part) {
    // ---- the head and neck underneath (a balaclava covers all of it)
    L.push(ell([-0.012, 0.012, 0], [0.1, 0.108, 0.088], { mat: skinMat }));
    L.push(ell([0.026, -0.045, 0], [0.08, 0.075, 0.074], { k: 0.04, mat: skinMat }));
    L.push(ell([0.05, -0.088, 0], [0.054, 0.04, 0.056], { k: 0.035, mat: skinMat }));
    L.push(tube([-0.018, -0.07, 0], [-0.026, -0.16, 0], 0.05, 0.052, { k: 0.03, mat: skinMat }));
    // ---- the face below the goggles: a nose and cheeks; the collar comes up over the mouth
    L.push(ell([0.098, -0.04, 0], [0.024, 0.032, 0.017], { k: 0.022, mat: HM_SKIN }));
    for (const sd of [1, -1]) L.push(ell([0.07, -0.045, 0.045 * sd], [0.036, 0.032, 0.03], { k: 0.03, mat: HM_SKIN }));
    // ---- a ponytail out the back, under the helmet
    if (r.hairStyle === 'pony') {
      const strand = (x, y, z) => 0.0016 * Math.sin(Math.atan2(z, x + 0.16) * 22 + y * 30);
      L.push(tube([-0.112, -0.055, 0], [-0.158, -0.1, 0], 0.03, 0.027, { k: 0.02, mat: HM_HAIR, disp: strand }));
      L.push(tube([-0.158, -0.1, 0], [-0.168, -0.245, 0], 0.027, 0.009, { k: 0.02, mat: HM_HAIR, disp: strand }));
      L.push(torus([-0.13, -0.07, 0], vn([-0.7, -0.7, 0]), 0.028, 0.008, { k: 0.004, mat: HM_TIE }));
    }
    }
    if (!onlyGog) {
    // ---- the helmet: a smooth hard shell with a dark rim trim
    const inner = (x, y, z) => ((x - SHELL_C[0]) / SHELL_R[0]) ** 2 + ((y - SHELL_C[1]) / SHELL_R[1]) ** 2 + ((z - SHELL_C[2]) / SHELL_R[2]) ** 2 < 0.86;
    const shellPaint = (x, y, z, m) => (onlyHelm && inner(x, y, z) ? HM_VENT : m);
    const shell = [ell(SHELL_C, SHELL_R, { mat: HM_HAT, paint: shellPaint }), plane([0, -0.02, 0], RIM_N, { op: 'int', k: 0.008 })];
    // on its own the helmet is a hollow shell with a dark lining
    if (onlyHelm) shell.push(ell(SHELL_C, [SHELL_R[0] - 0.013, SHELL_R[1] - 0.013, SHELL_R[2] - 0.013], { op: 'sub', k: 0.003 }));
    L.push(group(shell, { k: 0.004, mat: HM_HAT, paint: shellPaint }));
    cuts.push((x, y, z) => rimF(x, y, z) + 0.009);
    if (r.helmet === 'peak') {
      // a short visor over the goggles
      L.push(group([
        ell([0.1, 0.066, 0], [0.062, 0.0095, 0.094], { mat: HM_HAT }),
        plane([0.07, 0, 0], [-1, 0, 0], { op: 'int', k: 0.004 }),
      ], { k: 0.006, mat: HM_HAT }));
    }
    if (r.helmet === 'pads') {
      // soft ear pads under the rim
      for (const sd of [1, -1]) L.push(ell([-0.012, -0.044, 0.112 * sd], [0.05, 0.056, 0.024], { k: 0.012, mat: HM_PAD, bias: 0.004, disp: (x, y, z) => 0.0012 * Math.sin(y * 150) }));
    }
    }
    if (r.hood && !r.part) {
      // the jacket's hood up over the helmet
      L.push(group([
        ell(HOOD_C, HOOD_R, { mat: HM_HOOD, paint: (x, y, z) => (((x - HOOD_C[0]) / HOOD_R[0]) ** 2 + ((y - HOOD_C[1]) / HOOD_R[1]) ** 2 + ((z - HOOD_C[2]) / HOOD_R[2]) ** 2 < 0.86 ? HM_HOODIN : HM_HOOD) }),
        ell([-0.036, 0.014, 0], [0.15, 0.166, 0.141], { op: 'sub', k: 0.006 }),
        ell([0.15, -0.03, 0], [0.12, 0.145, 0.104], { op: 'sub', k: 0.02 }),
        plane([0, -0.2, 0], [0, -1, 0], { op: 'int', k: 0.02 }),
      ], { k: 0.006, mat: HM_HOOD, disp: (x, y, z) => 0.0016 * Math.sin(y * 70 + Math.atan2(z, x) * 5) }));
      cuts.push((x, y, z) => ((x - HOOD_C[0]) / HOOD_R[0]) ** 2 + ((y - HOOD_C[1]) / HOOD_R[1]) ** 2 + ((z - HOOD_C[2]) / HOOD_R[2]) ** 2 - 0.86);
    }
    // ---- goggles: a big frame and lens over the eyes, the strap round the helmet
    if (onlyGog) {
    // ---- ski goggles: a wide frame, a rounded rectangle curved round the face with a cut-out for
    // the nose, a domed lens standing proud of it, and a wide strap round the back of the helmet
    const GX = -0.02, GY = 0.003, GR = 0.14, GT = 0.014, GW = 0.154, GH = 0.05;
    const rrect = (u, v, w, h, rc) => { const qx = Math.abs(u) - w + rc, qy = Math.abs(v) - h + rc; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc; };
    const gcyl = (x, y, z) => { const dx = x - GX, r = Math.hypot(dx, z); return [Math.atan2(z, dx) * GR, y - GY, r]; };
    const gbb = [GX, GY - GH - 0.01, -0.16, 0.18, GY + GH + 0.01, 0.16];
    L.push(S3.custom((x, y, z) => {
      const [u, v, r] = gcyl(x, y, z);
      const face = Math.max(rrect(u, v, GW, GH, 0.032), -(Math.hypot(u, v + GH + 0.004) - 0.027));
      return S3.smax(face, Math.abs(r - GR) - GT, 0.007);
    }, gbb, { mat: HM_FRAME }));
    L.push(S3.custom((x, y, z) => {
      const [u, v, r] = gcyl(x, y, z);
      const face = Math.max(rrect(u, v, GW - 0.015, GH - 0.014, 0.024), -(Math.hypot(u, v + GH + 0.004) - 0.041));
      const dome = 0.011 * Math.max(0, 1 - (u / GW) ** 2) * Math.max(0, 1 - (v / GH) ** 2);
      return S3.smax(face, Math.max(GR - r, r - (GR + GT + 0.004 + dome)), 0.004);
    }, gbb, { mat: HM_LENS }));
    // a crisp edge where the lens meets the frame
    cuts.push((x, y, z) => { const [u, v, rr] = gcyl(x, y, z); return rr < GR ? 1 : Math.max(rrect(u, v, GW - 0.015, GH - 0.014, 0.024), -(Math.hypot(u, v + GH + 0.004) - 0.041)); });
    if (!r.hood) {
      const sr = [0.137, 0.024, 0.124];
      L.push(group([
        ell([-0.016, GY, 0], sr, { mat: HM_STRAP }),
        ell([-0.016, GY, 0], [sr[0] - 0.008, 0.04, sr[2] - 0.008], { op: 'sub', k: 0.002 }),
        plane([0.06, 0, 0], [1, 0, 0], { op: 'int', k: 0.004 }),
      ], { k: 0.002, mat: HM_STRAP }));
    }
    }
    return L;
  }

  SS.riderSculpt = { headNodes, bodyNodes };
  // ---- building and drawing
  let BODY = null;
  // one mesh from several: vertices appended, triangles regrouped by material
  function mergeMeshes(list) {
    let n = 0, ni = 0;
    for (const m of list) { n += m.n; ni += m.idx.length; }
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), b0 = new Uint8Array(n), b1 = new Uint8Array(n), w = new Float32Array(n), ao = new Float32Array(n).fill(1);
    const byMat = {};
    let vo = 0;
    for (const m of list) {
      pos.set(m.pos, vo * 3); nrm.set(m.nrm, vo * 3); b0.set(m.b0, vo); b1.set(m.b1, vo); w.set(m.w, vo);
      if (m.ao) ao.set(m.ao, vo);
      for (const [mat, [first, cnt]] of Object.entries(m.ranges)) {
        const arr = byMat[mat] || (byMat[mat] = []);
        for (let i = first; i < first + cnt; i++) arr.push(m.idx[i] + vo);
      }
      vo += m.n;
    }
    const idx = new Uint16Array(ni), ranges = {};
    let o = 0;
    for (const mat of Object.keys(byMat).map(Number).sort((a, b) => a - b)) { ranges[mat] = [o, byMat[mat].length]; idx.set(byMat[mat], o); o += byMat[mat].length; }
    return { n, pos, nrm, idx, ranges, b0, b1, w, ao, h: list[0].h };
  }
  const HEADS = {};
  function meshFrom(engine, m, dynamic) {
    const v = S3.interleave(m);
    const g = engine.indexed(v, m.idx, dynamic, dynamic ? m.pos : null);
    return { src: m, gpu: g, ranges: m.ranges };
  }
  function bodyMesh(engine, lod) {
    if (!BODY) {
      const nodes = bodyNodes();
      const cuts = [(x, y) => y - 0.765, (x, y, z) => y - (1.372 - 0.02 * Math.cos(Math.atan2(z, x) * 2)), (x, y) => y - 1.18, (x, y) => y - 1.29];
      for (const k of ['F', 'B']) {
        const sj = R0['sj' + k], du = vn(vsub(R0['el' + k], sj));
        for (const t0 of [0.4, 0.49, 0.75]) cuts.push((x, y, z) => ((x - sj[0]) * du[0] + (y - sj[1]) * du[1] + (z - sj[2]) * du[2]) / ARM_U - t0);
      }
      cuts.push((x, y, z) => (x > 0.03 && Math.abs(z + 0.092) < 0.06 ? tagF[0](x, y, z) : 1), (x, y, z) => (x > 0.03 && Math.abs(y - 1.338) < 0.05 ? tagF[1](x, y, z) : 1));
      cuts.push((x, y, z) => (x > 0.05 && y > 0.8 && y < 1.71 ? zipF(x, y, z) : 1), (x, y, z) => (x > 0.06 ? pocketF(x, y, z) : 1));
      const box = { min: [-0.3, 0.06, -0.5], max: [0.34, 1.74, 0.5], nb: NB, sigma: 0.022, cuts, ao: 0.022 };
      // the jacket, the pants and the gloves are separate pieces of clothing, each built on its own,
      // so where they meet is a real overlap with a clean edge, not one surface painted two colours
      const parts = [
        nodes.filter((n) => n.mat !== BM_GLOVE && n.mat !== BM_PANTS && n.mat !== BM_SKIN),
        nodes.filter((n) => n.mat === BM_PANTS || n.mat === BM_SKIN),
        nodes.filter((n) => n.mat === BM_GLOVE),
      ];
      BODY = [0.014, 0.026].map((h) => mergeMeshes(parts.map((pl) => S3.build(pl, Object.assign({ h }, box)))));
      BODY.gpu = [null, null];
      BODY.pool = [];
    }
    return BODY[lod];
  }
  function headMesh(engine, pal, lod) {
    const id = pal.riderId || 'kai';
    let H = HEADS[id];
    if (!H) H = HEADS[id] = [null, null];
    if (!H[lod]) {
      const r = { helmet: pal.helmetType, mask: pal.mask, hood: pal.hoodUp, hairStyle: pal.hairStyle };
      const nodes = headNodes(r);
      const m = S3.build(nodes, {
        ao: 0.007, min: [-0.22, -0.28, -0.22], max: [0.23, 0.215, 0.22], h: (lod ? 0.011 : 0.0054) * (r.hood ? 1.15 : 1), cuts: nodes.cuts });
      H[lod] = { m, gpu: engine.indexed(S3.interleave(m), m.idx, false, null, m.ao) };
    }
    return H[lod];
  }
  const GOG = [null, null], HELMS = {};
  function gogMesh(engine, lod) {
    if (!GOG[lod]) {
      const nodes = headNodes({ part: 'goggles' });
      const m = S3.build(nodes, { ao: 0.004, min: [-0.17, -0.07, -0.165], max: [0.19, 0.075, 0.165], h: lod ? 0.008 : 0.0028, cuts: nodes.cuts });
      GOG[lod] = { m, gpu: engine.indexed(S3.interleave(m), m.idx, false, null, m.ao) };
    }
    return GOG[lod];
  }
  function helmMesh(engine, pal) {
    const k = pal.helmetType || 'vent';
    if (!HELMS[k]) {
      const nodes = headNodes({ part: 'helmet', helmet: k });
      const m = S3.build(nodes, { ao: 0.006, min: [-0.17, -0.12, -0.16], max: [0.2, 0.2, 0.16], h: 0.004, cuts: nodes.cuts });
      HELMS[k] = { m, gpu: engine.indexed(S3.interleave(m), m.idx, false, null, m.ao) };
    }
    return HELMS[k];
  }
  // a few skinned copies are kept, so a rider drawn twice in a frame (shadow, then colour) is skinned once
  const BONES = new Float32Array(NB * 16);
  function skinned(engine, lod) {
    const src = BODY[lod];
    const pool = BODY.pool;
    for (const s of pool) {
      if (s.lod !== lod) continue;
      let same = true;
      for (let i = 0; i < BONES.length; i++) if (s.bones[i] !== BONES[i]) { same = false; break; }
      if (same) { s.used = ++BODY.tick; return s; }
    }
    let s = null;
    if (pool.length < 6) {
      s = { lod, bones: new Float32Array(NB * 16), data: new Float32Array(src.n * 6), b: null, used: 0 };
      s.b = engine.indexed(s.data, src.idx, true, src.pos, src.ao);
      pool.push(s);
    } else {
      s = pool.filter((q) => q.lod === lod).sort((a, b) => a.used - b.used)[0];
      if (!s) { s = pool.sort((a, b) => a.used - b.used)[0]; s.lod = lod; s.data = new Float32Array(src.n * 6); s.b = engine.indexed(s.data, src.idx, true, src.pos, src.ao); }
    }
    s.bones.set(BONES);
    S3.skin(src, BONES, s.data);
    engine.upload(s.b.b, s.data);
    s.used = BODY.tick = (BODY.tick || 0) + 1;
    return s;
  }
  // the bones from a pose (body frame): hips, torso and head first (the shoulders hang off the
  // torso), then the legs and arms
  const TMPF = M4.create();
  const B = (i) => BONES.subarray(i * 16, i * 16 + 16);
  function setTorso(J) {
    M4.identity(TMPF); M4.translate(TMPF, J.hip[0] - R0.P0[0], J.hip[1] - R0.P0[1], J.hip[2] - R0.P0[2]);
    B(BN.pelvis).set(TMPF);
    M4.mul(B(BN.spine), torsoFrame(J.waist, J.neck, J.across, TMPF), RI[BN.spine]);
    M4.mul(B(BN.head), J.HL, RI[BN.head]);
  }
  function setLimbs(J) {
    for (const k of ['F', 'B']) {
      const hp = J['hp' + k], kn = J['kn' + k], an = J['an' + k];
      const hL = hingeOf(hp, an, J['lb' + k]);
      M4.mul(B(BN['thigh' + k]), frame(hp, vsub(kn, hp), hL, TMPF), RI[BN['thigh' + k]]);
      M4.mul(B(BN['shin' + k]), frame(kn, vsub(an, kn), hL, TMPF), RI[BN['shin' + k]]);
      const s0 = J['s' + k], el = J['el' + k], ha = J['ha' + k];
      const hA = hingeOf(s0, ha, J['ab' + k]);
      M4.mul(B(BN['up' + k]), frame(s0, vsub(el, s0), hA, TMPF), RI[BN['up' + k]]);
      M4.mul(B(BN['fore' + k]), frame(el, vsub(ha, el), hA, TMPF), RI[BN['fore' + k]]);
    }
  }
  // where a rest-pose point on the torso has moved to
  function onTorso(p) {
    const m = BONES.subarray(BN.spine * 16, BN.spine * 16 + 16);
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  }
  // the arm: hand target -> hand and elbow
  function armJoints(J, k, s0, h1, bend) {
    const hand = reach(s0, h1, ARM_U + ARM_F - 0.005);
    J['s' + k] = s0; J['ha' + k] = hand; J['ab' + k] = bend;
    J['el' + k] = ik(s0, hand, ARM_U, ARM_F, bend);
  }
  const sub_ = (m, first, count, gpu) => ({ b: gpu.b, ib: gpu.ib, rest: gpu.rest, first, count });
  const SH_SKIN = [0.07, 10];
  function drawBody(engine, pal, base, far) {
    const lod = far ? 1 : 0;
    bodyMesh(engine, lod);
    const s = skinned(engine, lod);
    const R = BODY[lod].ranges;
    const yoke = pal.pat === 4 ? pal.patCol : pal.jacket, band = pal.pat === 3 ? pal.patCol : pal.jacket;
    const part = (mat, col, spec, m) => { const r = R[mat]; if (r) engine.drawLit(sub_(null, r[0], r[1], s.b), base, col, 0, spec, m); };
    const cp = pal.pat === 1 || pal.pat === 2 ? pal.pat : 0;
    // a nylon shell with a soft sheen, and cotton twill pants
    engine.cloth(cp, pal.patCol, 0, 0, 0);
    part(BM_JACKET, pal.jacket, SH_NYLON);
    engine.cloth(0);
    part(BM_YOKE, yoke, SH_NYLON);
    part(BM_BAND, band, SH_NYLON);
    part(BM_HOOD, yoke, SH_NYLON);
    part(BM_POUCH, HEM, SH_NYLON);
    part(BM_LOGO, pal.pat === 0 ? pal.patCol : TAG, null);
    engine.cloth(0);
    part(BM_ZIP, ZIP, [0.35, 30]);
    engine.cloth(0, null, 0, 0.08, 1);
    part(BM_PANTS, pal.pants, null);
    engine.cloth(0);
    part(BM_GLOVE, pal.glove, [0.08, 10]);
    engine.cloth(0);
    part(BM_SKIN, pal.skin, SH_SKIN, 2);
  }
  const SH_NYLON = [0.05, 5]; // matte fabric: only a broad, soft sheen
  const HEM = [0.1, 0.105, 0.115];
  const SH_LID = [0.09, 9]; // a matte helmet shell
  const PAD = [0.1, 0.1, 0.11];
  const TAG = [0.93, 0.93, 0.9];
  const GAITER = [0.13, 0.135, 0.15];
  function drawHeadS(engine, pal, HFm, far, only) {
    const lod = far ? 1 : 0;
    const from = (Hm) => (mat, col, spec, m) => { const r = Hm.m.ranges[mat]; if (r) engine.drawLit(sub_(null, r[0], r[1], Hm.gpu), HFm, col, 0, spec, m); };
    if (only === 'helmet') {
      const part = from(helmMesh(engine, pal));
      engine.cloth(0);
      part(HM_HAT, pal.helmet, pal.helmetSh || SH_LID);
      part(HM_VENT, VENT, SH_SHELL);
      engine.cloth(0, null, 0.3, 0, 2);
      part(HM_PAD, PAD, null);
      engine.cloth(0);
      return;
    }
    if (only !== 'goggles') {
      const part = from(headMesh(engine, pal, lod));
      part(HM_SKIN, pal.skin, SH_SKIN, 2);
      // knit: ribs running up the mask and ear pads
      engine.cloth(0, null, 0.35, 0, 2);
      part(HM_MASK, pal.maskCol || GAITER, null);
      part(HM_PAD, PAD, null);
      engine.cloth(0, null, 0.3, 0, 0);
      part(HM_HAIR, pal.hair, [0.22, 24]);
      part(HM_TIE, pal.trim, SH_JACKET);
      engine.cloth(0, null, 0.5, 0, 0);
      part(HM_HOOD, pal.jacket, SH_NYLON);
      engine.cloth(0);
      part(HM_HOODIN, pal.hoodIn, null);
      part(HM_HAT, pal.helmet, pal.helmetSh || SH_LID);
      part(HM_VENT, VENT, SH_SHELL);
    }
    // the goggles: their own finer mesh, so the frame and the lens have clean edges
    const gp = from(gogMesh(engine, lod));
    engine.cloth(0);
    gp(HM_FRAME, pal.frameCol, [0.12, 14]);
    gp(HM_STRAP, pal.strapCol, SH_JACKET);
    gp(HM_LENS, pal.lens, SH_LENS, 3);
  }

  // the board standing on its tail: top sheet facing +x, nose up (frame `out`, from body frame `base`)
  function standingBoard(base, c, lean, turn, out) {
    M4.identity(L);
    M4.translate(L, c[0], c[1], c[2]);
    M4.rotX(L, lean);
    M4.rotY(L, -Math.PI / 2 + turn);
    M4.rotX(L, -Math.PI / 2);
    return M4.mul(out, base, L);
  }
  const SB = M4.create();
  const BOARD_C = [0.1, 0.81, 0.47];
  function drawStanding(engine, st, pal) {
    const t = st.t || 0;
    M4.identity(M);
    M4.translate(M, st.x || 0, st.y || 0, st.z || 0);
    M4.rotY(M, st.heading || 0);
    if (st.pose !== 'board' && pal.size && pal.size !== 1) M4.scale(M, pal.size, pal.size, pal.size);
    if (st.pose === 'board') {
      // just the board, centred on the origin
      standingBoard(M, [0, 0, 0], 0, 0, SB);
      drawBoard(engine, pal, SB, false);
      drawBindings(engine, pal, SB, false, false);
      return;
    }
    if (st.pose === 'helmet' || st.pose === 'goggles') {
      // just the helmet or just the goggles, where the head would be (the shop's pictures)
      M4.identity(SHL);
      M4.translate(SHL, 0.045, 1.72, 0);
      M4.scale(SHL, 1.1, 1.1, 1.1);
      M4.mul(HF, M, SHL);
      drawHeadS(engine, pal, HF, false, st.pose);
      return;
    }
    // standing tall, breathing; the board stands on its tail at your side, one hand on its edge
    const br = Math.sin(t * 1.7) * 0.006;
    const sway = Math.sin(t * 0.55) * 0.012;
    standingBoard(M, BOARD_C, -0.07, 0.18, SB);
    drawBoard(engine, pal, SB, false);
    drawBindings(engine, pal, SB, false, false);

    // feet a little apart, toes out
    const hip = [-0.03 + sway * 0.4, 0.94 + br * 0.5, sway];
    const J = { hip, across: [0, 0, 1], HL: SHL };
    for (const [fz, yaw, hz, k] of [[0.15, -0.16, 0.1, 'F'], [-0.15, 0.16, -0.1, 'B']]) {
      M4.identity(L);
      M4.translate(L, 0.02, 0.008, fz);
      M4.rotY(L, yaw);
      M4.mul(FB, M, L);
      drawBoot(engine, pal, FB, false);
      const ank = [-0.005, 0.2, fz * 0.96];
      const hp = add(hip, [0, -0.02, hz]);
      const bend = [1, 0.05, hz * 1.5];
      J['hp' + k] = hp; J['an' + k] = ank; J['lb' + k] = bend;
      J['kn' + k] = ik(ank, hp, LEG_S, LEG_T, bend);
    }
    // upright torso, shoulders square to the front
    const sh = add(hip, [0.03, 0.545 + br, 0.004]);
    J.waist = add(hip, [-0.005, -0.03, 0]);
    J.neck = add(sh, [0.012, 0.11, 0]);
    const head = add(sh, [0.045, 0.235, 0]);
    M4.identity(SHL);
    M4.translate(SHL, head[0], head[1], head[2]);
    M4.rotY(SHL, Math.sin(t * 0.37) * 0.1 + 0.04);
    M4.rotZ(SHL, -0.04 + Math.sin(t * 0.29) * 0.025);
    M4.scale(SHL, 1.1, 1.1, 1.1);
    M4.mul(HF, M, SHL);
    setTorso(J);
    // board-side hand grips the board's edge at hip height; the other hangs loose
    const sf = onTorso(R0.sjF), sb = onTorso(R0.sjB);
    M4.point(SB, -0.17, 0.03, 0.12, PT);
    armJoints(J, 'F', sf, [PT[0], PT[1], PT[2]], [-0.4, -0.5, 0.9]);
    armJoints(J, 'B', sb, add(sb, [0.06, -0.5 - br, -0.17]), [-0.6, -0.2, -0.6]);
    setLimbs(J);
    drawBody(engine, pal, M, false);
    drawHeadS(engine, pal, HF, false);
  }
  const SHL = M4.create();

  /*
   * st: { x, y, z, heading, spin, stance, flip, lean, crouch, comp, grab, grabK, grabType, tuck, slide, air, airT,
   *       spinV, flipV, bail, tumble, tumbleRoll, wind, t }
   */
  const gk0 = (st) => (st.grabK !== undefined ? st.grabK : st.grab ? 1 : 0);
  // each rider's body eases between poses (crouch, shoulder twist, hands) instead of snapping, so
  // take-offs, landings, grabs and getting up flow. Kept per rider; a rider drawn twice in a frame
  // (shadow, then colour) doesn't move on the second pass.
  const ANIM = new WeakMap(), ANIM_K = {};
  function animOf(st) {
    let a = st.key ? ANIM_K[st.key] : ANIM.get(st);
    if (!a) { a = { t: -1 }; if (st.key) ANIM_K[st.key] = a; else ANIM.set(st, a); }
    const t = st.t || 0;
    if (a.t < 0 || t < a.t || t - a.t > 0.25) { a.k = a.tw = a.hf = a.hb = null; a.dt = 0; a.sw = undefined; }
    else a.dt = t - a.t;
    a.t = t;
    return a;
  }
  const easeK = (an, rate) => 1 - Math.exp(-rate * an.dt);
  SS.drawRider = function (engine, world, st, colorIdx, alpha) {
    if (!meshes) build(engine);
    // colorIdx: one of the free outfits (a number), or a look from the locker
    const pal = colorIdx && typeof colorIdx === 'object' ? lookPalette(colorIdx) : PALETTE[(((colorIdx | 0) % PALETTE.length) + PALETTE.length) % PALETTE.length];
    const a = alpha === undefined ? 1 : alpha;
    engine.setLights(world.nearLamps(st.x, st.z, nearL));
    engine.setLitAlpha(a);
    // far away (or a see-through ghost) gets the lighter version
    if (st.pose) { drawStanding(engine, st, pal); engine.setLitAlpha(1); return; }
    const eye = engine.eye;
    const dist = Math.hypot(st.x - eye[0], st.z - eye[2]);
    const far = a < 1 || dist > 48;
    // the sculpted body and head drop to their lighter versions a little way off
    const lod = far || dist > 14;

    M4.identity(M);
    M4.translate(M, st.x, st.y, st.z);
    if (st.wallRoll) M4.rotZ(M, st.wallRoll); // standing square to a halfpipe wall
    M4.rotY(M, st.heading || 0);
    if (pal.size && pal.size !== 1) M4.scale(M, pal.size, pal.size, pal.size);
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
    // knees come up at the top of a jump, legs reach down for the landing on the way down
    const vyS = st.vy || 0;
    const apex = air ? 0.18 * (1 - clamp(Math.abs(vyS) / 5, 0, 1)) : 0;
    const tuckAir = air ? clamp(0.28 + apex + 0.3 * Math.abs(spinV) + 0.65 * Math.abs(flipV), 0, 1) * (1 - ext) * clamp(airT / 0.3, 0, 1) * (vyS < -4 && gk0(st) < 0.3 ? 0.55 : 1) : 0;
    // a laid-over carve: deeper knees, the hips drop to the inside
    const cv = st.lean || 0, lk = mode === 'ride' && !st.grind ? clamp((Math.abs(cv) - 0.12) / 0.3, 0, 1) : 0;
    let k = clamp((st.crouch || 0) * 0.85 + (st.comp || 0) * 0.8 + (mode === 'tuck' ? 0.2 : 0) + lk * 0.18, 0, 1);
    if (air) k = 0.2 - ext * 0.15 - (vyS < -4 ? 0.06 : 0);
    // balled up while tumbling, loose when flat, then a deep squat to stand up
    if (st.bail) k = bu > 0 ? lerp(0.95, 0.25, bu * bu * (3 - 2 * bu)) : lerp(0.3, 0.85, bk);
    const an = animOf(st);
    if (an.k !== null) k = an.k + (k - an.k) * easeK(an, air ? 14 : 10);
    an.k = k;
    const back = mode === 'slide' ? -0.12 : 0;
    const bounce = mode === 'ride' || mode === 'tuck' ? Math.sin(t * 9.5) * 0.007 * clamp((st.speed || 0) / 20, 0, 1.2) : 0;
    const hip = [-0.05 - 0.05 * k + back + (cv < 0 ? -0.06 : 0.03) * lk, 0.93 - 0.38 * k + bounce, 0];

    // board tweak relative to the body
    M4.identity(BT);
    M4.translate(BT, G.tw[0] * gk, tuckAir * 0.26 + G.tw[1] * gk - ext * 0.06 + 0.16 * bk, 0);
    M4.rotX(BT, G.tw[2] * gk - ext * 0.22 + flipV * 0.1);
    M4.rotZ(BT, G.tw[3] * gk);
    M4.rotY(BT, G.tw[4] * gk);
    M4.mul(BM, M, BT);

    // ---- board ----
    drawBoard(engine, pal, BM, far);

    // ---- feet: bindings and boots, front foot angled toward the nose, back foot ducked out ----
    drawBindings(engine, pal, BM, far, true);

    // ---- legs: knees found from the hips and the boots ----
    const ankF = boardPt([-0.025, 0.2, 0.25]), ankB = boardPt([-0.025, 0.2, -0.25]);
    const knees = [];
    const J = { hip, HL: RHL };
    for (const [ank, hz, kk] of [[ankF, 0.115, 'F'], [ankB, -0.115, 'B']]) {
      const hp = add(hip, [0, -0.02, hz]);
      const bend = [1, 0.1, hz * 2.4];
      const knee = ik(ank, hp, LEG_S, LEG_T, bend);
      knees.push(knee);
      J['hp' + kk] = hp; J['kn' + kk] = knee; J['an' + kk] = ank; J['lb' + kk] = bend;
    }

    // ---- upper body: shoulders lead a spin, lean into a grab ----
    let twist = -0.42 + (air ? spinV * 0.85 : (st.wind || 0) * 0.5);
    if (st.bail) twist += Math.sin(t * 7.3) * 0.35 * bk;
    if (mode === 'tuck') twist = -0.75;
    if (an.tw !== null) twist = an.tw + (twist - an.tw) * easeK(an, 9);
    an.tw = twist;
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
    J.waist = add(hip, tw([-0.005, -0.03, 0], twist));
    J.neck = add(sh, tw([0.012, 0.11, 0], twist));
    J.across = tw([0, 0, 1], twist);

    // ---- head: looks ahead into the spin, down at a grab ----
    const head = add(sh, tw([0.05, 0.235, 0], twist));
    M4.identity(RHL);
    M4.translate(RHL, head[0], head[1], head[2]);
    M4.rotY(RHL, twist + spinV * 0.55 + (mode === 'ride' ? cv * 0.35 : 0));
    M4.rotZ(RHL, -0.3 * gk - 0.15 * Math.abs(flipV) + (st.bail ? Math.sin(t * 9.1) * 0.35 * bk + 0.25 * (1 - bk) * (1 - bu) : 0));
    M4.scale(RHL, 1.1, 1.1, 1.1);
    M4.mul(HF, M, RHL);
    setTorso(J);

    // ---- arms: hands go to targets, elbows find themselves ----
    const sf = onTorso(R0.sjF), sb = onTorso(R0.sjB);
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
          if (G.hand > 0) { hf = mix(hf, gp, gk); hb = mix(hb, add(sb, tw([-0.1, 0.08, -0.46], twist)), gk); }
          else { hb = mix(hb, gp, gk); hf = mix(hf, add(sf, tw([0.04, 0.08, 0.47], twist)), gk); }
        }
        break;
      }
      default: {
        // relaxed: hands low and loose, front hand just ahead of the knee; they dip as the legs
        // soak up a landing or load up for a pop
        const dip = (st.comp || 0) * 0.15 + ((st.crouch || 0) > 0.6 ? 0.12 : 0);
        hf = add(sf, tw([0.24, -0.35 + sway - carve * 0.18 - dip, 0.45], twist));
        hb = add(sb, tw([0.14, -0.4 - sway + carve * 0.15 - dip, -0.42], twist));
        if (lk > 0) {
          // laid over in a carve: the inside hand trails through the snow
          hb = mix(hb, carve > 0 ? add(sb, [0.42, -0.62, -0.05]) : add(sb, [-0.3, -0.55, -0.2]), lk);
          hf = mix(hf, add(sf, carve > 0 ? [0.3, -0.2, 0.35] : [0.15, -0.15, 0.45]), lk * 0.7);
        }
        if (st.grind) {
          // on a rail: arms out wide, see-sawing against the lean
          const b = st.bal || 0;
          hf = add(sf, tw([0.08, 0.02 - b * 0.28, 0.52], twist));
          hb = add(sb, tw([0.05, 0.06 + b * 0.28, -0.52], twist));
        }
        break;
      }
    }
    if (an.hf) { const e = easeK(an, st.bail ? 14 : air ? 11 : 8); hf = mix(an.hf, hf, e); hb = mix(an.hb, hb, e); }
    an.hf = hf; an.hb = hb;
    // the arms swing a little as you shift your weight edge to edge: they lag behind the turn,
    // swing through and settle (a damped spring on how fast the lean changes)
    if (!st.bail) {
      if (an.sw === undefined) { an.sw = 0; an.swv = 0; an.pc = carve; }
      if (an.dt > 0) {
        const dc = (carve - an.pc) / an.dt;
        an.swv += (-an.sw * 28 - an.swv * 4.5 - dc * 2.2) * an.dt;
        an.sw = clamp(an.sw + an.swv * an.dt, -0.7, 0.7);
        an.pc = carve;
      }
      const sw = an.sw;
      hf = add(hf, tw([sw * 0.05, Math.abs(sw) * 0.04, sw * 0.12], twist));
      hb = add(hb, tw([-sw * 0.05, Math.abs(sw) * 0.04, sw * 0.12], twist));
    }
    if ((st.wob || 0) > 0 && !st.bail) {
      // windmilling to stay on your feet
      const w = Math.min(1, st.wob);
      hf = add(hf, [0.12 * Math.cos(t * 14) * w, 0.25 * Math.sin(t * 14) * w, 0.1 * w]);
      hb = add(hb, [0.12 * Math.cos(t * 14 + 2) * w, 0.25 * Math.sin(t * 14 + 2) * w, -0.1 * w]);
    }
    armJoints(J, 'F', sf, hf, tw([-0.55, -0.6, 0.75], twist));
    armJoints(J, 'B', sb, hb, tw([-0.55, -0.6, -0.75], twist));
    setLimbs(J);
    drawBody(engine, pal, M, lod);
    drawHeadS(engine, pal, HF, lod);
    engine.setLitAlpha(1);
  };
  const RHL = M4.create();

  // the coin you collect on the way down: a silver minted coin with a raised rim, a ridged edge
  // and a snowflake standing up off each face (built once; radius 1, faces along y)
  const COIN = {};
  function coinMeshes(engine) {
    const out = [], fl = [];
    const N = 120, REED = 60;
    const tri = (o, a, b, c) => { for (const v of [a, b, c]) o.push(v[0], v[1], v[2], v[3], v[4], v[5]); };
    // the profile from the middle of the top face out over the rim and down the edge, mirrored below
    const top = [[0, 0.06], [0.7, 0.06], [0.75, 0.105], [0.94, 0.105], [1, 0.07]];
    const prof = top.concat(top.slice().reverse().map(([r, y]) => [r, -y]));
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
      if (r0 === r1 && y0 === y1) continue;
      const len = Math.hypot(r1 - r0, y1 - y0);
      const nr = (y1 - y0) / len * -1, ny = (r1 - r0) / len; // outward normal of this band
      const edge = r0 === 1 && r1 === 1;
      for (let j = 0; j < N; j++) {
        const v = [];
        for (const [jj, rr, yy] of [[j, r0, y0], [j + 1, r0, y0], [j + 1, r1, y1], [j, r1, y1]]) {
          const th = (jj / N) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
          // the ridged edge: the radius ripples, and the normal leans with it
          const rp = edge ? rr + 0.008 * Math.cos(th * REED) : rr;
          const tl = edge ? 0.45 * Math.sin(th * REED) : 0;
          const nx = nr * c - tl * sn, nz = nr * sn + tl * c;
          const nl = Math.hypot(nx, ny, nz) || 1;
          v.push([rp * c, yy, rp * sn, nx / nl, (edge ? 0 : ny) / nl, nz / nl]);
        }
        tri(out, v[0], v[2], v[1]); tri(out, v[0], v[3], v[2]);
      }
    }
    // the snowflake: six arms with a V near each tip, raised off both faces
    const bar = (o, x0, z0, x1, z1, w, yb, yt, sg) => {
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, px = -uz * w, pz = ux * w;
      const P = (x, z, y) => [x, y * sg, z];
      const c = [P(x0 + px, z0 + pz, yb), P(x1 + px, z1 + pz, yb), P(x1 - px, z1 - pz, yb), P(x0 - px, z0 - pz, yb)];
      const t = c.map((q) => [q[0], yt * sg, q[2]]);
      const face = (A, B, C, D, n) => { tri(o, A.concat(n), B.concat(n), C.concat(n)); tri(o, A.concat(n), C.concat(n), D.concat(n)); };
      face(t[0], t[1], t[2], t[3], [0, sg, 0]);
      face(c[0], t[0], t[3], c[3], [-ux, 0, -uz]);
      face(c[1], c[2], t[2], t[1], [ux, 0, uz]);
      face(c[0], c[1], t[1], t[0], [-uz * Math.sign(w), 0, ux * Math.sign(w)]);
      face(c[3], t[3], t[2], c[2], [uz * Math.sign(w), 0, -ux * Math.sign(w)]);
    };
    for (const sg of [1, -1]) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        bar(fl, 0, 0, ca * 0.6, sa * 0.6, 0.042, 0.055, 0.088, sg);
        const bx = ca * 0.36, bz = sa * 0.36;
        for (const d of [0.75, -0.75]) bar(fl, bx, bz, bx + Math.cos(a + d) * 0.2, bz + Math.sin(a + d) * 0.2, 0.034, 0.055, 0.082, sg);
      }
    }
    COIN.body = engine.mesh(new Float32Array(out), 6);
    COIN.flake = engine.mesh(new Float32Array(fl), 6);
  }
  SS.drawToken = function (engine, x, y, z, t) {
    if (!meshes) build(engine);
    if (!COIN.body) coinMeshes(engine);
    M4.identity(M);
    M4.translate(M, x, y + Math.sin(t * 2.2 + x) * 0.12, z);
    M4.rotY(M, t * 2.4 + z * 0.3);
    M4.rotX(M, Math.PI / 2);
    M4.scale(M, 0.4, 0.4, 0.4);
    // chrome: bright highlights, and a little glow of its own so it reads under the floodlights
    engine.drawLit(COIN.body, M, [0.74, 0.77, 0.82], 0.28, [1.3, 70]);
    engine.drawLit(COIN.flake, M, [0.96, 0.97, 1.0], 0.5, [1.5, 90]);
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
