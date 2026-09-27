import { describe, expect, it } from 'vitest';
import { Room, type RoomDeps } from '../src/room';
import { getLegalActions } from '../../src/poker/game';
import {
  ACTION_TIMEOUT_MS,
  ROOM_IDLE_EXPIRY_MS,
  type ClientMessage,
  type LobbyState,
  type ServerMessage,
  type TableMessage,
} from '../../src/multiplayer/protocol';

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Harness {
  room: Room;
  clock: { t: number };
  inbox: Map<string, ServerMessage[]>;
  all: { connId: string; msg: ServerMessage }[];
  send(connId: string, msg: ClientMessage): void;
  last<T extends ServerMessage['type']>(connId: string, type: T): Extract<ServerMessage, { type: T }> | undefined;
  clear(): void;
}

function harness(seed = 1): Harness {
  const clock = { t: 1_000_000 };
  let n = 0;
  const deps: RoomDeps = {
    now: () => clock.t,
    rng: makeRng(seed),
    randomToken: () => `tok-${++n}-${Math.floor(Math.random() * 1e9)}`,
    randomId: () => `p${++n}`,
  };
  const inbox = new Map<string, ServerMessage[]>();
  const all: { connId: string; msg: ServerMessage }[] = [];
  const room = new Room('ABCDEF', deps, (connId, msg) => {
    // deep copy to snapshot what went over the wire
    const m = JSON.parse(JSON.stringify(msg)) as ServerMessage;
    if (!inbox.has(connId)) inbox.set(connId, []);
    inbox.get(connId)!.push(m);
    all.push({ connId, msg: m });
  });
  return {
    room,
    clock,
    inbox,
    all,
    send: (connId, msg) => room.handleRaw(connId, JSON.stringify(msg)),
    last: (connId, type) => {
      const list = inbox.get(connId) ?? [];
      for (let i = list.length - 1; i >= 0; i--) if (list[i]!.type === type) return list[i] as never;
      return undefined;
    },
    clear: () => {
      inbox.clear();
      all.length = 0;
    },
  };
}

const NAMES = ['Ann', 'Bo', 'Cy', 'Di'];

function setup4(seed = 1) {
  const h = harness(seed);
  h.room.init();
  const conns = ['c0', 'c1', 'c2', 'c3'];
  conns.forEach((c, i) => {
    h.room.connect(c);
    h.send(c, { type: 'join', code: 'abcdef', name: NAMES[i]! });
  });
  const tokens = conns.map((c) => h.last(c, 'lobby')!.you!.seatToken);
  const seats = conns.map((c) => h.last(c, 'lobby')!.you!.seat!);
  return { h, conns, tokens, seats };
}

function connForSeat(h: Harness, conns: string[], seat: number): string | undefined {
  return conns.find((c) => h.room.playerForConn(c)?.seat === seat);
}

/** Every table message: only own cards, or non-folded cards after a showdown. */
function assertNoLeak(all: { connId: string; msg: ServerMessage }[]): number {
  let checked = 0;
  for (const { msg } of all) {
    if (msg.type === 'table') {
      const t = msg as TableMessage;
      const sd = t.view.street === 'handOver' && t.view.handResult?.kind === 'showdown';
      for (const p of t.view.players) {
        if (p.holeCards == null) continue;
        checked++;
        if (p.seat === t.yourSeat && t.view.heroSeat === t.yourSeat) continue;
        expect(sd && !p.folded, `leak: seat ${p.seat} to viewer ${t.yourSeat}`).toBe(true);
      }
      if (t.view.legalActions) expect(t.view.actingSeat).toBe(t.yourSeat);
      expect(JSON.stringify(t)).not.toContain('"deck"');
    }
    if (msg.type === 'handResult' && msg.result.kind === 'fold') {
      for (const w of msg.result.winners) expect(w.holeCards).toBeUndefined();
    }
  }
  return checked;
}

function playOut(h: Harness, conns: string[], maxSteps = 400): void {
  for (let i = 0; i < maxSteps && h.room.phase === 'inHand'; i++) {
    const g = h.room.game!;
    const c = connForSeat(h, conns, g.actingSeat)!;
    const legal = getLegalActions(g)!;
    h.send(c, {
      type: 'action',
      action: legal.canCheck ? { type: 'check' } : legal.canCall ? { type: 'call' } : { type: 'allin' },
    });
  }
}

