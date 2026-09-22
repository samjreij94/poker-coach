import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  resetStacks,
  runHandWithBots,
  startHand,
  toPublicView,
  toCall,
} from '../game';

/** Deterministic LCG */
function makeRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('HandResult', () => {
  it('fold-win: hero takes pot uncontested; persists until startHand', () => {
    const rng = makeRng(7);
    let state = createInitialState(undefined, { heroSeat: 0, rng });
    expect(state.handResult).toBeNull();
    state = startHand(state);

    // Open raise then force folds until hand over
    let guard = 0;
    while (state.street !== 'handOver' && state.actingSeat >= 0 && guard++ < 40) {
      const actor = state.players[state.actingSeat]!;
      const call = toCall(state);
      const raised = state.log.some(
        (l) => l.includes('raises') || l.includes('bets'),
      );
      if (!raised && (call === 0 || actor.betThisStreet === 0)) {
        state = applyAction(state, { type: 'bet', amount: 6 });
      } else if (call === 0) {
        state = applyAction(state, { type: 'check' });
      } else {
        state = applyAction(state, { type: 'fold' });
      }
    }

    expect(state.street).toBe('handOver');
    expect(state.handResult).not.toBeNull();
    expect(state.handResult!.kind).toBe('fold');
    expect(state.handResult!.winners.length).toBe(1);
    expect(state.handResult!.potTotal).toBeGreaterThan(0);
    expect(state.handResult!.why.length).toBeGreaterThan(0);

    const winnerSeat = state.handResult!.winners[0]!.seat;
    if (winnerSeat === state.heroSeat) {
      expect(state.handResult!.heroOutcome).toBe('win');
      expect(state.handResult!.why).toMatch(/uncontested/i);
    } else {
      expect(state.handResult!.heroOutcome).toBe('lose');
      expect(state.handResult!.why).toMatch(/folded/i);
    }

    const view = toPublicView(state);
    expect(view.handResult).not.toBeNull();
    expect(view.handResult!.kind).toBe('fold');
    expect(view.handResult!.potTotal).toBe(state.handResult!.potTotal);

    // Persists across toPublicView; cleared on startHand
    state = startHand(state);
    expect(state.handResult).toBeNull();
    expect(toPublicView(state).handResult).toBeNull();
  });

  it('fold-win: bot takes it when everyone folds to them', () => {
    const rng = makeRng(11);
    let state = createInitialState(undefined, { heroSeat: 0, rng });
    state = startHand(state);

    // First actor raises; everyone else folds (including hero when facing raise)
    let guard = 0;
    let sawRaise = false;
    while (state.street !== 'handOver' && state.actingSeat >= 0 && guard++ < 40) {
      const call = toCall(state);
      if (!sawRaise && call > 0) {
        // facing blinds — raise
        state = applyAction(state, { type: 'raise', amount: call + 4 });
        sawRaise = true;
      } else if (!sawRaise && call === 0) {
        state = applyAction(state, { type: 'bet', amount: 6 });
        sawRaise = true;
      } else if (call === 0) {
        state = applyAction(state, { type: 'check' });
      } else {
        state = applyAction(state, { type: 'fold' });
      }
    }

    expect(state.handResult?.kind).toBe('fold');
    expect(state.handResult!.winners.length).toBe(1);
    expect(state.handResult!.potTotal).toBeGreaterThan(0);
    expect(state.handResult!.why).toBeTruthy();
  });

  it('showdown or fold via runHandWithBots exposes HandResult on view; startHand clears', () => {
    const rng = makeRng(99);
    let state = createInitialState(undefined, { heroSeat: 3, rng });
    state = startHand(state);
    state = runHandWithBots(state);

    expect(state.street).toBe('handOver');
    expect(state.handResult).not.toBeNull();
    expect(['fold', 'showdown']).toContain(state.handResult!.kind);
    expect(state.handResult!.winners.length).toBeGreaterThan(0);
    expect(state.handResult!.potTotal).toBeGreaterThan(0);
    expect(state.handResult!.why.length).toBeGreaterThan(0);
    expect(['win', 'lose', 'split']).toContain(state.handResult!.heroOutcome);

    if (state.handResult!.kind === 'showdown') {
      expect(state.board.length).toBe(5);
      expect(state.handResult!.board.length).toBe(5);
      for (const w of state.handResult!.winners) {
        expect(w.handName).toBeTruthy();
        expect(w.holeCards).toBeDefined();
        expect(w.holeCards!.length).toBe(2);
      }
    } else {
      // fold-win: no handName required
      expect(state.handResult!.winners[0]!.amountWon).toBeGreaterThan(0);
    }

    const view = toPublicView(state);
    expect(view.handResult).toEqual(state.handResult);

    state = startHand(state);
    expect(state.handResult).toBeNull();
    expect(toPublicView(state).handResult).toBeNull();
  });

  it('createInitialState and resetStacks leave handResult null', () => {
    const state = createInitialState();
    expect(state.handResult).toBeNull();
    const reset = resetStacks(state);
    expect(reset.handResult).toBeNull();
  });

  it('runs several bot hands and always sets a coherent HandResult at handOver', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = makeRng(seed * 17);
      let state = createInitialState(undefined, { heroSeat: 2, rng });
      state = startHand(state);
      state = runHandWithBots(state);
      expect(state.street).toBe('handOver');
      expect(state.handResult).not.toBeNull();
      expect(state.handResult!.winners.length).toBeGreaterThan(0);
      expect(state.handResult!.potTotal).toBeGreaterThan(0);
      if (state.handResult!.kind === 'showdown') {
        expect(state.handResult!.winners.every((w) => !!w.handName)).toBe(true);
      }
    }
  });
});
