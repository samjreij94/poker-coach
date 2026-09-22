export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'handOver';
export type Position = 'EP' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB';
export type BotStyle = 'tight' | 'lag' | 'callingStation' | 'human';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface PlayerAction {
  type: ActionType;
  amount?: number; // total chips put in on this street for bets/raises, or call amount
}

export interface PlayerState {
  id: number;
  name: string;
  style: BotStyle;
  stack: number;
  holeCards: Card[];
  betThisStreet: number;
  totalInvested: number;
  folded: boolean;
  allIn: boolean;
  isHero: boolean;
  seat: number; // 0-5 around table
}

export interface Pot {
  amount: number;
  eligible: number[]; // player ids
}

export interface GameConfig {
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  seats: number;
}

/** 6-max cash: $1/$2 with 100bb starts ($200). startingStack is chips, not bb. */
export const DEFAULT_CONFIG: GameConfig = {
  smallBlind: 1,
  bigBlind: 2,
  startingStack: 200, // 100bb at $2 BB
  seats: 6,
};

export type HandClass =
  | 'air'
  | 'weakDraw'
  | 'strongDraw'
  | 'weakMade'
  | 'strongMade'
  | 'nuts';

export type Grade = 'Good' | 'OK' | 'Leak';

export interface CoachAdvice {
  recommended: ActionType;
  sizeRange?: { min: number; max: number; label: string };
  /** One-line headline for the strip / splash */
  reason: string;
  /**
   * Short plain-English lesson bullets for the learner (max ~5).
   * Graphics may show under `reason`; always populated by recommend().
   */
  details?: string[];
  concepts: string[];
  handClass: HandClass;
  position: Position;
  potOdds?: number;
  spr?: number;
  /** Optional stable reason id (A2); Graphics may ignore and use `reason` */
  reasonCode?: string;
  /** Optional street for richer grading (backward compatible) */
  street?: Street;
}

export interface CoachGrade {
  grade: Grade;
  why: string;
  advice: CoachAdvice;
}

export type HandCategory =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'quads'
  | 'straightFlush';

export interface HandRank {
  category: HandCategory;
  rankValue: number; // comparable integer
  ranks: number[]; // kickers / component ranks for display
  description: string;
}
