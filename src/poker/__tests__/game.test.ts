import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  getLegalActions,
  IllegalActionError,
  runBotsUntilHero,
  runHandWithBots,
  startHand,
  streetPot,
  toPublicView,
  toCall,
} from '../game';
import { positionForSeat } from '../positions';

/** Deterministic LCG */
function makeRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('game engine B1', () => {
  it('posts blinds and deals hole cards; UTG acts first in 6-max', () => {
    const rng = makeRng(42);
    let state = createInitialState(undefined, { heroSeat: 0, rng });
    state = startHand(state);
    expect(state.street).toBe('preflop');
    expect(state.handNumber).toBe(1);

    const sb = state.players.find(
      (p) =>
        positionForSeat(p.seat, state.buttonSeat, state.config.seats) === 'SB',
    )!;
    const bb = state.players.find(
      (p) =>
        positionForSeat(p.seat, state.buttonSeat, state.config.seats) === 'BB',
    )!;
    expect(sb.betThisStreet).toBe(1);
    expect(bb.betThisStreet).toBe(2);
    expect(state.currentBet).toBe(2);
    expect(streetPot(state)).toBe(3);

    for (const p of state.players) {
      if (!p.folded) expect(p.holeCards).toHaveLength(2);
    }

    // UTG = left of BB
    const utgSeat = (bb.seat + 1) % state.config.seats;
    expect(state.actingSeat).toBe(utgSeat);
  });

  it('fold around awards pot to raiser', () => {
    const rng = makeRng(7);
    let state = createInitialState(undefined, { heroSeat: 0, rng });
    state = startHand(state);

    // Everyone folds to first raiser: open raise then folds
    // Force: acting player raises, then all others fold when facing raise
    let guard = 0;
    while (state.street === 'preflop' && state.actingSeat >= 0 && guard++ < 20) {
      const actor = state.players[state.actingSeat]!;
      const call = toCall(state);
      if (call === 0 || actor.betThisStreet === 0) {
        // first voluntary: raise to 6 (put in 6)
        if (state.log.filter((l) => l.includes('raises') || l.includes('bets')).length === 0) {
          state = applyAction(state, { type: 'bet', amount: 6 });
        } else if (call === 0) {
          state = applyAction(state, { type: 'check' });
        } else {
          state = applyAction(state, { type: 'fold' });
        }
      } else {
        state = applyAction(state, { type: 'fold' });
      }
    }

    expect(state.street).toBe('handOver');
    expect(state.winners.length).toBeGreaterThanOrEqual(1);
    expect(state.winners[0]!.amount).toBeGreaterThanOrEqual(3);
    const totalStacks = state.players.reduce((s, p) => s + p.stack, 0);
    expect(totalStacks).toBe(state.config.seats * state.config.startingStack);
  });

  it('rejects illegal check facing a bet', () => {
    const rng = makeRng(3);
    let state = createInitialState(undefined, { heroSeat: 0, rng });
    state = startHand(state);
    // UTG faces BB — cannot check
    expect(toCall(state)).toBeGreaterThan(0);
    expect(() => applyAction(state, { type: 'check' })).toThrow(IllegalActionError);
  });

  it('rejects illegal short raise', () => {
    const rng = makeRng(5);
    let state = createInitialState(undefined, { heroSeat: 0, rng });
    state = startHand(state);
    // Facing 2, min raise is +2 → need put in at least 4 to raise to 4; putting 3 is short
    // call is 2; min raise-by is 2, so min put-in to raise = 4
    expect(() =>
      applyAction(state, { type: 'raise', amount: 3 }),
    ).toThrow(IllegalActionError);
  });

  it('full board runout and showdown preserves chip total', () => {
    const rng = makeRng(99);
    let state = createInitialState(undefined, { heroSeat: 0, rng });
    state = startHand(state);
    state = runHandWithBots(state);
    expect(state.street).toBe('handOver');
    const total = state.players.reduce((s, p) => s + p.stack, 0);
    expect(total).toBe(6 * 200);
    expect(state.winners.length).toBeGreaterThanOrEqual(1);
  });

  it('all-in side pot: short all-in then callers, showdown', () => {
    const rng = makeRng(11);
    let state = createInitialState(
      { startingStack: 200, smallBlind: 1, bigBlind: 2, seats: 6 },
      { heroSeat: 0, rng },
    );
    // Give seat 1 a short stack
    state = {
      ...state,
      players: state.players.map((p) =>
        p.seat === 1 ? { ...p, stack: 20 } : p,
      ),
    };
    state = startHand(state);

    // Drive to all-in confrontation with bots-ish forced actions
    let guard = 0;
    while (state.street !== 'handOver' && state.actingSeat >= 0 && guard++ < 80) {
      const actor = state.players[state.actingSeat]!;
      const call = toCall(state);
      const legal = getLegalActions(state)!;
      if (actor.seat === 1 && call > 0) {
        state = applyAction(state, { type: 'allin', amount: actor.stack });
      } else if (actor.stack <= 40 && call === 0) {
        state = applyAction(state, { type: 'allin', amount: actor.stack });
      } else if (call > 0 && legal.canCall) {
        state = applyAction(state, { type: 'call', amount: call });
      } else if (call > 0 && actor.stack <= call) {
        state = applyAction(state, { type: 'allin', amount: actor.stack });
      } else if (call === 0) {
        state = applyAction(state, { type: 'check' });
      } else {
        state = applyAction(state, { type: 'fold' });
      }
    }
    expect(state.street).toBe('handOver');
    const total = state.players.reduce((s, p) => s + p.stack, 0);
    // starting: 5*200 + 20 = 1020
    expect(total).toBe(5 * 200 + 20);
  });

  it('toPublicView hides villain hole cards mid-hand', () => {
    const rng = makeRng(2);
    let state = createInitialState(undefined, { heroSeat: 0, rng });
    state = runBotsUntilHero(startHand(state));
    const view = toPublicView(state);
    const hero = view.players.find((p) => p.isHero)!;
    expect(hero.holeCards).toHaveLength(2);
    if (state.street !== 'handOver') {
      const villains = view.players.filter((p) => !p.isHero && !p.folded);
      for (const v of villains) {
        expect(v.holeCards).toBeNull();
      }
      expect(view.legalActions).not.toBeNull();
      expect(view.actingSeat).toBe(hero.seat);
    }
  });
});