describe('Room: create / join / claim', () => {
  it('rejects join before create, first joiner is host, auto-seats, tokens are private', () => {
    const h = harness();
    h.room.connect('x');
    h.send('x', { type: 'join', code: 'ABCDEF', name: 'Early' });
    expect(h.last('x', 'error')!.code).toBe('roomNotFound');

    const { h: h2, conns, tokens, seats } = setup4();
    const lobby = h2.last('c3', 'lobby') as LobbyState;
    expect(lobby.hostId).toBe(h2.room.playerForConn('c0')!.playerId);
    expect(lobby.you!.isHost).toBe(false);
    expect(h2.last('c0', 'lobby')!.you!.isHost).toBe(true);
    expect(new Set(seats).size).toBe(4);
    expect(lobby.seats.filter((s) => s.kind === 'human')).toHaveLength(4);
    expect(new Set(tokens).size).toBe(4);
    // No socket ever sees another player's token
    for (const { connId, msg } of h2.all) {
      const mine = tokens[conns.indexOf(connId)];
      const s = JSON.stringify(msg);
      for (const t of tokens) if (t !== mine) expect(s).not.toContain(t);
    }
  });

  it('create alias works once; takeSeat moves seats; seatTaken; non-host cannot start', () => {
    const h = harness();
    h.room.connect('a');
    h.send('a', { type: 'create', name: 'Host' });
    expect(h.room.created).toBe(true);
    expect(h.last('a', 'lobby')!.you!.isHost).toBe(true);
    h.room.connect('b');
    h.send('b', { type: 'create', name: 'X' });
    expect(h.last('b', 'error')!.code).toBe('roomExists');
    h.send('b', { type: 'join', code: 'ABCDEF', name: 'Bee' });
    h.send('b', { type: 'takeSeat', seat: 4 });
    expect(h.room.playerForConn('b')!.seat).toBe(4);
    h.send('a', { type: 'takeSeat', seat: 4 });
    expect(h.last('a', 'error')!.code).toBe('seatTaken');
    h.send('b', { type: 'start' });
    expect(h.last('b', 'error')!.code).toBe('notHost');
    h.send('a', { type: 'start' });
    expect(h.room.phase).toBe('inHand');
  });

  it('needs 2 humans to start; 7th human gets roomFull', () => {
    const h = harness();
    h.room.init();
    h.room.connect('a');
    h.send('a', { type: 'join', code: 'ABCDEF', name: 'Solo' });
    h.send('a', { type: 'start' });
    expect(h.last('a', 'error')!.code).toBe('notEnoughPlayers');
    for (let i = 0; i < 6; i++) {
      h.room.connect(`z${i}`);
      h.send(`z${i}`, { type: 'join', code: 'ABCDEF', name: `Z${i}` });
    }
    expect(h.last('z5', 'error')!.code).toBe('roomFull');
    h.room.connect('spec');
    h.send('spec', { type: 'join', code: 'ABCDEF', name: 'Watcher', spectate: true });
    expect(h.last('spec', 'lobby')!.you!.seat).toBeNull();
  });
});

