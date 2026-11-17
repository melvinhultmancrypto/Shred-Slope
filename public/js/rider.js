/*
 * Shred Slope: the snowboarder, built from rounded parts and posed every frame.
 * Body frame: board along +z, rider faces +x (regular stance), up is +y.
 */
(function () {
  'use strict';
  const SS = window.SS;
  const M4 = SS.M4;

  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  // 10 outfits (one per player slot on a server)
  const PALETTE = [
    { name: 'Forest', css: '#2fbf71', jacket: '#25a865', trim: '#163b2b', pants: '#202227', board: '#f0384a', stripe: '#ffffff', helmet: '#1c1d22' },
    { name: 'Blaze', css: '#ff7a1f', jacket: '#ff6d17', trim: '#2b1a10', pants: '#2a3142', board: '#1d2a4a', stripe: '#ffcc33', helmet: '#f2f2f4' },
    { name: 'Glacier', css: '#3d8bff', jacket: '#2f7dff', trim: '#0f1f3d', pants: '#e9edf5', board: '#ffcc22', stripe: '#141414', helmet: '#1c1d22' },
    { name: 'Bubblegum', css: '#ff4f8b', jacket: '#ff4a86', trim: '#3d1023', pants: '#1f1f26', board: '#7c4dff', stripe: '#ffffff', helmet: '#f2f2f4' },
    { name: 'Lemon', css: '#ffd23f', jacket: '#ffcf2e', trim: '#3a2f06', pants: '#2b2d33', board: '#2f7dff', stripe: '#ffffff', helmet: '#1c1d22' },
    { name: 'Ultraviolet', css: '#a46bff', jacket: '#9a5cff', trim: '#21123f', pants: '#16161b', board: '#19d3c5', stripe: '#141414', helmet: '#1c1d22' },
    { name: 'Lagoon', css: '#19d3c5', jacket: '#12c4b6', trim: '#0b3533', pants: '#2c2f3a', board: '#ff5a36', stripe: '#ffffff', helmet: '#f2f2f4' },
    { name: 'Inferno', css: '#ff3b30', jacket: '#ec2a22', trim: '#2a0b09', pants: '#141418', board: '#f2f2f4', stripe: '#ec2a22', helmet: '#1c1d22' },
    { name: 'Whiteout', css: '#e9eef7', jacket: '#e7ecf5', trim: '#9aa6bd', pants: '#3a4253', board: '#ff7a1f', stripe: '#141414', helmet: '#2f7dff' },
    { name: 'Acid', css: '#8bd346', jacket: '#84cf3a', trim: '#1d3010', pants: '#26272c', board: '#a46bff', stripe: '#ffffff', helmet: '#1c1d22' },
  ];
  for (const p of PALETTE) for (const k of ['jacket', 'trim', 'pants', 'board', 'stripe', 'helmet']) p[k] = hex(p[k]);
  SS.PALETTE = PALETTE;

  const DARK = [0.06, 0.06, 0.07];
  const GOGGLE = [1.0, 0.55, 0.15];
  const PACK = [0.14, 0.15, 0.18];

  // ------------------------------------------------------------------ meshes (built once)
  let meshes = null;
  function build(engine) {
    const cyl = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const c0 = Math.cos(a0) * 0.5, s0 = Math.sin(a0) * 0.5, c1 = Math.cos(a1) * 0.5, s1 = Math.sin(a1) * 0.5;
      const v = (x, y, z, nx, ny, nz) => cyl.push(x, y, z, nx, ny, nz);
      v(c0, -0.5, s0, c0 * 2, 0, s0 * 2); v(c1, -0.5, s1, c1 * 2, 0, s1 * 2); v(c1, 0.5, s1, c1 * 2, 0, s1 * 2);
      v(c0, -0.5, s0, c0 * 2, 0, s0 * 2); v(c1, 0.5, s1, c1 * 2, 0, s1 * 2); v(c0, 0.5, s0, c0 * 2, 0, s0 * 2);
      v(0, 0.5, 0, 0, 1, 0); v(c0, 0.5, s0, 0, 1, 0); v(c1, 0.5, s1, 0, 1, 0);
      v(0, -0.5, 0, 0, -1, 0); v(c1, -0.5, s1, 0, -1, 0); v(c0, -0.5, s0, 0, -1, 0);
    }
    const sph = [];
    const lat = 8, lon = 12;
    const P = (i, j) => {
      const t = (i / lat) * Math.PI, f = (j / lon) * Math.PI * 2;
      return [Math.sin(t) * Math.cos(f) * 0.5, Math.cos(t) * 0.5, Math.sin(t) * Math.sin(f) * 0.5];
    };
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        for (const q of [a, b, c, a, c, d]) sph.push(q[0], q[1], q[2], q[0] * 2, q[1] * 2, q[2] * 2);
      }
    }
    // snowboard: sidecut, rounded tips, kicked-up nose and tail
    const board = [], stripe = [];
    const N = 28, HL = 0.79, TH = 0.028;
    const prof = (t) => {
      const at = Math.abs(t);
      let w = 0.148 - 0.022 * (1 - t * t);
      if (at > 0.86) w *= Math.sqrt(Math.max(0, 1 - Math.pow((at - 0.86) / 0.14, 2)));
      const y = at > 0.78 ? 0.11 * Math.pow((at - 0.78) / 0.22, 2) : 0;
      return { w, y };
    };
    const quad = (out, a, b, c, d) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (const p of [a, b, c, a, c, d]) out.push(p[0], p[1], p[2], nx, ny, nz);
    };
    for (let i = 0; i < N; i++) {
      const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
      const p0 = prof(t0), p1 = prof(t1);
      const z0 = t0 * HL, z1 = t1 * HL;
      const tl0 = [-p0.w, p0.y + TH, z0], tr0 = [p0.w, p0.y + TH, z0], tl1 = [-p1.w, p1.y + TH, z1], tr1 = [p1.w, p1.y + TH, z1];
      const bl0 = [-p0.w, p0.y, z0], br0 = [p0.w, p0.y, z0], bl1 = [-p1.w, p1.y, z1], br1 = [p1.w, p1.y, z1];
      quad(board, tl0, tl1, tr1, tr0);
      quad(board, bl0, br0, br1, bl1);
      quad(board, bl0, bl1, tl1, tl0);
      quad(board, br0, tr0, tr1, br1);
      if (Math.abs(t0) < 0.7 && Math.abs(t1) < 0.7) {
        const sw = 0.045;
        quad(stripe, [-sw, p0.y + TH + 0.002, z0], [-sw, p1.y + TH + 0.002, z1], [sw, p1.y + TH + 0.002, z1], [sw, p0.y + TH + 0.002, z0]);
      }
    }
    meshes = {
      cyl: engine.mesh(new Float32Array(cyl), 6),
      sph: engine.mesh(new Float32Array(sph), 6),
      board: engine.mesh(new Float32Array(board), 6),
      stripe: engine.mesh(new Float32Array(stripe), 6),
    };
  }

  // ------------------------------------------------------------------ helpers
  const M = M4.create();
  const W = M4.create();
  const L = M4.create();
  const nearL = [];

  // model matrix that stretches a unit shape from p0 to p1 (body frame); thickness a along `side`, b across
  function seg(base, p0, p1, a, b, side) {
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
    L[12] = (p0[0] + p1[0]) / 2; L[13] = (p0[1] + p1[1]) / 2; L[14] = (p0[2] + p1[2]) / 2; L[15] = 1;
    return M4.mul(W, base, L);
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

  function limb(engine, base, p0, p1, r, col) {
    engine.drawLit(meshes.cyl, seg(base, p0, p1, r, r, SIDE), col);
  }
  function ball(engine, base, p, r, col, em) {
    engine.drawLit(meshes.sph, at(base, p, r, r, r), col, em);
  }

  /*
   * st: { x, y, z, heading, spin, stance, flip, lean, crouch, comp, grab, tuck, slide, air, bail, tumble, tumbleRoll, t }
   */
  SS.drawRider = function (engine, world, st, colorIdx, alpha) {
    if (!meshes) build(engine);
    const pal = PALETTE[((colorIdx % PALETTE.length) + PALETTE.length) % PALETTE.length];
    engine.setLights(world.nearLamps(st.x, st.z, nearL));
    engine.setLitAlpha(alpha === undefined ? 1 : alpha);

    M4.identity(M);
    M4.translate(M, st.x, st.y, st.z);
    M4.rotY(M, st.heading || 0);
    const t = st.t || 0;
    let mode = st.bail ? 'bail' : st.grab ? 'grab' : st.air ? 'air' : st.slide > 0.3 ? 'slide' : st.tuck ? 'tuck' : 'ride';
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
    engine.drawLit(meshes.board, M, pal.board);
    engine.drawLit(meshes.stripe, M, pal.stripe);
    for (const z of [0.25, -0.25]) {
      engine.drawLit(meshes.cyl, at(M, [0, 0.07, z], 0.27, 0.05, 0.19), DARK);
    }

    // ---- legs ----
    const k = Math.min(1, Math.max(0, (st.crouch || 0) * 0.85 + (st.comp || 0) * 0.6 + (mode === 'tuck' ? 0.35 : 0)));
    const back = mode === 'slide' ? -0.12 : 0;
    const F = [0, 0.13, 0.25], B = [0, 0.13, -0.25];
    const hip = [-0.05 - 0.05 * k + back, 0.93 - 0.38 * k, 0];
    const kneeF = [0.13 + 0.17 * k + back * 0.5, 0.53 - 0.19 * k, 0.23];
    const kneeB = [0.13 + 0.17 * k + back * 0.5, 0.53 - 0.19 * k, -0.22];
    limb(engine, M, F, kneeF, 0.165, pal.pants);
    limb(engine, M, B, kneeB, 0.165, pal.pants);
    limb(engine, M, kneeF, add(hip, [0, 0, 0.12]), 0.2, pal.pants);
    limb(engine, M, kneeB, add(hip, [0, 0, -0.12]), 0.2, pal.pants);
    ball(engine, M, kneeF, 0.19, pal.pants);
    ball(engine, M, kneeB, 0.19, pal.pants);
    engine.drawLit(meshes.sph, at(M, [0.03, 0.12, 0.25], 0.24, 0.15, 0.3), DARK);
    engine.drawLit(meshes.sph, at(M, [0.03, 0.12, -0.25], 0.24, 0.15, 0.3), DARK);
    engine.drawLit(meshes.sph, at(M, hip, 0.3, 0.26, 0.38), pal.pants);

    // ---- upper body (twisted toward the nose, more with a spin wind-up) ----
    let twist = -0.42 + (st.wind || 0) * 0.5;
    if (mode === 'tuck') twist = -0.75;
    const lean = mode === 'tuck' ? 0.18 : mode === 'slide' ? -0.1 : 0;
    const sh = add(hip, tw([0.1 + 0.15 * k + lean, 0.53 - 0.06 * k, 0.02], twist));
    const chestLow = add(hip, tw([0.02, 0.06, 0], twist));
    engine.drawLit(meshes.sph, seg(M, chestLow, add(sh, [0, 0.08, 0]), 0.46, 0.32, tw([0, 0, 1], twist)), pal.jacket);
    // zip trim and backpack
    engine.drawLit(meshes.cyl, seg(M, add(chestLow, tw([0.15, 0.08, 0], twist)), add(sh, tw([0.13, 0, 0], twist)), 0.03, 0.035, tw([0, 0, 1], twist)), pal.trim);
    engine.drawLit(meshes.sph, seg(M, add(chestLow, tw([-0.16, 0.12, 0], twist)), add(sh, tw([-0.15, -0.04, 0], twist)), 0.32, 0.16, tw([0, 0, 1], twist)), PACK);

    // head: gaiter, helmet, goggles, hood
    const head = add(sh, tw([0.05, 0.25, 0], twist));
    engine.drawLit(meshes.cyl, seg(M, add(sh, [0, 0.02, 0]), add(head, [0, -0.08, 0]), 0.15, 0.15, SIDE), pal.trim);
    engine.drawLit(meshes.sph, at(M, add(sh, tw([-0.1, 0.07, 0], twist)), 0.18, 0.16, 0.26, twist), pal.jacket);
    engine.drawLit(meshes.sph, at(M, head, 0.27, 0.28, 0.27), pal.helmet);
    engine.drawLit(meshes.sph, at(M, add(head, tw([0.1, -0.015, 0], twist)), 0.1, 0.1, 0.23, twist), GOGGLE, 0.35);
    engine.drawLit(meshes.cyl, at(M, add(head, [0, -0.01, 0]), 0.285, 0.035, 0.285), DARK);

    // ---- arms ----
    const sf = add(sh, tw([0, -0.04, 0.2], twist)), sb = add(sh, tw([0, -0.04, -0.2], twist));
    const sway = Math.sin(t * 2.6) * 0.03;
    const carve = st.lean || 0;
    let ef, hf, eb, hb;
    switch (mode) {
      case 'bail': {
        const f = Math.sin(t * 13) * 0.15;
        ef = add(sf, [0.05, 0.22 + f, 0.18]); hf = add(ef, [0.05, 0.28 - f, 0.18]);
        eb = add(sb, [0.05, 0.22 - f, -0.18]); hb = add(eb, [0.05, 0.28 + f, -0.18]);
        break;
      }
      case 'grab': {
        ef = add(sf, tw([0.2, -0.24, 0.06], twist)); hf = [0.18, 0.15, 0.14];
        eb = add(sb, tw([0.02, 0.12, -0.24], twist)); hb = add(eb, tw([0.05, 0.25, -0.18], twist));
        break;
      }
      case 'air':
        ef = add(sf, tw([0.08, 0.02, 0.28], twist)); hf = add(ef, tw([0.08, 0.12, 0.28], twist));
        eb = add(sb, tw([0.06, 0.02, -0.26], twist)); hb = add(eb, tw([0.06, 0.14, -0.26], twist));
        break;
      case 'tuck':
        ef = add(sf, tw([0.22, -0.2, 0.05], twist)); hf = mix(kneeF, ef, 0.3); hf[0] += 0.12; hf[1] += 0.05;
        eb = add(sb, tw([0.22, -0.2, -0.02], twist)); hb = mix(kneeB, eb, 0.3); hb[0] += 0.12; hb[1] += 0.08;
        break;
      case 'slide':
        ef = add(sf, tw([0.22, -0.1, 0.22], twist)); hf = add(ef, tw([0.22, -0.05, 0.25], twist));
        eb = add(sb, tw([0.2, -0.12, -0.1], twist)); hb = add(eb, tw([0.24, -0.05, -0.05], twist));
        break;
      default:
        ef = add(sf, tw([0.12, -0.2 + sway - carve * 0.12, 0.23], twist)); hf = add(ef, tw([0.16, -0.18 - sway - carve * 0.15, 0.32], twist));
        eb = add(sb, tw([0.07, -0.23 - sway + carve * 0.1, -0.17], twist)); hb = add(eb, tw([0.12, -0.3 + sway + carve * 0.12, -0.24], twist));
    }
    limb(engine, M, sf, ef, 0.135, pal.jacket);
    limb(engine, M, ef, hf, 0.12, pal.jacket);
    limb(engine, M, sb, eb, 0.135, pal.jacket);
    limb(engine, M, eb, hb, 0.12, pal.jacket);
    ball(engine, M, sf, 0.17, pal.jacket);
    ball(engine, M, sb, 0.17, pal.jacket);
    ball(engine, M, ef, 0.135, pal.jacket);
    ball(engine, M, eb, 0.135, pal.jacket);
    ball(engine, M, hf, 0.13, DARK);
    ball(engine, M, hb, 0.13, DARK);
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
