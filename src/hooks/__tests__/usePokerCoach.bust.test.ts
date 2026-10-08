// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePokerCoach } from '../usePokerCoach';

afterEach(() => vi.restoreAllMocks());

describe('usePokerCoach busted solo hero', () => {
  it('shoving every hand eventually busts; newHand waits, rebuy deals the hero back in', () => {
    let seed = 11;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    });
    const { result } = renderHook(() => usePokerCoach(0));
    const hero = () => result.current.state.players[0]!;

    for (let i = 0; i < 400 && !result.current.heroBusted; i++) {
      const legal = result.current.view.legalActions;
      if (legal) act(() => result.current.heroAct({ type: 'allin' }));
      else act(() => result.current.newHand());
    }
    expect(result.current.heroBusted).toBe(true);
    expect(hero().stack).toBe(0);

    // Next hand would deal the hero out; it is held until they rebuy/reset.
    const handNo = result.current.state.handNumber;
    act(() => result.current.newHand());
    expect(result.current.state.handNumber).toBe(handNo);
    expect(result.current.heroBusted).toBe(true);

    act(() => result.current.rebuy());
    expect(result.current.heroBusted).toBe(false);
    expect(result.current.state.handNumber).toBe(handNo + 1);
    expect(hero().holeCards).toHaveLength(2);
    expect(hero().stack + hero().totalInvested).toBe(200);
  });
});
