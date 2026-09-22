import type { Card, HandCategory, HandRank } from './types';

const CAT_BASE: Record<HandCategory, number> = {
  highCard: 0,
  pair: 1e8,
  twoPair: 2e8,
  trips: 3e8,
  straight: 4e8,
  flush: 5e8,
  fullHouse: 6e8,
  quads: 7e8,
  straightFlush: 8e8,
};

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first!, ...c]);
  const without = combinations(rest, k);
  return [...withFirst, ...without];
}

function straightHigh(ranks: number[]): number | null {
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  // wheel A-5
  if (uniq.includes(14)) uniq.push(1);
  for (let i = 0; i <= uniq.length - 5; i++) {
    let ok = true;
    for (let j = 1; j < 5; j++) {
      if (uniq[i]! - j !== uniq[i + j]) {
        ok = false;
        break;
      }
    }
    if (ok) return uniq[i] === 14 && uniq[i + 4] === 1 ? 5 : uniq[i]!;
  }
  return null;
}

function scoreFive(cards: Card[]): HandRank {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  const sHigh = straightHigh(ranks);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (isFlush && sHigh !== null) {
    return {
      category: 'straightFlush',
      rankValue: CAT_BASE.straightFlush + sHigh,
      ranks: [sHigh],
      description: sHigh === 14 ? 'Royal flush' : `Straight flush, ${sHigh} high`,
    };
  }

  if (byCount[0]![1] === 4) {
    const quad = byCount[0]![0];
    const kicker = byCount[1]![0];
    return {
      category: 'quads',
      rankValue: CAT_BASE.quads + quad * 15 + kicker,
      ranks: [quad, kicker],
      description: `Four of a kind, ${quad}s`,
    };
  }

  if (byCount[0]![1] === 3 && byCount[1]![1] === 2) {
    const trip = byCount[0]![0];
    const pair = byCount[1]![0];
    return {
      category: 'fullHouse',
      rankValue: CAT_BASE.fullHouse + trip * 15 + pair,
      ranks: [trip, pair],
      description: `Full house, ${trip}s full of ${pair}s`,
    };
  }

  if (isFlush) {
    let v = CAT_BASE.flush;
    ranks.forEach((r, i) => {
      v += r * Math.pow(15, 4 - i);
    });
    return {
      category: 'flush',
      rankValue: v,
      ranks,
      description: `Flush, ${ranks[0]} high`,
    };
  }

  if (sHigh !== null) {
    return {
      category: 'straight',
      rankValue: CAT_BASE.straight + sHigh,
      ranks: [sHigh],
      description: `Straight, ${sHigh} high`,
    };
  }

  if (byCount[0]![1] === 3) {
    const trip = byCount[0]![0];
    const kickers = byCount.slice(1).map((x) => x[0]);
    let v = CAT_BASE.trips + trip * 15 * 15;
    kickers.forEach((k, i) => {
      v += k * Math.pow(15, 1 - i);
    });
    return {
      category: 'trips',
      rankValue: v,
      ranks: [trip, ...kickers],
      description: `Three of a kind, ${trip}s`,
    };
  }

  if (byCount[0]![1] === 2 && byCount[1]![1] === 2) {
    const hi = Math.max(byCount[0]![0], byCount[1]![0]);
    const lo = Math.min(byCount[0]![0], byCount[1]![0]);
    const kicker = byCount[2]![0];
    return {
      category: 'twoPair',
      rankValue: CAT_BASE.twoPair + hi * 15 * 15 + lo * 15 + kicker,
      ranks: [hi, lo, kicker],
      description: `Two pair, ${hi}s and ${lo}s`,
    };
  }

  if (byCount[0]![1] === 2) {
    const pair = byCount[0]![0];
    const kickers = byCount.slice(1).map((x) => x[0]);
    let v = CAT_BASE.pair + pair * 15 * 15 * 15;
    kickers.forEach((k, i) => {
      v += k * Math.pow(15, 2 - i);
    });
    return {
      category: 'pair',
      rankValue: v,
      ranks: [pair, ...kickers],
      description: `Pair of ${pair}s`,
    };
  }

  let v = CAT_BASE.highCard;
  ranks.forEach((r, i) => {
    v += r * Math.pow(15, 4 - i);
  });
  return {
    category: 'highCard',
    rankValue: v,
    ranks,
    description: `High card ${ranks[0]}`,
  };
}

/** Best 5-card hand from 5–7 cards */
export function evaluateHand(cards: Card[]): HandRank {
  if (cards.length < 5) {
    throw new Error('Need at least 5 cards');
  }
  if (cards.length === 5) return scoreFive(cards);
  const combos = combinations(cards, 5);
  let best = scoreFive(combos[0]!);
  for (let i = 1; i < combos.length; i++) {
    const s = scoreFive(combos[i]!);
    if (s.rankValue > best.rankValue) best = s;
  }
  return best;
}

export function compareHands(a: Card[], b: Card[]): number {
  return evaluateHand(a).rankValue - evaluateHand(b).rankValue;
}
