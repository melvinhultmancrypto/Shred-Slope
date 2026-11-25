'use strict';
/*
 * Rider accounts for Shred Slope: sign up, sign in, and one saved game per account
 * (best run, stars and best score on every mountain, outfit, a couple of preferences).
 *
 * Each account also has a wallet of coins: play money you earn by riding (runs, new stars,
 * multiplayer races and the Daily and Weekly Cups) and spend in the shop on suits, boards, helmets
 * and goggles. Coins live here on the server only; they can't be bought or cashed out.
 *
 * No dependencies. Passwords are hashed with scrypt (Node's crypto) and never stored in the clear.
 * Everything lives in one JSON file in DATA_DIR. On Render, put DATA_DIR on a persistent disk
 * (mount it at /var/data, which is picked up automatically): without a disk the file is wiped on
 * every deploy, and so are the accounts.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ITEMS = require('./public/js/items.js');

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/var/data') ? '/var/data' : path.join(__dirname, 'data'));
const FILE = path.join(DATA_DIR, 'accounts.json');
const SESSION_MS = 120 * 24 * 3600 * 1000; // stay signed in for 120 days
const MAX_BODY = 96 * 1024;
const NAME_RE = /^[A-Za-z0-9_.-]{3,16}$/;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

let mapIds = new Set();
let mapNames = {};
let db = { v: 1, users: {}, sessions: {}, cups: { live: {}, past: [] } };

function load() {
  for (const f of [FILE, FILE + '.bak']) {
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (d && d.users && d.sessions) {
        db = d;
        if (!db.cups) db.cups = { live: {}, past: [] };
        if (f !== FILE) console.warn('accounts: main file unreadable, loaded the backup');
        return;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('accounts: could not read ' + f + ': ' + e.message);
    }
  }
}

// ---- saving: debounced, one write at a time, written to a temp file and renamed over the old one
let dirty = false, writing = false, timer = null, lastBak = 0;
function persist() {
  dirty = true;
  if (!timer) timer = setTimeout(flush, 300);
}
async function flush() {
  timer = null;
  if (writing || !dirty) { if (dirty && !timer) timer = setTimeout(flush, 300); return; }
  dirty = false;
  writing = true;
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(db));
    if (Date.now() - lastBak > 10 * 60 * 1000) {
      lastBak = Date.now();
      await fs.promises.copyFile(FILE, FILE + '.bak').catch(() => {});
    }
    await fs.promises.rename(tmp, FILE);
  } catch (e) {
    console.error('accounts: save failed: ' + e.message);
    dirty = true;
  }
  writing = false;
  if (dirty && !timer) timer = setTimeout(flush, 1000);
}
function flushSync() {
  if (!dirty) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(FILE + '.tmp', FILE);
    dirty = false;
  } catch (e) { /* nothing more we can do on the way out */ }
}

// ---- passwords and sessions
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, SCRYPT, (e, k) => (e ? rej(e) : res(k))));
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('base64'), hash: (await scrypt(pw, salt)).toString('base64') };
}
async function checkPassword(u, pw) {
  const k = await scrypt(pw, Buffer.from(u.salt, 'base64'));
  const h = Buffer.from(u.hash, 'base64');
  return h.length === k.length && crypto.timingSafeEqual(h, k);
}
const tokenKey = (t) => crypto.createHash('sha256').update(String(t)).digest('base64url');
function newSession(key) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[tokenKey(token)] = { u: key, exp: Date.now() + SESSION_MS };
  persist();
  return token;
}
function userFromToken(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const s = db.sessions[tokenKey(token)];
  if (!s) return null;
  if (s.exp < Date.now()) { delete db.sessions[tokenKey(token)]; persist(); return null; }
  const u = db.users[s.u];
  if (!u) return null;
  // sliding expiry: playing keeps you signed in
  if (s.exp - Date.now() < SESSION_MS - 24 * 3600 * 1000) { s.exp = Date.now() + SESSION_MS; persist(); }
  return u;
}
function dropSessions(key, except) {
  for (const [k, s] of Object.entries(db.sessions)) if (s.u === key && k !== except) delete db.sessions[k];
}
setInterval(() => {
  const now = Date.now();
  let n = 0;
  for (const [k, s] of Object.entries(db.sessions)) if (s.exp < now) { delete db.sessions[k]; n++; }
  if (n) persist();
}, 6 * 3600 * 1000).unref();

