import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  isHeroBusted,
  runBotsUntilHero,
  startHand,
  topUpBustedStacks,
  type GameState,
} from '../game';

function withHeroStack(s: GameState, stack: number): GameState {
  return { ...s, players: s.players.map((p) => (p.isHero ? { ...p, stack } : p)) };
}

describe('isHeroBusted (solo out-of-chips prompt)', () => {
  it('is true only between hands with the hero at $0', () => {
    const fresh = createInitialState(undefined, 0);
    expect(isHeroBusted(fresh)).toBe(false);
    expect(isHeroBusted(withHeroStack(fresh, 0))).toBe(true);

    const live = startHand(fresh);
    expect(live.street).toBe('preflop');
    expect(isHeroBusted(live)).toBe(false);
  });

  it('a rebuy refills the hero and the next hand deals them in', () => {
    const busted = withHeroStack(createInitialState(undefined, 0), 0);
    // Without a rebuy the hero would just be dealt out (sitting folded).
    const dealtOut = startHand(busted);
    expect(dealtOut.players[0]!.folded).toBe(true);
    expect(dealtOut.players[0]!.holeCards).toHaveLength(0);

    const next = runBotsUntilHero(startHand(topUpBustedStacks(busted)));
    expect(isHeroBusted(next)).toBe(false);
    expect(next.players[0]!.holeCards).toHaveLength(2);
    expect(next.players[0]!.stack + next.players[0]!.totalInvested).toBe(200);
  });
});
