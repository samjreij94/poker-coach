import { rankLabel } from '../poker/cards';
import type { Card, Position, Rank } from '../poker/types';
import type { PreflopBucket } from './types';

/** Canonical hand key e.g. "AKs", "TT", "76s" */
export function handKey(hole: Card[]): string {
  if (hole.length < 2) return '';
  const a = hole[0]!;
  const b = hole[1]!;
  const hi = Math.max(a.rank, b.rank) as Rank;
  const lo = Math.min(a.rank, b.rank) as Rank;
  const rh = rankLabel(hi);
  const rl = rankLabel(lo);
  if (hi === lo) return `${rh}${rl}`;
  return `${rh}${rl}${a.suit === b.suit ? 's' : 'o'}`;
}

function setOf(...hands: string[]): Set<string> {
  return new Set(hands);
}

/** RFI open buckets by position (teaching charts from A1). */
export const OPEN_CHART: Record<Exclude<Position, 'BB'>, Set<string>> = {
  EP: setOf(
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'QJs', 'QTs', 'Q9s', 'JTs', 'J9s', 'T9s', 'T8s', '98s', '87s', '76s',
    'AKo', 'AQo', 'AJo', 'KQo',
  ),
  MP: setOf(
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'QJs', 'QTs', 'Q9s', 'JTs', 'J9s', 'T9s', 'T8s', '97s', '98s', '87s', '76s', '65s',
    'AKo', 'AQo', 'AJo', 'ATo', 'KQo', 'KJo', 'QJo',
  ),
  CO: setOf(
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'QJs', 'QTs', 'Q9s', 'Q8s', 'JTs', 'J9s', 'J8s',
    'T9s', 'T8s', '97s', '98s', '86s', '87s', '76s', '65s', '54s',
    'AKo', 'AQo', 'AJo', 'ATo', 'KQo', 'KJo', 'KTo', 'QJo', 'QTo', 'JTo',
  ),
  BTN: setOf(
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s',
    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s',
    'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'T9s', 'T8s', 'T7s', 'T6s',
    '98s', '97s', '96s', '87s', '86s', '85s', '76s', '75s', '65s', '64s', '54s', '43s',
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
    'KQo', 'KJo', 'KTo', 'K9o', 'QJo', 'QTo', 'Q9o', 'JTo', 'J9o', 'T9o',
  ),
  SB: setOf(
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'K3s', 'K2s',
    'QJs', 'QTs', 'Q9s', 'Q8s', 'Q7s', 'Q6s', 'Q5s', 'Q4s',
    'JTs', 'J9s', 'J8s', 'J7s', 'J6s', 'T9s', 'T8s', 'T7s', 'T6s',
    '98s', '97s', '96s', '95s', '87s', '86s', '85s', '84s', '76s', '75s', '74s', '65s', '64s', '63s', '54s', '53s', '43s', '32s',
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A6o', 'A5o', 'A4o', 'A3o', 'A2o',
    'KQo', 'KJo', 'KTo', 'K9o', 'K8o', 'QJo', 'QTo', 'Q9o', 'Q8o', 'JTo', 'J9o', 'J8o', 'T9o', 'T8o', '98o',
  ),
};

export const VALUE_3BET = setOf('AA', 'KK', 'QQ', 'AKs', 'AKo', 'JJ', 'AQs');
export const VALUE_3BET_WIDE = setOf(
  'AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AKo', 'AQs', 'AJs', 'KQs',
);
export const BLUFF_3BET = setOf(
  'A5s', 'A4s', 'A3s', 'A2s', '76s', '87s', '98s', 'T9s', 'K9s', 'QTs',
);

/** BTN flats vs CO/MP/EP open */
export const BTN_FLAT = setOf(
  '22', '33', '44', '55', '66', '77', '88', '99',
  'ATs', 'AJs', 'AQs', 'KJs', 'KQs', 'QJs', 'JTs', 'T9s', '98s',
);

