import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  startHand,
  type GameState,
} from '../game';

/** Deterministic LCG */
function makeRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function chips(s: GameState): number {
  return s.players.reduce((a, p) => a + p.stack + p.totalInvested, 0);
}

/** Fresh 6-max hand: BTN 1, SB 2, BB 3, UTG 4 acts first. */
function dealt(seed: number, stacks: Partial<Record<number, number>> = {}): GameState {
  let s = createInitialState(undefined, { heroSeat: 0, rng: makeRng(seed) });
  s = { ...s, players: s.players.map((p) => ({ ...p, stack: stacks[p.seat] ?? p.stack })) };
  s = startHand(s);
  expect(s.buttonSeat).toBe(1);
  expect(s.actingSeat).toBe(4);
  return s;
}

describe('uncalled chips are returned, not counted as winnings', () => {
  it('fold-win: an all-in nobody calls is credited only the called portion', () => {
    let s = dealt(3);
    const start = chips(s);
    s = applyAction(s, { type: 'allin' }); // UTG shoves 200 into SB 1 + BB 2
    while (s.street !== 'handOver') s = applyAction(s, { type: 'fold' });

    const hr = s.handResult!;
    expect(hr.kind).toBe('fold');
    expect(hr.winners).toHaveLength(1);
    const w = hr.winners[0]!;
    expect(w.seat).toBe(4);
    // Called portion only: own 2 matched by BB, plus SB 1 and BB 2 — not the 198 returned.
    expect(w.amountWon).toBe(5);
    expect(hr.potTotal).toBe(5);
    expect(s.winners[0]!.description).toBe(`${s.players[4]!.name} wins $5 (others folded)`);
    expect(s.log).toContain(`Uncalled $198 returned to ${s.players[4]!.name}`);
    // Stack math unchanged: 200 + 1 + 2 won from the blinds.
    expect(s.players[4]!.stack).toBe(203);
    expect(chips(s)).toBe(start);
  });

  it('fold-win: a raise everyone folds to does not count the raise as winnings', () => {
    let s = dealt(5);
    s = applyAction(s, { type: 'raise', amount: 6 }); // UTG raises to 6
    while (s.street !== 'handOver') s = applyAction(s, { type: 'fold' });
    expect(s.handResult!.winners[0]!.amountWon).toBe(5); // 2 matched + SB 1 + BB 2
    expect(s.players[4]!.stack).toBe(203);
  });

  it('showdown: a shove called by a short stack only wins the called amount', () => {
    let s = dealt(11, { 5: 50 });
    const start = chips(s);
    s = applyAction(s, { type: 'allin' }); // seat 4: 200
    s = applyAction(s, { type: 'call' }); // seat 5: all-in call for 50
    while (s.street !== 'handOver') s = applyAction(s, { type: 'fold' }); // 0,1,SB,BB fold

    const hr = s.handResult!;
    expect(hr.kind).toBe('showdown');
    // 50 + 50 + SB 1 + BB 2; seat 4's extra 150 went straight back.
    expect(hr.potTotal).toBe(103);
    const totalWon = hr.winners.reduce((a, w) => a + w.amountWon, 0);
    expect(totalWon).toBe(103);
    for (const w of hr.winners) expect(w.amountWon).toBeLessThanOrEqual(103);
    expect(s.log).toContain(`Uncalled $150 returned to ${s.players[4]!.name}`);
    for (const w of s.winners) expect(w.amount).toBeLessThanOrEqual(103);
    // Seat 4 keeps the 150 whatever the result; chips are conserved.
    expect(s.players[4]!.stack).toBeGreaterThanOrEqual(150);
    expect(chips(s)).toBe(start);
  });

  it('no refund when every chip was called', () => {
    let s = dealt(21);
    const start = chips(s);
    s = applyAction(s, { type: 'raise', amount: 6 }); // UTG raises to 6
    while (s.street === 'preflop') {
      // BB calls; everyone else folds
      s = applyAction(s, s.actingSeat === 3 ? { type: 'call' } : { type: 'fold' });
    }
    while (s.street !== 'handOver') s = applyAction(s, { type: 'check' });
    expect(s.handResult!.kind).toBe('showdown');
    expect(s.log.some((l) => l.startsWith('Uncalled'))).toBe(false);
    expect(s.handResult!.potTotal).toBe(13); // 6 + 6 + SB 1
    expect(s.handResult!.winners.reduce((a, w) => a + w.amountWon, 0)).toBe(13);
    expect(chips(s)).toBe(start);
  });
});
