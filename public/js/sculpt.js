/*
 * Shred Slope: sculpted meshes.
 *
 * The riders are modelled the way you'd sculpt clay: soft blobs, tubes and boxes blended smoothly
 * into each other (signed distance fields), with bits carved away. That shape is turned into one
 * continuous, smooth triangle mesh with "surface nets", and every vertex gets a pair of bones and
 * weights, so the mesh can be bent by a skeleton (skinning) and elbows, knees and shoulders flex
 * like a body instead of tubes meeting at balls. Everything is built in code when the game loads.
 */
(function () {
  'use strict';
  const SS = (window.SS = window.SS || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const BIG = 1e3;

  // ---- smooth blends ----
  function smin(a, b, k) {
    if (k <= 0) return a < b ? a : b;
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }
  const smax = (a, b, k) => -smin(-a, -b, k);

  // ---- primitives (each node: d(x,y,z) -> distance, bb: [x0,y0,z0,x1,y1,z1]) ----
  // ellipsoid at c with radii r; optional axes ax = [u, v, w] (unit vectors) to turn it
  function ell(c, r, o) {
    const ax = o && o.ax;
    const r0 = r[0], r1 = r[1], r2 = r[2];
    const rm = Math.max(r0, r1, r2);
    const d = (x, y, z) => {
      let px = x - c[0], py = y - c[1], pz = z - c[2];
      if (ax) {
        const u = ax[0], v = ax[1], w = ax[2];
        const a = px * u[0] + py * u[1] + pz * u[2], b = px * v[0] + py * v[1] + pz * v[2], e = px * w[0] + py * w[1] + pz * w[2];
        px = a; py = b; pz = e;
      }
      const k0 = Math.sqrt((px * px) / (r0 * r0) + (py * py) / (r1 * r1) + (pz * pz) / (r2 * r2));
      const k1 = Math.sqrt((px * px) / (r0 * r0 * r0 * r0) + (py * py) / (r1 * r1 * r1 * r1) + (pz * pz) / (r2 * r2 * r2 * r2));
      return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(r0, r1, r2);
    };
    const e = ax ? rm : 0;
    return node(d, ax ? [c[0] - rm, c[1] - rm, c[2] - rm, c[0] + rm, c[1] + rm, c[2] + rm] : [c[0] - r0 - e, c[1] - r1 - e, c[2] - r2 - e, c[0] + r0 + e, c[1] + r1 + e, c[2] + r2 + e], o);
  }
  // a tube from a to b; radius ra..rb, or prof(t) for any radius along it (t = 0 at a, 1 at b);
  // sq: [axis, k] squashes the cross-section along `axis` (k < 1 flattens it)
  function tube(a, b, ra, rb, o) {
    const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
    const L2 = bx * bx + by * by + bz * bz || 1e-9;
    const prof = o && o.prof;
    const sq = o && o.sq;
    let rmax = Math.max(ra, rb);
    if (prof) for (let i = 0; i <= 20; i++) rmax = Math.max(rmax, prof(i / 20));
    const d = (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const t = clamp((px * bx + py * by + pz * bz) / L2, 0, 1);
      let qx = px - bx * t, qy = py - by * t, qz = pz - bz * t;
      const r = prof ? prof(t) : ra + (rb - ra) * t;
      if (sq) {
        const s = sq[0], f = qx * s[0] + qy * s[1] + qz * s[2], k = (1 / sq[1] - 1) * f;
        qx += s[0] * k; qy += s[1] * k; qz += s[2] * k;
      }
      return Math.sqrt(qx * qx + qy * qy + qz * qz) - r;
    };
    return node(d, [Math.min(a[0], b[0]) - rmax, Math.min(a[1], b[1]) - rmax, Math.min(a[2], b[2]) - rmax, Math.max(a[0], b[0]) + rmax, Math.max(a[1], b[1]) + rmax, Math.max(a[2], b[2]) + rmax], o);
  }
  // a box with rounded edges: centre c, half sizes h, corner radius rr, axes ax (optional)
  function box(c, h, rr, o) {
    const ax = o && o.ax;
    const m = Math.hypot(h[0], h[1], h[2]);
    const d = (x, y, z) => {
      let px = x - c[0], py = y - c[1], pz = z - c[2];
      if (ax) {
        const u = ax[0], v = ax[1], w = ax[2];
        const a = px * u[0] + py * u[1] + pz * u[2], b = px * v[0] + py * v[1] + pz * v[2], e = px * w[0] + py * w[1] + pz * w[2];
        px = a; py = b; pz = e;
      }
      const qx = Math.abs(px) - h[0] + rr, qy = Math.abs(py) - h[1] + rr, qz = Math.abs(pz) - h[2] + rr;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - rr;
    };
    const e = ax ? m : 0;
    return node(d, ax ? [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m] : [c[0] - h[0] - e, c[1] - h[1] - e, c[2] - h[2] - e, c[0] + h[0] + e, c[1] + h[1] + e, c[2] + h[2] + e], o);
  }
  // a ring (torus) round axis n through c: big radius R (or Rz for an oval), tube radius r
  function torus(c, n, R, r, o) {
    const Rz = (o && o.Rz) || R;
    // two axes across n
    const t0 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = cross(n, t0); u = norm(u);
    const v = cross(n, u);
    const d = (x, y, z) => {
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const h = px * n[0] + py * n[1] + pz * n[2];
      const a = (px * u[0] + py * u[1] + pz * u[2]) / R, b = (px * v[0] + py * v[1] + pz * v[2]) / Rz;
      const q = Math.sqrt(a * a + b * b);
      // distance from the oval's centre line (scaled back to metres, near enough for small ovals)
      const rr = q > 1e-6 ? (q - 1) * Math.sqrt(((a / q) * R) ** 2 + ((b / q) * Rz) ** 2) : -R;
      return Math.sqrt(rr * rr + h * h) - r;
    };
    const m = Math.max(R, Rz) + r;
    return node(d, [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m], o);
  }
  // a half-space: everything below the plane through c with normal n (use with op 'int' in a group)
  function plane(c, n, o) {
    const d = (x, y, z) => (x - c[0]) * n[0] + (y - c[1]) * n[1] + (z - c[2]) * n[2];
    return node(d, [-BIG, -BIG, -BIG, BIG, BIG, BIG], o);
  }
  // a group: its own little scene (children blended in order), used as one shape
  function group(children, o) {
    const bb = [BIG, BIG, BIG, -BIG, -BIG, -BIG];
    for (const ch of children) {
      if (ch.op !== 'add') continue;
      for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], ch.bb[i] - ch.k); bb[i + 3] = Math.max(bb[i + 3], ch.bb[i + 3] + ch.k); }
    }
    const g = node((x, y, z) => evalList(children, x, y, z), bb, o);
    g.children = children;
    return g;
  }
  function node(d, bb, o) {
    o = o || {};
    return { d, bb, op: o.op || 'add', k: o.k || 0, mat: o.mat === undefined ? 0 : o.mat, paint: o.paint || null, bone: o.bone === undefined ? -1 : o.bone, bias: o.bias || 0, disp: o.disp || null };
  }
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // ---- evaluating a scene ----
  function nodeD(n, x, y, z) {
    let d = n.d(x, y, z);
    if (n.disp) d += n.disp(x, y, z);
    return d;
  }
  function evalList(list, x, y, z) {
    let d = BIG;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const di = nodeD(n, x, y, z);
      if (n.op === 'add') d = smin(d, di, n.k);
      else if (n.op === 'sub') d = smax(d, -di, n.k);
      else d = smax(d, di, n.k);
    }
    return d;
  }
  // the same, but skipping shapes whose box is further than `m` away (only right near the surface)
  function evalCull(list, x, y, z, m) {
    let d = m;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.op !== 'int') {
        const b = n.bb, e = n.k + m;
        if (x < b[0] - e || x > b[3] + e || y < b[1] - e || y > b[4] + e || z < b[2] - e || z > b[5] + e) continue;
      }
      const di = nodeD(n, x, y, z);
      if (n.op === 'add') d = smin(d, di, n.k);
      else if (n.op === 'sub') d = smax(d, -di, n.k);
      else d = smax(d, di, n.k);
    }
    return d;
  }
  // the material at a point: from the added shape that's closest (minus its bias), painted by position
  function matAt(list, x, y, z) {
    let best = BIG, m = 0, pn = null;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.op !== 'add') continue;
      const di = nodeD(n, x, y, z) - n.bias;
      if (di < best) { best = di; m = n.mat; pn = n; }
    }
    if (pn && pn.children) return matAt(pn.children, x, y, z);
    if (pn && pn.paint) return pn.paint(x, y, z, m);
    return m;
  }
  // the two bones nearest a point, and how much of the first one to use
  function bonesAt(list, x, y, z, nb, sigma, out) {
    const bd = out.bd;
    for (let b = 0; b < nb; b++) bd[b] = BIG;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.op !== 'add' || n.bone < 0) continue;
      const di = nodeD(n, x, y, z);
      if (di < bd[n.bone]) bd[n.bone] = di;
    }
    let b0 = 0, b1 = 0, d0 = BIG, d1 = BIG;
    for (let b = 0; b < nb; b++) {
      if (bd[b] < d0) { d1 = d0; b1 = b0; d0 = bd[b]; b0 = b; } else if (bd[b] < d1) { d1 = bd[b]; b1 = b; }
    }
    if (d1 >= BIG) { out.b0 = out.b1 = b0; out.w = 1; return; }
    const e1 = Math.exp(-(d1 - d0) / sigma);
    out.b0 = b0; out.b1 = b1; out.w = 1 / (1 + e1);
  }

  /*
   * Build a mesh from a list of shapes.
   * opts: { min: [x,y,z], max: [x,y,z], h: cell size, nb: number of bones (0 = no skinning), sigma }
   * Returns { n, pos, nrm, b0, b1, w, idx (Uint16, grouped by material), ranges: { mat: [first, count] } }
   */
  function build(list, opts) {
    const h = opts.h, mn = opts.min, mx = opts.max;
    const TT = opts.prof ? [] : null; let T0 = performance.now(); const tick = (nm) => { if (TT) { const t = performance.now(); TT.push(nm + ':' + Math.round(t - T0)); T0 = t; } };
    const nx = Math.ceil((mx[0] - mn[0]) / h), ny = Math.ceil((mx[1] - mn[1]) / h), nz = Math.ceil((mx[2] - mn[2]) / h);
    const sx = nx + 1, sy = ny + 1, sz = nz + 1;
    const F = new Float32Array(sx * sy * sz).fill(1);
    const margin = h * 3;
    // blocks of 8 cells, each with the shapes that can reach it
    const B = 4;
    const bx = Math.ceil(sx / B), by = Math.ceil(sy / B), bz = Math.ceil(sz / B);
    const blocks = new Array(bx * by * bz);
    for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
      const x0 = mn[0] + I * B * h, y0 = mn[1] + J * B * h, z0 = mn[2] + K * B * h;
      const x1 = x0 + B * h, y1 = y0 + B * h, z1 = z0 + B * h;
      const l = [];
      let any = false;
      for (const n of list) {
        const e = n.k + margin, b = n.bb;
        if (b[0] - e > x1 || b[3] + e < x0 || b[1] - e > y1 || b[4] + e < y0 || b[2] - e > z1 || b[5] + e < z0) continue;
        l.push(n);
        if (n.op === 'add') any = true;
      }
      blocks[I + bx * (J + by * K)] = any ? l : null;
    }
    const blockOf = (x, y, z) => {
      const I = clamp(Math.floor((x - mn[0]) / (B * h)), 0, bx - 1), J = clamp(Math.floor((y - mn[1]) / (B * h)), 0, by - 1), K = clamp(Math.floor((z - mn[2]) / (B * h)), 0, bz - 1);
      return blocks[I + bx * (J + by * K)];
    };
    tick('sample');
    // sample the field, skipping blocks the surface can't be in (deep inside or well clear of it)
    const rad = B * h * 0.87;
    for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
      const l = blocks[I + bx * (J + by * K)];
      if (!l) continue;
      const dc = evalCull(l, mn[0] + (I + 0.5) * B * h, mn[1] + (J + 0.5) * B * h, mn[2] + (K + 0.5) * B * h, rad * 2 + 3 * h);
      if (Math.abs(dc) > rad * 1.6 + 2 * h) {
        if (dc < 0) {
          for (let k = K * B; k < Math.min(sz, K * B + B); k++) for (let j = J * B; j < Math.min(sy, J * B + B); j++) {
            let o = sx * (j + sy * k) + I * B;
            for (let i = I * B; i < Math.min(sx, I * B + B); i++, o++) F[o] = -1;
          }
        }
        continue;
      }
      for (let k = K * B; k < Math.min(sz, K * B + B); k++) {
        const z = mn[2] + k * h;
        for (let j = J * B; j < Math.min(sy, J * B + B); j++) {
          const y = mn[1] + j * h;
          let o = sx * (j + sy * k) + I * B;
          for (let i = I * B; i < Math.min(sx, I * B + B); i++, o++) F[o] = evalCull(l, mn[0] + i * h, y, z, margin);
        }
      }
    }
    const at = (i, j, k) => F[i + sx * (j + sy * k)];
    const fieldAt = (x, y, z) => { const l = blockOf(x, y, z); return l ? evalList(l, x, y, z) : margin; };

    tick('nets');
    // one vertex in every cell the surface passes through
    const vid = new Int32Array(nx * ny * nz).fill(-1);
    const P = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const v = at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
        cv[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let ax = 0, ay = 0, az = 0, cnt = 0;
      for (const [a, b] of E) {
        const va = cv[a], vb = cv[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        ax += (a & 1) + ((b & 1) - (a & 1)) * t;
        ay += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
        az += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
        cnt++;
      }
      vid[i + nx * (j + ny * k)] = P.length / 3;
      P.push(mn[0] + (i + ax / cnt) * h, mn[1] + (j + ay / cnt) * h, mn[2] + (k + az / cnt) * h);
    }
    const n = P.length / 3;
    if (n > 65535) throw new Error('sculpt: too many vertices ' + n);
    const pos = new Float32Array(P), nrm = new Float32Array(n * 3);
    tick('refine');
    // settle each vertex onto the surface and take its normal from the field
    const e = h * 0.3;
    for (let v = 0; v < n; v++) {
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let gx = 0, gy = 1, gz = 0;
      const l = blockOf(x, y, z);
      for (let it = 0; it < 2 && l; it++) {
        const d = evalCull(l, x, y, z, margin);
        gx = (evalCull(l, x + e, y, z, margin) - d) * 2;
        gy = (evalCull(l, x, y + e, z, margin) - d) * 2;
        gz = (evalCull(l, x, y, z + e, margin) - d) * 2;
        if (it === 1) break;
        // Newton step toward d = 0 along the gradient, never more than half a cell
        const Gx = gx / (2 * e), Gy = gy / (2 * e), Gz = gz / (2 * e);
        const g2 = Gx * Gx + Gy * Gy + Gz * Gz;
        if (g2 < 1e-10) break;
        let sx2 = (Gx * d) / g2, sy2 = (Gy * d) / g2, sz2 = (Gz * d) / g2;
        const sl = Math.hypot(sx2, sy2, sz2), lim = h * 0.6;
        if (sl > lim) { sx2 *= lim / sl; sy2 *= lim / sl; sz2 *= lim / sl; }
        x -= sx2; y -= sy2; z -= sz2;
      }
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      const gl = Math.hypot(gx, gy, gz) || 1;
      nrm[v * 3] = gx / gl; nrm[v * 3 + 1] = gy / gl; nrm[v * 3 + 2] = gz / gl;
    }
    tick('quads');
    // quads across every edge the surface crosses
    const tris = [];
    const V = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : vid[i + nx * (j + ny * k)]);
    const quad = (a, b, c, d) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      // split along the shorter diagonal
      const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
      const dbd = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
      if (dac <= dbd) tris.push(a, b, c, a, c, d); else tris.push(a, b, d, b, c, d);
    };
    for (let k = 0; k < sz; k++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
      const v0 = at(i, j, k) < 0;
      if (i < nx && v0 !== (at(i + 1, j, k) < 0)) quad(V(i, j - 1, k - 1), V(i, j, k - 1), V(i, j, k), V(i, j - 1, k));
      if (j < ny && v0 !== (at(i, j + 1, k) < 0)) quad(V(i - 1, j, k - 1), V(i, j, k - 1), V(i, j, k), V(i - 1, j, k));
      if (k < nz && v0 !== (at(i, j, k + 1) < 0)) quad(V(i - 1, j - 1, k), V(i, j - 1, k), V(i, j, k), V(i - 1, j, k));
    }
    tick('cuts');
    // clean colour edges: cut the triangles along each boundary (opts.cuts: functions that change
    // sign where one colour meets the next), so a band or a cuff ends in a straight line
    let posA = pos, nrmA = nrm, nv = n;
    if (opts.cuts && opts.cuts.length) {
      const P2 = Array.from(pos), N2 = Array.from(nrm);
      for (const f of opts.cuts) {
        const fv = new Float32Array(P2.length / 3);
        for (let v = 0; v < fv.length; v++) fv[v] = f(P2[v * 3], P2[v * 3 + 1], P2[v * 3 + 2]);
        const memo = new Map();
        const mid = (a, b) => {
          const key = a < b ? a * 131072 + b : b * 131072 + a;
          let m = memo.get(key);
          if (m !== undefined) return m;
          const t = fv[a] / (fv[a] - fv[b]);
          m = P2.length / 3;
          for (let i = 0; i < 3; i++) { P2.push(P2[a * 3 + i] + (P2[b * 3 + i] - P2[a * 3 + i]) * t); N2.push(N2[a * 3 + i] + (N2[b * 3 + i] - N2[a * 3 + i]) * t); }
          memo.set(key, m);
          return m;
        };
        const out = [];
        for (let t = 0; t < tris.length; t += 3) {
          const v = [tris[t], tris[t + 1], tris[t + 2]];
          const sg = v.map((q) => fv[q] < 0);
          if (sg[0] === sg[1] && sg[1] === sg[2]) { out.push(v[0], v[1], v[2]); continue; }
          // the corner on its own side
          const L = sg[0] !== sg[1] && sg[0] !== sg[2] ? 0 : sg[1] !== sg[0] && sg[1] !== sg[2] ? 1 : 2;
          const a = v[L], b = v[(L + 1) % 3], c = v[(L + 2) % 3];
          const ab = mid(a, b), ac = mid(a, c);
          out.push(a, ab, ac, ab, b, c, ab, c, ac);
        }
        tris.length = 0;
        for (const q of out) tris.push(q);
      }
      if (P2.length / 3 > 65535) throw new Error('sculpt: too many vertices after cuts');
      posA = new Float32Array(P2); nrmA = new Float32Array(N2); nv = P2.length / 3;
      for (let v = 0; v < nv; v++) {
        const l = Math.hypot(nrmA[v * 3], nrmA[v * 3 + 1], nrmA[v * 3 + 2]) || 1;
        nrmA[v * 3] /= l; nrmA[v * 3 + 1] /= l; nrmA[v * 3 + 2] /= l;
      }
    }
    tick('mats');
    // a material for every triangle, from its middle
    const nt = tris.length / 3;
    const tm = new Uint8Array(nt);
    for (let t = 0; t < nt; t++) {
      const a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2];
      const x = (posA[a * 3] + posA[b * 3] + posA[c * 3]) / 3, y = (posA[a * 3 + 1] + posA[b * 3 + 1] + posA[c * 3 + 1]) / 3, z = (posA[a * 3 + 2] + posA[b * 3 + 2] + posA[c * 3 + 2]) / 3;
      const l = blockOf(x, y, z);
      tm[t] = l ? matAt(l, x, y, z) : 0;
    }
    const ranges = {};
    const idx = new Uint16Array(tris.length);
    let o = 0;
    const mats = [...new Set(tm)].sort((a, b) => a - b);
    for (const m of mats) {
      const first = o;
      for (let t = 0; t < nt; t++) if (tm[t] === m) { idx[o++] = tris[t * 3]; idx[o++] = tris[t * 3 + 1]; idx[o++] = tris[t * 3 + 2]; }
      ranges[m] = [first, o - first];
    }
    tick('group');
    const out = { n: nv, pos: posA, nrm: nrmA, idx, ranges, h };
    // skinning: the two nearest bones for every vertex
    if (opts.nb) {
      const b0 = new Uint8Array(nv), b1 = new Uint8Array(nv), w = new Float32Array(nv);
      const tmp = { bd: new Float32Array(opts.nb), b0: 0, b1: 0, w: 1 };
      for (let v = 0; v < nv; v++) {
        const x = posA[v * 3], y = posA[v * 3 + 1], z = posA[v * 3 + 2];
        const l = blockOf(x, y, z) || list;
        bonesAt(l, x, y, z, opts.nb, opts.sigma || 0.025, tmp);
        b0[v] = tmp.b0; b1[v] = tmp.b1; w[v] = tmp.w;
      }
      out.b0 = b0; out.b1 = b1; out.w = w;
    }
    tick('bones');
    // ambient occlusion: how buried each vertex is, probed a few steps out along its normal
    if (opts.ao) {
      const ao = new Float32Array(nv);
      const st = opts.ao;
      for (let v = 0; v < nv; v++) {
        const x = posA[v * 3], y = posA[v * 3 + 1], z = posA[v * 3 + 2];
        const nx = nrmA[v * 3], ny = nrmA[v * 3 + 1], nz = nrmA[v * 3 + 2];
        let occ = 0, wsum = 0;
        for (let i = 1; i <= 4; i++) {
          const d = st * i;
          const qx = x + nx * d, qy = y + ny * d, qz = z + nz * d;
          const l = blockOf(qx, qy, qz);
          const f = l ? Math.min(evalCull(l, qx, qy, qz, d * 1.5), d) : d;
          const w = 1 / i;
          occ += w * Math.max(0, d - f) / d;
          wsum += w;
        }
        ao[v] = clamp(1 - 1.5 * occ / wsum, 0.4, 1);
      }
      out.ao = ao;
    }
    out.field = fieldAt;
    tick('end'); if (TT) out.prof = TT.join(' ');
    return out;
  }

  // ---- skinning on the CPU: bones are 4x4 matrices (column-major, like M4) ----
  // writes interleaved [x,y,z, nx,ny,nz] into out
  function skin(m, bones, out) {
    const pos = m.pos, nrm = m.nrm, b0 = m.b0, b1 = m.b1, w = m.w;
    for (let v = 0, n = m.n; v < n; v++) {
      const i3 = v * 3, o = v * 6;
      const x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
      const nx = nrm[i3], ny = nrm[i3 + 1], nz = nrm[i3 + 2];
      const A = b0[v] * 16, Bb = b1[v] * 16, wa = w[v], wb = 1 - wa;
      let px, py, pz, qx, qy, qz;
      {
        const M = bones;
        px = (M[A] * x + M[A + 4] * y + M[A + 8] * z + M[A + 12]) * wa;
        py = (M[A + 1] * x + M[A + 5] * y + M[A + 9] * z + M[A + 13]) * wa;
        pz = (M[A + 2] * x + M[A + 6] * y + M[A + 10] * z + M[A + 14]) * wa;
        qx = (M[A] * nx + M[A + 4] * ny + M[A + 8] * nz) * wa;
        qy = (M[A + 1] * nx + M[A + 5] * ny + M[A + 9] * nz) * wa;
        qz = (M[A + 2] * nx + M[A + 6] * ny + M[A + 10] * nz) * wa;
        if (wb > 0.001) {
          px += (M[Bb] * x + M[Bb + 4] * y + M[Bb + 8] * z + M[Bb + 12]) * wb;
          py += (M[Bb + 1] * x + M[Bb + 5] * y + M[Bb + 9] * z + M[Bb + 13]) * wb;
          pz += (M[Bb + 2] * x + M[Bb + 6] * y + M[Bb + 10] * z + M[Bb + 14]) * wb;
          qx += (M[Bb] * nx + M[Bb + 4] * ny + M[Bb + 8] * nz) * wb;
          qy += (M[Bb + 1] * nx + M[Bb + 5] * ny + M[Bb + 9] * nz) * wb;
          qz += (M[Bb + 2] * nx + M[Bb + 6] * ny + M[Bb + 10] * nz) * wb;
        }
      }
      const ql = 1 / (Math.sqrt(qx * qx + qy * qy + qz * qz) || 1);
      out[o] = px; out[o + 1] = py; out[o + 2] = pz;
      out[o + 3] = qx * ql; out[o + 4] = qy * ql; out[o + 5] = qz * ql;
    }
    return out;
  }
  // rest mesh as interleaved [pos, normal] (for rigid parts)
  function interleave(m) {
    const out = new Float32Array(m.n * 6);
    for (let v = 0; v < m.n; v++) {
      out[v * 6] = m.pos[v * 3]; out[v * 6 + 1] = m.pos[v * 3 + 1]; out[v * 6 + 2] = m.pos[v * 3 + 2];
      out[v * 6 + 3] = m.nrm[v * 3]; out[v * 6 + 4] = m.nrm[v * 3 + 1]; out[v * 6 + 5] = m.nrm[v * 3 + 2];
    }
    return out;
  }

  // any shape you can write a distance for
  const custom = (d, bb, o) => node(d, bb, o);
  // a shape moved: turned by `ang` about the z axis, scaled by s, then shifted by t
  function moved(n, ang, t, s) {
    const c = Math.cos(ang), si = Math.sin(ang);
    const d = (x, y, z) => {
      const px = (x - t[0]) / s, py = (y - t[1]) / s, pz = (z - t[2]) / s;
      // undo the turn
      return nodeD(n, c * px + si * py, -si * px + c * py, pz) * s;
    };
    const b = n.bb, m = Math.max(b[3] - b[0], b[4] - b[1]) * s;
    const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2;
    const mx = (c * cx - si * cy) * s + t[0], my = (si * cx + c * cy) * s + t[1];
    const o = { op: n.op, k: n.k, mat: n.mat, paint: n.paint, bone: n.bone, bias: n.bias };
    const r = node(d, [mx - m, my - m, b[2] * s + t[2], mx + m, my + m, b[5] * s + t[2]], o);
    if (n.children) r.children = n.children.map((ch) => moved(ch, ang, t, s));
    return r;
  }

  SS.Sculpt = { ell, tube, box, torus, plane, group, custom, moved, build, skin, interleave, smin, smax, cross, norm };
})();
