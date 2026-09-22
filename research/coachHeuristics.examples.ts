/**
 * RESEARCH ARTIFACT — seed shapes for Dealer ticket B4 / src/coach/
 * Not wired into the app. Aligns with src/poker/types.ts + odds.ts.
 *
 * Run mentally / copy into src/coach/ when implementing.
 */

import type {
  ActionType,
  CoachAdvice,
  CoachGrade,
  Grade,
  HandClass,
  Position,
} from '../src/poker/types';

// ---------------------------------------------------------------------------
// Extended coach-domain types (propose for src/coach/types.ts)
// ---------------------------------------------------------------------------

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

/** Stable ids → A2-coach-strings.md */
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

export interface SizeRange {
  min: number;
  max: number;
  /** 'bb' preflop multiple of BB; 'pot' fraction of pot postflop */
  unit: 'bb' | 'pot';
  label: string;
}

export interface CoachDecisionContext {
  street: 'preflop' | 'flop' | 'turn' | 'river';
  position: Position;
  heroIsPfr: boolean;
  inPosition: boolean;
  facing: 'none' | 'bet' | 'raise' | 'check';
  /** Facing bet as fraction of pot, if any */
  betSizePotFrac?: number;
  pot: number;
  toCall: number;
  effectiveStack: number;
  spr: number;
  sprBand: SprBand;
  boardTags: BoardTag[];
  handClass: HandClass;
  /** Canonical hand key e.g. "AKs", "TT", "76s" */
  handKey?: string;
  outs?: number;
  potOdds?: number;
  estEquity?: number;
  numPlayersInPot: number;
  /** True if user open-limped when facing none */
  limped?: boolean;
}

export interface CoachRuleWhen {
  street?: CoachDecisionContext['street'] | CoachDecisionContext['street'][];
  positions?: Position[];
  heroIsPfr?: boolean;
  inPosition?: boolean;
  facing?: CoachDecisionContext['facing'] | CoachDecisionContext['facing'][];
  handClasses?: HandClass[];
  boardTagsAny?: BoardTag[];
  boardTagsAll?: BoardTag[];
  sprBands?: SprBand[];
  /** handKey must be in this list */
  handKeysIn?: string[];
  /** handKey must NOT be in open chart etc. — engine supplies */
  preflopBucket?: PreflopBucket;
  minPlayers?: number;
  maxPlayers?: number;
  /** call if estEquity + buffer >= potOdds */
  oddsOk?: boolean;
}

export interface CoachRule {
  id: string;
  priority: number; // lower = match first
  when: CoachRuleWhen;
  frequency: FrequencyBand;
  advice: Omit<CoachAdvice, 'position' | 'handClass' | 'potOdds' | 'spr'> & {
    reasonCode: ReasonCode;
    sizeRange?: SizeRange;
  };
}

export interface UserActionForGrade {
  type: ActionType;
  /** Chips: bet/raise size as put-in this street, or call amount */
  amount?: number;
  /** Derived: amount/pot for bets, or raise multiple of BB preflop */
  sizeBb?: number;
  sizePotFrac?: number;
}

// ---------------------------------------------------------------------------
// A2 string table (subset mirrored; full list in A2-coach-strings.md)
// ---------------------------------------------------------------------------

