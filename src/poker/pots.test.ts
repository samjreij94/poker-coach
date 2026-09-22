import { describe, expect, it } from 'vitest';
import { buildPots, totalPot } from './pots';
import type { PlayerState } from './types';

function p(
  id: number,
  invested: number,
  folded = false,
): PlayerState {
  return {
    id,
    name: `P${id}`,
    style: 'tight',
    stack: 200 - invested,
    holeCards: [],
    betThisStreet: 0,
    totalInvested: invested,
    folded,
    allIn: invested > 0 && 200 - invested === 0,
    isHero: false,
    seat: id,
  };
}

describe('buildPots', () => {
  it('single main pot', () => {
    const pots = buildPots([p(0, 50), p(1, 50), p(2, 50)]);
    expect(totalPot(pots)).toBe(150);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.eligible.sort()).toEqual([0, 1, 2]);
  });

  it('builds side pot when short all-in', () => {
    const pots = buildPots([p(0, 50), p(1, 100), p(2, 100)]);
    expect(totalPot(pots)).toBe(250);
    expect(pots.length).toBeGreaterThanOrEqual(2);
    const main = pots[0]!;
    expect(main.amount).toBe(150); // 50*3
    expect(main.eligible.sort()).toEqual([0, 1, 2]);
  });

  it('excludes folded from eligibility', () => {
    const pots = buildPots([p(0, 40, true), p(1, 40), p(2, 40)]);
    expect(totalPot(pots)).toBe(120);
    expect(pots[0]!.eligible.sort()).toEqual([1, 2]);
  });
});