describe('Room: hands, validation, reconnect, timers', () => {
  it('4 humans + 2 bots: host starts, bots act, humans act, no hole-card leak in any broadcast', () => {
    const { h, conns } = setup4(42);
    h.room.connect('spec');
    h.send('spec', { type: 'join', code: 'ABCDEF', name: 'Watcher', spectate: true });
    for (let hand = 0; hand < 12; hand++) {
      h.send('c0', { type: hand === 0 ? 'start' : 'nextHand' });
      expect(['inHand', 'handOver']).toContain(h.room.phase);
      const g = h.room.game!;
      expect(g.players.filter((p) => p.style === 'human')).toHaveLength(4);
      if (h.room.phase === 'inHand') {
        const actorConn = connForSeat(h, conns, g.actingSeat);
        expect(actorConn).toBeDefined();
        expect(h.last(actorConn!, 'table')!.view.legalActions).not.toBeNull();
        expect(h.last(actorConn!, 'table')!.turnDeadline).toBe(h.clock.t + ACTION_TIMEOUT_MS);
      }
      playOut(h, conns);
      expect(h.room.phase).toBe('handOver');
      const chips = h.room.game!.players.reduce((a, p) => a + p.stack, 0);
      expect(chips % 200).toBe(0); // conserved (plus whole 100bb rebuys)
    }
    // Everyone (incl. spectator) got tables; spectator never saw hole cards pre-showdown
    const checked = assertNoLeak(h.all);
    expect(checked).toBeGreaterThan(0);
    const specTables = h.inbox.get('spec')!.filter((m) => m.type === 'table') as TableMessage[];
    expect(specTables.length).toBeGreaterThan(0);
    for (const t of specTables) {
      expect(t.yourSeat).toBeNull();
      expect(t.view.legalActions).toBeNull();
    }
    expect(h.all.some((m) => m.msg.type === 'handResult')).toBe(true);
  });

  it('rejects wrong token, wrong seat, stale hand and illegal actions', () => {
    const { h, conns, tokens } = setup4(7);
    h.send('c0', { type: 'start' });
    const g = h.room.game!;
    const actor = connForSeat(h, conns, g.actingSeat)!;
    const other = conns.find((c) => c !== actor)!;
    const before = JSON.stringify(h.room.game);

    h.send(other, { type: 'action', action: { type: 'call' } });
    expect(h.last(other, 'error')!.code).toBe('notYourTurn');

    const otherToken = tokens[conns.indexOf(other)]!;
    h.send(actor, { type: 'action', action: { type: 'call' }, seatToken: otherToken });
    expect(h.last(actor, 'error')!.code).toBe('badToken');

    h.send(actor, { type: 'action', action: { type: 'call' }, handNumber: g.handNumber - 1 });
    expect(h.last(actor, 'error')!.code).toBe('staleHand');

    h.send(actor, { type: 'action', action: { type: 'check' } });
    expect(h.last(actor, 'error')!.code).toBe('illegalAction');
    h.send(actor, { type: 'action', action: { type: 'raise', amount: 1 } });
    expect(h.last(actor, 'error')!.code).toBe('illegalAction');
    h.send(actor, { type: 'action', action: { type: 'nonsense' as never } });
    expect(h.last(actor, 'error')!.code).toBe('badMessage');

    // Unjoined socket cannot act; bad reconnect token rejected
    h.room.connect('evil');
    h.send('evil', { type: 'action', action: { type: 'fold' } });
    expect(h.last('evil', 'error')!.code).toBe('notJoined');
    h.send('evil', { type: 'join', code: 'ABCDEF', name: 'Evil', seatToken: 'guess' });
    expect(h.last('evil', 'error')!.code).toBe('badToken');

    expect(JSON.stringify(h.room.game)).toBe(before);
    h.send(actor, { type: 'action', action: { type: 'call' }, seatToken: tokens[conns.indexOf(actor)] });
    expect(JSON.stringify(h.room.game)).not.toBe(before);
  });

  it('reconnect with token restores the same seat and private cards', () => {
    const { h, conns, tokens } = setup4(3);
    h.send('c0', { type: 'start' });
    const seat1 = h.room.playerForConn('c1')!.seat!;
    const cards = h.last('c1', 'table')!.view.players[seat1]!.holeCards;
    expect(cards).toHaveLength(2);
    h.room.disconnect('c1');
    expect(h.last('c0', 'playerDisconnected')!.seat).toBe(seat1);
    expect(h.last('c0', 'lobby')!.players.find((p) => p.seat === seat1)!.connected).toBe(false);

    h.room.connect('c1b');
    h.send('c1b', { type: 'join', code: 'ABCDEF', name: 'whatever', seatToken: tokens[1] });
    const lobby = h.last('c1b', 'lobby')!;
    expect(lobby.you!.seat).toBe(seat1);
    expect(lobby.you!.playerId).toBe(h.room.playerForConn('c0') && h.room.players[1]!.playerId);
    const t = h.last('c1b', 'table')!;
    expect(t.yourSeat).toBe(seat1);
    expect(t.view.players[seat1]!.holeCards).toEqual(cards);
    expect(h.last('c0', 'playerReconnected')!.seat).toBe(seat1);
    // game continues with the new socket
    playOut(h, ['c0', 'c1b', 'c2', 'c3']);
    expect(h.room.phase).toBe('handOver');
    void conns;
  });

  it('action clock: auto-check when free, auto-fold facing a bet; disconnected players sit out', () => {
    const { h, conns } = setup4(11);
    h.send('c0', { type: 'start' });
    const g = h.room.game!;
    const seat = g.actingSeat;
    const c = connForSeat(h, conns, seat)!;
    const facing = getLegalActions(g)!.canFold;
    expect(h.room.nextAlarmAt()).toBe(h.clock.t + ACTION_TIMEOUT_MS);

    // Not yet
    h.clock.t += ACTION_TIMEOUT_MS - 1;
    h.room.onAlarm();
    expect(h.room.game!.actingSeat).toBe(seat);

    h.clock.t += 1;
    h.room.onAlarm();
    const auto = h.last('c0', 'autoAction')!;
    expect(auto.seat).toBe(seat);
    expect(auto.reason).toBe('timeout');
    expect(auto.action.type).toBe(facing ? 'fold' : 'check');
    if (facing) expect(h.room.game!.players[seat]!.folded).toBe(true);
    void c;
  });

  it('disconnected acting player: auto-acts at deadline, then sits out (instant) until reconnect', () => {
    const { h, conns, tokens } = setup4(12);
    h.send('c0', { type: 'start' });
    const seat = h.room.game!.actingSeat;
    const c = connForSeat(h, conns, seat)!;
    h.room.disconnect(c);
    h.clock.t += ACTION_TIMEOUT_MS;
    h.room.onAlarm();
    const auto = h.last('c0' === c ? 'c1' : 'c0', 'autoAction')!;
    expect(auto.reason).toBe('disconnected');
    expect(h.room.players.find((p) => p.seat === seat)!.sittingOut).toBe(true);
    // Play on; whenever it's that seat's turn again it's auto-played instantly.
    const live = conns.filter((x) => x !== c);
    for (let i = 0; i < 400 && h.room.phase === 'inHand'; i++) {
      const g = h.room.game!;
      expect(g.actingSeat).not.toBe(seat);
      const cc = connForSeat(h, live, g.actingSeat)!;
      const legal = getLegalActions(g)!;
      h.send(cc, { type: 'action', action: legal.canCheck ? { type: 'check' } : { type: 'call' } });
    }
    expect(h.room.phase).toBe('handOver');
    // Reconnect clears sitting out
    h.room.connect('back');
    h.send('back', { type: 'join', code: 'ABCDEF', name: '', seatToken: tokens[conns.indexOf(c)] });
    expect(h.room.players.find((p) => p.seat === seat)!.sittingOut).toBe(false);
  });

  it('leave mid-hand: auto-folds/checks, seat becomes a bot after the hand, host passes on', () => {
    const { h, conns } = setup4(21);
    h.send('c0', { type: 'start' });
    const hostSeat = h.room.playerForConn('c0')!.seat!;
    h.send('c0', { type: 'leave' });
    expect(h.last('c1', 'playerLeft')!.seat).toBe(hostSeat);
    expect(h.last('c1', 'lobby')!.hostId).toBe(h.room.playerForConn('c1')!.playerId);
    playOut(h, conns.slice(1));
    expect(h.room.phase).toBe('handOver');
    expect(h.room.game!.players[hostSeat]!.style).not.toBe('human');
    h.send('c1', { type: 'nextHand' });
    expect(h.room.game!.players.filter((p) => p.style === 'human')).toHaveLength(3);
  });

  it('mid-hand joiner is pending (watcher view) and is dealt in next hand', () => {
    const { h, conns } = setup4(33);
    h.send('c0', { type: 'start' });
    h.room.connect('late');
    h.send('late', { type: 'join', code: 'ABCDEF', name: 'Late' });
    const me = h.room.playerForConn('late')!;
    expect(me.pending).toBe(true);
    const t = h.last('late', 'table')!;
    expect(t.yourSeat).toBeNull();
    expect(t.view.players.every((p) => p.holeCards == null)).toBe(true);
    playOut(h, conns);
    h.send('c0', { type: 'nextHand' });
    expect(h.room.game!.players[me.seat!]!.style).toBe('human');
    const t2 = h.last('late', 'table')!;
    expect(t2.yourSeat).toBe(me.seat);
    expect(t2.view.players[me.seat!]!.holeCards).toHaveLength(2);
    assertNoLeak(h.all);
  });

  it('snapshot/restore round-trips mid-hand (hibernation) and expires when idle', () => {
    const { h, conns } = setup4(5);
    h.send('c0', { type: 'start' });
    const snap = JSON.parse(JSON.stringify(h.room.snapshot()));
    expect(JSON.stringify(snap)).not.toContain('"rng"');
    const sent: string[] = [];
    const r2 = Room.restore(
      snap,
      { now: () => h.clock.t, rng: Math.random, randomToken: () => 't', randomId: () => 'i' },
      (c) => sent.push(c),
      conns.map((c) => ({ connId: c, playerId: h.room.conns.get(c)! })),
    );
    expect(r2.game!.actingSeat).toBe(h.room.game!.actingSeat);
    expect(r2.game!.deck).toEqual(h.room.game!.deck);
    const actor = conns.find((c) => r2.playerForConn(c)?.seat === r2.game!.actingSeat)!;
    const legal = getLegalActions(r2.game!)!;
    r2.handleMessage(actor, { type: 'action', action: legal.canCheck ? { type: 'check' } : { type: 'call' } });
    expect(sent.length).toBeGreaterThan(0);

    for (const c of conns) r2.disconnect(c);
    expect(r2.isExpired(h.clock.t + ROOM_IDLE_EXPIRY_MS - 1)).toBe(false);
    expect(r2.isExpired(h.clock.t + ROOM_IDLE_EXPIRY_MS)).toBe(true);
  });
});