export const COACH_STRINGS: Record<ReasonCode, string> = {
  PF_OPEN_GOOD:
    'Position-appropriate open — raising builds the pot and avoids limping traps.',
  PF_OPEN_SIZE_OK:
    'Right hand to open, but size is off; aim about 2.2–2.5× (3–3.5× from the SB).',
  PF_OPEN_TOO_LOOSE:
    'This hand is too weak for this seat — fold and wait for better spots.',
  PF_LIMP_RFI:
    "Don't limp first-in — raise your playable hands or fold them.",
  PF_FOLD_OPEN_GOOD:
    "Easy fold — this hand doesn't make the open chart from this position.",
  PF_FOLD_OPEN_LEAK:
    'You folded a standard open — this hand plays fine as a raise here.',
  PF_3BET_VALUE_GOOD:
    'Strong value 3-bet — grow the pot with a hand that thrives for stacks.',
  PF_3BET_BLUFF_GOOD:
    'Good semi-bluff 3-bet — suited playability plus fold equity.',
  PF_3BET_SIZE_OK:
    '3-bet is fine; size ~3× in position or ~4× out of position.',
  PF_3BET_TOO_WIDE:
    'This is too weak to 3-bet — fold or only continue with a clearer plan.',
  PF_FLAT_BB_GOOD:
    'Solid big-blind defend — you get a price and a playable hand.',
  PF_FLAT_SB_OK:
    'Flatting the SB is playable, but 3-betting is usually cleaner out of position.',
  PF_FLAT_TOO_WIDE:
    "Calling here is too loose — you're dominated or crushed by the opener's range.",
  PF_3BET_OR_FOLD:
    'From this seat, prefer 3-bet or fold — flatting invites squeezes and tough OOP pots.',
  PF_FACE_3BET_4BET_GOOD:
    'Premium vs a 3-bet — 4-betting for value is the standard continue.',
  PF_FACE_3BET_CALL_IP_GOOD:
    'In position, this mid-strength hand can call and playable boards.',
  PF_FACE_3BET_CALL_LEAK:
    'Calling a 3-bet with this hand is a common leak — fold or only 4-bet premiums.',
  PF_FACE_3BET_FOLD_GOOD:
    "Disciplined fold — you don't need to defend every open against a 3-bet.",
  FL_CBET_DRY_GOOD:
    'Dry board favors a frequent small c-bet as the preflop raiser.',
  FL_CBET_WET_OK:
    'On wet boards, mix more checks; a polar larger bet can still work.',
  FL_CBET_MONO_LEAK:
    'Monotone flops are dangerous to auto-c-bet — check more, especially with one pair.',
  FL_CBET_AIR_OVERBET_LEAK:
    'Huge bluffs with air need a story — prefer a small stab or a check.',
  FL_CHECK_WEAK_MADE_GOOD:
    'Checking weak made hands controls the pot and avoids tough raises.',
  FL_CHECK_NUTS_LEAK:
    'You have a strong hand — betting for value is better than giving a free card.',
  FL_CBET_DRAW_GOOD:
    'Semi-bluffing a strong draw denies equity and can win immediately.',
  FL_XR_SET_GOOD:
    'Check-raising sets builds a big pot before draws come in.',
  FL_XR_DRAW_GOOD:
    'Strong draws make good check-raises — fold equity plus outs when called.',
  FL_XR_AIR_LEAK:
    'Check-raising pure air is rarely right for this coach — find outs or fold.',
  FL_CALL_ODDS_GOOD:
    'Your draw has the odds (or close with implied odds) to continue.',
  FL_CALL_NO_ODDS_LEAK:
    "You're not getting the right price — fold and wait for a better draw spot.",
  FL_CALL_WEAK_VS_LARGE_LEAK:
    "Weak one-pair doesn't happily call large bets — find a fold.",
  FL_FOLD_AIR_GOOD:
    'No pair, no draw — folding to a bet is the default winning play.',
  FL_FOLD_VALUE_LEAK:
    'You folded a strong made hand too soft — continue for value.',
  SPR_LOW_STACKOFF_GOOD:
    'Low SPR makes strong one-pair a stack-off — calling is standard.',
  SPR_HIGH_LIGHT_CALL_LEAK:
    "Stacks are deep — one weak pair isn't enough to call off huge.",
  SPR_MID_SET_GOOD:
    'Medium SPR is perfect to get money in with the nuts or near-nuts.',
  SPR_SUNK_COST_LEAK:
    'Ignore money already in the pot — only the price from here matters.',
  TN_BARREL_VALUE_GOOD:
    "Keep betting value when the turn is blank and you're still ahead.",
  TN_BARREL_AIR_LEAK:
    'Giving up with air after a call is often better than firing another bullet.',
  TN_CALL_MISSED_LEAK:
    'Your draw missed and the price is steep — fold the turn.',
  TN_POT_ODDS_CALL_GOOD:
    'Still getting a price on your outs — continuing is fine.',
  TN_SCARE_CHECK_OK:
    'Scary turn completes draws — checking back some medium hands is OK.',
  RV_VALUE_BET_GOOD: 'Bet for value — worse hands can still call.',
  RV_MISS_VALUE_LEAK:
    'Checking the nuts (or near-nuts) leaves money on the table.',
  RV_BLUFF_THIN_OK:
    'Thin river bluffs are advanced; vs unknowns, checking air is safer.',
  RV_BLUFF_NO_STORY_LEAK:
    'Bluffing without blockers or a missed-draw story is a leak here.',
  RV_BLUFF_CATCH_OK:
    'Hero-calls need a read — default to folding weak bluff-catchers.',
  RV_FOLD_BEATEN_GOOD:
    "You're beat too often in this line — folding saves a bet.",
  MW_TIGHTEN_GOOD:
    'Multiway pots punish thin bluffs — playing tighter is correct.',
  MW_BLUFF_LEAK:
    'Bluffing multiway needs everyone to fold — usually just give up.',
  GEN_SIZE_OFF_OK:
    'Action is fine; nudge your size toward the suggested range.',
  GEN_ALT_LINE_OK:
    'Not the primary line, but still reasonable — note the preferred play.',
  GEN_GOOD_DEFAULT: 'Matches the coaching line for this spot.',
  GEN_LEAK_DEFAULT:
    "This choice fights the fundamentals we're teaching — try the suggested action.",
};

