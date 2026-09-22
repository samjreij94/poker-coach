import { formatChips } from './formatChips';
import './Pot.css';

interface PotProps {
  amount: number;
  street?: string;
}

export function Pot({ amount, street }: PotProps) {
  return (
    <div className="pc-pot" role="status" aria-label={`Pot ${formatChips(amount)}`}>
      <span className="pc-pot__label">Pot</span>
      <span className="pc-pot__amount">{formatChips(amount)}</span>
      {street ? <span className="pc-pot__street">{street}</span> : null}
    </div>
  );
}
