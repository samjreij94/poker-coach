// Local smoke test against `wrangler dev` (default http://localhost:8787).
// Creates a room over HTTP, joins 4 WebSocket clients, host starts, everyone
// plays check/call until a few hands complete. Verifies no foreign hole cards.
import WebSocket from 'ws';

const BASE = process.env.ROOM_SERVER_URL ?? 'http://localhost:8787';
const HANDS = Number(process.env.HANDS ?? 3);
const WS_BASE = BASE.replace(/^http/, 'ws');

const fail = (m) => {
  console.error('SMOKE FAIL:', m);
  process.exit(1);
};
setTimeout(() => fail('timeout'), 60_000).unref();

const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { Origin: 'https://samjreij94.github.io' } });
if (!res.ok) fail(`create ${res.status}`);
console.log('CORS:', res.headers.get('access-control-allow-origin'));
const { code } = await res.json();
console.log('room code', code);
const info = await (await fetch(`${BASE}/api/rooms/${code}`)).json();
console.log('info', info);

const names = ['Ann', 'Bo', 'Cy', 'Di'];
const clients = [];
let handsDone = 0;
let leaksChecked = 0;
let actionsSent = 0;
let started = false;

function open(name, i) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS_BASE}/room/${code}`);
    const c = { name, ws, seat: null, token: null, i, lastHand: 0, lastActed: '' };
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', code, name }));
    });
    ws.on('message', (data) => onMsg(c, JSON.parse(String(data)), resolve));
    ws.on('error', (e) => fail(`${name} ws error ${e.message}`));
    clients.push(c);
  });
}

function onMsg(c, msg, resolveJoin) {
  if (msg.type === 'lobby') {
    c.seat = msg.you?.seat ?? null;
    c.token = msg.you?.seatToken;
    c.isHost = msg.you?.isHost;
    resolveJoin?.(c);
  } else if (msg.type === 'error') {
    console.log(`  [${c.name}] error ${msg.code}: ${msg.message}`);
  } else if (msg.type === 'handResult') {
    if (c.i === 0) {
      handsDone++;
      console.log(`hand #${msg.handNumber}: ${msg.result.why} (pot $${msg.result.potTotal})`);
      if (handsDone >= HANDS) finish();
      else setTimeout(() => c.ws.send(JSON.stringify({ type: 'nextHand' })), 50);
    }
  } else if (msg.type === 'table') {
    const v = msg.view;
    const sd = v.street === 'handOver' && v.handResult?.kind === 'showdown';
    for (const p of v.players) {
      if (p.holeCards && p.seat !== msg.yourSeat && !(sd && !p.folded)) {
        fail(`${c.name} saw seat ${p.seat} hole cards`);
      }
      if (p.holeCards) leaksChecked++;
    }
    if (v.legalActions && v.actingSeat === msg.yourSeat) {
      const key = `${v.handNumber}:${v.street}:${v.log.length}:${v.pot}`;
      if (key === c.lastActed) return;
      c.lastActed = key;
      const la = v.legalActions;
      const action = la.canCheck ? { type: 'check' } : la.canCall ? { type: 'call' } : { type: 'allin' };
      actionsSent++;
      c.ws.send(JSON.stringify({ type: 'action', action, handNumber: v.handNumber }));
    }
  }
}

function finish() {
  console.log(`SMOKE OK: ${handsDone} hands, ${actionsSent} human actions, ${leaksChecked} visible hole-card entries checked`);
  for (const c of clients) c.ws.close();
  setTimeout(() => process.exit(0), 200);
}

for (let i = 0; i < names.length; i++) await open(names[i], i);
console.log('joined seats', clients.map((c) => `${c.name}@${c.seat}`).join(' '));
if (!clients[0].isHost) fail('first joiner is not host');
// Wrong-token action check from a fresh socket
await new Promise((resolve) => {
  const ws = new WebSocket(`${WS_BASE}/room/${code}`);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', code, name: 'Evil', seatToken: 'nope' })));
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'error' && m.code === 'badToken') console.log('bad token rejected ✓');
    ws.close();
    resolve();
  });
});
started = true;
clients[0].ws.send(JSON.stringify({ type: 'start' }));
void started;
