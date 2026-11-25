'use strict';
/*
 * Shred Slope server
 * - serves the game from ./public
 * - runs 3 multiplayer servers (rooms), max 10 riders each
 * - race rounds: countdown -> race -> results -> next round
 * - rider accounts (sign up / sign in, saved progress): see accounts.js
 * No dependencies: plain Node.js 18+ (the WebSocket protocol is implemented below).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const accounts = require('./accounts');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_PLAYERS = 10;
const TICK_MS = 1000 / 12;
const COUNTDOWN_MS = Number(process.env.COUNTDOWN_MS) || 10000;
const RACE_MAX_MS = Number(process.env.RACE_MAX_MS) || 240000;
const RESULTS_MS = Number(process.env.RESULTS_MS) || 12000;
const MAX_FRAME = 16384; // voice chat offers (SDP) run to a few kB
// multiplayer is for signed-in riders; MP_GUESTS=1 lets guests in too (handy for testing)
const MP_GUESTS = process.env.MP_GUESTS === '1';
// voice chat connects riders directly (WebRTC). STUN finds a route through most home routers; some school and
// office networks also need a TURN relay, which you can add as JSON in ICE_SERVERS, e.g.
// [{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]
let ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
try { if (process.env.ICE_SERVERS) ICE_SERVERS = JSON.parse(process.env.ICE_SERVERS); } catch (e) { console.warn('ICE_SERVERS is not valid JSON, using STUN only'); }
const LATE_JOIN_MS = 30000;

// the mountains the servers ride (ids match public/js/world.js): one course for now
const MAPS = [
  { id: 'resort', name: 'Pine Valley' },
];

accounts.init(MAPS);
const ITEMS = require('./public/js/items.js');

const SERVER_DEFS = [
  { id: 1, name: 'Server 1 · Avalanche' },
  { id: 2, name: 'Server 2 · Powder Peak' },
  { id: 3, name: 'Server 3 · Black Diamond' },
];

// ------------------------------------------------------------------ static files
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};
const fileCache = new Map();

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const key = file + ':' + st.mtimeMs;
    let entry = fileCache.get(key);
    if (!entry) {
      const raw = fs.readFileSync(file);
      entry = { raw, gz: /text|javascript|json|svg/.test(type) ? zlib.gzipSync(raw) : null };
      fileCache.set(key, entry);
    }
    const gzip = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const body = gzip ? entry.gz : entry.raw;
    // pictures rarely change: let the browser keep them for a day; code and pages are checked every time
    const headers = { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': /^image\/(jpeg|webp|png)/.test(type) ? 'public, max-age=86400' : 'no-cache' };
    if (gzip) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}

// ------------------------------------------------------------------ minimal WebSocket (RFC 6455)
class WSConn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.closed = false;
    this.lastSeen = Date.now();
    this.onmessage = null;
    this.onclose = null;
    socket.setNoDelay(true);
    socket.on('data', (d) => this.data(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  data(chunk) {
    this.lastSeen = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (!this.closed) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        if (b.readUInt32BE(2) !== 0) return this.close(1009);
        len = b.readUInt32BE(6);
        off = 10;
      }
      if (len > MAX_FRAME) return this.close(1009);
      if (!masked) return this.close(1002); // clients must mask
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      this.frame(fin, op, payload);
    }
  }

  frame(fin, op, payload) {
    if (op === 0x8) return this.close(1000);
    if (op === 0x9) return this.raw(0xa, payload);
    if (op === 0xa) return;
    if (op === 0x1 || op === 0x0) {
      this.frags.push(payload);
      if (this.frags.reduce((n, p) => n + p.length, 0) > MAX_FRAME) return this.close(1009);
      if (!fin) return;
      const text = Buffer.concat(this.frags).toString('utf8');
      this.frags = [];
      if (this.onmessage) this.onmessage(text);
    }
  }

  raw(op, payload) {
    if (this.closed) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeUInt32BE(0, 2);
      head.writeUInt32BE(len, 6);
    }
    try {
      this.socket.write(Buffer.concat([head, payload]));
    } catch (e) {
      this.finish();
    }
  }

  send(text) {
    this.raw(0x1, Buffer.from(text, 'utf8'));
  }

  ping() {
    this.raw(0x9, Buffer.alloc(0));
  }

  close(code) {
    if (this.closed) return;
    const p = Buffer.alloc(2);
    p.writeUInt16BE(code || 1000, 0);
    this.raw(0x8, p);
    this.finish();
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    try { this.socket.end(); } catch (e) { /* ignore */ }
    setTimeout(() => { try { this.socket.destroy(); } catch (e) { /* ignore */ } }, 1000);
    if (this.onclose) this.onclose();
  }
}

function acceptUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  return new WSConn(socket);
}

// ------------------------------------------------------------------ rooms
let nextId = 1;
const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

function cleanName(s) {
  s = String(s || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
  return s || 'Rider' + Math.floor(100 + Math.random() * 900);
}

class Room {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    this.players = new Map();
    this.phase = 'idle';
    this.ends = 0;
    this.seed = 0;
    this.round = 0;
    this.mapIdx = (def.id - 1) % MAPS.length; // each server starts on a different mountain
    this.racers = new Set();
    this.results = [];
    this.timer = null;
    this.raceStart = 0;
    this.gone = new Map(); // finished riders who left before the results
    this.votes = new Map(); // player id -> map index they want next
  }

  // the mountain the next round will use: the most votes (a tie goes to one of them), else the next in turn
  nextMapIdx() {
    const n = new Map();
    for (const i of this.votes.values()) n.set(i, (n.get(i) || 0) + 1);
    if (!n.size) return (this.mapIdx + 1) % MAPS.length;
    const top = Math.max(...n.values());
    const best = [...n.keys()].filter((i) => n.get(i) === top);
    if (this._tie != null && best.includes(this._tie)) return this._tie;
    this._tie = best[(Math.random() * best.length) | 0];
    return this._tie;
  }
  votesMsg() {
    const counts = {};
    for (const i of this.votes.values()) counts[MAPS[i].id] = (counts[MAPS[i].id] || 0) + 1;
    return { t: 'votes', counts, next: MAPS[this.nextMapIdx()].id, mine: null };
  }
  sendVotes() {
    const base = this.votesMsg();
    for (const p of this.players.values()) this.send(p, Object.assign({}, base, { mine: this.votes.has(p.id) ? MAPS[this.votes.get(p.id)].id : null }));
  }

  info() {
    // between rounds, show the mountain the next round will use
    const between = (this.phase === 'results' || this.phase === 'idle') && this.round > 0;
    const map = MAPS[between ? this.nextMapIdx() : this.mapIdx];
    return { id: this.id, name: this.name, players: this.players.size, max: MAX_PLAYERS, phase: this.phase, map: map.id, mapName: map.name };
  }

  send(p, obj) {
    p.conn.send(JSON.stringify(obj));
  }

  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) if (p !== except) p.conn.send(s);
  }

  phaseMsg() {
    const m = { t: 'phase', phase: this.phase, seed: this.seed, map: MAPS[this.mapIdx].id, round: this.round, ends: Math.max(0, this.ends - Date.now()), racers: [...this.racers] };
    if (this.phase === 'results') m.results = this.results;
    return m;
  }

  setPhase(phase, ms) {
    this.phase = phase;
    this.ends = Date.now() + ms;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.next(), ms);
    this.broadcast(this.phaseMsg());
    log(`[${this.name}] ${phase} (round ${this.round}, ${this.players.size} riders)`);
  }

  next() {
    if (this.phase === 'countdown') {
      if (!this.players.size) return this.idle();
      this.startRace();
    } else if (this.phase === 'racing') {
      this.endRace();
    } else if (this.phase === 'results') {
      if (this.players.size) this.startCountdown();
      else this.idle();
    }
  }

  idle() {
    clearTimeout(this.timer);
    this.phase = 'idle';
    this.racers.clear();
    this.votes.clear();
  }

  startCountdown() {
    this.seed = (Math.random() * 2147483647) | 0;
    if (this.round > 0) this.mapIdx = this.nextMapIdx();
    const voted = this.votes.size > 0;
    this.votes.clear();
    this._tie = null;
    if (voted) this.sendVotes();
    this.round++;
    this.racers = new Set(this.players.keys());
    for (const p of this.players.values()) this.resetPlayer(p);
    this.setPhase('countdown', COUNTDOWN_MS);
  }

  resetPlayer(p) {
    p.state = null;
    p.score = 0;
    p.dist = 0;
    p.fin = false;
    p.time = 0;
  }

  startRace() {
    this.raceStart = Date.now();
    this.setPhase('racing', RACE_MAX_MS);
  }

  endRace() {
    const rows = [];
    for (const id of this.racers) {
      const p = this.players.get(id) || this.gone.get(id);
      if (!p) continue;
      rows.push({ id: p.id, name: p.name, color: p.color, score: Math.round(p.score), time: p.time, fin: p.fin, dist: Math.round(p.dist) });
    }
    rows.sort((a, b) => (b.fin - a.fin) || (b.score - a.score) || (b.dist - a.dist));
    // coins for the podium (and a little for everyone who finished) when at least two rode it
    if (rows.length >= 2) {
      rows.forEach((r, i) => {
        const p = this.players.get(r.id) || this.gone.get(r.id);
        if (!p || !p.account || !r.fin) return;
        const n = i < ITEMS.RACE_PRIZES.length ? ITEMS.RACE_PRIZES[i] : ITEMS.RACE_FINISH;
        const total = accounts.award(p.account, n);
        r.coins = n;
        if (total != null && this.players.has(p.id)) this.send(p, { t: 'coins', earned: n, coins: total, place: i + 1 });
      });
    }
    this.results = rows;
    this.gone.clear();
    this.setPhase('results', RESULTS_MS);
  }

  checkRaceOver() {
    if (this.phase !== 'racing') return;
    let anyLeft = false;
    for (const id of this.racers) {
      const p = this.players.get(id);
      if (p && !p.fin) anyLeft = true;
    }
    if (!anyLeft) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.endRace(), 2500);
    }
  }

  // the outfit the rider picked, unless someone on this server already wears it
  freeColor(pref) {
    const used = new Set([...this.players.values()].map((p) => p.color));
    if (Number.isInteger(pref) && pref >= 0 && pref < MAX_PLAYERS && !used.has(pref)) return pref;
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return 0;
  }

  join(conn, name, pref, account) {
    if (this.players.size >= MAX_PLAYERS) {
      conn.send(JSON.stringify({ t: 'full' }));
      conn.close(1000);
      return null;
    }
    // signed-in riders race under their account name; a guest can't borrow someone's account name
    let n = account || cleanName(name);
    if (!account && accounts.nameTaken(n)) n = cleanName(name).slice(0, 10) + ' guest';
    const names = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    for (let k = 2; names.has(n.toLowerCase()); k++) n = cleanName(name).slice(0, 13) + ' ' + k;
    const p = { id: nextId++, name: n, account: account || null, look: account ? accounts.lookFor(account) : null, color: this.freeColor(pref), conn, state: null, score: 0, dist: 0, fin: false, time: 0, voice: false };
    this.players.set(p.id, p);
    // join the current round during the countdown, or in the first 30 s of a race (you start at the top)
    const joinsRound = this.phase === 'countdown' || (this.phase === 'racing' && Date.now() - this.raceStart < LATE_JOIN_MS);
    if (joinsRound) this.racers.add(p.id);
    this.send(p, Object.assign(this.phaseMsg(), {
      t: 'welcome',
      id: p.id,
      name: p.name,
      color: p.color,
      server: { id: this.id, name: this.name, max: MAX_PLAYERS },
      players: [...this.players.values()].map((q) => ({ id: q.id, name: q.name, color: q.color, look: q.look, voice: q.voice })),
      ice: ICE_SERVERS,
      votes: this.votesMsg(),
    }));
    this.broadcast({ t: 'join', p: { id: p.id, name: p.name, color: p.color, look: p.look }, racers: [...this.racers] }, p);
    log(`[${this.name}] + ${p.name} (${this.players.size}/${MAX_PLAYERS})`);
    if (this.phase === 'idle') this.startCountdown();
    return p;
  }

  leave(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    if (this.racers.has(p.id) && p.fin) this.gone.set(p.id, p);
    this.broadcast({ t: 'leave', id: p.id });
    if (this.votes.delete(p.id)) this.sendVotes();
    log(`[${this.name}] - ${p.name} (${this.players.size}/${MAX_PLAYERS})`);
    if (!this.players.size && this.phase !== 'results') this.idle();
    else this.checkRaceOver();
  }

  message(p, text) {
    let m;
    try { m = JSON.parse(text); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 's': {
        if (!Array.isArray(m.d) || m.d.length !== 11) return;
        const d = m.d.map((v) => num(v, -1e6, 1e6));
        p.state = d;
        if (this.phase === 'racing' && this.racers.has(p.id) && !p.fin) {
          p.score = num(d[9], 0, 1e7);
          p.dist = num(d[10], 0, 1e5);
        }
        break;
      }
      case 'fin':
        if (this.phase === 'racing' && this.racers.has(p.id) && !p.fin) {
          p.fin = true;
          p.score = num(m.score, 0, 1e7);
          p.time = num(m.time, 0, RACE_MAX_MS);
          p.dist = num(m.dist, 0, 1e5);
          this.broadcast({ t: 'feed', id: p.id, txt: 'FINISHED' });
          this.checkRaceOver();
        }
        break;
      case 'ev': {
        const txt = String(m.txt || '').toUpperCase().replace(/[^A-Z0-9 +\-!,.]/g, '').slice(0, 40);
        if (txt) this.broadcast({ t: 'feed', id: p.id, txt }, p);
        break;
      }
      case 'ping':
        this.send(p, { t: 'pong', c: num(m.c, 0, 1e15) });
        break;
      // vote for the next mountain (vote for the same one again to take it back)
      case 'vote': {
        const i = MAPS.findIndex((q) => q.id === m.map);
        if (i < 0) return;
        if (this.votes.get(p.id) === i) this.votes.delete(p.id);
        else this.votes.set(p.id, i);
        // during the countdown, a mountain that more than half the server wants is ridden right away
        if (this.phase === 'countdown' && i !== this.mapIdx && this.ends - Date.now() > 1500) {
          let n = 0;
          for (const v of this.votes.values()) if (v === i) n++;
          if (n * 2 > this.players.size) {
            this.mapIdx = i;
            this.seed = (Math.random() * 2147483647) | 0;
            this.votes.clear();
            this._tie = null;
            for (const q of this.players.values()) this.resetPlayer(q);
            this.racers = new Set(this.players.keys());
            this.broadcast({ t: 'feed', id: p.id, txt: 'MAP CHANGED' });
            this.setPhase('countdown', COUNTDOWN_MS);
          }
        }
        this.sendVotes();
        break;
      }
      // voice chat: who has it on, and passing connection details between two riders who both do
      case 'vc':
        p.voice = !!m.on;
        this.broadcast({ t: 'vc', id: p.id, on: p.voice }, p);
        break;
      case 'rtc': {
        const q = this.players.get(m.to);
        if (!q || q === p || !p.voice || !q.voice || !m.d || typeof m.d !== 'object') return;
        this.send(q, { t: 'rtc', from: p.id, d: m.d });
        break;
      }
    }
  }

  tick() {
    if (!this.players.size || this.phase === 'idle') return;
    const snap = [];
    for (const p of this.players.values()) if (p.state) snap.push([p.id, ...p.state]);
    if (snap.length) this.broadcast({ t: 'snap', p: snap });
  }
}

