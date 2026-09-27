/**
 * DEV MOCK ONLY — tiny local room server for exercising the multiplayer client
 * without Cloudflare/wrangler. NOT the real server (that lives in server/, owned
 * by Dealer). Conforms to src/multiplayer/protocol.ts routes/messages:
 *
 *   POST /api/rooms          -> { code }
 *   GET  /api/rooms/:code    -> { code, exists, seatsFree, phase } | 404
 *   WS   /room/:code         -> join/takeSeat/start/action/nextHand/leave/ping
 *
 * Run (needs vite-node to import the TS engine, no extra deps):
 *   npx vite-node scripts/mock-room-server.mjs            # port 8787
 *   PORT=8790 npx vite-node scripts/mock-room-server.mjs
 *
 * Uses a hand-rolled RFC6455 text-frame WebSocket (no `ws` dependency).
 * Simplifications: no hibernation/persistence, no origin checks / rate limits,
 * deadline is advisory (no auto-action), instant bots.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import {
  applyAction,
  createInitialState,
  runBotsUntilHuman,
  startHand,
  toPublicView,
} from '../src/poker/index.ts';
import {
  MIN_HUMANS_TO_START,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
} from '../src/multiplayer/protocol.ts';

const PORT = Number(process.env.PORT || 8787);
const SEATS = 6;
const CONFIG = { smallBlind: 1, bigBlind: 2, startingStack: 200, seats: SEATS };

/** @type {Map<string, any>} */
const rooms = new Map();

function newCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
  return rooms.has(c) ? newCode() : c;
}

function makeRoom(code) {
  const room = { code, phase: 'lobby', hostId: null, players: new Map(), seats: Array(SEATS).fill(null), state: null };
  rooms.set(code, room);
  return room;
}

// ───────────────────────── minimal WebSocket ─────────────────────────
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  const conn = { socket, open: true, onmessage: () => {}, onclose: () => {} };
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      const masked = (buf[1] & 0x80) !== 0;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (masked) { const m = buf.subarray(maskOff, maskOff + 4); payload = Buffer.from(payload.map((b, i) => b ^ m[i % 4])); }
      buf = buf.subarray(off + len);
      if (op === 0x1) conn.onmessage(payload.toString('utf8'));
      else if (op === 0x8) { wsClose(conn); return; }
      else if (op === 0x9) writeFrame(conn, 0xa, payload);
    }
  });
  const done = () => { if (conn.open) { conn.open = false; conn.onclose(); } };
  socket.on('close', done);
  socket.on('error', done);
  return conn;
}
function writeFrame(conn, op, payload) {
  if (!conn.open) return;
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  conn.socket.write(Buffer.concat([head, payload]));
}
function wsSend(conn, msg) { writeFrame(conn, 0x1, Buffer.from(JSON.stringify(msg))); }
function wsClose(conn) { if (!conn.open) return; writeFrame(conn, 0x8, Buffer.alloc(0)); conn.socket.end(); conn.open = false; conn.onclose(); }

