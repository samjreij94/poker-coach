/**
 * Focused A1 rubric examples (Theodore order) — recommend + gradeAction.
 * Keeps Graphics signatures stable: recommend(input), gradeAction(advice, taken, putIn?).
 */
import { describe, expect, it } from 'vitest';
import { parseCards } from '../poker/cards';
import type { ActionType, PlayerState } from '../poker/types';
import { gradeAction } from './grade';
import { recommend } from './recommend';
import { isInOpenChart, handKey } from './preflop';
import { tagBoard } from './board';

const button = 0; // BTN=0, SB=1, BB=2, EP=3, MP=4, CO=5

function hero(seat: number, holes: string, stack = 200): PlayerState {
  return {
    id: seat,
    name: 'You',
    style: 'human',
    stack,
    holeCards: parseCards(holes),
    betThisStreet: 0,
    totalInvested: 0,
    folded: false,
    allIn: false,
    isHero: true,
    seat,
  };
}

function grade(
  input: Parameters<typeof recommend>[0],
  taken: ActionType,
  putIn?: number,
) {
  const advice = recommend(input);
  return { advice, grade: gradeAction(advice, taken, putIn) };
}

describe('A1 preflop charts', () => {
  it('BTN opens A9o; EP folds KTo', () => {
    expect(isInOpenChart('BTN', handKey(parseCards('Ah9d')))).toBe(true);
    expect(isInOpenChart('EP', handKey(parseCards('KhTd')))).toBe(false);
  });
});