/** BB defend vs late (BTN/CO/SB) — wide */
export const BB_DEFEND_LATE = setOf(
  'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
  'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
  'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'QJs', 'QTs', 'Q9s', 'Q8s', 'JTs', 'J9s', 'J8s',
  'T9s', 'T8s', '98s', '97s', '87s', '86s', '76s', '75s', '65s', '64s', '54s',
  'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'A5o',
  'KQo', 'KJo', 'KTo', 'QJo', 'QTo', 'JTo', 'T9o', '98o', '87o', '76o',
);

/** BB defend vs EP/MP — tighter */
export const BB_DEFEND_EARLY = setOf(
  'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
  'AKs', 'AQs', 'AJs', 'ATs', 'A5s', 'A4s', 'KQs', 'KJs', 'KTs', 'QJs', 'JTs', 'T9s', '98s', '87s', '76s',
  'AKo', 'AQo', 'AJo',
);

export const FACE_3BET_4BET = setOf('AA', 'KK', 'QQ', 'AKs', 'AKo');
export const FACE_3BET_CALL_IP = setOf('JJ', 'TT', '99', 'AQs', 'AJs', 'KQs', 'JTs', 'T9s', '98s', '87s', '76s');

export function isInOpenChart(pos: Position, key: string): boolean {
  if (pos === 'BB') return false;
  return OPEN_CHART[pos].has(key);
}

export function openSizeBb(pos: Position): { min: number; max: number; label: string } {
  if (pos === 'SB') return { min: 3, max: 3.5, label: '~3–3.5× BB' };
  if (pos === 'BTN') return { min: 2.3, max: 2.7, label: '~2.5× BB' };
  return { min: 2.2, max: 2.5, label: '~2.5× BB' };
}

export function threeBetSizeBb(inPosition: boolean): { min: number; max: number; label: string } {
  if (inPosition) return { min: 2.8, max: 3.5, label: '~3× open' };
  return { min: 3.5, max: 4.5, label: '~4× open' };
}

/**
 * Coarse facing classification from table numbers.
 * open ≈ ≤4× BB current bet; 3bet+ above that.
 */
export function classifyPreflopFacing(
  toCall: number,
  currentBet: number,
  bigBlind: number,
): 'none' | 'open' | 'threeBet' {
  if (toCall <= 0) return 'none';
  if (currentBet <= bigBlind * 4) return 'open';
  return 'threeBet';
}

export function preflopContinueBucket(
  pos: Position,
  key: string,
  facing: 'none' | 'open' | 'threeBet',
  inPosition: boolean,
  openerIsLate = true,
): PreflopBucket {
  if (facing === 'none') {
    if (pos === 'BB') return 'fold'; // shouldn't RFI
    return isInOpenChart(pos, key) ? 'open' : 'fold';
  }

  if (facing === 'threeBet') {
    if (FACE_3BET_4BET.has(key)) return 'fourBet';
    if (inPosition && FACE_3BET_CALL_IP.has(key)) return 'call';
    return 'fold';
  }

  // facing open
  if (VALUE_3BET.has(key) || (inPosition && VALUE_3BET_WIDE.has(key))) {
    return 'threeBet';
  }
  if (inPosition && BLUFF_3BET.has(key) && (pos === 'BTN' || pos === 'CO')) {
    return 'threeBet';
  }
  if (pos === 'BB') {
    const defend = openerIsLate ? BB_DEFEND_LATE : BB_DEFEND_EARLY;
    if (defend.has(key)) {
      // Prefer 3bet premiums already handled; rest call
      if (VALUE_3BET_WIDE.has(key)) return 'threeBet';
      return 'call';
    }
    return 'fold';
  }
  if (pos === 'BTN' && BTN_FLAT.has(key)) return 'call';
  if (pos === 'SB') {
    // mostly 3bet or fold; suited Ax bluffs already in BLUFF
    if (BLUFF_3BET.has(key) || VALUE_3BET_WIDE.has(key)) return 'threeBet';
    return 'fold';
  }
  // EP/MP/CO vs earlier: 3bet or fold (little flat)
  if (VALUE_3BET_WIDE.has(key) || BLUFF_3BET.has(key)) return 'threeBet';
  return 'fold';
}
