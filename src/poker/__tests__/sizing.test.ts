import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  getLegalActions,
  heroActionToPlayerAction,
  raiseToToAmount,
  startHand,
  validateAction,
  type GameState,
} from '../game';

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

/** All-human table, UTG opens to 6, folds round to the SB (who has $1 in). */
function sbFacingOpen(): GameState {
  let s = startHand(createInitialState(undefined, { humanSeats: [0, 1, 2, 3, 4, 5], rng: makeRng(1) }));
  s = applyAction(s, { type: 'raise', amount: 6 });
  while (s.players[s.actingSeat]!.betThisStreet === 0) s = applyAction(s, { type: 'fold' });
  return s;
}

describe('bet sizing convention (UI "to" totals -> engine chips added)', () => {
  it('root cause: sending minRaiseTo as the engine amount over-raises when chips are already in', () => {
    const s = sbFacingOpen();
    const seat = s.actingSeat;
    const legal = getLegalActions(s)!;
    expect(s.players[seat]!.betThisStreet).toBe(1); // SB
    expect(legal.minRaiseTo).toBe(10);
    // Old ActionBar path: amount = minRaiseTo passed straight to applyAction
    const buggy = applyAction(s, { type: 'raise', amount: legal.minRaiseTo });
    expect(buggy.players[seat]!.betThisStreet).toBe(11);
  });

  it('raise-to N ends with street bet N (Raise button, every quick size, all-in)', () => {
    const s = sbFacingOpen();
    const seat = s.actingSeat;
    const legal = getLegalActions(s)!;
    expect(legal.betThisStreet).toBe(1);
    expect(legal.minRaiseAdd).toBe(9);
    const targets = [legal.minRaiseTo, ...legal.quickSizes.map((q) => q.amount)];
    expect(targets.length).toBeGreaterThan(1);
    for (const to of targets) {
      const a = heroActionToPlayerAction({ type: 'raise', amount: to }, legal.betThisStreet!);
      expect(a.amount).toBe(raiseToToAmount(s, to));
      expect(validateAction(s, a)).toBeNull();
      expect(applyAction(s, a).players[seat]!.betThisStreet).toBe(to);
    }
    for (const q of legal.quickSizes) expect(q.add).toBe(q.amount - 1);
    const shove = applyAction(s, heroActionToPlayerAction({ type: 'allin', amount: legal.allInTo }, 1));
    expect(shove.players[seat]!.betThisStreet).toBe(legal.allInTo);
  });

  it('BB option: "Bet" minBet is a to-total (raise to 4)', () => {
    let s = startHand(createInitialState(undefined, { humanSeats: [0, 1, 2, 3, 4, 5], rng: makeRng(2) }));
    while (getLegalActions(s)!.canCall) s = applyAction(s, { type: 'call' });
    const seat = s.actingSeat;
    const legal = getLegalActions(s)!;
    expect(legal.canBet).toBe(true);
    expect(legal.betThisStreet).toBe(2);
    expect(legal.minBet).toBe(4);
    const after = applyAction(s, heroActionToPlayerAction({ type: 'bet', amount: legal.minBet }, 2));
    expect(after.players[seat]!.betThisStreet).toBe(4);
  });

  it('postflop opening bets: to-total == chips added', () => {
    let s = startHand(createInitialState(undefined, { humanSeats: [0, 1, 2, 3, 4, 5], rng: makeRng(3) }));
    while (s.street === 'preflop') {
      const l = getLegalActions(s)!;
      s = applyAction(s, l.canCall ? { type: 'call' } : { type: 'check' });
    }
    const legal = getLegalActions(s)!;
    expect(legal.betThisStreet).toBe(0);
    for (const q of legal.quickSizes) {
      const after = applyAction(s, heroActionToPlayerAction({ type: 'bet', amount: q.amount }, 0));
      expect(after.players[s.actingSeat]!.betThisStreet).toBe(q.amount);
    }
  });
});

describe('all-in dedupe + short-stack call', () => {
  it('quickSizes never contain an all-in-sized entry or duplicates', () => {
    for (let seed = 1; seed < 40; seed++) {
      let s = startHand(createInitialState(undefined, { humanSeats: [0, 1, 2, 3, 4, 5], rng: makeRng(seed) }));
      // Make one stack short so capped sizes happen
      s = { ...s, players: s.players.map((p, i) => (i === s.actingSeat ? { ...p, stack: 7 + seed } : p)) };
      let guard = 0;
      while (s.street !== 'handOver' && guard++ < 60) {
        const l = getLegalActions(s)!;
        const amounts = l.quickSizes.map((q) => q.amount);
        expect(new Set(amounts).size).toBe(amounts.length);
        expect(amounts).not.toContain(l.allInTo);
        expect(l.quickSizes.some((q) => /all/i.test(q.label))).toBe(false);
        expect(l.canAllIn).toBe(true);
        s = applyAction(s, l.canCheck ? { type: 'check' } : { type: 'call' });
      }
    }
  });

  it('short stack facing a bigger bet can still call (all-in call)', () => {
    let s = startHand(createInitialState(undefined, { humanSeats: [0, 1, 2, 3, 4, 5], rng: makeRng(9) }));
    const shover = s.actingSeat;
    s = applyAction(s, { type: 'allin' });
    const seat = s.actingSeat;
    s = { ...s, players: s.players.map((p, i) => (i === seat ? { ...p, stack: 50 } : p)) };
    const l = getLegalActions(s)!;
    expect(l.canCall).toBe(true);
    expect(l.canRaise).toBe(false);
    expect(l.callAmount).toBe(50);
    const after = applyAction(s, { type: 'call' });
    expect(after.players[seat]!.allIn).toBe(true);
    void shover;
  });
});