// ---- the saved game: only known fields, sane numbers, and merging never loses progress
const num = (v, max) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
function cleanSave(s) {
  const out = { best: 0, progress: {}, outfit: 0, prefs: {} };
  if (!s || typeof s !== 'object') return out;
  out.best = num(s.best, 1e9);
  out.outfit = num(s.outfit, 63);
  if (s.progress && typeof s.progress === 'object') {
    for (const [id, p] of Object.entries(s.progress)) {
      if (!mapIds.has(id) || !p || typeof p !== 'object') continue;
      const st = Array.isArray(p.stars) ? p.stars : [];
      out.progress[id] = { best: num(p.best, 1e9), stars: [0, 1, 2].map((i) => st[i] === true) };
    }
  }
  if (s.prefs && typeof s.prefs === 'object') {
    if (['close', 'far', 'high'].includes(s.prefs.camera)) out.prefs.camera = s.prefs.camera;
    if (s.prefs.autoRail === 'on' || s.prefs.autoRail === 'off') out.prefs.autoRail = s.prefs.autoRail;
  }
  return out;
}
// merge an incoming save; every star earned for the first time pays out
function saveInto(u, incoming) {
  wallet(u);
  const before = countStars(u.save);
  u.save = mergeSave(u.save, incoming);
  u.saveAt = Date.now();
  const got = Math.max(0, countStars(u.save) - before);
  if (got) addCoins(u, got * ITEMS.STAR_COINS);
  persist();
  return got * ITEMS.STAR_COINS;
}
function mergeSave(a, b) {
  // a = what's stored, b = what came in: keep the best of both, take the newer outfit and preferences
  const out = cleanSave(a);
  const n = cleanSave(b);
  out.best = Math.max(out.best, n.best);
  for (const [id, p] of Object.entries(n.progress)) {
    const o = out.progress[id] || { best: 0, stars: [false, false, false] };
    out.progress[id] = { best: Math.max(o.best, p.best), stars: o.stars.map((v, i) => v || p.stars[i]) };
  }
  if (b && typeof b === 'object' && 'outfit' in b) out.outfit = n.outfit;
  Object.assign(out.prefs, n.prefs);
  return out;
}
const publicUser = (u) => ({ name: u.name, created: u.created });

// ---- coins: the wallet, the shop and the locker
const countStars = (s) => Object.values((s && s.progress) || {}).reduce((n, p) => n + (p.stars || []).filter(Boolean).length, 0);
function wallet(u) {
  if (!u.wallet) {
    // everyone starts with a little to spend, plus a thank-you for the stars they already have
    u.wallet = { coins: ITEMS.STARTER + countStars(u.save) * ITEMS.STAR_COINS, owned: [], equip: ITEMS.defaultLook(u.save && u.save.outfit), earned: 0, inbox: [], lastRun: 0, seq: 0 };
    persist();
  }
  return u.wallet;
}
function owns(w, slot, id) {
  const it = ITEMS.get(slot, id);
  return !!it && (it.price === 0 || w.owned.includes(slot + ':' + id));
}
// a look made only of things this wallet owns
function cleanLook(w) {
  const out = {};
  for (const slot of ITEMS.SLOTS) {
    const id = w.equip && w.equip[slot];
    out[slot] = id && owns(w, slot, id) ? id : slot === 'suit' ? ITEMS.FREE_SUITS[0] : slot === 'rider' ? ITEMS.RIDER_IDS[0] : 'stock';
  }
  return out;
}
function walletView(u) {
  const w = wallet(u);
  return { coins: w.coins, earned: w.earned, owned: w.owned.slice(), equip: cleanLook(w), inbox: w.inbox.filter((n) => !n.seen) };
}
function addCoins(u, n, text) {
  const w = wallet(u);
  n = Math.max(0, Math.round(n));
  w.coins += n;
  w.earned += n;
  if (text) {
    w.inbox.push({ id: ++w.seq, text, coins: n, at: Date.now(), seen: false });
    if (w.inbox.length > 20) w.inbox.splice(0, w.inbox.length - 20);
  }
  persist();
  return w.coins;
}

