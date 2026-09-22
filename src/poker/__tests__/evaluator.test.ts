import { describe, expect, it } from 'vitest';
import { parseCards } from '../cards';
import { compareHands, evaluateHand } from '../evaluator';

describe('evaluator', () => {
  it('pair beats high card', () => {
    const pair = evaluateHand(parseCards('AsAh2c7d9s'));
    const high = evaluateHand(parseCards('AsKh2c7d9s'));
    expect(pair.category).toBe('pair');
    expect(high.category).toBe('highCard');
    expect(pair.rankValue).toBeGreaterThan(high.rankValue);
  });

  it('wheel straight A-2-3-4-5', () => {
    const wheel = evaluateHand(parseCards('As2h3c4d5s'));
    expect(wheel.category).toBe('straight');
    expect(wheel.ranks[0]).toBe(5);
  });

  it('broadway beats wheel', () => {
    const broadway = parseCards('AsKhQcJdTs');
    const wheel = parseCards('As2h3c4d5s');
    expect(compareHands(broadway, wheel)).toBeGreaterThan(0);
  });

  it('flush beats straight', () => {
    const flush = evaluateHand(parseCards('AsKs9s4s2s'));
    const straight = evaluateHand(parseCards('9h8c7d6s5h'));
    expect(flush.category).toBe('flush');
    expect(straight.category).toBe('straight');
    expect(flush.rankValue).toBeGreaterThan(straight.rankValue);
  });

  it('full house from 7 cards', () => {
    const fh = evaluateHand(parseCards('AsAhAcKdKh2c9s'));
    expect(fh.category).toBe('fullHouse');
  });
});
