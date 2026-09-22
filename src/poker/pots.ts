import type { PlayerState, Pot } from './types';

/**
 * Build main + side pots from totalInvested amounts.
 * Players who folded are not eligible for pots they didn't contribute to,
 * but their chips stay in pots they helped build.
 */
export function buildPots(players: PlayerState[]): Pot[] {
  const contributors = players
    .filter((p) => p.totalInvested > 0)
    .map((p) => ({ id: p.id, invested: p.totalInvested, folded: p.folded }));

  if (contributors.length === 0) return [];

  const levels = [...new Set(contributors.map((c) => c.invested))].sort(
    (a, b) => a - b,
  );

  const pots: Pot[] = [];
  let prev = 0;

  for (const level of levels) {
    const layer = level - prev;
    if (layer <= 0) continue;
    const inLayer = contributors.filter((c) => c.invested >= level);
    const amount = layer * inLayer.length;
    const eligible = inLayer.filter((c) => !c.folded).map((c) => c.id);
    // If everyone in layer folded except chips already taken, still keep pot
    // with any non-folded who reached this level; if none, award to last aggressor later.
    pots.push({
      amount,
      eligible: eligible.length > 0 ? eligible : inLayer.map((c) => c.id),
    });
    prev = level;
  }

  // Merge consecutive pots with identical eligible sets
  const merged: Pot[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.eligible.length === pot.eligible.length &&
      last.eligible.every((id, i) => id === pot.eligible[i])
    ) {
      last.amount += pot.amount;
    } else {
      merged.push({ ...pot, eligible: [...pot.eligible] });
    }
  }
  return merged;
}

export function totalPot(pots: Pot[]): number {
  return pots.reduce((s, p) => s + p.amount, 0);
}
