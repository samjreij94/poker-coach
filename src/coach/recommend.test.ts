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
