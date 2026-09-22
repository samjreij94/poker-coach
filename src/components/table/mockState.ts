/**
 * C1 mock table — presentation only. Dealer B5 replaces this with live
 * `toPublicView(gameState)`. Shape matches `PublicTableView` from poker engine.
 */
import { parseCards } from '../../poker/cards';
import type { PublicTableView } from '../../poker/game';
import type { PublicPlayerView } from '../../poker/game';

const heroHole = parseCards('AsAh'); // mock AA
const board = parseCards('Kd7c2h'); // mock flop

function seat(
  partial: Omit<PublicPlayerView, 'style' | 'betThisStreet' | 'allIn'> &
    Partial<Pick<PublicPlayerView, 'style' | 'betThisStreet' | 'allIn'>>,
): PublicPlayerView {
  return {
    style: 'tight',
    betThisStreet: 0,
    allIn: false,
    ...partial,
  };
}

/** Six-max flop scene: hero AA, villains in hand with face-down backs. */
export const MOCK_TABLE: PublicTableView = {
  street: 'flop',
  board,
  pot: 48,
  pots: [{ amount: 48, eligible: [0, 1, 2, 3, 4] }],
  currentBet: 12,
  minRaise: 12,
  toCall: 12,
  actingSeat: 0,
  buttonSeat: 3,
  handNumber: 7,
  winners: [],
  handResult: null,
  log: ['Hand #7', 'Flop Kd7c2h', 'Vic bets 12'],
  heroSeat: 0,
  legalActions: {
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 12,
    canBet: false,
    canRaise: true,
    minBet: 0,
    maxBet: 0,
    minRaiseTo: 24,
    maxRaiseTo: 188,
    quickSizes: [
      { label: '2x', amount: 24 },
      { label: 'Pot', amount: 36 },
    ],
  },
  players: [
    seat({
      id: 0,
      name: 'You',
      style: 'human',
      stack: 176,
      betThisStreet: 0,
      folded: false,
      isHero: true,
      seat: 0,
      position: 'EP',
      holeCards: heroHole,
    }),
    seat({
      id: 1,
      name: 'Tina Tight',
      stack: 210,
      betThisStreet: 0,
      folded: true,
      isHero: false,
      seat: 1,
      position: 'MP',
      holeCards: null,
    }),
    seat({
      id: 2,
      name: 'Larry LAG',
      style: 'lag',
      stack: 165,
      betThisStreet: 0,
      folded: false,
      isHero: false,
      seat: 2,
      position: 'CO',
      holeCards: null,
    }),
    seat({
      id: 3,
      name: 'Cathy Call',
      style: 'callingStation',
      stack: 198,
      betThisStreet: 0,
      folded: false,
      isHero: false,
      seat: 3,
      position: 'BTN',
      holeCards: null,
    }),
    seat({
      id: 4,
      name: 'Vic Value',
      stack: 142,
      betThisStreet: 12,
      folded: false,
      isHero: false,
      seat: 4,
      position: 'SB',
      holeCards: null,
    }),
    seat({
      id: 5,
      name: 'Pam Passive',
      style: 'callingStation',
      stack: 188,
      betThisStreet: 0,
      folded: true,
      isHero: false,
      seat: 5,
      position: 'BB',
      holeCards: null,
    }),
  ],
};
