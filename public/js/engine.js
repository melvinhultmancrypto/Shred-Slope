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
    ortho(o, l, r, b, t, n, f) {
      o.fill(0);
      // this engine's lookAt puts "forward" on +z, so depth grows with +z here
      o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = 2 / (f - n);
      o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
      return o;
    },
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

  // real-time sun shadows: depth packed into RGBA (works everywhere WebGL1 does)
  const SHADOW = `
uniform sampler2D uShadow; uniform float uShadowOn; uniform vec3 uShadowP;
float unpackD(vec4 c) { return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
float shadowAt(vec4 sp) {
  if (uShadowOn < 0.5) return 0.0;
  vec3 p = sp.xyz / sp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0 || p.z > 1.0) return 0.0;
  float z = p.z - uShadowP.y;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) s += step(unpackD(texture2D(uShadow, p.xy + vec2(float(i), float(j)) * uShadowP.x)), z);
  }
  vec2 e = min(p.xy, 1.0 - p.xy);
  return s / 9.0 * smoothstep(0.0, 0.06, min(e.x, e.y));
}`;

  const VS_BAKED = `
attribute vec3 aPos; attribute vec3 aCol;
uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uCam; uniform vec2 uFog; uniform mat4 uShadowVP;
varying vec3 vCol; varying float vFog; varying vec3 vW; varying vec4 vSh;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * w;
  vCol = aCol;
  vW = w.xyz;
  vSh = uShadowVP * w;
  float f = clamp((length(w.xyz - uCam) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  vFog = f * (2.0 - f);
}`;
  const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
// value noise and its slope in one go (x: value, yz: d/dx, d/dy)
vec3 vnoiseD(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0)), c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}`;
  const FS_BAKED = HEAD + NOISE + SHADOW + `
varying vec3 vCol; varying float vFog; varying vec3 vW; varying vec4 vSh;
uniform vec3 uFogCol; uniform float uAlpha; uniform float uBright; uniform float uDetail; uniform vec3 uEye;
uniform vec3 uShadowDark; uniform vec3 uSunDirF; uniform vec3 uHaze; uniform vec3 uCold; uniform vec3 uMist;
uniform vec4 uCurve; uniform vec4 uCurveP; uniform vec3 uGlare;
void main() {
  vec3 c = vCol * uBright;
  // riders' shadows, tinted by the sky
  float sh = shadowAt(vSh);
  c *= mix(vec3(1.0), uShadowDark, sh);
  if (uDetail > 0.0) {
    float lum = dot(vCol, vec3(0.3, 0.5, 0.2));
    float mx = max(max(vCol.r, vCol.g), vCol.b), mn = min(min(vCol.r, vCol.g), vCol.b);
    float snow = smoothstep(0.3, 0.55, lum) * step(mx - mn, mx * 0.42);
    // snow in shade goes cold and blue, like the real thing
    c *= mix(vec3(1.0), uCold, snow * (1.0 - smoothstep(0.42, 0.85, lum)));
    float dCam = length(vW - uEye);
    // foliage: clumps of needles instead of flat facets
    float fol = step(mx * 0.9, vCol.g) * step(vCol.r * 1.12, vCol.g) * (1.0 - snow) * step(lum, 0.5);
    if (fol > 0.0) {
      float nn = vnoise(vW.xz * 5.0 + vW.y * 3.1) * 0.6 + vnoise(vW.xz * 13.0 - vW.y * 7.0) * 0.4;
      c *= mix(1.0, 0.68 + 0.6 * nn, fol * (1.0 - smoothstep(60.0, 160.0, dCam)));
    }
    // rock: grain and strata
    float rk = step(mx - mn, 0.07) * smoothstep(0.06, 0.12, lum) * (1.0 - smoothstep(0.32, 0.42, lum)) * (1.0 - snow);
    if (rk > 0.0) {
      float st = vnoise(vec2(vW.x * 0.35 + vW.z * 0.2, vW.y * 2.4)) * 0.6 + vnoise(vW.xz * 1.9 + vW.y * 1.3) * 0.4;
      c *= mix(1.0, 0.72 + 0.5 * st, rk * (1.0 - smoothstep(80.0, 220.0, dCam)));
    }
    // the groomed piste: wide bands where the groomer passes meet, following the course's curves
    if (uCurve.x > -0.5 && snow > 0.5) {
      float cx = uCurve.x * sin(vW.z / uCurve.y + uCurveP.x) + uCurve.z * sin(vW.z / uCurve.w + uCurveP.y) - uCurveP.z;
      float off = vW.x - cx;
      float onPiste = 1.0 - smoothstep(uCurveP.w - 1.5, uCurveP.w - 0.3, abs(off));
      if (onPiste > 0.0) {
        float pass = smoothstep(0.46, 0.54, fract(off / 4.6 + 0.25)) - smoothstep(0.96, 1.0, fract(off / 4.6 + 0.25));
        c *= 1.0 + onPiste * (pass - 0.5) * 0.022 * (1.0 - smoothstep(60.0, 180.0, dCam));
      }
    }
    // sun glare off the snow when you look toward it
    vec3 rv = normalize(vec3(vW.x - uEye.x, uEye.y - vW.y, vW.z - uEye.z));
    float gl = max(dot(rv, uSunDirF), 0.0);
    c += uGlare * snow * (pow(gl, 48.0) * 0.7 + pow(gl, 12.0) * 0.18) * (1.0 - sh);
    if (snow > 0.0) {
      // wind-blown snow texture
      float n = vnoise(vW.xz * 0.3) * 0.55 + vnoise(vW.xz * 1.9 + 7.0) * 0.45;
      c *= mix(1.0, 0.92 + n * 0.13, snow);
      float d = dCam;
      // ripples in the snow: their sunny sides light up, their lee sides fall into shade
      // (soft, round and only up close: long thin ripples turned into streaks at speed)
      if (d < 45.0) {
        vec2 rp = vec2(vW.x * 0.6 + vW.z * 0.12, vW.z * 0.55 - vW.x * 0.12);
        vec2 gr = vnoiseD(rp).yz * 0.8 + vnoiseD(rp * 2.3 + 5.0).yz * 0.46;
        float bump = -dot(gr, normalize(uSunDirF.xz + vec2(0.0001))) * 0.04 * smoothstep(45.0, 8.0, d);
        c *= 1.0 + bump * snow * (1.0 - sh * 0.8) * uDetail;
      }
      // glitter that flickers as the camera moves, like real snow under lights
      if (d < 40.0) {
        vec2 cell = floor(vW.xz * 7.0);
        float h = h21(cell + floor(vW.y * 7.0) * 3.17);
        float tw = h21(cell * 1.31 + floor(uEye.xz * 1.6) * 0.37);
        vec2 spot = vec2(h21(cell + 11.0), h21(cell + 23.0));
        float dot0 = smoothstep(0.16, 0.0, length(fract(vW.xz * 7.0) - spot));
        float s = step(0.975, h) * step(0.55, tw) * dot0 * snow * (1.0 - d / 40.0);
        c += vec3(0.95, 0.97, 1.0) * s * (0.6 + lum * 1.6) * uDetail * (1.0 - sh);
      }
    }
  }
  // aerial perspective: the haze glows warmer toward the sun
  vec3 vd = normalize(vW - uEye);
  vec3 fc = uFogCol + uHaze * pow(max(dot(vd, uSunDirF), 0.0), 5.0);
  // valley mist: low ground far away sinks into haze, so ridges stand out in layers
  float dist = length(vW - uEye);
  float mist = clamp((uEye.y - uMist.x - vW.y) / uMist.y, 0.0, 1.0) * uMist.z * smoothstep(60.0, 300.0, dist);
  gl_FragColor = vec4(mix(c, fc, max(vFog, mist)), uAlpha);
}`;

  const VS_LIT = `