// ---- cups: one mountain and one course for a day (or a week); your best score counts, and the
// top riders win coins when it closes. Everyone who rode it gets something.
const DAY = 24 * 3600 * 1000;
function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function cupBounds(kind, now) {
  const d = new Date(now);
  const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (kind === 'daily') return { key: 'D' + new Date(day0).toISOString().slice(0, 10), ends: day0 + DAY };
  // weekly: Monday 00:00 UTC to the next Monday
  const dow = (d.getUTCDay() + 6) % 7;
  const mon = day0 - dow * DAY;
  return { key: 'W' + new Date(mon).toISOString().slice(0, 10), ends: mon + 7 * DAY };
}
function newCup(kind, b) {
  const ids = [...mapIds].filter((id) => id !== 'sbx'); // a race against rivals isn't a score contest
  const map = ids[hashStr(b.key + kind) % ids.length] || 'bluebird';
  return { kind, key: b.key, map, seed: hashStr('seed' + b.key + kind) & 0x7fffffff, ends: b.ends, scores: {} };
}
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
function ranked(c) {
  return Object.entries(c.scores).sort((a, b) => b[1].score - a[1].score || a[1].at - b[1].at);
}
function payout(c) {
  const def = ITEMS.CUPS[c.kind];
  const rows = ranked(c);
  rows.forEach(([key, e], i) => {
    const u = db.users[key];
    if (!u) return;
    const prize = i < def.prizes.length ? def.prizes[i] : i < 10 ? def.top10 : def.entry;
    addCoins(u, prize, `${def.name} on ${mapNames[c.map] || c.map}: you came ${ordinal(i + 1)} of ${rows.length}`);
  });
  db.cups.past.unshift({ kind: c.kind, key: c.key, map: c.map, ends: c.ends, n: rows.length, top: rows.slice(0, 3).map(([, e]) => ({ name: e.name, score: e.score })) });
  db.cups.past = db.cups.past.slice(0, 8);
  persist();
}
function cupFor(kind) {
  const b = cupBounds(kind, Date.now());
  let c = db.cups.live[kind];
  if (!c || c.key !== b.key) {
    if (c) payout(c);
    c = db.cups.live[kind] = newCup(kind, b);
    persist();
  }
  return c;
}
function cupView(c, key) {
  const def = ITEMS.CUPS[c.kind];
  const rows = ranked(c);
  const mine = key ? rows.findIndex(([k]) => k === key) : -1;
  return {
    kind: c.kind, name: def.name, key: c.key, map: c.map, mapName: mapNames[c.map] || c.map, seed: c.seed, ends: c.ends, left: Math.max(0, c.ends - Date.now()),
    prizes: def.prizes, top10: def.top10, entry: def.entry, n: rows.length,
    top: rows.slice(0, 10).map(([k, e]) => ({ name: e.name, score: e.score, me: k === key })),
    me: mine >= 0 ? { rank: mine + 1, best: rows[mine][1].score } : null,
  };
}
function cupsView(key) {
  if (!ITEMS.CUPS_OPEN) return { soon: true, cups: [], past: [] };
  return { cups: ['daily', 'weekly'].map((k) => cupView(cupFor(k), key)), past: db.cups.past.slice(0, 4).map((p) => Object.assign({ mapName: mapNames[p.map] || p.map }, p)) };
}
// close finished cups even when nobody is asking. While the cups are switched off, a cup that was
// already running still pays out when it ends, but no new one starts.
setInterval(() => {
  for (const k of ['daily', 'weekly']) {
    const c = db.cups.live[k];
    if (!c || Date.now() < c.ends) continue;
    if (ITEMS.CUPS_OPEN) cupFor(k);
    else { payout(c); delete db.cups.live[k]; persist(); }
  }
}, 60 * 1000).unref();

// ---- rate limits per IP, so nobody can hammer sign-in guessing passwords
const hits = new Map();
function limited(ip, kind, max, windowMs) {
  const k = kind + ':' + ip, now = Date.now();
  let h = hits.get(k);
  if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(k, h); }
  return ++h.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
}, 60 * 1000).unref();

