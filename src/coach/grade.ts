import { COACH_STRINGS, whyFor } from './strings';
import type { ReasonCode, SizeRangeSpec } from './types';
import type { ActionType, CoachAdvice, CoachGrade, Grade } from '../poker/types';
import type { CoachAdviceInternal } from './recommend';

function normalize(t: ActionType): 'fold' | 'passive' | 'aggressive' {
  if (t === 'fold') return 'fold';
  if (t === 'check' || t === 'call') return 'passive';
  return 'aggressive';
}

function asInternal(advice: CoachAdvice): CoachAdviceInternal {
  return advice as CoachAdviceInternal;
}

function actionsCompatible(user: ActionType, recommended: ActionType): boolean {
  if (user === recommended) return true;
  if (
    user === 'allin' &&
    (recommended === 'raise' || recommended === 'bet' || recommended === 'call')
  ) {
    return true;
  }
  // bet vs raise both aggressive continues
  if (
    (user === 'bet' && recommended === 'raise') ||
    (user === 'raise' && recommended === 'bet')
  ) {
    return true;
  }
  return false;
}

function sizeFit(
  putInAmount: number | undefined,
  advice: CoachAdviceInternal,
): 'in' | 'near' | 'far' | 'n/a' {
  if (putInAmount === undefined) return 'n/a';
  const spec = advice.sizeSpec;
  const range = advice.sizeRange;
  if (!range && !spec) return 'n/a';

  // Prefer chip sizeRange for Graphics putIn amounts
  if (range) {
    if (putInAmount >= range.min && putInAmount <= range.max) return 'in';
    const span = Math.max(range.max - range.min, 1);
    if (putInAmount >= range.min - span * 0.5 && putInAmount <= range.max + span * 0.5) {
      return 'near';
    }
    // Also allow ±20% of midpoint (A1 postflop tolerance as chips)
    const mid = (range.min + range.max) / 2;
    if (putInAmount >= mid * 0.7 && putInAmount <= mid * 1.35) return 'near';
    return 'far';
  }
  return 'n/a';
}

function potFracFromPutIn(putIn: number, pot: number | undefined): number | undefined {
  if (!pot || pot <= 0) return undefined;
  return putIn / pot;
}

/**
 * Grade hero's action against coach recommendation.
 * Signature stable for Graphics: gradeAction(advice, taken, putInAmount?).
 */
