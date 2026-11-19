'use strict';
/*
 * Shred Slope server
 * - serves the game from ./public
 * - runs 3 multiplayer servers (rooms), max 10 riders each
 * - race rounds: countdown -> race -> results -> next round
 * No dependencies: plain Node.js 18+ (the WebSocket protocol is implemented below).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MAX_PLAYERS = 10;
const TICK_MS = 1000 / 12;
const COUNTDOWN_MS = Number(process.env.COUNTDOWN_MS) || 10000;
const RACE_MAX_MS = Number(process.env.RACE_MAX_MS) || 240000;
const RESULTS_MS = Number(process.env.RESULTS_MS) || 12000;
const MAX_FRAME = 4096;
const LATE_JOIN_MS = 30000;

// the mountains rotate every round (ids match public/js/world.js)
const MAPS = [
  { id: 'night', name: 'Floodlit Night' },
  { id: 'bluebird', name: 'Bluebird Peak' },
  { id: 'sunset', name: 'Golden Ridge' },
  { id: 'woods', name: 'Moonlit Woods' },
  { id: 'cave', name: 'Crystal Caverns' },
  { id: 'bigair', name: 'Big Air Valley' },
  { id: 'railking', name: 'Rail Kingdom' },
  { id: 'triple', name: 'Triple Giants' },
  { id: 'slopestyle', name: 'Gold Medal Slopestyle' },
  { id: 'jumpline', name: 'Jump Line' },
  { id: 'cliffs', name: 'Cliff Drops' },
  { id: 'neon', name: 'Neon Park' },
  { id: 'bigairfinal', name: 'Big Air Final' },
  { id: 'superpipe', name: 'Superpipe Final' },
  { id: 'sbx', name: 'Snowboard Cross' },
  { id: 'slopequal', name: 'Slopestyle Qualifier' },
  { id: 'oly14', name: 'Sochi 2014 Slopestyle' },
  { id: 'oly18', name: 'PyeongChang 2018 Slopestyle' },
  { id: 'oly22', name: 'Beijing 2022 Slopestyle' },
  { id: 'oly26', name: 'Livigno 2026 Slopestyle' },
  { id: 'yog12', name: 'Innsbruck 2012 Youth Park' },
  { id: 'yog20', name: 'Lausanne 2020 Youth Park' },
  { id: 'yog24', name: 'Gangwon 2024 Youth Park' },
];

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
    const headers = { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-cache' };
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
  }

  info() {
    // between rounds, show the mountain the next round will use
    const between = (this.phase === 'results' || this.phase === 'idle') && this.round > 0;
    const map = MAPS[(this.mapIdx + (between ? 1 : 0)) % MAPS.length];
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
  }

  startCountdown() {
    this.seed = (Math.random() * 2147483647) | 0;
    if (this.round > 0) this.mapIdx = (this.mapIdx + 1) % MAPS.length;
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

  join(conn, name, pref) {
    if (this.players.size >= MAX_PLAYERS) {
      conn.send(JSON.stringify({ t: 'full' }));
      conn.close(1000);
      return null;
    }
    let n = cleanName(name);
    const names = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    for (let k = 2; names.has(n.toLowerCase()); k++) n = cleanName(name).slice(0, 13) + ' ' + k;
    const p = { id: nextId++, name: n, color: this.freeColor(pref), conn, state: null, score: 0, dist: 0, fin: false, time: 0 };
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
      players: [...this.players.values()].map((q) => ({ id: q.id, name: q.name, color: q.color })),
    }));
    this.broadcast({ t: 'join', p: { id: p.id, name: p.name, color: p.color }, racers: [...this.racers] }, p);
    log(`[${this.name}] + ${p.name} (${this.players.size}/${MAX_PLAYERS})`);
    if (this.phase === 'idle') this.startCountdown();
    return p;
  }

  leave(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    if (this.racers.has(p.id) && p.fin) this.gone.set(p.id, p);
    this.broadcast({ t: 'leave', id: p.id });
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
  let budget = 40;
  const refill = setInterval(() => { budget = 40; }, 1000);
  const hello = setTimeout(() => { if (!player) conn.close(1008); }, 10000);
  conn.onmessage = (text) => {
    if (--budget < 0) return; // too chatty: drop
    if (!player) {
      let m;
      try { m = JSON.parse(text); } catch (e) { return; }
      if (m && m.t === 'hello') {
        clearTimeout(hello);
        player = room.join(conn, m.name, m.color);
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
