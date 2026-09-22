import { describe, expect, it } from 'vitest';
import { parseCards } from './cards';
import { compareHands, evaluateHand } from './evaluator';

describe('evaluateHand', () => {
  it('detects royal flush', () => {
    const h = evaluateHand(parseCards('AsKsQsJsTs'));
    expect(h.category).toBe('straightFlush');
    expect(h.description).toContain('Royal');
  });

  it('detects wheel straight', () => {
    const h = evaluateHand(parseCards('As2d3c4h5s'));
    expect(h.category).toBe('straight');
    expect(h.ranks[0]).toBe(5);
  });

  it('detects full house', () => {
    const h = evaluateHand(parseCards('AhAdAcKhKd'));
    expect(h.category).toBe('fullHouse');
  });

  it('picks best of 7 cards', () => {
    const h = evaluateHand(parseCards('AhAdKhKd2c3c9c'));
    expect(h.category).toBe('twoPair');
  });

  it('ranks quads over full house', () => {
    const q = parseCards('AhAdAcAs2d');
    const f = parseCards('KhKdKcQsQd');
    expect(compareHands(q, f)).toBeGreaterThan(0);
  });

  it('compares kickers on pairs', () => {
    const a = parseCards('AhAdKcQd2s');
    const b = parseCards('AsAcKdJd3s');
    expect(compareHands(a, b)).toBeGreaterThan(0);
  });
});