// ---------------------------------------------------------------------------
// Simplified preflop open charts (hand keys) — teaching buckets
// ---------------------------------------------------------------------------

export const OPEN_CHART: Record<Exclude<Position, 'BB'>, string[]> = {
  EP: [
    'AA','KK','QQ','JJ','TT','99','88','77','66','55',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'KQs','KJs','KTs','K9s','QJs','QTs','Q9s','JTs','J9s','T9s','T8s','98s','87s','76s',
    'AKo','AQo','AJo','KQo',
  ],
  MP: [
    // EP + extras
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'KQs','KJs','KTs','K9s','QJs','QTs','Q9s','JTs','J9s','T9s','T8s','97s','98s','87s','76s','65s',
    'AKo','AQo','AJo','ATo','KQo','KJo','QJo',
  ],
  CO: [
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'KQs','KJs','KTs','K9s','K8s','QJs','QTs','Q9s','Q8s','JTs','J9s','J8s',
    'T9s','T8s','97s','98s','86s','87s','76s','65s','54s',
    'AKo','AQo','AJo','ATo','KQo','KJo','KTo','QJo','QTo','JTo',
  ],
  BTN: [
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s','K4s','K3s',
    'QJs','QTs','Q9s','Q8s','Q7s','Q6s','Q5s',
    'JTs','J9s','J8s','J7s','J6s','T9s','T8s','T7s','T6s',
    '98s','97s','96s','87s','86s','85s','76s','75s','65s','64s','54s','43s',
    'AKo','AQo','AJo','ATo','A9o','A8o','A7o','A6o','A5o','A4o','A3o','A2o',
    'KQo','KJo','KTo','K9o','QJo','QTo','Q9o','JTo','J9o','T9o',
  ],
  SB: [
    // Approx BTN-width; size larger in advice
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s','K4s','K3s','K2s',
    'QJs','QTs','Q9s','Q8s','Q7s','Q6s','Q5s','Q4s',
    'JTs','J9s','J8s','J7s','J6s','T9s','T8s','T7s','T6s',
    '98s','97s','96s','95s','87s','86s','85s','84s','76s','75s','74s','65s','64s','63s','54s','53s','43s','32s',
    'AKo','AQo','AJo','ATo','A9o','A8o','A7o','A6o','A5o','A4o','A3o','A2o',
    'KQo','KJo','KTo','K9o','K8o','QJo','QTo','Q9o','Q8o','JTo','J9o','J8o','T9o','T8o','98o',
  ],
};

