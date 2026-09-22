import { describe, expect, it } from 'vitest';
import { outsToEquity, potOdds, requiredEquity, spr } from './odds';

describe('potOdds', () => {
  it('computes call fraction', () => {
    expect(potOdds(100, 50)).toBeCloseTo(50 / 150);
  });

  it('is 0 when free', () => {
    expect(potOdds(100, 0)).toBe(0);
  });
});

describe('requiredEquity', () => {
  it('matches pot odds', () => {
    expect(requiredEquity(80, 20)).toBeCloseTo(0.2);
  });
});

describe('spr', () => {
  it('divides stack by pot', () => {
    expect(spr(200, 50)).toBe(4);
  });
});

describe('outsToEquity', () => {
  it('approximates flush draw turn', () => {
    const eq = outsToEquity(9, 1);
    expect(eq).toBeGreaterThan(0.15);
    expect(eq).toBeLessThan(0.25);
  });

  it('approximates flush draw flop', () => {
    const eq = outsToEquity(9, 2);
    expect(eq).toBeGreaterThan(0.3);
    expect(eq).toBeLessThan(0.45);
  });
});
