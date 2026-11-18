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
    M: { Hk: 2.1, Lu: 8, Lt: 7, Ll: 18, w: 3.2 },
    L: { Hk: 3.0, Lu: 10, Lt: 10, Ll: 24, w: 3.8 },
    XL: { Hk: 4.0, Lu: 13, Lt: 14, Ll: 32, w: 4.6 },
    // slopestyle-size jump
    XXL: { Hk: 5, Lu: 16, Lt: 18, Ll: 40, w: 5 },
    // pillow: a rounded powder mound in the backcountry
    P: { Hk: 1.5, Lu: 6, Lt: 1.5, Ll: 7, w: 2.2, pe: 2 },
    // giant big-air kicker: steep lip, long table, then a short drop onto a huge landing hill
    G: { Hk: 7, Lu: 22, Lt: 20, Ll: 10, w: 6.5, pe: 2.2 },
  };
  // where a giant's lip sits in its zone, and how its landing hill is shaped
  const GIANT = { at: 70, land: 125, landSlope: 0.6, runSlope: 0.12, inSlope: 0.25 };

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
  const Z = (name, type, len, opt) => ({ name, type, len, opt });
  // competition halfpipe: flat bottom, round transitions up to near-vertical, a short vert section, then the deck
  const PIPE = { W0: 6.2, R: 5.6, TM: 1.48, VERT: 0.75 };
  PIPE.XT = PIPE.W0 + PIPE.R * Math.sin(PIPE.TM); // where the vert starts
  PIPE.YT = PIPE.R * (1 - Math.cos(PIPE.TM));
  PIPE.LIP = PIPE.XT + PIPE.VERT * Math.cos(PIPE.TM); // the coping
  PIPE.H = PIPE.YT + PIPE.VERT * Math.sin(PIPE.TM); // wall height
  PIPE.SL = PIPE.W0 + PIPE.R * PIPE.TM + PIPE.VERT; // arc length from the middle to the lip
  // point on the wall at arc length s from the middle: lateral offset, height, wall angle
  PIPE.at = (s) => {
    const a = Math.abs(s), sg = s < 0 ? -1 : 1;
    if (a <= PIPE.W0) return { o: s, y: 0, ang: 0 };
    if (a <= PIPE.W0 + PIPE.R * PIPE.TM) {
      const th = (a - PIPE.W0) / PIPE.R;
      return { o: sg * (PIPE.W0 + PIPE.R * Math.sin(th)), y: PIPE.R * (1 - Math.cos(th)), ang: th };
    }
    const v = Math.min(PIPE.VERT, a - PIPE.W0 - PIPE.R * PIPE.TM);
    return { o: sg * (PIPE.XT + v * Math.cos(PIPE.TM)), y: PIPE.YT + v * Math.sin(PIPE.TM), ang: PIPE.TM };
  };
  // height of the pipe at lateral offset o (the same shape, as a heightfield)
  PIPE.y = (o) => {
    const a = Math.abs(o);
    if (a <= PIPE.W0) return 0;
    if (a <= PIPE.XT) { const sn = (a - PIPE.W0) / PIPE.R; return PIPE.R * (1 - Math.sqrt(Math.max(0, 1 - sn * sn))); }
    if (a <= PIPE.LIP) return PIPE.YT + ((a - PIPE.XT) / (PIPE.LIP - PIPE.XT)) * (PIPE.H - PIPE.YT);
    return PIPE.H;
  };
  // arc length for a lateral offset (inverse of PIPE.at)
  PIPE.arc = (o) => {
    const a = Math.abs(o), sg = o < 0 ? -1 : 1;
    if (a <= PIPE.W0) return o;
    if (a <= PIPE.XT) return sg * (PIPE.W0 + PIPE.R * Math.asin(Math.min(1, (a - PIPE.W0) / PIPE.R)));
    return sg * (PIPE.W0 + PIPE.R * PIPE.TM + Math.min(PIPE.VERT, (a - PIPE.XT) / Math.cos(PIPE.TM)));
  };
  SS.PIPE = PIPE;
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
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 15000, t: 'Score 15,000' }, { k: 'tokens', v: 30, t: 'Collect 30 tokens' }],
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
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 16000, t: 'Score 16,000' }, { k: 'perfects', v: 5, t: 'Land 5 perfect landings' }],
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
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 14000, t: 'Score 14,000' }, { k: 'time', v: 105, t: 'Finish under 1:45' }],
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
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 11000, t: 'Score 11,000' }, { k: 'nobail', t: 'Finish without bailing' }],
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
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 14000, t: 'Score 14,000' }, { k: 'tokens', v: 35, t: 'Collect 35 tokens' }],
      card: 'radial-gradient(ellipse at 50% 120%,#3ff0ff 0%,#5a3cff 25%,#1c1145 55%,#07051a 85%)', accent: '#7cf7ff',
    },
    bigair: {
      id: 'bigair', name: 'Big Air Valley', time: 'SUNNY DAY', diff: 'MEDIUM',
      sub: 'Three giant kickers with huge landing hills. Fly over the trees and spin all the way down.',
      half: 22, curve: [12, 320, 5, 130], slope: 0.24, alt: 3350,
      zones: [Z('WARM-UP KICKERS', 'kickers'), Z('GIANT ONE', 'giant'), Z('VALLEY ROLLERS', 'rollers'), Z('GIANT TWO', 'giant'), Z('JIB LINE', 'jib'), Z('GIANT THREE', 'giant')],
      first: 'THE IN-RUN',
      light: { sky: [0.38, 0.45, 0.6], ground: [0.27, 0.28, 0.33], sunDir: norm3([0.35, 0.5, 0.79]), sun: [0.6, 0.58, 0.52], fog: [0.76, 0.84, 0.95], rim: [0.25, 0.3, 0.38], snow: [0.9, 0.93, 0.97], powder: [0.87, 0.9, 0.96] },
      sky: { zen: [0.2, 0.42, 0.78], hor: [0.78, 0.86, 0.95], dir: norm3([0.35, 0.5, 0.79]), col: [1.0, 0.96, 0.85], disk: 0.9993, glow: [8, 0.32, 120, 0.55], aurora: 0, cloudDark: [0.74, 0.79, 0.88], cloudLit: [1.0, 1.0, 1.0], clouds: 1.0, stars: 0 },
      lamps: null, banners: true,
      trees: { near: 0.85, far: 0.9, snow: 0.7, green: [0.08, 0.2, 0.14] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.5, 0.58, 0.74], cap: [0.97, 0.98, 1.0], k: [0.62, 0.42] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 38000, t: 'Score 38,000' }, { k: 'air', v: 4.5, t: 'Stay in the air for 4.5 seconds' }],
      card: 'linear-gradient(180deg,#2f6fd6 0%,#8ec0f5 55%,#eef6ff 100%)', accent: '#4fc3ff',
    },
    railking: {
      id: 'railking', name: 'Rail Kingdom', time: 'SUNNY DAY', diff: 'MEDIUM',
      sub: 'A park made of rails: 40 m long rails, rainbow rails, rail-to-rail gaps and long boxes.',
      half: 20, curve: [8, 360, 3, 150], slope: 0.22, alt: 2760,
      zones: [Z('BOX ALLEY', 'jib'), Z('LONG RAILS', 'longrails'), Z('RAINBOW ROW', 'longrails', 380, { arch: true }), Z('RAIL GARDEN', 'rails'), Z('MEGA RAILS', 'longrails', 380, { mega: true }), Z('JIB FINALE', 'parkmix')],
      first: 'DROP-IN',
      light: { sky: [0.38, 0.45, 0.6], ground: [0.27, 0.28, 0.33], sunDir: norm3([-0.4, 0.55, 0.73]), sun: [0.6, 0.58, 0.52], fog: [0.76, 0.84, 0.95], rim: [0.25, 0.3, 0.38], snow: [0.9, 0.93, 0.97], powder: [0.87, 0.9, 0.96] },
      sky: { zen: [0.14, 0.38, 0.8], hor: [0.7, 0.82, 0.95], dir: norm3([-0.4, 0.55, 0.73]), col: [1.0, 0.95, 0.82], disk: 0.9993, glow: [8, 0.32, 120, 0.55], aurora: 0, cloudDark: [0.72, 0.78, 0.88], cloudLit: [1, 1, 1], clouds: 0.75, stars: 0 },
      lamps: null, banners: true,
      trees: { near: 0.7, far: 0.8, snow: 0.6, green: [0.09, 0.22, 0.15] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.45, 0.54, 0.72], cap: [0.97, 0.98, 1.0], k: [0.6, 0.45] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 16000, t: 'Score 16,000' }, { k: 'grind', v: 12, t: 'Grind for 12 seconds in total' }],
      card: 'linear-gradient(180deg,#1a63d8 0%,#7cb6f2 60%,#e8f3ff 100%)', accent: '#ffcc33',
    },
    triple: {
      id: 'triple', name: 'Triple Giants', time: 'GOLDEN HOUR', diff: 'HARD',
      sub: 'Three giant kickers back to back to back. No breaks, no small stuff, just send it three times.',
      half: 22, curve: [10, 340, 4, 140], slope: 0.24, alt: 3480,
      zones: [Z('GIANT ONE', 'giant', 300), Z('GIANT TWO', 'giant', 300), Z('GIANT THREE', 'giant', 300), Z('THE ROLLERS', 'rollers'), Z('KICKER LINE', 'kickers'), Z('LAST AIR', 'bigair')],
      first: 'THE IN-RUN',
      light: { sky: [0.32, 0.3, 0.44], ground: [0.16, 0.12, 0.16], sunDir: norm3([0.7, 0.3, 0.65]), sun: [1.05, 0.72, 0.45], fog: [0.82, 0.62, 0.52], rim: [0.45, 0.3, 0.3], snow: [0.95, 0.94, 0.96], powder: [0.9, 0.88, 0.94] },
      sky: { zen: [0.2, 0.25, 0.5], hor: [1.0, 0.68, 0.42], dir: norm3([0.7, 0.24, 0.65]), col: [1.0, 0.7, 0.38], disk: 0.9992, glow: [5, 0.5, 60, 0.65], aurora: 0, cloudDark: [0.45, 0.32, 0.4], cloudLit: [1.0, 0.75, 0.52], clouds: 0.7, stars: 0 },
      lamps: null, banners: true,
      trees: { near: 0.8, far: 0.85, snow: 0.7, green: [0.08, 0.17, 0.12] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.32, 0.22, 0.3], cap: [1.0, 0.8, 0.66], k: [0.42, 0.58] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'giants', v: 3, t: 'Land all three giants' }, { k: 'score', v: 38000, t: 'Score 38,000' }],
      card: 'linear-gradient(180deg,#3a3c7a 0%,#d0688a 45%,#ffa45a 75%,#ffe08a 100%)', accent: '#ff8a3d',
    },
    slopestyle: {
      id: 'slopestyle', name: 'Gold Medal Slopestyle', time: 'SUNNY DAY', diff: 'HARD',
      sub: 'A competition course like the one at the Games: three rail sections with three lines each, then three jumps.',
      half: 24, curve: [6, 360, 3, 160], slope: 0.23, alt: 2900, length: 1900,
      zones: [Z('RAIL SECTION 1', 'railStation', 170, { n: 0 }), Z('RAIL SECTION 2', 'railStation', 170, { n: 1 }), Z('RAIL SECTION 3', 'railStation', 170, { n: 2 }),
        Z('JUMP 1', 'jumpStation', 300, { n: 0 }), Z('JUMP 2', 'jumpStation', 300, { n: 1 }), Z('JUMP 3', 'jumpStation', 300, { n: 2 })],
      first: 'START GATE', stands: true,
      light: { sky: [0.38, 0.45, 0.6], ground: [0.27, 0.28, 0.33], sunDir: norm3([0.3, 0.6, 0.74]), sun: [0.6, 0.58, 0.52], fog: [0.76, 0.84, 0.95], rim: [0.25, 0.3, 0.38], snow: [0.9, 0.93, 0.97], powder: [0.87, 0.9, 0.96] },
      sky: { zen: [0.12, 0.36, 0.8], hor: [0.7, 0.82, 0.96], dir: norm3([0.3, 0.6, 0.74]), col: [1.0, 0.96, 0.85], disk: 0.9993, glow: [8, 0.32, 120, 0.55], aurora: 0, cloudDark: [0.74, 0.8, 0.9], cloudLit: [1, 1, 1], clouds: 0.6, stars: 0 },
      lamps: null, banners: true,
      trees: { near: 0.65, far: 0.85, snow: 0.6, green: [0.08, 0.2, 0.14] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.45, 0.54, 0.72], cap: [0.97, 0.98, 1.0], k: [0.6, 0.45] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 12000, t: 'Score 12,000' }, { k: 'perfects', v: 3, t: 'Land 3 perfect landings' }],
      card: 'linear-gradient(180deg,#1c55c4 0%,#6fb0f2 55%,#f5f9ff 100%)', accent: '#ffd23f',
    },
    jumpline: {
      id: 'jumpline', name: 'Jump Line', time: 'NIGHT', diff: 'MEDIUM',
      sub: 'Floodlit kickers one after another, all the way down. Find the rhythm and never stop spinning.',
      half: 18, curve: [10, 320, 4, 140], slope: 0.25, alt: 2700,
      zones: [Z('WARM-UP LINE', 'jumpline', 380, { small: true }), Z('THE RHYTHM', 'jumpline'), Z('ROLLER BREAK', 'rollers'), Z('BIG LINE', 'jumpline', 380, { big: true }), Z('FAST LINE', 'jumpline'), Z('LAST LINE', 'jumpline', 380, { big: true })],
      first: 'DROP-IN',
      light: { sky: [0.3, 0.34, 0.5], ground: [0.1, 0.11, 0.17], sunDir: norm3([0.35, 0.8, -0.45]), sun: [0.24, 0.27, 0.38], fog: [0.08, 0.11, 0.22], rim: [0.22, 0.3, 0.5], snow: [0.95, 0.97, 1.0], powder: [0.86, 0.9, 1.0] },
      sky: { zen: [0.01, 0.02, 0.06], hor: [0.09, 0.13, 0.26], dir: norm3([-0.4, 0.4, 0.8]), col: [0.75, 0.8, 0.95], disk: 0.99955, glow: [14, 0.2, 300, 0.35], aurora: 0.7, cloudDark: [0.05, 0.07, 0.14], cloudLit: [0.2, 0.24, 0.36], clouds: 0.7, stars: 1 },
      lamps: { every: 30, i: 2.0, col: [1, 0.93, 0.8] },
      trees: { near: 0.82, far: 0.75, snow: 1, green: [0.07, 0.17, 0.12] },
      snowfall: 0.8, nets: true, shadows: false,
      mtn: { dark: [0.07, 0.09, 0.16], cap: [0.32, 0.36, 0.5], k: [0.25, 0.55] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 40000, t: 'Score 40,000' }, { k: 'perfects', v: 8, t: 'Land 8 perfect landings' }],
      card: 'linear-gradient(180deg,#040a1c 0%,#123064 60%,#2a4f8a 100%)', accent: '#7dffb0',
    },
    cliffs: {
      id: 'cliffs', name: 'Cliff Drops', time: 'SNOWSTORM', diff: 'HARD',
      sub: 'Backcountry in a storm. Deep powder, pillows and rock cliffs to drop off. No groomed piste out here.',
      half: 19, curve: [24, 220, 10, 90], slope: 0.25, alt: 3010, poles: false,
      zones: [Z('TREE RUN', 'trees'), Z('FIRST DROPS', 'cliffs', 380, { min: 3, max: 5 }), Z('PILLOW FIELD', 'pillows'), Z('BIG CLIFFS', 'cliffs', 380, { min: 5, max: 8 }), Z('DEEP POWDER', 'trees'), Z('THE HUCK', 'cliffs', 380, { min: 7, max: 10 })],
      first: 'THE RIDGE',
      light: { sky: [0.5, 0.53, 0.6], ground: [0.32, 0.33, 0.37], sunDir: norm3([0.2, 0.9, 0.3]), sun: [0.22, 0.22, 0.22], fog: [0.74, 0.77, 0.82], rim: [0.2, 0.22, 0.26], snow: [0.92, 0.93, 0.96], powder: [0.92, 0.93, 0.96] },
      sky: { zen: [0.48, 0.52, 0.6], hor: [0.76, 0.79, 0.84], dir: norm3([0.2, 0.7, 0.6]), col: [0.9, 0.9, 0.88], disk: 0.9999, glow: [4, 0.15, 60, 0.1], aurora: 0, cloudDark: [0.58, 0.61, 0.68], cloudLit: [0.86, 0.88, 0.92], clouds: 1.0, stars: 0 },
      lamps: null, fogNear: 30, fogFar: 260,
      trees: { near: 1.0, far: 0.95, snow: 1.3, green: [0.06, 0.15, 0.11], dense: true },
      snowfall: 1.5, nets: false, shadows: false,
      mtn: { dark: [0.52, 0.56, 0.64], cap: [0.9, 0.92, 0.95], k: [0.7, 0.3] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 11000, t: 'Score 11,000' }, { k: 'nobail', t: 'Finish without bailing' }],
      card: 'linear-gradient(180deg,#8d97a8 0%,#c4cad4 60%,#eef1f5 100%)', accent: '#c9d6ea',
    },
    neon: {
      id: 'neon', name: 'Neon Park', time: 'NIGHT', diff: 'MEDIUM',
      sub: 'A night park lit in pink, cyan and purple. Glowing boxes and rails, kickers and a jump line.',
      half: 19, curve: [16, 260, 6, 110], slope: 0.23, alt: 2580, neon: true,
      zones: [Z('NEON BOXES', 'jib'), Z('LIGHT RAILS', 'longrails'), Z('KICKER LINE', 'kickers'), Z('NEON GARDEN', 'parkmix'), Z('JUMP LINE', 'jumpline'), Z('GLOW FINALE', 'parkmix')],
      first: 'DROP-IN',
      light: { sky: [0.22, 0.18, 0.36], ground: [0.08, 0.06, 0.14], sunDir: norm3([0.35, 0.8, -0.45]), sun: [0.18, 0.16, 0.3], fog: [0.07, 0.03, 0.14], rim: [0.5, 0.25, 0.6], snow: [0.95, 0.95, 1.0], powder: [0.88, 0.88, 1.0] },
      sky: { zen: [0.02, 0.005, 0.06], hor: [0.18, 0.05, 0.26], dir: norm3([-0.4, 0.4, 0.8]), col: [0.85, 0.75, 1.0], disk: 0.9995, glow: [12, 0.25, 260, 0.3], aurora: 0.5, cloudDark: [0.06, 0.03, 0.12], cloudLit: [0.3, 0.16, 0.4], clouds: 0.6, stars: 1 },
      lamps: { every: 34, i: 2.1, col: [1, 0.3, 0.8], cols: [[1, 0.25, 0.75], [0.2, 0.9, 1], [0.65, 0.35, 1], [0.35, 1, 0.55]] },
      trees: { near: 0.75, far: 0.7, snow: 0.9, green: [0.05, 0.1, 0.12] },
      snowfall: 0.6, nets: false, shadows: false,
      mtn: { dark: [0.06, 0.04, 0.12], cap: [0.3, 0.24, 0.45], k: [0.25, 0.55] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 18000, t: 'Score 18,000' }, { k: 'grind', v: 8, t: 'Grind for 8 seconds in total' }],
      card: 'linear-gradient(180deg,#0a0420 0%,#3b0f5c 55%,#ff4fd8 100%)', accent: '#ff4fd8',
    },
    slopequal: {
      id: 'slopequal', name: 'Slopestyle Qualifier', time: 'GOLDEN HOUR', diff: 'HARD',
      sub: 'The other competition course: a kinked rail, a long box and a down-rail, then three jump lines with the biggest kicker in the middle.',
      half: 24, curve: [8, 300, 4, 140], slope: 0.23, alt: 2860, length: 1900,
      zones: [Z('RAIL SECTION 1', 'railStation', 170, { n: 3 }), Z('RAIL SECTION 2', 'railStation', 170, { n: 4 }), Z('RAIL SECTION 3', 'railStation', 170, { n: 5 }),
        Z('JUMP 1', 'jumpStation', 300, { n: 3 }), Z('JUMP 2', 'jumpStation', 300, { n: 4 }), Z('JUMP 3', 'jumpStation', 300, { n: 5 })],
      first: 'START GATE', stands: true, comp: true,
      light: { sky: [0.3, 0.27, 0.42], ground: [0.14, 0.1, 0.14], sunDir: norm3([0.75, 0.22, 0.62]), sun: [1.15, 0.68, 0.4], fog: [0.75, 0.48, 0.45], rim: [0.45, 0.28, 0.3], snow: [0.95, 0.94, 0.97], powder: [0.9, 0.88, 0.95] },
      sky: { zen: [0.16, 0.16, 0.38], hor: [1.0, 0.56, 0.36], dir: norm3([0.75, 0.16, 0.62]), col: [1.0, 0.6, 0.3], disk: 0.9992, glow: [5, 0.55, 60, 0.7], aurora: 0, cloudDark: [0.35, 0.22, 0.35], cloudLit: [1.0, 0.62, 0.45], clouds: 0.75, stars: 0.25 },
      lamps: null, banners: true,
      trees: { near: 0.6, far: 0.75, snow: 0.8, green: [0.08, 0.16, 0.11] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.25, 0.16, 0.26], cap: [1.0, 0.72, 0.6], k: [0.4, 0.6] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 12000, t: 'Score 12,000' }, { k: 'grind', v: 4, t: 'Grind for 4 seconds in total' }],
      card: 'linear-gradient(180deg,#2a2a66 0%,#c8577a 45%,#ff9a52 75%,#ffd27a 100%)', accent: '#ffd23f',
    },
    bigairfinal: {
      id: 'bigairfinal', name: 'Big Air Final', time: 'NIGHT', diff: 'HARD',
      sub: 'The city big air: drop in from a scaffold tower 40 metres up, one giant jump, and land in a stadium full of fans.',
      half: 14, curve: [0, 300, 0, 140], slope: 0.25, alt: 120, length: 520,
      firstType: 'tower', firstLen: 110, towerHalf: 7.5, open: true,
      zones: [Z('THE BIG AIR', 'giant', 300)],
      first: 'START TOWER', stands: [[290, 560]], comp: true, city: true,
      light: { sky: [0.3, 0.32, 0.46], ground: [0.12, 0.12, 0.17], sunDir: norm3([0.35, 0.8, -0.45]), sun: [0.24, 0.27, 0.38], fog: [0.06, 0.07, 0.13], rim: [0.3, 0.32, 0.5], snow: [0.95, 0.97, 1.0], powder: [0.88, 0.9, 1.0] },
      sky: { zen: [0.01, 0.015, 0.05], hor: [0.12, 0.1, 0.2], dir: norm3([-0.4, 0.4, 0.8]), col: [0.85, 0.85, 0.95], disk: 0.9996, glow: [14, 0.2, 300, 0.3], aurora: 0, cloudDark: [0.05, 0.05, 0.1], cloudLit: [0.25, 0.22, 0.32], clouds: 0.5, stars: 0.6 },
      lamps: { every: 24, i: 2.4, col: [1, 0.96, 0.88] },
      trees: { near: 0, far: 0, snow: 1, green: [0.07, 0.17, 0.12] },
      snowfall: 0.35, nets: true, shadows: false,
      mtn: { dark: [0.05, 0.06, 0.1], cap: [0.18, 0.2, 0.28], k: [0.3, 0.4] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'air', v: 4.5, t: 'Stay in the air for 4.5 seconds' }, { k: 'score', v: 9000, t: 'Score 9,000' }],
      card: 'linear-gradient(180deg,#05070f 0%,#1a1838 55%,#46305a 100%)', accent: '#ffd23f',
    },
    superpipe: {
      id: 'superpipe', name: 'Superpipe Final', time: 'NIGHT', diff: 'HARD',
      sub: 'A floodlit competition halfpipe. Ride wall to wall, boost out of the lip and spin. Steer into the wall you are heading for to pump higher.',
      half: 16, curve: [0, 300, 0, 140], slope: 0.3, alt: 2400, length: 760, fine: true,
      zones: [Z('THE SUPERPIPE', 'pipe', 470)],
      first: 'DROP-IN DECK', stands: [[640, 900]], comp: true,
      light: { sky: [0.3, 0.34, 0.5], ground: [0.1, 0.11, 0.17], sunDir: norm3([0.35, 0.8, -0.45]), sun: [0.24, 0.27, 0.38], fog: [0.08, 0.11, 0.22], rim: [0.22, 0.3, 0.5], snow: [0.95, 0.97, 1.0], powder: [0.86, 0.9, 1.0] },
      sky: { zen: [0.01, 0.02, 0.06], hor: [0.09, 0.13, 0.26], dir: norm3([-0.4, 0.4, 0.8]), col: [0.75, 0.8, 0.95], disk: 0.99955, glow: [14, 0.2, 300, 0.35], aurora: 0.35, cloudDark: [0.05, 0.07, 0.14], cloudLit: [0.2, 0.24, 0.36], clouds: 0.6, stars: 1 },
      lamps: { every: 26, i: 2.3, col: [1, 0.95, 0.85] },
      trees: { near: 0.7, far: 0.8, snow: 1, green: [0.07, 0.17, 0.12] },
      snowfall: 0.4, nets: false, shadows: false,
      mtn: { dark: [0.07, 0.09, 0.16], cap: [0.32, 0.36, 0.5], k: [0.25, 0.55] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 25000, t: 'Score 25,000' }, { k: 'perfects', v: 10, t: 'Land 10 perfect landings' }],
      card: 'linear-gradient(180deg,#040a1c 0%,#123064 60%,#2a4f8a 100%)', accent: '#4fa8ff',
    },
    sbx: {
      id: 'sbx', name: 'Snowboard Cross', time: 'SUNNY DAY', diff: 'MEDIUM',
      sub: 'Race three rivals down a cross course: start gate, rollers, banked turns, step-ups and a big final jump. First to the line wins.',
      half: 9, curve: [20, 64, 6, 30], slope: 0.2, alt: 2650, length: 1500, berms: true, racers: true, vmax: 23.5,
      zones: [Z('START RAMP', 'sbxStart', 110), Z('ROLLERS', 'rollers', 200), Z('BANKED TURNS', 'berms', 230), Z('STEP-UPS', 'sbxJumps', 240), Z('WHOOPS', 'whoops', 180), Z('THE BERMS', 'berms', 220), Z('FINAL JUMP', 'sbxFinal', 200)],
      first: 'START GATE', stands: [[1380, 1560]], comp: true,
      light: { sky: [0.38, 0.45, 0.6], ground: [0.27, 0.28, 0.33], sunDir: norm3([0.3, 0.6, 0.74]), sun: [0.6, 0.58, 0.52], fog: [0.76, 0.84, 0.95], rim: [0.25, 0.3, 0.38], snow: [0.9, 0.93, 0.97], powder: [0.87, 0.9, 0.96] },
      sky: { zen: [0.12, 0.36, 0.8], hor: [0.7, 0.82, 0.96], dir: norm3([0.3, 0.6, 0.74]), col: [1.0, 0.96, 0.85], disk: 0.9993, glow: [8, 0.32, 120, 0.55], aurora: 0, cloudDark: [0.74, 0.8, 0.9], cloudLit: [1, 1, 1], clouds: 0.6, stars: 0 },
      lamps: null, banners: true,
      trees: { near: 0.7, far: 0.85, snow: 0.6, green: [0.08, 0.2, 0.14] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.45, 0.54, 0.72], cap: [0.97, 0.98, 1.0], k: [0.6, 0.45] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'win', t: 'Win the race' }, { k: 'time', v: 70, t: 'Finish under 1:10' }],
      card: 'linear-gradient(180deg,#1c55c4 0%,#6fb0f2 55%,#f5f9ff 100%)', accent: '#ff4060',
    },
  };
  SS.MAPS = MAPS;
  SS.MAP_IDS = ['night', 'bluebird', 'sunset', 'woods', 'cave', 'bigair', 'railking', 'triple', 'slopestyle', 'jumpline', 'cliffs', 'neon', 'bigairfinal', 'superpipe', 'sbx', 'slopequal'];
  SS.GIANT = GIANT;

  const CRYSTAL_COLS = [[0.35, 0.95, 1.0], [0.65, 0.45, 1.0], [0.3, 1.0, 0.75], [1.0, 0.45, 0.85]];

  class World {
    constructor(seed, mapId) {
      this.map = MAPS[mapId] || MAPS.night;
      this.mapId = this.map.id;
      this.seed = seed >>> 0;
      C.HALF = this.map.half;
      C.LENGTH = this.map.length || 2600;
      C.FINE = !!this.map.fine;
      C.ZMAX = C.LENGTH + C.RUNOUT + 90;
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
      const fl = this.map.firstLen || 220;
      this.zones = [{ name: this.map.first, type: this.map.firstType || 'summit', z0: C.Z0, z1: fl }];
      let z = fl;
      for (const m of mids) {
        const len = m.len || 380;
        this.zones.push({ name: m.name, type: m.type, z0: z, z1: z + len, opt: m.opt || {} });
        z += len;
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
        else if (t === 'giant') {
          const zn = this.zoneAt(z), k = z - zn.z0, lip = GIANT.at + KICK.G.Lu, knuckle = lip + KICK.G.Lt + 4;
          s = k < knuckle ? GIANT.inSlope : k < knuckle + GIANT.land ? GIANT.landSlope : GIANT.runSlope;
        }
        else if (t === 'rails') s -= 0.03;
        else if (t === 'tower') s = z < 14 ? 0.04 : 0.55;
        else if (t === 'sbxStart') s = z < 12 ? 0.05 : 0.36;
        else if (t === 'pipe') s = this.map.slope;
        else if (t === 'sbxFinal') s += 0.04;
        else if (t === 'slalom') s -= 0.04;
        if (z < 30) s = lerp(0.1, s, clamp((z + 30) / 60, 0, 1));
        if (z > C.LENGTH + 10) s = lerp(s, 0.025, clamp((z - C.LENGTH - 10) / 70, 0, 1));
        slope[i] = s;
        amp[i] = t === 'rollers' ? 1.7 : t === 'whoops' ? 0.85 : t === 'summit' ? 0.35 : t === 'finish' ? 0.1 : t === 'giant' || t === 'tower' || t === 'pipe' ? 0.02 : 0.18;
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
      // cliff bands: a sharp drop across the whole slope, then a steeper landing
      this.cliffs = [];
      for (const zn of this.zones) {
        if (zn.type !== 'cliffs') continue;
        const o = zn.opt || {};
        for (const at of [70, 190, 310]) {
          const D = o.min + this.rnd() * (o.max - o.min);
          this.cliffs.push({ z: zn.z0 + at, D, e: 0.15 + D * 0.04 });
        }
      }
      for (const c of this.cliffs) {
        for (let i = 0; i < n; i++) {
          const z = C.Z0 + i;
          if (z < c.z) continue;
          this.bArr[i] -= c.D * smooth(Math.min(1, (z - c.z) / 2.2)) + c.e * Math.min(28, Math.max(0, z - c.z - 2.2));
        }
      }
      // the big air tower: the deck stands on scaffolding above the arena floor
      this.towerArr = null;
      const tw = this.zones.find((zn) => zn.type === 'tower');
      if (tw) {
        this.towerArr = new Float32Array(n);
        const zEnd = tw.z1;
        for (let i = 0; i < n; i++) {
          const z = C.Z0 + i;
          this.towerArr[i] = z >= zEnd ? 0 : (this.base(z) - this.base(zEnd)) - 0.12 * (zEnd - z) + 2;
        }
        this.towerArr = blur(this.towerArr, 4);
        for (let i = 0; i < n; i++) this.towerArr[i] = Math.max(0, this.towerArr[i]);
      }
      // halfpipe: how much of the pipe there is at each metre (it grows in and fades out)
      this.pipeArr = null;
      const pz = this.zones.find((zn) => zn.type === 'pipe');
      if (pz) {
        this.pipeZone = pz;
        this.pipeArr = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const z = C.Z0 + i;
          this.pipeArr[i] = smooth(clamp((z - pz.z0) / 26, 0, 1)) * smooth(clamp((pz.z1 - z) / 26, 0, 1));
        }
      }
      // banked turns: the outside of every bend is built up (cross courses)
      this.bermArr = null;
      if (this.map.berms) {
        this.bermArr = new Float32Array(n);
        for (let i = 1; i < n - 1; i++) {
          const zn = this.zoneAt(C.Z0 + i);
          const k = zn.type === 'berms' ? 1 : zn.type === 'summit' || zn.type === 'finish' || zn.type === 'sbxStart' ? 0.2 : 0.55;
          const curv = this.cArr[i + 1] - 2 * this.cArr[i] + this.cArr[i - 1];
          this.bermArr[i] = clamp(curv * 38, -0.8, 0.8) * k;
        }
        this.bermArr = blur(this.bermArr, 6);
      }
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
      const pk = this.pipeArr ? this.sample(this.pipeArr, z) : 0;
      // the halfpipe: round walls across the piste, deck beyond the coping (the banks start from the deck)
      if (pk > 0.001) y += pk * PIPE.y(off);
      if (!this.towerArr) y += (1 - pk) * (0.3 * Math.sin(z * 0.045 + off * 0.11 + this.pr) + 0.2 * Math.sin(z * 0.11 - off * 0.07));
      if (this.bermArr) {
        const bk = this.sample(this.bermArr, z);
        const a = Math.abs(off);
        y -= bk * off * (a < C.HALF + 3 ? 1 : Math.max(0, 1 - (a - C.HALF - 3) / 6));
      }
      if (this.towerArr) {
        const td = this.sample(this.towerArr, z);
        const et = Math.abs(off) - this.map.towerHalf;
        if (td > 0.01 && et > 0) y -= td * smooth(Math.min(1, et / 0.9));
      }
      const ra = this.sample(this.ampArr, z);
      if (ra > 0.01) {
        const fade = e < 0 ? 1 : Math.max(0, 1 - e / 6);
        y += ra * Math.sin((z * TAU) / 26 + this.pr) * fade;
      }
      if (e > 0 && this.map.open) {
        // a stadium: low banks, then a flat arena around the course
        const eb = Math.min(e, 30);
        y += 0.012 * eb * eb + 0.6 * Math.sin(x * 0.05 + z * 0.03);
      } else if (e > 0) {
        const ck = this.cave ? this.sample(this.kArr, z) : 0;
        // the bank doesn't start in a straight line: the piste edge wanders out and back
        const sd = off > 0 ? 1.7 : -0.9;
        const wob = (1 - ck) * Math.max(0, 2 + 2.4 * Math.sin(z * 0.021 + sd + this.pr) + 1.3 * Math.sin(z * 0.067 - sd));
        const eb = Math.max(0, e - wob);
        const ee = eb < 38 ? eb : 38;
        const wall = 0.9 + 0.4 * Math.sin(z * 0.0115 + sd * 2.3 + this.pr) * (1 - ck);
        // how steep the bank climbs changes along the run and differs left and right: narrow gullies, open bowls
        const steep = 0.05 * (0.62 + 0.4 * Math.sin(z * 0.0083 + sd * 2.9 + this.pr) + 0.12 * Math.sin(z * 0.029 - sd));
        y += lerp(steep, 0.13, ck) * ee * ee + (eb > 38 ? (eb - 38) * wall * lerp(steep / 0.05, 1, ck) : 0);
        const k1 = Math.min(1, eb / 15) * (1 - ck * 0.7);
        y += k1 * (4 * Math.sin(x * 0.045 + z * 0.02) + 2.5 * Math.sin(z * 0.07 + x * 0.03));
        // ridges and gullies running down the banks, and big shoulders further out
        y += Math.min(1, eb / 22) * (1 - ck) * 2.6 * Math.sin(x * 0.12 + z * 0.045) * Math.sin(z * 0.031 - x * 0.017 + sd);
        if (eb > 24) y += Math.min(1, (eb - 24) / 30) * (1 - ck) * (9 * Math.sin(z * 0.0135 + x * 0.019 + sd) + 4 * Math.sin(z * 0.041 - x * 0.011));
        // the rim of the valley rises into peaks and drops into saddles, so it never runs dead straight
        if (eb > 50) {
          const rimK = Math.min(1, (eb - 50) / 45) * (1 - ck);
          y += rimK * (34 * Math.sin(z * 0.0071 + sd * 1.9 + this.pr) + 20 * Math.sin(z * 0.0187 - sd) + 9 * Math.sin(z * 0.052 + x * 0.013) - 22);
        }
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
      if (u < f.Lu) p = f.Hk * Math.pow(u / f.Lu, f.pe || 1.7);
      else if (u < f.Lu + f.Lt) p = f.Hk;
      else p = f.Hk * 0.5 * (1 + Math.cos(Math.PI * ((u - f.Lu - f.Lt) / f.Ll)));
      return p * lat;
    }

    // height of the drawn snow mesh (2 m rows, flat triangles), so decals like board dents sit exactly on it
    meshY(x, z) {
      const offs = Builder.offs();
      const fi = (z - C.Z0) / 2;
      const i = Math.floor(fi);
      const z0 = C.Z0 + i * 2, z1 = z0 + 2;
      const t = fi - i;
      const c0 = this.center(z0), c1 = this.center(z1);
      const off = x - (c0 + (c1 - c0) * t);
      let j = 0;
      if (off <= offs[0]) return this.ground(x, z);
      while (j < offs.length - 2 && off > offs[j + 1]) j++;
      if (off > offs[offs.length - 1]) return this.ground(x, z);
      const s = (off - offs[j]) / (offs[j + 1] - offs[j]);
      const ya = this.ground(c0 + offs[j], z0), yb = this.ground(c0 + offs[j + 1], z0);
      const yc = this.ground(c1 + offs[j], z1), yd = this.ground(c1 + offs[j + 1], z1);
      return s >= t ? ya + s * (yb - ya) + t * (yd - yb) : ya + t * (yc - ya) + s * (yd - yc);
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
          if (t >= 0) top = Math.max(lerp(f.g0, f.g1, t / f.len) + f.h + (f.arch ? f.arch * Math.sin((Math.PI * t) / f.len) : 0), g + 0.25);
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
        if (size !== 'P') for (const s of [-1, 1]) this.flags.push({ x: this.center(lipZ) + off + s * (k.w + 1.4), z: lipZ });
        return f;
      };
      const rail = (zStart, off, type, len, arch) => {
        const isBox = type === 'box';
        const zMid = zStart + len / 2;
        const ang = Math.atan((this.center(zMid + 1) - this.center(zMid - 1)) / 2);
        const dx = Math.sin(ang), dz = Math.cos(ang);
        const ax = this.center(zStart) + off, az = zStart;
        const f = {
          kind: 'rail', type, ax, az, dx, dz, len, ang,
          w: isBox ? 0.42 : 0.34, h: isBox ? 0.55 : 0.8, ramp: isBox ? 2.6 : 0,
          z0: az - (isBox ? 2.6 : 0), z1: az + dz * len, arch: arch || 0,
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
          case 'giant':
            kicker(z0 + GIANT.at, 0, 'G');
            break;
          case 'longrails': {
            // long rails, rainbow rails, rail-to-rail gaps and long boxes
            const o = zn.opt || {};
            [30, 150, 270].forEach((at, i) => {
              const side = r() < 0.5 ? -1 : 1, lane = Math.min(7, HALF - 6);
              const kind = o.arch ? 'arch' : o.mega ? 'mega' : ['long', 'gap', 'arch'][(i + ((r() * 3) | 0)) % 3];
              if (kind === 'long') {
                rail(z0 + at, side * R(3, lane), 'rail', R(28, 40));
                rail(z0 + at + R(0, 6), -side * R(3, lane), 'box', R(24, 32));
              } else if (kind === 'mega') {
                rail(z0 + at, side * R(2, 5), 'rail', R(42, 52));
                rail(z0 + at + 4, -side * R(4, lane), 'box', R(34, 44));
              } else if (kind === 'gap') {
                const off = side * R(3, lane);
                rail(z0 + at, off, 'rail', 14);
                rail(z0 + at + 18, off, 'rail', 14);
                rail(z0 + at + 6, -side * R(3, lane), 'box', 22, 0.5);
              } else {
                rail(z0 + at, side * R(3, lane), 'rail', R(14, 18), R(0.9, 1.4));
                rail(z0 + at + R(0, 8), -side * R(3, lane), 'box', R(16, 20), R(0.6, 1.0));
              }
            });
            break;
          }
          case 'railStation': {
            // three lines side by side: pick the rail, the box or the rainbow
            const n = (zn.opt && zn.opt.n) || 0;
            const L3 = [
              [['rail', 16, 0], ['box', 18, 0], ['rail', 15, 1.1]],
              [['box', 26, 0.7], ['rail', 22, 0], ['box', 16, 0]],
              [['rail', 30, 0], ['box', 20, 1.0], ['rail', 18, 1.3]],
              [['box', 22, 0], ['rail', 26, -0.55], ['box', 14, 1.2]],
              [['rail', 20, 1.5], ['box', 32, 0], ['rail', 24, -0.45]],
              [['box', 18, 0.9], ['rail', 40, 0], ['box', 24, -0.4]],
            ][n % 6];
            [-10, 0, 10].forEach((off, i) => rail(z0 + 40 + (i === 1 ? 0 : 4), off, L3[i][0], L3[i][1], L3[i][2]));
            break;
          }
          case 'jumpStation': {
            // three kickers side by side: smaller on the outside, the biggest in the middle
            const n = (zn.opt && zn.opt.n) || 0;
            const sizes = [['M', 'L', 'M'], ['L', 'XL', 'L'], ['L', 'XXL', 'XL'], ['L', 'L', 'XL'], ['M', 'XXL', 'L'], ['XL', 'XXL', 'XL']][n % 6];
            [-15, 0, 15].forEach((off, i) => kicker(z0 + 50, off, sizes[i]));
            break;
          }
          case 'jumpline': {
            const o = zn.opt || {};
            const seq = o.small ? ['M', 'L', 'M', 'L', 'M'] : o.big ? ['XL', 'XXL', 'XL', 'XXL'] : ['L', 'XL', 'L', 'XL', 'L'];
            const step = o.big ? 100 : o.small ? 72 : 82;
            seq.forEach((sz, i) => { if (i * step + 20 + KICK[sz].Lu + KICK[sz].Lt + KICK[sz].Ll < zn.z1 - zn.z0) kicker(z0 + 20 + i * step, 0, sz); });
            break;
          }
          case 'pillows':
            scatter(z0, L, 14, 16, (x, z) => kicker(z - 6, x - this.center(z), 'P'));
            break;
          case 'parkmix': {
            let lane = r() < 0.5 ? -1 : 1;
            for (let at = 25; at < L - 40; at += 52) {
              const pick = r(), off = lane * R(2, Math.min(7, HALF - 6));
              if (pick < 0.3) kicker(z0 + at, off, r() < 0.5 ? 'S' : 'M');
              else if (pick < 0.55) rail(z0 + at, off, 'box', R(12, 18), r() < 0.4 ? R(0.5, 0.9) : 0);
              else if (pick < 0.8) rail(z0 + at, off, 'rail', R(12, 20), r() < 0.4 ? R(0.8, 1.2) : 0);
              else { rail(z0 + at, off, 'box', 14); rail(z0 + at + 3, -off, 'rail', 16); }
              lane = -lane;
            }
            break;
          }
          case 'sbxJumps':
            // step-ups and table-tops right in the racing line
            [[24, 'M'], [80, 'L'], [140, 'M'], [196, 'L']].forEach(([at, sz]) => { if (at + 40 < L) kicker(z0 + at, 0, sz); });
            break;
          case 'sbxFinal':
            kicker(z0 + 70, 0, 'XL');
            break;
          case 'cliffs':
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

      // forest on both banks (none inside the cave): trees grow in groves, big ones in the middle,
      // saplings around the edge, with open glades between; a few lone trees and dead snags
      const T = M.trees;
      const dens = T.dense ? 1.4 : 1;
      const inCave = (z) => this.cave && z > this.cave[0] - 15 && z < this.cave[1] + 15;
      const plant = (side, e, z, s) => {
        if (e < 2.4 || z < C.Z0 || z > C.ZMAX || inCave(z)) return;
        const h = r();
        const kind = h < 0.05 ? 'snag' : h < 0.3 ? 'spruce' : h < 0.42 ? 'pine' : 'fir';
        this.trees.push({ x: this.center(z) + side * (HALF + e), z, s, near: e < 36, solid: e < 26, kind });
      };
      for (const side of [-1, 1]) {
        for (const [e0, e1, gap, amt] of [[2.5, 32, [9, 24], T.near], [26, 95, [12, 30], T.far]]) {
          let z = C.Z0 + R(0, 12);
          while (z < C.ZMAX) {
            const ge = lerp(e0, e1, Math.pow(r(), 1.15)), rad = R(5, 14);
            const n = Math.round(R(5, 13) * amt * dens);
            for (let i = 0; i < n; i++) {
              const a = R(0, TAU), d = Math.sqrt(r()) * rad;
              const mid = 1 - d / rad;
              plant(side, ge + Math.cos(a) * d * 0.85, z + Math.sin(a) * d, R(0.65, 0.95) + mid * R(0.25, 0.75));
            }
            // a lone tree or two out in the open
            if (r() < 0.6 * amt) plant(side, R(e0, e1), z + R(4, 10), R(0.8, 1.4));
            z += R(gap[0], gap[1]) / dens;
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
        let side = 1, li = 0;
        for (let z = 8; z < C.LENGTH + 120; z += M.lamps.every) {
          if (this.cave && z > this.cave[0] - 8 && z < this.cave[1] + 8) continue;
          const c = this.center(z);
          const x = c + side * (HALF + 3.2);
          const gy = this.ground(x, z);
          const hx = x - side * 1.9;
          const lc = M.lamps.cols ? M.lamps.cols[li++ % M.lamps.cols.length] : M.lamps.col;
          this.lamps.push({ kind: 'lamp', x, z, gy, side, hx, hy: gy + 10.2, lx: hx, ly: gy + 9.8, lz: z, i: M.lamps.i, c: lc, neon: !!M.lamps.cols });
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
      for (let z = 4; z < C.LENGTH + 100 && M.poles !== false; z += M.banners ? 32 : 26) {
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
          if (!['kickers', 'bigair', 'mega', 'rollers', 'finish', 'giant', 'jumpline', 'jumpStation'].includes(zn.type)) continue;
          for (let z = Math.max(zn.z0, 10); z < Math.min(zn.z1, C.LENGTH + 40); z += 6) {
            for (const sd of [-1, 1]) if (r() < 0.92) this.nets.push({ z0: z, z1: z + 6, side: sd });
          }
        }
      }
      // grandstands full of fans along the finish
      this.stands = [];
      const standRanges = Array.isArray(M.stands) ? M.stands : M.stands ? [[C.LENGTH - 150, C.LENGTH + 30]] : [];
      for (const [za, zb] of standRanges) {
        for (let z = za; z < zb; z += 30) {
          for (const sd of [-1, 1]) {
            const x = this.center(z) + sd * (HALF + 7);
            this.stands.push({ x, z, side: sd, gy: this.ground(x, z) });
            for (let k = -12; k <= 12; k += 6) this.colliders.push({ x, z: z + k, r: 3.5, top: 1e4 });
          }
        }
      }
      // cliff bands: bare rock pokes out where the band runs into the banks
      this.rocks = [];
      for (const c of this.cliffs || []) {
        for (const sd of [-1, 1]) {
          for (let e = -2; e < 24; e += R(1.5, 2.4)) {
            const z = c.z + R(-0.6, 0.4), x = this.center(z) + sd * (HALF + e);
            const sz = clamp(0.5 + (e + 2) * 0.1, 0.45, 2.4) * R(0.8, 1.25);
            const gy = this.ground(x, z - 0.8);
            this.rocks.push({ x, z, s: sz, yaw: R(0, TAU), gy });
            if (e > 0.5) this.colliders.push({ x, z, r: sz * 0.8, top: gy + sz * 1.1 });
          }
        }
      }
      // competition dressing: a start house with gates, and scaffolding under the big air tower
      this.startGate = M.comp ? { z: M.firstType === 'tower' ? 4 : M.id === 'sbx' ? 8 : 2, gates: M.racers ? 4 : 1, half: M.towerHalf || Math.min(HALF, 9) } : null;
      this.scaffold = [];
      if (this.towerArr) {
        for (let z = C.Z0 + 4; z < this.zones[0].z1 + 4; z += 6) {
          const td = this.sample(this.towerArr, z);
          if (td > 1.2) for (const sd of [-1, 1]) this.scaffold.push({ z, side: sd, h: td });
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
        if (f.kind === 'kicker' && f.size === 'G') {
          // along the flight of a popped launch at the in-run speed
          const zl = f.z0 + f.Lu, xl = this.center(zl);
          const yl = this.Hk(xl, zl);
          const s = (this.Hk(xl, zl - 0.25) - this.Hk(xl, zl - 0.75)) / 0.5;
          const sp = SS.GIANT_SPEED || 27, a = Math.atan(s);
          const vz = sp * Math.cos(a), vy = sp * Math.sin(a) + 5;
          for (const t of [0.6, 1.3, 2.0, 2.7, 3.4, 4.1]) {
            const z = zl + vz * t;
            const y = yl + vy * t - 0.5 * (SS.GIANT_G || 10) * t * t + 0.9;
            if (y < this.Hk(xl, z) + 2) break;
            add(xl, y, z);
          }
        } else if (f.kind === 'kicker') {
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
      for (const c of this.cliffs || []) {
        const x = this.center(c.z) + R(-4, 4), y0 = this.ground(x, c.z - 1);
        for (const [dz, dy] of [[5, 0.4], [10, -0.6], [15, -2.4]]) add(x, y0 + dy, c.z + dz);
      }
      // pipe: tokens above the coping, alternating walls
      if (this.pipeZone) {
        let sd = 1;
        for (let z = this.pipeZone.z0 + 40; z < this.pipeZone.z1 - 30; z += 22) {
          const x = this.center(z) + sd * (SS.PIPE.LIP - 0.6);
          for (const dy of [1.6, 3.0]) add(x, this.ground(x, z) + dy, z);
          sd = -sd;
        }
      }
      for (const zn of this.zones) {
        if (!['summit', 'rollers', 'trees', 'finish', 'pillars', 'pillows', 'cliffs'].includes(zn.type)) continue;
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

    // soft shadow the mountain (and the kickers on it) throws on itself: march toward the sun
    terrainShadow(x, y, z) {
      const sd = this.L.sunDir;
      const hl = Math.hypot(sd[0], sd[2]);
      if (hl < 0.05) return 1;
      const ux = sd[0] / hl, uz = sd[2] / hl, tanE = sd[1] / hl;
      let t = 1.0, s = 1;
      for (let i = 0; i < 19; i++) {
        const px = x + ux * t, pz = z + uz * t;
        const gh = i < 9 ? this.Hk(px, pz) : this.ground(px, pz);
        const d = y + 0.12 + t * tanE - gh;
        if (d < 0) return 0;
        s = Math.min(s, d / (t * 0.07));
        t *= 1.24;
      }
      return clamp(s, 0, 1);
    }

    // how enclosed a spot is compared to the slope it sits on: hollows and the foot of banks go darker
    groundAO(x, y, z, gx, gz) {
      let occ = 0;
      for (const [r, a0] of [[2.5, 0.4], [7, 1.2]]) {
        for (let i = 0; i < 4; i++) {
          const a = a0 + i * Math.PI * 0.5, dx = Math.cos(a) * r, dz = Math.sin(a) * r;
          occ += Math.max(0, (this.ground(x + dx, z + dz) - (y + gx * dx + gz * dz)) / r);
        }
      }
      return 1 - Math.min(0.42, occ * 0.16);
    }

    light(nx, ny, nz, x, y, z, out, shadow, ao) {
      const L = this.L;
      const k = this.cave ? this.caveK(z) : 0;
      const h = ny * 0.5 + 0.5;
      const sd = L.sunDir;
      const m = Math.max(0, nx * sd[0] + ny * sd[1] + nz * sd[2]) * (shadow === undefined ? 1 : shadow);
      const sky = k ? mix3(L.sky, L.caveSky, k) : L.sky, gnd = k ? mix3(L.ground, L.caveGround, k) : L.ground;
      const sun = 1 - k;
      const am = ao === undefined ? 1 : ao;
      let r = lerp(gnd[0], sky[0], h) * am + L.sun[0] * m * sun;
      let g = lerp(gnd[1], sky[1], h) * am + L.sun[1] * m * sun;
      let b = lerp(gnd[2], sky[2], h) * am + L.sun[2] * m * sun;
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
      for (const st of this.stands) add(st.z, { k: 'stand', o: st });
      for (const c of this.cliffs || []) add(c.z, { k: 'cliff', o: c });
      for (const sc of this.scaffold || []) add(sc.z, { k: 'scaffold', o: sc });
      if (this.startGate) add(this.startGate.z, { k: 'startGate', o: this.startGate });
      for (const rk of this.rocks || []) add(rk.z, { k: 'rock', o: rk });
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
          case 'stand': B.stand(o); ch.maxZ = Math.max(ch.maxZ, o.z + 14); ch.minZ = Math.min(ch.minZ, o.z - 14); break;
          case 'mouth': B.mouth(o); break;
          case 'cliff': B.cliff(o); break;
          case 'scaffold': B.scaffold(o); break;
          case 'startGate': B.startGate(o); break;
          case 'rock': B.rock(o); break;
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
          const gc = l.neon ? l.c : [1.0, 0.93, 0.78];
          d.push(l.hx, l.hy - 0.15, l.z, gc[0], gc[1], gc[2], 0.9 * (l.i / 1.8), 1.6);
          d.push(l.hx, l.hy - 0.3, l.z, gc[0], gc[1] * 0.95, gc[2] * 0.85, (l.neon ? 0.24 : 0.16) * (l.i / 1.8), l.neon ? 14 : 11);
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
      const mtn = new SS.FBuf(1 << 17);
      const lightFn = { light: (nx, ny, nz, x, y, z, out) => { const k = P.k[0] + Math.max(0, nx * sd[0] + ny * sd[1] + nz * sd[2]) * P.k[1]; out[0] = k; out[1] = k; out[2] = k; return out; } };
      const B = new Builder(lightFn, mtn, new SS.FBuf(8));
      let seed = 99;
      for (const ch of this.map.id) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
      const r = mulberry32(seed);
      // smooth noise that wraps around the horizon
      const noise = (n) => {
        const v = Array.from({ length: n }, () => r());
        return (a) => {
          const t = ((((a / TAU) % 1) + 1) % 1) * n, i0 = Math.floor(t), f = t - i0, e = f * f * (3 - 2 * f);
          return lerp(v[i0 % n], v[(i0 + 1) % n], e);
        };
      };
      const rock = P.dark, snow = P.cap, P0k = P.k;
      const rockLight = [lerp(rock[0], snow[0], 0.25), lerp(rock[1], snow[1], 0.25), lerp(rock[2], snow[2], 0.25)];
      if (this.map.city) {
        // a city at night instead of mountains: towers with lit floors, and two old cooling towers
        const WIN = [1.0, 0.82, 0.5], WIN2 = [0.7, 0.85, 1.0], WALL = [0.07, 0.08, 0.12];
        for (let i = 0; i < 130; i++) {
          const a = (i / 130) * TAU + r() * 0.03, dist = 980 + r() * 420;
          const wdt = 16 + r() * 34, h = 20 + Math.pow(r(), 1.8) * 150, dep = 20 + r() * 30;
          const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist, tx = -Math.sin(a), tz = Math.cos(a);
          const fx = -Math.cos(a), fz = -Math.sin(a); // toward the stadium
          const y0 = -200;
          const P0 = [cx - tx * wdt, cz - tz * wdt], P1 = [cx + tx * wdt, cz + tz * wdt];
          const back = [cx * 1.1, 0, cz * 1.1];
          B.quad([P0[0], y0, P0[1]], [P1[0], y0, P1[1]], [P1[0], h, P1[1]], [P0[0], h, P0[1]], WALL, back);
          // side walls and roof so it reads as a block
          for (const Pp of [P0, P1]) B.quad([Pp[0], y0, Pp[1]], [Pp[0] - fx * dep, y0, Pp[1] - fz * dep], [Pp[0] - fx * dep, h, Pp[1] - fz * dep], [Pp[0], h, Pp[1]], WALL, [cx * 1.1, h / 2, cz * 1.1]);
          B.quad([P0[0], h, P0[1]], [P1[0], h, P1[1]], [P1[0] - fx * dep, h, P1[1] - fz * dep], [P0[0] - fx * dep, h, P0[1] - fz * dep], WALL, [cx, h - 10, cz]);
          // lit floors: a few bands of windows on the side facing us
          const col = r() < 0.3 ? WIN2 : WIN;
          for (let y = 6 + r() * 6; y < h - 4; y += 7 + r() * 5) {
            if (r() < 0.35) continue;
            const u0 = r() * 0.4, u1 = 0.6 + r() * 0.4;
            const A = [lerp(P0[0], P1[0], u0) + fx, lerp(P0[1], P1[1], u0) + fz], Bq = [lerp(P0[0], P1[0], u1) + fx, lerp(P0[1], P1[1], u1) + fz];
            const k = 0.45 + r() * 0.55;
            B.quad([A[0], y, A[1]], [Bq[0], y, Bq[1]], [Bq[0], y + 2.2, Bq[1]], [A[0], y + 2.2, A[1]], [col[0] * k, col[1] * k, col[2] * k], back, 1);
          }
          // a red light on the tallest ones
          if (h > 170) B.quad([cx - tx * 2, h + 1, cz - tz * 2], [cx + tx * 2, h + 1, cz + tz * 2], [cx + tx * 2, h + 4, cz + tz * 2], [cx - tx * 2, h + 4, cz - tz * 2], [1.4, 0.15, 0.1], back, 1);
        }
        for (const [a, d] of [[1.9, 1050], [2.25, 1120]]) {
          const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
          B.cyl(cx, -200, cz, 60, 38, 260, 18, [0.16, 0.16, 0.2]);
          B.cyl(cx, 60, cz, 38, 44, 70, 18, [0.18, 0.18, 0.22]);
        }
      }
      // layered ranges, far to near; smooth per-vertex shading: snow on gentle faces, rock on steep ones
      const ranges = this.map.city ? [{ dist: 1750, depth: 260, h: 300, N: 240, rows: 8 }]
        : [{ dist: 1780, depth: 320, h: 430, N: 260, rows: 9 }, { dist: 1400, depth: 290, h: 330, N: 340, rows: 10 }, { dist: 1060, depth: 250, h: 215, N: 420, rows: 11 }];
      const sdx = sd[0], sdy = sd[1], sdz = sd[2];
      for (const R of ranges) {
        const n1 = noise(7), n2 = noise(19), n3 = noise(47), n4 = noise(130), n5 = noise(90), n6 = noise(260);
        const ridge = (a) => {
          const massif = n1(a) * 0.6 + n2(a) * 0.4;
          const pk = 1 - Math.abs(n3(a) * 2 - 1);
          return R.h * (0.18 + 0.82 * massif) * (0.5 + 0.5 * pk * pk) + n4(a) * 16;
        };
        const ROWS = R.rows, NC = R.N + 1;
        const pos = [];
        for (let i = 0; i <= R.N; i++) {
          const a = (i / R.N) * TAU;
          const top = ridge(a);
          // gullies only on some faces, so the ranges aren't evenly furrowed
          const gully = (n5(a) - 0.5) * 2 * smooth(clamp((n2(a * 1.7 + 1) - 0.35) * 2.5, 0, 1)), fine = 0;
          for (let j = 0; j <= ROWS; j++) {
            const u = j / ROWS;
            const y = top * Math.pow(1 - u, 1.3) - u * 260 + gully * u * (1 - u) * 52 + fine * u * (1 - u) * 14;
            const rad = R.dist - u * R.depth + gully * u * (1 - u) * 70;
            pos.push([Math.cos(a) * rad, y, Math.sin(a) * rad, a, u]);
          }
        }
        const P = (i, j) => pos[Math.min(R.N, Math.max(0, i)) * (ROWS + 1) + Math.min(ROWS, Math.max(0, j))];
        const snowLine = R.h * 0.18;
        const vcol = [];
        for (let i = 0; i <= R.N; i++) {
          for (let j = 0; j <= ROWS; j++) {
            const p = P(i, j), pa = P(i - 1, j), pb = P(i + 1, j), pu = P(i, j - 1), pd = P(i, j + 1);
            const t1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], t2 = [pd[0] - pu[0], pd[1] - pu[1], pd[2] - pu[2]];
            let nx = t1[1] * t2[2] - t1[2] * t2[1], ny = t1[2] * t2[0] - t1[0] * t2[2], nz = t1[0] * t2[1] - t1[1] * t2[0];
            if (nx * -p[0] + nz * -p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
            // snow sticks where it's not too steep and high enough; gullies hold streaks of it lower down
            const streak = smooth(clamp((n5(p[3] * 0.37 + 2) - 0.55) * 4, 0, 1)) * 0.15;
            const sn = clamp((ny - 0.38 + streak) * 4, 0, 1) * clamp((p[1] - snowLine * (1 - streak * 3)) / 50 + 0.5, 0, 1);
            const rk = 0.85 + n6(p[3] * 2.3 + p[4]) * 0.3;
            const alb = [lerp(rock[0] * rk, snow[0], sn), lerp(rock[1] * rk, snow[1], sn), lerp(rock[2] * rk, snow[2], sn)];
            const k = P0k[0] + Math.max(0, nx * sdx + ny * sdy + nz * sdz) * P0k[1];
            vcol.push([alb[0] * k, alb[1] * k, alb[2] * k]);
          }
        }
        const C = (i, j) => vcol[i * (ROWS + 1) + j];
        const put = (i, j) => { const p = P(i, j), c = C(i, j); mtn.v(p[0], p[1], p[2], c[0], c[1], c[2]); };
        for (let i = 0; i < R.N; i++) {
          for (let j = 0; j < ROWS; j++) {
            put(i, j); put(i + 1, j); put(i + 1, j + 1);
            put(i, j); put(i + 1, j + 1); put(i, j + 1);
          }
        }
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

    beam(x0, y0, z0, x1, y1, z1, w, h, col, em) {
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz) || 1;
      const sx = (-dz / len) * w, sz = (dx / len) * w;
      const v = [
        [x0 - sx, y0 - h, z0 - sz], [x0 + sx, y0 - h, z0 + sz], [x0 + sx, y0 + h, z0 + sz], [x0 - sx, y0 + h, z0 - sz],
        [x1 - sx, y1 - h, z1 - sz], [x1 + sx, y1 - h, z1 + sz], [x1 + sx, y1 + h, z1 + sz], [x1 - sx, y1 + h, z1 - sz],
      ];
      const o = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      const f = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
      for (const q of f) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], col, o, em);
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
          const sun = M.shadows && !(w.cave && ck > 0.3) ? w.treeShadow(x, z) * w.terrainShadow(x, y, z) : 1;
          w.light(nx, ny, nz, x, y, z, L3, sun, w.groundAO(x, y, z, gx, gz));
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
          const pipeK = w.pipeArr ? w.sample(w.pipeArr, z) : 0;
          if (pipeK > 0.3 && ao >= SS.PIPE.LIP - 0.02 && ao < SS.PIPE.LIP + 0.52) { ar = 0.22; ag = 0.42; ab = 0.95; } // blue line along the coping
          else if (w.towerArr && w.sample(w.towerArr, z) > 0.5 && Math.abs(ao - M.towerHalf + 0.25) < 0.3) { ar = 0.22; ag = 0.42; ab = 0.95; }
          else if (steep > rockAt - (ao > C.HALF + 6 && ck < 0.5 ? 0.38 * (0.5 + 0.28 * Math.sin(x * 0.071 + z * 0.033) + 0.22 * Math.sin(z * 0.113 - x * 0.052 + 1.3)) : 0) && !(pipeK > 0.02 && ao < C.HALF)) {
            const ra = rockAt - (ao > C.HALF + 6 && ck < 0.5 ? 0.38 * (0.5 + 0.28 * Math.sin(x * 0.071 + z * 0.033) + 0.22 * Math.sin(z * 0.113 - x * 0.052 + 1.3)) : 0);
            // steep walls: dark rock broken up by snow chutes and patches
            const chute = ck > 0.5 ? 1 : smooth(clamp((0.5 + 0.5 * Math.sin(x * 0.093 + z * 0.047) * Math.sin(z * 0.131 - x * 0.041 + 0.7) - 0.3) * 3, 0, 1));
            const kk = Math.min(0.9, (steep - ra) * 2.2) * chute;
            const tone = 0.5 + 0.5 * Math.sin(x * 0.21 + z * 0.17) * Math.sin(z * 0.09 + 2.1);
            const rock = ck > 0.5 ? [0.22, 0.24, 0.32] : [lerp(0.16, 0.3, tone), lerp(0.16, 0.29, tone), lerp(0.2, 0.33, tone)];
            ar = lerp(ar, rock[0], kk); ag = lerp(ag, rock[1], kk); ab = lerp(ab, rock[2], kk);
          }
          let v = 0.97 + hash(x * 0.37, z * 0.29) * 0.05;
          if (pipeK > 0.3 && ao < SS.PIPE.LIP - 0.3) {
            // pipe walls: cooler and darker as they steepen, with cutter lines running down the pipe
            const tw = clamp(SS.PIPE.y(ao) / SS.PIPE.H, 0, 1) * pipeK;
            ar *= 1 - 0.3 * tw; ag *= 1 - 0.2 * tw; ab *= 1 - 0.05 * tw;
            if (ao > SS.PIPE.W0) v *= (j >> 1) & 1 ? 0.95 : 1.02;
          } else if (pipeK > 0.3 && ao > SS.PIPE.LIP + 0.3 && ao < C.HALF) { ar *= 0.93; ag *= 0.95; }
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

    // the rock face of a cliff band, bulging out of the snow drop across the run and the banks
    cliff(c) {
      const w = this.w, ROCK = [0.33, 0.33, 0.37], DARK = [0.24, 0.24, 0.29];
      const span = C.HALF + 10, step = 1.3;
      let prev = null;
      for (let o = -span; o <= span + 0.01; o += step) {
        const zc = c.z, x = w.center(zc) + o;
        const top = w.ground(x, zc - 0.15), bot = w.ground(x, zc + 2.7);
        const j = hash(o * 1.7, zc), j2 = hash(o * 0.9 + 3, zc * 1.3);
        const col = [
          [x, top + 0.04, zc + 0.15],
          [x, lerp(top, bot, 0.42), zc + 1.35 + j * 0.5],
          [x, bot - 0.15, zc + 2.75 + j2 * 0.3],
        ];
        if (prev) {
          const ox = x - step / 2, oz = zc - 2, oy = top - 1;
          const tint = (k) => (hash(o * 3.1 + k, zc) > 0.5 ? ROCK : DARK);
          for (let k = 0; k < 2; k++) this.quad(prev[k], col[k], col[k + 1], prev[k + 1], tint(k), [ox, oy, oz]);
        }
        prev = col;
      }
    }

    // one bay of the big air tower: steel posts, ledgers and braces from the arena floor up to the deck,
    // a wrap banner near the top and a railing along the deck edge
    scaffold(sc) {
      const w = this.w, s = sc.side, Hh = w.map.towerHalf;
      const STEEL = [0.5, 0.53, 0.6], WRAP = [0.16, 0.3, 0.75], STRIPE = [0.95, 0.95, 0.98];
      const za = sc.z, zb = sc.z + 6;
      const xIn = (z) => w.center(z) + s * (Hh + 0.35), xOut = (z) => w.center(z) + s * (Hh + 3.2);
      const deck = (z) => w.base(z) - 0.05;
      const floor = (x, z) => w.ground(x, z);
      for (const z of [za]) {
        for (const xf of [xIn, xOut]) {
          const x = xf(z), y0 = floor(x, z), y1 = deck(z) - 0.2;
          this.box(x, (y0 + y1) / 2, z, 0.12, (y1 - y0) / 2, 0.12, 0, STEEL);
        }
        // ledgers and cross braces every few metres up
        const top = deck(z) - 0.3;
        for (let y = floor(xOut(z), z) + 3; y < top; y += 3.2) {
          this.beam(xIn(z), y, z, xOut(z), y, z, 0.06, 0.06, STEEL);
          this.beam(xOut(z), y, za, xOut(zb), y + (deck(zb) - deck(za)), zb, 0.06, 0.06, STEEL);
          this.beam(xOut(z), y, za, xOut(zb), y + 3.2 + (deck(zb) - deck(za)), zb, 0.045, 0.045, STEEL);
        }
      }
      // fabric wrap along the top of the outside face, with a white stripe
      const y0a = deck(za) - 3.2, y0b = deck(zb) - 3.2;
      this.quad([xOut(za), y0a, za], [xOut(zb), y0b, zb], [xOut(zb), deck(zb) - 0.2, zb], [xOut(za), deck(za) - 0.2, za], WRAP, [w.center(za), deck(za) - 1.5, za]);
      this.quad([xOut(za) + s * 0.02, y0a + 1.1, za], [xOut(zb) + s * 0.02, y0b + 1.1, zb], [xOut(zb) + s * 0.02, y0b + 1.5, zb], [xOut(za) + s * 0.02, y0a + 1.5, za], STRIPE, [w.center(za), deck(za) - 1.5, za], 0.35);
      // the deck itself reaches out over the scaffold, and a railing runs along its edge
      this.quad([xIn(za) - s * 0.4, deck(za) + 0.02, za], [xOut(za), deck(za) - 0.1, za], [xOut(zb), deck(zb) - 0.1, zb], [xIn(zb) - s * 0.4, deck(zb) + 0.02, zb], [0.42, 0.45, 0.52], [w.center(za), deck(za) + 5, za]);
      const xr = (z) => w.center(z) + s * (Hh + 0.3);
      this.box(xr(za), deck(za) + 0.55, za, 0.05, 0.55, 0.05, 0, STEEL);
      this.beam(xr(za), deck(za) + 1.1, za, xr(zb), deck(zb) + 1.1, zb, 0.05, 0.05, [0.95, 0.42, 0.12]);
    }

    // start house: a roofed hut across the deck with a gate for each rider
    startGate(g) {
      const w = this.w, z = g.z, c = w.center(z), gy = w.ground(c, z), hw = g.half;
      const FRAME = [0.2, 0.22, 0.28], ROOF = [0.9, 0.24, 0.2], GATE = [0.95, 0.85, 0.2];
      for (const s of [-1, 1]) this.box(c + s * hw, gy + 2.25, z - 1.5, 0.25, 2.25, 2.2, 0, FRAME);
      this.box(c, gy + 4.6, z - 2.2, hw + 0.4, 0.18, 1.9, 0, ROOF);
      this.box(c, gy + 4.25, z - 0.35, hw, 0.32, 0.06, 0, [0.95, 0.95, 0.98], 0.25);
      const n = g.gates;
      for (let i = 0; i < n; i++) {
        const x = c - hw + ((i + 0.5) / n) * hw * 2;
        this.box(x, gy + 0.45, z + 0.6, Math.min(0.9, hw / n - 0.15), 0.05, 0.05, 0, GATE);
        if (i > 0) this.box(c - hw + (i / n) * hw * 2, gy + 0.6, z - 0.4, 0.06, 0.6, 1.0, 0, FRAME);
      }
    }

    // a lumpy boulder sitting in the snow
    rock(r) {
      const s = r.s, c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
      const cy = r.gy + s * 0.25;
      const hx = s * 0.95, hy = s * 0.8, hz = s * 0.75;
      const P = (x, y, z, i) => {
        const jx = 1 + (hash(r.x + i, r.z) - 0.5) * 0.5, jy = 1 + (hash(r.z + i, r.x) - 0.5) * 0.5;
        x *= jx; z *= jy; y *= y > 0 ? jy : 1;
        return [r.x + x * c + z * sn, cy + y, r.z - x * sn + z * c];
      };
      const v = [P(-hx, -hy, -hz, 0), P(hx, -hy, -hz, 1), P(hx * 0.7, hy, -hz * 0.6, 2), P(-hx * 0.8, hy * 0.9, -hz * 0.7, 3),
        P(-hx, -hy, hz, 4), P(hx, -hy, hz, 5), P(hx * 0.6, hy * 0.85, hz * 0.7, 6), P(-hx * 0.75, hy, hz * 0.55, 7)];
      const o = [r.x, cy, r.z];
      const col = hash(r.x, r.z) > 0.5 ? [0.34, 0.34, 0.38] : [0.27, 0.27, 0.32];
      const f = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7]];
      for (const q of f) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], q[0] === 3 ? [0.92, 0.94, 0.98] : col, o);
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
      const h2 = hash(t.z * 1.7, t.x * 0.3);
      // some trees run bluish, some yellowish; some carry a lot of snow, some got blown bare
      const green = [T.green[0] * (0.9 + h2 * 0.25) + h1 * 0.03, T.green[1] * (0.92 + h1 * 0.18) + h1 * 0.04, T.green[2] * (0.85 + (1 - h2) * 0.35) + h1 * 0.03];
      const sn = T.snow * (0.45 + hash(t.x * 0.7, t.z * 1.3) * 0.9);
      const snow = [lerp(0.6, 0.82, Math.min(1, sn)), lerp(0.66, 0.87, Math.min(1, sn)), lerp(0.75, 0.96, Math.min(1, sn))];
      const kind = t.kind || 'fir';
      const BARK = [0.2, 0.13, 0.08];
      if (kind === 'snag') {
        // a dead tree: grey trunk and a few bare branches, snow on the stubs
        const grey = [0.33, 0.29, 0.26];
        this.cyl(t.x, y, t.z, 0.2 * s, 0.07 * s, 7.5 * s, 5, grey);
        for (let i = 0; i < 4; i++) {
          const a = h1 * 9 + i * 2.1, by = y + (2.6 + i * 1.2) * s, L2 = (1.6 - i * 0.25) * s;
          const ex = t.x + Math.cos(a) * L2, ez = t.z + Math.sin(a) * L2;
          this.beam(t.x, by, t.z, ex, by + 0.9 * s, ez, 0.07 * s, 0.07 * s, grey);
          this.beam(ex - Math.cos(a) * 0.3, by + 0.82 * s, ez - Math.sin(a) * 0.3, ex, by + 0.92 * s, ez, 0.09 * s, 0.05 * s, snow);
        }
        return;
      }
      // fir: the classic; spruce: tall and narrow; pine: tall bare trunk with a crown up top
      const shape = kind === 'spruce' ? { trunk: 1.2, tiers: t.near ? 8 : 4, rb: 1.4, step: t.near ? 0.78 : 1.3, hh: 1.9, taper: t.near ? 0.17 : 0.3 }
        : kind === 'pine' ? { trunk: 4.2, tiers: t.near ? 4 : 3, rb: 1.6, step: 0.8, hh: 1.8, taper: 0.3 }
        : { trunk: 1.4, tiers: t.near ? 6 : 3, rb: 1.85, step: t.near ? 0.88 : 1.5, hh: 2.2, taper: t.near ? 0.28 : 0.48 };
      const dark = kind === 'spruce' ? 0.8 : kind === 'pine' ? 1.12 : 1;
      green[0] *= dark; green[1] *= dark; green[2] *= dark;
      this.cyl(t.x, y, t.z, 0.2 * s, 0.14 * s, (shape.trunk + 0.3) * s, 5, BARK);
      const tiers = shape.tiers;
      const sides = t.near ? 7 : 6;
      const base = shape.trunk - 0.4;
      for (let i = 0; i < tiers; i++) {
        const rb = Math.max(0.35, shape.rb - i * shape.taper * (shape.rb / 1.8)) * s;
        const y0 = y + (base + i * shape.step) * s;
        const hh = (shape.hh - i * 0.18) * s;
        this.bough(t.x, y0, t.z, rb, hh, sides, green, snow, sn, h1 * 7 + i * 1.7, t.near);
      }
    }

    // one tier of a conifer: branch tips poking out and drooping, snow lying on the upper boughs,
    // a dark underside, and a lighter green toward the tips
    bough(x, y0, z, rb, hh, sides, green, snow, sn, seed, near) {
      const n = sides * 2;
      const tip = [], mid = [];
      for (let k = 0; k < n; k++) {
        const out = k % 2 === 0;
        const a = (k / n) * TAU + seed + (hash(seed + k, 3.1) - 0.5) * 0.25;
        const r = rb * (out ? 0.95 + hash(seed, k) * 0.15 : 0.62);
        const dy = out ? -0.22 * rb : -0.05 * rb; // tips droop
        tip.push([x + Math.cos(a) * r, y0 + dy, z + Math.sin(a) * r]);
        const rm = r * 0.5;
        mid.push([x + Math.cos(a) * rm, y0 + hh * 0.42 + dy * 0.3, z + Math.sin(a) * rm]);
      }
      const apex = [x, y0 + hh, z];
      const o = [x, y0 + hh * 0.3, z];
      const tipCol = [green[0] * 1.25 + 0.01, green[1] * 1.22 + 0.02, green[2] * 1.1];
      const deep = [green[0] * 0.7, green[1] * 0.72, green[2] * 0.78];
      const snowy = Math.min(1, sn);
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        const out = k % 2 === 0;
        // lower bough: green, lighter on the tips; snow caught on some of the tips
        const lowCol = near && out && snowy > 0.5 && hash(seed * 3 + k, 9.1) < 0.45 ? snow : out ? tipCol : green;
        this.quad(tip[k], tip[k2], mid[k2], mid[k], lowCol, o);
        // upper bough: snow lies on it (the recesses stay green)
        const upCol = snowy > 0.25 && (out || hash(seed + k, 5.3) < snowy * 0.5) ? snow : green;
        this.tri(mid[k][0], mid[k][1], mid[k][2], mid[k2][0], mid[k2][1], mid[k2][2], apex[0], apex[1], apex[2], upCol, o[0], o[1], o[2]);
        // underside, in its own shade
        if (near) this.tri(tip[k][0], tip[k][1], tip[k][2], tip[k2][0], tip[k2][1], tip[k2][2], x, y0 + hh * 0.12, z, deep, x, y0 + hh, z);
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
      if (f.size === 'P') return;
      const blue = w.map.neon ? [1.0, 0.3, 0.85] : w.mapId === 'sunset' ? [1.0, 0.5, 0.2] : w.cave && w.inCave(f.z0) ? [0.6, 0.4, 1.0] : [0.25, 0.55, 1.0];
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
      const cave = w.cave && w.inCave(f.az);
      const neon = !!w.map.neon;
      const NEON = [[1.0, 0.25, 0.75], [0.2, 0.9, 1.0], [0.65, 0.35, 1.0], [0.35, 1.0, 0.55]];
      const nc = NEON[Math.abs(Math.round(f.az * 0.37)) % NEON.length];
      // the top line, segment by segment, so long and arched rails follow their shape
      const N = Math.max(1, Math.ceil(f.len / 2.5));
      const P = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N;
        const x = f.ax + f.dx * f.len * k, z = f.az + f.dz * f.len * k;
        const gy = w.ground(x, z);
        const top = Math.max(lerp(f.g0, f.g1, k) + f.h + (f.arch ? f.arch * Math.sin(Math.PI * k) : 0), gy + 0.25);
        P.push({ x, z, top, gy });
      }
      if (isBox) {
        const hw = 0.3;
        const sx = f.dz * hw, sz = -f.dx * hw;
        const side = neon ? nc : cave ? [0.4, 0.9, 1.0] : w.mapId === 'sunset' || w.mapId === 'triple' ? [1.0, 0.45, 0.25] : [1.0, 0.72, 0.12];
        const em = neon ? 0.75 : cave ? 0.5 : 0;
        const topCol = neon ? [0.85, 0.85, 0.95] : [0.7, 0.76, 0.86];
        for (let i = 0; i < N; i++) {
          const a = P[i], b = P[i + 1];
          const o = [(a.x + b.x) / 2, (a.top + a.gy) / 2 - 0.2, (a.z + b.z) / 2];
          const v = [
            [a.x - sx, a.gy - 0.4, a.z - sz], [a.x + sx, a.gy - 0.4, a.z + sz], [a.x + sx, a.top, a.z + sz], [a.x - sx, a.top, a.z - sz],
            [b.x - sx, b.gy - 0.4, b.z - sz], [b.x + sx, b.gy - 0.4, b.z + sz], [b.x + sx, b.top, b.z + sz], [b.x - sx, b.top, b.z - sz],
          ];
          this.quad(v[3], v[2], v[6], v[7], topCol, o, neon ? 0.3 : 0);
          this.quad(v[4], v[0], v[3], v[7], side, o, em);
          this.quad(v[1], v[5], v[6], v[2], side, o, em);
          if (i === 0) this.quad(v[0], v[1], v[2], v[3], side, o, em);
          if (i === N - 1) this.quad(v[5], v[4], v[7], v[6], side, o, em);
        }
        const x0 = P[0].x, z0 = P[0].z, t0 = P[0].top, g0 = P[0].gy - 0.4;
        const rx = x0 - f.dx * f.ramp, rz = z0 - f.dz * f.ramp;
        const gr = w.ground(rx, rz) - 0.05;
        const r = [[rx - sx, gr, rz - sz], [rx + sx, gr, rz + sz], [x0 + sx, t0, z0 + sz], [x0 - sx, t0, z0 - sz]];
        this.quad(r[0], r[1], r[2], r[3], [0.75, 0.8, 0.9], [(rx + x0) / 2, gr - 1, (rz + z0) / 2]);
        this.tri(r[0][0], r[0][1], r[0][2], r[3][0], r[3][1], r[3][2], x0 - sx, g0, z0 - sz, side, undefined, undefined, undefined, em);
        this.tri(r[1][0], r[1][1], r[1][2], r[2][0], r[2][1], r[2][2], x0 + sx, g0, z0 + sz, side, undefined, undefined, undefined, em);
      } else {
        const railCol = neon ? nc : [0.78, 0.83, 0.92];
        for (let i = 0; i < N; i++) {
          const a = P[i], b = P[i + 1];
          this.beam(a.x, a.top, a.z, b.x, b.top, b.z, 0.06, 0.06, railCol, neon ? 0.9 : 0);
        }
        const posts = Math.max(2, Math.round(f.len / 4.5));
        for (let i = 0; i <= posts; i++) {
          const p = P[Math.round((i / posts) * N)];
          this.box(p.x, (p.top + p.gy - 0.2) / 2, p.z, 0.05, (p.top - p.gy + 0.2) / 2, 0.05, f.ang, [0.2, 0.22, 0.26]);
        }
        this.box(P[0].x, (P[0].gy + P[0].top) / 2 - 0.1, P[0].z, 0.18, (P[0].top - P[0].gy) / 2 + 0.1, 0.06, f.ang, neon ? nc : cave ? [0.5, 0.4, 1.0] : [0.9, 0.2, 0.15], neon || cave ? 0.6 : 0);
      }
    }

    // stepped grandstand packed with fans
    stand(st) {
      const w = this.w;
      const r = mulberry32(Math.floor(st.z * 7 + st.x * 3));
      const shirts = [[0.95, 0.2, 0.2], [0.2, 0.45, 0.95], [1, 0.8, 0.15], [0.2, 0.75, 0.4], [0.95, 0.95, 0.97], [0.6, 0.3, 0.85], [1, 0.5, 0.15], [0.1, 0.1, 0.12]];
      const s = st.side;
      const L = 13;
      for (let tier = 0; tier < 5; tier++) {
        const x = st.x + s * tier * 1.3, gy = Math.min(w.ground(st.x, st.z), w.ground(x, st.z));
        const top = gy + 0.3 + tier * 0.7;
        this.box(x, (top + gy - 1) / 2, st.z, 0.65, (top - gy + 1) / 2, L, 0, tier % 2 ? [0.55, 0.58, 0.66] : [0.48, 0.52, 0.6]);
        for (let zz = -L + 0.5; zz < L; zz += 0.75 + r() * 0.3) {
          if (r() < 0.12) continue;
          const c = shirts[(r() * shirts.length) | 0];
          const hh = 0.5 + r() * 0.15;
          this.box(x + s * 0.1, top + hh / 2, st.z + zz, 0.17, hh / 2, 0.2, 0, c);
          this.box(x + s * 0.1, top + hh + 0.12, st.z + zz, 0.11, 0.11, 0.11, 0, r() < 0.3 ? [0.95, 0.95, 0.97] : [0.85, 0.66, 0.5]);
        }
      }
      // back wall with a banner
      const xb = st.x + s * 6.6, gyb = w.ground(st.x, st.z);
      this.box(xb, gyb + 2.4, st.z, 0.15, 3.4, L, 0, [0.2, 0.25, 0.4]);
      this.box(xb - s * 0.17, gyb + 4.6, st.z, 0.02, 0.7, L - 1, 0, [1.0, 0.82, 0.15], 0.3);
    }

    lamp(l) {
      const s = l.side;
      const base = l.gy - 0.3;
      this.box(l.x, base + 0.75, l.z, 0.26, 0.75, 0.26, 0, [0.75, 0.12, 0.08]);
      this.box(l.x, base + 5.4, l.z, 0.09, 5.1, 0.09, 0, [0.16, 0.17, 0.2]);
      this.beam(l.x, l.hy + 0.25, l.z, l.hx, l.hy + 0.25, l.z, 0.05, 0.05, [0.16, 0.17, 0.2]);
      this.box(l.hx, l.hy, l.z, 0.42, 0.18, 0.55, 0, l.neon ? [l.c[0] * 1.3, l.c[1] * 1.3, l.c[2] * 1.3] : [1.25, 1.18, 1.0], true);
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
    if (Builder._half === C.HALF && Builder._fine === C.FINE) return Builder._offs;
    const o = [];
    const st = C.FINE ? 0.5 : 1.75;
    for (let v = -(C.HALF + 4); v <= C.HALF + 4 + 0.01; v += st) o.push(+v.toFixed(2));
    for (const d of [6.5, 9.5, 13.5, 18.5, 25, 33, 43, 56, 72, 92, 118]) { o.push(C.HALF + d); o.unshift(-(C.HALF + d)); }
    Builder._half = C.HALF;
    Builder._fine = C.FINE;
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
