// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePokerCoach } from '../usePokerCoach';

describe('usePokerCoach heroAct sizing (solo)', () => {
  it('ActionBar-style raise to minRaiseTo ends with hero street bet == minRaiseTo', () => {
    const rnd = vi.spyOn(Math, 'random');
    let seed = 7;
    rnd.mockImplementation(() => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    });
    const { result } = renderHook(() => usePokerCoach(0));
    let checked = 0;
    for (let i = 0; i < 300 && checked < 3; i++) {
      const v = result.current.view;
      const legal = v.legalActions;
      if (!legal) {
        act(() => result.current.newHand());
        continue;
      }
      const inFront = legal.betThisStreet ?? 0;
      if (legal.canRaise && inFront > 0 && legal.minRaiseTo < (legal.allInTo ?? 0)) {
        const to = legal.minRaiseTo;
        const before = result.current.state.log.filter((l) => l === `You raises to $${to}`).length;
        act(() => result.current.heroAct({ type: 'raise', amount: to }));
        const after = result.current.state.log.filter((l) => l === `You raises to $${to}`).length;
        expect(after).toBe(before + 1);
        checked++;
      } else {
        act(() =>
          result.current.heroAct(legal.canCheck ? { type: 'check' } : { type: 'fold' }),
        );
      }
    }
    rnd.mockRestore();
    expect(checked).toBeGreaterThan(0);
  });
});
