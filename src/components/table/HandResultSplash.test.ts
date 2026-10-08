// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiHandResult } from '../../types/handResult';
import { HandResultSplash } from './HandResultSplash';

afterEach(cleanup);

const lost: UiHandResult = {
  kind: 'showdown',
  heroOutcome: 'lose',
  winners: [{ seat: 1, name: 'Cathy Call', amountWon: 400, handName: 'Pair of Aces' }],
  board: [],
  potTotal: 400,
  why: 'Cathy Call won with Pair of Aces',
};

describe('HandResultSplash out-of-chips prompt', () => {
  it('normally offers Next Hand', () => {
    const onNextHand = vi.fn();
    render(createElement(HandResultSplash, { result: lost, onNextHand }));
    fireEvent.click(screen.getByRole('button', { name: 'Next Hand' }));
    expect(onNextHand).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/out of chips/i)).toBeNull();
  });

  it('busted hero gets Rebuy / Reset instead of Next Hand', () => {
    const onNextHand = vi.fn();
    const onRebuy = vi.fn();
    const onReset = vi.fn();
    render(
      createElement(HandResultSplash, {
        result: lost,
        onNextHand,
        outOfChips: { onRebuy, onReset, rebuyLabel: 'Rebuy 200 & deal' },
      }),
    );
    expect(screen.getByText(/out of chips/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next Hand' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rebuy 200 & deal' }));
    expect(onRebuy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reset all stacks' }));
    expect(onReset).toHaveBeenCalledTimes(1);

    // Tapping the backdrop must not deal a hand the hero sits out of.
    fireEvent.click(screen.getByRole('dialog'));
    expect(onNextHand).not.toHaveBeenCalled();
  });
});
