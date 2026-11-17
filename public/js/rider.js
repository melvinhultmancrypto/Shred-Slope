/*
 * Shred Slope: the snowboarder, built from boxes and posed every frame.
 * Body frame: board along +z, rider faces +x (regular stance), up is +y.
 */
(function () {
  'use strict';
  const SS = window.SS;
  const M4 = SS.M4;

  // 10 rider colour sets (one per player slot on a server)
  const PALETTE = [
    { name: 'green', css: '#2fbf71', jacket: [0.16, 0.62, 0.42], board: [0.95, 0.25, 0.3], helmet: [0.13, 0.13, 0.15] },
    { name: 'orange', css: '#ff7a1f', jacket: [1.0, 0.45, 0.12], board: [0.15, 0.2, 0.35], helmet: [0.95, 0.95, 0.97] },
    { name: 'blue', css: '#3d8bff', jacket: [0.2, 0.48, 1.0], board: [1.0, 0.8, 0.15], helmet: [0.13, 0.13, 0.15] },
    { name: 'pink', css: '#ff4f8b', jacket: [1.0, 0.27, 0.5], board: [0.2, 0.2, 0.25], helmet: [0.95, 0.95, 0.97] },
    { name: 'yellow', css: '#ffd23f', jacket: [1.0, 0.8, 0.15], board: [0.2, 0.45, 1.0], helmet: [0.13, 0.13, 0.15] },
    { name: 'purple', css: '#a46bff', jacket: [0.58, 0.36, 1.0], board: [0.2, 0.9, 0.7], helmet: [0.13, 0.13, 0.15] },
    { name: 'teal', css: '#19d3c5', jacket: [0.05, 0.78, 0.72], board: [1.0, 0.35, 0.2], helmet: [0.95, 0.95, 0.97] },
    { name: 'red', css: '#ff3b30', jacket: [0.92, 0.15, 0.13], board: [0.95, 0.95, 0.97], helmet: [0.13, 0.13, 0.15] },
    { name: 'white', css: '#e9eef7', jacket: [0.9, 0.92, 0.96], board: [1.0, 0.45, 0.1], helmet: [0.2, 0.45, 1.0] },
    { name: 'lime', css: '#8bd346', jacket: [0.52, 0.85, 0.2], board: [0.6, 0.3, 1.0], helmet: [0.13, 0.13, 0.15] },
  ];
  SS.PALETTE = PALETTE;

  const PANTS = [0.11, 0.115, 0.13];
  const DARK = [0.06, 0.06, 0.07];
  const GOGGLE = [1.0, 0.55, 0.15];

  const M = M4.create();
  const W = M4.create();
  const L = M4.create();
  const nearL = [];

  // model matrix for a box stretched from p0 to p1 (body frame), thickness a (along `side`) and b
  function seg(out, base, p0, p1, a, b, side) {
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
    return M4.mul(out, base, L);
  }

  function boxAt(out, base, cx, cy, cz, sx, sy, sz, rx) {
    M4.identity(L);
    M4.translate(L, cx, cy, cz);
    if (rx) M4.rotX(L, rx);
    M4.scale(L, sx, sy, sz);
    return M4.mul(out, base, L);
  }

  // rotate (x, z) around the vertical axis by a
  function twist(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
  }
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

  // st: { x, y, z, heading, spin, stance, flip, lean, crouch, grab, bail, tumble, tumbleRoll }
  SS.drawRider = function (engine, world, st, colorIdx) {
    const pal = PALETTE[((colorIdx % PALETTE.length) + PALETTE.length) % PALETTE.length];
    engine.setLights(world.nearLamps(st.x, st.z, nearL));

    M4.identity(M);
    M4.translate(M, st.x, st.y, st.z);
    M4.rotY(M, st.heading || 0);
    let c = st.crouch || 0;
    let grab = !!st.grab;
    let arms = 0;
    if (st.bail) {
      M4.translate(M, 0, 0.45, 0);
      M4.rotX(M, st.tumble || 0);
      M4.rotZ(M, st.tumbleRoll || 0);
      M4.translate(M, 0, -0.45, 0);
      c = 0.15;
      grab = false;
      arms = 1;
    } else {
      M4.translate(M, 0, 0.9, 0);
      M4.rotY(M, (st.spin || 0) + (st.stance || 0));
      M4.rotX(M, st.flip || 0);
      M4.translate(M, 0, -0.9, 0);
      M4.rotZ(M, -(st.lean || 0));
    }

    // board and bindings
    engine.drawLit(engine.cube, boxAt(W, M, 0, 0.035, 0, 0.3, 0.05, 1.5), pal.board);
    engine.drawLit(engine.cube, boxAt(W, M, 0, 0.06, 0.8, 0.3, 0.05, 0.16, -0.35), pal.board);
    engine.drawLit(engine.cube, boxAt(W, M, 0, 0.06, -0.8, 0.3, 0.05, 0.16, 0.35), pal.board);
    engine.drawLit(engine.cube, boxAt(W, M, 0, 0.09, 0.26, 0.26, 0.06, 0.17), DARK);
    engine.drawLit(engine.cube, boxAt(W, M, 0, 0.09, -0.26, 0.26, 0.06, 0.17), DARK);

    // legs
    const F = [0, 0.12, 0.26], B = [0, 0.12, -0.26];
    const hip = [-0.04 - 0.06 * c, 0.9 - 0.3 * c, 0];
    const kf = [0.17 + 0.08 * c, 0.5 - 0.15 * c, 0.24], kb = [0.17 + 0.08 * c, 0.5 - 0.15 * c, -0.24];
    const side = [0, 0, 1];
    engine.drawLit(engine.cube, seg(W, M, F, kf, 0.15, 0.16, side), PANTS);
    engine.drawLit(engine.cube, seg(W, M, B, kb, 0.15, 0.16, side), PANTS);
    engine.drawLit(engine.cube, seg(W, M, kf, add(hip, [0, 0, 0.11]), 0.17, 0.18, side), PANTS);
    engine.drawLit(engine.cube, seg(W, M, kb, add(hip, [0, 0, -0.11]), 0.17, 0.18, side), PANTS);

    // upper body, twisted to face down the hill a little
    const tw = -0.42;
    const sh = add(hip, twist([0.08 + 0.12 * c, 0.5 - 0.05 * c, 0.03], tw));
    engine.drawLit(engine.cube, seg(W, M, hip, sh, 0.38, 0.27, twist([0, 0, 1], tw)), pal.jacket);
    const head = add(sh, twist([0.04, 0.24, 0], tw));
    engine.drawLit(engine.sphere, boxAt(W, M, head[0], head[1], head[2], 0.28, 0.28, 0.28), pal.helmet);
    const gog = add(head, twist([0.12, 0.0, 0], tw));
    M4.identity(L);
    M4.translate(L, gog[0], gog[1], gog[2]);
    M4.rotY(L, tw);
    M4.scale(L, 0.07, 0.09, 0.22);
    engine.drawLit(engine.cube, M4.mul(W, M, L), GOGGLE, 0.25);

    // arms
    const sf = add(sh, twist([0, -0.03, 0.19], tw)), sb = add(sh, twist([0, -0.03, -0.19], tw));
    const t = st.t || 0;
    const wob = Math.sin(t * 3) * 0.04;
    let ef, hf, eb, hb;
    if (arms) {
      ef = add(sf, [0.05, 0.25, 0.2]); hf = add(ef, [0.05, 0.3, 0.15]);
      eb = add(sb, [0.05, 0.25, -0.2]); hb = add(eb, [0.05, 0.3, -0.15]);
    } else if (grab) {
      ef = add(sf, twist([0.18, -0.25, 0.05], tw)); hf = [0.17, 0.16, 0.12];
      eb = add(sb, twist([0.05, -0.2, -0.24], tw)); hb = add(eb, twist([0.12, -0.18, -0.3], tw));
    } else {
      ef = add(sf, twist([0.1, -0.2 + wob, 0.24], tw)); hf = add(ef, twist([0.18, -0.24 - wob, 0.36], tw));
      eb = add(sb, twist([0.06, -0.24 - wob, -0.2], tw)); hb = add(eb, twist([0.12, -0.36 + wob, -0.3], tw));
    }
    engine.drawLit(engine.cube, seg(W, M, sf, ef, 0.13, 0.13, side), pal.jacket);
    engine.drawLit(engine.cube, seg(W, M, ef, hf, 0.12, 0.12, side), pal.jacket);
    engine.drawLit(engine.cube, seg(W, M, sb, eb, 0.13, 0.13, side), pal.jacket);
    engine.drawLit(engine.cube, seg(W, M, eb, hb, 0.12, 0.12, side), pal.jacket);
    engine.drawLit(engine.cube, boxAt(W, M, hf[0], hf[1], hf[2], 0.11, 0.11, 0.11), DARK);
    engine.drawLit(engine.cube, boxAt(W, M, hb[0], hb[1], hb[2], 0.11, 0.11, 0.11), DARK);
  };

  const S = M4.create();
  SS.drawShadow = function (engine, world, x, z, heading, height) {
    const gy = world.H(x, z);
    const e = 0.5;
    const gx = (world.H(x + e, z) - world.H(x - e, z)) / (2 * e);
    const gz = (world.H(x, z + e) - world.H(x, z - e)) / (2 * e);
    M4.identity(S);
    M4.translate(S, x, gy + 0.06, z);
    M4.rotX(S, Math.atan(gz) * -1);
    M4.rotZ(S, Math.atan(gx));
    M4.rotY(S, heading);
    const k = Math.max(0.35, 1 - height * 0.08);
    M4.scale(S, 0.42 * k, 1, 0.95 * k);
    engine.drawBaked(engine.disc, S, 0.45 * k);
  };
})();
