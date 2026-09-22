import type { LegalActions } from '../../poker/game';
import type { ActionType } from '../../poker/types';
import { formatChips } from './formatChips';
import './ActionBar.css';

export interface HeroActionPayload {
  type: ActionType;
  amount?: number;
}

interface ActionBarProps {
  legal: LegalActions | null;
  /** When null/undefined, show empty C1 placeholder strip */
  disabled?: boolean;
  onAction?: (action: HeroActionPayload) => void;
}

/**
 * C2 action bar driven by `PublicTableView.legalActions`.
 * Reserved ~120–160px bottom band; ≥44px touch targets.
 */
export function ActionBar({ legal, disabled = false, onAction }: ActionBarProps) {
  if (!legal) {
    return (
      <div className="pc-actions pc-actions--placeholder" aria-label="Action bar">
        <span className="pc-actions__placeholder-label">Actions</span>
      </div>
    );
  }

  const emit = (type: ActionType, amount?: number) => {
    if (disabled || !onAction) return;
    onAction({ type, amount });
  };

  return (
    <div className="pc-actions" role="toolbar" aria-label="Hero actions">
      <div className="pc-actions__row">
        {legal.canFold ? (
          <button
            type="button"
            className="pc-actions__btn pc-actions__btn--fold"
            disabled={disabled}
            onClick={() => emit('fold')}
          >
            Fold
          </button>
        ) : (
          <span className="pc-actions__spacer" />
        )}

        {legal.canCheck ? (
          <button
            type="button"
            className="pc-actions__btn pc-actions__btn--check"
            disabled={disabled}
            onClick={() => emit('check')}
          >
            Check
          </button>
        ) : null}

        {legal.canCall ? (
          <button
            type="button"
            className="pc-actions__btn pc-actions__btn--call"
            disabled={disabled}
            onClick={() => emit('call', legal.callAmount)}
          >
            Call {formatChips(legal.callAmount)}
          </button>
        ) : null}

        {legal.canBet ? (
          <button
            type="button"
            className="pc-actions__btn pc-actions__btn--raise"
            disabled={disabled}
            onClick={() => emit('bet', legal.minBet)}
          >
            Bet {formatChips(legal.minBet)}
          </button>
        ) : null}

        {legal.canRaise ? (
          <button
            type="button"
            className="pc-actions__btn pc-actions__btn--raise"
            disabled={disabled}
            onClick={() => emit('raise', legal.minRaiseTo)}
          >
            Raise {formatChips(legal.minRaiseTo)}
          </button>
        ) : null}
      </div>

      {legal.quickSizes.length > 0 && (legal.canBet || legal.canRaise) ? (
        <div className="pc-actions__sizes">
          {legal.quickSizes.map((s) => (
            <button
              key={s.label}
              type="button"
              className="pc-actions__size"
              disabled={disabled}
              onClick={() =>
                emit(legal.canBet && !legal.canRaise ? 'bet' : 'raise', s.amount)
              }
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            className="pc-actions__size pc-actions__size--allin"
            disabled={disabled}
            onClick={() => emit('allin', legal.maxRaiseTo || legal.maxBet)}
          >
            All-in
          </button>
        </div>
      ) : null}
    </div>
  );
}