// ───────────────────────── room logic ─────────────────────────
function lobbyFor(room, player) {
  return {
    type: 'lobby',
    protocolVersion: PROTOCOL_VERSION,
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    handNumber: room.state?.handNumber ?? 0,
    seats: room.seats.map((pid, seat) => {
      const p = pid ? room.players.get(pid) : null;
      const st = room.state?.players[seat];
      if (p) return { seat, kind: 'human', playerId: p.id, name: p.name, connected: p.conns.size > 0, pending: false, stack: st?.stack ?? null };
      if (st) return { seat, kind: 'bot', name: st.name, stack: st.stack };
      return { seat, kind: 'empty', name: '', stack: null };
    }),
    players: [...room.players.values()].map((p) => ({
      playerId: p.id, name: p.name, seat: p.seat, connected: p.conns.size > 0,
      isHost: p.id === room.hostId, pending: false, sittingOut: false,
    })),
    you: player ? { playerId: player.id, seat: player.seat, seatToken: player.token, isHost: player.id === room.hostId } : null,
    minHumansToStart: MIN_HUMANS_TO_START,
    config: CONFIG,
  };
}
function each(room, fn) { for (const p of room.players.values()) for (const c of p.conns) fn(p, c); }
function broadcastLobby(room) { each(room, (p, c) => wsSend(c, lobbyFor(room, p))); }
function tableFor(room, p) {
  const s = room.state;
  const acting = s.actingSeat >= 0 ? s.players[s.actingSeat] : null;
  const humanTurn = acting && acting.style === 'human' && s.street !== 'handOver';
  if (!humanTurn) room.deadline = null;
  else if (!room.deadline || room.deadlineKey !== `${s.handNumber}:${s.street}:${s.actingSeat}:${s.log.length}`) {
    room.deadlineKey = `${s.handNumber}:${s.street}:${s.actingSeat}:${s.log.length}`;
    room.deadline = Date.now() + 30_000;
  }
  return {
    type: 'table',
    view: toPublicView(s, p.seat),
    yourSeat: p.seat,
    turnDeadline: room.deadline,
    serverNow: Date.now(),
  };
}
function broadcastTable(room) {
  if (!room.state) return;
  each(room, (p, c) => wsSend(c, tableFor(room, p)));
  if (room.state.street === 'handOver') room.phase = 'handOver';
}
function others(room, player, msg) { each(room, (p, c) => { if (p !== player) wsSend(c, msg); }); }

function deal(room) {
  if (!room.state) {
    const humanSeats = [];
    const names = {};
    room.seats.forEach((pid, seat) => { if (pid) { humanSeats.push(seat); names[seat] = room.players.get(pid).name; } });
    room.state = createInitialState(CONFIG, { heroSeat: -1, humanSeats, names });
  }
  // Auto-rebuy busted stacks between hands.
  room.state = { ...room.state, players: room.state.players.map((pl) => (pl.stack <= 0 ? { ...pl, stack: CONFIG.startingStack } : pl)) };
  room.state = runBotsUntilHuman(startHand(room.state));
  room.phase = 'inHand';
  broadcastLobby(room);
  broadcastTable(room);
}

