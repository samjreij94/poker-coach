import { rankLabel, suitColor, suitSymbol } from '../../poker/cards';
import type { Card } from '../../poker/types';
import './CardView.css';

export type CardSize = 'sm' | 'md' | 'lg';

interface CardViewProps {
  card?: Card | null;
  /** Face-down back when true or when card is null/undefined and faceDown */
  faceDown?: boolean;
  size?: CardSize;
  className?: string;
}

export function CardView({
  card,
  faceDown = false,
  size = 'md',
  className = '',
}: CardViewProps) {
  const showBack = faceDown || !card;

  if (showBack) {
    return (
      <div
        className={`pc-card pc-card--back pc-card--${size} ${className}`.trim()}
        aria-label="Face-down card"
      >
        <div className="pc-card__back-pattern" />
      </div>
    );
  }

  const color = suitColor(card.suit) === 'red' ? 'red' : 'black';
  const label = `${rankLabel(card.rank)}${suitSymbol(card.suit)}`;

  return (
    <div
      className={`pc-card pc-card--face pc-card--${color} pc-card--${size} ${className}`.trim()}
      aria-label={label}
    >
      <span className="pc-card__rank">{rankLabel(card.rank)}</span>
      <span className="pc-card__suit">{suitSymbol(card.suit)}</span>
    </div>
  );
}
