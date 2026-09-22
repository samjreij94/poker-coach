/** Coach-domain types for educational heuristics (A1). */

export type FrequencyBand = 'always' | 'often' | 'sometimes' | 'rarely' | 'never';
export type SprBand = 'low' | 'mid' | 'high';
export type BoardTag =
  | 'dry'
  | 'semiWet'
  | 'wet'
  | 'paired'
  | 'monotone'
  | 'aceHigh'
  | 'broadwayHeavy';

export type PreflopBucket = 'open' | 'threeBet' | 'call' | 'fold' | 'fourBet';

/** Stable ids → A2-coach-strings.md / strings.ts */
export type ReasonCode =
  | 'PF_OPEN_GOOD'
  | 'PF_OPEN_SIZE_OK'
  | 'PF_OPEN_TOO_LOOSE'
  | 'PF_LIMP_RFI'
  | 'PF_FOLD_OPEN_GOOD'
  | 'PF_FOLD_OPEN_LEAK'
  | 'PF_3BET_VALUE_GOOD'
  | 'PF_3BET_BLUFF_GOOD'
  | 'PF_3BET_SIZE_OK'
  | 'PF_3BET_TOO_WIDE'
  | 'PF_FLAT_BB_GOOD'
  | 'PF_FLAT_SB_OK'
  | 'PF_FLAT_TOO_WIDE'
  | 'PF_3BET_OR_FOLD'
  | 'PF_FACE_3BET_4BET_GOOD'
  | 'PF_FACE_3BET_CALL_IP_GOOD'
  | 'PF_FACE_3BET_CALL_LEAK'
  | 'PF_FACE_3BET_FOLD_GOOD'
  | 'FL_CBET_DRY_GOOD'
  | 'FL_CBET_WET_OK'
  | 'FL_CBET_MONO_LEAK'
  | 'FL_CBET_AIR_OVERBET_LEAK'
  | 'FL_CHECK_WEAK_MADE_GOOD'
  | 'FL_CHECK_NUTS_LEAK'
  | 'FL_CBET_DRAW_GOOD'
  | 'FL_XR_SET_GOOD'
  | 'FL_XR_DRAW_GOOD'
  | 'FL_XR_AIR_LEAK'
  | 'FL_CALL_ODDS_GOOD'
  | 'FL_CALL_NO_ODDS_LEAK'
  | 'FL_CALL_WEAK_VS_LARGE_LEAK'
  | 'FL_FOLD_AIR_GOOD'
  | 'FL_FOLD_VALUE_LEAK'
  | 'SPR_LOW_STACKOFF_GOOD'
  | 'SPR_HIGH_LIGHT_CALL_LEAK'
  | 'SPR_MID_SET_GOOD'
  | 'SPR_SUNK_COST_LEAK'
  | 'TN_BARREL_VALUE_GOOD'
  | 'TN_BARREL_AIR_LEAK'
  | 'TN_CALL_MISSED_LEAK'
  | 'TN_POT_ODDS_CALL_GOOD'
  | 'TN_SCARE_CHECK_OK'
  | 'RV_VALUE_BET_GOOD'
  | 'RV_MISS_VALUE_LEAK'
  | 'RV_BLUFF_THIN_OK'
  | 'RV_BLUFF_NO_STORY_LEAK'
  | 'RV_BLUFF_CATCH_OK'
  | 'RV_FOLD_BEATEN_GOOD'
  | 'MW_TIGHTEN_GOOD'
  | 'MW_BLUFF_LEAK'
  | 'GEN_SIZE_OFF_OK'
  | 'GEN_ALT_LINE_OK'
  | 'GEN_GOOD_DEFAULT'
  | 'GEN_LEAK_DEFAULT';

export type FacingKind = 'none' | 'bet' | 'raise' | 'check';

export interface SizeRangeSpec {
  min: number;
  max: number;
  /** 'bb' = multiple of BB; 'pot' = fraction of pot */
  unit: 'bb' | 'pot';
  label: string;
}
