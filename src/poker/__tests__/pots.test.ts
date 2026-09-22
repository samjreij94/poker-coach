import { describe, expect, it } from 'vitest';
import { buildPots, totalPot } from '../pots';
import { potOdds, spr } from '../odds';
import type { PlayerState } from '../types';

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
    allIn: invested >= 200,
    isHero: false,
    seat: id,
  };
}

describe('pots', () => {
  it('single main pot when even investments', () => {
    const pots = buildPots([p(0, 50), p(1, 50), p(2, 50)]);
    expect(totalPot(pots)).toBe(150);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.eligible.sort()).toEqual([0, 1, 2]);
  });

  it('side pot with all-in short stack', () => {
    // A all-in 50, B/C put in 100 each
    const pots = buildPots([p(0, 50), p(1, 100), p(2, 100)]);
    expect(totalPot(pots)).toBe(250);
    // Main: 50*3=150 eligible all three; side: 50*2=100 eligible B,C
    expect(pots.length).toBeGreaterThanOrEqual(2);
    const main = pots.find((x) => x.eligible.length === 3);
    const side = pots.find((x) => x.eligible.length === 2);
    expect(main?.amount).toBe(150);
    expect(side?.amount).toBe(100);
    expect(side?.eligible.sort()).toEqual([1, 2]);
  });

  it('folded player chips stay but not eligible', () => {
    const pots = buildPots([p(0, 40, true), p(1, 100), p(2, 100)]);
    expect(totalPot(pots)).toBe(240);
    for (const pot of pots) {
      expect(pot.eligible.includes(0)).toBe(false);
    }
  });
});

describe('odds / SPR', () => {
  it('potOdds', () => {
    expect(potOdds(100, 50)).toBeCloseTo(50 / 150);
    expect(potOdds(100, 0)).toBe(0);
  });

  it('spr', () => {
    expect(spr(200, 10)).toBe(20);
    expect(spr(100, 0)).toBe(Infinity);
  });
});