export const VALUE_3BET = ['AA', 'KK', 'QQ', 'AKs', 'AKo', 'JJ', 'AQs'];
export const BLUFF_3BET_IP = ['A5s', 'A4s', 'A3s', 'A2s', '76s', '87s', '98s', 'T9s'];

// ---------------------------------------------------------------------------
// Example rules (ordered by priority)
// ---------------------------------------------------------------------------

export const EXAMPLE_RULES: CoachRule[] = [
  {
    id: 'pf-limp-ban',
    priority: 1,
    when: { street: 'preflop', facing: 'none' },
    frequency: 'never',
    advice: {
      recommended: 'raise',
      reasonCode: 'PF_LIMP_RFI',
      reason: COACH_STRINGS.PF_LIMP_RFI,
      concepts: ['rfi', 'no-limp'],
      sizeRange: { min: 2.2, max: 2.5, unit: 'bb', label: '~2.5bb' },
    },
  },
  {
    id: 'pf-btn-open',
    priority: 10,
    when: {
      street: 'preflop',
      facing: 'none',
      positions: ['BTN'],
      handKeysIn: OPEN_CHART.BTN,
    },
    frequency: 'always',
    advice: {
      recommended: 'raise',
      reasonCode: 'PF_OPEN_GOOD',
      reason: COACH_STRINGS.PF_OPEN_GOOD,
      concepts: ['rfi', 'position'],
      sizeRange: { min: 2.2, max: 2.5, unit: 'bb', label: '~2.5bb' },
    },
  },
  {
    id: 'pf-ep-fold-weak',
    priority: 11,
    when: {
      street: 'preflop',
      facing: 'none',
      positions: ['EP'],
      // engine: handKey NOT in OPEN_CHART.EP
    },
    frequency: 'always',
    advice: {
      recommended: 'fold',
      reasonCode: 'PF_OPEN_TOO_LOOSE',
      reason: COACH_STRINGS.PF_OPEN_TOO_LOOSE,
      concepts: ['rfi', 'position'],
    },
  },
  {
    id: 'pf-3bet-value-ip',
    priority: 20,
    when: {
      street: 'preflop',
      facing: 'bet', // treat open as facing bet/raise preflop in engine
      inPosition: true,
      handKeysIn: VALUE_3BET,
    },
    frequency: 'often',
    advice: {
      recommended: 'raise',
      reasonCode: 'PF_3BET_VALUE_GOOD',
      reason: COACH_STRINGS.PF_3BET_VALUE_GOOD,
      concepts: ['3bet', 'value'],
      sizeRange: { min: 2.8, max: 3.5, unit: 'bb', label: '~3× open' },
    },
  },
  {
    id: 'pf-bb-defend-call',
    priority: 25,
    when: {
      street: 'preflop',
      positions: ['BB'],
      facing: 'bet',
      // engine filters playable defends
    },
    frequency: 'often',
    advice: {
      recommended: 'call',
      reasonCode: 'PF_FLAT_BB_GOOD',
      reason: COACH_STRINGS.PF_FLAT_BB_GOOD,
      concepts: ['bb-defend', 'pot-odds'],
    },
  },
  {
    id: 'fl-cbet-dry-pfr',
    priority: 40,
    when: {
      street: 'flop',
      heroIsPfr: true,
      facing: 'check',
      boardTagsAny: ['dry', 'paired'],
      handClasses: ['nuts', 'strongMade', 'strongDraw', 'air'],
    },
    frequency: 'often',
    advice: {
      recommended: 'bet',
      reasonCode: 'FL_CBET_DRY_GOOD',
      reason: COACH_STRINGS.FL_CBET_DRY_GOOD,
      concepts: ['cbet', 'texture'],
      sizeRange: { min: 0.25, max: 0.4, unit: 'pot', label: '~33% pot' },
    },
  },
  {
    id: 'fl-check-mono-weak',
    priority: 41,
    when: {
      street: 'flop',
      heroIsPfr: true,
      facing: 'check',
      boardTagsAll: ['monotone'],
      handClasses: ['weakMade'],
    },
    frequency: 'often',
    advice: {
      recommended: 'check',
      reasonCode: 'FL_CBET_MONO_LEAK',
      reason: COACH_STRINGS.FL_CBET_MONO_LEAK,
      concepts: ['cbet', 'monotone'],
    },
  },
  {
    id: 'fl-xr-nuts',
    priority: 50,
    when: {
      street: 'flop',
      heroIsPfr: false,
      facing: 'bet',
      handClasses: ['nuts'],
    },
    frequency: 'often',
    advice: {
      recommended: 'raise',
      reasonCode: 'FL_XR_SET_GOOD',
      reason: COACH_STRINGS.FL_XR_SET_GOOD,
      concepts: ['check-raise', 'value'],
      sizeRange: { min: 2.5, max: 4, unit: 'bb', label: '~3–4× bet' },
    },
  },
  {
    id: 'fl-call-draw-odds',
    priority: 55,
    when: {
      street: 'flop',
      facing: 'bet',
      handClasses: ['strongDraw', 'weakDraw'],
      oddsOk: true,
    },
    frequency: 'often',
    advice: {
      recommended: 'call',
      reasonCode: 'FL_CALL_ODDS_GOOD',
      reason: COACH_STRINGS.FL_CALL_ODDS_GOOD,
      concepts: ['pot-odds', 'draws'],
    },
  },
  {
    id: 'fl-fold-draw-no-odds',
    priority: 56,
    when: {
      street: 'flop',
      facing: 'bet',
      handClasses: ['weakDraw', 'air'],
      oddsOk: false,
    },
    frequency: 'often',
    advice: {
      recommended: 'fold',
      reasonCode: 'FL_CALL_NO_ODDS_LEAK',
      reason: COACH_STRINGS.FL_CALL_NO_ODDS_LEAK,
      concepts: ['pot-odds'],
    },
  },
  {
    id: 'spr-low-stackoff',
    priority: 60,
    when: {
      street: ['flop', 'turn'],
      sprBands: ['low'],
      facing: ['bet', 'raise'],
      handClasses: ['strongMade', 'nuts', 'strongDraw'],
    },
    frequency: 'often',
    advice: {
      recommended: 'call',
      reasonCode: 'SPR_LOW_STACKOFF_GOOD',
      reason: COACH_STRINGS.SPR_LOW_STACKOFF_GOOD,
      concepts: ['spr', 'stack-off'],
    },
  },
  {
    id: 'spr-high-weak-fold',
    priority: 61,
    when: {
      street: ['flop', 'turn', 'river'],
      sprBands: ['high'],
      facing: ['bet', 'raise'],
      handClasses: ['weakMade'],
    },
    frequency: 'often',
    advice: {
      recommended: 'fold',
      reasonCode: 'SPR_HIGH_LIGHT_CALL_LEAK',
      reason: COACH_STRINGS.SPR_HIGH_LIGHT_CALL_LEAK,
      concepts: ['spr'],
    },
  },
  {
    id: 'rv-value-nuts',
    priority: 70,
    when: {
      street: 'river',
      facing: 'check',
      handClasses: ['nuts', 'strongMade'],
    },
    frequency: 'often',
    advice: {
      recommended: 'bet',
      reasonCode: 'RV_VALUE_BET_GOOD',
      reason: COACH_STRINGS.RV_VALUE_BET_GOOD,
      concepts: ['river', 'value'],
      sizeRange: { min: 0.5, max: 1.0, unit: 'pot', label: '~66–100% pot' },
    },
  },
];

