/*
 * Shred Slope: a tiny WebGL engine (no libraries).
 *
 * World axes: +x right, +y up, +z down the mountain (away from the camera).
 * Three shader programs:
 *   baked:  static world with lighting baked into vertex colours, plus fog
 *   lit:    moving things (riders) lit by moon, sky and the nearest floodlights
 *   points: particles, stars and lamp glows
 */
(function () {
  'use strict';
  const SS = (window.SS = window.SS || {});

  // ------------------------------------------------------------------ 4x4 matrices (column-major)
  const T = new Float32Array(16);
  const M4 = {
    create() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    identity(m) {
      m.fill(0);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    mul(o, a, b) {
      for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
        T[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        T[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        T[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        T[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      o.set(T);
      return o;
    },
    // left-handed perspective: looks down +z
    perspective(o, fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2);
      o.fill(0);
      o[0] = f / aspect;
      o[5] = f;
      o[10] = (far + near) / (far - near);
      o[11] = 1;
      o[14] = (-2 * far * near) / (far - near);
      return o;
    },
    lookAt(o, eye, target, up) {
      let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
      let l = Math.hypot(fx, fy, fz) || 1;
      fx /= l; fy /= l; fz /= l;
      let rx = up[1] * fz - up[2] * fy, ry = up[2] * fx - up[0] * fz, rz = up[0] * fy - up[1] * fx;
      l = Math.hypot(rx, ry, rz) || 1;
      rx /= l; ry /= l; rz /= l;
      const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
      o[0] = rx; o[4] = ry; o[8] = rz; o[12] = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
      o[1] = ux; o[5] = uy; o[9] = uz; o[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
      o[2] = fx; o[6] = fy; o[10] = fz; o[14] = -(fx * eye[0] + fy * eye[1] + fz * eye[2]);
      o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
      return o;
    },
    translate(m, x, y, z) {
      m[12] += m[0] * x + m[4] * y + m[8] * z;
      m[13] += m[1] * x + m[5] * y + m[9] * z;
      m[14] += m[2] * x + m[6] * y + m[10] * z;
      m[15] += m[3] * x + m[7] * y + m[11] * z;
      return m;
    },
    rotY(m, a) { // positive turns +z toward +x
      const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) {
        const c0 = m[i], c2 = m[8 + i];
        m[i] = c * c0 - s * c2;
        m[8 + i] = s * c0 + c * c2;
      }
      return m;
    },
    rotX(m, a) { // positive tips +z downward (nose down)
      const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) {
        const c1 = m[4 + i], c2 = m[8 + i];
        m[4 + i] = c * c1 + s * c2;
        m[8 + i] = -s * c1 + c * c2;
      }
      return m;
    },
    rotZ(m, a) { // positive tips +y toward -x
      const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) {
        const c0 = m[i], c1 = m[4 + i];
        m[i] = c * c0 + s * c1;
        m[4 + i] = -s * c0 + c * c1;
      }
      return m;
    },
    scale(m, x, y, z) {
      for (let i = 0; i < 4; i++) { m[i] *= x; m[4 + i] *= y; m[8 + i] *= z; }
      return m;
    },
    point(m, x, y, z, out) {
      out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      return out;
    },
  };
  SS.M4 = M4;

  // ------------------------------------------------------------------ growable float buffer
  class FBuf {
    constructor(n = 4096) {
      this.a = new Float32Array(n);
      this.n = 0;
    }
    ensure(k) {
      if (this.n + k <= this.a.length) return;
      let len = this.a.length * 2;
      while (len < this.n + k) len *= 2;
      const b = new Float32Array(len);
      b.set(this.a.subarray(0, this.n));
      this.a = b;
    }
    v(x, y, z, r, g, b) {
      if (this.n + 6 > this.a.length) this.ensure(6);
      const A = this.a, n = this.n;
      A[n] = x; A[n + 1] = y; A[n + 2] = z; A[n + 3] = r; A[n + 4] = g; A[n + 5] = b;
      this.n = n + 6;
    }
    data() { return this.a.subarray(0, this.n); }
  }
  SS.FBuf = FBuf;

  // ------------------------------------------------------------------ shaders
  const HEAD = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

  const VS_BAKED = `
attribute vec3 aPos; attribute vec3 aCol;
uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uCam; uniform vec2 uFog;
varying vec3 vCol; varying float vFog;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * w;
  vCol = aCol;
  vFog = clamp((length(w.xyz - uCam) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
}`;
  const FS_BAKED = HEAD + `
varying vec3 vCol; varying float vFog;
uniform vec3 uFogCol; uniform float uAlpha; uniform float uBright;
void main() {
  gl_FragColor = vec4(mix(vCol * uBright, uFogCol, vFog), uAlpha);
}`;

  const VS_LIT = `
attribute vec3 aPos; attribute vec3 aNorm;
uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uCam; uniform vec2 uFog;
varying vec3 vN; varying vec3 vRel; varying float vFog;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * w;
  vN = mat3(uModel) * aNorm;
  vRel = w.xyz - uCam;
  vFog = clamp((length(vRel) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
}`;
  const FS_LIT = HEAD + `
varying vec3 vN; varying vec3 vRel; varying float vFog;
uniform vec3 uColor; uniform float uEmissive; uniform vec3 uFogCol;
uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uMoonDir; uniform vec3 uMoonCol;
uniform vec3 uLP[4]; uniform vec3 uLC[4];
void main() {
  vec3 n = normalize(vN);
  vec3 light = mix(uGround, uSky, n.y * 0.5 + 0.5) + uMoonCol * max(dot(n, uMoonDir), 0.0);
  for (int i = 0; i < 4; i++) {
    vec3 L = uLP[i] - vRel;
    float d2 = dot(L, L);
    light += uLC[i] * max(dot(n, L * inversesqrt(d2)), 0.0) / (1.0 + d2 * 0.0035);
  }
  vec3 c = uColor * light + uColor * uEmissive;
  gl_FragColor = vec4(mix(c, uFogCol, vFog), 1.0);
}`;

  const VS_PTS = `
attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;
uniform mat4 uVP; uniform vec3 uOffset; uniform float uPx; uniform float uMax;
varying vec4 vCol;
void main() {
  vec4 p = uVP * vec4(aPos + uOffset, 1.0);
  gl_Position = p;
  gl_PointSize = clamp(aSize * uPx / max(p.w, 0.05), 1.0, uMax);
  vCol = aCol;
}`;
  const FS_PTS = `precision mediump float;
varying vec4 vCol; uniform float uSoft;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  float k = 1.0 - r;
  gl_FragColor = vec4(vCol.rgb, vCol.a * mix(1.0, k * k, uSoft));
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
    return s;
  }

  function makeProgram(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.bindAttribLocation(p, 1, 'aCol');
    gl.bindAttribLocation(p, 2, 'aNorm');
    gl.bindAttribLocation(p, 3, 'aSize');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  // unit cube centred on the origin, with normals (for riders)
  function cubeData() {
    const out = [];
    const faces = [
      [[1, 0, 0], [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]]],
      [[-1, 0, 0], [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]]],
      [[0, 1, 0], [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]]],
      [[0, -1, 0], [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]]],
      [[0, 0, 1], [[.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [-.5, -.5, .5]]],
      [[0, 0, -1], [[-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [.5, -.5, -.5]]],
    ];
    for (const [n, q] of faces) {
      for (const i of [0, 1, 2, 0, 2, 3]) out.push(q[i][0], q[i][1], q[i][2], n[0], n[1], n[2]);
    }
    return new Float32Array(out);
  }

  // low-poly sphere (radius 0.5) with normals
  function sphereData(lat = 6, lon = 10) {
    const out = [];
    const P = (i, j) => {
      const t = (i / lat) * Math.PI, f = (j / lon) * Math.PI * 2;
      return [Math.sin(t) * Math.cos(f) * 0.5, Math.cos(t) * 0.5, Math.sin(t) * Math.sin(f) * 0.5];
    };
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        for (const v of [a, b, c, a, c, d]) out.push(v[0], v[1], v[2], v[0] * 2, v[1] * 2, v[2] * 2);
      }
    }
    return new Float32Array(out);
  }

  // flat disc (radius 1) in the xz plane, baked colour: used for blob shadows
  function discData(seg = 14) {
    const out = [];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      out.push(0, 0, 0, 0.02, 0.03, 0.06);
      out.push(Math.cos(a0), 0, Math.sin(a0), 0.02, 0.03, 0.06);
      out.push(Math.cos(a1), 0, Math.sin(a1), 0.02, 0.03, 0.06);
    }
    return new Float32Array(out);
  }

  // ------------------------------------------------------------------ engine
  class Engine {
    constructor(canvas) {
      const opts = { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' };
      const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (!gl) throw new Error('nogl');
      this.gl = gl;
      this.canvas = canvas;
      this.baked = makeProgram(gl, VS_BAKED, FS_BAKED);
      this.lit = makeProgram(gl, VS_LIT, FS_LIT);
      this.pts = makeProgram(gl, VS_PTS, FS_PTS);
      this.proj = M4.create();
      this.view = M4.create();
      this.vp = M4.create();
      this.ident = M4.create();
      this.tmp = M4.create();
      this.eye = [0, 0, 0];
      this.fog = [60, 420];
      this.fogCol = [0.09, 0.13, 0.25];
      this.enabled = [false, false, false, false];
      this.cur = null;
      this.cube = this.mesh(cubeData(), 6);
      this.sphere = this.mesh(sphereData(), 6);
      this.disc = this.mesh(discData(), 6);
      this.ptsBuf = gl.createBuffer();
      this.pxScale = 1;
      this.maxPoint = Math.min(256, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64);
      this.light = {
        sky: [0.30, 0.34, 0.50], ground: [0.10, 0.11, 0.17],
        moonDir: norm([0.35, 0.8, -0.45]), moonCol: [0.26, 0.29, 0.40],
        lp: new Float32Array(12), lc: new Float32Array(12),
      };
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.w = 1;
      this.h = 1;
    }

    resize(w, h, dpr) {
      const c = this.canvas;
      const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
      if (c.width !== pw || c.height !== ph) {
        c.width = pw;
        c.height = ph;
      }
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      this.w = pw;
      this.h = ph;
      this.gl.viewport(0, 0, pw, ph);
    }

    mesh(data, stride, mode, dynamic) {
      const gl = this.gl;
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      return { b, count: data.length / stride, stride, mode: mode === undefined ? gl.TRIANGLES : mode };
    }

    free(m) {
      if (m && m.b) this.gl.deleteBuffer(m.b);
    }

    setCamera(eye, target, fovy) {
      M4.perspective(this.proj, fovy, this.w / this.h, 0.1, 2600);
      M4.lookAt(this.view, eye, target, [0, 1, 0]);
      M4.mul(this.vp, this.proj, this.view);
      this.eye[0] = eye[0]; this.eye[1] = eye[1]; this.eye[2] = eye[2];
      this.pxScale = (this.h * this.proj[5]) / 2;
    }

    // world -> screen pixels (CSS px); returns false when behind the camera
    project(x, y, z, out, cssScale) {
      const m = this.vp;
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw < 0.1) return false;
      out[0] = ((cx / cw) * 0.5 + 0.5) * this.w * cssScale;
      out[1] = (0.5 - (cy / cw) * 0.5) * this.h * cssScale;
      out[2] = cw;
      return true;
    }

    clear(col) {
      const gl = this.gl;
      gl.clearColor(col[0], col[1], col[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    attribs(locs) {
      const gl = this.gl;
      for (let i = 0; i < 4; i++) {
        const want = locs.indexOf(i) >= 0;
        if (want !== this.enabled[i]) {
          if (want) gl.enableVertexAttribArray(i);
          else gl.disableVertexAttribArray(i);
          this.enabled[i] = want;
        }
      }
    }

    use(prog) {
      if (this.cur !== prog) {
        this.gl.useProgram(prog.p);
        this.cur = prog;
      }
      return prog.u;
    }

    // ---- baked (static world) ----
    beginBaked(fogNear, fogFar) {
      const gl = this.gl;
      const u = this.use(this.baked);
      gl.uniformMatrix4fv(u.uVP, false, this.vp);
      gl.uniform3fv(u.uCam, this.eye);
      gl.uniform2f(u.uFog, fogNear === undefined ? this.fog[0] : fogNear, fogFar === undefined ? this.fog[1] : fogFar);
      gl.uniform3fv(u.uFogCol, this.fogCol);
      gl.uniform1f(u.uAlpha, 1);
      gl.uniform1f(u.uBright, 1);
      gl.uniformMatrix4fv(u.uModel, false, this.ident);
      this.attribs([0, 1]);
      return u;
    }

    drawBaked(mesh, model, alpha, bright) {
      const gl = this.gl;
      const u = this.baked.u;
      if (model) gl.uniformMatrix4fv(u.uModel, false, model);
      if (alpha !== undefined) gl.uniform1f(u.uAlpha, alpha);
      if (bright !== undefined) gl.uniform1f(u.uBright, bright);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(mesh.mode, 0, mesh.count);
      if (model) gl.uniformMatrix4fv(u.uModel, false, this.ident);
      if (alpha !== undefined) gl.uniform1f(u.uAlpha, 1);
      if (bright !== undefined) gl.uniform1f(u.uBright, 1);
    }

    // ---- lit (riders) ----
    beginLit(lights) {
      const gl = this.gl;
      const u = this.use(this.lit);
      const L = this.light;
      gl.uniformMatrix4fv(u.uVP, false, this.vp);
      gl.uniform3fv(u.uCam, this.eye);
      gl.uniform2f(u.uFog, this.fog[0], this.fog[1]);
      gl.uniform3fv(u.uFogCol, this.fogCol);
      gl.uniform3fv(u.uSky, L.sky);
      gl.uniform3fv(u.uGround, L.ground);
      gl.uniform3fv(u.uMoonDir, L.moonDir);
      gl.uniform3fv(u.uMoonCol, L.moonCol);
      gl.uniform1f(u.uEmissive, 0);
      this.setLights(lights);
      this.attribs([0, 2]);
      return u;
    }

    // lights: array of {x,y,z,i} (up to 4); positions are sent relative to the camera
    setLights(lights) {
      const L = this.light, u = this.lit.u, e = this.eye;
      for (let i = 0; i < 4; i++) {
        const l = lights && lights[i];
        if (l) {
          L.lp[i * 3] = l.x - e[0]; L.lp[i * 3 + 1] = l.y - e[1]; L.lp[i * 3 + 2] = l.z - e[2];
          L.lc[i * 3] = l.i; L.lc[i * 3 + 1] = l.i * 0.93; L.lc[i * 3 + 2] = l.i * 0.8;
        } else {
          L.lp[i * 3] = 0; L.lp[i * 3 + 1] = 1e4; L.lp[i * 3 + 2] = 0;
          L.lc[i * 3] = L.lc[i * 3 + 1] = L.lc[i * 3 + 2] = 0;
        }
      }
      this.gl.uniform3fv(u.uLP, L.lp);
      this.gl.uniform3fv(u.uLC, L.lc);
    }

    drawLit(mesh, model, color, emissive) {
      const gl = this.gl;
      const u = this.lit.u;
      gl.uniformMatrix4fv(u.uModel, false, model);
      gl.uniform3fv(u.uColor, color);
      gl.uniform1f(u.uEmissive, emissive || 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }

    // ---- points: data = [x,y,z, r,g,b,a, size] per point ----
    drawPoints(data, count, opts) {
      if (!count) return;
      const gl = this.gl;
      const u = this.use(this.pts);
      gl.uniformMatrix4fv(u.uVP, false, this.vp);
      const off = (opts && opts.offset) || [0, 0, 0];
      gl.uniform3f(u.uOffset, off[0], off[1], off[2]);
      gl.uniform1f(u.uPx, this.pxScale);
      gl.uniform1f(u.uMax, (opts && opts.max) || this.maxPoint);
      gl.uniform1f(u.uSoft, opts && opts.soft !== undefined ? opts.soft : 1);
      this.attribs([0, 1, 3]);
      let buf = this.ptsBuf;
      if (opts && opts.mesh) buf = opts.mesh.b;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      if (!(opts && opts.mesh)) gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 8), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 28);
      gl.enable(gl.BLEND);
      if (opts && opts.additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  SS.Engine = Engine;
})();
