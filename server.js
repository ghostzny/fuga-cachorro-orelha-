'use strict';
// Servidor multiplayer de Fuga do Cachorro Orelha — Node.js 20+, WebSocket nativo.
// Primeira etapa: salas de 2 jogadores com anfitrião como autoridade do estado do mundo.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 8080, MAXP = 2;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
const DATA = process.env.DATA_FILE || path.join(__dirname, 'data', 'campaigns.json');
const GAME = process.env.GAME_FILE || path.join(__dirname, 'public', 'index.html');
const GRACE = +process.env.RECONNECT_GRACE_MS || 60000;
const rooms = new Map(), sessions = new Map(); let camp = {}; const ipCount = new Map();
try { camp = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (e) {}
function persist() { try { fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify(camp)); } catch (e) { console.error('persist:', e.message); } }
const acceptKey = k => crypto.createHash('sha1').update(k + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
function frame(s) { const b = Buffer.from(s), n = b.length; let h; if (n < 126) h = Buffer.from([0x81, n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); } return Buffer.concat([h, b]); }
class Conn {
  constructor(sock, ip) { this.s = sock; this.ip = ip; this.buf = Buffer.alloc(0); this.alive = true; this.cnt = 0; this.win = Date.now(); this.sess = null;
    sock.on('data', d => this.data(d)); sock.on('close', () => this.close()); sock.on('error', () => this.close()); }
  send(o) { if (this.alive) try { this.s.write(frame(JSON.stringify(o))); } catch (e) {} }
  data(d) {
    this.buf = Buffer.concat([this.buf, d]); if (this.buf.length > 65536) return this.s.destroy();
    for (;;) { const b = this.buf; if (b.length < 2) return;
      const op = b[0] & 15, fin = b[0] & 128, mk = b[1] & 128; let n = b[1] & 127, o = 2;
      if (n === 126) { if (b.length < 4) return; n = b.readUInt16BE(2); o = 4; } else if (n === 127) { if (b.length < 10) return; n = Number(b.readBigUInt64BE(2)); o = 10; }
      if (!mk || !fin || n > 32768) return this.s.destroy();
      if (b.length < o + 4 + n) return;
      const m = b.slice(o, o + 4), p = Buffer.from(b.slice(o + 4, o + 4 + n)); for (let i = 0; i < n; i++) p[i] ^= m[i & 3];
      this.buf = b.slice(o + 4 + n);
      if (op === 8) { this.s.end(); return; }
      if (op === 9) { try { this.s.write(Buffer.concat([Buffer.from([0x8A, n]), p])); } catch (e) {} continue; }
      if (op !== 1) continue;
      const t = Date.now(); if (t - this.win > 1000) { this.win = t; this.cnt = 0; }
      if (++this.cnt > 60) { this.send({ t: 'err', m: 'Muitas mensagens.' }); return this.s.destroy(); }
      let j; try { j = JSON.parse(p.toString()); } catch (e) { continue; }
      if (j && typeof j === 'object') try { onMsg(this, j); } catch (e) { console.error('msg:', e.message); }
    }
  }
  close() { if (!this.alive) return; this.alive = false; onClose(this); }
}
const clean = s => String(s || '').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16) || 'Jogador';
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const mkcode = () => { for (;;) { const c = Array.from(crypto.randomBytes(6), b => ALPH[b % 32]).join(''); if (!rooms.has(c) && !camp[c]) return c; } };
const pub = r => ({ code: r.code, name: r.name, dif: r.dif, max: MAXP, host: r.host, started: r.started, ended: !!(camp[r.code] && camp[r.code].ended), pl: r.pl.map(p => ({ id: p.id, nm: p.nm, acc: p.acc, on: p.on })) });
const bc = (r, o, ex) => r.pl.forEach(p => { if (p.on && p.c && p.id !== ex) p.c.send(o); });
function dropPlayer(r, id) {
  r.pl = r.pl.filter(p => p.id !== id);
  if (!r.pl.length) { rooms.delete(r.code); return; }
  if (r.host === id) { const nh = r.pl.find(p => p.on) || r.pl[0]; r.host = nh.id; bc(r, { t: 'host', id: nh.id }); }
  bc(r, { t: 'room', room: pub(r) });
}
function onMsg(c, j) {
  if (j.t === 'hello') {
    let s = typeof j.sid === 'string' && sessions.get(j.sid);
    if (s) { if (s.c && s.c !== c) { try { s.c.s.destroy(); } catch (e) {} } clearTimeout(s.timer); }
    else { s = { sid: crypto.randomUUID(), id: crypto.randomBytes(3).toString('hex'), room: null }; sessions.set(s.sid, s); }
    s.c = c; c.sess = s; c.send({ t: 'hello', sid: s.sid, id: s.id });
    const r = s.room && rooms.get(s.room);
    if (r) { const p = r.pl.find(q => q.id === s.id);
      if (p) { p.on = true; p.c = c; if (camp[r.code] && camp[r.code].ended) { c.send({ t: 'end', reason: 'hardcore' }); return; }
        c.send({ t: 'room', room: pub(r) }); if (r.started) { c.send({ t: 'start', dif: r.dif, resume: 1 }); if (r.world) c.send({ t: 'world', state: r.world }); } bc(r, { t: 'room', room: pub(r) }, s.id); } }
    return;
  }
  const s = c.sess; if (!s) return c.send({ t: 'err', m: 'Envie hello primeiro.' });
  const r = s.room ? rooms.get(s.room) : null;
  if (j.t === 'create') {
    if (r) return c.send({ t: 'err', m: 'Você já está em uma sala.' });
    if (j.dif !== 'normal' && j.dif !== 'hardcore') return c.send({ t: 'err', m: 'Dificuldade inválida.' });
    const code = mkcode(), nr = { code, name: 'Sala ' + code, dif: j.dif, host: s.id, started: false, world: null, pl: [{ id: s.id, nm: clean(j.name), acc: 1, on: true, c, pos: null, attackAt: 0 }] };
    rooms.set(code, nr); s.room = code; camp[code] = { dif: j.dif, ended: false, t: Date.now() }; persist(); c.send({ t: 'room', room: pub(nr) });
  } else if (j.t === 'who' || j.t === 'join') {
    const code = String(j.code || '').toUpperCase().slice(0, 8), t = rooms.get(code);
    if (camp[code] && camp[code].ended) return c.send({ t: 'err', m: 'Campanha Hardcore encerrada por morte permanente.' });
    if (!t) return c.send({ t: 'err', m: 'Sala não encontrada.' });
    if (j.t === 'who') return c.send({ t: 'info', room: pub(t) });
    if (r) return c.send({ t: 'err', m: 'Você já está em uma sala.' });
    if (t.started) return c.send({ t: 'err', m: 'A partida já começou.' });
    if (t.pl.length >= MAXP) return c.send({ t: 'err', m: 'Sala cheia.' });
    if (t.dif === 'hardcore' && j.acc !== 1) return c.send({ t: 'err', m: 'É preciso aceitar as regras Hardcore.' });
    t.pl.push({ id: s.id, nm: clean(j.name), acc: 1, on: true, c, pos: null, attackAt: 0 }); s.room = code; bc(t, { t: 'room', room: pub(t) });
  } else if (!r) return c.send({ t: 'err', m: 'Você não está em uma sala.' });
  else if (j.t === 'leave') { s.room = null; dropPlayer(r, s.id); }
  else if (j.t === 'start') {
    if (r.host !== s.id) return c.send({ t: 'err', m: 'Só o anfitrião inicia a partida.' });
    if (r.started || !r.pl.every(p => p.acc === 1)) return;
    r.started = true; bc(r, { t: 'start', dif: r.dif }); bc(r, { t: 'room', room: pub(r) });
  } else if (j.t === 'pos') {
    if (!r.started) return; const f = v => Number.isFinite(v) && v >= -64 && v <= 2200;
    if (!f(j.x) || !f(j.y)) return;
    const pl = r.pl.find(p => p.id === s.id); if (!pl) return;
    const stage = ['main', 'snail', 'boss'].includes(j.stage) ? j.stage : 'main';
    const pos = { t: 'pos', id: s.id, x: Math.round(j.x), y: Math.round(j.y), fa: Number.isFinite(j.fa) ? +j.fa : 0, stage, ws: Number.isInteger(j.ws) ? Math.max(0, Math.min(3, j.ws)) : 0, mg: j.mg === 1, ammo: Number.isFinite(j.ammo) ? Math.max(0, Math.min(999, Math.floor(j.ammo))) : 0, mov: j.mov === true, run: j.run === true, invis: j.invis === true, slow: j.slow === true, it: Number.isFinite(j.it) ? Math.max(0, Math.min(5, j.it)) : 0 };
    pl.pos = pos; bc(r, pos, s.id);
  } else if (j.t === 'world') {
    if (!r.started || r.host !== s.id || !j.state || typeof j.state !== 'object') return;
    let raw; try { raw = JSON.stringify(j.state); } catch (e) { return; }
    if (raw.length > 28000) return;
    const st = j.state;
    if (!['main', 'snail', 'boss'].includes(st.stage) || !Array.isArray(st.enemies) || st.enemies.length > 180 || !Array.isArray(st.projectiles) || st.projectiles.length > 250) return;
    r.world = st; bc(r, { t: 'world', state: st }, s.id);
  } else if (j.t === 'hitPlayer') {
    if (!r.started || r.host !== s.id || typeof j.id !== 'string') return;
    const target = r.pl.find(p => p.id === j.id); if (target && target.on && target.c) target.c.send({ t: 'hitPlayer', by: s.id });
  } else if (j.t === 'attack') {
    if (!r.started || s.id === r.host) return;
    const pl = r.pl.find(p => p.id === s.id); if (!pl || !pl.pos || !Number.isFinite(j.a) || !Number.isInteger(j.w) || j.w < 0 || j.w > 3 || pl.pos.ws !== j.w) return;
    const now = Date.now(), minGap = j.w === 1 ? 450 : j.w === 2 ? 500 : j.w === 3 ? 110 : 180;
    if (now - (pl.attackAt || 0) < minGap) return;
    if (j.w === 3 && (!pl.pos.mg || pl.pos.ammo <= 0)) return;
    if (j.w === 3) pl.pos.ammo = Math.max(0, pl.pos.ammo - 1);
    pl.attackAt = now;
    const target = r.pl.find(p => p.id === r.host);
    if (target && target.on && target.c) target.c.send({ t: 'remoteAttack', id: s.id, w: j.w, a: Math.max(-Math.PI * 2, Math.min(Math.PI * 2, j.a)), stage: pl.pos.stage });
  } else if (j.t === 'dead') {
    if (!r.started || r.dif !== 'hardcore' || (camp[r.code] && camp[r.code].ended)) return;
    camp[r.code].ended = true; persist(); bc(r, { t: 'end', reason: 'hardcore', by: s.id });
  }
}
function onClose(c) {
  const s = c.sess; if (!s || s.c !== c) return; s.c = null;
  const r = s.room && rooms.get(s.room); if (!r) { sessions.delete(s.sid); return; }
  const p = r.pl.find(q => q.id === s.id); if (p) { p.on = false; p.c = null; }
  bc(r, { t: 'room', room: pub(r) });                       // desconexão NÃO é morte
  s.timer = setTimeout(() => { if (!s.c) { s.room = null; sessions.delete(s.sid); dropPlayer(r, s.id); } }, GRACE);
}
const server = http.createServer((req, res) => {
  const o = req.headers.origin; if (ORIGINS.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*'); else if (o && ORIGINS.includes(o)) res.setHeader('Access-Control-Allow-Origin', o);
  const u = req.url.split('?')[0];
  if (u === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (u === '/' || u === '/index.html') { fs.readFile(GAME, (e, d) => { if (e) { res.writeHead(404); return res.end('index.html não encontrado'); } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); }); return; }
  res.writeHead(404); res.end('404');
});
server.on('upgrade', (req, sock) => {
  const ip = (req.headers['x-forwarded-for'] || sock.remoteAddress || '').split(',')[0].trim(), o = req.headers.origin;
  if (req.url.split('?')[0] !== '/ws' || !req.headers['sec-websocket-key']) return sock.destroy();
  if (!ORIGINS.includes('*') && !(o && ORIGINS.includes(o))) { sock.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return sock.destroy(); }
  const n = (ipCount.get(ip) || 0); if (n >= 20) { sock.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return sock.destroy(); }
  ipCount.set(ip, n + 1); sock.on('close', () => ipCount.set(ip, Math.max(0, (ipCount.get(ip) || 1) - 1)));
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acceptKey(req.headers['sec-websocket-key']) + '\r\n\r\n');
  new Conn(sock, ip);
});
function shutdown() { persist(); for (const s of sessions.values()) if (s.c) s.c.send({ t: 'closed' }); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
if (require.main === module) server.listen(PORT, () => console.log('Servidor na porta ' + PORT));
module.exports = { server, rooms, camp, sessions };
