import type { ReasonCode } from './types';

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

export function whyFor(
  code: ReasonCode,
  vars?: Record<string, string>,
): string {
  let s = COACH_STRINGS[code];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, v);
    }
  }
  return s;
}