export function gradeAction(
  advice: CoachAdvice,
  taken: ActionType,
  putInAmount?: number,
): CoachGrade {
  const adv = asInternal(advice);
  const code = (adv.reasonCode ?? 'GEN_GOOD_DEFAULT') as ReasonCode;
  const street = adv.street;
  const boardTags = adv.boardTags ?? [];

  // Hard leak: limp RFI (call when facing none / recommended raise open)
  if (
    street === 'preflop' &&
    advice.recommended === 'raise' &&
    taken === 'call' &&
    (advice.concepts.includes('rfi') || code === 'PF_OPEN_GOOD')
  ) {
    return {
      grade: 'Leak',
      why: COACH_STRINGS.PF_LIMP_RFI,
      advice: {
        ...advice,
        recommended: 'raise',
        reason: COACH_STRINGS.PF_LIMP_RFI,
        reasonCode: 'PF_LIMP_RFI',
      },
    };
  }

  // Opening too loose: recommended fold, user raises
  if (
    street === 'preflop' &&
    advice.recommended === 'fold' &&
    (taken === 'raise' || taken === 'bet' || taken === 'allin') &&
    advice.concepts.includes('rfi')
  ) {
    return {
      grade: 'Leak',
      why: COACH_STRINGS.PF_OPEN_TOO_LOOSE,
      advice,
    };
  }

  // Folded a standard open
  if (
    street === 'preflop' &&
    advice.recommended === 'raise' &&
    taken === 'fold' &&
    (code === 'PF_OPEN_GOOD' || advice.concepts.includes('rfi'))
  ) {
    return {
      grade: 'Leak',
      why: COACH_STRINGS.PF_FOLD_OPEN_LEAK,
      advice,
    };
  }

  // River miss value: check when recommended bet with nuts/strongMade
  if (
    street === 'river' &&
    (advice.handClass === 'nuts' || advice.handClass === 'strongMade') &&
    (advice.recommended === 'bet' || advice.recommended === 'raise') &&
    taken === 'check'
  ) {
    return {
      grade: 'Leak',
      why: COACH_STRINGS.RV_MISS_VALUE_LEAK,
      advice,
    };
  }

  // Air overbet on dry: bet way above size band
  if (
    (taken === 'bet' || taken === 'raise' || taken === 'allin') &&
    advice.handClass === 'air' &&
    putInAmount !== undefined &&
    advice.sizeRange
  ) {
    const mid = (advice.sizeRange.min + advice.sizeRange.max) / 2;
    if (putInAmount > mid * 2.2 || putInAmount > advice.sizeRange.max * 2) {
      return {
        grade: 'Leak',
        why: COACH_STRINGS.FL_CBET_AIR_OVERBET_LEAK,
        advice,
      };
    }
  }
  // Air overbet when recommended check (still Leak-ish)
  if (
    advice.handClass === 'air' &&
    advice.recommended === 'check' &&
    (taken === 'bet' || taken === 'raise') &&
    putInAmount !== undefined &&
    adv.spr !== undefined &&
    adv.spr > 5
  ) {
    // Infer pot from concepts? Use sizeSpec pot if we overbet vs typical pot
    const potGuess = advice.sizeRange
      ? (advice.sizeRange.min + advice.sizeRange.max) / 0.66
      : undefined;
    const frac = potFracFromPutIn(putInAmount, potGuess);
    if (frac !== undefined && frac >= 0.9) {
      return {
        grade: 'Leak',
        why: COACH_STRINGS.FL_CBET_AIR_OVERBET_LEAK,
        advice,
      };
    }
  }

  // High SPR light call when recommended fold
  if (
    advice.recommended === 'fold' &&
    (taken === 'call' || taken === 'allin') &&
    (code === 'SPR_HIGH_LIGHT_CALL_LEAK' || adv.sprBand === 'high') &&
    advice.handClass === 'weakMade'
  ) {
    return {
      grade: 'Leak',
      why: COACH_STRINGS.SPR_HIGH_LIGHT_CALL_LEAK,
      advice,
    };
  }

  // Calling without odds when recommended fold
  if (
    advice.recommended === 'fold' &&
    taken === 'call' &&
    (code === 'FL_CALL_NO_ODDS_LEAK' || code === 'TN_CALL_MISSED_LEAK')
  ) {
    return {
      grade: 'Leak',
      why: COACH_STRINGS[code],
      advice,
    };
  }

  const match = actionsCompatible(taken, advice.recommended);
  const sizing = sizeFit(putInAmount, adv);

  // Same family via normalize for check/call near-misses
  const recN = normalize(advice.recommended);
  const tookN = normalize(taken);

  let grade: Grade;
  let whyCode: ReasonCode = code;

  if (match && (sizing === 'in' || sizing === 'n/a')) {
    grade = 'Good';
    whyCode = code.endsWith('_GOOD') || code === 'GEN_GOOD_DEFAULT' ? code : 'GEN_GOOD_DEFAULT';
    // Prefer advice reason when Good match
    return { grade, why: advice.reason || whyFor(whyCode), advice };
  }

  if (match && sizing === 'near') {
    return { grade: 'OK', why: COACH_STRINGS.GEN_SIZE_OFF_OK, advice };
  }

  if (match && sizing === 'far') {
    // Wild size with air already handled; nuts min-bet → OK/Leak
    if (advice.handClass === 'air') {
      return { grade: 'Leak', why: COACH_STRINGS.FL_CBET_AIR_OVERBET_LEAK, advice };
    }
    return { grade: 'OK', why: COACH_STRINGS.GEN_SIZE_OFF_OK, advice };
  }

  // Alternates
  if (
    advice.recommended === 'bet' &&
    taken === 'check' &&
    advice.handClass === 'air' &&
    boardTags.includes('dry')
  ) {
    return { grade: 'OK', why: COACH_STRINGS.GEN_ALT_LINE_OK, advice };
  }

  if (
    advice.recommended === 'check' &&
    taken === 'bet' &&
    boardTags.includes('monotone')
  ) {
    // A1 ex.13: oversized/auto c-bet on monotone with strongMade → OK (prefer check)
    if (advice.handClass === 'strongMade' || advice.handClass === 'nuts') {
      return { grade: 'OK', why: COACH_STRINGS.FL_CBET_MONO_LEAK, advice };
    }
    return { grade: 'Leak', why: COACH_STRINGS.FL_CBET_MONO_LEAK, advice };
  }

  // A1 ex.5: SB flats when 3-bet preferred → OK with SB-flat copy
  if (
    street === 'preflop' &&
    advice.position === 'SB' &&
    advice.recommended === 'raise' &&
    taken === 'call' &&
    (code === 'PF_3BET_BLUFF_GOOD' ||
      code === 'PF_3BET_VALUE_GOOD' ||
      advice.concepts.includes('3bet'))
  ) {
    return { grade: 'OK', why: COACH_STRINGS.PF_FLAT_SB_OK, advice };
  }

  // A1 ex.17: calling a strong draw when XR is primary → still Good (odds continue)
  if (
    !match &&
    advice.recommended === 'raise' &&
    taken === 'call' &&
    advice.handClass === 'strongDraw'
  ) {
    return { grade: 'Good', why: COACH_STRINGS.FL_CALL_ODDS_GOOD, advice };
  }

  if (!match && advice.recommended === 'fold' && (taken === 'call' || taken === 'raise' || taken === 'bet' || taken === 'allin')) {
    let why = COACH_STRINGS.GEN_LEAK_DEFAULT;
    if (code === 'FL_CALL_NO_ODDS_LEAK' || code === 'SPR_HIGH_LIGHT_CALL_LEAK' || code === 'TN_CALL_MISSED_LEAK') {
      why = COACH_STRINGS[code];
    } else if (street === 'turn' && (advice.handClass === 'air' || advice.handClass === 'weakDraw')) {
      why = COACH_STRINGS.TN_CALL_MISSED_LEAK;
    } else if (code === 'PF_FACE_3BET_FOLD_GOOD' || code === 'PF_FLAT_TOO_WIDE') {
      why =
        code === 'PF_FACE_3BET_FOLD_GOOD'
          ? COACH_STRINGS.PF_FACE_3BET_CALL_LEAK
          : COACH_STRINGS.PF_FLAT_TOO_WIDE;
    }
    return {
      grade: 'Leak',
      why,
      advice,
    };
  }

  if (!match && (advice.recommended === 'bet' || advice.recommended === 'raise') && taken === 'fold') {
    return {
      grade:
        advice.handClass === 'nuts' || advice.handClass === 'strongMade' ? 'Leak' : 'OK',
      why:
        advice.handClass === 'nuts' || advice.handClass === 'strongMade'
          ? COACH_STRINGS.FL_FOLD_VALUE_LEAK
          : COACH_STRINGS.GEN_ALT_LINE_OK,
      advice,
    };
  }

  if (!match && recN === 'passive' && tookN === 'aggressive') {
    if (advice.handClass === 'air') {
      return { grade: 'OK', why: COACH_STRINGS.GEN_ALT_LINE_OK, advice };
    }
    return { grade: 'OK', why: COACH_STRINGS.GEN_ALT_LINE_OK, advice };
  }

  if (!match && recN === 'aggressive' && tookN === 'passive') {
    if (advice.handClass === 'nuts' || advice.handClass === 'strongMade') {
      if (street === 'river') {
        return { grade: 'Leak', why: COACH_STRINGS.RV_MISS_VALUE_LEAK, advice };
      }
      return { grade: 'OK', why: COACH_STRINGS.GEN_ALT_LINE_OK, advice };
    }
    return { grade: 'OK', why: COACH_STRINGS.GEN_ALT_LINE_OK, advice };
  }

  return {
    grade: 'Leak',
    why: COACH_STRINGS.GEN_LEAK_DEFAULT,
    advice,
  };
}

/** Expose size-spec helper for tests */
export function sizeSpecOf(advice: CoachAdvice): SizeRangeSpec | undefined {
  return asInternal(advice).sizeSpec;
}
