import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  getLegalActions,
  runBotsUntilHero,
  startHand,
  toPublicView,
} from './game';

describe('game flow', () => {
  it('deals a hand and eventually reaches hero or handOver', () => {
    let s = createInitialState();
    s = runBotsUntilHero(startHand(s));
    expect(s.handNumber).toBe(1);
    expect(s.street === 'handOver' || s.actingSeat >= 0).toBe(true);
    if (s.actingSeat >= 0) {
      expect(s.players[s.actingSeat]!.isHero).toBe(true);
      const legal = getLegalActions(s);
      expect(legal).not.toBeNull();
    }
    const view = toPublicView(s);
    expect(view.players).toHaveLength(6);
    const hero = view.players.find((p) => p.isHero)!;
    expect(hero.holeCards).toHaveLength(2);
  });

  it('hero legal action advances cleanly', () => {
    let s = createInitialState();
    s = runBotsUntilHero(startHand(s));
    if (s.actingSeat >= 0 && s.players[s.actingSeat]!.isHero) {
      const legal = getLegalActions(s)!;
      const action = legal.canFold
        ? ({ type: 'fold' } as const)
        : legal.canCheck
          ? ({ type: 'check' } as const)
          : ({ type: 'call', amount: legal.callAmount } as const);
      s = runBotsUntilHero(applyAction(s, action));
      expect([
        'preflop',
        'flop',
        'turn',
        'river',
        'showdown',
        'handOver',
      ]).toContain(s.street);
    }
  });

  it('blinds posted from stacks', () => {
    let s = createInitialState();
    s = startHand(s);
    const invested = s.players.reduce((a, p) => a + p.totalInvested, 0);
    expect(invested).toBeGreaterThanOrEqual(3); // SB+BB
  });
});
