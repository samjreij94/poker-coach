import { parseCard } from '../../poker/cards';
import type { Card } from '../../poker/types';
import type { UiHandResult } from '../../types/handResult';
import { CardView } from './CardView';
import { formatChips } from './formatChips';
import './HandResultSplash.css';

interface HandResultSplashProps {
  result: UiHandResult;
  onNextHand: () => void;
}

const OUTCOME_LABEL: Record<UiHandResult['heroOutcome'], string> = {
  win: 'WIN',
  lose: 'LOSE',
  split: 'SPLIT',
};

/**
 * Full-screen hand-over splash — bind to normalized view.handResult only.
 */
export function HandResultSplash({ result, onNextHand }: HandResultSplashProps) {
  const { heroOutcome, potTotal, why, winners, board, kind } = result;
  const outcomeWord = OUTCOME_LABEL[heroOutcome];

  const wonAmount = winners.reduce((s, w) => s + w.amountWon, 0) || potTotal;

  const whoLine =
    heroOutcome === 'lose'
      ? winners.length === 1
        ? `${winners[0]!.name} wins ${formatChips(winners[0]!.amountWon)}`
        : winners.map((w) => `${w.name} ${formatChips(w.amountWon)}`).join(' · ')
      : heroOutcome === 'split'
        ? `Split pot · ${formatChips(potTotal)}`
        : `You won ${formatChips(wonAmount)}`;

  const showBoard = (kind === 'showdown' || board.length > 0) && board.length > 0;
  const showdownWinners = winners.filter(
    (w) => w.holeCards && w.holeCards.length > 0,
  );

  return (
    <div
      className="pc-hand-splash"
      role="dialog"
      aria-modal="true"
      aria-label={`Hand result: ${outcomeWord}`}
      onClick={onNextHand}
    >
      <div
        className={`pc-hand-splash__panel pc-hand-splash__panel--${heroOutcome}`}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className={`pc-hand-splash__outcome pc-hand-splash__outcome--${heroOutcome}`}
        >
          {outcomeWord}
        </p>

        <p className="pc-hand-splash__who">{whoLine}</p>
        <p className="pc-hand-splash__pot">Pot {formatChips(potTotal)}</p>
        {why ? <p className="pc-hand-splash__why">{why}</p> : null}

        {showBoard ? (
          <div className="pc-hand-splash__board" aria-label="Board">
            {board.map((c, i) => (
              <CardView key={`board-${i}`} card={c} size="sm" />
            ))}
          </div>
        ) : null}

        {showdownWinners.length > 0 ? (
          <div className="pc-hand-splash__holes" aria-label="Winner hole cards">
            {showdownWinners.map((w) => (
              <div key={`${w.seat}-${w.name}`} className="pc-hand-splash__winner">
                <span className="pc-hand-splash__winner-name">
                  {w.name}
                  {w.handName ? ` · ${w.handName}` : ''}
                </span>
                <div className="pc-hand-splash__cards">
                  {w.holeCards!.map((c, i) => (
                    <CardView key={i} card={asCard(c)} size="md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className="pc-hand-splash__cta"
          onClick={onNextHand}
        >
          Next Hand
        </button>
      </div>
    </div>
  );
}

function asCard(c: Card | string): Card | null {
  if (typeof c !== 'string') return c;
  try {
    return parseCard(c);
  } catch {
    return null;
  }
}
