// Local smoke test against `wrangler dev` (default http://localhost:8787).
// Creates a room over HTTP, joins 4 WebSocket clients, host starts, everyone
// plays check/call until a few hands complete. Verifies no foreign hole cards.
import WebSocket from 'ws';

const BASE = process.env.ROOM_SERVER_URL ?? 'http://localhost:8787';
const HANDS = Number(process.env.HANDS ?? 3);
const WS_BASE = BASE.replace(/^http/, 'ws');
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173';
let raiseToChecks = 0;
let sawServerNow = false;

const fail = (m) => {
  console.error('SMOKE FAIL:', m);
  process.exit(1);
};
setTimeout(() => fail('timeout'), 60_000).unref();

const bad = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
if (bad.status !== 403) fail(`disallowed origin got ${bad.status}`);
console.log('disallowed origin POST -> 403 ✓');
await new Promise((resolve) => {
  const ws = new WebSocket(`${WS_BASE}/room/ABCDEF`, { origin: 'https://evil.example' });
  ws.on('unexpected-response', (_req, r) => {
    console.log(`disallowed origin WS -> ${r.statusCode} ${r.statusCode === 403 ? '✓' : '✗'}`);
    if (r.statusCode !== 403) fail('ws origin');
    resolve();
  });
  ws.on('open', () => fail('ws with bad origin opened'));
  ws.on('error', () => {});
});
const res = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { Origin: ORIGIN } });
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
    const ws = new WebSocket(`${WS_BASE}/room/${code}`, { origin: ORIGIN });
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
    if (typeof msg.serverNow === 'number') sawServerNow = true;
    if (c.pendingRaiseTo && v.log.includes(c.pendingRaiseTo)) {
      raiseToChecks++;
      console.log(`  raiseTo ok: "${c.pendingRaiseTo}"`);
      c.pendingRaiseTo = null;
    }
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
      let action = la.canCheck ? { type: 'check' } : la.canCall ? { type: 'call' } : { type: 'allin' };
      if (la.canRaise && la.betThisStreet > 0 && la.minRaiseTo < la.allInTo && raiseToChecks < 2 && !c.pendingRaiseTo) {
        action = { type: 'raise', raiseTo: la.minRaiseTo };
        c.pendingRaiseTo = `${c.name} raises to $${la.minRaiseTo}`;
      }
      actionsSent++;
      c.ws.send(JSON.stringify({ type: 'action', action, handNumber: v.handNumber }));
    }
  }
}

async function finish() {
  for (const c of clients) c.ws.close();
  if (!sawServerNow) fail('table frames missing serverNow');
  // Rate limit: create budget is 10/min per IP (1 already used above)
  let limited = 0;
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${BASE}/api/rooms`, { method: 'POST', headers: { Origin: ORIGIN } });
    if (r.status === 429) limited++;
  }
  console.log(`rate limit: ${limited} of 12 extra creates got 429 ${limited > 0 ? '✓' : '✗'}`);
  if (!limited) fail('no 429');
  console.log(`SMOKE OK: ${handsDone} hands, ${actionsSent} human actions, ${raiseToChecks} raiseTo checks, ${leaksChecked} visible hole-card entries checked, serverNow present`);
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
