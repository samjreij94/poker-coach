import type { PublicTableView } from '../poker/game';
import type { PlayerState } from '../poker/types';
import type { RecommendInput } from './recommend';

/**
 * Build coach RecommendInput from Dealer's PublicTableView + hero hole cards.
 * Prefers cards on the hero PublicPlayerView; falls back to `heroHole` when
 * the public view hides them (should not happen for hero).
 */
export function recommendInputFromView(
  view: PublicTableView,
  heroHole?: PlayerState['holeCards'],
): RecommendInput | null {
  const heroPub = view.players.find((p) => p.isHero) ?? view.players[view.heroSeat];
  if (!heroPub) return null;

  const hole = heroPub.holeCards ?? heroHole ?? [];
  if (hole.length < 2) return null;

  const hero: PlayerState = {
    id: heroPub.id,
    name: heroPub.name,
    style: heroPub.style,
    stack: heroPub.stack,
    holeCards: hole,
    betThisStreet: heroPub.betThisStreet,
    totalInvested: 0,
    folded: heroPub.folded,
    allIn: heroPub.allIn,
    isHero: true,
    seat: heroPub.seat,
  };

  return {
    hole,
    board: view.board,
    street: view.street,
    pot: view.pot,
    toCall: view.toCall,
    hero,
    buttonSeat: view.buttonSeat,
    seatCount: view.players.length,
    currentBet: view.currentBet,
    minRaise: view.minRaise,
    villainsInHand: view.players.filter((p) => !p.isHero && !p.folded).length,
  };
}
