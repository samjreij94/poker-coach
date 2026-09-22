import { describe, expect, it } from 'vitest';
import { parseCards } from '../poker/cards';
import type { PlayerState } from '../poker/types';
import { classifyHand } from './handClass';
import { gradeAction } from './grade';
import { recommend } from './recommend';

const heroBase: PlayerState = {
  id: 3,
  name: 'You',
  style: 'human',
  stack: 200,
  holeCards: [],
  betThisStreet: 0,
  totalInvested: 0,
  folded: false,
  allIn: false,
  isHero: true,
  seat: 3,
};

describe('classifyHand', () => {
  it('flags AA as nuts preflop', () => {
    expect(classifyHand(parseCards('AsAh'), [], 'preflop')).toBe('nuts');
  });

  it('flags flush draw as strongDraw', () => {
    const hole = parseCards('AsKs');
    const board = parseCards('2s7s9d');
    expect(classifyHand(hole, board, 'flop')).toBe('strongDraw');
  });

  it('flags top set as nuts (A1 dry-board stack-off bucket)', () => {
    const hole = parseCards('AhAd');
    const board = parseCards('As7c2d');
    expect(classifyHand(hole, board, 'flop')).toBe('nuts');
  });
});

describe('recommend', () => {
  it('raises AA on the button preflop', () => {
    const hero = { ...heroBase, holeCards: parseCards('AsAh'), seat: 0 }; // BTN if button=0
    const adv = recommend({
      hole: hero.holeCards,
      board: [],
      street: 'preflop',
      pot: 3,
      toCall: 0,
      hero,
      buttonSeat: 0,
      currentBet: 0,
      minRaise: 2,
      villainsInHand: 5,
    });
    expect(adv.recommended).toBe('raise');
    expect(adv.handClass).toBe('nuts');
  });

  it('folds air facing big bet on river', () => {
    const hero = {
      ...heroBase,
      holeCards: parseCards('7c2d'),
      stack: 150,
    };
    const adv = recommend({
      hole: hero.holeCards,
      board: parseCards('AsKd9h3c8s'),
      street: 'river',
      pot: 40,
      toCall: 40,
      hero,
      buttonSeat: 0,
      currentBet: 40,
      minRaise: 2,
      villainsInHand: 1,
    });
    expect(adv.recommended).toBe('fold');
    expect(adv.handClass).toBe('air');
  });

  it('calls strong draw with good pot odds', () => {
    const hero = {
      ...heroBase,
      holeCards: parseCards('AsKs'),
      stack: 180,
    };
    const adv = recommend({
      hole: hero.holeCards,
      board: parseCards('2s7s9d'),
      street: 'flop',
      pot: 30,
      toCall: 5,
      hero,
      buttonSeat: 0,
      currentBet: 5,
      minRaise: 2,
      villainsInHand: 1,
    });
    expect(['call', 'raise', 'bet']).toContain(adv.recommended);
    expect(adv.handClass).toBe('strongDraw');
  });
});


  it('always fills details with position/handClass lesson bullets', () => {
    const hero = { ...heroBase, holeCards: parseCards('AsAh'), seat: 0 };
    const adv = recommend({
      hole: hero.holeCards,
      board: [],
      street: 'preflop',
      pot: 3,
      toCall: 0,
      hero,
      buttonSeat: 0,
      currentBet: 0,
      minRaise: 2,
      villainsInHand: 5,
    });
    expect(adv.details).toBeDefined();
    expect(adv.details!.length).toBeGreaterThan(0);
    expect(adv.details!.length).toBeLessThanOrEqual(5);
    expect(adv.details![0]).toMatch(/button \(dealer seat\)/i);
    expect(adv.details!.some((d) => /Stack-to-pot ratio/i.test(d))).toBe(true);
  });

  it('PF_3BET_OR_FOLD details teach 3-bet-or-fold vs flat', () => {
    // SB facing open with trash → fold / PF_3BET_OR_FOLD (button=0 → seat 1 = SB)
    const sb = { ...heroBase, holeCards: parseCards('7c2d'), stack: 198, betThisStreet: 1, seat: 1 };
    const adv = recommend({
      hole: sb.holeCards,
      board: [],
      street: 'preflop',
      pot: 5,
      toCall: 3, // facing ~2.5x open after posting 1
      hero: sb,
      buttonSeat: 0,
      currentBet: 5,
      minRaise: 2,
      villainsInHand: 1,
      openerIsLate: true,
    });
    expect(adv.reasonCode).toBe('PF_3BET_OR_FOLD');
    expect(adv.recommended).toBe('fold');
    expect(adv.details!.length).toBeGreaterThan(0);
    expect(adv.details!.some((d) => /Folding beats just calling|re-raised behind/i.test(d))).toBe(true);
    if (adv.potOdds && adv.potOdds > 0) {
      expect(adv.details!.some((d) => /Pot odds/i.test(d))).toBe(true);
    }
    if (adv.spr !== undefined) {
      expect(adv.details!.some((d) => /Stack-to-pot ratio/i.test(d))).toBe(true);
    }
  });

  it('plain-speaks cutoff + very weak hand (no CO/air jargon)', () => {
    const hero = {
      ...heroBase,
      holeCards: parseCards('7c2d'),
      stack: 200,
      seat: 5, // CO when button=0
    };
    const adv = recommend({
      hole: hero.holeCards,
      board: [],
      street: 'preflop',
      pot: 3,
      toCall: 0,
      hero,
      buttonSeat: 0,
      currentBet: 0,
      minRaise: 2,
      villainsInHand: 5,
    });
    const line = adv.details![0]!;
    expect(line).toMatch(/cutoff \(late position\)/i);
    expect(line).toMatch(/very weak hand/i);
    expect(line).not.toMatch(/\bCO\b/);
    expect(line).not.toMatch(/\bair\b/i);
    expect(adv.concepts.some((c) => /\bCO\b/.test(c) || /Hand class: air/i.test(c))).toBe(false);
  });

  it('postflop odds spot includes pot-odds and SPR details', () => {
    const hero = {
      ...heroBase,
      holeCards: parseCards('AsKs'),
      stack: 180,
    };
    const adv = recommend({
      hole: hero.holeCards,
      board: parseCards('2s7s9d'),
      street: 'flop',
      pot: 30,
      toCall: 5,
      hero,
      buttonSeat: 0,
      currentBet: 5,
      minRaise: 2,
      villainsInHand: 1,
    });
    expect(adv.potOdds).toBeGreaterThan(0);
    expect(adv.spr).toBeDefined();
    expect(adv.details).toBeDefined();
    expect(adv.details!.some((d) => /pot odds|chance of winning/i.test(d))).toBe(true);
    expect(adv.details!.some((d) => /Stack-to-pot ratio ≈/i.test(d))).toBe(true);
    expect(adv.details!.some((d) => /You're in early position with a strong draw/i.test(d))).toBe(true);
  });

describe('gradeAction', () => {
  it('grades matching action Good', () => {
    const advice = recommend({
      hole: parseCards('AsAh'),
      board: [],
      street: 'preflop',
      pot: 3,
      toCall: 0,
      hero: { ...heroBase, holeCards: parseCards('AsAh'), seat: 0 },
      buttonSeat: 0,
      currentBet: 0,
      minRaise: 2,
      villainsInHand: 5,
    });
    const g = gradeAction(advice, 'raise', 6);
    expect(g.grade).toBe('Good');
  });

  it('grades folding nuts as Leak', () => {
    const advice = {
      recommended: 'raise' as const,
      reason: 'test',
      concepts: [],
      handClass: 'nuts' as const,
      position: 'BTN' as const,
    };
    const g = gradeAction(advice, 'fold');
    expect(g.grade).toBe('Leak');
  });
});
