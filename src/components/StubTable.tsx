/**
 * Minimal playable shell — Graphics replaces this with the felt UI.
 * Demonstrates wiring to usePokerCoach / PublicTableView.
 */
import { rankLabel, suitSymbol, suitColor } from '../poker/cards';
import type { Card } from '../poker/types';
import type { PokerCoachApi } from '../hooks/usePokerCoach';
import './StubTable.css';

function CardView({ card }: { card: Card }) {
  const color = suitColor(card.suit);
  return (
    <span className={`card card--${color}`}>
      {rankLabel(card.rank)}
      {suitSymbol(card.suit)}
    </span>
  );
}

export function StubTable({ api }: { api: PokerCoachApi }) {
  const { view, advice, lastGrade, coachEnabled, setCoachEnabled, newHand, resetStacks, heroAct } =
    api;
  const legal = view.legalActions;
  const hero = view.players.find((p) => p.isHero);

  return (
    <div className="stub">
      <header className="stub__hdr">
        <strong>Poker Coach</strong>
        <span className="stub__meta">
          NLHE 6-max $1/$2 · Hand #{view.handNumber || '—'} · {view.street}
        </span>
      </header>

      <div className="stub__toolbar">
        <button type="button" onClick={newHand}>
          New hand
        </button>
        <button type="button" onClick={resetStacks}>
          Reset stacks
        </button>
        <label className="stub__toggle">
          <input
            type="checkbox"
            checked={coachEnabled}
            onChange={(e) => setCoachEnabled(e.target.checked)}
          />
          Coach
        </label>
      </div>

      <div className="stub__pot">Pot: ${view.pot}</div>

      <div className="stub__board">
        {view.board.length === 0 && <span className="muted">No board yet</span>}
        {view.board.map((c, i) => (
          <CardView key={i} card={c} />
        ))}
      </div>

      <ul className="stub__seats">
        {view.players.map((p) => (
          <li
            key={p.id}
            className={[
              p.isHero && 'is-hero',
              p.seat === view.actingSeat && 'is-acting',
              p.folded && 'is-folded',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div>
              {p.name} · {p.position}
              {p.seat === view.buttonSeat ? ' Ⓑ' : ''}
              {p.allIn ? ' ALL-IN' : ''}
            </div>
            <div>
              ${p.stack}
              {p.betThisStreet > 0 ? ` (bet ${p.betThisStreet})` : ''}
            </div>
            <div className="stub__holes">
              {p.holeCards
                ? p.holeCards.map((c, i) => <CardView key={i} card={c} />)
                : p.folded
                  ? '—'
                  : '🂠🂠'}
            </div>
          </li>
        ))}
      </ul>

      {hero && (
        <div className="stub__hero">
          Your cards:{' '}
          {hero.holeCards?.map((c, i) => <CardView key={i} card={c} />) ?? '—'}
        </div>
      )}

      {view.winners.length > 0 && (
        <div className="stub__winners">
          {view.winners.map((w, i) => (
            <div key={i}>{w.description}</div>
          ))}
        </div>
      )}

      {coachEnabled && advice && (
        <aside className="stub__coach" data-testid="coach-panel">
          <div className="stub__coach-title">Coach</div>
          <div>
            <strong>{advice.recommended.toUpperCase()}</strong>
            {advice.sizeRange ? ` · ${advice.sizeRange.label} (~${advice.sizeRange.min}–${advice.sizeRange.max})` : ''}
          </div>
          <p>{advice.reason}</p>
          <div className="stub__concepts">
            {advice.concepts.map((c) => (
              <span key={c} className="tag">
                {c}
              </span>
            ))}
          </div>
        </aside>
      )}

      {coachEnabled && lastGrade && (
        <div className={`stub__grade stub__grade--${lastGrade.grade.toLowerCase()}`}>
          {lastGrade.grade}: {lastGrade.why}
        </div>
      )}

      {legal && (
        <div className="stub__actions">
          {legal.canFold && (
            <button type="button" onClick={() => heroAct({ type: 'fold' })}>
              Fold
            </button>
          )}
          {legal.canCheck && (
            <button type="button" onClick={() => heroAct({ type: 'check' })}>
              Check
            </button>
          )}
          {legal.canCall && (
            <button
              type="button"
              onClick={() =>
                heroAct({ type: 'call', amount: legal.callAmount })
              }
            >
              Call ${legal.callAmount}
            </button>
          )}
          {legal.quickSizes.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() =>
                heroAct({
                  type: legal.canBet ? 'bet' : 'raise',
                  amount: q.amount,
                })
              }
            >
              {q.label} (${q.amount})
            </button>
          ))}
        </div>
      )}

      {!legal && view.street === 'handOver' && (
        <p className="muted">Deal a new hand to play.</p>
      )}

      <footer className="stub__foot">
        Educational trainer only — no real-money gambling.
      </footer>
    </div>
  );
}
