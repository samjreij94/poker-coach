/**
 * Presentation-facing table types (C1).
 *
 * Dealer owns the engine contract in `src/poker/game.ts` (`PublicTableView`,
 * `PublicPlayerView`, `GameState`) and `src/poker/types.ts` (`Card`, `PlayerState`, …).
 * UI should consume `PublicTableView` (or this thin alias) so Dealer can swap
 * mock → live without a parallel seat/card contract.
 *
 * Hero is identified by `isHero` / `heroSeat` (often seat 0 in mocks).
 */
export type {
  Card,
  Street,
  Position,
  PlayerState,
  Pot,
  Suit,
  Rank,
} from '../poker/types';

export type {
  PublicTableView as TableState,
  PublicPlayerView as SeatView,
  LegalActions,
  GameState,
  HandResult,
  HandResultWinner,
  HeroHandOutcome,
} from '../poker/game';
