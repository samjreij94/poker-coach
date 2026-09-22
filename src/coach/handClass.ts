import { evaluateHand } from '../poker/evaluator';
import type { Card, HandClass, Street } from '../poker/types';

function isSuited(hole: Card[]): boolean {
  return hole.length >= 2 && hole[0]!.suit === hole[1]!.suit;
}

function rankSet(cards: Card[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

function suitCounts(cards: Card[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c.suit, (m.get(c.suit) ?? 0) + 1);
  return m;
}

function flushDraw(hole: Card[], board: Card[]): 'none' | 'flush' | 'backdoor' {
  const all = [...hole, ...board];
  const sc = suitCounts(all);
  for (const [, n] of sc) {
    if (n >= 5) return 'flush'; // already flush — not a draw
    if (n === 4) return 'flush';
    if (n === 3 && board.length === 3) return 'backdoor';
  }
  return 'none';
}

function straightDrawInfo(hole: Card[], board: Card[]): { oesd: boolean; gutshot: boolean } {
  const ranks = [...new Set([...hole, ...board].map((c) => c.rank))].sort((a, b) => a - b);
  const expanded = ranks.includes(14) ? [...ranks, 1] : ranks;
  let oesd = false;
  let gutshot = false;
  for (let hi = 5; hi <= 14; hi++) {
    const need = [hi, hi - 1, hi - 2, hi - 3, hi - 4];
    const have = need.filter((r) => expanded.includes(r) || (r === 1 && expanded.includes(14)));
    const missing = 5 - have.length;
    if (missing === 1) {
      const missRank = need.find(
        (r) => !expanded.includes(r) && !(r === 1 && expanded.includes(14)),
      );
      if (missRank === hi || missRank === hi - 4) oesd = true;
      else gutshot = true;
    }
  }
  return { oesd, gutshot };
}

/** Preflop hand class heuristic from hole cards only (coarse; charts use handKey). */
export function classifyPreflop(hole: Card[]): HandClass {
  if (hole.length < 2) return 'air';
  const [a, b] = hole;
  const hi = Math.max(a!.rank, b!.rank);
  const lo = Math.min(a!.rank, b!.rank);
  const paired = a!.rank === b!.rank;
  const suited = isSuited(hole);
  const gap = hi - lo;

  if (paired && hi >= 13) return 'nuts'; // KK+
  if (paired && hi >= 10) return 'strongMade'; // TT-QQ
  if (paired && hi >= 7) return 'weakMade';
  if (hi === 14 && lo >= 12) return 'strongMade'; // AQ+
  if (hi === 14 && lo >= 10) return 'weakMade';
  if (suited && gap <= 1 && hi >= 10) return 'strongDraw';
  if (suited && gap <= 2 && hi >= 8) return 'weakDraw';
  if (!paired && hi >= 12 && lo >= 11) return 'weakMade';
  if (paired) return 'weakDraw';
  return 'air';
}

export function classifyHand(
  hole: Card[],
  board: Card[],
  street: Street,
): HandClass {
  if (street === 'preflop' || board.length < 3) {
    return classifyPreflop(hole);
  }

  const made = evaluateHand([...hole, ...board]);

  if (
    made.category === 'straightFlush' ||
    made.category === 'quads' ||
    made.category === 'fullHouse'
  ) {
    return 'nuts';
  }

  if (made.category === 'flush' || made.category === 'straight') {
    return 'nuts'; // near-nuts teaching bucket for aggression
  }

  if (made.category === 'trips') {
    // Set (pocket pair matching board) → nuts for stack-off / XR teaching
    const holePaired = hole[0]!.rank === hole[1]!.rank;
    if (holePaired) return 'nuts';
    return 'strongMade';
  }

  if (made.category === 'twoPair') {
    const holeRanks = new Set(hole.map((c) => c.rank));
    const boardRanks = rankSet(board);
    let holeInvolved = 0;
    for (const r of holeRanks) {
      if ((boardRanks.get(r) ?? 0) >= 1) holeInvolved++;
    }
    if (hole[0]!.rank === hole[1]!.rank) holeInvolved++;
    return holeInvolved >= 1 ? 'strongMade' : 'weakMade';
  }

  if (made.category === 'pair') {
    const pairRank = made.ranks[0]!;
    const topBoard = Math.max(...board.map((c) => c.rank));
    const holeHasPair = hole.some((c) => c.rank === pairRank);
    const isOverpair =
      hole[0]!.rank === hole[1]!.rank && hole[0]!.rank > topBoard;
    const isTopPair = holeHasPair && pairRank === topBoard;
    const kicker = hole.find((c) => c.rank !== pairRank)?.rank ?? pairRank;

    if (isOverpair) return 'strongMade';
    if (isTopPair && kicker >= 13) return 'strongMade'; // TPTK / TPGK
    if (isTopPair && kicker >= 11) return 'strongMade';
    if (isTopPair) return 'weakMade'; // weak top pair
    if (holeHasPair) return 'weakMade'; // second/bottom pair or underpair
    return 'air'; // board pair only
  }

  const fd = flushDraw(hole, board);
  const sd = straightDrawInfo(hole, board);
  const hasFlushDraw = fd === 'flush';
  const hasWeakDraw = sd.oesd || sd.gutshot || fd === 'backdoor' || hasFlushDraw;

  if (hasFlushDraw && sd.oesd) return 'strongDraw';
  if (hasFlushDraw || sd.oesd) return 'strongDraw';
  if (hasWeakDraw) return 'weakDraw';

  return 'air';
}

export function estimateOuts(hole: Card[], board: Card[]): number {
  if (board.length < 3 || board.length > 4) return 0;
  let outs = 0;
  const fd = flushDraw(hole, board);
  if (fd === 'flush') outs += 9;
  const sd = straightDrawInfo(hole, board);
  if (sd.oesd) outs += 8;
  else if (sd.gutshot) outs += 4;
  return Math.min(outs, 15);
}
