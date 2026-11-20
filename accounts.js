'use strict';
/*
 * Rider accounts for Shred Slope: sign up, sign in, and one saved game per account
 * (best run, stars and best score on every mountain, outfit, a couple of preferences).
 *
 * No dependencies. Passwords are hashed with scrypt (Node's crypto) and never stored in the clear.
 * Everything lives in one JSON file in DATA_DIR. On Render, put DATA_DIR on a persistent disk
 * (mount it at /var/data, which is picked up automatically): without a disk the file is wiped on
 * every deploy, and so are the accounts.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/var/data') ? '/var/data' : path.join(__dirname, 'data'));
const FILE = path.join(DATA_DIR, 'accounts.json');
const SESSION_MS = 120 * 24 * 3600 * 1000; // stay signed in for 120 days
const MAX_BODY = 96 * 1024;
const NAME_RE = /^[A-Za-z0-9_.-]{3,16}$/;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

let mapIds = new Set();
let db = { v: 1, users: {}, sessions: {} };

function load() {
  for (const f of [FILE, FILE + '.bak']) {
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (d && d.users && d.sessions) {
        db = d;
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
      return send(res, 201, { token, user: publicUser(db.users[key]), save: db.users[key].save });
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
      if (b.save) { u.save = mergeSave(u.save, b.save); u.saveAt = Date.now(); }
      const token = newSession(key);
      return send(res, 200, { token, user: publicUser(u), save: cleanSave(u.save) });
    }
    if (url === '/api/auth/logout' && m === 'POST') {
      const t = bearer(req);
      if (t && db.sessions[tokenKey(t)]) { delete db.sessions[tokenKey(t)]; persist(); }
      return send(res, 200, { ok: true });
    }
    const u = userFromToken(bearer(req));
    if (!u) return send(res, 401, { error: 'You’re signed out. Sign in again.' });
    const key = u.name.toLowerCase();
    if (url === '/api/me' && m === 'GET') return send(res, 200, { user: publicUser(u), save: cleanSave(u.save) });
    if (url === '/api/save' && (m === 'PUT' || m === 'POST')) {
      if (limited(ip + ':' + key, 'save', 120, 60 * 1000)) return send(res, 429, { error: 'Saving too often.' });
      const b = await readBody(req);
      if (!b || !b.save) return send(res, 400, { error: 'Nothing to save.' });
      u.save = mergeSave(u.save, b.save);
      u.saveAt = Date.now();
      persist();
      return send(res, 200, { save: u.save });
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

function init(ids) {
  mapIds = new Set(ids);
  load();
  const n = Object.keys(db.users).length;
  console.log(`accounts: ${n} account${n === 1 ? '' : 's'}, stored in ${FILE}`);
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { flushSync(); process.exit(0); });
  process.once('beforeExit', flushSync);
}

const nameTaken = (n) => !!db.users[String(n).toLowerCase()];

module.exports = { init, handle, nameForToken, nameTaken, flushSync, _mergeSave: mergeSave };
