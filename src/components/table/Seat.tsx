import type { PublicPlayerView } from '../../poker/game';
import { CardView } from './CardView';
import { formatChips } from './formatChips';
import './Seat.css';

interface SeatProps {
  player: PublicPlayerView;
  isDealer: boolean;
  isActing: boolean;
  /** CSS slot class e.g. pc-seat--slot-0 */
  slotClass: string;
}

export function Seat({ player, isDealer, isActing, slotClass }: SeatProps) {
  const folded = player.folded;
  const inHand = !folded;
  const showFaceUp = Boolean(player.holeCards && player.holeCards.length > 0);
  const cardSize = player.isHero ? 'lg' : 'sm';

  return (
    <div
      className={[
        'pc-seat',
        slotClass,
        player.isHero ? 'pc-seat--hero' : '',
        folded ? 'pc-seat--folded' : 'pc-seat--active',
        isActing ? 'pc-seat--acting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-seat={player.seat}
    >
      <div className="pc-seat__cards" aria-hidden={folded && !showFaceUp}>
        {inHand || showFaceUp ? (
          showFaceUp ? (
            <>
              <CardView card={player.holeCards![0]} size={cardSize} />
              <CardView card={player.holeCards![1]} size={cardSize} />
            </>
          ) : (
            <>
              <CardView faceDown size={cardSize} />
              <CardView faceDown size={cardSize} />
            </>
          )
        ) : null}
      </div>

      {player.betThisStreet > 0 ? (
        <div className="pc-seat__bet" aria-label={`Bet ${formatChips(player.betThisStreet)}`}>
          {formatChips(player.betThisStreet)}
        </div>
      ) : null}

      <div className="pc-seat__plaque">
        <div className="pc-seat__avatar" aria-hidden>
          {player.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="pc-seat__meta">
          <div className="pc-seat__name-row">
            <span className="pc-seat__name">{player.isHero ? 'You' : player.name}</span>
            {isDealer ? (
              <span className="pc-seat__dealer" title="Dealer">
                D
              </span>
            ) : null}
          </div>
          <div className="pc-seat__stack">
            {player.allIn ? 'ALL-IN' : formatChips(player.stack)}
          </div>
          <div className="pc-seat__pos">{player.position}</div>
        </div>
      </div>
    </div>
  );
}