describe('A1 example lines', () => {
  it('1. BTN RFI A9o raise 2.5bb → Good', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('Ah9d'),
        board: [],
        street: 'preflop',
        pot: 3,
        toCall: 0,
        hero: hero(0, 'Ah9d'),
        buttonSeat: button,
        currentBet: 0,
        minRaise: 2,
        villainsInHand: 5,
      },
      'raise',
      5,
    );
    expect(advice.recommended).toBe('raise');
    expect(g.grade).toBe('Good');
  });

  it('2. EP RFI KTo raise → Leak', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('KhTd'),
        board: [],
        street: 'preflop',
        pot: 3,
        toCall: 0,
        hero: hero(3, 'KhTd'),
        buttonSeat: button,
        currentBet: 0,
        minRaise: 2,
        villainsInHand: 5,
      },
      'raise',
      5,
    );
    expect(advice.recommended).toBe('fold');
    expect(g.grade).toBe('Leak');
  });

  it('3. EP limp AA → Leak', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('AsAh'),
        board: [],
        street: 'preflop',
        pot: 3,
        toCall: 0,
        hero: hero(3, 'AsAh'),
        buttonSeat: button,
        currentBet: 0,
        minRaise: 2,
        villainsInHand: 5,
      },
      'call',
      2,
    );
    expect(advice.recommended).toBe('raise');
    expect(g.grade).toBe('Leak');
  });

  it('4. BB vs BTN 76s call → Good', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('7h6h'),
        board: [],
        street: 'preflop',
        pot: 6.5,
        toCall: 3,
        hero: hero(2, '7h6h'),
        buttonSeat: button,
        currentBet: 5,
        minRaise: 2,
        villainsInHand: 1,
        openerIsLate: true,
      },
      'call',
      3,
    );
    expect(advice.recommended).toBe('call');
    expect(g.grade).toBe('Good');
  });

  it('5. SB vs CO A5s call → OK (prefer 3-bet)', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('Ah5h'),
        board: [],
        street: 'preflop',
        pot: 6.5,
        toCall: 4,
        hero: hero(1, 'Ah5h'),
        buttonSeat: button,
        currentBet: 5,
        minRaise: 2,
        villainsInHand: 1,
      },
      'call',
      4,
    );
    expect(advice.recommended).toBe('raise');
    expect(g.grade).toBe('OK');
  });

  it('6. SB vs CO A5s 3-bet → Good', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('Ah5h'),
        board: [],
        street: 'preflop',
        pot: 6.5,
        toCall: 4,
        hero: hero(1, 'Ah5h'),
        buttonSeat: button,
        currentBet: 5,
        minRaise: 2,
        villainsInHand: 1,
      },
      'raise',
      20,
    );
    expect(advice.recommended).toBe('raise');
    expect(g.grade).toBe('Good');
  });

  it('7. BB vs EP J7o call → Leak', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('Jh7d'),
        board: [],
        street: 'preflop',
        pot: 6.5,
        toCall: 3,
        hero: hero(2, 'Jh7d'),
        buttonSeat: button,
        currentBet: 5,
        minRaise: 2,
        villainsInHand: 1,
        openerIsLate: false,
      },
      'call',
      3,
    );
    expect(advice.recommended).toBe('fold');
    expect(g.grade).toBe('Leak');
  });

  it('8. BTN AKo vs BB 3-bet → 4-bet Good', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('AhKd'),
        board: [],
        street: 'preflop',
        pot: 17,
        toCall: 12,
        hero: hero(0, 'AhKd'),
        buttonSeat: button,
        currentBet: 17,
        minRaise: 2,
        villainsInHand: 1,
      },
      'raise',
      38, // within sizeRange ~2.2× 3-bet
    );
    expect(advice.recommended).toBe('raise');
    expect(g.grade).toBe('Good');
  });

  it('9. BTN A9o call vs 3-bet → Leak', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('Ah9d'),
        board: [],
        street: 'preflop',
        pot: 17,
        toCall: 12,
        hero: hero(0, 'Ah9d'),
        buttonSeat: button,
        currentBet: 17,
        minRaise: 2,
        villainsInHand: 1,
      },
      'call',
      12,
    );
    expect(advice.recommended).toBe('fold');
    expect(g.grade).toBe('Leak');
  });

  it('10. PFR IP dry K72r TPTK bet 33% → Good', () => {
    const board = parseCards('Kh7c2d');
    expect(tagBoard(board)).toContain('dry');
    const { advice, grade: g } = grade(
      {
        hole: parseCards('AcKd'),
        board,
        street: 'flop',
        pot: 6.5,
        toCall: 0,
        hero: hero(0, 'AcKd'),
        buttonSeat: button,
        currentBet: 0,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: true,
      },
      'bet',
      2,
    );
    expect(advice.recommended).toBe('bet');
    expect(advice.handClass).toBe('strongMade');
    expect(g.grade).toBe('Good');
  });

  it('11. PFR IP dry air check → OK', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('8c3d'),
        board: parseCards('Kh7c2d'),
        street: 'flop',
        pot: 6.5,
        toCall: 0,
        hero: hero(0, '8c3d'),
        buttonSeat: button,
        currentBet: 0,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: true,
      },
      'check',
    );
    expect(advice.recommended).toBe('bet');
    expect(advice.handClass).toBe('air');
    expect(g.grade).toBe('OK');
  });

  it('12. PFR IP dry air overbet 125% → Leak', () => {
    const { grade: g } = grade(
      {
        hole: parseCards('8c3d'),
        board: parseCards('Kh7c2d'),
        street: 'flop',
        pot: 6.5,
        toCall: 0,
        hero: hero(0, '8c3d'),
        buttonSeat: button,
        currentBet: 0,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: true,
      },
      'bet',
      8,
    );
    expect(g.grade).toBe('Leak');
  });

  it('13. PFR monotone overpair large c-bet → OK', () => {
    const board = parseCards('JhTh9h');
    expect(tagBoard(board)).toContain('monotone');
    const { advice, grade: g } = grade(
      {
        hole: parseCards('AsAd'),
        board,
        street: 'flop',
        pot: 6.5,
        toCall: 0,
        hero: hero(0, 'AsAd'),
        buttonSeat: button,
        currentBet: 0,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: true,
      },
      'bet',
      5,
    );
    expect(advice.recommended).toBe('check');
    expect(g.grade).toBe('OK');
  });

  it('14. BB set faces 33% → check-raise Good', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('9c9d'),
        board: parseCards('Qh9h4c'),
        street: 'flop',
        pot: 6.5,
        toCall: 2,
        hero: hero(2, '9c9d'),
        buttonSeat: button,
        currentBet: 2,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: false,
      },
      'raise',
      8,
    );
    expect(advice.handClass).toBe('nuts');
    expect(advice.recommended).toBe('raise');
    expect(g.grade).toBe('Good');
  });

  it('16. BB gutshot vs 75% no odds call → Leak', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('Jh8d'),
        board: parseCards('Qc9h4c'),
        street: 'flop',
        pot: 10,
        toCall: 8,
        hero: hero(2, 'Jh8d', 190),
        buttonSeat: button,
        currentBet: 8,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: false,
      },
      'call',
      8,
    );
    expect(advice.recommended).toBe('fold');
    expect(g.grade).toBe('Leak');
  });

  it('17. BB nut FD vs 33% call → Good', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('AsKs'),
        board: parseCards('2s7s9d'),
        street: 'flop',
        pot: 30,
        toCall: 5,
        hero: hero(2, 'AsKs', 180),
        buttonSeat: button,
        currentBet: 5,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: false,
      },
      'call',
      5,
    );
    expect(['call', 'raise']).toContain(advice.recommended);
    expect(advice.handClass).toBe('strongDraw');
    expect(g.grade).toBe('Good');
  });

  it('18. Low SPR TPTK faces jam → call Good', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('AcKd'),
        board: parseCards('Kh7c2d'),
        street: 'flop',
        pot: 40,
        toCall: 80,
        hero: hero(2, 'AcKd', 80),
        buttonSeat: button,
        currentBet: 80,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: false,
      },
      'call',
      80,
    );
    expect(advice.recommended).toBe('call');
    expect(g.grade).toBe('Good');
  });

  it('19. High SPR weak pair faces shove → call Leak', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('Qc2d'),
        board: parseCards('Qh7c3d9s'),
        street: 'turn',
        pot: 20,
        toCall: 180,
        hero: hero(5, 'Qc2d', 180),
        buttonSeat: button,
        currentBet: 180,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: true,
      },
      'call',
      180,
    );
    expect(advice.recommended).toBe('fold');
    expect(advice.handClass).toBe('weakMade');
    expect(g.grade).toBe('Leak');
  });

  it('20. River nuts checked to hero — check → Leak', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('AsKs'),
        board: parseCards('2s7s9d3c8s'),
        street: 'river',
        pot: 40,
        toCall: 0,
        hero: hero(0, 'AsKs', 160),
        buttonSeat: button,
        currentBet: 0,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: true,
      },
      'check',
    );
    expect(advice.recommended).toBe('bet');
    expect(advice.handClass).toBe('nuts');
    expect(g.grade).toBe('Leak');
  });

  it('22. Turn missed draw faces 2/3 pot call → Leak', () => {
    const { advice, grade: g } = grade(
      {
        hole: parseCards('8c3d'),
        board: parseCards('Kh7c2d9s'),
        street: 'turn',
        pot: 20,
        toCall: 14,
        hero: hero(2, '8c3d', 150),
        buttonSeat: button,
        currentBet: 14,
        minRaise: 2,
        villainsInHand: 1,
        heroIsPfr: false,
      },
      'call',
      14,
    );
    expect(advice.recommended).toBe('fold');
    expect(g.grade).toBe('Leak');
  });
});