describe('bots B3 headless', () => {
  it('runBotsUntilHero stops on hero or hand over', () => {
    const rng = makeRng(123);
    let state = createInitialState(undefined, { heroSeat: 0, rng });
    state = startHand(state);
    // If hero is UTG (seat 0) and button moved to 1: BTN=1, SB=2, BB=3, UTG=4
    // hero seat 0 is BTN after first hand? button starts 0, startHand increments to 1.
    // seats: BTN=1, SB=2, BB=3, UTG=4, MP=5, CO=0(hero)
    state = runBotsUntilHero(state);
    if (state.street !== 'handOver') {
      expect(state.players[state.actingSeat]!.isHero).toBe(true);
    }
  });

  it('runHandWithBots completes a full hand', () => {
    for (const seed of [1, 2, 3, 10, 50]) {
      const rng = makeRng(seed);
      let state = createInitialState(undefined, { heroSeat: 3, rng });
      state = startHand(state);
      state = runHandWithBots(state);
      expect(state.street).toBe('handOver');
      expect(state.actingSeat).toBe(-1);
      const total = state.players.reduce((s, p) => s + p.stack, 0);
      expect(total).toBe(1200);
    }
  });

  it('multiple consecutive hands with bots preserve chips', () => {
    const rng = makeRng(77);
    let state = createInitialState(undefined, { heroSeat: 2, rng });
    for (let h = 0; h < 5; h++) {
      state = startHand(state);
      state = runHandWithBots(state);
      expect(state.street).toBe('handOver');
    }
    expect(state.players.reduce((s, p) => s + p.stack, 0)).toBe(1200);
  });
});