// ---------------------------------------------------------------------------
// Grading helper (sketch)
// ---------------------------------------------------------------------------

function actionsCompatible(user: ActionType, recommended: ActionType): boolean {
  if (user === recommended) return true;
  // treat all-in as aggressive continue when jam is fine
  if (user === 'allin' && (recommended === 'raise' || recommended === 'bet' || recommended === 'call')) {
    return true;
  }
  if (user === 'bet' && recommended === 'raise') return false;
  if (user === 'check' && recommended === 'fold') return false;
  return false;
}

function sizeInRange(
  user: UserActionForGrade,
  range?: SizeRange,
): 'in' | 'near' | 'far' | 'n/a' {
  if (!range) return 'n/a';
  const v = range.unit === 'pot' ? user.sizePotFrac : user.sizeBb;
  if (v == null || Number.isNaN(v)) return 'n/a';
  if (v >= range.min && v <= range.max) return 'in';
  const pad = range.unit === 'pot' ? 0.15 : 0.5;
  if (v >= range.min - pad && v <= range.max + pad) return 'near';
  return 'far';
}

/** Map rule advice → full CoachAdvice for UI */
export function toCoachAdvice(
  rule: CoachRule,
  ctx: CoachDecisionContext,
): CoachAdvice {
  const sr = rule.advice.sizeRange;
  return {
    recommended: rule.advice.recommended,
    sizeRange: sr
      ? { min: sr.min, max: sr.max, label: sr.label }
      : undefined,
    reason: rule.advice.reason,
    concepts: rule.advice.concepts,
    handClass: ctx.handClass,
    position: ctx.position,
    potOdds: ctx.potOdds,
    spr: ctx.spr,
  };
}