function handle(room, conn, ctx, msg) {
  const err = (code, message) => wsSend(conn, { type: 'error', code, message, requestType: msg.type });
  if (msg.type === 'ping') {
    const now = Date.now();
    return wsSend(conn, { type: 'pong', t: msg.t, serverNow: now, serverTime: now });
  }
  if (msg.type === 'join' || msg.type === 'create') {
    let p = msg.seatToken ? [...room.players.values()].find((x) => x.token === msg.seatToken) : null;
    if (msg.seatToken && !p) return err('badToken', 'Seat token not recognised');
    if (p) {
      const wasAway = p.conns.size === 0;
      p.conns.add(conn);
      ctx.player = p;
      if (wasAway) others(room, p, { type: 'playerReconnected', playerId: p.id, seat: p.seat, name: p.name });
    } else {
      const free = room.seats.findIndex((x) => x == null);
      if (free < 0 || room.phase !== 'lobby') return err('roomFull', 'No free seats (mock: join before start)');
      p = { id: crypto.randomUUID(), token: crypto.randomBytes(16).toString('hex'), name: String(msg.name || 'Player').slice(0, 20), seat: free, conns: new Set([conn]) };
      room.players.set(p.id, p);
      room.seats[free] = p.id;
      if (!room.hostId) room.hostId = p.id;
      ctx.player = p;
    }
    broadcastLobby(room);
    if (room.state) wsSend(conn, tableFor(room, p));
    return;
  }
  const p = ctx.player;
  if (!p) return err('notJoined', 'Send join first');
  switch (msg.type) {
    case 'takeSeat': {
      if (room.phase !== 'lobby') return err('handInProgress', 'Seats locked once the game starts (mock)');
      const seat = msg.seat ?? room.seats.findIndex((x) => x == null);
      if (seat < 0 || seat >= SEATS || room.seats[seat]) return err('seatTaken', 'Seat taken');
      room.seats[p.seat] = null; room.seats[seat] = p.id; p.seat = seat;
      return broadcastLobby(room);
    }
    case 'start':
    case 'nextHand': {
      if (p.id !== room.hostId) return err('notHost', 'Only the host can deal');
      if (room.phase === 'inHand') return err('handInProgress', 'Hand in progress');
      const humans = room.seats.filter(Boolean).length;
      if (!room.state && humans < MIN_HUMANS_TO_START) return err('notEnoughPlayers', `Need ${MIN_HUMANS_TO_START} players`);
      return deal(room);
    }
    case 'action': {
      const s = room.state;
      if (!s || s.actingSeat !== p.seat) return err('notYourTurn', 'Not your turn');
      if (msg.handNumber != null && msg.handNumber !== s.handNumber) return err('staleHand', 'Stale hand');
      // Sizing: `raiseTo` = street total (UI value) → engine wants chips added.
      const a = msg.action ?? {};
      const actor = s.players[s.actingSeat];
      const engineAction =
        (a.type === 'bet' || a.type === 'raise') && typeof a.raiseTo === 'number'
          ? { type: a.type, amount: a.raiseTo - actor.betThisStreet }
          : { type: a.type, ...(typeof a.amount === 'number' ? { amount: a.amount } : {}) };
      try { room.state = runBotsUntilHuman(applyAction(s, engineAction)); }
      catch (e) { return err('illegalAction', String(e?.message ?? e)); }
      broadcastTable(room);
      if (room.state.street === 'handOver') broadcastLobby(room);
      return;
    }
    case 'leave': {
      room.players.delete(p.id);
      if (room.phase === 'lobby') room.seats[p.seat] = null;
      if (room.hostId === p.id) room.hostId = [...room.players.values()][0]?.id ?? null;
      others(room, p, { type: 'playerLeft', playerId: p.id, seat: p.seat, name: p.name });
      ctx.player = null;
      return broadcastLobby(room);
    }
    default:
      return err('badMessage', `Unknown type ${msg.type}`);
  }
}

// ───────────────────────── http ─────────────────────────
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (code, body) => { res.writeHead(code, { ...CORS, 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method === 'POST' && url.pathname === '/api/rooms') { const room = makeRoom(newCode()); return json(200, { code: room.code }); }
  const m = url.pathname.match(/^\/api\/rooms\/([A-Z]+)$/);
  if (req.method === 'GET' && m) {
    const room = rooms.get(m[1]);
    if (!room) return json(404, { code: m[1], exists: false, seatsFree: 0, phase: 'lobby' });
    return json(200, { code: room.code, exists: true, seatsFree: room.seats.filter((x) => !x).length, phase: room.phase });
  }
  json(404, { error: 'not found' });
});
server.on('upgrade', (req, socket) => {
  const m = new URL(req.url, 'http://x').pathname.match(/^\/room\/([A-Z]+)$/);
  const conn = wsAccept(req, socket);
  if (!m) { wsSend(conn, { type: 'error', code: 'badMessage', message: 'bad path' }); return wsClose(conn); }
  const room = rooms.get(m[1]);
  if (!room) { wsSend(conn, { type: 'error', code: 'roomNotFound', message: `Room ${m[1]} not found` }); return wsClose(conn); }
  const ctx = { player: null };
  conn.onmessage = (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    try { handle(room, conn, ctx, msg); } catch (e) { console.error(e); }
  };
  conn.onclose = () => {
    const p = ctx.player;
    if (!p) return;
    p.conns.delete(conn);
    if (p.conns.size === 0 && room.players.has(p.id)) {
      others(room, p, { type: 'playerDisconnected', playerId: p.id, seat: p.seat, name: p.name });
      broadcastLobby(room);
    }
  };
});
server.listen(PORT, () => console.log(`[mock-room-server] DEV MOCK listening on http://localhost:${PORT}`));