describe('Room: raiseTo sizing + serverNow', () => {
  it('action { raiseTo: N } ends with the player street bet == N (incl. chips already in)', () => {
    let checked = 0;
    for (let seed = 1; seed < 30 && checked < 3; seed++) {
      const { h, conns } = setup4(seed);
      h.send('c0', { type: 'start' });
      for (let i = 0; i < 200 && h.room.phase === 'inHand'; i++) {
        const g = h.room.game!;
        const c = connForSeat(h, conns, g.actingSeat)!;
        const t = h.last(c, 'table')!;
        const legal = t.view.legalActions!;
        expect(legal).not.toBeNull();
        const me = g.players[g.actingSeat]!;
        if (legal.canRaise && (legal.betThisStreet ?? 0) > 0 && legal.minRaiseTo < legal.allInTo!) {
          const to = legal.quickSizes[0]?.amount ?? legal.minRaiseTo;
          const line = `${me.name} raises to $${to}`;
          const before = h.room.game!.log.filter((l) => l === line).length;
          h.send(c, { type: 'action', action: { type: 'raise', raiseTo: to }, handNumber: t.view.handNumber });
          expect(h.last(c, 'error')).toBeUndefined();
          expect(h.room.game!.log.filter((l) => l === line).length).toBe(before + 1);
          checked++;
          break;
        }
        h.send(c, {
          type: 'action',
          action: legal.canCheck ? { type: 'check' } : { type: 'call' },
        });
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('bad raiseTo rejected; table and pong carry serverNow', () => {
    const { h, conns } = setup4(4);
    h.send('c0', { type: 'start' });
    const g = h.room.game!;
    const c = connForSeat(h, conns, g.actingSeat)!;
    const t = h.last(c, 'table')!;
    expect(t.serverNow).toBe(h.clock.t);
    h.send(c, { type: 'action', action: { type: 'raise', raiseTo: t.view.legalActions!.minRaiseTo - 1 } });
    expect(h.last(c, 'error')!.code).toBe('illegalAction');
    h.send(c, { type: 'action', action: { type: 'raise', raiseTo: 'x' as never } });
    expect(h.last(c, 'error')!.code).toBe('badMessage');
    h.clock.t += 5;
    h.send(c, { type: 'ping', t: 1 });
    const pong = h.last(c, 'pong')!;
    expect(pong.serverNow).toBe(h.clock.t);
    expect(pong.t).toBe(1);
  });
});