/**
 * Grade user action vs matched advice.
 * Special-cases: limp when facing none → Leak; fold when recommended raise open → Leak; etc.
 */
export function gradeAction(
  ctx: CoachDecisionContext,
  user: UserActionForGrade,
  advice: CoachAdvice,
  reasonCode: ReasonCode,
): CoachGrade {
  // Hard leaks
  if (ctx.street === 'preflop' && ctx.facing === 'none' && user.type === 'call') {
    return {
      grade: 'Leak',
      why: COACH_STRINGS.PF_LIMP_RFI,
      advice: { ...advice, recommended: 'raise', reason: COACH_STRINGS.PF_LIMP_RFI },
    };
  }

  const match = actionsCompatible(user.type, advice.recommended);
  const sizing = sizeInRange(user, advice.sizeRange
    ? {
        min: advice.sizeRange.min,
        max: advice.sizeRange.max,
        unit: advice.sizeRange.label.includes('pot') ? 'pot' : 'bb',
        label: advice.sizeRange.label,
      }
    : undefined);

  let grade: Grade;
  let code: ReasonCode = reasonCode;

  if (match && (sizing === 'in' || sizing === 'n/a')) {
    grade = 'Good';
  } else if (match && sizing === 'near') {
    grade = 'OK';
    code = 'GEN_SIZE_OFF_OK';
  } else if (match && sizing === 'far') {
    grade = 'OK';
    code = 'GEN_SIZE_OFF_OK';
  } else if (!match) {
    // Alternates: check vs small c-bet air → OK
    if (
      advice.recommended === 'bet' &&
      user.type === 'check' &&
      ctx.handClass === 'air' &&
      ctx.boardTags.includes('dry')
    ) {
      grade = 'OK';
      code = 'GEN_ALT_LINE_OK';
    } else if (
      advice.recommended === 'fold' &&
      (user.type === 'call' || user.type === 'raise')
    ) {
      grade = 'Leak';
      code = reasonCode.includes('ODDS') ? 'FL_CALL_NO_ODDS_LEAK' : 'GEN_LEAK_DEFAULT';
    } else if (
      (advice.recommended === 'bet' || advice.recommended === 'raise') &&
      user.type === 'fold'
    ) {
      grade = 'Leak';
      code = 'FL_FOLD_VALUE_LEAK';
    } else if (advice.recommended === 'check' && user.type === 'bet' && ctx.boardTags.includes('monotone')) {
      grade = 'Leak';
      code = 'FL_CBET_MONO_LEAK';
    } else {
      grade = 'Leak';
      code = 'GEN_LEAK_DEFAULT';
    }
  } else {
    grade = 'OK';
    code = 'GEN_ALT_LINE_OK';
  }

  return {
    grade,
    why: COACH_STRINGS[code],
    advice,
  };
}

