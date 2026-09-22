import type { PublicTableView } from '../../poker/game';
import { CardView } from './CardView';
import { Pot } from './Pot';
import { Seat } from './Seat';
import './Table.css';

interface TableProps {
  view: PublicTableView;
}

/** Map absolute seat → visual slot so hero is always bottom-center (slot 0). */
function visualSlot(seat: number, heroSeat: number, seatCount = 6): number {
  return ((seat - heroSeat) % seatCount + seatCount) % seatCount;
}

export function Table({ view }: TableProps) {
  const boardSlots = 5;
  const boardCards = Array.from({ length: boardSlots }, (_, i) => view.board[i] ?? null);

  return (
    <div className="pc-table" role="region" aria-label="Poker table">
      <div className="pc-table__rail">
        <div className="pc-table__felt">
          <div className="pc-table__felt-glow" aria-hidden />

          <div className="pc-table__center">
            <Pot amount={view.pot} street={view.street} />
            <div className="pc-table__board" aria-label="Community cards">
              {boardCards.map((card, i) =>
                card ? (
                  <CardView key={`board-${i}`} card={card} size="md" />
                ) : (
                  <div key={`board-empty-${i}`} className="pc-table__board-slot" />
                ),
              )}
            </div>
            <div className="pc-table__hand-meta">Hand #{view.handNumber}</div>
          </div>

          {view.players.map((p) => (
            <Seat
              key={p.id}
              player={p}
              isDealer={p.seat === view.buttonSeat}
              isActing={p.seat === view.actingSeat}
              slotClass={`pc-seat--slot-${visualSlot(p.seat, view.heroSeat)}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
