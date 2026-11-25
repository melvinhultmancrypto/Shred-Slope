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
  const FAR_SEG = 200;   // m of valley per far-view segment
  const FAR_RUN = 1500;  // how far the far view reaches past the end of the run

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
    // Olympic course jumps, named by their gap (take-off to the knuckle) in metres
    J15: { Hk: 3.6, Lu: 12, Lt: 15, Ll: 30, w: 3.6 },
    J18: { Hk: 4.4, Lu: 14, Lt: 18, Ll: 36, w: 5 },
    J19: { Hk: 4.4, Lu: 14, Lt: 19, Ll: 36, w: 4 },
    J21: { Hk: 5, Lu: 16, Lt: 21, Ll: 42, w: 5.5 },
    J22: { Hk: 5.2, Lu: 17, Lt: 22, Ll: 44, w: 5.5 },
    J25: { Hk: 5.6, Lu: 18, Lt: 25, Ll: 48, w: 6 },
    // quarterpipe-style side take-off: steep, sends you up more than out
    Q: { Hk: 3.4, Lu: 7, Lt: 1.5, Ll: 16, w: 2.6, pe: 2.6 },
    // rollers: rounded humps you can pop off or roll over
    RK: { Hk: 1.8, Lu: 7, Lt: 1, Ll: 9, w: 3, sh: 's' },
    RK2: { Hk: 2.6, Lu: 11, Lt: 4, Ll: 24, w: 4, sh: 's' },
    // little kicker that sends you onto a rail
    GK: { Hk: 1.3, Lu: 5, Lt: 0.6, Ll: 3, w: 1.6, pe: 2.2 },
    // snow deck / ledge that rails start from (sizes set per deck)
    D: { Hk: 1.5, Lu: 7, Lt: 4, Ll: 3.2, w: 2.2, sh: 's' },
    // step-up: a small kicker over a dip onto a table built higher than the lip (Lt is the gap plus the table)
    SU: { Hk: 1.4, Lu: 6, Lg: 4.5, Ht: 2.6, Lt: 11.5, Ll: 11, w: 3, sh: 'u' },
    // step-down: ride up onto a deck, pop off the kick at its end and drop onto a long landing
    SD: { Hk: 2.5, Hd: 1.9, Lr: 6, Lk: 2.6, Lu: 13, Lt: 0.6, Ll: 18, w: 3, sh: 'd' },
  };
  // features that are not jumps: no flags, no lip line, no tokens, and the riders' AI doesn't pop off them
  const NOT_JUMP = { P: 1, D: 1, B: 1, RK: 1, GK: 1 };
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
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 14000, t: 'Score 14,000' }, { k: 'time', v: 145, t: 'Finish under 2:25' }],
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
    // the one course for now: Sundown Park after dark, floodlit all the way down to a giant kicker
    slopestyle: {
      id: 'slopestyle', name: 'Sundown Park', time: 'NIGHT SESSION', diff: 'HARD', lit: true,
      sub: 'The park after dark: floodlights all the way down, lit rails and kickers, a jib garden, three rail sections, step-ups, two jump lines and the Send.',
      half: 26, curve: [9, 320, 4, 150], slope: 0.235, alt: 3100, length: 2360,
      zones: [Z('JIB GARDEN', 'parkmix', 260), Z('RAIL SECTION 1', 'railStation', 170, { n: 1 }), Z('RAIL SECTION 2', 'railStation', 170, { n: 3 }),
        Z('STEP-UPS', 'jumpline', 330, { small: true }), Z('RAIL SECTION 3', 'railStation', 170, { n: 5 }),
        Z('JUMP LINE', 'jumpStation', 300, { n: 1 }), Z('BIG LINE', 'jumpStation', 300, { n: 2 }), Z('THE SEND', 'giant', 300)],
      first: 'DROP-IN', stands: true,
      light: { sky: [0.2, 0.24, 0.36], ground: [0.07, 0.08, 0.12], sunDir: norm3([0.2, 0.9, 0.38]), sun: [0.3, 0.33, 0.45], fog: [0.05, 0.07, 0.13], rim: [0.26, 0.33, 0.52], snow: [0.84, 0.88, 0.96], powder: [0.78, 0.83, 0.94] },
      sky: { zen: [0.006, 0.01, 0.03], hor: [0.06, 0.09, 0.17], dir: norm3([-0.45, 0.42, 0.78]), col: [0.75, 0.8, 0.95], disk: 0.99955, glow: [14, 0.22, 300, 0.3], aurora: 0, cloudDark: [0.03, 0.04, 0.09], cloudLit: [0.15, 0.18, 0.28], clouds: 0.7, stars: 1 },
      lamps: { every: 38, i: 1.6, col: [1, 0.95, 0.86] }, banners: true,
      trees: { near: 0.8, far: 0.75, snow: 1, green: [0.06, 0.14, 0.11] },
      snowfall: 0.7, nets: true, shadows: true,
      mtn: { dark: [0.06, 0.08, 0.14], cap: [0.28, 0.32, 0.45], k: [0.25, 0.55] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 16000, t: 'Score 16,000' }, { k: 'giants', v: 1, t: 'Land the Send' }],
      card: 'linear-gradient(180deg,#05070f 0%,#111a30 55%,#26324d 100%)', accent: '#e4e6ea',
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
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'win', t: 'Win the race' }, { k: 'time', v: 76, t: 'Finish under 1:16' }],
      card: 'linear-gradient(180deg,#1c55c4 0%,#6fb0f2 55%,#f5f9ff 100%)', accent: '#ff4060',
    },
    oly14: {
      id: 'oly14', name: 'Sochi 2014 Slopestyle', time: 'SUNNY DAY', diff: 'HARD', oly: true,
      sub: 'The first Olympic slopestyle: open with a jump onto a rail, three jib sections, then three jumps that grow, each with a smaller one beside it. Look out for the giant nesting doll.',
      half: 24, curve: [6, 360, 3, 160], slope: 0.22, alt: 1162, length: 1980,
      zones: [Z('JIB 1', 'oly', 190, { c: 14, s: 0 }), Z('JIB 2', 'oly', 190, { c: 14, s: 1 }), Z('JIB 3', 'oly', 190, { c: 14, s: 2 }),
        Z('JUMP 1 · 18 M', 'oly', 320, { c: 14, s: 3 }), Z('JUMP 2 · 18 M', 'oly', 320, { c: 14, s: 4 }), Z('JUMP 3 · 22 M', 'oly', 320, { c: 14, s: 5 })],
      first: 'START GATE', stands: true, comp: true,
      light: { sky: [0.4, 0.46, 0.6], ground: [0.28, 0.27, 0.3], sunDir: norm3([0.4, 0.62, 0.68]), sun: [0.68, 0.62, 0.52], fog: [0.8, 0.85, 0.94], rim: [0.28, 0.3, 0.36], snow: [0.93, 0.93, 0.95], powder: [0.9, 0.9, 0.94] },
      sky: { zen: [0.14, 0.38, 0.8], hor: [0.78, 0.86, 0.96], dir: norm3([0.4, 0.62, 0.68]), col: [1.0, 0.95, 0.82], disk: 0.9993, glow: [8, 0.34, 120, 0.6], aurora: 0, cloudDark: [0.76, 0.8, 0.9], cloudLit: [1, 1, 1], clouds: 0.45, stars: 0 },
      lamps: null, banners: true, bannerCols: [[0.95, 0.15, 0.55], [0.15, 0.5, 1.0], [1.0, 0.78, 0.1], [0.2, 0.75, 0.35], [0.6, 0.25, 0.85], [1.0, 0.45, 0.1]],
      boxCol: [0.95, 0.2, 0.5], railCol: [0.8, 0.84, 0.92],
      trees: { near: 0.75, far: 0.9, snow: 0.55, green: [0.07, 0.19, 0.13] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.4, 0.46, 0.6], cap: [0.97, 0.98, 1.0], k: [0.62, 0.42] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 13000, t: 'Score 13,000' }, { k: 'perfects', v: 3, t: 'Land 3 perfect landings' }],
      card: 'linear-gradient(180deg,#1b5fd0 0%,#78b6f2 55%,#fbe9f2 100%)', accent: '#ff3d8b',
    },
    oly18: {
      id: 'oly18', name: 'Pyeong\u00adChang 2018 Slopestyle', time: 'COLD AND WINDY', diff: 'HARD', oly: true,
      sub: 'Rail tiers with a butter pad, a wallride, a high bar and a skate bowl, then skewed jumps, quarterpipe side hits and a cheese-wedge kicker.',
      half: 26, curve: [6, 360, 3, 160], slope: 0.23, alt: 1050, length: 1980,
      zones: [Z('RAIL TIER 1', 'oly', 190, { c: 18, s: 0 }), Z('RAIL TIER 2', 'oly', 190, { c: 18, s: 1 }), Z('RAIL TIER 3 · BOWL', 'oly', 190, { c: 18, s: 2 }),
        Z('JUMP 1 · SKEWED', 'oly', 320, { c: 18, s: 3 }), Z('JUMP 2 · QUARTERPIPES', 'oly', 320, { c: 18, s: 4 }), Z('JUMP 3 · CHEESE WEDGE', 'oly', 320, { c: 18, s: 5 })],
      first: 'START GATE', stands: true, comp: true,
      light: { sky: [0.36, 0.44, 0.62], ground: [0.24, 0.26, 0.32], sunDir: norm3([0.25, 0.55, 0.8]), sun: [0.56, 0.56, 0.54], fog: [0.74, 0.82, 0.95], rim: [0.25, 0.3, 0.4], snow: [0.9, 0.93, 0.98], powder: [0.88, 0.91, 0.98] },
      sky: { zen: [0.08, 0.3, 0.78], hor: [0.66, 0.8, 0.96], dir: norm3([0.25, 0.55, 0.8]), col: [1.0, 0.97, 0.9], disk: 0.9994, glow: [8, 0.3, 120, 0.5], aurora: 0, cloudDark: [0.72, 0.78, 0.9], cloudLit: [1, 1, 1], clouds: 0.3, stars: 0 },
      lamps: null, banners: true, bannerCols: [[0.12, 0.35, 0.85], [0.95, 0.95, 0.98], [0.9, 0.15, 0.2], [1.0, 0.8, 0.1], [0.12, 0.6, 0.45]],
      boxCol: [0.15, 0.42, 0.95], railCol: [0.82, 0.86, 0.94], wallCol: [0.94, 0.96, 0.99],
      trees: { near: 0.85, far: 0.95, snow: 0.45, green: [0.07, 0.16, 0.12] },
      snowfall: 0.12, nets: true, shadows: true,
      mtn: { dark: [0.3, 0.36, 0.44], cap: [0.86, 0.9, 0.96], k: [0.5, 0.5] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 13000, t: 'Score 13,000' }, { k: 'grind', v: 5, t: 'Grind for 5 seconds in total' }],
      card: 'linear-gradient(180deg,#0b3fae 0%,#5c9cf0 55%,#eef5ff 100%)', accent: '#2f7dff',
    },
    oly22: {
      id: 'oly22', name: 'Beijing 2022 Slopestyle', time: 'COLD AND CLEAR', diff: 'HARD', oly: true,
      sub: 'Rails stepped down behind a Great Wall, a watch tower with a rail on its roof, then the twisted sisters, the matrix, and a 5 m kicker over a 21 m table.',
      half: 26, curve: [6, 360, 3, 160], slope: 0.22, alt: 1950, length: 1980,
      zones: [Z('JIB 1', 'oly', 190, { c: 22, s: 0 }), Z('JIB 2 · WATCH TOWER', 'oly', 190, { c: 22, s: 1 }), Z('JIB 3', 'oly', 190, { c: 22, s: 2 }),
        Z('TWISTED SISTERS', 'oly', 320, { c: 22, s: 3 }), Z('THE MATRIX', 'oly', 320, { c: 22, s: 4 }), Z('THE BIG ONE · 21 M', 'oly', 320, { c: 22, s: 5 })],
      first: 'START GATE', stands: true, comp: true,
      light: { sky: [0.36, 0.44, 0.64], ground: [0.3, 0.27, 0.26], sunDir: norm3([0.5, 0.5, 0.7]), sun: [0.66, 0.62, 0.56], fog: [0.78, 0.84, 0.95], rim: [0.28, 0.3, 0.38], snow: [0.92, 0.94, 0.98], powder: [0.9, 0.92, 0.97] },
      sky: { zen: [0.06, 0.26, 0.74], hor: [0.7, 0.82, 0.96], dir: norm3([0.5, 0.5, 0.7]), col: [1.0, 0.96, 0.86], disk: 0.9994, glow: [8, 0.32, 120, 0.55], aurora: 0, cloudDark: [0.76, 0.8, 0.9], cloudLit: [1, 1, 1], clouds: 0.15, stars: 0 },
      lamps: null, banners: true, bannerCols: [[0.25, 0.4, 0.95], [0.45, 0.3, 0.9], [0.9, 0.2, 0.25], [0.2, 0.7, 0.95], [0.95, 0.95, 0.98]],
      boxCol: [0.4, 0.32, 0.92], railCol: [0.8, 0.83, 0.9],
      trees: { near: 0.3, far: 0.35, snow: 0.15, green: [0.1, 0.16, 0.12] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.5, 0.44, 0.4], cap: [0.84, 0.82, 0.8], k: [0.7, 0.25] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 13000, t: 'Score 13,000' }, { k: 'grind', v: 6, t: 'Grind for 6 seconds in total' }],
      card: 'linear-gradient(180deg,#0a2f9e 0%,#4f8de8 55%,#e9e2f7 100%)', accent: '#6b5cff',
    },
    oly26: {
      id: 'oly26', name: 'Livigno 2026 Slopestyle', time: 'SNOWY DAY', diff: 'HARD', oly: true,
      sub: 'Big, clean modules in the Italian Alps: a long box, down and kinked rails, a rainbow box, then three jumps of 22 to 25 metres.',
      half: 26, curve: [6, 360, 3, 160], slope: 0.25, alt: 2000, length: 1980,
      zones: [Z('JIB 1', 'oly', 190, { c: 26, s: 0 }), Z('JIB 2', 'oly', 190, { c: 26, s: 1 }), Z('JIB 3', 'oly', 190, { c: 26, s: 2 }),
        Z('JUMP 1 · 22 M', 'oly', 320, { c: 26, s: 3 }), Z('JUMP 2 · 25 M', 'oly', 320, { c: 26, s: 4 }), Z('JUMP 3 · 25 M', 'oly', 320, { c: 26, s: 5 })],
      first: 'START GATE', stands: true, comp: true,
      light: { sky: [0.5, 0.54, 0.62], ground: [0.32, 0.33, 0.37], sunDir: norm3([0.3, 0.75, 0.55]), sun: [0.32, 0.32, 0.32], fog: [0.78, 0.81, 0.86], rim: [0.22, 0.24, 0.28], snow: [0.93, 0.94, 0.97], powder: [0.92, 0.93, 0.97] },
      sky: { zen: [0.5, 0.55, 0.64], hor: [0.8, 0.83, 0.88], dir: norm3([0.3, 0.6, 0.7]), col: [0.95, 0.94, 0.9], disk: 0.9998, glow: [5, 0.18, 80, 0.2], aurora: 0, cloudDark: [0.62, 0.65, 0.72], cloudLit: [0.9, 0.91, 0.94], clouds: 0.95, stars: 0 },
      lamps: null, banners: true, bannerCols: [[0.1, 0.75, 0.7], [0.95, 0.95, 0.98], [0.2, 0.45, 0.95], [0.95, 0.35, 0.3], [0.55, 0.8, 0.25]],
      boxCol: [0.12, 0.7, 0.66], railCol: [0.82, 0.85, 0.9],
      trees: { near: 0.85, far: 0.95, snow: 1.1, green: [0.08, 0.17, 0.12] },
      fogNear: 70, fogFar: 520,
      snowfall: 0.55, nets: true, shadows: true,
      mtn: { dark: [0.48, 0.52, 0.6], cap: [0.95, 0.96, 0.98], k: [0.7, 0.35] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 14000, t: 'Score 14,000' }, { k: 'perfects', v: 4, t: 'Land 4 perfect landings' }],
      card: 'linear-gradient(180deg,#6f7b8f 0%,#a9b6c8 55%,#f2f5f9 100%)', accent: '#15c2b0',
    },
    // ---- Youth Olympic Games parks: short and tight, a feature every few seconds
    yog12: {
      id: 'yog12', name: 'Innsbruck 2012 Youth Park', time: 'SUNNY DAY', diff: 'MEDIUM', oly: true,
      sub: 'The first Youth Olympic slopestyle, above the trees in the Tyrolean Alps: log slides, a stair set, a step-up and a tight kicker line, all packed close together.',
      half: 22, curve: [6, 300, 3, 140], slope: 0.22, alt: 2020, length: 850,
      firstType: 'yogStart', firstLen: 70,
      zones: [Z('LOG GARDEN', 'yog', 115, { c: 12, s: 0 }), Z('STEP-UP GARDEN', 'yog', 125, { c: 12, s: 1 }), Z('KICKER LINE', 'yog', 120, { c: 12, s: 2, j: 1 }),
        Z('RAIL TIER', 'yog', 115, { c: 12, s: 3 }), Z('BIG LINE · 18 M', 'yog', 150, { c: 12, s: 4, j: 1 })],
      first: 'START GATE', stands: true, comp: true,
      light: { sky: [0.36, 0.45, 0.64], ground: [0.27, 0.27, 0.31], sunDir: norm3([-0.35, 0.55, 0.76]), sun: [0.66, 0.62, 0.54], fog: [0.76, 0.84, 0.95], rim: [0.26, 0.3, 0.38], snow: [0.92, 0.94, 0.97], powder: [0.88, 0.91, 0.97] },
      sky: { zen: [0.08, 0.3, 0.8], hor: [0.66, 0.8, 0.96], dir: norm3([-0.35, 0.55, 0.76]), col: [1.0, 0.96, 0.84], disk: 0.9993, glow: [8, 0.34, 120, 0.6], aurora: 0, cloudDark: [0.74, 0.8, 0.9], cloudLit: [1, 1, 1], clouds: 0.35, stars: 0 },
      lamps: null, banners: true, bannerCols: [[0.9, 0.12, 0.18], [0.98, 0.98, 1.0], [0.15, 0.55, 0.95], [1.0, 0.72, 0.1], [0.2, 0.7, 0.4]],
      boxCol: [0.98, 0.6, 0.1], railCol: [0.82, 0.85, 0.92],
      trees: { near: 0.3, far: 0.45, snow: 0.9, green: [0.08, 0.17, 0.12] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.42, 0.46, 0.56], cap: [0.97, 0.98, 1.0], k: [0.68, 0.38] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 10000, t: 'Score 10,000' }, { k: 'grind', v: 5, t: 'Grind for 5 seconds in total' }],
      card: 'linear-gradient(180deg,#1556c9 0%,#6fa9ee 55%,#f4f8ff 100%)', accent: '#ff9a1a',
    },
    yog20: {
      id: 'yog20', name: 'Lausanne 2020 Youth Park', time: 'WINDY DAY', diff: 'MEDIUM', oly: true,
      sub: 'Leysin Park & Pipe above Lake Geneva: gaps to rails and boxes, step-ups, step-downs and a nine-stair, with a big step-down to finish. Red and white everywhere.',
      half: 22, curve: [6, 300, 3, 140], slope: 0.22, alt: 1850, length: 840,
      firstType: 'yogStart', firstLen: 70,
      zones: [Z('GAP GARDEN', 'yog', 115, { c: 20, s: 0 }), Z('STEP-UPS', 'yog', 120, { c: 20, s: 1, j: 1 }), Z('NINE-STAIR', 'yog', 115, { c: 20, s: 2 }),
        Z('TWIN KICKERS', 'yog', 130, { c: 20, s: 3, j: 1 }), Z('BIG STEP-DOWN', 'yog', 130, { c: 20, s: 4, j: 1 })],
      first: 'START GATE', stands: true, comp: true,
      light: { sky: [0.46, 0.5, 0.6], ground: [0.3, 0.31, 0.35], sunDir: norm3([0.45, 0.6, 0.66]), sun: [0.46, 0.45, 0.42], fog: [0.74, 0.78, 0.86], rim: [0.24, 0.26, 0.32], snow: [0.93, 0.94, 0.97], powder: [0.9, 0.92, 0.97] },
      sky: { zen: [0.24, 0.38, 0.62], hor: [0.76, 0.8, 0.88], dir: norm3([0.45, 0.6, 0.66]), col: [1.0, 0.97, 0.9], disk: 0.9995, glow: [6, 0.24, 100, 0.35], aurora: 0, cloudDark: [0.6, 0.64, 0.72], cloudLit: [0.96, 0.97, 1.0], clouds: 0.85, stars: 0 },
      lamps: null, banners: true, bannerCols: [[0.88, 0.1, 0.14], [0.98, 0.98, 1.0], [0.88, 0.1, 0.14], [0.2, 0.3, 0.55], [0.98, 0.98, 1.0]],
      boxCol: [0.88, 0.12, 0.16], railCol: [0.84, 0.86, 0.9],
      trees: { near: 0.8, far: 0.9, snow: 0.9, green: [0.08, 0.17, 0.12] },
      fogNear: 80, fogFar: 600,
      snowfall: 0.3, nets: true, shadows: true,
      mtn: { dark: [0.4, 0.44, 0.52], cap: [0.92, 0.94, 0.97], k: [0.6, 0.4] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 10000, t: 'Score 10,000' }, { k: 'perfects', v: 5, t: 'Land 5 perfect landings' }],
      card: 'linear-gradient(180deg,#4d6283 0%,#9eb0c8 55%,#f2f4f8 100%)', accent: '#e8202a',
    },
    yog24: {
      id: 'yog24', name: 'Gangwon 2024 Youth Park', time: 'COLD AND CLEAR', diff: 'MEDIUM', oly: true,
      sub: 'Welli Hilli Park in Korea under a low winter sun: two pyramid funboxes, wave boxes, stair sets and step-downs, then quarterpipe side hits and a big line.',
      half: 24, curve: [6, 300, 3, 140], slope: 0.22, alt: 1050, length: 840,
      firstType: 'yogStart', firstLen: 70,
      zones: [Z('FUNBOX', 'yog', 115, { c: 24, s: 0 }), Z('STEP-UP LINE', 'yog', 110, { c: 24, s: 1, j: 1 }), Z('PYRAMID PARK', 'yog', 120, { c: 24, s: 2 }),
        Z('KICKER LINE', 'yog', 120, { c: 24, s: 3, j: 1 }), Z('BIG LINE · 18 M', 'yog', 150, { c: 24, s: 4, j: 1 })],
      first: 'START GATE', stands: true, comp: true,
      light: { sky: [0.34, 0.42, 0.62], ground: [0.26, 0.26, 0.32], sunDir: norm3([0.62, 0.38, 0.68]), sun: [0.72, 0.62, 0.5], fog: [0.74, 0.8, 0.94], rim: [0.3, 0.3, 0.4], snow: [0.92, 0.94, 0.98], powder: [0.88, 0.91, 0.98] },
      sky: { zen: [0.06, 0.24, 0.72], hor: [0.74, 0.8, 0.95], dir: norm3([0.62, 0.38, 0.68]), col: [1.0, 0.92, 0.78], disk: 0.9993, glow: [7, 0.36, 110, 0.6], aurora: 0, cloudDark: [0.7, 0.74, 0.88], cloudLit: [1.0, 0.98, 0.95], clouds: 0.25, stars: 0 },
      lamps: null, banners: true, bannerCols: [[0.1, 0.65, 0.85], [0.95, 0.3, 0.55], [0.98, 0.98, 1.0], [0.25, 0.35, 0.9], [1.0, 0.8, 0.15]],
      boxCol: [0.12, 0.66, 0.86], railCol: [0.82, 0.85, 0.92],
      trees: { near: 0.9, far: 1.0, snow: 0.5, green: [0.07, 0.15, 0.11] },
      snowfall: 0, nets: true, shadows: true,
      mtn: { dark: [0.3, 0.34, 0.46], cap: [0.86, 0.9, 0.97], k: [0.45, 0.5] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 10000, t: 'Score 10,000' }, { k: 'air', v: 2.5, t: 'Stay in the air for 2.5 seconds' }],
      card: 'linear-gradient(180deg,#0b3aa8 0%,#5b97ea 55%,#ffe9f1 100%)', accent: '#1fb8e0',
    },
    // Pine Valley: a sunny resort run from the top of the chairlift down into the village (switched off for now)
    resort: {
      id: 'resort', name: 'Pine Valley', time: 'BLUEBIRD', diff: 'MEDIUM', resort: true,
      sub: 'Top of the chair to the bottom of the village. Side hits off Lynx, the Traverse, bumps under the hut, Wolf Ridge, Pete\'s Park and Main Street.',
      half: 22, curve: [30, 250, 11, 92], slope: 0.215, alt: 2480, length: 2520,
      zones: [Z('LYNX · BLUE 4', 'sidehits', 400), Z('THE TRAVERSE', 'cattrack', 250), Z('HUT BUMPS', 'moguls', 230),
        Z('WOLF RIDGE · RED 7', 'sidehits', 380, { red: true }), Z('PETE\'S PARK', 'funpark', 380), Z('MAIN STREET', 'village', 660)],
      first: 'TOP STATION', firstLen: 220,
      light: { sky: [0.38, 0.46, 0.64], ground: [0.27, 0.28, 0.33], sunDir: norm3([-0.42, 0.55, 0.72]), sun: [0.68, 0.64, 0.55], fog: [0.74, 0.84, 0.96], rim: [0.26, 0.3, 0.38], snow: [0.92, 0.94, 0.98], powder: [0.88, 0.91, 0.97] },
      sky: { zen: [0.07, 0.33, 0.82], hor: [0.66, 0.82, 0.97], dir: norm3([-0.42, 0.55, 0.72]), col: [1.0, 0.95, 0.82], disk: 0.9993, glow: [8, 0.35, 120, 0.6], aurora: 0, cloudDark: [0.72, 0.78, 0.9], cloudLit: [1.0, 1.0, 1.0], clouds: 0.55, stars: 0 },
      lamps: null,
      trees: { near: 0.85, far: 0.95, snow: 0.75, green: [0.08, 0.22, 0.14] },
      snowfall: 0, nets: false, shadows: true,
      mtn: { dark: [0.36, 0.46, 0.66], cap: [0.96, 0.98, 1.0], k: [0.6, 0.45] },
      goals: [{ k: 'finish', t: 'Finish the run' }, { k: 'score', v: 10000, t: 'Score 10,000' }, { k: 'perfects', v: 6, t: 'Land 6 perfect landings' }],
      card: 'linear-gradient(180deg,#1660d8 0%,#62a8f2 55%,#e6f2ff 100%)', accent: '#ff5a36',
    },
  };
  SS.MAPS = MAPS;
  // every mountain that's built (their order seeds the courses, so it never changes) ...
  SS.ALL_MAP_IDS = ['night', 'bluebird', 'sunset', 'woods', 'cave', 'bigair', 'railking', 'triple', 'slopestyle', 'jumpline', 'cliffs', 'neon', 'bigairfinal', 'superpipe', 'sbx', 'slopequal', 'oly14', 'oly18', 'oly22', 'oly26', 'yog12', 'yog20', 'yog24', 'resort'];
  // ... and the ones you can ride: just Sundown Park for now
  SS.MAP_IDS = ['slopestyle'];
  // the courses built like the ones at the Games get an OLYMPIC STYLE badge
  for (const id of ['slopestyle', 'slopequal', 'bigairfinal', 'superpipe', 'sbx']) MAPS[id].oly = true;
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
      this.rnd = mulberry32((this.seed || 1) ^ (SS.ALL_MAP_IDS.indexOf(this.mapId) * 0x9e3779b1));
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
        const zq = this.zoneAt(z), t = zq.type;
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
        // the resort run: a flat cat track you have to carry speed through, steeper moguls and red run
        else if (t === 'cattrack') s = 0.12;
        else if (t === 'moguls') s += 0.05;
        else if (t === 'sidehits' && zq.opt && zq.opt.red) s += 0.045;
        else if (t === 'village') s -= 0.05;
        else if (t === 'funpark') s -= 0.015;
        if (z < 30) s = lerp(0.1, s, clamp((z + 30) / 60, 0, 1));
        if (z > C.LENGTH + 10) s = lerp(s, 0.025, clamp((z - C.LENGTH - 10) / 70, 0, 1));
        slope[i] = s;
        amp[i] = t === 'cattrack' || t === 'moguls' ? 0.03 : t === 'village' ? 0.08 : t === 'sidehits' ? 0.3 : t === 'rollers' ? 1.7 : t === 'whoops' ? 0.85 : t === 'summit' ? 0.35 : t === 'finish' || t === 'yog' || t === 'yogStart' ? 0.1 : t === 'giant' || t === 'tower' || t === 'pipe' ? 0.02 : 0.18;
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
      // the resort run: how much cat track, mogul field and village there is at each metre
      this.catArr = this.mogArr = this.vilArr = null;
      if (this.map.resort) {
        const zoneK = (type, ramp, open) => {
          const a = new Float32Array(n);
          for (let i = 0; i < n; i++) {
            const z = C.Z0 + i;
            let v = 0;
            for (const zn of this.zones) if (zn.type === type) v = Math.max(v, smooth(clamp((z - zn.z0) / ramp, 0, 1)) * (open ? 1 : smooth(clamp((zn.z1 - z) / ramp, 0, 1))));
            a[i] = v;
          }
          return a;
        };
        this.catArr = zoneK('cattrack', 34);
        this.mogArr = zoneK('moguls', 26);
        this.vilArr = zoneK('village', 90, true);
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
      let vk = 0;
      if (this.catArr) {
        // the cat track: a flat lane down the middle, banked walls curling up to the piste edges
        const ck = this.sample(this.catArr, z);
        if (ck > 0.001) {
          const q = clamp((Math.abs(off) - 5.5) / (C.HALF - 5.5), 0, 1);
          y += ck * Math.pow(q, 1.6) * 4.6;
        }
        // moguls: staggered bumps about 9 m apart in diagonal lines, only on the piste
        const mk = this.sample(this.mogArr, z);
        if (mk > 0.001 && e < 3) {
          const u = off * 0.7 + z * 0.35, v = z * 0.7 - off * 0.28;
          y += mk * (e < 0 ? 1 : 1 - e / 3) * 0.46 * (Math.sin(u) * Math.sin(v) + 0.2 * Math.sin(u * 0.5 + 1.3));
        }
        vk = this.sample(this.vilArr, z);
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
        // in the village the valley floor opens out into gentle terraces for the chalets
        const vf = vk > 0 ? 1 - vk * 0.78 * (eb < 45 ? 1 : Math.max(0, 1 - (eb - 45) / 40)) : 1;
        y += vf * (lerp(steep, 0.13, ck) * ee * ee + (eb > 38 ? (eb - 38) * wall * lerp(steep / 0.05, 1, ck) : 0));
        const k1 = Math.min(1, eb / 15) * (1 - ck * 0.7) * vf;
        y += k1 * (4 * Math.sin(x * 0.045 + z * 0.02) + 2.5 * Math.sin(z * 0.07 + x * 0.03));
        // ridges and gullies running down the banks, and big shoulders further out
        y += vf * Math.min(1, eb / 22) * (1 - ck) * 2.6 * Math.sin(x * 0.12 + z * 0.045) * Math.sin(z * 0.031 - x * 0.017 + sd);
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
      if (f.fn) return f.fn(x, z);
      const u = z - f.z0;
      if (u < 0 || u > f.len) return 0;
      const dxs = x - (this.center(z) + f.off), dx = Math.abs(dxs);
      const ew = f.ew || 2.5;
      if (dx >= f.w + ew) return 0;
      const lat = dx <= f.w ? 1 : smooth(1 - (dx - f.w) / ew);
      let p;
      if (u < f.Lu) {
        const q = u / f.Lu;
        if (f.sh === 'd') {
          // step-down: an easy ramp up onto a deck, then a short kick at the end of it
          const dk = f.Lu - f.Lk;
          p = u < f.Lr ? f.Hd * (1 - (1 - u / f.Lr) ** 2) : u < dk ? f.Hd : f.Hd + (f.Hk - f.Hd) * Math.pow((u - dk) / f.Lk, 1.7);
        }
        // 's': rounded hump; 'q': deck ramp, steepest at the bottom and easing out, so it never throws you at the top
        else p = f.sh === 's' ? f.Hk * smooth(q) : f.sh === 'q' ? f.Hk * (1 - (1 - q) * (1 - q)) : f.Hk * Math.pow(q, f.pe || 1.7);
      }
      else if (u < f.Lu + f.Lt) {
        if (f.sh === 'u') {
          // step-up: the gap dips down to a wall, and you land on the raised table beyond it
          const g = u - f.Lu;
          if (g < f.Lg) { const k = g / f.Lg; p = k < 0.5 ? lerp(f.Hk, 0.5, smooth(k * 2)) : lerp(0.5, f.Ht, smooth(k * 2 - 1)); }
          else p = f.Ht + (f.lv || 0) * (g - f.Lg);
        } else p = f.Hk + (f.lv || 0) * (u - f.Lu);
      }
      else {
        const top = f.sh === 'u' ? f.Ht + (f.lv || 0) * (f.Lt - f.Lg) : f.Hk + (f.lv || 0) * f.Lt;
        const v = u - f.Lu - f.Lt;
        if (f.stairs) {
          // a stair set: level treads and equal risers all the way down to the snow
          const k = Math.min(f.stairs - 1, Math.floor((v * f.stairs) / f.Ll));
          p = top - f.rise * (k + 1) + f.gs * v;
        } else if (f.lin) p = top * (1 - v / f.Ll);
        else p = top * 0.5 * (1 + Math.cos(Math.PI * (v / f.Ll)));
      }
      // skew jumps: one side of the lip is built higher than the other
      if (f.tw) p *= 1 + f.tw * clamp(dxs / f.w, -1, 1);
      return p * lat;
    }

    // height of a rail's top at distance t along it (kinked rails follow their own points)
    railY(f, t) {
      const p = f.pts;
      if (p) {
        if (t <= 0) return p[0][1];
        for (let i = 1; i < p.length; i++) if (t <= p[i][0]) { const a = p[i - 1], b = p[i]; return a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]); }
        return p[p.length - 1][1];
      }
      const k = t / f.len;
      return lerp(f.g0, f.g1, k) + f.h + (f.arch ? f.arch * Math.sin(Math.PI * k) : 0);
    }
    // how steeply the rail climbs (+) or drops (-) per metre at t
    railDY(f, t) {
      const p = f.pts;
      if (p) {
        for (let i = 1; i < p.length; i++) if (t <= p[i][0] || i === p.length - 1) { const a = p[i - 1], b = p[i]; return (b[1] - a[1]) / (b[0] - a[0]); }
      }
      return (f.g1 - f.g0) / f.len + (f.arch ? ((f.arch * Math.PI) / f.len) * Math.cos((Math.PI * clamp(t, 0, f.len)) / f.len) : 0);
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
      for (let i = 0; i < b.length; i++) {
        const f = b[i];
        if (f.kind !== 'kicker') continue;
        const h = this.kickerH(f, x, z);
        if (h > 0.001) {
          y += h;
          this.surf = 1;
          this.surfRef = f;
        }
      }
      // rails and boxes stand on the snow or on the deck under them
      const g = y;
      for (let i = 0; i < b.length; i++) {
        const f = b[i];
        if (f.kind === 'rail') {
          const rx = x - f.ax, rz = z - f.az;
          const t = rx * f.dx + rz * f.dz;
          if (t < -f.ramp || t > f.len) continue;
          const lat = Math.abs(rx * f.dz - rz * f.dx);
          // the entry ramp catches you a little off-line too (the grind then centres you)
          if (lat > (t < 0.6 ? f.w + 0.35 : f.w)) continue;
          let top;
          if (t >= 0) top = Math.max(this.railY(f, t), g + 0.25);
          else top = g + ((this.railY(f, 0) - g) * (t + f.ramp)) / f.ramp;
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

      const kicker = (z0, off, size, extra) => {
        const k = extra ? { ...KICK[size], ...extra } : KICK[size];
        const f = { kind: 'kicker', size, z0, off, ...k, len: k.Lu + k.Lt + k.Ll };
        this.features.push(f);
        const lipZ = z0 + k.Lu;
        if (!NOT_JUMP[size] && !k.noFlags) for (const s of [-1, 1]) this.flags.push({ x: this.center(lipZ) + off + s * (k.w * (1 + Math.abs(k.tw || 0)) + 1.4), z: lipZ });
        return f;
      };
      // ---- Olympic course building blocks
      // snow surface including the decks placed so far (rails start on them)
      const surfAt = (x, z) => {
        let y = this.ground(x, z);
        for (const f of this.features) if (f.kind === 'kicker') y += this.kickerH(f, x, z);
        return y;
      };
      // a snow deck or ledge: ramp up, a table, then a drop. lv makes the table level instead of following the slope
      const deck = (z0, off, H, top, w, o) => kicker(z0, off, 'D', { Hk: H, Lt: top, w, sh: 'q', Lu: Math.max(7, H * 4.5), ...(o || {}) });
      // a rail or box made of straight pieces: each piece is [length, pitch], where pitch is how much steeper (+)
      // or flatter (-) than the slope it runs, 'f' for dead flat and 'u' for climbing. It starts h above the surface.
      const srail = (z, off, segs, o) => {
        o = o || {};
        const type = o.type || 'rail', isBox = type === 'box';
        const est = segs.reduce((a, q) => a + q[0], 0);
        const zMid = z + est / 2;
        const ang = Math.atan((this.center(zMid + 1) - this.center(zMid - 1)) / 2) + (o.yaw || 0);
        const dx = Math.sin(ang), dz = Math.cos(ang);
        const ax = this.center(z) + off, az = z;
        const gs = (this.ground(ax, az) - this.ground(ax + dx * est, az + dz * est)) / est;
        const s0 = surfAt(ax, az);
        const h = o.h !== undefined ? o.h : isBox ? 0.5 : 0.75;
        let y = s0 + h, t = 0;
        const pts = [[0, y]];
        segs.forEach(([L, pq], i) => {
          let pa = pq === 'f' ? 0 : pq === 'u' ? -0.14 : gs + pq;
          // the first piece never cuts down into the deck it starts on
          if (i === 0 && typeof pq === 'number' && o.table) pa = Math.min(pa, gs + (h - 0.32) / Math.min(L, o.table));
          // the last downhill piece lands about 0.6 m above the snow, whatever came before
          if (i === segs.length - 1 && i > 0 && typeof pq === 'number' && o.fit !== false) {
            const xe = ax + dx * (t + L), ze = az + dz * (t + L);
            pa = (y - (this.ground(xe, ze) + (o.end || 0.6))) / L;
          }
          t += L;
          y -= pa * L;
          pts.push([t, y]);
        });
        const ramp = o.ramp !== undefined ? o.ramp : isBox ? 2.4 : 0;
        const f = {
          kind: 'rail', type, ax, az, dx, dz, len: t, ang, pts, h,
          w: o.w || (isBox ? 0.42 : 0.34), ramp, z0: az - ramp, z1: az + dz * t,
          label: o.label || '', style: o.style || '', g0: s0, g1: surfAt(ax + dx * t, az + dz * t),
        };
        this.features.push(f);
        return f;
      };
      // relative pitches for a rainbow (or half of one): rise metres over L metres in n pieces
      const arc = (L, rise, n, from, to) => {
        const out = [];
        from = from || 0; to = to || 1;
        for (let i = 0; i < n; i++) {
          const a = from + ((to - from) * i) / n, b = from + ((to - from) * (i + 1)) / n;
          const ya = rise * Math.sin(Math.PI * a), yb = rise * Math.sin(Math.PI * b);
          out.push([(L * (b - a)), -(yb - ya) / (L * (b - a))]);
        }
        return out;
      };
      // a skate-style bowl built up out of snow: open at the top to drop in, walls round the sides, a gap out the bottom
      const bowl = (zc, off, rx, rz, Hw) => {
        const f = { kind: 'kicker', size: 'B', z0: zc - rz * 1.34, off, w: rx * 1.34 - 2.3, Hk: Hw, Lu: -99, Lt: 0, Ll: 1, len: rz * 2.68, aiSkip: true, ring: { zc, rx, rz } };
        f.fn = (x, z) => {
          if (z < f.z0 || z > f.z0 + f.len) return 0;
          const ex = (x - (this.center(z) + off)) / rx, ez = (z - zc) / rz;
          const rr = Math.hypot(ex, ez);
          if (rr >= 1.32) return 0;
          const aa = Math.abs(Math.atan2(ex, -ez));
          const gate = smooth(clamp((aa - 0.55) / 0.5, 0, 1)) * smooth(clamp((Math.PI - 0.45 - aa) / 0.4, 0, 1));
          if (gate <= 0) return 0;
          let p;
          if (rr < 0.42) p = 0;
          else if (rr < 1) { const q = (rr - 0.42) / 0.58; p = Hw * q * q; }
          else p = Hw * (1 - smooth((rr - 1) / 0.32));
          return p * gate;
        };
        this.features.push(f);
        return f;
      };
      this.props = [];
      const prop = (o) => { this.props.push(o); return o; };
      const solid = (x, z, rad, top) => this.colliders.push({ x, z, r: rad, top: top === undefined ? 1e4 : top });
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

      // ---- the Olympic slopestyle courses, laid out section by section like the real ones (+ off is the rider's right)
      const slopeAt = (off, z, L) => (this.ground(this.center(z) + off, z) - this.ground(this.center(z + L) + off, z + L)) / L;
      // a deck with a rail on it: the rail starts a little way onto the table, so there's room to pop
      const deckRail = (z, off, H, top, w, segs, o, dOpt) => {
        const d = deck(z, off, H, top + 0.8, w, dOpt);
        return srail(z + d.Lu + 1.4, off, segs, { table: top - 0.6, ...(o || {}) });
      };
      const DFD = [[3.5, 0.06], [4, 'f'], [4, 0.4]];
      // a little kicker that sends you onto a rail or box: its in-run speed is checked to put you a couple of metres along it
      const gap = (k, r) => { k.gap = r; k.tu = r.az - k.z0 + 2; return r; };
      // ---- park features for the compact youth-games courses
      // step-up: pop over the dip and land on a table that stands higher than the lip
      const stepUp = (z, off, o) => {
        o = o || {};
        const Hk = o.Hk || 1.4, Lu = o.Lu || 6, Lg = o.Lg || 4.5, tab = o.tab || 7, Ll = o.Ll || 11;
        const sl = slopeAt(off, z + Lu, Lg + tab);
        const Ht = Hk + sl * Lg + (o.up || 0.7);
        return kicker(z, off, 'SU', { Hk, Lu, Lg, Ht, Lt: Lg + tab, Ll, w: o.w || 3, lv: sl * 0.45, tu: Lu + Lg + 3.6 });
      };
      // step-down: up onto a deck, off the kick at its end, down a long landing
      const stepDown = (z, off, o) => kicker(z, off, 'SD', o);
      // a stair set off the end of a deck, with handrails down one or both sides (rails: -1 left, 1 right)
      const stairSet = (z, off, H, top, n, tread, w, rails) => {
        const Lu = Math.max(7, H * 4.5), Ll = n * tread;
        const gs = slopeAt(off, z + Lu + top, Ll);
        const d = deck(z, off, H, top, w, { Ll, stairs: n, gs, rise: (H + gs * Ll) / (n + 1) });
        for (const sd of rails || []) srail(z + Lu + top - 1.8, off + sd * (w - 0.45), [[1.8, 'f'], [Ll + 1.2, 0.3]], { h: 0.8, end: 0.7, label: 'HANDRAIL' });
        return d;
      };
      // two rails side by side off one deck, one high and one low
      const doubleBarrel = (z, off, H, top, L) => {
        const d = deck(z, off, H, top + 0.8, 2.2);
        for (const [o, h] of [[-0.6, 0.6], [0.6, 0.85]]) srail(z + d.Lu + 1.4, off + o, [[2.5, 0.03], [L, 0.2]], { table: top - 0.6, h, label: 'DOUBLE BARREL' });
        return d;
      };
      // a pyramid funbox: straight ramps up and down with a flat top, and a box over the whole thing
      const pyramid = (z, off, H, top, w) => {
        const Lu = H * 4.5, Ll = H * 4.5;
        const d = kicker(z, off, 'D', { Hk: H, Lu, Lt: top, Ll, w, sh: 'lin', pe: 1, lin: true, ride: true });
        srail(z + 1.2, off, [[Lu - 1.2, -H / Lu], [top, 0], [Ll - 0.6, H / Ll]], { type: 'box', h: 0.3, w: 0.45, ramp: 1.0, fit: false, label: 'PYRAMID BOX' });
        return d;
      };
      const gapRail = (z, off, len, o) => gap(kicker(z, off, 'GK'), srail(z + 10, off, [[len, 0.015]], { h: 0.8, label: 'GAP TO RAIL', ...(o || {}) }));
      const gapBox = (z, off, len) => gap(kicker(z, off, 'GK'), srail(z + 9, off, [[len, 0]], { type: 'box', h: 0.6, ramp: 1.2, label: 'GAP TO BOX' }));
      const LOG = { type: 'box', style: 'log', w: 0.42, h: 0.55, ramp: 1.8 };
      const WAVE = [...arc(7, 0.6, 4), ...arc(7, 0.6, 4)];
      const AFRAME = [[3.5, 'u'], [2, 'f'], [4.5, 0.3]];
      const UFD = [[2.5, 'u'], [3, 'f'], [4, 0.4]];
      // Youth Olympic Games slopestyle, built in the style of each park with everything packed close together
      // (+ off is the rider's right; the lanes are about 11 m apart)
      const yog = (c, sec, z0) => {
        if (c === 12) {
          // Innsbruck 2012, Kühtai: high in the Tyrolean Alps, with log slides
          if (sec === 0) {
            srail(z0 + 12, -11, [[12, 0]], { ...LOG, label: 'LOG SLIDE' });
            deckRail(z0 + 6, 0, 1.2, 3, 1.6, [[3, 0.04], [9, 0.22]], { label: 'DOWN RAIL' });
            srail(z0 + 14, 11, AFRAME, { type: 'box', h: 0.45, label: 'A-FRAME BOX' });
            stairSet(z0 + 40, -11, 1.6, 3, 7, 0.9, 3, [1]);
            srail(z0 + 46, 0, WAVE, { type: 'box', h: 0.45, fit: false, label: 'WAVE BOX' });
            doubleBarrel(z0 + 40, 11, 1.0, 3, 10);
            gapRail(z0 + 74, -11, 12);
            deckRail(z0 + 76, 0, 0.9, 4.5, 1.6, [[4, 'f'], [8, 0.25]], { label: 'FLAT-DOWN RAIL' });
            srail(z0 + 80, 11, [[14, 0]], { ...LOG, label: 'LONG LOG' });
            prop({ type: 'wallride', off: 19.5, z: z0 + 70, len: 12, h: 3.2 });
          } else if (sec === 1) {
            deckRail(z0 + 8, -11, 1.0, 2.5, 1.6, [...arc(8, 0.8, 5, 0, 0.5), [6, 0.3]], { label: 'RAINBOW TO DOWN' });
            stepUp(z0 + 8, 0);
            stairSet(z0 + 8, 11, 1.8, 3, 8, 0.9, 3.2, [-1, 1]);
            stepDown(z0 + 48, -11);
            kicker(z0 + 52, 0, 'M');
            srail(z0 + 52, 11, [[6, 0], [7, 0.2]], { ...LOG, label: 'KINKED LOG' });
            gapBox(z0 + 88, -11, 12);
            srail(z0 + 98, 0, UFD, { type: 'box', h: 0.4, label: 'UP-FLAT-DOWN BOX' });
            kicker(z0 + 90, 11, 'S');
          } else if (sec === 2) {
            kicker(z0 + 8, 0, 'L');
            kicker(z0 + 12, -12, 'M');
            kicker(z0 + 12, 12, 'M');
            stepUp(z0 + 64, -12);
            kicker(z0 + 66, 0, 'L');
            stepDown(z0 + 62, 12);
          } else if (sec === 3) {
            deckRail(z0 + 8, -11, 1.5, 3, 1.6, DFD, { label: 'DOWN-FLAT-DOWN RAIL' });
            gapBox(z0 + 8, 0, 12);
            srail(z0 + 12, 11, arc(14, 1.1, 7), { type: 'box', h: 0.45, fit: false, label: 'RAINBOW BOX' });
            srail(z0 + 48, -11, [[2, 'u'], [3, 'f'], [3.5, 0.4]], { h: 0.55, label: 'TRAPEZOID RAIL' });
            stairSet(z0 + 42, 0, 1.6, 3, 7, 0.9, 3, [-1, 1]);
            doubleBarrel(z0 + 42, 11, 1.0, 3, 10);
            prop({ type: 'wallride', off: -19.5, z: z0 + 44, len: 12, h: 3.2 });
            srail(z0 + 82, -11, [[6, 0], [7, 0.2]], { ...LOG, label: 'KINKED LOG' });
            deckRail(z0 + 78, 0, 1.4, 2.5, 1.6, [[2.5, 0.03], [8, 0.28]], { type: 'box', style: 'mail', w: 0.5, h: 0.5, ramp: 0, label: 'DOWN MAILBOX' });
            gapRail(z0 + 78, 11, 12);
          } else {
            kicker(z0 + 6, 0, 'J15');
            kicker(z0 + 10, -12.5, 'M');
            kicker(z0 + 10, 12.5, 'M');
            kicker(z0 + 74, 0, 'J18', { w: 4.4 });
            kicker(z0 + 84, -13, 'M');
            kicker(z0 + 84, 13, 'M');
          }
        } else if (c === 20) {
          // Lausanne 2020, Leysin Park & Pipe: gaps, step-ups and step-downs, Swiss red and white
          if (sec === 0) {
            gapRail(z0 + 8, -11, 12);
            stepUp(z0 + 6, 0, { Hk: 1.2, Lg: 4, tab: 6, Ll: 10, w: 2.6 });
            deckRail(z0 + 8, 11, 1.4, 3, 1.6, [[3, 0.03], [10, 0.18]], { label: 'DOWN RAIL' });
            stairSet(z0 + 42, -11, 1.8, 3, 8, 0.9, 3.2, [1]);
            srail(z0 + 50, 0, AFRAME, { type: 'box', h: 0.45, label: 'A-FRAME BOX' });
            gapBox(z0 + 44, 11, 13);
            srail(z0 + 82, -11, [...arc(8, 0.9, 5, 0, 0.5), [6, 0.35]], { h: 0.6, label: 'RAINBOW TO DOWN' });
            stepDown(z0 + 76, 0);
            doubleBarrel(z0 + 78, 11, 1.0, 3, 10);
          } else if (sec === 1) {
            kicker(z0 + 10, -12, 'M');
            stepUp(z0 + 8, 0, { w: 3.4 });
            kicker(z0 + 10, 12, 'M');
            stepUp(z0 + 62, -12);
            stepDown(z0 + 60, 0, { Hd: 2.2, Hk: 2.8, Lu: 14, Ll: 18, w: 3.4 });
            stepUp(z0 + 62, 12);
          } else if (sec === 2) {
            deckRail(z0 + 8, -11, 1.3, 3, 1.6, DFD, { label: 'DOWN-FLAT-DOWN RAIL' });
            stairSet(z0 + 6, 0, 2.0, 3, 9, 0.9, 3.4, [-1, 1]);
            srail(z0 + 12, 11, [[16, 0]], { type: 'box', w: 0.5, label: 'LONG BOX', style: 'clean' });
            gapRail(z0 + 42, -11, 12);
            srail(z0 + 44, 0, arc(16, 1.3, 8), { type: 'box', h: 0.45, w: 0.55, fit: false, label: 'RAINBOW BOX', style: 'clean' });
            deckRail(z0 + 42, 11, 0.9, 4.5, 1.6, [[4, 'f'], [8, 0.25]], { type: 'box', style: 'mail', w: 0.5, h: 0.5, ramp: 0, label: 'FLAT-DOWN MAILBOX' });
            prop({ type: 'wallride', off: -19.5, z: z0 + 40, len: 12, h: 3.2 });
            srail(z0 + 82, -11, UFD, { h: 0.55, label: 'UP-FLAT-DOWN RAIL' });
            deckRail(z0 + 78, 0, 1.8, 2, 1.6, [[2, 0.03], [8, 0.28]], { h: 0.75, label: 'HIGH DOWN BAR', style: 'bar' });
            kicker(z0 + 80, 12, 'S');
          } else if (sec === 3) {
            kicker(z0 + 8, -6.5, 'L', { w: 3 });
            kicker(z0 + 8, 6.5, 'L', { w: 3 });
            kicker(z0 + 22, -19.5, 'Q', { w: 2.2, ew: 1.4 });
            kicker(z0 + 22, 19.5, 'Q', { w: 2.2, ew: 1.4 });
            kicker(z0 + 66, 0, 'XL');
          } else {
            stepDown(z0 + 10, 0, { Hd: 3.0, Hk: 3.8, Lr: 9, Lk: 3, Lu: 18, Lt: 1, Ll: 26, w: 5 });
            stepUp(z0 + 14, -13, { w: 2.6 });
            stepUp(z0 + 14, 13, { w: 2.6 });
            kicker(z0 + 66, 0, 'J15', { w: 4.4 });
          }
        } else {
          // Gangwon 2024, Welli Hilli Park: a colourful Korean park with a pyramid, wave boxes and stair sets
          if (sec === 0) {
            srail(z0 + 12, -11, WAVE, { type: 'box', h: 0.45, fit: false, label: 'WAVE BOX' });
            pyramid(z0 + 8, 0, 1.6, 6, 3.4);
            deckRail(z0 + 8, 11, 1.2, 3, 1.6, [[3, 0.04], [9, 0.22]], { label: 'DOWN RAIL' });
            stairSet(z0 + 40, -11, 1.6, 3, 7, 0.9, 3, [1]);
            gapRail(z0 + 44, 0, 12);
            srail(z0 + 46, 11, arc(14, 1.1, 7), { type: 'box', h: 0.45, fit: false, label: 'RAINBOW BOX' });
            doubleBarrel(z0 + 76, -11, 1.0, 3, 10);
            srail(z0 + 82, 0, AFRAME, { type: 'box', h: 0.45, label: 'A-FRAME BOX' });
            deckRail(z0 + 78, 11, 1.5, 3, 1.6, DFD, { label: 'DOWN-FLAT-DOWN RAIL' });
            prop({ type: 'wallride', off: 21.5, z: z0 + 74, len: 12, h: 3.2 });
          } else if (sec === 1) {
            kicker(z0 + 10, -12, 'S');
            stepUp(z0 + 8, 0, { w: 3.4 });
            kicker(z0 + 10, 12, 'S');
            stepDown(z0 + 56, -12);
            kicker(z0 + 58, 0, 'M');
            stepDown(z0 + 56, 12);
          } else if (sec === 2) {
            deckRail(z0 + 10, -12, 0.9, 4.5, 1.6, [[4, 'f'], [8, 0.25]], { type: 'box', style: 'mail', w: 0.5, h: 0.5, ramp: 0, label: 'FLAT-DOWN MAILBOX' });
            pyramid(z0 + 8, 0, 2.0, 8, 4);
            srail(z0 + 12, 12, UFD, { h: 0.55, label: 'UP-FLAT-DOWN RAIL' });
            gapBox(z0 + 46, -12, 12);
            stairSet(z0 + 48, 0, 2.0, 3, 9, 0.9, 3.4, [-1, 1]);
            srail(z0 + 50, 12, [...arc(10, 1.0, 6), [4, 'f'], [5, 0.2]], { h: 0.6, label: 'RAINBOW TO FLAT-DOWN' });
            srail(z0 + 84, -12, WAVE, { type: 'box', h: 0.45, fit: false, label: 'WAVE BOX' });
            srail(z0 + 86, 0, [[16, 0]], { type: 'box', w: 0.5, label: 'LONG BOX', style: 'clean' });
            kicker(z0 + 82, 12, 'S');
          } else if (sec === 3) {
            kicker(z0 + 8, 0, 'L');
            kicker(z0 + 12, -12, 'M');
            kicker(z0 + 12, 12, 'M');
            kicker(z0 + 24, -21, 'Q', { w: 2.2, ew: 1.4 });
            kicker(z0 + 24, 21, 'Q', { w: 2.2, ew: 1.4 });
            kicker(z0 + 66, 0, 'L');
            kicker(z0 + 70, -12, 'M');
            kicker(z0 + 70, 12, 'M');
          } else {
            kicker(z0 + 8, 0, 'J18', { w: 4.4 });
            stepUp(z0 + 14, -13.5, { w: 2.6 });
            stepUp(z0 + 14, 13.5, { w: 2.6 });
            kicker(z0 + 86, 0, 'J15', { w: 4.4 });
          }
        }
      };
      const oly = (c, sec, z0) => {
        if (c === 14) {
          // Sochi 2014, Rosa Khutor: three jib sections, then three jumps that get bigger, each with a smaller jump beside it
          if (sec === 0) {
            // the very first hit: jump from a kicker onto a rail
            gap(kicker(z0 + 34, 0, 'GK'), srail(z0 + 44, 0, [[16, 0]], { h: 0.8, label: 'GAP TO RAIL' }));
            deckRail(z0 + 30, -11, 1.0, 4.8, 1.6, [[4, 'f'], [8, 0.2]], { type: 'box', h: 0.45, ramp: 0, label: 'FLAT-DOWN BOX' });
            deckRail(z0 + 30, 11, 1.6, 3, 1.6, [[3, 0.03], [10, 0.15]], { label: 'DOWN RAIL' });
          } else if (sec === 1) {
            deckRail(z0 + 36, -11, 1.3, 3, 1.6, DFD, { label: 'DOWN-FLAT-DOWN RAIL' });
            srail(z0 + 40, 0, arc(14, 1.1, 7), { type: 'box', h: 0.45, fit: false, label: 'RAINBOW BOX' });
            deckRail(z0 + 34, 11, 0.9, 4.8, 1.6, [[4, 'f'], [8, 0.25]], { label: 'FLAT-DOWN RAIL' });
          } else if (sec === 2) {
            deckRail(z0 + 34, -11, 1.8, 4, 1.6, [[3.5, 0.03], [12.5, 0.15]], { label: 'LONG DOWN RAIL' });
            srail(z0 + 40, 0, [[2.5, 'u'], [3, 'f'], [4, 0.3]], { type: 'box', h: 0.4, label: 'UP-FLAT-DOWN BOX' });
            gap(kicker(z0 + 36, 11, 'GK'), srail(z0 + 45, 11, [[14, 0]], { type: 'box', h: 0.6, ramp: 1.2, label: 'GAP TO BOX' }));
          } else if (sec === 3) {
            kicker(z0 + 50, 0, 'J18');
            kicker(z0 + 58, 14, 'J15');
          } else if (sec === 4) {
            kicker(z0 + 50, 0, 'J18');
            kicker(z0 + 58, -14, 'J15');
            // the giant nesting doll that stood by the jumps
            const dz = z0 + 50 + KICK.J18.Lu + KICK.J18.Lt + 6, dx = this.center(dz) + 19;
            prop({ type: 'doll', x: dx, z: dz, s: 1 });
            solid(dx, dz, 2.3);
          } else {
            kicker(z0 + 50, 0, 'J22');
            kicker(z0 + 58, -14, 'J19');
          }
        } else if (c === 18) {
          // PyeongChang 2018, Phoenix Park: three rail tiers (with a skate bowl), then skewed, multi-option and wedge jumps
          if (sec === 0) {
            srail(z0 + 30, 13, [[5, 0]], { type: 'box', h: 0.22, w: 1.1, ramp: 1.0, style: 'pad', label: 'BUTTER PAD' });
            deckRail(z0 + 37, 13, 1.4, 2.5, 1.6, [[2.5, 0.03], [6.5, 0.3]], { label: 'DOWN RAIL' }, { Lu: 4.5 });
            srail(z0 + 40, 0, [[2, 'u'], [3, 'f'], [3.5, 0.4]], { h: 0.55, label: 'TRAPEZOID RAIL' });
            srail(z0 + 40, -12, [...arc(10, 1.0, 6), [4, 'f'], [5, 0.2]], { h: 0.6, label: 'RAINBOW TO FLAT-DOWN' });
            prop({ type: 'wallride', off: -20.5, z: z0 + 42, len: 13, h: 3.4 });
          } else if (sec === 1) {
            // a high bar with three take-offs at different angles
            const hk = [[-3.2, -0.3], [0, 0], [3.2, 0.3]].map(([o, tw]) => kicker(z0 + 38, 13 + o, 'GK', { tw, w: 1.3 }));
            gap(hk[1], srail(z0 + 47, 13, [[7, 0]], { h: 1.7, label: 'HIGH BAR', style: 'bar' }));
            deckRail(z0 + 36, 0, 1.8, 3, 1.6, DFD, { label: 'DOWN-FLAT-DOWN RAIL' });
            // up box into an uphill closeout, then a flat-down rail
            srail(z0 + 34, -13, [[3.5, 'u']], { type: 'box', h: 0.4, label: 'UP BOX' });
            deckRail(z0 + 37.6, -13, 1.2, 4, 1.6, [[2.5, 'f'], [6, 0.3]], { h: 0.6, label: 'FLAT-DOWN RAIL' }, { Lu: 0.8 });
          } else if (sec === 2) {
            bowl(z0 + 62, 9, 7.5, 9, 2.3);
            srail(z0 + 50, 21.5, arc(14, 0.9, 6), { fit: false, label: 'CURVED RAIL' });
            prop({ type: 'wallride', off: -21.5, z: z0 + 46, len: 14, h: 3.6 });
            deckRail(z0 + 40, -6, 2.2, 2, 1.5, [[2, 0.03], [6, 0.3]], { h: 0.75, label: 'HIGH DOWN BAR' });
            deckRail(z0 + 38, -15, 0.9, 5, 1.6, [[4, 'f'], [7, 0.3]], { label: 'FLAT-DOWN RAIL' });
            // three butter boxes to set up for the jumps
            for (const o of [-9, 0, 9]) srail(z0 + 140, o, [[6, 0]], { type: 'box', h: 0.22, w: 1.0, ramp: 1.0, style: 'pad', label: 'BUTTER BOX' });
          } else if (sec === 3) {
            // skewed jumps: the middle one sits forward, the bigger skewed ones further back on each side
            kicker(z0 + 40, 0, 'L');
            kicker(z0 + 52, -14, 'J18', { tw: -0.26 });
            kicker(z0 + 52, 14, 'J18', { tw: 0.26 });
          } else if (sec === 4) {
            kicker(z0 + 50, 0, 'J21', { w: 4 });
            kicker(z0 + 56, -12, 'L', { w: 3 });
            kicker(z0 + 56, 12, 'L', { w: 3 });
            kicker(z0 + 62, -21.5, 'Q', { w: 2.4, ew: 1.5 });
            kicker(z0 + 62, 21.5, 'Q', { w: 2.4, ew: 1.5 });
          } else {
            // the cheese-wedge booter: wide, and built a little higher on one side
            kicker(z0 + 50, 0, 'J22', { w: 9, tw: 0.12 });
          }
        } else if (c === 22) {
          // Beijing 2022, Genting Snow Park: rails stepped down from left to right behind a Great Wall, then the
          // twisted sisters, the matrix and a 5 m straight kicker over a 21 m table
          if (sec === 0) {
            // a replica of the Great Wall runs down the left of the three rail sections (it kept the wind off the riders)
            const zEnd = this.zones.filter((q) => q.type === 'oly' && q.opt.s === 2).map((q) => q.z1)[0] || z0 + 570;
            for (let z = z0 - 20; z < zEnd; z += 50) prop({ type: 'gwall', z0: z, z1: Math.min(z + 50, zEnd), off: -(HALF + 5), tower: ((z - z0) / 50 | 0) % 3 === 1 });
            deckRail(z0 + 32, 19, 0.8, 2.5, 1.5, [...arc(8, 0.9, 4, 0, 0.5), [7, 0.35]], { label: 'RAINBOW TO DOWN' });
            deckRail(z0 + 30, 9.5, 1.3, 9, 2.0, [[14, 0]], { h: 0.6, label: 'TANK' });
            deckRail(z0 + 34, 0, 0.9, 8, 1.8, [[8, 'f']], { h: 0.6, label: 'FLAT RAIL' }, { lv: slopeAt(0, z0 + 41, 8) });
            deckRail(z0 + 32, -9.5, 1.5, 3, 1.6, DFD, { label: 'DOWN-FLAT-DOWN RAIL' });
            // transfer mailbox: a box along the top of the highest ledge, a down rail either side of it
            const d = deck(z0 + 28, -19, 2.3, 10, 3.0);
            srail(z0 + 28 + d.Lu + 0.4, -19, [[10, 0]], { type: 'box', style: 'mail', w: 0.5, h: 0.45, ramp: 1.6, label: 'TRANSFER MAILBOX' });
            for (const o of [-2.1, 2.1]) srail(z0 + 28 + d.Lu + 9.2, -19 + o, [[1, 0.1], [8, 0.3]], { h: 0.55, table: 0.8, label: 'TRANSFER DOWN RAIL' });
          } else if (sec === 1) {
            // the watch tower, with a curved rail on its roof
            const d = deck(z0 + 30, 15, 2.6, 8, 3.0, { Lu: 10, Ll: 1.4, ew: 0.6 });
            srail(z0 + 30 + 10 + 0.8, 15, arc(6.4, 0.55, 5), { h: 0.45, fit: false, label: 'WATCH TOWER RAIL' });
            prop({ type: 'watch', f: d });
            deckRail(z0 + 34, 5, 1.9, 2, 1.6, [[1.5, 0.05], [10, 0.25]], { type: 'box', style: 'mail', w: 0.5, h: 0.5, ramp: 0, label: 'DOWN MAILBOX' });
            deckRail(z0 + 32, -6, 0.9, 4.8, 1.6, [[4, 'f'], [10, 0.25]], { label: 'FLAT-DOWN RAIL' });
            deckRail(z0 + 30, -17, 1.4, 3, 1.8, [[3.5, 0.04], [4, 'f'], [4, 0.4]], { type: 'box', style: 'mail', w: 0.5, h: 0.5, ramp: 0, label: 'DOWN-FLAT-DOWN MAILBOX' });
          } else if (sec === 2) {
            const gk = kicker(z0 + 32, 13, 'GK');
            const sl = slopeAt(13, z0 + 44, 8);
            deck(z0 + 41, 13, 1.4, 8, 1.8, { Lu: 2.5, lv: sl });
            gap(gk, srail(z0 + 44.1, 13, [[8, 'f']], { h: 0.6, label: 'GAP TO FLAT RAIL' }));
            kicker(z0 + 40, 0, 'RK');
            deckRail(z0 + 36, -13, 0.8, 1.2, 1.5, [[3.5, 'u']], { h: 0.5, label: 'CANNON' }, { Lu: 5 });
          } else if (sec === 3) {
            // twisted sisters: twin skew jumps
            kicker(z0 + 50, -8, 'J18', { tw: -0.28, w: 4.2 });
            kicker(z0 + 50, 8, 'J18', { tw: 0.28, w: 4.2 });
          } else if (sec === 4) {
            // the matrix: roller to knuckle in the middle, transfer jumps either side, quarterpipes on the outside
            kicker(z0 + 50, 0, 'RK2', { w: 3.6, ew: 1.5 });
            kicker(z0 + 44, -11, 'L', { w: 3, tw: -0.25 });
            kicker(z0 + 44, 11, 'L', { w: 3, tw: 0.25 });
            kicker(z0 + 66, -21, 'Q', { w: 2.4, ew: 1.5 });
            kicker(z0 + 66, 21, 'Q', { w: 2.4, ew: 1.5 });
          } else {
            kicker(z0 + 50, 0, 'J21', { w: 6 });
          }
        } else {
          // Milano Cortina 2026, Livigno: big, clean, simple modules and jumps of 25 m and more
          if (sec === 0) {
            srail(z0 + 36, -12, [[18, 0]], { type: 'box', w: 0.5, label: 'LONG BOX', style: 'clean' });
            deckRail(z0 + 32, 0, 1.1, 3, 1.8, [[3.5, 0.06], [4.5, 'f'], [4, 0.45]], { label: 'DOWN-FLAT-DOWN RAIL' });
            deckRail(z0 + 34, 12, 1.7, 3, 1.6, [[3, 0.03], [9, 0.2]], { label: 'DOWN RAIL' });
          } else if (sec === 1) {
            deckRail(z0 + 34, -12, 0.9, 5.3, 1.8, [[4.5, 'f'], [9, 0.2]], { type: 'box', w: 0.5, h: 0.45, ramp: 0, label: 'FLAT-DOWN BOX', style: 'clean' });
            srail(z0 + 40, 0, arc(16, 1.3, 8), { type: 'box', h: 0.45, w: 0.55, fit: false, label: 'RAINBOW BOX', style: 'clean' });
            deckRail(z0 + 32, 12, 0.9, 5.3, 1.6, [[4.5, 'f'], [9, 0.24]], { label: 'FLAT-DOWN RAIL' });
          } else if (sec === 2) {
            gap(kicker(z0 + 34, -12, 'GK'), srail(z0 + 43, -12, [[14, 0.06]], { h: 0.85, end: 0.45, label: 'GAP TO DOWN RAIL' }));
            srail(z0 + 42, 0, [[2.5, 'u'], [3, 'f'], [4, 0.4]], { h: 0.55, label: 'UP-FLAT-DOWN RAIL' });
            deckRail(z0 + 32, 12, 1.6, 3, 1.8, [[2.5, 0.05], [14, 0.1]], { type: 'box', w: 0.5, h: 0.5, ramp: 0, label: 'DOWN BOX', style: 'clean' });
          } else if (sec === 3) {
            kicker(z0 + 50, 0, 'J22', { w: 4.5 });
            kicker(z0 + 58, 15, 'J18', { w: 4 });
          } else if (sec === 4) {
            kicker(z0 + 50, 0, 'J25', { w: 4.5 });
            kicker(z0 + 58, -15, 'J21', { w: 4 });
          } else {
            kicker(z0 + 50, 0, 'J25', { w: 4.5 });
            kicker(z0 + 58, 15, 'J22', { w: 4 });
          }
        }
      };

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
          case 'oly':
            oly(zn.opt.c, zn.opt.s, z0);
            break;
          case 'yog':
            yog(zn.opt.c, zn.opt.s, z0);
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
          case 'sidehits': {
            // natural hits along the edges of a groomed run: lips that lean up toward the trees,
            // banks to slash, and rollers in the middle (more and bigger on the red run)
            const red = zn.opt && zn.opt.red;
            let side = r() < 0.5 ? -1 : 1;
            for (let at = 28; at < L - 45; at += R(red ? 32 : 40, red ? 44 : 54)) {
              const pick = r();
              if (pick < 0.45) kicker(z0 + at, side * (HALF - R(3.6, 5.2)), 'S', { tw: side * 0.45, w: 2.3, Hk: R(1.0, red ? 1.8 : 1.4), noFlags: true });
              else if (pick < 0.72) kicker(z0 + at, side * (HALF - 2.4), 'Q', { w: 2.2, ew: 1.4, Hk: R(2.0, red ? 3.0 : 2.5), noFlags: true });
              else kicker(z0 + at, side * R(0, HALF - 9), red ? 'RK2' : 'RK', { w: R(3.2, 4.6) });
              if (red && r() < 0.4) kicker(z0 + at + R(12, 18), -side * R(2, 7), 'M', { noFlags: true });
              side = -side;
            }
            break;
          }
          case 'funpark': {
            // the resort's little park: kickers down the middle, boxes and rails either side
            const rows = [['S', ['box', 14, 0], ['rail', 12, 0]], ['M', ['box', 16, 0.7], ['box', 18, 0]], ['M', ['rail', 16, 0], ['rail', 14, 1.0]], ['L', ['box', 20, 0], ['rail', 18, 0]]];
            rows.forEach(([k, a, b], i) => {
              const at = z0 + 30 + i * 82;
              kicker(at, 0, k);
              rail(at + 6, -10, a[0], a[1], a[2]);
              rail(at + 8, 10, b[0], b[1], b[2]);
            });
            break;
          }
          default:
            break;
        }
      }

      // Olympic dressing: a judges' tower beside the last jump; walls and towers get solid edges
      if (M.oly) {
        const last = this.zones.filter((q) => q.type === 'oly' || q.type === 'yog').pop();
        if (last) {
          const jz = last.z0 + (last.type === 'yog' ? 60 : 130), jx = this.center(jz) + HALF + 11;
          prop({ type: 'judges', x: jx, z: jz });
          solid(jx, jz, 3);
        }
      }
      for (const pr of this.props) {
        if (pr.type === 'wallride') {
          pr.x = this.center(pr.z) + pr.off;
          pr.ang = Math.atan((this.center(pr.z + pr.len / 2 + 1) - this.center(pr.z + pr.len / 2 - 1)) / 2);
          for (let t = 0; t <= pr.len; t += 1.4) solid(pr.x + Math.sin(pr.ang) * t, pr.z + Math.cos(pr.ang) * t, 0.35);
        } else if (pr.type === 'gwall') {
          for (let z = pr.z0; z < pr.z1; z += 2.5) solid(this.center(z) + pr.off, z, 1.6);
        }
      }

      // bucket the features every 10 m
      this.fb = [];
      for (const f of this.features) {
        const za = f.kind === 'kicker' ? f.z0 : Math.min(f.z0, f.z1) - 1;
        const zb = f.kind === 'kicker' ? f.z0 + f.len : Math.max(f.az, f.z1) + 1;
        for (let b = ((za - C.Z0) / 10) | 0; b <= ((zb - C.Z0) / 10) | 0; b++) (this.fb[b] = this.fb[b] || []).push(f);
      }
      // where the autopilot riders shouldn't go: decks, and rails you have to pop onto
      this.ab = [];
      const avoidPt = (x, z, rad) => { const b = ((z - C.Z0) / 10) | 0; (this.ab[b] = this.ab[b] || []).push({ x, z, r: rad, top: 1e4 }); };
      for (const f of this.features) {
        if (f.kind === 'kicker' && f.size === 'D' && !f.ride) for (let u = 0; u <= f.len; u += 2.5) { const z = f.z0 + u; avoidPt(this.center(z) + f.off, z, f.w + 0.6); }
        else if (f.kind === 'rail' && f.ramp < 0.1) for (let t = -1.5; t <= f.len; t += 2) avoidPt(f.ax + f.dx * t, f.az + f.dz * t, 0.9);
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
      const propClear = (t) => {
        for (const pr of this.props) {
          if (pr.type === 'gwall') { if (t.z > pr.z0 - 3 && t.z < pr.z1 + 3 && Math.abs(t.x - (this.center(t.z) + pr.off)) < 4.5) return false; }
          else if (pr.type === 'watch') continue;
          else if (pr.x !== undefined && Math.hypot(t.x - pr.x, t.z - (pr.z + (pr.len || 0) / 2)) < (pr.type === 'judges' ? 7 : pr.type === 'wallride' ? pr.len / 2 + 2 : 4.5)) return false;
        }
        return true;
      };
      const clear = (t) => {
        if (this.props.length && !propClear(t)) return false;
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
      this.chalets = [];
      this.buntings = [];
      if (M.resort) this.layoutResort(R, HALF);
      this.trees = this.trees.filter(clear);
      if (M.resort) {
        // keep trees out of the chalets, off the lift line (it's cut through the forest) and away from the stations
        const lt = this.liftTowers;
        this.trees = this.trees.filter((t) => {
          for (const h of this.chalets) if (Math.hypot(t.x - h.x, t.z - h.z) < h.rad + 3) return false;
          const lx = this.liftX(t.z);
          if (t.z > lt[0].z - 10 && t.z < lt[lt.length - 1].z + 10 && Math.abs(t.x - lx) < 6) return false;
          for (const b of this.buntings) if (Math.abs(t.z - b.z) < 3 && (Math.abs(t.x - b.x0) < 3 || Math.abs(t.x - b.x1) < 3)) return false;
          for (const g of this.guns) if (Math.hypot(t.x - g.x, t.z - g.z) < 3.5) return false;
          for (const g of this.signs) if (Math.hypot(t.x - g.x, t.z - g.z) < 2.5) return false;
          return true;
        });
      }
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
          else this.poles.push({ x: this.center(z) + s * (HALF + 0.9), z, col: M.resort ? this.pisteCol(z) : null });
        }
      }

      // chairlift up one bank (not over the cave)
      const ls = r() < 0.5 ? -1 : 1;
      if (!M.resort) this.liftSide = ls;
      for (let z = C.Z0 + 20; z < C.ZMAX && !M.resort; z += 65) {
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
          if (!['kickers', 'bigair', 'mega', 'rollers', 'finish', 'giant', 'jumpline', 'jumpStation'].includes(zn.type) && !(zn.type === 'oly' && zn.opt.s >= 3) && !(zn.type === 'yog' && zn.opt.j)) continue;
          for (let z = Math.max(zn.z0, 10); z < Math.min(zn.z1, C.LENGTH + 40); z += 6) {
            for (const sd of [-1, 1]) if (r() < 0.92) this.nets.push({ z0: z, z1: z + 6, side: sd });
          }
        }
      }
      // the resort fences off the Traverse, where the banks drop away
      if (M.resort) {
        for (const zn of this.zones) {
          if (zn.type !== 'cattrack') continue;
          for (let z = zn.z0 + 10; z < zn.z1 - 10; z += 6) for (const sd of [-1, 1]) this.nets.push({ z0: z, z1: z + 6, side: sd });
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
      // boulders and outcrops scattered over the banks, in small groups and more where it's steep
      // (from a hash of the position, not the course's random numbers, so no course changes because of them)
      if (!M.city) {
        const zEnd = C.LENGTH + 40 - (M.stands ? 190 : 0);
        for (let z = C.Z0 + 50; z < zEnd; z += 8) {
          for (const sd of [-1, 1]) {
            if (hash(z * 0.37 + sd * 11.3, 4.1) > 0.3) continue;
            if (this.cave && this.inCave(z)) continue;
            const e = 9 + hash(z * 0.61, sd * 3.7) * 34;
            const x0 = this.center(z) + sd * (HALF + e);
            const steep = Math.hypot(this.ground(x0 + 1, z) - this.ground(x0 - 1, z), this.ground(x0, z + 1) - this.ground(x0, z - 1)) / 2;
            const n = 1 + Math.floor(hash(z * 1.9, sd + 2) * (steep > 0.45 ? 4 : 2.6));
            for (let i = 0; i < n; i++) {
              const x = x0 + (hash(z + i * 3.1, sd * 7) - 0.5) * 4.5, zz = z + (hash(z * 0.7 + i, 9.3) - 0.5) * 5;
              const sz = (0.4 + Math.pow(hash(zz * 1.3, x * 0.7), 2) * 1.7) * (i ? 0.72 : 1);
              const gy = this.ground(x, zz - 0.5);
              this.rocks.push({ x, z: zz, s: sz, yaw: hash(x * 2.1, zz) * TAU, gy, bank: true });
              if (e < 28) this.colliders.push({ x, z: zz, r: sz * 0.8, top: gy + sz * 1.1 });
            }
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
      this.huts = M.resort ? [] : [
        { x: this.center(-14) - (HALF + 7), z: -14, yaw: 0.25, sign: 'start' },
        { x: this.center(C.LENGTH + 55) + (HALF + 9), z: C.LENGTH + 55, yaw: -0.3, sign: 'lodge' },
      ];
      for (const h of this.chalets) this.colliders.push({ x: h.x, z: h.z, r: h.rad, top: 1e4 });
      for (const g of this.guns || []) this.colliders.push({ x: g.x, z: g.z, r: 0.7, top: 1e4 });
      for (const t of this.liftTowers) this.colliders.push({ x: t.x, z: t.z, r: t.station ? 5 : 0.6, top: 1e4 });
      for (const h of this.huts) this.colliders.push({ x: h.x, z: h.z, r: 3.2, top: 1e4 });

      this.placeTokens(R);

      this.cb = [];
      for (const col of this.colliders) {
        const b = ((col.z - C.Z0) / 10) | 0;
        (this.cb[b] = this.cb[b] || []).push(col);
      }
    }

    // the resort run's colour, like the marker poles on a real piste
    pisteCol(z) {
      const t = this.zoneAt(z);
      if (t.type === 'moguls' || t.type === 'cattrack') return [0.1, 0.1, 0.12];
      if (t.type === 'sidehits' && t.opt && t.opt.red) return [0.92, 0.16, 0.14];
      if (t.type === 'funpark') return [1.0, 0.55, 0.05];
      return [0.1, 0.38, 0.95];
    }

    // where the chairlift runs: up one side of the piste, crossing over it twice on the way
    // (over the cat track and again above the village), so you ride right under the chairs
    liftX(z) {
      const zs = this.liftCross || [700, 1700];
      const sg = 1 - 2 * smooth(clamp((z - zs[0] + 80) / 160, 0, 1)) + 2 * smooth(clamp((z - zs[1] + 80) / 160, 0, 1));
      return this.center(z) + this.liftSide * (C.HALF + 16) * sg;
    }

    layoutResort(R, HALF) {
      const r = this.rnd;
      this.liftSide = r() < 0.5 ? -1 : 1;
      const ls = this.liftSide;
      const zc = this.zones.find((zn) => zn.type === 'cattrack'), zv = this.zones.find((zn) => zn.type === 'village');
      this.liftCross = [zc ? zc.z0 + 90 : 700, zv ? zv.z0 - 60 : 1700];
      // chairlift: a station at each end, towers every 55 to 70 m, never inside the piste
      const zA = -48, zB = C.LENGTH + 70;
      const sx = (z) => this.liftX(z);
      this.liftTowers.push({ x: sx(zA), z: zA, gy: this.ground(sx(zA), zA), station: 'top' });
      for (let z = zA + 60; z < zB - 40; z += R(55, 70)) {
        let zz = null;
        for (const d of [0, 6, -6, 12, -12, 18, -18, 24, -24]) {
          const q = z + d;
          if (Math.abs(sx(q) - this.center(q)) > HALF + 4) { zz = q; break; }
        }
        if (zz === null) continue;
        const x = sx(zz);
        this.liftTowers.push({ x, z: zz, gy: this.ground(x, zz) });
        z = zz;
      }
      this.liftTowers.push({ x: sx(zB), z: zB, gy: this.ground(sx(zB), zB), station: 'bottom' });
      // the village: rows of chalets on the terraces either side of the piste, facing it
      const vz = this.zones.find((zn) => zn.type === 'village');
      const pal = [
        { wall: [0.95, 0.93, 0.88], wood: [0.46, 0.27, 0.14], shut: [0.16, 0.42, 0.24] },
        { wall: [0.96, 0.86, 0.72], wood: [0.38, 0.22, 0.12], shut: [0.62, 0.16, 0.14] },
        { wall: [0.88, 0.92, 0.96], wood: [0.5, 0.31, 0.17], shut: [0.14, 0.3, 0.55] },
        { wall: [0.98, 0.95, 0.9], wood: [0.32, 0.19, 0.11], shut: [0.75, 0.5, 0.12] },
      ];
      const spot = (side, e, z, o) => {
        const x = this.center(z) + side * (HALF + e);
        if (Math.abs(x - sx(z)) < 9 && z > zA && z < zB + 12) return;
        for (const h of this.chalets) if (Math.hypot(h.x - x, h.z - z) < h.rad + 6) return;
        const ang = Math.atan2(this.center(z + 1) - this.center(z - 1), 2);
        const w = o.w || R(4.6, 6.6), d = o.d || R(4.4, 6);
        this.chalets.push({ x, z, side, yaw: (side > 0 ? -Math.PI / 2 : Math.PI / 2) + ang + R(-0.12, 0.12), w, d, floors: o.floors || (r() < 0.35 ? 3 : 2), pal: pal[(r() * pal.length) | 0], rad: Math.max(w, d) * 0.95, deck: !!o.deck, seed: r() });
      };
      if (vz) {
        for (const side of [-1, 1]) {
          for (let z = vz.z0 + 70 + R(0, 10); z < C.ZMAX - 30; z += R(17, 25)) {
            if (z > C.LENGTH - 12 && z < C.LENGTH + 12) continue;
            spot(side, R(6.5, 9), z, {});
            if (r() < 0.75) spot(side, R(22, 30), z + R(-6, 6), {});
            if (r() < 0.4) spot(side, R(38, 50), z + R(-8, 8), { floors: 2 });
          }
        }
        // bunting strung across the piste through the village
        for (let z = vz.z0 + 120; z < C.LENGTH - 30; z += R(55, 75)) {
          const c = this.center(z);
          this.buntings.push({ z, x0: c - HALF - 2.5, x1: c + HALF + 2.5, i: this.buntings.length });
        }
      }
      // the mountain restaurant above the mogul field, with a sun terrace
      const mz = this.zones.find((zn) => zn.type === 'moguls');
      if (mz) spot(-ls, 13, mz.z0 - 18, { w: 9, d: 7, floors: 2, deck: true });
      // a little hut at the top of the fun park
      const fz = this.zones.find((zn) => zn.type === 'funpark');
      if (fz) spot(-ls, 9, fz.z0 + 8, { w: 4.2, d: 4, floors: 1 });
      // snow guns down the lift side, pointing out over the piste
      this.guns = [];
      for (let z = 70; z < (vz ? vz.z0 : C.LENGTH) - 20; z += R(95, 135)) {
        const side = Math.abs(sx(z) - this.center(z)) < HALF + 10 ? -ls : ls;
        const x = this.center(z) + side * (HALF + 3.4);
        if (this.chalets.some((h) => Math.hypot(h.x - x, h.z - z) < h.rad + 4)) continue;
        this.guns.push({ x, z, side, gy: this.ground(x, z) });
      }
      // piste signs where each run starts: the run's colour and shape, like the real thing
      this.signs = [];
      for (const zn of this.zones) {
        if (!['sidehits', 'cattrack', 'moguls', 'funpark', 'village'].includes(zn.type)) continue;
        const z = zn.z0 + 6, x = this.center(z) - ls * (HALF + 2.6);
        const shape = zn.type === 'moguls' || zn.type === 'cattrack' ? 'diamond' : zn.type === 'funpark' ? 'park' : 'square';
        this.signs.push({ x, z, gy: this.ground(x, z), col: this.pisteCol(z + 2), shape, face: ls });
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
          if (NOT_JUMP[f.size] || f.size === 'Q') continue;
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
            add(x, this.railY(f, f.len * k) + 1.0, z);
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
        if (!['summit', 'rollers', 'trees', 'finish', 'pillars', 'pillows', 'cliffs', 'cattrack', 'moguls', 'village'].includes(zn.type)) continue;
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
    // the nearest rail or box starting just ahead along the rider's line (for aiming an ollie onto it)
    railAhead(x, z, heading, sh, ch, maxD, boxes) {
      let best = null;
      for (let b = ((z - C.Z0) / 10) | 0, b1 = ((z + maxD - C.Z0) / 10) | 0; b <= b1; b++) {
        const list = this.fb[b];
        if (!list) continue;
        for (const f of list) {
          if (f.kind !== 'rail' || (f.ramp > 0.1 && !boxes)) continue;
          let da = heading - f.ang;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) > 0.5) continue;
          const rx = f.ax - x, rz = f.az - z;
          const d = rx * sh + rz * ch;
          if (d < 0.2 || d > maxD || Math.abs(rx * ch - rz * sh) > f.w + 0.7) continue;
          if (!best || d < best.d) best = { f, d, top: this.railY(f, 0.6) };
        }
      }
      return best;
    }

    // a rail close under a falling rider: coming down within reach of one, you lock onto it
    railCatch(x, z, y, drop) {
      const b = this.fb[((z - C.Z0) / 10) | 0];
      if (!b) return null;
      for (const f of b) {
        if (f.kind !== 'rail') continue;
        const rx = x - f.ax, rz = z - f.az;
        const t = rx * f.dx + rz * f.dz;
        if (t < 0.3 || t > f.len - 0.6) continue;
        const lat = rx * f.dz - rz * f.dx;
        if (Math.abs(lat) > f.w + 0.5) continue;
        const top = this.railY(f, t);
        if (y - top > 0.45 || y - top + drop < -0.35) continue;
        return { f, x: f.ax + f.dx * t, z: f.az + f.dz * t };
      }
      return null;
    }

    avoidHit(x, z, radius) {
      const b0 = ((z - C.Z0) / 10) | 0;
      for (let b = b0 - 1; b <= b0 + 1; b++) {
        const list = this.ab && this.ab[b];
        if (!list) continue;
        for (const c of list) {
          const dx = x - c.x, dz = z - c.z, rr = c.r + radius;
          if (dx * dx + dz * dz < rr * rr) return c;
        }
      }
      return null;
    }

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
        s = Math.min(s, d / (t * 0.12)); // a soft edge, so long shadows don't break into stripes along the rows
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
    initChunks() {
      if (this.chunks.length) return;
      const n = Math.ceil((C.ZMAX - C.Z0) / C.CHUNK);
      for (let i = 0; i < n; i++) this.chunks.push({ i, z0: C.Z0 + i * C.CHUNK, z1: C.Z0 + (i + 1) * C.CHUNK, minZ: 0, maxZ: 0, tri: null, lines: null });
      this.assignObjects();
      // the far view: the whole valley, coarse, out past the end of the run (not in caves, stadiums or pipes)
      this.farOK = !this.cave && !this.map.city && !this.pipeArr && !this.towerArr;
      this.farSegs = [];
      if (this.farOK) {
        for (let z = C.Z0 - 60, i = 0; z < C.ZMAX + FAR_RUN; z += FAR_SEG, i++) this.farSegs.push({ i, z0: z, z1: z + FAR_SEG, tri: null, trees: null, req: false });
      }
    }

    // one far segment: the ground on a coarse grid that reaches far up the valley walls, and every tree as two cones
    farData(i) {
      const sg = this.farSegs[i];
      const tri = new SS.FBuf(1 << 15), trees = new SS.FBuf(1 << 15);
      new Builder(this, tri, null).terrain(sg.z0, sg.z1, 8, Builder.farOffs());
      const B = new Builder(this, trees, null);
      for (const t of this.trees) if (t.z >= sg.z0 && t.z < sg.z1) B.farTree(t);
      return { tri: tri.data(), trees: trees.data() };
    }
    buildFar(engine, sg) {
      const d = this.farData(sg.i);
      sg.tri = engine.mesh(d.tri, 6);
      sg.trees = d.trees.length ? engine.mesh(d.trees, 6) : null;
    }

    // draw the far view beyond what the detailed chunks cover (they stop at this.drawnEnd)
    drawFar(engine, camZ, far) {
      if (!this.farSegs || !this.farSegs.length) return;
      const gl = engine.gl, cut = this.drawnEnd || camZ;
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2, 6);
      engine.setCut(cut, C.HALF + 108, 1);
      for (const sg of this.farSegs) if (sg.tri && sg.z1 > cut - 4 && sg.z0 < camZ + far) engine.drawBaked(sg.tri);
      engine.setCut(cut + 3, 0, 2);
      for (const sg of this.farSegs) if (sg.trees && sg.z1 > cut && sg.z0 < camZ + far) engine.drawBaked(sg.trees);
      engine.setCut(0, 0, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // Chunks are built ahead of the rider. With a background worker, only the chunks right around
    // the rider are ever built here (when the worker hasn't delivered them yet); the rest arrive
    // from the worker without holding up a frame. A budget of 50+ means "build them all now".
    ensureChunks(engine, z, budget) {
      this.initChunks();
      const n = this.chunks.length;
      if (this.cw && !this.cw.dead && budget < 50) {
        if (this.allDone && (!this.farOn || this.farDone)) return 0;
        if (!this.allDone && this.chunks.every((c) => c.tri)) this.allDone = true;
        if (this.farOn && !this.farDone && this.farSegs.every((sg) => sg.tri)) this.farDone = true;
        let done = 0;
        for (const c of this.chunks) {
          if (!c.tri && c.z0 < z + 110 && c.z1 > z - 40) { this.buildChunk(engine, c); done++; }
        }
        const ci = clamp(Math.floor((z - C.Z0) / C.CHUNK), 0, n - 1);
        // ask for the rest nearest first: ahead within sight, a couple behind, then everything else
        const order = [];
        for (let k = 0; k < n; k++) { const c = this.chunks[ci + k]; if (!c) break; order.push(c); }
        for (let k = 1; k < n; k++) { const c = this.chunks[ci - k]; if (!c) break; order.push(c); }
        for (const c of order) {
          if (this.inFlight >= 3) break;
          if (!c.tri && !c.req) this.cw.request(this, c);
        }
        // then the far view, from just ahead of the rider on down
        if (this.farOn && this.inFlight < 2) {
          const fs = this.farSegs.filter((sg) => !sg.tri && !sg.req).sort((a, b) => (a.z1 < z ? 1e5 : 0) + Math.abs(a.z0 - z) - ((b.z1 < z ? 1e5 : 0) + Math.abs(b.z0 - z)));
          for (const sg of fs) { if (this.inFlight >= 2) break; this.cw.requestFar(this, sg); }
        }
        return done;
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
      const span = this.map.resort ? 140 : 70;
      this.liftTowers.forEach((t, i) => add(t.z, { k: 'tower', o: t, next: this.liftTowers[i + 1] && this.liftTowers[i + 1].z - t.z < span ? this.liftTowers[i + 1] : null }));
      for (const n of this.nets) add(n.z0, { k: 'net', o: n });
      for (const h of this.huts) add(h.z, { k: 'hut', o: h });
      for (const h of this.chalets || []) add(h.z, { k: 'chalet', o: h });
      for (const b of this.buntings || []) add(b.z, { k: 'bunting', o: b });
      for (const g of this.guns || []) add(g.z, { k: 'gun', o: g });
      for (const g of this.signs || []) add(g.z, { k: 'sign', o: g });
      for (const st of this.stands) add(st.z, { k: 'stand', o: st });
      for (const c of this.cliffs || []) add(c.z, { k: 'cliff', o: c });
      for (const sc of this.scaffold || []) add(sc.z, { k: 'scaffold', o: sc });
      if (this.startGate) add(this.startGate.z, { k: 'startGate', o: this.startGate });
      for (const rk of this.rocks || []) add(rk.z, { k: 'rock', o: rk });
      for (const pr of this.props || []) add(pr.z !== undefined ? pr.z : pr.z0 !== undefined ? pr.z0 : pr.f.z0, { k: 'prop', o: pr });
      if (this.cave) {
        add(this.cave[0], { k: 'mouth', o: { z: this.cave[0], dir: -1 } });
        add(this.cave[1], { k: 'mouth', o: { z: this.cave[1], dir: 1 } });
      }
      add(C.LENGTH, { k: 'finish' });
      add(-3, { k: 'start' });
    }

    buildChunk(engine, ch) {
      const d = this.chunkData(ch);
      ch.minZ = d.minZ;
      ch.maxZ = d.maxZ;
      ch.tri = engine.mesh(d.tri, 6);
      ch.lines = d.lines ? engine.mesh(d.lines, 6, engine.gl.LINES) : null;
    }

    // the geometry of one chunk, as plain arrays (this also runs inside the background worker)
    chunkData(ch) {
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
          case 'chalet': B.chalet(o); ch.maxZ = Math.max(ch.maxZ, o.z + 12); ch.minZ = Math.min(ch.minZ, o.z - 12); break;
          case 'bunting': B.bunting(o); break;
          case 'gun': B.gun(o); break;
          case 'sign': B.sign(o); break;
          case 'stand': B.stand(o); ch.maxZ = Math.max(ch.maxZ, o.z + 14); ch.minZ = Math.min(ch.minZ, o.z - 14); break;
          case 'mouth': B.mouth(o); break;
          case 'cliff': B.cliff(o); break;
          case 'scaffold': B.scaffold(o); break;
          case 'startGate': B.startGate(o); break;
          case 'rock': B.rock(o); break;
          case 'prop': B.prop(o, ch); break;
          case 'finish': B.arch(C.LENGTH, true); B.finishFlags(); break;
          case 'start': B.arch(-3, false); break;
        }
      }
      ch.minZ -= 12;
      ch.maxZ += 12;
      return { tri: tri.data(), lines: lines.n ? lines.data() : null, minZ: ch.minZ, maxZ: ch.maxZ };
    }

    draw(engine, camZ) {
      const lo = camZ - 30, hi = camZ + C.DRAW;
      // the ground the detailed chunks cover runs on, unbroken, from the rider to here; the far view starts at it
      let end = camZ;
      for (const c of this.chunks) if (c.z1 > camZ && c.z0 <= hi && c.tri && c.z0 <= end + 0.01) end = c.z1;
      this.drawnEnd = end;
      for (const c of this.chunks) {
        if (!c.tri || c.maxZ < lo || c.minZ > hi || (c.z0 >= end && c.z0 > camZ)) continue;
        engine.drawBaked(c.tri);
        if (c.lines) engine.drawBaked(c.lines);
      }
    }

    dispose(engine) {
      for (const c of this.chunks) {
        engine.free(c.tri);
        engine.free(c.lines);
      }
      for (const sg of this.farSegs || []) { engine.free(sg.tri); engine.free(sg.trees); }
      this.farSegs = [];
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

    // a round bar (a log) from one point to another, flat-shaded with n sides
    tube(x0, y0, z0, x1, y1, z1, r, n, col) {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz) || 1;
      const ax = dx / L, ay = dy / L, az = dz / L;
      const hl = Math.hypot(ax, az) || 1, ux = -az / hl, uz = ax / hl;
      const vx = ay * uz, vy = az * ux - ax * uz, vz = -ay * ux;
      const o = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      const p = (bx, by, bz, a) => { const c = Math.cos(a) * r, s = Math.sin(a) * r; return [bx + ux * c + vx * s, by + vy * s, bz + uz * c + vz * s]; };
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
        this.quad(p(x0, y0, z0, a0), p(x1, y1, z1, a0), p(x1, y1, z1, a1), p(x0, y0, z0, a1), col, o);
      }
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
    terrain(z0, z1, step, offsList) {
      const w = this.w;
      const M = w.map, LT = w.L;
      const offs = offsList || Builder.offs();
      const nc = offs.length;
      const rows = [];
      for (let z = z0; z <= z1 + 0.001; z += step || 2) rows.push(z);
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
          // high up the valley walls, rock bands break through the snow
          const hi = ck < 0.5 ? clamp((ao - C.HALF - 26) / 40, 0, 1) : 0;
          const rockAt = (ck > 0.5 ? 0.6 : 0.95) - 0.22 * hi;
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
          if (ao > C.HALF + 4 && ck < 0.5) {
            // wind-packed patches and sun crust: snow on the slopes isn't one flat white
            const pz = 0.5 + 0.5 * Math.sin(x * 0.043 + z * 0.021) * Math.sin(z * 0.057 - x * 0.031 + 1.7);
            v *= 0.94 + 0.08 * pz;
          }
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
    // the start house: an open wooden deck under a high roof, branded side walls, timing posts with lights,
    // and a thin start wand across each gate (all high and open enough that the camera never sits inside it)
    startGate(g) {
      const w = this.w, M = w.map, z = g.z, c = w.center(z), gy = w.ground(c, z), hw = g.half;
      const FRAME = [0.16, 0.18, 0.24];
      const cols = (M.bannerCols && M.bannerCols.length ? M.bannerCols : [[1.0, 0.42, 0.1], [0.98, 0.98, 1.0], [0.2, 0.55, 1.0]]);
      const acc = cols[0], acc2 = cols[1 % cols.length];
      // corner posts and the high roof
      for (const sx of [-1, 1]) for (const zz of [z - 4.2, z + 0.6]) this.box(c + sx * (hw + 0.2), gy + 3.6, zz, 0.16, 3.6, 0.16, 0, FRAME);
      this.box(c, gy + 7.3, z - 1.8, hw + 0.7, 0.14, 3.0, 0, [0.92, 0.94, 0.98]);
      this.box(c, gy + 7.05, z - 1.8, hw + 0.5, 0.1, 2.8, 0, FRAME);
      // a striped fascia along the front of the roof, facing down the course
      const nS = Math.max(6, Math.round(hw * 1.6));
      for (let i = 0; i < nS; i++) {
        const x0 = c - hw - 0.7 + (i / nS) * (hw + 0.7) * 2, x1 = c - hw - 0.7 + ((i + 1) / nS) * (hw + 0.7) * 2;
        const cc = i % 2 ? acc2 : acc;
        this.quad([x0, gy + 6.45, z + 1.25], [x1, gy + 6.45, z + 1.25], [x1, gy + 7.2, z + 1.25], [x0, gy + 7.2, z + 1.25], cc, [(x0 + x1) / 2, gy + 6.8, z], 0.35);
      }
      // side walls in the course colours (no back wall: the camera sits behind you)
      for (const sx of [-1, 1]) {
        this.box(c + sx * (hw + 0.24), gy + 2.0, z - 1.8, 0.05, 2.0, 2.3, 0, acc, 0.12);
        this.box(c + sx * (hw + 0.2), gy + 4.25, z - 1.8, 0.05, 0.25, 2.3, 0, acc2, 0.3);
      }
      // gates: a dividing rail between them, timing posts at each end and the thin wand across
      const n = g.gates;
      for (let i = 0; i <= n; i++) {
        const x = c - hw + (i / n) * hw * 2;
        this.box(x, gy + 0.55, z + 0.55, 0.07, 0.55, 0.07, 0, FRAME);
        this.box(x, gy + 1.18, z + 0.55, 0.11, 0.09, 0.11, 0, [1.0, 0.2, 0.15], 0.9);
        if (i > 0 && i < n) this.box(x, gy + 0.9, z - 1.6, 0.05, 0.05, 2.2, 0, [0.85, 0.87, 0.9]);
      }
      for (let i = 0; i < n; i++) {
        const xa = c - hw + (i / n) * hw * 2 + 0.1, xb = c - hw + ((i + 1) / n) * hw * 2 - 0.1;
        this.tube(xa, gy + 0.5, z + 0.55, xb, gy + 0.5, z + 0.55, 0.025, 5, [1.0, 0.86, 0.15]);
      }
    }

    // ---- Olympic course dressing
    prop(p, ch) {
      if (p.type === 'doll') this.doll(p);
      else if (p.type === 'gwall') { this.gwall(p); ch.maxZ = Math.max(ch.maxZ, p.z1 + 6); }
      else if (p.type === 'watch') { this.watch(p.f); ch.maxZ = Math.max(ch.maxZ, p.f.z0 + p.f.len + 4); }
      else if (p.type === 'wallride') { this.wallride(p); ch.maxZ = Math.max(ch.maxZ, p.z + p.len + 2); }
      else if (p.type === 'judges') this.judges(p);
    }

    // a flat oval facing up the hill (-z), for painted details
    fan(cx, cy, cz, rx, ry, col, n, em) {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
        this.tri(cx, cy, cz, cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, cz, cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, cz, col, cx, cy, cz + 1, em);
      }
    }

    // the giant painted nesting doll that stood beside the jumps in 2014
    doll(p) {
      const s = p.s || 1, x = p.x, z = p.z, gy = this.w.ground(x, z) - 0.3;
      const RED = [0.86, 0.12, 0.1], GOLD = [1.0, 0.74, 0.16], SKIN = [1.0, 0.83, 0.7], DARK = [0.2, 0.11, 0.08], WHITE = [0.98, 0.96, 0.92], BLUE = [0.15, 0.35, 0.85];
      const prof = [[0, 1.55], [0.7, 1.95], [1.7, 2.15], [2.8, 2.0], [3.7, 1.6], [4.2, 1.36], [4.45, 1.46], [5.3, 1.5], [6.1, 1.3], [6.75, 0.85], [7.1, 0]];
      for (let i = 0; i < prof.length - 1; i++) {
        const [h0, r0] = prof[i], [h1, r1] = prof[i + 1];
        this.cyl(x, gy + h0 * s, z, r0 * s, r1 * s, (h1 - h0) * s, 20, i === 5 ? GOLD : RED, false);
      }
      // apron with a big flower on the belly
      const bz = z - 2.08 * s;
      this.fan(x, gy + 1.9 * s, bz, 1.25 * s, 1.45 * s, GOLD, 16);
      this.fan(x, gy + 1.9 * s, bz - 0.02, 1.0 * s, 1.18 * s, WHITE, 16);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        this.fan(x + Math.cos(a) * 0.42 * s, gy + 1.95 * s + Math.sin(a) * 0.42 * s, bz - 0.04, 0.26 * s, 0.26 * s, k % 2 ? RED : BLUE, 8);
      }
      this.fan(x, gy + 1.95 * s, bz - 0.06, 0.2 * s, 0.2 * s, GOLD, 8);
      // face under the headscarf
      const fz = z - 1.47 * s, fy = gy + 5.35 * s;
      this.fan(x, fy, fz, 0.92 * s, 0.86 * s, SKIN, 18);
      this.fan(x, fy + 0.62 * s, fz - 0.02, 0.8 * s, 0.26 * s, DARK, 12);
      for (const sd of [-1, 1]) {
        this.fan(x + sd * 0.33 * s, fy + 0.1 * s, fz - 0.04, 0.12 * s, 0.15 * s, BLUE, 8);
        this.fan(x + sd * 0.33 * s, fy + 0.1 * s, fz - 0.05, 0.06 * s, 0.07 * s, DARK, 6);
        this.fan(x + sd * 0.52 * s, fy - 0.28 * s, fz - 0.04, 0.18 * s, 0.14 * s, [1.0, 0.45, 0.45], 8);
      }
      this.fan(x, fy - 0.42 * s, fz - 0.04, 0.16 * s, 0.07 * s, RED, 8);
    }

    // a stretch of the Great Wall replica: stone wall with a walkway, battlements and now and then a tower
    gwall(p) {
      const w = this.w;
      const STONE = [0.6, 0.55, 0.47], TOP = [0.5, 0.46, 0.4], sn = w.L.snow;
      const out = p.off < 0 ? -1 : 1;
      for (let z = p.z0; z < p.z1; z += 3) {
        const z1 = Math.min(z + 3, p.z1), zm = (z + z1) / 2;
        const c = w.center(zm), x = c + p.off;
        const ang = Math.atan((w.center(zm + 1) - w.center(zm - 1)) / 2);
        const gc = w.ground(x, zm), gl = Math.min(w.ground(x - 1.4, zm), w.ground(x + 1.4, zm));
        const top = gc + 3.3, bot = gl - 1.2;
        const v = 0.93 + 0.12 * hash(Math.round(zm), 3);
        this.box(x, (top + bot) / 2, zm, 1.3, (top - bot) / 2, (z1 - z) / 2 + 0.03, ang, [STONE[0] * v, STONE[1] * v, STONE[2] * v]);
        this.box(x, top + 0.04, zm, 1.0, 0.05, (z1 - z) / 2, ang, [sn[0] * 0.95, sn[1] * 0.95, sn[2] * 0.97]);
        for (let k = -1; k <= 1; k += 2) {
          const mz = zm + k * 0.75;
          this.box(x + out * 1.12, top + 0.38, mz, 0.18, 0.38, 0.38, ang, TOP);
        }
        this.box(x - out * 1.12, top + 0.2, zm, 0.16, 0.2, (z1 - z) / 2, ang, TOP);
      }
      if (p.tower) {
        const zm = (p.z0 + p.z1) / 2, x = w.center(zm) + p.off, gc = w.ground(x, zm), bot = gc - 1.5, top = gc + 6.4;
        this.box(x, (top + bot) / 2, zm, 2.8, (top - bot) / 2, 2.8, 0, STONE);
        this.box(x, top + 0.05, zm, 2.5, 0.06, 2.5, 0, [sn[0] * 0.95, sn[1] * 0.95, sn[2] * 0.97]);
        for (let i = -2; i <= 2; i++) for (const sd of [-1, 1]) {
          this.box(x + sd * 2.65, top + 0.4, zm + i * 1.1, 0.15, 0.4, 0.32, 0, TOP);
          this.box(x + i * 1.1, top + 0.4, zm + sd * 2.65, 0.32, 0.4, 0.15, 0, TOP);
        }
        for (const dy of [2.2, 4.4]) this.box(x - out * 2.82, gc + dy, zm, 0.04, 0.45, 0.3, 0, [0.12, 0.1, 0.09]);
      }
    }

    // the watch tower feature: stone walls round the deck so the rail runs along its roof
    watch(f) {
      const w = this.w;
      const STONE = [0.62, 0.56, 0.48], TOP = [0.5, 0.46, 0.4];
      const zt0 = f.z0 + f.Lu - 0.6, zt1 = f.z0 + f.Lu + f.Lt, zf = zt1 + f.Ll;
      const roof = (z) => w.ground(w.center(z) + f.off, z) + w.kickerH(f, w.center(z) + f.off, z);
      for (let z = zt0; z < zf; z += 1.5) {
        const z1 = Math.min(z + 1.5, zf), zm = (z + z1) / 2, c = w.center(zm) + f.off;
        const top = Math.max(roof(Math.min(zm, zt1)), w.ground(c, zm) + 0.3);
        for (const sd of [-1, 1]) {
          const x = c + sd * (f.w + 0.35), bot = w.ground(x, zm) - 0.6;
          this.box(x, (top + 0.5 + bot) / 2, zm, 0.35, (top + 0.5 - bot) / 2, (z1 - z) / 2 + 0.02, 0, STONE);
          if (Math.round(zm * 2) % 3 === 0) this.box(x, top + 0.8, zm, 0.3, 0.3, 0.35, 0, TOP);
        }
      }
      // the front face, with a dark arched doorway
      const c = w.center(zt1) + f.off, top = roof(zt1), bot = w.ground(c, zt1 + 1) - 0.6;
      this.box(c, (top + bot) / 2, zt1 + 0.7, f.w + 0.7, (top - bot) / 2, 0.7, 0, STONE);
      this.box(c, top + 0.05, zt1 + 0.7, f.w + 0.6, 0.05, 0.6, 0, w.L.snow);
      const gy = w.ground(c, zt1 + 1.5);
      this.box(c, gy + 0.9, zt1 + 1.42, 0.55, 0.9, 0.02, 0, [0.1, 0.08, 0.07]);
      this.cyl(c, gy + 1.8, zt1 + 1.42, 0.55, 0.0, 0.5, 6, [0.1, 0.08, 0.07]);
    }

    // a wallride: a tall board wall standing beside the rails
    wallride(p) {
      const w = this.w;
      const FACE = w.map.wallCol || [0.95, 0.96, 0.98], STRIPE = w.map.boxCol || [0.25, 0.55, 1.0], BACK = [0.32, 0.34, 0.4];
      const fs = p.off < 0 ? 1 : -1;
      const n = Math.max(2, Math.ceil(p.len / 2));
      const sx = Math.cos(p.ang) * 0.1, sz = -Math.sin(p.ang) * 0.1;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * p.len, x = p.x + Math.sin(p.ang) * t, z = p.z + Math.cos(p.ang) * t;
        const g = w.ground(x, z), top = g + p.h * (0.55 + 0.45 * Math.sin((Math.PI * t) / p.len));
        const cur = { x, z, g: g - 0.3, top };
        if (prev) {
          const o = [(x + prev.x) / 2 + sx * 3, (top + prev.g) / 2, (z + prev.z) / 2 + sz * 3];
          for (const sd of [-1, 1]) {
            const a = [prev.x + sd * sx, prev.g, prev.z + sd * sz], b = [x + sd * sx, cur.g, z + sd * sz];
            const c = [x + sd * sx, top, z + sd * sz], d = [prev.x + sd * sx, prev.top, prev.z + sd * sz];
            this.quad(a, b, c, d, sd === fs ? FACE : BACK, [(x + prev.x) / 2 - sd * sx * 3, o[1], (z + prev.z) / 2 - sd * sz * 3]);
          }
          this.beam(prev.x, prev.top + 0.05, prev.z, x, top + 0.05, z, 0.14, 0.06, STRIPE);
        }
        if (i % 2 === 0) this.beam(x - fs * sx * 16, g - 0.2, z - fs * sz * 16, x - fs * sx * 1.2, top * 0.6 + g * 0.4, z - fs * sz * 1.2, 0.05, 0.05, [0.25, 0.26, 0.3]);
        prev = cur;
      }
    }

    // the judges' tower beside the last jump
    judges(p) {
      const w = this.w, x = p.x, z = p.z, gy = w.ground(x, z);
      const FRAME = [0.22, 0.24, 0.3], ACC = w.map.boxCol || [0.25, 0.55, 1.0];
      for (const a of [-1, 1]) for (const b of [-1, 1]) this.box(x + a * 2.2, gy + 2.2, z + b * 2.6, 0.12, 2.6, 0.12, 0, FRAME);
      this.box(x, gy + 4.7, z, 2.6, 0.12, 3.0, 0, FRAME);
      this.box(x, gy + 6.0, z, 2.5, 1.2, 2.9, 0, [0.9, 0.91, 0.94]);
      this.box(x - 2.52, gy + 6.25, z, 0.03, 0.7, 2.6, 0, [0.14, 0.24, 0.38], 0.25);
      this.box(x, gy + 7.3, z, 2.8, 0.12, 3.2, 0, FRAME);
      this.box(x - 2.55, gy + 5.05, z, 0.03, 0.22, 2.9, 0, ACC, 0.3);
      this.beam(x + 2.4, gy + 4.6, z + 2.9, x + 2.4, gy - 0.2, z + 7.5, 0.5, 0.05, FRAME);
    }

    // a lumpy boulder sitting in the snow
    rock(r) {
      const s = r.s, c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
      if (r.bank) { this.boulder(r); return; }
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

    // a weathered boulder half buried in the snow: a lumpy dome of granite, snow on its flatter top
    boulder(r) {
      const s = r.s, c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
      const N = 7, RINGS = 3;
      const base = r.gy - s * 0.35;
      const grey = 0.27 + hash(r.x * 1.7, r.z) * 0.12;
      const tint = hash(r.z, r.x * 0.3);
      const rockC = [grey * (0.98 + tint * 0.06), grey * (0.97 + tint * 0.04), grey * 1.08];
      const snowC = [0.9, 0.93, 0.98];
      const ring = [];
      for (let j = 0; j <= RINGS; j++) {
        const v = j / RINGS, rr = Math.cos(v * Math.PI * 0.5), yy = Math.sin(v * Math.PI * 0.5);
        const row = [];
        for (let k = 0; k < N; k++) {
          const a = (k / N) * TAU;
          const jit = 0.75 + hash(r.x + k * 1.3, r.z + j * 2.1) * 0.5;
          const x = Math.cos(a) * rr * s * 1.05 * jit, z = Math.sin(a) * rr * s * 0.8 * jit;
          row.push([r.x + x * c + z * sn, base + yy * s * (0.95 + hash(k, r.x) * 0.3), r.z - x * sn + z * c]);
        }
        ring.push(row);
      }
      const top = [r.x, base + s * 1.12, r.z];
      const o = [r.x, base + s * 0.2, r.z];
      for (let j = 0; j < RINGS; j++) {
        for (let k = 0; k < N; k++) {
          const k2 = (k + 1) % N;
          const col = j === RINGS - 1 && hash(r.x + k, r.z * 1.1) < 0.6 ? snowC : rockC;
          this.quad(ring[j][k], ring[j][k2], ring[j + 1][k2], ring[j + 1][k], col, o);
        }
      }
      for (let k = 0; k < N; k++) {
        const a = ring[RINGS][k], b = ring[RINGS][(k + 1) % N];
        this.tri(a[0], a[1], a[2], b[0], b[1], b[2], top[0], top[1], top[2], snowC, o[0], o[1], o[2]);
      }
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
      // no tree grows perfectly straight or evenly: a slight lean, and tiers that don't quite match
      const lean = (hash(t.x * 3.1, t.z * 0.7) - 0.5) * 0.07, la = h2 * TAU;
      for (let i = 0; i < tiers; i++) {
        const rb = Math.max(0.35, shape.rb - i * shape.taper * (shape.rb / 1.8)) * s * (0.88 + hash(i * 1.7 + h1, h2 * 5) * 0.24);
        const ht = (base + i * shape.step) * s;
        const y0 = y + ht;
        const hh = (shape.hh - i * 0.18) * s;
        this.bough(t.x + Math.cos(la) * lean * ht, y0, t.z + Math.sin(la) * lean * ht, rb, hh, sides, green, snow, sn, h1 * 7 + i * 1.7, t.near);
      }
    }

    // a tree far away: two dark cones, snow on the sunny faces of the upper one
    farTree(t) {
      const w = this.w, T = w.map.trees, s = t.s;
      const kind = t.kind || 'fir';
      if (kind === 'snag') return;
      const y = w.ground(t.x, t.z) - 0.2;
      const h1 = hash(t.x, t.z);
      const dark = kind === 'spruce' ? 0.8 : kind === 'pine' ? 1.12 : 1;
      const g = [T.green[0] * dark * (0.95 + h1 * 0.1), T.green[1] * dark, T.green[2] * dark];
      const sn = T.snow * (0.45 + hash(t.x * 0.7, t.z * 1.3) * 0.9);
      const snow = [lerp(0.6, 0.82, Math.min(1, sn)), lerp(0.66, 0.87, Math.min(1, sn)), lerp(0.75, 0.96, Math.min(1, sn))];
      const H = (kind === 'spruce' ? 10 : kind === 'pine' ? 9.5 : 8.6) * s, R0 = (kind === 'spruce' ? 1.6 : kind === 'pine' ? 1.8 : 2.1) * s;
      const y0 = y + (kind === 'pine' ? 3.6 : 0.9) * s;
      const cone = (cy, r, h, top) => {
        const n = 5, ax = t.x, az = t.z, a0 = h1 * TAU;
        for (let k = 0; k < n; k++) {
          const a = a0 + (k / n) * TAU, b = a0 + ((k + 1) / n) * TAU;
          const col = top && sn > 0.3 && k % 2 === 0 ? snow : g;
          this.tri(ax + Math.cos(a) * r, cy, az + Math.sin(a) * r, ax + Math.cos(b) * r, cy, az + Math.sin(b) * r, ax, cy + h, az, col, ax, cy + h * 0.3, az);
        }
      };
      cone(y0, R0, (H - (y0 - y)) * 0.62, false);
      cone(y0 + (H - (y0 - y)) * 0.38, R0 * 0.7, (H - (y0 - y)) * 0.62, true);
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
      const span = f.w + (f.ew || 2.5);
      const nv = Math.ceil((span * 2) / 0.55);
      let us = [];
      const nu0 = Math.ceil(f.len / 0.7);
      for (let i = 0; i <= nu0; i++) us.push((i / nu0) * f.len);
      const riser = new Set();
      if (f.stairs) {
        const s0 = f.Lu + f.Lt, tr = f.Ll / f.stairs;
        for (let k = 0; k <= f.stairs; k++) {
          const ue = s0 + k * tr + (k === f.stairs ? 0.01 : 0);
          us = us.filter((u) => Math.abs(u - ue) > 0.05);
          for (const d of [-0.03, -0.006, 0.006, 0.03]) { us.push(ue + d); if (Math.abs(d) < 0.01) riser.add(+(ue + d).toFixed(4)); }
        }
        us.sort((a, b) => a - b);
      }
      const nu = us.length - 1;
      const ri = (uu) => { let b = 0; for (let i = 1; i < us.length; i++) if (Math.abs(us[i] - uu) < Math.abs(us[b] - uu)) b = i; return b; };
      const grid = [];
      const sn = w.L.snow;
      for (let i = 0; i <= nu; i++) {
        const z = f.z0 + us[i];
        const c = w.center(z) + f.off;
        const row = [];
        const isR = riser.has(+us[i].toFixed(4));
        for (let j = 0; j <= nv; j++) {
          const x = c - span + (j / nv) * span * 2;
          const k = w.kickerH(f, x, z);
          const y = w.ground(x, z) + k + 0.03;
          const e = 0.3, ez = f.stairs ? 0.02 : e;
          const gx = (w.ground(x + e, z) + w.kickerH(f, x + e, z) - w.ground(x - e, z) - w.kickerH(f, x - e, z)) / (2 * e);
          // stair risers face down the hill; treads are lit flat
          const gz = isR && k > 0.05 ? -3 : (w.ground(x, z + ez) + w.kickerH(f, x, z + ez) - w.ground(x, z - ez) - w.kickerH(f, x, z - ez)) / (2 * ez);
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
      if (f.size === 'P' || f.size === 'RK' || f.size === 'GK') return;
      const blue = w.map.lit ? [0.78, 0.9, 1.0] : w.map.neon ? [1.0, 0.3, 0.85] : w.mapId === 'sunset' ? [1.0, 0.5, 0.2] : w.cave && w.inCave(f.z0) ? [0.6, 0.4, 1.0] : [0.25, 0.55, 1.0];
      if (f.ring) {
        // the bowl's coping: a steel edge along the top of the walls
        const rg = f.ring;
        let prev = null;
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * TAU, ex = Math.sin(a), ez = -Math.cos(a);
          const z = rg.zc + ez * rg.rz, x = w.center(z) + f.off + ex * rg.rx;
          const h = w.kickerH(f, x, z);
          const pt = h > 0.25 ? [x, w.ground(x, z) + h + 0.05, z] : null;
          if (pt && prev) this.beam(prev[0], prev[1], prev[2], pt[0], pt[1], pt[2], 0.07, 0.07, [0.62, 0.66, 0.74]);
          prev = pt;
        }
        return;
      }
      if (f.size === 'D') {
        // decks: a dye line along the drop edge so you can read where the table ends (and on every stair)
        const j0 = Math.round(((span - f.w) / (span * 2)) * nv), j1 = nv - j0;
        const edges = [f.Lu + f.Lt - 0.03];
        if (f.stairs) for (let k = 1; k < f.stairs; k++) edges.push(f.Lu + f.Lt + (k * f.Ll) / f.stairs - 0.03);
        for (const eu of edges) {
          const ei = Math.min(nu, ri(eu));
          for (let j = j0; j < j1; j++) {
            const a = grid[ei][j], b = grid[ei][j + 1];
            this.line(a[0], a[1] + 0.05, a[2], b[0], b[1] + 0.05, b[2], blue);
          }
        }
        return;
      }
      const lipI = ri(f.Lu);
      const j0 = Math.round(((span - f.w) / (span * 2)) * nv), j1 = nv - j0;
      for (let j = j0; j < j1; j++) {
        const a = grid[lipI][j], b = grid[lipI][j + 1];
        this.line(a[0], a[1] + 0.06, a[2], b[0], b[1] + 0.06, b[2], blue);
      }
      const endI = ri(f.Lu + f.Lt + f.Ll * 0.6);
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
      const neon = !!w.map.neon || !!w.map.lit;
      const NEON = [[1.0, 0.25, 0.75], [0.2, 0.9, 1.0], [0.65, 0.35, 1.0], [0.35, 1.0, 0.55]];
      const nc = w.map.lit ? [0.72, 0.86, 1.0] : NEON[Math.abs(Math.round(f.az * 0.37)) % NEON.length];
      // the top line, segment by segment, so long, arched and kinked rails follow their shape
      const ts = [];
      const N0 = Math.max(1, Math.ceil(f.len / 2.5));
      for (let i = 0; i <= N0; i++) ts.push((f.len * i) / N0);
      if (f.pts) for (const q of f.pts) ts.push(q[0]);
      ts.sort((a, b) => a - b);
      const P = [];
      for (const t of ts) {
        if (P.length && t - P[P.length - 1].t < 0.05) continue;
        const x = f.ax + f.dx * t, z = f.az + f.dz * t;
        const gy = w.Hk(x, z);
        const top = Math.max(w.railY(f, t), gy + 0.25);
        P.push({ x, z, top, gy, t });
      }
      const N = P.length - 1;
      const oly = w.map.oly;
      if (f.style === 'log') {
        // a whole tree trunk on short wooden legs, with a snow ramp up to it
        const bark = [0.34, 0.22, 0.13], cut = [0.84, 0.68, 0.45], wood = [0.26, 0.17, 0.1];
        for (let i = 0; i < N; i++) {
          const a = P[i], b = P[i + 1];
          const ea = i === 0 ? 0.3 : 0, eb = i === N - 1 ? 0.3 : 0;
          this.tube(a.x - f.dx * ea, a.top - 0.2 + (b.top - a.top) * (-ea / Math.max(0.1, b.t - a.t)), a.z - f.dz * ea,
            b.x + f.dx * eb, b.top - 0.2 + (b.top - a.top) * (eb / Math.max(0.1, b.t - a.t)), b.z + f.dz * eb, 0.22, 7, bark);
        }
        for (const [q, d] of [[P[0], -0.31], [P[N], 0.31]]) this.box(q.x + f.dx * d, q.top - 0.2, q.z + f.dz * d, 0.17, 0.17, 0.02, f.ang, cut);
        const legs = Math.max(2, Math.round(f.len / 4));
        for (let i = 0; i <= legs; i++) {
          const p = P[Math.round((i / legs) * N)];
          for (const sd of [-1, 1]) {
            const lx = p.x + f.dz * sd * 0.35, lz = p.z - f.dx * sd * 0.35;
            this.beam(lx, w.Hk(lx, lz) - 0.2, lz, p.x, p.top - 0.32, p.z, 0.06, 0.06, wood);
          }
        }
        if (f.ramp >= 0.1) {
          const sx = f.dz * 0.32, sz = -f.dx * 0.32;
          const x0 = P[0].x, z0 = P[0].z, t0 = P[0].top - 0.12;
          const rx = x0 - f.dx * f.ramp, rz = z0 - f.dz * f.ramp, gr = w.Hk(rx, rz) - 0.05;
          this.quad([rx - sx, gr, rz - sz], [rx + sx, gr, rz + sz], [x0 + sx, t0, z0 + sz], [x0 - sx, t0, z0 - sz], [0.82, 0.86, 0.94], [(rx + x0) / 2, gr - 1, (rz + z0) / 2]);
          for (const sd of [-1, 1]) this.tri(rx + sx * sd, gr, rz + sz * sd, x0 + sx * sd, t0, z0 + sz * sd, x0 + sx * sd, P[0].gy - 0.3, z0 + sz * sd, [0.78, 0.82, 0.9], rx, gr + 2, rz);
        }
        return;
      }
      if (isBox) {
        const hw = f.style === 'pad' ? f.w * 0.95 : f.w > 0.45 ? f.w * 0.82 : 0.3;
        const sx = f.dz * hw, sz = -f.dx * hw;
        const side = neon ? nc : cave ? [0.4, 0.9, 1.0] : f.style === 'mail' ? [0.16, 0.18, 0.22] : f.style === 'clean' ? [0.9, 0.91, 0.94] : f.style === 'pad' ? [0.95, 0.95, 0.97] : oly ? w.map.boxCol || [1.0, 0.72, 0.12] : w.mapId === 'sunset' || w.mapId === 'triple' ? [1.0, 0.45, 0.25] : [1.0, 0.72, 0.12];
        const em = neon ? 0.75 : cave ? 0.5 : 0;
        const topCol = neon ? [0.85, 0.85, 0.95] : f.style === 'mail' ? [0.55, 0.58, 0.64] : f.style === 'pad' ? [0.3, 0.32, 0.38] : [0.7, 0.76, 0.86];
        for (let i = 0; i < N; i++) {
          const a = P[i], b = P[i + 1];
          // tall boxes stand on legs instead of being solid down to the snow
          const slab = Math.max(a.top - a.gy, b.top - b.gy) > 1.15;
          const ab = slab ? a.top - 0.42 : a.gy - 0.4, bb = slab ? b.top - 0.42 : b.gy - 0.4;
          const o = [(a.x + b.x) / 2, (a.top + ab) / 2, (a.z + b.z) / 2];
          const v = [
            [a.x - sx, ab, a.z - sz], [a.x + sx, ab, a.z + sz], [a.x + sx, a.top, a.z + sz], [a.x - sx, a.top, a.z - sz],
            [b.x - sx, bb, b.z - sz], [b.x + sx, bb, b.z + sz], [b.x + sx, b.top, b.z + sz], [b.x - sx, b.top, b.z - sz],
          ];
          if (slab) {
            this.quad(v[0], v[1], v[5], v[4], side, o, em);
            for (const q of [a, b]) if (q.top - q.gy > 1.15) this.box(q.x, (q.top - 0.42 + q.gy - 0.2) / 2, q.z, 0.07, (q.top - 0.42 - q.gy + 0.2) / 2, 0.07, f.ang, [0.2, 0.22, 0.26]);
          }
          this.quad(v[3], v[2], v[6], v[7], topCol, o, neon ? 0.3 : 0);
          this.quad(v[4], v[0], v[3], v[7], side, o, em);
          this.quad(v[1], v[5], v[6], v[2], side, o, em);
          if (i === 0) this.quad(v[0], v[1], v[2], v[3], side, o, em);
          if (i === N - 1) this.quad(v[5], v[4], v[7], v[6], side, o, em);
        }
        const x0 = P[0].x, z0 = P[0].z, t0 = P[0].top, g0 = P[0].gy - 0.4;
        const rx = x0 - f.dx * f.ramp, rz = z0 - f.dz * f.ramp;
        const gr = w.Hk(rx, rz) - 0.05;
        if (f.ramp < 0.1) return;
        const r = [[rx - sx, gr, rz - sz], [rx + sx, gr, rz + sz], [x0 + sx, t0, z0 + sz], [x0 - sx, t0, z0 - sz]];
        this.quad(r[0], r[1], r[2], r[3], [0.75, 0.8, 0.9], [(rx + x0) / 2, gr - 1, (rz + z0) / 2]);
        this.tri(r[0][0], r[0][1], r[0][2], r[3][0], r[3][1], r[3][2], x0 - sx, g0, z0 - sz, side, undefined, undefined, undefined, em);
        this.tri(r[1][0], r[1][1], r[1][2], r[2][0], r[2][1], r[2][2], x0 + sx, g0, z0 + sz, side, undefined, undefined, undefined, em);
      } else {
        const railCol = neon ? nc : oly ? w.map.railCol || [0.78, 0.83, 0.92] : [0.78, 0.83, 0.92];
        const rr = f.pts ? 0.075 : 0.06;
        for (let i = 0; i < N; i++) {
          const a = P[i], b = P[i + 1];
          this.beam(a.x, a.top, a.z, b.x, b.top, b.z, rr, rr, railCol, neon ? 0.9 : 0);
        }
        // posts at the ends, at every kink and every few metres
        const at = new Set([0, N]);
        const posts = Math.max(2, Math.round(f.len / 4.5));
        for (let i = 0; i <= posts; i++) at.add(Math.round((i / posts) * N));
        if (f.pts) for (const q of f.pts) at.add(P.findIndex((p) => Math.abs(p.t - q[0]) < 0.06));
        for (const i of at) {
          const p = P[i];
          if (!p) continue;
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
      this.box(p.x, gy + 0.85, p.z, 0.05, 0.95, 0.05, 0, p.col || [0.95, 0.28, 0.1]);
      this.box(p.x, gy + 1.25, p.z, 0.055, 0.12, 0.055, 0, [0.12, 0.12, 0.14]);
    }

    // tall race banners for the sunny map
    banner(b) {
      const gy = this.w.ground(b.x, b.z);
      const cols = this.w.map.bannerCols || [[1, 0.25, 0.3], [1, 0.75, 0.1], [0.15, 0.55, 1], [0.15, 0.8, 0.45], [0.7, 0.35, 1]];
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
      const resort = this.w.map.resort;
      if (t.station) this.station(t);
      else if (resort) {
        // a lattice-free steel tower: tapered post, a crossarm with sheave trains at each end, and a ladder
        const steel = [0.32, 0.34, 0.4];
        this.box(t.x, t.gy + 0.4, t.z, 0.9, 0.5, 0.9, 0, [0.62, 0.62, 0.64]);
        this.cyl(t.x, t.gy, t.z, 0.42, 0.3, 13, 8, steel);
        this.box(t.x, top + 0.1, t.z, 3.1, 0.16, 0.22, 0, steel);
        for (const sx of [-2.6, 2.6]) this.box(t.x + sx, top - 0.12, t.z, 0.12, 0.14, 0.9, 0, [0.18, 0.19, 0.22]);
        this.box(t.x + 0.42, t.gy + 6.5, t.z, 0.03, 6.4, 0.18, 0, [0.85, 0.75, 0.15]);
      } else {
        this.box(t.x, t.gy + 6.5, t.z, 0.35, 6.8, 0.35, 0, [0.22, 0.23, 0.27]);
        this.box(t.x, top, t.z, 3.0, 0.15, 0.25, 0, [0.22, 0.23, 0.27]);
      }
      if (!next) return;
      const ntop = next.gy + 13;
      const cable = this.w.map.lamps ? [0.08, 0.09, 0.12] : [0.25, 0.27, 0.32];
      const len = Math.hypot(next.x - t.x, next.z - t.z);
      const ax = (next.x - t.x) / len, az = (next.z - t.z) / len, yaw = Math.atan2(ax, az);
      const px = az, pz = -ax;
      const seatCols = [[0.12, 0.36, 0.86], [0.92, 0.22, 0.16], [0.98, 0.76, 0.12]];
      const jackets = [[0.9, 0.3, 0.2], [0.15, 0.5, 0.9], [0.2, 0.7, 0.4], [0.95, 0.75, 0.2], [0.6, 0.3, 0.8], [0.12, 0.12, 0.14]];
      for (const s of [-2.6, 2.6]) {
        const x0 = t.x + px * s, z0 = t.z + pz * s, x1 = next.x + px * s, z1 = next.z + pz * s;
        if (!resort) {
          this.line(t.x + s, top - 0.2, t.z, next.x + s, ntop - 0.2, next.z, cable);
          const n = 4;
          for (let i = 1; i < n; i++) {
            const k = i / n;
            const cx = lerp(t.x, next.x, k) + s, cz = lerp(t.z, next.z, k), cy = lerp(top, ntop, k) - 0.2 - Math.sin(k * Math.PI) * 0.6;
            this.line(cx, cy, cz, cx, cy - 2.0, cz, cable);
            this.box(cx, cy - 2.2, cz, 0.7, 0.07, 0.35, 0, [0.3, 0.32, 0.38]);
            this.box(cx, cy - 1.85, cz + 0.32, 0.7, 0.32, 0.05, 0, [0.3, 0.32, 0.38]);
          }
          continue;
        }
        // the haul rope sags a little between towers; chairs hang off it every 12 m or so
        const seg = 8;
        let lx = x0, ly = top - 0.25, lz = z0;
        for (let i = 1; i <= seg; i++) {
          const k = i / seg;
          const cx = lerp(x0, x1, k), cz = lerp(z0, z1, k), cy = lerp(top, ntop, k) - 0.25 - Math.sin(k * Math.PI) * 0.9;
          this.line(lx, ly, lz, cx, cy, cz, cable);
          lx = cx; ly = cy; lz = cz;
        }
        const nC = Math.max(2, Math.round(len / 12));
        const face = s > 0 ? 1 : -1; // chairs going up face downhill, coming down face uphill
        for (let i = 1; i < nC; i++) {
          const k = (i + (s > 0 ? 0.5 : 0)) / nC;
          if (k >= 1) continue;
          const h = hash(t.z * 0.13 + i, s);
          const cx = lerp(x0, x1, k), cz = lerp(z0, z1, k), cy = lerp(top, ntop, k) - 0.25 - Math.sin(k * Math.PI) * 0.9;
          const sc = seatCols[(t.z / 7 + i) % 3 | 0] || seatCols[0];
          this.line(cx, cy, cz, cx, cy - 2.3, cz, [0.2, 0.21, 0.25]);
          const P = (u, v) => [cx + px * u + ax * v * face, cz + pz * u + az * v * face];
          const seat = P(0, 0.12), back = P(0, -0.22), bar = P(0, 0.55);
          this.box(seat[0], cy - 2.45, seat[1], 0.85, 0.06, 0.28, yaw, sc);
          this.box(back[0], cy - 2.12, back[1], 0.85, 0.3, 0.05, yaw, sc);
          this.box(bar[0], cy - 2.05, bar[1], 0.85, 0.025, 0.025, yaw, [0.2, 0.21, 0.25]);
          // some chairs carry riders: a torso, legs dangling and a helmet
          const riders = h < 0.45 ? 0 : h < 0.75 ? 1 : 2;
          for (let q = 0; q < riders; q++) {
            const u = riders === 1 ? (h > 0.6 ? 0.35 : -0.35) : q ? 0.42 : -0.42;
            const jc = jackets[((h * 97 + q * 3) | 0) % jackets.length];
            const bp = P(u, -0.02), lp = P(u, 0.38);
            this.box(bp[0], cy - 2.05, bp[1], 0.2, 0.32, 0.14, yaw, jc);
            this.box(bp[0], cy - 1.6, bp[1], 0.12, 0.13, 0.12, yaw, [0.85, 0.85, 0.88]);
            this.box(lp[0], cy - 2.62, lp[1], 0.16, 0.24, 0.1, yaw, [0.16, 0.18, 0.24]);
          }
        }
      }
    }

    // a chairlift station: a long roofed hall over the bullwheel, a terminal deck and the lift's sign
    station(t) {
      const w = this.w;
      const gy = t.gy;
      const yaw = Math.atan2(w.liftX(t.z + 1) - w.liftX(t.z - 1), 2);
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const P = (x, y, z) => [t.x + x * c + z * s, gy + y, t.z - x * s + z * c];
      const wall = [0.86, 0.88, 0.9], dark = [0.22, 0.23, 0.27], roof = [0.95, 0.97, 1.0];
      // the hall on a concrete plinth that reaches down into the slope
      this.box(t.x, gy - 1.5, t.z, 4.4, 2.5, 7.4, yaw, [0.6, 0.6, 0.62]);
      this.box(t.x, gy + 2.4, t.z, 4.2, 1.6, 7.2, yaw, wall);
      for (const z of [-5.4, -1.8, 1.8, 5.4]) { const p = P(4.22, 2.6, z); this.box(p[0], p[1], p[2], 0.04, 0.6, 1.2, yaw, [0.3, 0.42, 0.58]); const q = P(-4.22, 2.6, z); this.box(q[0], q[1], q[2], 0.04, 0.6, 1.2, yaw, [0.3, 0.42, 0.58]); }
      // the terminal: the bullwheel deck on four legs, up at rope height
      for (const [x, z] of [[-2.2, -3], [2.2, -3], [-2.2, 3], [2.2, 3]]) { const p = P(x, 8.6, z); this.box(p[0], p[1], p[2], 0.3, 4.6, 0.3, yaw, dark); }
      const h0 = P(0, 12.7, 0);
      this.box(h0[0], h0[1], h0[2], 3.3, 0.55, 4.2, yaw, [0.9, 0.22, 0.16]);
      this.cyl(h0[0], gy + 12.05, h0[2], 2.75, 2.75, 0.12, 20, dark, true);
      const rf = P(0, 13.35, 0);
      this.box(rf[0], rf[1], rf[2], 3.5, 0.1, 4.4, yaw, roof);
      // pitched roof over the hall
      const o = P(0, 4.0, 0);
      const r1 = P(-4.9, 4.0, -7.8), r2 = P(-4.9, 4.0, 7.8), r3 = P(0, 5.9, 7.8), r4 = P(0, 5.9, -7.8), r5 = P(4.9, 4.0, 7.8), r6 = P(4.9, 4.0, -7.8);
      this.quad(r1, r2, r3, r4, roof, [o[0], o[1] - 2, o[2]]);
      this.quad(r4, r3, r5, r6, roof, [o[0], o[1] - 2, o[2]]);
      this.tri(r1[0], r1[1], r1[2], r4[0], r4[1], r4[2], r6[0], r6[1], r6[2], dark, o[0], o[1] - 2, o[2]);
      this.tri(r2[0], r2[1], r2[2], r3[0], r3[1], r3[2], r5[0], r5[1], r5[2], dark, o[0], o[1] - 2, o[2]);
      // the lift's name board
      const sg = P(0, 7.3, t.station === 'top' ? 7.6 : -7.6);
      this.box(sg[0], sg[1], sg[2], 2.4, 0.5, 0.06, yaw, [0.1, 0.36, 0.9]);
      const sw = P(0, 7.3, t.station === 'top' ? 7.67 : -7.67);
      this.box(sw[0], sw[1], sw[2], 1.9, 0.12, 0.02, yaw, [0.98, 0.98, 1.0]);
    }

    // an alpine chalet: stone plinth, a plastered ground floor, timber floors above, balconies,
    // shutters and a deep snowy gable roof that faces the piste
    chalet(h) {
      const w = this.w;
      const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
      const W = h.w / 2, D = h.d / 2, FH = 2.7, F = h.floors;
      let lo = 1e9, hi = -1e9;
      for (const [u, v] of [[-W, -D], [W, -D], [-W, D], [W, D], [0, 0]]) {
        const g = w.ground(h.x + u * c + v * s, h.z - u * s + v * c);
        lo = Math.min(lo, g); hi = Math.max(hi, g);
      }
      const gy = hi - 0.15;
      const P = (x, y, z) => [h.x + x * c + z * s, gy + y, h.z - x * s + z * c];
      const B = (x, y, z, hx, hy, hz, col) => { const p = P(x, y, z); this.box(p[0], p[1], p[2], hx, hy, hz, h.yaw, col); };
      const pal = h.pal, stone = [0.55, 0.55, 0.56], dark = [0.2, 0.13, 0.08], snowc = [0.96, 0.98, 1.0];
      const glass = [0.24, 0.34, 0.48], frame = [0.95, 0.94, 0.9];
      const base = lo - gy - 0.4;
      B(0, (base + 0.8) / 2, 0, W + 0.1, (0.8 - base) / 2, D + 0.1, stone);
      B(0, 0.8 + FH / 2, 0, W, FH / 2, D, pal.wall);
      if (F > 1) B(0, 0.8 + FH + ((F - 1) * FH) / 2, 0, W, ((F - 1) * FH) / 2, D, pal.wood);
      const top = 0.8 + F * FH;
      // timber boards: a dark line under each floor
      for (let f = 1; f <= F; f++) B(0, 0.8 + f * FH, 0, W + 0.04, 0.06, D + 0.04, dark);
      // the gable roof: ridge runs front to back, so the triangle faces the piste (+z local)
      const ov = 0.9, pitch = 0.58, RH = (W + ov) * pitch;
      const e1 = P(-W - ov, top - ov * pitch, -D - ov), e2 = P(-W - ov, top - ov * pitch, D + ov);
      const k1 = P(0, top + W * pitch, D + ov), k2 = P(0, top + W * pitch, -D - ov);
      const f1 = P(W + ov, top - ov * pitch, D + ov), f2 = P(W + ov, top - ov * pitch, -D - ov);
      const ctr = P(0, top - 1, 0);
      this.quad(e1, e2, k1, k2, snowc, ctr);
      this.quad(k2, k1, f1, f2, snowc, ctr);
      // eaves: the roof's thickness in dark timber
      const dn = (p) => [p[0], p[1] - 0.28, p[2]];
      this.quad(e2, k1, dn(k1), dn(e2), dark, ctr);
      this.quad(k1, f1, dn(f1), dn(k1), dark, ctr);
      this.quad(f2, k2, dn(k2), dn(f2), dark, ctr);
      this.quad(k2, e1, dn(e1), dn(k2), dark, ctr);
      this.quad(dn(e1), dn(e2), dn(k1), dn(k2), dark, [ctr[0], ctr[1] + 6, ctr[2]]);
      this.quad(dn(k2), dn(k1), dn(f1), dn(f2), dark, [ctr[0], ctr[1] + 6, ctr[2]]);
      // gable ends in timber
      for (const zz of [D, -D]) {
        const a = P(-W, top, zz), b = P(W, top, zz), t2 = P(0, top + W * pitch, zz);
        this.tri(a[0], a[1], a[2], b[0], b[1], b[2], t2[0], t2[1], t2[2], pal.wood, ctr[0], ctr[1], ctr[2]);
      }
      // windows with shutters on the front, two or three per floor, and a door
      const nw = W > 2.8 ? 3 : 2;
      for (let f = 0; f < F; f++) {
        const y = 0.8 + f * FH + 1.45;
        for (let i = 0; i < nw; i++) {
          const x = -W + ((i + 0.5) * 2 * W) / nw;
          if (f === 0 && i === (nw === 3 ? 1 : 0)) {
            B(x, 0.8 + 1.05, D + 0.03, 0.5, 1.05, 0.04, dark);
            continue;
          }
          B(x, y, D + 0.03, 0.42, 0.5, 0.03, frame);
          B(x, y, D + 0.06, 0.34, 0.42, 0.02, glass);
          B(x - 0.62, y, D + 0.05, 0.17, 0.5, 0.03, pal.shut);
          B(x + 0.62, y, D + 0.05, 0.17, 0.5, 0.03, pal.shut);
          if (f > 0) B(x, y - 0.62, D + 0.18, 0.4, 0.09, 0.14, [0.75, 0.2, 0.22]);
        }
        // side windows
        for (const sx of [-1, 1]) {
          B(sx * (W + 0.03), y, D * 0.35, 0.03, 0.45, 0.4, frame);
          B(sx * (W + 0.05), y, D * 0.35, 0.02, 0.38, 0.32, glass);
        }
      }
      // a balcony across the front of the upper floor
      if (F > 1) {
        const by = 0.8 + FH + 0.08;
        B(0, by, D + 0.65, W + 0.3, 0.08, 0.65, pal.wood);
        B(0, by + 1.0, D + 1.27, W + 0.3, 0.05, 0.05, dark);
        B(0, by + 0.5, D + 1.27, W + 0.3, 0.42, 0.025, pal.wood);
        for (const sx of [-1, 1]) B(sx * (W + 0.27), by + 0.5, D + 0.65, 0.03, 0.5, 0.65, pal.wood);
      }
      // chimney
      const chy = top + W * pitch * 0.55;
      B(W * 0.45, chy + 0.5, -D * 0.4, 0.3, 0.9, 0.3, stone);
      B(W * 0.45, chy + 1.45, -D * 0.4, 0.38, 0.06, 0.38, [0.35, 0.35, 0.36]);
      // the mountain restaurant's sun terrace: a deck with tables and parasols
      if (h.deck) {
        B(0, 0.75, D + 3.2, W + 1, 0.1, 3, pal.wood);
        B(0, 0.35, D + 3.2, W + 1, 0.4, 3, stone);
        const cols = [[0.92, 0.2, 0.16], [0.98, 0.98, 1.0], [0.92, 0.2, 0.16]];
        for (let i = 0; i < 3; i++) {
          const x = -W + 1 + i * W;
          const p = P(x, 0.85, D + 3.2);
          this.cyl(p[0], p[1], p[2], 0.05, 0.05, 2.5, 5, [0.85, 0.85, 0.86]);
          this.cyl(p[0], p[1] + 2.0, p[2], 1.5, 0.0, 0.75, 10, cols[i]);
          B(x, 1.6, D + 3.2, 0.55, 0.04, 0.55, [0.55, 0.36, 0.2]);
          for (const q of [-0.9, 0.9]) B(x + q, 1.3, D + 3.2, 0.18, 0.4, 0.4, [0.55, 0.36, 0.2]);
        }
      }
    }

    // a fan snow gun on a tall mast, its barrel aimed out over the piste
    gun(g) {
      const w = this.w;
      const yaw = g.side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const P = (x, y, z) => [g.x + x * c + z * s, g.gy + y, g.z - x * s + z * c];
      const yel = [0.95, 0.74, 0.1], dark = [0.16, 0.17, 0.2], grey = [0.55, 0.57, 0.6];
      this.box(g.x, g.gy + 0.15, g.z, 0.5, 0.15, 0.5, yaw, grey);
      this.cyl(g.x, g.gy, g.z, 0.09, 0.07, 4.2, 6, yel);
      const hd = P(0, 4.35, 0.25);
      this.box(hd[0], hd[1], hd[2], 0.5, 0.5, 0.55, yaw, yel);
      const fr = P(0, 4.35, 0.82);
      this.box(fr[0], fr[1], fr[2], 0.42, 0.42, 0.03, yaw, dark);
      const rr = P(0, 4.35, -0.32);
      this.box(rr[0], rr[1], rr[2], 0.38, 0.38, 0.05, yaw, grey);
      // a hose and a power box at the foot
      const pb = P(0.35, 0.55, -0.2);
      this.box(pb[0], pb[1], pb[2], 0.18, 0.25, 0.12, yaw, [0.85, 0.86, 0.88]);
    }

    // a piste sign: a post with the run's colour plate (square for blue and red, diamond for black)
    sign(g) {
      const pole = [0.2, 0.21, 0.24];
      this.cyl(g.x, g.gy, g.z, 0.05, 0.05, 2.4, 6, pole);
      const yaw = g.face > 0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3;
      const y = g.gy + 2.2;
      this.box(g.x, y, g.z, 0.32, 0.32, 0.03, yaw, [0.97, 0.97, 0.97]);
      if (g.shape === 'diamond') {
        const c = Math.cos(yaw), s = Math.sin(yaw), r = 0.24;
        const P = (u, v, d) => [g.x + u * c + d * s, y + v, g.z - u * s + d * c];
        for (const d of [0.035, -0.035]) this.quad(P(0, r, d), P(r, 0, d), P(0, -r, d), P(-r, 0, d), g.col, [g.x, y, g.z]);
      } else if (g.shape === 'park') {
        this.box(g.x, y, g.z, 0.26, 0.26, 0.04, yaw, g.col);
        this.box(g.x, y, g.z, 0.26, 0.05, 0.05, yaw, [0.1, 0.1, 0.12]);
      } else this.box(g.x, y, g.z, 0.24, 0.24, 0.04, yaw, g.col);
    }

    // bunting: a line of little flags strung across the piste between two poles
    bunting(b) {
      const w = this.w;
      const g0 = w.ground(b.x0, b.z), g1 = w.ground(b.x1, b.z);
      const y0 = g0 + 7.5, y1 = g1 + 7.5;
      for (const [x, g] of [[b.x0, g0], [b.x1, g1]]) this.box(x, g + 3.9, b.z, 0.09, 4.0, 0.09, 0, [0.86, 0.86, 0.9]);
      const cols = [[0.95, 0.2, 0.18], [1.0, 0.78, 0.1], [0.12, 0.5, 0.95], [0.2, 0.78, 0.38], [0.98, 0.98, 1.0]];
      const n = Math.round((b.x1 - b.x0) / 0.9);
      const yAt = (k) => lerp(y0, y1, k) - Math.sin(k * Math.PI) * 1.4;
      let px = b.x0, py = y0;
      for (let i = 1; i <= n; i++) {
        const k = i / n, x = lerp(b.x0, b.x1, k), y = yAt(k);
        this.line(px, py, b.z, x, y, b.z, [0.3, 0.3, 0.32]);
        if (i < n) {
          const xm = (px + x) / 2, ym = (py + y) / 2;
          this.tri(px + 0.08, py - 0.02, b.z, x - 0.08, y - 0.02, b.z, xm, ym - 0.62, b.z, cols[(i + b.i) % cols.length], xm, ym, b.z - 1, 0.35);
        }
        px = x; py = y;
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
  // the far view's columns: coarse across the piste, then out across the banks and up the valley walls
  Builder.farOffs = () => {
    if (Builder._fHalf === C.HALF) return Builder._foffs;
    const o = [];
    const n = Math.max(2, Math.round((C.HALF + 4) / 5));
    for (let i = -n; i <= n; i++) o.push(+(((C.HALF + 4) * i) / n).toFixed(2));
    for (const d of [6.5, 13.5, 25, 43, 72, 118, 170, 240, 330, 460]) { o.push(C.HALF + d); o.unshift(-(C.HALF + d)); }
    Builder._fHalf = C.HALF;
    Builder._foffs = o;
    return o;
  };

  Builder.offs = () => {
    if (Builder._half === C.HALF && Builder._fine === C.FINE) return Builder._offs;
    const o = [];
    const st = C.FINE ? 0.5 : 1.75;
    for (let v = -(C.HALF + 4); v <= C.HALF + 4 + 0.01; v += st) o.push(+v.toFixed(2));
    // the banks and valley walls: close enough columns that their ridges, gullies and rock bands
    // come out sharp instead of smeared across a few huge triangles
    for (const d of [6.5, 8, 9.5, 11.5, 13.5, 16, 18.5, 21.5, 25, 29, 33, 38, 43, 49, 56, 64, 72, 82, 92, 104, 118]) { o.push(C.HALF + d); o.unshift(-(C.HALF + d)); }
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
  SS.Builder = Builder;

  // ------------------------------------------------------------------ background chunk building
  // The worker runs this same file (and engine.js), makes its own copy of the world from the same
  // map and seed (courses are seeded, so it comes out identical) and bakes chunks on request.
  class ChunkWorker {
    constructor(worker) {
      this.w = worker;
      this.gen = 0;
      this.world = null;
      this.engine = null;
      this.dead = false;
      worker.onmessage = (e) => this.done(e.data);
      worker.onerror = () => { this.dead = true; };
    }
    attach(world, engine) {
      this.gen++;
      this.world = world;
      this.engine = engine;
      world.cw = this;
      world.gen = this.gen;
      world.inFlight = 0;
      this.w.postMessage({ t: 'world', gen: this.gen, seed: world.seed, mapId: world.mapId, consts: { GIANT_SPEED: SS.GIANT_SPEED, GIANT_G: SS.GIANT_G } });
    }
    request(world, ch) {
      ch.req = true;
      world.inFlight++;
      this.w.postMessage({ t: 'build', gen: world.gen, i: ch.i });
    }
    requestFar(world, sg) {
      sg.req = true;
      world.inFlight++;
      this.w.postMessage({ t: 'far', gen: world.gen, i: sg.i });
    }
    done(m) {
      const world = this.world;
      if (!world || m.gen !== world.gen) return;
      if (m.err) { this.dead = true; return; }
      world.inFlight = Math.max(0, world.inFlight - 1);
      if (m.far !== undefined) {
        const sg = world.farSegs && world.farSegs[m.far];
        if (!sg || sg.tri) return;
        sg.tri = this.engine.mesh(m.tri, 6);
        sg.trees = m.trees && m.trees.length ? this.engine.mesh(m.trees, 6) : null;
        return;
      }
      const ch = world.chunks[m.i];
      if (!ch || ch.tri) return;
      ch.minZ = m.minZ;
      ch.maxZ = m.maxZ;
      ch.tri = this.engine.mesh(m.tri, 6);
      ch.lines = m.lines ? this.engine.mesh(m.lines, 6, this.engine.gl.LINES) : null;
    }
  }
  SS.makeChunkWorker = function () {
    if (typeof Worker === 'undefined' || typeof document === 'undefined') return null;
    try {
      let w;
      if (document.querySelector('script[src*="world.js"]')) w = new Worker('js/chunks.js');
      else {
        // single-file build: make the worker from the page's own script text
        const texts = [...document.scripts].map((sc) => sc.textContent);
        const eng = texts.find((t) => t.indexOf('SS.Engine = Engine;') >= 0), wld = texts.find((t) => t.indexOf('SS.makeChunkWorker') >= 0);
        if (!eng || !wld) return null;
        w = new Worker(URL.createObjectURL(new Blob(['self.window = self;\n', eng, '\n', wld], { type: 'text/javascript' })));
      }
      return new ChunkWorker(w);
    } catch (e) {
      return null;
    }
  };

  // inside the worker
  if (typeof document === 'undefined' && typeof importScripts === 'function') {
    let wld = null, gen = -1;
    self.onmessage = (e) => {
      const m = e.data;
      try {
        if (m.t === 'world') {
          gen = m.gen;
          Object.assign(SS, m.consts || {});
          wld = new World(m.seed, m.mapId);
          wld.initChunks();
        } else if (m.t === 'build' && m.gen === gen && wld) {
          const d = wld.chunkData(wld.chunks[m.i]);
          const tr = [d.tri.buffer];
          if (d.lines) tr.push(d.lines.buffer);
          self.postMessage({ gen, i: m.i, tri: d.tri, lines: d.lines, minZ: d.minZ, maxZ: d.maxZ }, tr);
        } else if (m.t === 'far' && m.gen === gen && wld) {
          const d = wld.farData(m.i);
          self.postMessage({ gen, far: m.i, tri: d.tri, trees: d.trees }, [d.tri.buffer, d.trees.buffer]);
        }
      } catch (err) {
        self.postMessage({ gen: m.gen, err: String(err) });
      }
    };
  }
})();
