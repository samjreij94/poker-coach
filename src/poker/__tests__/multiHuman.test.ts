import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  getLegalActions,
  isHumanToAct,
  runBotsUntilHero,
  runBotsUntilHuman,
  setSeatOccupant,
  startHand,
  timeoutAction,
  toPublicView,
  topUpBustedStacks,
  validateAction,
  type GameState,
} from '../game';
import type { PlayerAction } from '../types';

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

const HUMANS = [0, 2, 3, 5];

function chips(s: GameState): number {
  return s.players.reduce((a, p) => a + p.stack + p.totalInvested, 0);
}

/** Deterministic human policy: mostly call/check; occasional min-raise; some folds. */
function humanPolicy(s: GameState, step: number): PlayerAction {
  const legal = getLegalActions(s)!;
  const seat = s.actingSeat;
  if (seat === 5 && legal.canRaise && step % 7 === 0) {
    const actor = s.players[seat]!;
    return { type: 'raise', amount: legal.minRaiseTo - actor.betThisStreet };
  }
  if (legal.canCheck) return { type: 'check' };
  if (seat === 2 && step % 5 === 0) return { type: 'fold' };
  if (legal.canCall) return { type: 'call' };
  return { type: 'allin' };
}

function assertNoLeaks(s: GameState): void {
  const showdownOver = s.street === 'handOver' && s.handResult?.kind === 'showdown';
  for (let viewer = -1; viewer < 6; viewer++) {
    const v = toPublicView(s, viewer === -1 ? null : viewer);
    expect(v.heroSeat).toBe(viewer);
    for (const p of v.players) {
      if (p.seat === viewer) {
        if (s.players[p.seat]!.holeCards.length) expect(p.holeCards).not.toBeNull();
        expect(p.isHero).toBe(true);
        continue;
      }
      expect(p.isHero).toBe(false);
      if (showdownOver && !s.players[p.seat]!.folded) {
        expect(p.holeCards).toEqual(s.players[p.seat]!.holeCards);
      } else {
        expect(p.holeCards).toBeNull();
      }
    }
    if (v.legalActions) expect(v.actingSeat).toBe(viewer);
    if (s.actingSeat === viewer && viewer >= 0 && s.street !== 'handOver') {
      expect(v.legalActions).not.toBeNull();
    }
    // No card of another seat anywhere in the serialized view unless revealed
    const json = JSON.stringify(v);
    expect(json).not.toContain('"deck"');
    if (s.handResult) {
      for (const w of v.handResult!.winners) {
        if (w.holeCards) expect(v.handResult!.kind).toBe('showdown');
      }
    }
  }
}