attribute vec3 aPos; attribute vec3 aNorm;
uniform mat4 uVP; uniform mat4 uModel; uniform mat3 uNM; uniform vec3 uCam; uniform vec2 uFog; uniform mat4 uShadowVP;
varying vec3 vN; varying vec3 vRel; varying float vFog; varying vec4 vSh; varying vec3 vObj; varying vec3 vTy;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * w;
  vN = uNM * aNorm;
  vObj = aPos;
  vTy = normalize((uModel * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vRel = w.xyz - uCam;
  // nudge along the normal before looking up the shadow, so curved cloth doesn't shadow itself in stripes
  vSh = uShadowVP * vec4(w.xyz + normalize(vN) * 0.03, 1.0);
  float f = clamp((length(vRel) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  vFog = f * (2.0 - f);
}`;
  const FS_LIT = HEAD + NOISE + SHADOW + `
varying vec3 vN; varying vec3 vRel; varying float vFog; varying vec4 vSh; varying vec3 vObj; varying vec3 vTy;
uniform float uPat; uniform vec3 uPatCol; uniform float uFold; uniform float uDust; uniform float uLimb;
uniform vec3 uColor; uniform float uEmissive; uniform vec3 uFogCol;
uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uMoonDir; uniform vec3 uMoonCol;
uniform vec3 uLP[4]; uniform vec3 uLC[4]; uniform vec3 uRim; uniform float uAlpha; uniform vec2 uSpec; uniform float uMat;
uniform vec3 uHaze;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(-vRel);
  vec3 base = uColor;
  float ang = atan(vObj.z, vObj.x);
  if (uFold > 0.0) {
    if (uLimb > 1.5) {
      // knit ribs running up a beanie
      vec3 tg = normalize(cross(vTy, n) + vec3(0.0001));
      n = normalize(n + tg * sin(ang * 36.0) * 0.3 * uFold);
    } else {
      // cloth folds running round the body and limbs, bunched up toward the cuffs and ankles
      float ph = vObj.y * 24.0 + sin(ang * 2.0 + vObj.y * 7.0) * 1.6 + vnoise(vec2(ang * 2.5, vObj.y * 9.0)) * 2.4;
      float bunch = uLimb > 0.5 ? mix(1.7, 0.6, clamp(vObj.y, 0.0, 1.0)) : 1.0;
      n = normalize(n + vTy * cos(ph) * 0.3 * uFold * bunch);
    }
  }
  if (uPat > 0.5) {
    vec2 q = uLimb > 0.5 ? vec2(ang * 1.27, vObj.y * 3.2) : vec2(vObj.x * 11.0, vObj.y * 7.0);
    if (uPat < 1.5) {
      // plaid flannel: two crossing bands and thin dark lines
      float a = 1.0 - smoothstep(0.2, 0.24, abs(fract(q.x) - 0.5));
      float b = 1.0 - smoothstep(0.2, 0.24, abs(fract(q.y) - 0.5));
      float l = (1.0 - smoothstep(0.015, 0.035, abs(fract(q.x + 0.5) - 0.5))) + (1.0 - smoothstep(0.015, 0.035, abs(fract(q.y + 0.5) - 0.5)));
      base = mix(base, uPatCol, clamp(a * 0.55 + b * 0.55, 0.0, 0.9));
      base = mix(base, base * 0.5 + vec3(0.03), clamp(l, 0.0, 1.0) * 0.55);
    } else if (uPat < 2.5) {
      // camo blotches in three tones
      float c1 = vnoise(q * 0.9 + 3.0) + vnoise(q * 2.1) * 0.4;
      float c2 = vnoise(q * 1.3 + 17.0) + vnoise(q * 2.7 + 9.0) * 0.4;
      base = mix(base, uPatCol, smoothstep(0.76, 0.8, c1));
      base = mix(base, base * 0.62, smoothstep(0.8, 0.84, c2));
    } else {
      // colour-blocked chest and upper arms
      float yb = vObj.y;
      float band = uLimb > 0.5 ? smoothstep(0.04, 0.06, abs(yb - 0.42) * -1.0 + 0.16) : smoothstep(0.0, 0.02, 0.13 - abs(yb - 0.5));
      base = mix(base, uPatCol, band);
    }
  }
  if (uDust > 0.0) {
    // snow stuck to the lower legs and anything facing up
    float sp = vnoise(vObj.xz * 70.0 + vObj.y * 37.0) * 0.6 + vnoise(vObj.xz * 23.0 - vObj.y * 11.0) * 0.4;
    float low = uLimb > 0.5 ? 1.0 - smoothstep(0.0, 0.5, vObj.y) : 0.35;
    float d = clamp((low * low * 1.1 + smoothstep(0.6, 0.95, n.y) * 0.5) * uDust, 0.0, 1.0) * smoothstep(0.5, 0.6, sp);
    base = mix(base, vec3(0.9, 0.93, 0.98), d);
  }
  float ndv = max(dot(n, v), 0.0);
  float fres = pow(1.0 - ndv, 4.0);
  float lit = 1.0 - shadowAt(vSh) * 0.9;
  float ndl = dot(n, uMoonDir);
  // fabric wraps the light round its folds; skin lets a little warm light through; hard shells are crisp
  float wrapK = uMat > 1.5 ? 0.55 : uMat > 0.5 ? 0.05 : 0.3;
  float diff = max((ndl + wrapK) / (1.0 + wrapK), 0.0);
  // sky above, light bounced off the snow below (snow throws a lot of light back up)
  vec3 amb = mix(uGround * 1.25, uSky, smoothstep(-0.6, 0.8, n.y));
  vec3 light = amb + uMoonCol * diff * lit * 1.2 + uRim * pow(1.0 - ndv, 2.5) * (0.6 + 0.4 * lit);
  if (uMat > 1.5) light += vec3(0.16, 0.05, 0.02) * (1.0 - max(ndl, 0.0)) * smoothstep(-0.4, 0.2, ndl); // skin glow
  vec3 spec = vec3(0.0);
  if (uSpec.x > 0.0) {
    vec3 h = normalize(uMoonDir + v);
    float nh = max(dot(n, h), 0.0);
    spec = uMoonCol * pow(nh, uSpec.y) * (uSpec.y + 8.0) / 24.0 * lit * step(0.0, ndl);
    vec3 r = reflect(-v, n);
    vec3 env = mix(uGround * 1.6, uSky * 1.15, smoothstep(-0.25, 0.35, r.y));
    spec += env * (0.06 + 0.94 * fres) * 0.65;
  } else {
    // soft sheen on cloth at grazing angles
    spec = (uSky * 0.35 + uMoonCol * 0.4 * lit) * fres * 0.3 * (0.2 + base);
  }
  for (int i = 0; i < 4; i++) {
    vec3 L = uLP[i] - vRel;
    float d2 = dot(L, L);
    vec3 ld = L * inversesqrt(d2);
    float fall = 1.0 / (1.0 + d2 * 0.0035);
    light += uLC[i] * max((dot(n, ld) + wrapK) / (1.0 + wrapK), 0.0) * fall;
    if (uSpec.x > 0.0) spec += uLC[i] * pow(max(dot(n, normalize(ld + v)), 0.0), uSpec.y) * fall;
  }
  vec3 c = base * light + base * uEmissive + spec * max(uSpec.x, 1.0);
  if (uMat > 2.5) {
    // mirrored goggle lens: dark at the top, bright at the bottom, sky and snow reflected across it
    float g = smoothstep(-0.04, 0.035, vObj.y);
    vec3 tint = mix(base * 1.3 + 0.06, base * 0.3, g);
    vec3 r = reflect(-v, n);
    vec3 env = mix(uGround * 1.7, uSky * 1.35, smoothstep(-0.2, 0.3, r.y));
    c = tint * (0.4 + 0.3 * light) + env * (0.3 + 0.7 * fres) + spec;
  }
  vec3 fc = uFogCol + uHaze * pow(max(dot(normalize(vRel), uMoonDir), 0.0), 5.0);
  gl_FragColor = vec4(mix(c, fc, vFog), uAlpha);
}`;

  // depth-only pass for the shadow map
  const VS_SHD = `
attribute vec3 aPos;
uniform mat4 uLightVP; uniform mat4 uModel;
void main() { gl_Position = uLightVP * (uModel * vec4(aPos, 1.0)); }`;
  const FS_SHD = HEAD + `
void main() {
  vec4 e = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * gl_FragCoord.z);
  e -= e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = e;
}`;

  // ---- post-processing: bloom, sun rays, grading, vignette and FXAA
  const VS_FS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const FS_BRIGHT = HEAD + `
varying vec2 vUv;
uniform sampler2D uTex; uniform vec2 uPx; uniform float uThr;
void main() {
  vec3 c = texture2D(uTex, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture2D(uTex, vUv + uPx * vec2(1.0, -1.0)).rgb
         + texture2D(uTex, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture2D(uTex, vUv + uPx * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.3, 0.55, 0.15)) * 0.7 + max(max(c.r, c.g), c.b) * 0.3;
  float k = smoothstep(uThr, uThr + 0.2, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;
  const FS_BLUR = HEAD + `
varying vec2 vUv;
uniform sampler2D uTex; uniform vec2 uDir;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb * 0.227;
  c += (texture2D(uTex, vUv + uDir * 1.385).rgb + texture2D(uTex, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(uTex, vUv + uDir * 3.231).rgb + texture2D(uTex, vUv - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;
  const FS_SHAFTS = HEAD + `
varying vec2 vUv;
uniform sampler2D uTex; uniform vec2 uSun; uniform float uAspect;
void main() {
  vec2 d = (uSun - vUv) / 28.0;
  vec2 uv = vUv;
  float decay = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 28; i++) {
    uv += d;
    vec2 q = (uv - uSun) * vec2(uAspect, 1.0);
    vec3 sc = texture2D(uTex, uv).rgb;
    acc += sc * smoothstep(0.55, 0.9, max(max(sc.r, sc.g), sc.b)) * decay * smoothstep(0.32, 0.0, length(q));
    decay *= 0.955;
  }
  gl_FragColor = vec4(acc / 28.0, 1.0);
}`;
  const FS_COMP = HEAD + `
varying vec2 vUv;
uniform sampler2D uTex; uniform sampler2D uBloom; uniform sampler2D uShafts;
uniform vec2 uPx; uniform float uBloomK; uniform vec3 uShaftCol; uniform float uSat; uniform float uCon;
uniform vec3 uLift; uniform vec3 uGain; uniform float uVig; uniform float uTime;
vec3 fxaa(vec2 uv) {
  vec3 nw = texture2D(uTex, uv + vec2(-1.0, -1.0) * uPx).rgb;
  vec3 ne = texture2D(uTex, uv + vec2(1.0, -1.0) * uPx).rgb;
  vec3 sw = texture2D(uTex, uv + vec2(-1.0, 1.0) * uPx).rgb;
  vec3 se = texture2D(uTex, uv + vec2(1.0, 1.0) * uPx).rgb;
  vec3 m = texture2D(uTex, uv).rgb;
  vec3 L = vec3(0.299, 0.587, 0.114);
  float lnw = dot(nw, L), lne = dot(ne, L), lsw = dot(sw, L), lse = dot(se, L), lm = dot(m, L);
  float lmin = min(lm, min(min(lnw, lne), min(lsw, lse)));
  float lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
  if (lmax - lmin < max(0.04, lmax * 0.12)) return m;
  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float red = max((lnw + lne + lsw + lse) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8.0, 8.0) * uPx;
  vec3 a = 0.5 * (texture2D(uTex, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(uTex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(uTex, uv - dir * 0.5).rgb + texture2D(uTex, uv + dir * 0.5).rgb);
  float lb = dot(b, L);
  return (lb < lmin || lb > lmax) ? a : b;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = fxaa(vUv);
  c += texture2D(uBloom, vUv).rgb * uBloomK;
  c += texture2D(uShafts, vUv).rgb * uShaftCol;
  // soft shoulder so bloom and glare roll off instead of clipping
  c = mix(c, 1.0 - 0.2 * exp(-(c - 0.8) * 5.0), step(0.8, c));
  // grade: lift the shadows, tint the highlights, a touch more contrast and colour
  c = c * uGain + uLift * (1.0 - c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.45) * uCon + 0.45;
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVig * pow(dot(q, q) * 2.0, 1.4);
  c += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
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

  const VS_SKY = `
attribute vec3 aPos;
uniform mat4 uVP; uniform vec3 uCam;
varying vec3 vDir;
void main() {
  vDir = aPos;
  vec4 p = uVP * vec4(aPos + uCam, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}`;
  const FS_SKY = HEAD + NOISE + `
varying vec3 vDir;
uniform float uTime; uniform vec3 uMoon; uniform float uDetail; uniform vec3 uFogCol;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunCol; uniform float uDisk; uniform vec4 uGlow;
uniform float uAurora; uniform vec3 uCloudDark; uniform vec3 uCloudLit; uniform float uClouds; uniform float uDay;
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  vec3 col = mix(uHor, uZen, pow(clamp(el, 0.0, 1.0), 0.45));
  if (el < 0.0) col = mix(uHor, uFogCol, clamp(-el * 8.0, 0.0, 1.0));
  float m = max(dot(d, uMoon), 0.0);
  // glow around the sun or moon, plus a warm band along the horizon toward a low sun
  col += uSunCol * (pow(m, uGlow.x) * uGlow.y + pow(m, uGlow.z) * uGlow.w);
  col += uSunCol * uDay * 0.22 * pow(m, 2.5) * exp(-max(el, 0.0) * 7.0);
  float disk = smoothstep(uDisk, uDisk + (1.0 - uDisk) * 0.45, m);

  // northern lights, mostly down the valley
  float az = atan(d.z, d.x);
  float t = uTime * 0.05;
  vec3 aurCol = vec3(0.0);
  if (uAurora > 0.0) {
    float sector = exp(-pow(az - 1.5708, 2.0) / 1.6) * smoothstep(0.0, 0.05, el);
    if (sector > 0.01) {
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float base = 0.16 + fk * 0.12 + sin(az * 3.0 + t * 2.0 + fk * 2.0) * 0.07 + sin(az * 7.0 - t * 3.0) * 0.025;
        float h = el - base;
        float curtain = smoothstep(-0.015, 0.012, h) * exp(-max(h, 0.0) * (7.0 + fk * 4.0));
        float rays = 0.45 + 0.55 * sin(az * 70.0 + sin(az * 9.0 + t * 5.0) * 4.0 + t * 8.0 + fk * 3.0);
        float a = curtain * (0.55 + 0.45 * rays) * (1.0 - fk * 0.45);
        aurCol += mix(vec3(0.1, 1.0, 0.55), vec3(0.55, 0.25, 0.95), clamp(h * 7.0, 0.0, 1.0)) * a;
      }
      aurCol *= sector * 0.42 * uAurora;
    }
  }

  // drifting clouds: dark wisps at night, bright puffs by day
  float cover = 0.0;
  if (uDetail > 0.0 && el > -0.02 && uClouds > 0.0) {
    vec2 cp = d.xz / max(el + 0.12, 0.06) * 0.9 + vec2(uTime * 0.012, uTime * 0.005);
    float c = fbm(cp);
    cover = smoothstep(0.5 - uDay * 0.04, 0.82, c) * smoothstep(-0.02, 0.2, el) * uClouds;
    float shade = clamp(0.15 + pow(m, 6.0) + uDay * (1.25 - c * 0.9), 0.0, 1.0);
    col = mix(col, mix(uCloudDark, uCloudLit, shade), cover);
  }
  col += aurCol * (1.0 - cover * 0.8);
  float mare = 0.86 + 0.14 * vnoise(d.xz * 900.0) * (1.0 - uDay);
  col += uSunCol * (1.0 + uDay * 0.6) * disk * mare * (1.0 - cover * (0.9 - uDay * 0.4));
  gl_FragColor = vec4(col, 1.0);
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
      // no multisampling: the scene is drawn into its own buffer and smoothed with FXAA on every
      // quality level, so a multisampled screen would only cost memory and bandwidth
      const opts = { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance' };
      const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (!gl) throw new Error('nogl');
      this.gl = gl;
      this.canvas = canvas;
      this.baked = makeProgram(gl, VS_BAKED, FS_BAKED);
      this.lit = makeProgram(gl, VS_LIT, FS_LIT);
      this.pts = makeProgram(gl, VS_PTS, FS_PTS);
      this.skyP = makeProgram(gl, VS_SKY, FS_SKY);
      this.shd = makeProgram(gl, VS_SHD, FS_SHD);
      this.pp = {
        bright: makeProgram(gl, VS_FS, FS_BRIGHT), blur: makeProgram(gl, VS_FS, FS_BLUR),
        shafts: makeProgram(gl, VS_FS, FS_SHAFTS), comp: makeProgram(gl, VS_FS, FS_COMP),
      };
      this.tri = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.shadow = null; // created on first use
      this.shadowOn = false;
      this.shadowPass = false;
      this.shadowVP = M4.create();
      this.shadowDark = [0.55, 0.62, 0.8];
      this.post = null;
      this.postOn = false;
      this.grade = { bloom: 0.3, thr: 0.86, shafts: [0, 0, 0], sat: 1.1, con: 1.06, lift: [0, 0.01, 0.03], gain: [1.02, 1, 0.97], vig: 0.35 };
      this.haze = [0, 0, 0];
      this.mist = [40, 160, 0];
      this.course = null;
      this.glare = [0, 0, 0];
      this.cold = [1, 1, 1];
      this.dynBuf = gl.createBuffer();
      this.time = 0;
      this.detail = 1;
      this.rim = [0.22, 0.3, 0.5];
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

    setCamera(eye, target, fovy, roll) {
      M4.perspective(this.proj, fovy, this.w / this.h, 0.1, 2600);
      let up = [0, 1, 0];
      if (roll) {
        // tilt the up vector around the view direction (camera banking)
        let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
        const fl = Math.hypot(fx, fy, fz) || 1;
        fx /= fl; fy /= fl; fz /= fl;
        let rx = fz, ry = 0, rz = -fx;
        const rl = Math.hypot(rx, rz) || 1;
        rx /= rl; rz /= rl;
        const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
        const c = Math.cos(roll), s = Math.sin(roll);
        up = [ux * c + rx * s, uy * c + ry * s, uz * c + rz * s];
      }
      M4.lookAt(this.view, eye, target, up);
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
      gl.uniform3fv(u.uEye, this.eye);
      gl.uniform2f(u.uFog, fogNear === undefined ? this.fog[0] : fogNear, fogFar === undefined ? this.fog[1] : fogFar);
      gl.uniform3fv(u.uFogCol, this.fogCol);
      gl.uniform1f(u.uAlpha, 1);
      gl.uniform1f(u.uBright, 1);
      gl.uniform1f(u.uDetail, 0);
      gl.uniformMatrix4fv(u.uModel, false, this.ident);
      this.receivers(u);
      gl.uniform3fv(u.uShadowDark, this.shadowDark);
      gl.uniform3fv(u.uCold, this.cold);
      gl.uniform3fv(u.uSunDirF, this.light.moonDir);
      gl.uniform3fv(u.uMist, this.mist);
      const cv = this.course;
      if (cv) { gl.uniform4f(u.uCurve, cv.a1, cv.p1, cv.a2, cv.p2); gl.uniform4f(u.uCurveP, cv.ph1, cv.ph2, cv.c0, cv.half); }
      else gl.uniform4f(u.uCurve, -1, 1, 0, 1);
      gl.uniform3fv(u.uGlare, this.glare);
      this.attribs([0, 1]);
      return u;
    }

    // turn the piste grooming on or off for what's drawn next (off for far mountains etc.)
    groom(on) {
      const u = this.baked.u, gl = this.gl, cv = this.course;
      if (on && cv) gl.uniform4f(u.uCurve, cv.a1, cv.p1, cv.a2, cv.p2);
      else gl.uniform4f(u.uCurve, -1, 1, 0, 1);
    }

    // shadow map + haze uniforms shared by the world and the riders
    receivers(u) {
      const gl = this.gl;
      gl.uniform1i(u.uShadow, 1);
      gl.uniform1f(u.uShadowOn, this.shadowOn ? 1 : 0);
      gl.uniformMatrix4fv(u.uShadowVP, false, this.shadowVP);
      if (this.shadow) gl.uniform3f(u.uShadowP, 1 / this.shadow.size, this.shadow.bias, 0);
      gl.uniform3fv(u.uHaze, this.haze);
    }

    // ---- shadow map: render casters from the sun's point of view into a texture
    beginShadow(center, dir, R, size) {
      const gl = this.gl;
      if (!this.shadow || this.shadow.size !== size) {
        if (this.shadow) { gl.deleteTexture(this.shadow.tex); gl.deleteFramebuffer(this.shadow.fb); gl.deleteRenderbuffer(this.shadow.rb); }
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.activeTexture(gl.TEXTURE0);
        const fb = gl.createFramebuffer(), rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
        this.shadow = { tex, fb, rb, size, view: M4.create(), proj: M4.create(), bias: 0 };
      }
      const S = this.shadow;
      // light basis; snap the window to whole texels so shadows don't shimmer as you ride
      const f = norm(dir);
      const up0 = Math.abs(f[1]) > 0.97 ? [0, 0, 1] : [0, 1, 0];
      const r = norm([up0[1] * f[2] - up0[2] * f[1], up0[2] * f[0] - up0[0] * f[2], up0[0] * f[1] - up0[1] * f[0]]);
      const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
      const texel = (2 * R) / size;
      const cr = center[0] * r[0] + center[1] * r[1] + center[2] * r[2];
      const cu = center[0] * u[0] + center[1] * u[1] + center[2] * u[2];
      const dr = Math.round(cr / texel) * texel - cr, du = Math.round(cu / texel) * texel - cu;
      const c = [center[0] + r[0] * dr + u[0] * du, center[1] + r[1] * dr + u[1] * du, center[2] + r[2] * dr + u[2] * du];
      const D = 70;
      M4.lookAt(S.view, [c[0] + f[0] * D, c[1] + f[1] * D, c[2] + f[2] * D], c, u);
      M4.ortho(S.proj, -R, R, -R, R, 1, D * 2);
      M4.mul(this.shadowVP, S.proj, S.view);
      S.bias = 0.06 / (D * 2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.fb);
      gl.viewport(0, 0, size, size);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const su = this.use(this.shd);
      gl.uniformMatrix4fv(su.uLightVP, false, this.shadowVP);
      this.attribs([0]);
      this.shadowPass = true;
    }

    endShadow() {
      const gl = this.gl;
      this.shadowPass = false;
      this.shadowOn = true;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex);
      gl.activeTexture(gl.TEXTURE0);
    }

    // ---- post-processing targets
    makeTarget(w, h, depth) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      let rb = null;
      if (depth) {
        rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, rb, w, h, ok };
    }
    freeTarget(t) {
      if (!t) return;
      const gl = this.gl;
      gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); if (t.rb) gl.deleteRenderbuffer(t.rb);
    }
    // start a frame: into the offscreen scene when post-processing is on
    beginFrame(postOn) {
      const gl = this.gl;
      this.postOn = false;
      if (postOn) {
        const P = this.post;
        const qw = Math.max(1, this.w >> 2), qh = Math.max(1, this.h >> 2);
        if (!P || P.w !== this.w || P.h !== this.h) {
          if (P) for (const k of ['scene', 'a', 'b', 'c']) this.freeTarget(P[k]);
          this.post = { w: this.w, h: this.h, scene: this.makeTarget(this.w, this.h, true), a: this.makeTarget(qw, qh), b: this.makeTarget(qw, qh), c: this.makeTarget(qw, qh) };
          this.post.ok = this.post.scene.ok && this.post.a.ok;
        }
        if (this.post.ok) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.post.scene.fb);
          this.postOn = true;
        }
      }
      if (!this.postOn) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
    }
    pass(prog, target, tex, setup) {
      const gl = this.gl;
      const u = this.use(prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : this.w, target ? target.h : this.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uTex, 0);
      if (setup) setup(u);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
      this.attribs([0]);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // bloom, sun rays, grading and FXAA onto the screen
    endFrame(sunUV, shaftsK) {
      if (!this.postOn) return;
      const gl = this.gl, P = this.post, G = this.grade, pp = this.pp;
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);
      const qx = 1 / P.a.w, qy = 1 / P.a.h;
      // 'lite' (low graphics): no bloom or sun rays, just FXAA and the grade
      const lite = this.postLite;
      if (!lite) {
        this.pass(pp.bright, P.c, P.scene.tex, (u) => { gl.uniform2f(u.uPx, 1 / P.w, 1 / P.h); gl.uniform1f(u.uThr, G.thr); });
        this.pass(pp.blur, P.b, P.c.tex, (u) => gl.uniform2f(u.uDir, qx, 0));
        this.pass(pp.blur, P.a, P.b.tex, (u) => gl.uniform2f(u.uDir, 0, qy));
        this.pass(pp.blur, P.b, P.a.tex, (u) => gl.uniform2f(u.uDir, qx * 2.6, 0));
        this.pass(pp.blur, P.a, P.b.tex, (u) => gl.uniform2f(u.uDir, 0, qy * 2.6));
      }
      const rays = !lite && sunUV && shaftsK > 0.01;
      if (rays) this.pass(pp.shafts, P.b, P.c.tex, (u) => { gl.uniform2f(u.uSun, sunUV[0], sunUV[1]); gl.uniform1f(u.uAspect, this.w / this.h); });
      const t = this.time;
      this.pass(pp.comp, null, P.scene.tex, (u) => {
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, P.a.tex); gl.uniform1i(u.uBloom, 2);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, P.b.tex); gl.uniform1i(u.uShafts, 3);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform2f(u.uPx, 1 / P.w, 1 / P.h);
        gl.uniform1f(u.uBloomK, lite ? 0 : G.bloom);
        const sk = rays ? shaftsK : 0;
        gl.uniform3f(u.uShaftCol, G.shafts[0] * sk, G.shafts[1] * sk, G.shafts[2] * sk);
        gl.uniform1f(u.uSat, G.sat); gl.uniform1f(u.uCon, G.con);
        gl.uniform3fv(u.uLift, G.lift); gl.uniform3fv(u.uGain, G.gain);
        gl.uniform1f(u.uVig, G.vig); gl.uniform1f(u.uTime, (t * 61.7) % 97);
      });
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.activeTexture(gl.TEXTURE1);
      if (this.shadow) gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex);
      gl.activeTexture(gl.TEXTURE0);
    }

    // snow texture + glitter on/off for the next baked draws
    setDetail(on) {
      this.gl.uniform1f(this.baked.u.uDetail, on ? this.detail : 0);
    }

    // draw a dynamic array of [x,y,z, r,g,b] vertices with the baked program
    drawBakedArray(data, count, mode) {
      if (!count) return;
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 6), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(mode === undefined ? gl.TRIANGLES : mode, 0, count);
    }

    // sky colours for the current map
    setSky(k) {
      this.sky = {
        dir: k.dir, zen: k.zen, hor: k.hor, col: k.col, disk: k.disk, glow: k.glow, aurora: k.aurora,
        cloudDark: k.cloudDark, cloudLit: k.cloudLit, clouds: k.clouds, day: k.stars > 0.5 ? 0 : 1,
      };
    }

    // procedural sky on the dome mesh (positions only are used)
    drawSky(mesh) {
      const gl = this.gl;
      const u = this.use(this.skyP);
      const k = this.sky;
      gl.uniformMatrix4fv(u.uVP, false, this.vp);
      gl.uniform3fv(u.uCam, this.eye);
      gl.uniform1f(u.uTime, this.time);
      gl.uniform3fv(u.uMoon, k.dir);
      gl.uniform1f(u.uDetail, this.detail > 0 ? 1 : 0);
      gl.uniform3fv(u.uFogCol, this.fogCol);
      gl.uniform3fv(u.uZen, k.zen);
      gl.uniform3fv(u.uHor, k.hor);
      gl.uniform3fv(u.uSunCol, k.col);
      gl.uniform1f(u.uDisk, k.disk);
      gl.uniform4fv(u.uGlow, k.glow);
      gl.uniform1f(u.uAurora, k.aurora);
      gl.uniform3fv(u.uCloudDark, k.cloudDark);
      gl.uniform3fv(u.uCloudLit, k.cloudLit);
      gl.uniform1f(u.uClouds, k.clouds);
      gl.uniform1f(u.uDay, k.day);
      this.attribs([0]);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      gl.depthMask(true);
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
      gl.uniform3fv(u.uRim, this.rim);
      gl.uniform1f(u.uAlpha, 1);
      this.receivers(u);
      this.setLights(lights);
      this.cloth(0);
      this.attribs([0, 2]);
      return u;
    }

    // lights: array of {x,y,z,i,c} (up to 4); positions are sent relative to the camera
    setLights(lights) {
      if (this.shadowPass) return;
      const L = this.light, u = this.lit.u, e = this.eye;
      for (let i = 0; i < 4; i++) {
        const l = lights && lights[i];
        if (l) {
          L.lp[i * 3] = l.x - e[0]; L.lp[i * 3 + 1] = l.y - e[1]; L.lp[i * 3 + 2] = l.z - e[2];
          const c = l.c || WARM;
          L.lc[i * 3] = l.i * c[0]; L.lc[i * 3 + 1] = l.i * c[1]; L.lc[i * 3 + 2] = l.i * c[2];
        } else {
          L.lp[i * 3] = 0; L.lp[i * 3 + 1] = 1e4; L.lp[i * 3 + 2] = 0;
          L.lc[i * 3] = L.lc[i * 3 + 1] = L.lc[i * 3 + 2] = 0;
        }
      }
      this.gl.uniform3fv(u.uLP, L.lp);
      this.gl.uniform3fv(u.uLC, L.lc);
    }

    // see-through riders (ghosts)
    setLitAlpha(a) {
      if (this.shadowPass) return;
      const gl = this.gl;
      gl.uniform1f(this.lit.u.uAlpha, a);
      if (a < 1) gl.enable(gl.BLEND);
      else gl.disable(gl.BLEND);
    }

    // cloth look for the next drawLit calls: pattern (0 none, 1 plaid, 2 camo, 3 colour-block),
    // its second colour, fold strength, snow dust, and the kind of part (0 body, 1 limb, 2 knit)
    cloth(pat, col2, fold, dust, limb) {
      if (this.shadowPass) return;
      const gl = this.gl, u = this.lit.u;
      gl.uniform1f(u.uPat, pat || 0);
      if (col2) gl.uniform3fv(u.uPatCol, col2);
      gl.uniform1f(u.uFold, fold || 0);
      gl.uniform1f(u.uDust, dust || 0);
      gl.uniform1f(u.uLimb, limb || 0);
    }

    // spec: optional [strength, sharpness] for shiny parts
    drawLit(mesh, model, color, emissive, spec, mat) {
      const gl = this.gl;
      if (this.shadowPass) {
        gl.uniformMatrix4fv(this.shd.u.uModel, false, model);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        return;
      }
      const u = this.lit.u;
      gl.uniform1f(u.uMat, mat !== undefined ? mat : spec && spec[0] > 0.25 ? 1 : 0);
      gl.uniformMatrix4fv(u.uModel, false, model);
      gl.uniformMatrix3fv(u.uNM, false, normalMatrix(model));
      gl.uniform3fv(u.uColor, color);
      gl.uniform1f(u.uEmissive, emissive || 0);
      if (spec) gl.uniform2f(u.uSpec, spec[0], spec[1]);
      else gl.uniform2f(u.uSpec, 0, 1);
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

  const WARM = [1, 0.93, 0.8];
  // inverse-transpose of the model's 3x3, so stretched parts still shade correctly
  const NM = new Float32Array(9);
  function normalMatrix(m) {
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const c00 = e * i - f * h, c01 = f * g - d * i, c02 = d * h - e * g;
    const c10 = c * h - b * i, c11 = a * i - c * g, c12 = b * g - a * h;
    const c20 = b * f - c * e, c21 = c * d - a * f, c22 = a * e - b * d;
    const det = a * c00 + b * c01 + c * c02;
    const k = det ? 1 / det : 1;
    NM[0] = c00 * k; NM[1] = c10 * k; NM[2] = c20 * k;
    NM[3] = c01 * k; NM[4] = c11 * k; NM[5] = c21 * k;
    NM[6] = c02 * k; NM[7] = c12 * k; NM[8] = c22 * k;
    return NM;
  }
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  SS.Engine = Engine;
})();
