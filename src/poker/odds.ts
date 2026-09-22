/** Pot odds as a fraction (amountToCall / (pot + amountToCall)) */
export function potOdds(pot: number, toCall: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}

/** Required equity to break even on a call */
export function requiredEquity(pot: number, toCall: number): number {
  return potOdds(pot, toCall);
}

/** Stack-to-pot ratio */
export function spr(effectiveStack: number, pot: number): number {
  if (pot <= 0) return Infinity;
  return effectiveStack / pot;
}

export function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * Rough outs-to-equity approximation for one card (turn→river) or two cards (flop→river).
 * Rule of thumb: outs * 2% per street, outs * 4% flop to river.
 */
export function outsToEquity(outs: number, cardsToCome: 1 | 2): number {
  if (cardsToCome === 1) return Math.min(0.95, outs * 0.021);
  return Math.min(0.95, outs * 0.04);
}
