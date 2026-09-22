import { describe, expect, it } from 'vitest';
import { parseCards } from '../poker/cards';
import { normalizeHandResult } from './handResult';

describe('normalizeHandResult', () => {
  it('returns null when absent', () => {
    expect(normalizeHandResult(null)).toBeNull();
  });

  it('passes through live Chief shape', () => {
    const board = parseCards('AsKh7d2c3s');
    const r = normalizeHandResult({
      kind: 'showdown',
      heroOutcome: 'win',
      potTotal: 42,
      why: 'You won $42 with Pair of Aces',
      board,
      winners: [
        {
          seat: 0,
          name: 'You',
          amountWon: 42,
          handName: 'Pair of Aces',
          holeCards: parseCards('AsAh'),
        },
      ],
    });
    expect(r?.kind).toBe('showdown');
    expect(r?.why).toMatch(/Pair of Aces/);
    expect(r?.winners[0]?.amountWon).toBe(42);
    expect(r?.board).toHaveLength(5);
  });

  it('maps legacy summary/label/amount', () => {
    const r = normalizeHandResult({
      heroOutcome: 'lose',
      potTotal: 20,
      summary: 'Tina won uncontested — all folded',
      winners: [{ seat: 1, label: 'Tina', amount: 20 }],
    });
    expect(r?.kind).toBe('fold');
    expect(r?.why).toMatch(/Tina/);
    expect(r?.winners[0]?.name).toBe('Tina');
    expect(r?.winners[0]?.amountWon).toBe(20);
  });
});