// ---- HTTP
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY * 20) { req.destroy(); return; }
      if (size <= MAX_BODY) parts.push(c); // past the limit: read and throw away, then answer
    });
    req.on('end', () => {
      if (size > MAX_BODY) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const bearer = (req) => { const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''); return m ? m[1] : null; };

async function handle(req, res, url) {
  const ip = clientIp(req);
  const m = req.method;
  try {
    if (url === '/api/auth/signup' && m === 'POST') {
      const b = await readBody(req);
      if (!b) return send(res, 400, { error: 'Something went wrong. Try again.' });
      const name = String(b.username || '').trim(), pw = String(b.password || '');
      if (!NAME_RE.test(name)) return send(res, 400, { error: 'Pick a username of 3 to 16 letters or numbers (and _ . - if you like).', field: 'username' });
      if (pw.length < 6) return send(res, 400, { error: 'Your password needs at least 6 characters.', field: 'password' });
      if (pw.length > 100) return send(res, 400, { error: 'That password is too long.', field: 'password' });
      if (pw.toLowerCase() === name.toLowerCase()) return send(res, 400, { error: 'Your password can’t be your username.', field: 'password' });
      if (limited(ip, 'signup', 8, 3600 * 1000)) return send(res, 429, { error: 'Too many new accounts from here. Try again in a while.' });
      const key = name.toLowerCase();
      if (db.users[key]) return send(res, 409, { error: 'That username is taken. Try another one.', field: 'username' });
      const h = await hashPassword(pw);
      if (db.users[key]) return send(res, 409, { error: 'That username is taken. Try another one.', field: 'username' });
      db.users[key] = { name, salt: h.salt, hash: h.hash, created: Date.now(), save: mergeSave(null, b.save), saveAt: Date.now() };
      const token = newSession(key);
      return send(res, 201, { token, user: publicUser(db.users[key]), save: db.users[key].save, wallet: walletView(db.users[key]) });
    }
    if (url === '/api/auth/login' && m === 'POST') {
      const b = await readBody(req);
      if (!b) return send(res, 400, { error: 'Something went wrong. Try again.' });
      if (limited(ip, 'login', 12, 10 * 60 * 1000)) return send(res, 429, { error: 'Too many tries. Wait a few minutes and try again.' });
      const key = String(b.username || '').trim().toLowerCase(), pw = String(b.password || '');
      const u = db.users[key];
      // check a password even for unknown names, so the response time doesn't give away which names exist
      const ok = u ? await checkPassword(u, pw) : (await scrypt(pw, 'x'), false);
      if (!ok) return send(res, 401, { error: 'That username and password don’t match.' });
      if (b.save) saveInto(u, b.save);
      const token = newSession(key);
      return send(res, 200, { token, user: publicUser(u), save: cleanSave(u.save), wallet: walletView(u) });
    }
    if (url === '/api/auth/logout' && m === 'POST') {
      const t = bearer(req);
      if (t && db.sessions[tokenKey(t)]) { delete db.sessions[tokenKey(t)]; persist(); }
      return send(res, 200, { ok: true });
    }
    // the cups can be looked at without an account
    if (url === '/api/cups' && m === 'GET') {
      const v = userFromToken(bearer(req));
      return send(res, 200, cupsView(v ? v.name.toLowerCase() : null));
    }
    const u = userFromToken(bearer(req));
    if (!u) return send(res, 401, { error: 'You’re signed out. Sign in again.' });
    const key = u.name.toLowerCase();
    if (url === '/api/me' && m === 'GET') return send(res, 200, { user: publicUser(u), save: cleanSave(u.save), wallet: walletView(u) });
    if (url === '/api/save' && (m === 'PUT' || m === 'POST')) {
      if (limited(ip + ':' + key, 'save', 120, 60 * 1000)) return send(res, 429, { error: 'Saving too often.' });
      const b = await readBody(req);
      if (!b || !b.save) return send(res, 400, { error: 'Nothing to save.' });
      const got = saveInto(u, b.save);
      return send(res, 200, { save: u.save, coins: wallet(u).coins, starCoins: got });
    }
    if (url === '/api/wallet' && m === 'GET') return send(res, 200, { wallet: walletView(u) });
    // a finished run: coins for the score, and (in a cup) your entry on its leaderboard
    if (url === '/api/run' && m === 'POST') {
      if (limited(ip, 'run', 240, 3600 * 1000)) return send(res, 429, { error: 'Too many runs.' });
      const b = await readBody(req);
      if (!b || !mapIds.has(b.map)) return send(res, 400, { error: 'Unknown mountain.' });
      const w = wallet(u);
      const score = num(b.score, 400000), time = num(b.time, 3600);
      if (time < 15) return send(res, 400, { error: 'That run was too short to count.' });
      const now = Date.now();
      if (now - (w.lastRun || 0) < 12000) return send(res, 429, { error: 'One run at a time.' });
      w.lastRun = now;
      const earned = ITEMS.runCoins(score);
      addCoins(u, earned);
      let cup = null;
      if (ITEMS.CUPS_OPEN && b.cup && ITEMS.CUPS[b.cup]) {
        const c = cupFor(b.cup);
        if (c.map === b.map && (b.seed | 0) === c.seed) {
          const e = c.scores[key];
          if (!e || score > e.score) c.scores[key] = { name: u.name, score, time, at: now };
          persist();
          cup = cupView(c, key);
        }
      }
      return send(res, 200, { coins: w.coins, earned, cup });
    }
    if (url === '/api/shop/buy' && m === 'POST') {
      if (limited(ip + ':' + key, 'shop', 60, 60 * 1000)) return send(res, 429, { error: 'Slow down a little.' });
      const b = await readBody(req);
      const it = b && ITEMS.get(String(b.slot), String(b.id));
      if (!it || it.price <= 0) return send(res, 400, { error: 'That isn’t for sale.' });
      const w = wallet(u);
      if (owns(w, it.slot, it.id)) return send(res, 200, { wallet: walletView(u) });
      if (w.coins < it.price) return send(res, 402, { error: `You need ${(it.price - w.coins).toLocaleString('en-US')} more coins.` });
      w.coins -= it.price;
      w.owned.push(it.slot + ':' + it.id);
      persist();
      return send(res, 200, { wallet: walletView(u), bought: it.id });
    }
    if (url === '/api/locker/equip' && m === 'POST') {
      if (limited(ip + ':' + key, 'shop', 60, 60 * 1000)) return send(res, 429, { error: 'Slow down a little.' });
      const b = await readBody(req);
      const w = wallet(u);
      if (!b || !ITEMS.SLOTS.includes(b.slot) || !owns(w, b.slot, String(b.id))) return send(res, 400, { error: 'You don’t have that yet.' });
      w.equip = cleanLook(w);
      w.equip[b.slot] = String(b.id);
      persist();
      return send(res, 200, { wallet: walletView(u) });
    }
    if (url === '/api/inbox/seen' && m === 'POST') {
      const b = await readBody(req);
      const ids = new Set(Array.isArray(b && b.ids) ? b.ids : []);
      for (const n of wallet(u).inbox) if (ids.has(n.id)) n.seen = true;
      persist();
      return send(res, 200, { ok: true });
    }
    if (url === '/api/me' && m === 'DELETE') {
      const b = await readBody(req);
      if (!b || !(await checkPassword(u, String(b.password || '')))) return send(res, 401, { error: 'That password isn’t right.', field: 'password' });
      dropSessions(key);
      delete db.users[key];
      persist();
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('accounts: ' + (e && e.stack || e));
    return send(res, 500, { error: 'The server hit a snag. Try again.' });
  }
}

// the name a signed-in rider races under in multiplayer (null for guests)
function nameForToken(token) {
  const u = userFromToken(token);
  return u ? u.name : null;
}
// what a signed-in rider wears in multiplayer, and their race prizes
function lookFor(name) {
  const u = name && db.users[String(name).toLowerCase()];
  return u ? cleanLook(wallet(u)) : null;
}
function award(name, n, text) {
  const u = name && db.users[String(name).toLowerCase()];
  return u ? addCoins(u, n, text) : null;
}

function init(maps) {
  const list = maps.map((m) => (typeof m === 'string' ? { id: m, name: m } : m));
  mapIds = new Set(list.map((m) => m.id));
  mapNames = Object.fromEntries(list.map((m) => [m.id, m.name]));
  load();
  const n = Object.keys(db.users).length;
  console.log(`accounts: ${n} account${n === 1 ? '' : 's'}, stored in ${FILE}`);
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { flushSync(); process.exit(0); });
  process.once('beforeExit', flushSync);
}

const nameTaken = (n) => !!db.users[String(n).toLowerCase()];

module.exports = { init, handle, nameForToken, nameTaken, lookFor, award, flushSync, _mergeSave: mergeSave, _cupFor: cupFor, _db: () => db };
