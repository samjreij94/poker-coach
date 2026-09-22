import type { Card } from '../poker/types';
import type { BoardTag, SprBand } from './types';

export function sprBandFromValue(spr: number): SprBand {
  if (!Number.isFinite(spr) || spr <= 3) return 'low';
  if (spr < 8) return 'mid';
  return 'high';
}

/**
 * Tag flop/turn/river board texture for c-bet / continue heuristics.
 * Multiple tags may apply (e.g. dry + broadwayHeavy).
 */
export function tagBoard(board: Card[]): BoardTag[] {
  if (board.length < 3) return [];

  const tags: BoardTag[] = [];
  const suits = board.map((c) => c.suit);
  const ranks = board.map((c) => c.rank);
  const uniqueSuits = new Set(suits);
  const uniqueRanks = new Set(ranks);

  if (uniqueRanks.size < ranks.length) tags.push('paired');
  if (uniqueSuits.size === 1) tags.push('monotone');

  if (ranks.some((r) => r === 14)) tags.push('aceHigh');

  const broadway = ranks.filter((r) => r >= 10).length;
  if (broadway >= 2) tags.push('broadwayHeavy');

  // Connectivity + suit for wetness (flop-focused; still useful on later streets)
  const sorted = [...ranks].sort((a, b) => a - b);
  let connectedGaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap > 0 && gap <= 2) connectedGaps++;
  }
  const twoTone = uniqueSuits.size === 2;
  const rainbow = uniqueSuits.size >= 3;
  const disconnected = connectedGaps === 0 && !tags.includes('paired');

  if (tags.includes('monotone')) {
    // monotone is its own bucket; also wet-ish for draws
    tags.push('wet');
  } else if (connectedGaps >= 2 || (connectedGaps >= 1 && twoTone)) {
    tags.push('wet');
  } else if (twoTone || connectedGaps === 1) {
    tags.push('semiWet');
  } else if (rainbow && disconnected) {
    tags.push('dry');
  } else if (tags.includes('paired') && rainbow) {
    tags.push('dry');
  } else {
    tags.push('semiWet');
  }

  return tags;
}

export function hasTag(tags: BoardTag[], tag: BoardTag): boolean {
  return tags.includes(tag);
}

export function isDryish(tags: BoardTag[]): boolean {
  return hasTag(tags, 'dry') || (hasTag(tags, 'paired') && !hasTag(tags, 'wet'));
}

export function isWetish(tags: BoardTag[]): boolean {
  return hasTag(tags, 'wet') || hasTag(tags, 'monotone');
}