describe('multi-human tables (4 humans + 2 bots)', () => {
  it('creates human seats and bot seats', () => {
    const s = createInitialState(undefined, {
      humanSeats: HUMANS,
      names: { 0: 'Ann', 2: 'Bo', 3: 'Cy', 5: 'Di' },
      rng: makeRng(1),
    });
    expect(s.players.map((p) => p.style === 'human')).toEqual([true, false, true, true, false, true]);
    expect(s.players[0]!.name).toBe('Ann');
    expect(s.players[1]!.style).not.toBe('human');
    expect(s.config.startingStack).toBe(200);
  });

  it('plays hands through: bots act, stops for each human, no leaks, chips conserved', () => {
    let s = createInitialState(undefined, { humanSeats: HUMANS, rng: makeRng(2024) });
    const humansStoppedAt = new Set<number>();
    let showdowns = 0;
    let step = 0;
    for (let hand = 0; hand < 40; hand++) {
      s = topUpBustedStacks(s);
      s = runBotsUntilHuman(startHand(s));
      const startTotal = chips(s);
      let guard = 0;
      while (s.street !== 'handOver' && guard++ < 300) {
        // stops only on humans
        expect(isHumanToAct(s)).toBe(true);
        expect(HUMANS).toContain(s.actingSeat);
        humansStoppedAt.add(s.actingSeat);
        assertNoLeaks(s);
        const a = humanPolicy(s, step++);
        expect(validateAction(s, a)).toBeNull();
        s = runBotsUntilHuman(applyAction(s, a));
        expect(chips(s)).toBe(startTotal);
      }
      expect(s.street).toBe('handOver');
      assertNoLeaks(s);
      if (s.handResult?.kind === 'showdown') showdowns++;
    }
    expect([...humansStoppedAt].sort()).toEqual(HUMANS);
    expect(showdowns).toBeGreaterThan(0);
  });

  it('reveals only non-folded hands at showdown, and per-viewer heroOutcome', () => {
    let s = createInitialState(undefined, { humanSeats: HUMANS, rng: makeRng(77) });
    let found = false;
    for (let hand = 0; hand < 60 && !found; hand++) {
      s = topUpBustedStacks(s);
      s = runBotsUntilHuman(startHand(s));
      while (s.street !== 'handOver') {
        const legal = getLegalActions(s)!;
        s = runBotsUntilHuman(
          applyAction(s, legal.canCheck ? { type: 'check' } : legal.canCall ? { type: 'call' } : { type: 'allin' }),
        );
      }
      if (s.handResult?.kind !== 'showdown') continue;
      found = true;
      const winnerSeats = s.handResult.winners.map((w) => w.seat);
      for (const viewer of HUMANS) {
        const v = toPublicView(s, viewer);
        const expected = winnerSeats.includes(viewer)
          ? (s.splitSeats ?? []).includes(viewer)
            ? 'split'
            : 'win'
          : 'lose';
        expect(v.handResult!.heroOutcome).toBe(expected);
        for (const p of v.players) {
          const folded = s.players[p.seat]!.folded;
          if (!folded) expect(p.holeCards).toHaveLength(2);
          else if (p.seat !== viewer) expect(p.holeCards).toBeNull();
        }
      }
    }
    expect(found).toBe(true);
  });

  it('fold-win does not reveal the winner cards to other viewers (explicit viewer)', () => {
    let s = createInitialState(undefined, { humanSeats: HUMANS, rng: makeRng(5) });
    s = runBotsUntilHuman(startHand(s));
    let guard = 0;
    while (s.street !== 'handOver' && guard++ < 50) {
      s = runBotsUntilHuman(applyAction(s, timeoutAction(s)));
    }
    if (s.handResult?.kind === 'fold') {
      const w = s.handResult.winners[0]!.seat;
      for (let viewer = 0; viewer < 6; viewer++) {
        if (viewer === w) continue;
        expect(toPublicView(s, viewer).players[w]!.holeCards).toBeNull();
      }
    }
    assertNoLeaks(s);
  });

  it('timeoutAction checks when free, folds facing a bet', () => {
    let s = createInitialState(undefined, { humanSeats: [0, 1, 2, 3, 4, 5], rng: makeRng(9) });
    s = startHand(s);
    // UTG preflop faces the big blind
    expect(timeoutAction(s)).toEqual({ type: 'fold' });
    // Everyone calls to BB, BB may check
    while (s.street === 'preflop' && getLegalActions(s)!.canCall) {
      s = applyAction(s, { type: 'call' });
    }
    expect(timeoutAction(s)).toEqual({ type: 'check' });
  });

  it('validateAction rejects illegal amounts/types', () => {
    let s = createInitialState(undefined, { humanSeats: [0, 1, 2, 3, 4, 5], rng: makeRng(11) });
    s = startHand(s);
    expect(validateAction(s, { type: 'check' })).not.toBeNull();
    expect(validateAction(s, { type: 'bet', amount: 10 })).not.toBeNull();
    expect(validateAction(s, { type: 'raise', amount: 3 })).not.toBeNull(); // below min raise-to 4
    expect(validateAction(s, { type: 'raise', amount: 1.5 })).not.toBeNull();
    expect(validateAction(s, { type: 'raise', amount: 4 })).toBeNull();
    expect(validateAction(s, { type: 'raise', amount: 9999 })).not.toBeNull();
    expect(validateAction(s, { type: 'call' })).toBeNull();
    expect(validateAction(s, { type: 'fold' })).toBeNull();
  });

  it('setSeatOccupant swaps bots/humans between hands only, preserving stacks', () => {
    let s = createInitialState(undefined, { humanSeats: [0, 2], rng: makeRng(3) });
    s = setSeatOccupant(s, 1, { kind: 'human', name: 'Eve' });
    expect(s.players[1]!.style).toBe('human');
    expect(s.players[1]!.name).toBe('Eve');
    s = setSeatOccupant(s, 2, { kind: 'bot' });
    expect(s.players[2]!.style).not.toBe('human');
    const started = startHand(s);
    expect(() => setSeatOccupant(started, 3, { kind: 'bot' })).toThrow();
  });
});

describe('solo compatibility', () => {
  it('runBotsUntilHero === runBotsUntilHuman and default view equals hero view in solo', () => {
    const a = runBotsUntilHero(startHand(createInitialState(undefined, { heroSeat: 0, rng: makeRng(4) })));
    const b = runBotsUntilHuman(startHand(createInitialState(undefined, { heroSeat: 0, rng: makeRng(4) })));
    expect(a.actingSeat).toBe(b.actingSeat);
    expect(a.log).toEqual(b.log);
    const legacy = toPublicView(a);
    const explicit = toPublicView(a, 0);
    expect(explicit.players.map((p) => p.holeCards)).toEqual(legacy.players.map((p) => p.holeCards));
    expect(explicit.legalActions).toEqual(legacy.legalActions);
    expect(legacy.heroSeat).toBe(0);
  });
});