const rooms = new Map(SERVER_DEFS.map((d) => [d.id, new Room(d)]));

function log(s) {
  console.log(new Date().toISOString().slice(11, 19) + ' ' + s);
}

// ------------------------------------------------------------------ http server
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (url === '/api/servers') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ servers: [...rooms.values()].map((r) => r.info()) }));
  }
  if (url.startsWith('/api/auth/') || ['/api/me', '/api/save', '/api/wallet', '/api/run', '/api/cups', '/api/shop/buy', '/api/locker/equip', '/api/inbox/seen'].includes(url)) return accounts.handle(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  serveStatic(req, res);
});

server.on('upgrade', (req, socket) => {
  let u;
  try { u = new URL(req.url, 'http://local'); } catch (e) { return socket.destroy(); }
  if (u.pathname !== '/ws') return socket.destroy();
  const room = rooms.get(Number(u.searchParams.get('server')));
  if (!room) {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }
  const conn = acceptUpgrade(req, socket);
  if (!conn) return;
  let player = null;
  let budget = 40, rtcBudget = 200; // voice setup sends a burst of messages, so it gets its own allowance
  const refill = setInterval(() => { budget = 40; rtcBudget = 200; }, 1000);
  const hello = setTimeout(() => { if (!player) conn.close(1008); }, 10000);
  conn.onmessage = (text) => {
    if (text.startsWith('{"t":"rtc"') ? --rtcBudget < 0 : --budget < 0) return; // too chatty: drop
    if (!player) {
      let m;
      try { m = JSON.parse(text); } catch (e) { return; }
      if (m && m.t === 'hello') {
        clearTimeout(hello);
        const acct = accounts.nameForToken(m.token);
        if (!acct && !MP_GUESTS) {
          conn.send(JSON.stringify({ t: 'needAccount' }));
          conn.close(1000);
          return;
        }
        player = room.join(conn, m.name, m.color, acct);
      }
      return;
    }
    room.message(player, text);
  };
  conn.onclose = () => {
    clearInterval(refill);
    clearTimeout(hello);
    if (player) room.leave(player);
  };
  conns.add(conn);
});

const conns = new Set();
setInterval(() => {
  for (const r of rooms.values()) r.tick();
}, TICK_MS);
setInterval(() => {
  const now = Date.now();
  for (const c of conns) {
    if (c.closed) conns.delete(c);
    else if (now - c.lastSeen > 45000) c.close(1001);
    else c.ping();
  }
}, 20000);

server.listen(PORT, '0.0.0.0', () => {
  log(`Shred Slope running on port ${PORT} with ${rooms.size} servers (max ${MAX_PLAYERS} riders each)`);
});