// ---------------------------------------------------------------------------
// Concrete grading examples (spot → action → grade) for Dealer tests
// ---------------------------------------------------------------------------

export interface GradeExample {
  name: string;
  ctx: Partial<CoachDecisionContext> &
    Pick<CoachDecisionContext, 'street' | 'position' | 'handClass' | 'facing'>;
  user: UserActionForGrade;
  expectedGrade: Grade;
  reasonCode: ReasonCode;
}

export const GRADE_EXAMPLES: GradeExample[] = [
  {
    name: 'BTN opens A9o',
    ctx: {
      street: 'preflop',
      position: 'BTN',
      facing: 'none',
      handClass: 'air', // preflop class unused
      handKey: 'A9o',
      heroIsPfr: false,
      inPosition: true,
      pot: 3,
      toCall: 0,
      effectiveStack: 200,
      spr: Infinity,
      sprBand: 'high',
      boardTags: [],
      numPlayersInPot: 1,
    },
    user: { type: 'raise', sizeBb: 2.5 },
    expectedGrade: 'Good',
    reasonCode: 'PF_OPEN_GOOD',
  },
  {
    name: 'EP opens KTo — leak',
    ctx: {
      street: 'preflop',
      position: 'EP',
      facing: 'none',
      handClass: 'air',
      handKey: 'KTo',
      heroIsPfr: false,
      inPosition: false,
      pot: 3,
      toCall: 0,
      effectiveStack: 200,
      spr: Infinity,
      sprBand: 'high',
      boardTags: [],
      numPlayersInPot: 1,
    },
    user: { type: 'raise', sizeBb: 2.5 },
    expectedGrade: 'Leak',
    reasonCode: 'PF_OPEN_TOO_LOOSE',
  },
  {
    name: 'Limp AA EP — leak',
    ctx: {
      street: 'preflop',
      position: 'EP',
      facing: 'none',
      handClass: 'nuts',
      handKey: 'AA',
      heroIsPfr: false,
      inPosition: false,
      pot: 3,
      toCall: 0,
      effectiveStack: 200,
      spr: Infinity,
      sprBand: 'high',
      boardTags: [],
      numPlayersInPot: 1,
      limped: true,
    },
    user: { type: 'call', amount: 2 },
    expectedGrade: 'Leak',
    reasonCode: 'PF_LIMP_RFI',
  },
  {
    name: 'Dry flop TPTK small c-bet',
    ctx: {
      street: 'flop',
      position: 'BTN',
      facing: 'check',
      handClass: 'strongMade',
      heroIsPfr: true,
      inPosition: true,
      pot: 6.5,
      toCall: 0,
      effectiveStack: 197,
      spr: 30,
      sprBand: 'high',
      boardTags: ['dry', 'broadwayHeavy'],
      numPlayersInPot: 2,
    },
    user: { type: 'bet', sizePotFrac: 0.33 },
    expectedGrade: 'Good',
    reasonCode: 'FL_CBET_DRY_GOOD',
  },
  {
    name: 'Air overbet dry flop — leak',
    ctx: {
      street: 'flop',
      position: 'BTN',
      facing: 'check',
      handClass: 'air',
      heroIsPfr: true,
      inPosition: true,
      pot: 6.5,
      toCall: 0,
      effectiveStack: 197,
      spr: 30,
      sprBand: 'high',
      boardTags: ['dry'],
      numPlayersInPot: 2,
    },
    user: { type: 'bet', sizePotFrac: 1.25 },
    expectedGrade: 'Leak',
    reasonCode: 'FL_CBET_AIR_OVERBET_LEAK',
  },
  {
    name: 'Set check-raise flop',
    ctx: {
      street: 'flop',
      position: 'BB',
      facing: 'bet',
      handClass: 'nuts',
      heroIsPfr: false,
      inPosition: false,
      pot: 6.5,
      toCall: 2,
      betSizePotFrac: 0.33,
      effectiveStack: 195,
      spr: 30,
      sprBand: 'high',
      boardTags: ['semiWet'],
      numPlayersInPot: 2,
    },
    user: { type: 'raise', sizePotFrac: 1.1 },
    expectedGrade: 'Good',
    reasonCode: 'FL_XR_SET_GOOD',
  },
  {
    name: 'Gutshot calls huge bet no odds — leak',
    ctx: {
      street: 'flop',
      position: 'BB',
      facing: 'bet',
      handClass: 'weakDraw',
      outs: 4,
      potOdds: 0.4,
      estEquity: 0.16,
      heroIsPfr: false,
      inPosition: false,
      pot: 10,
      toCall: 8,
      betSizePotFrac: 0.8,
      effectiveStack: 190,
      spr: 19,
      sprBand: 'high',
      boardTags: ['wet'],
      numPlayersInPot: 2,
    },
    user: { type: 'call', amount: 8 },
    expectedGrade: 'Leak',
    reasonCode: 'FL_CALL_NO_ODDS_LEAK',
  },
  {
    name: 'Low SPR TPTK calls jam — good',
    ctx: {
      street: 'flop',
      position: 'BB',
      facing: 'raise',
      handClass: 'strongMade',
      heroIsPfr: false,
      inPosition: false,
      pot: 40,
      toCall: 80,
      effectiveStack: 80,
      spr: 2,
      sprBand: 'low',
      boardTags: ['dry'],
      numPlayersInPot: 2,
    },
    user: { type: 'call', amount: 80 },
    expectedGrade: 'Good',
    reasonCode: 'SPR_LOW_STACKOFF_GOOD',
  },
  {
    name: 'High SPR weak pair calls shove — leak',
    ctx: {
      street: 'turn',
      position: 'CO',
      facing: 'raise',
      handClass: 'weakMade',
      heroIsPfr: true,
      inPosition: true,
      pot: 20,
      toCall: 180,
      effectiveStack: 180,
      spr: 9,
      sprBand: 'high',
      boardTags: ['semiWet'],
      numPlayersInPot: 2,
    },
    user: { type: 'call', amount: 180 },
    expectedGrade: 'Leak',
    reasonCode: 'SPR_HIGH_LIGHT_CALL_LEAK',
  },
  {
    name: 'River check nuts — leak',
    ctx: {
      street: 'river',
      position: 'BTN',
      facing: 'check',
      handClass: 'nuts',
      heroIsPfr: true,
      inPosition: true,
      pot: 40,
      toCall: 0,
      effectiveStack: 160,
      spr: 4,
      sprBand: 'mid',
      boardTags: ['dry'],
      numPlayersInPot: 2,
    },
    user: { type: 'check' },
    expectedGrade: 'Leak',
    reasonCode: 'RV_MISS_VALUE_LEAK',
  },
];

export function sprBandFromValue(spr: number): SprBand {
  if (spr <= 3) return 'low';
  if (spr < 8) return 'mid';
  return 'high';
}
