import { estimateOuts, classifyHand } from './handClass';
import { tagBoard, sprBandFromValue, isDryish, isWetish, hasTag } from './board';
import {
  handKey,
  isInOpenChart,
  openSizeBb,
  threeBetSizeBb,
  classifyPreflopFacing,
  preflopContinueBucket,
  VALUE_3BET,
  BLUFF_3BET,
} from './preflop';
import { whyFor } from './strings';
import type { ReasonCode, BoardTag, SprBand, SizeRangeSpec } from './types';
import { outsToEquity, potOdds, spr, formatPct } from '../poker/odds';
import { positionForSeat } from '../poker/positions';
import type {
  ActionType,
  Card,
  CoachAdvice,
  HandClass,
  PlayerState,
  Position,
  Street,
} from '../poker/types';

export interface RecommendInput {
  hole: Card[];
  board: Card[];
  street: Street;
  pot: number;
  toCall: number;
  hero: PlayerState;
  buttonSeat: number;
  seatCount?: number;
  currentBet: number;
  minRaise: number;
  /** Number of opponents still in the hand */
  villainsInHand: number;
  /** Optional override; default: toCall===0 ⇒ assume PFR checked to */
  heroIsPfr?: boolean;
  /** Big blind in chips (default 2) */
  bigBlind?: number;
  /** Opener was late position when facing open (default true) */
  openerIsLate?: boolean;
}

/** Extended advice used internally; reasonCode optional on CoachAdvice shape. */
export type CoachAdviceInternal = CoachAdvice & {
  reasonCode?: ReasonCode;
  street?: Street;
  boardTags?: BoardTag[];
  sprBand?: SprBand;
  sizeSpec?: SizeRangeSpec;
};

function chipSizeFromBb(
  bb: number,
  mult: number,
  toCall: number,
): { min: number; max: number; label: string; putIn: number } {
  const total = Math.round(bb * mult);
  const putIn = Math.max(total, toCall + bb);
  return {
    min: Math.round(putIn * 0.9),
    max: Math.round(putIn * 1.15),
    label: `~${mult}× BB`,
    putIn,
  };
}

function chipSizeFromPot(
  pot: number,
  toCall: number,
  frac: number,
  label: string,
): { min: number; max: number; label: string; putIn: number } {
  const base = toCall === 0 ? pot : pot + toCall;
  const bet = Math.max(2, Math.round(base * frac));
  const putIn = toCall === 0 ? bet : toCall + bet;
  return {
    min: Math.round(putIn * 0.8),
    max: Math.round(putIn * 1.2),
    label,
    putIn,
  };
}

/** Beginner-friendly seat labels — never dump EP/CO/BTN alone in learner copy. */
function positionPlain(pos: Position): string {
  switch (pos) {
    case 'EP':
      return 'early position';
    case 'MP':
      return 'middle position';
    case 'CO':
      return 'the cutoff (late position)';
    case 'BTN':
      return 'the button (dealer seat)';
    case 'SB':
      return 'the small blind';
    case 'BB':
      return 'the big blind';
  }
}

/** Beginner-friendly hand strength — never dump raw enums like "air". */
const HAND_CLASS_PLAIN: Record<HandClass, string> = {
  air: 'a very weak hand — almost nothing if this goes to showdown',
  weakDraw: 'a weak draw (few ways to improve)',
  strongDraw: 'a strong draw (many ways to improve)',
  weakMade: 'a weak one-pair hand',
  strongMade: 'a strong made hand',
  nuts: 'the nuts (best possible hand)',
};

/** Short chip labels for Graphics concept pills. */
function handClassChip(hc: HandClass): string {
  switch (hc) {
    case 'air':
      return 'very weak hand';
    case 'weakDraw':
      return 'weak draw';
    case 'strongDraw':
      return 'strong draw';
    case 'weakMade':
      return 'weak one-pair';
    case 'strongMade':
      return 'strong made hand';
    case 'nuts':
      return 'best possible hand';
  }
}

function sprBandPlain(band: SprBand): string {
  if (band === 'low') return 'low';
  if (band === 'mid') return 'medium';
  return 'high';
}

function sprImplication(band: SprBand): string {
  if (band === 'low') {
    return 'the pot is already large compared with stacks, so strong hands often put the rest in';
  }
  if (band === 'mid') {
    return 'a good zone to build the pot with very strong hands or strong draws';
  }
  return 'stacks are deep, so a weak one-pair rarely wants to put in a huge amount';
}

/** Why recommended action beats the main alternative in this spot (educational). */
function actionLessonBullet(
  recommended: ActionType,
  reasonCode: ReasonCode,
  concepts: string[],
): string {
  const c = concepts.join(' ').toLowerCase();
  if (recommended === 'fold') {
    if (reasonCode === 'PF_3BET_OR_FOLD' || c.includes('3bet-or-fold')) {
      return 'Folding beats just calling here — calling from this seat often leaves you acting first later and can get re-raised behind you.';
    }
    if (reasonCode.includes('ODDS') || c.includes('pot-odds')) {
      return 'Folding beats calling — you are not getting a good enough price for how often your hand wins.';
    }
    if (reasonCode.includes('AIR') || c.includes('very weak') || c.includes('air')) {
      return 'Folding beats calling — with no pair and no real draw, putting more money in usually loses.';
    }
    return 'Folding beats continuing — the price to call or your hand strength does not justify putting more in.';
  }
  if (recommended === 'call') {
    if (reasonCode.includes('ODDS') || c.includes('pot-odds') || c.includes('defend')) {
      return 'Calling beats folding — the price to call is good enough for how often you can win.';
    }
    if (reasonCode.includes('SPR_LOW') || c.includes('stack-off')) {
      return 'Calling beats folding — with a short stack-to-pot ratio, strong hands usually put the rest in.';
    }
    return 'Calling beats folding — you have enough chance of winning (or a good enough price) to continue.';
  }
  if (recommended === 'check') {
    return 'Checking beats betting — keep the pot smaller or avoid firing automatically on a dangerous board.';
  }
  if (recommended === 'bet' || recommended === 'raise' || recommended === 'allin') {
    if (reasonCode.includes('3BET') || c.includes('3bet')) {
      return 'Re-raising beats calling — grow the pot with a clear plan instead of just calling.';
    }
    if (c.includes('rfi') || reasonCode.includes('OPEN')) {
      return 'Raising beats limping or folding — raise hands worth playing first-in, or fold; do not limp.';
    }
    if (c.includes('semi-bluff') || c.includes('draw') || reasonCode.includes('DRAW')) {
      return 'Betting or raising beats checking — you can win right away if they fold, and you still have outs if called.';
    }
    if (reasonCode.includes('VALUE') || c.includes('value')) {
      return 'Betting or raising beats checking — weaker hands can still call, so get paid when you are ahead.';
    }
    return 'Betting or raising beats checking or calling — apply pressure and build the pot when you are ahead.';
  }
  return 'Stick to the recommended action — it best matches the fundamentals for this spot.';
}

function buildDetails(args: {
  recommended: ActionType;
  reasonCode: ReasonCode;
  concepts: string[];
  handClass: HandClass;
  position: Position;
  potOdds?: number;
  spr?: number;
  sprBand?: SprBand;
  sizeRange?: CoachAdvice['sizeRange'];
}): string[] {
  const details: string[] = [];
  details.push(
    `You're in ${positionPlain(args.position)} with ${HAND_CLASS_PLAIN[args.handClass]}.`,
  );

  if (args.potOdds !== undefined && args.potOdds > 0) {
    details.push(
      `To call profitably you need roughly ${formatPct(args.potOdds)} chance of winning (that is your pot odds).`,
    );
  }

  if (args.spr !== undefined && Number.isFinite(args.spr)) {
    const band = args.sprBand ?? sprBandFromValue(args.spr);
    const n = args.spr >= 10 ? args.spr.toFixed(0) : args.spr.toFixed(1);
    details.push(
      `Stack-to-pot ratio ≈ ${n} (${sprBandPlain(band)}) — your stack is about ${n}× the pot; ${sprImplication(band)}.`,
    );
  }

  details.push(actionLessonBullet(args.recommended, args.reasonCode, args.concepts));

  if (args.sizeRange) {
    details.push(
      `Size tip: aim ${args.sizeRange.label} (about ${args.sizeRange.min}–${args.sizeRange.max} chips).`,
    );
  }

  return details.slice(0, 5);
}

function adviceOf(args: {
  recommended: ActionType;
  reasonCode: ReasonCode;
  concepts: string[];
  handClass: HandClass;
  position: Position;
  potOdds?: number;
  spr?: number;
  street: Street;
  boardTags?: BoardTag[];
  sprBand?: SprBand;
  sizeRange?: CoachAdvice['sizeRange'];
  sizeSpec?: SizeRangeSpec;
  vars?: Record<string, string>;
}): CoachAdviceInternal {
  const reason = whyFor(args.reasonCode, args.vars);
  const details = buildDetails({
    recommended: args.recommended,
    reasonCode: args.reasonCode,
    concepts: args.concepts,
    handClass: args.handClass,
    position: args.position,
    potOdds: args.potOdds,
    spr: args.spr,
    sprBand: args.sprBand,
    sizeRange: args.sizeRange,
  });
  return {
    recommended: args.recommended,
    sizeRange: args.sizeRange,
    reason,
    details,
    reasonCode: args.reasonCode,
    concepts: args.concepts,
    handClass: args.handClass,
    position: args.position,
    potOdds: args.potOdds,
    spr: args.spr,
    street: args.street,
    boardTags: args.boardTags,
    sprBand: args.sprBand,
    sizeSpec: args.sizeSpec,
  };
}

function recommendPreflop(input: RecommendInput, pos: Position, handClass: HandClass): CoachAdviceInternal {
  const key = handKey(input.hole);
  const bb = input.bigBlind ?? 2;
  const facing = classifyPreflopFacing(input.toCall, input.currentBet, bb);
  // Only BTN/CO are truly IP for continue-bucket purposes (SB/BB have higher
  // positionStrength indices but are OOP vs opens — do not treat blinds as IP).
  const ip = pos === 'BTN' || pos === 'CO';

  const concepts: string[] = [
    `Seat: ${positionPlain(pos)}`,
    `Your cards: ${key}`,
    `Hand strength: ${handClassChip(handClass)}`,
  ];
  const sprVal = spr(input.hero.stack, Math.max(1, input.pot));
  const openerIsLate = input.openerIsLate ?? true;
  const bucket = preflopContinueBucket(pos, key, facing, ip, openerIsLate);

  if (facing === 'none') {
    // BB check option when everyone folded (rare in 6-max cash engine)
    if (pos === 'BB' && input.toCall === 0) {
      return adviceOf({
        recommended: 'check',
        reasonCode: 'GEN_GOOD_DEFAULT',
        concepts,
        handClass,
        position: pos,
        spr: sprVal,
        street: 'preflop',
      });
    }

    if (isInOpenChart(pos as Exclude<Position, 'BB'>, key) || (pos !== 'BB' && bucket === 'open')) {
      const sz = openSizeBb(pos === 'BB' ? 'BTN' : pos);
      const chips = chipSizeFromBb(bb, (sz.min + sz.max) / 2, 0);
      return adviceOf({
        recommended: 'raise',
        reasonCode: 'PF_OPEN_GOOD',
        concepts: [...concepts, 'rfi', 'no-limp'],
        handClass,
        position: pos,
        spr: sprVal,
        street: 'preflop',
        sizeRange: { min: chips.min, max: chips.max, label: sz.label },
        sizeSpec: { min: sz.min, max: sz.max, unit: 'bb', label: sz.label },
      });
    }

    return adviceOf({
      recommended: 'fold',
      reasonCode: 'PF_FOLD_OPEN_GOOD',
      concepts: [...concepts, 'rfi'],
      handClass,
      position: pos,
      spr: sprVal,
      street: 'preflop',
    });
  }

  if (facing === 'threeBet') {
    const odds = potOdds(input.pot, input.toCall);
    concepts.push(`Need ~${formatPct(odds)} to call`);
    if (bucket === 'fourBet') {
      const chips = chipSizeFromBb(bb, input.currentBet / bb * 2.2, input.toCall);
      return adviceOf({
        recommended: 'raise',
        reasonCode: 'PF_FACE_3BET_4BET_GOOD',
        concepts: [...concepts, '4bet', 'value'],
        handClass,
        position: pos,
        potOdds: odds,
        spr: sprVal,
        street: 'preflop',
        sizeRange: { min: chips.min, max: chips.max, label: '~2.2× 3-bet' },
      });
    }
    if (bucket === 'call') {
      return adviceOf({
        recommended: 'call',
        reasonCode: 'PF_FACE_3BET_CALL_IP_GOOD',
        concepts: [...concepts, 'vs-3bet'],
        handClass,
        position: pos,
        potOdds: odds,
        spr: sprVal,
        street: 'preflop',
      });
    }
    return adviceOf({
      recommended: 'fold',
      reasonCode: 'PF_FACE_3BET_FOLD_GOOD',
      concepts: [...concepts, 'vs-3bet'],
      handClass,
      position: pos,
      potOdds: odds,
      spr: sprVal,
      street: 'preflop',
    });
  }

  // facing open
  const odds = potOdds(input.pot, input.toCall);
  concepts.push(`Need ~${formatPct(odds)} to call`);

  if (bucket === 'threeBet') {
    const isValue = VALUE_3BET.has(key);
    const isBluff = BLUFF_3BET.has(key);
    // Prefer IP sizing from BTN/CO; avoid `ip || pos==='BTN'` (TS narrows BTN away when ip is false)
    const threeBetIp = pos === 'BTN' || pos === 'CO';
    const sz = threeBetSizeBb(threeBetIp || ip);
    const openBb = Math.max(2.2, input.currentBet / bb);
    const mult =
      threeBetIp || (ip && pos !== 'SB' && pos !== 'BB') ? openBb * 3 : openBb * 4;
    const chips = chipSizeFromBb(bb, mult, input.toCall);
    return adviceOf({
      recommended: 'raise',
      reasonCode: isValue ? 'PF_3BET_VALUE_GOOD' : isBluff ? 'PF_3BET_BLUFF_GOOD' : 'PF_3BET_VALUE_GOOD',
      concepts: [...concepts, '3bet'],
      handClass,
      position: pos,
      potOdds: odds,
      spr: sprVal,
      street: 'preflop',
      sizeRange: { min: chips.min, max: chips.max, label: sz.label },
      sizeSpec: { min: sz.min, max: sz.max, unit: 'bb', label: sz.label },
    });
  }

  if (bucket === 'call') {
    const code: ReasonCode =
      pos === 'BB' ? 'PF_FLAT_BB_GOOD' : pos === 'SB' ? 'PF_FLAT_SB_OK' : 'PF_FLAT_BB_GOOD';
    return adviceOf({
      recommended: 'call',
      reasonCode: code,
      concepts: [...concepts, 'defend'],
      handClass,
      position: pos,
      potOdds: odds,
      spr: sprVal,
      street: 'preflop',
    });
  }

  // fold / 3bet-or-fold seats that wrongly want to flat
  if (pos === 'SB' || pos === 'EP' || pos === 'MP' || pos === 'CO') {
    return adviceOf({
      recommended: 'fold',
      reasonCode: 'PF_3BET_OR_FOLD',
      concepts: [...concepts, '3bet-or-fold'],
      handClass,
      position: pos,
      potOdds: odds,
      spr: sprVal,
      street: 'preflop',
    });
  }

  return adviceOf({
    recommended: 'fold',
    reasonCode: 'PF_FLAT_TOO_WIDE',
    concepts,
    handClass,
    position: pos,
    potOdds: odds,
    spr: sprVal,
    street: 'preflop',
  });
}

function recommendPostflop(input: RecommendInput, pos: Position, handClass: HandClass): CoachAdviceInternal {
  const boardTags = tagBoard(input.board);
  const sprVal = spr(input.hero.stack, Math.max(1, input.pot));
  const band = sprBandFromValue(sprVal);
  const heroIsPfr = input.heroIsPfr ?? input.toCall === 0;
  const multiway = input.villainsInHand >= 2;
  const concepts: string[] = [
    `Seat: ${positionPlain(pos)}`,
    `Hand strength: ${handClassChip(handClass)}`,
    `Stack-to-pot ≈ ${sprVal.toFixed(1)}× (${sprBandPlain(band)})`,
    `Board: ${boardTags.join(', ') || 'n/a'}`,
  ];
  if (multiway) concepts.push('Multiway');

  const outs = estimateOuts(input.hole, input.board);
  const cardsToCome: 1 | 2 =
    input.street === 'flop' ? 2 : input.street === 'turn' ? 1 : 1;
  const drawEq = outs > 0 ? outsToEquity(outs, cardsToCome) : 0;
  if (outs > 0) concepts.push(`~${outs} cards help you (~${formatPct(drawEq)} win chance)`);

  const odds = input.toCall > 0 ? potOdds(input.pot, input.toCall) : 0;
  if (input.toCall > 0) concepts.push(`Need ~${formatPct(odds)} to call`);

  const street = input.street === 'showdown' || input.street === 'handOver' ? 'river' : input.street;
  const betFrac = input.pot > 0 && input.toCall > 0 ? input.toCall / input.pot : 0;

  // --- Facing a bet/raise ---
  if (input.toCall > 0) {
    // Low SPR stack-off with strongMade+
    if (
      band === 'low' &&
      (handClass === 'strongMade' || handClass === 'nuts' || handClass === 'strongDraw')
    ) {
      return adviceOf({
        recommended: 'call',
        reasonCode: 'SPR_LOW_STACKOFF_GOOD',
        concepts: [...concepts, 'spr', 'stack-off'],
        handClass,
        position: pos,
        potOdds: odds,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }

    // High SPR weak made vs large bet/shove
    if (
      band === 'high' &&
      handClass === 'weakMade' &&
      (betFrac >= 0.6 || input.toCall >= input.hero.stack * 0.5)
    ) {
      return adviceOf({
        recommended: 'fold',
        reasonCode: 'SPR_HIGH_LIGHT_CALL_LEAK',
        concepts: [...concepts, 'spr'],
        handClass,
        position: pos,
        potOdds: odds,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }

    // Mid SPR nuts/set → raise or call
    if (band === 'mid' && handClass === 'nuts') {
      const s = chipSizeFromPot(input.pot, input.toCall, 0.7, '~3–4× bet');
      return adviceOf({
        recommended: 'raise',
        reasonCode: 'SPR_MID_SET_GOOD',
        concepts: [...concepts, 'spr', 'value'],
        handClass,
        position: pos,
        potOdds: odds,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
        sizeRange: { min: s.min, max: s.max, label: s.label },
        sizeSpec: { min: 2.5, max: 4, unit: 'bb', label: s.label },
      });
    }

    // Nuts / set XR vs small-medium c-bet (esp flop)
    if (
      handClass === 'nuts' &&
      !hasTag(boardTags, 'monotone') &&
      betFrac > 0 &&
      betFrac <= 0.55
    ) {
      const s = chipSizeFromPot(input.pot, input.toCall, 0.9, '~3–4× bet');
      return adviceOf({
        recommended: 'raise',
        reasonCode: 'FL_XR_SET_GOOD',
        concepts: [...concepts, 'check-raise', 'value'],
        handClass,
        position: pos,
        potOdds: odds,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
        sizeRange: { min: s.min, max: s.max, label: s.label },
      });
    }

    if (handClass === 'nuts' || handClass === 'strongMade') {
      if (street === 'river' && betFrac >= 0.75 && handClass === 'strongMade' && band === 'high') {
        return adviceOf({
          recommended: 'fold',
          reasonCode: 'RV_FOLD_BEATEN_GOOD',
          concepts,
          handClass,
          position: pos,
          potOdds: odds,
          spr: sprVal,
          street,
          boardTags,
          sprBand: band,
        });
      }
      return adviceOf({
        recommended: handClass === 'nuts' && betFrac <= 0.5 ? 'raise' : 'call',
        reasonCode: handClass === 'nuts' ? 'FL_XR_SET_GOOD' : 'GEN_GOOD_DEFAULT',
        concepts: [...concepts, 'value'],
        handClass,
        position: pos,
        potOdds: odds,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }

    if (handClass === 'strongDraw' || handClass === 'weakDraw') {
      const buffer =
        band === 'high' && handClass === 'strongDraw' ? 0.07 : band === 'low' ? 0 : 0.03;
      const oddsOk = drawEq + buffer >= odds;
      if (oddsOk) {
        // Strong draws can XR sometimes vs small bets
        if (handClass === 'strongDraw' && betFrac > 0 && betFrac <= 0.4 && street === 'flop') {
          const s = chipSizeFromPot(input.pot, input.toCall, 0.9, '~3× bet');
          return adviceOf({
            recommended: 'raise',
            reasonCode: 'FL_XR_DRAW_GOOD',
            concepts: [...concepts, 'check-raise', 'draws'],
            handClass,
            position: pos,
            potOdds: odds,
            spr: sprVal,
            street,
            boardTags,
            sprBand: band,
            sizeRange: { min: s.min, max: s.max, label: s.label },
          });
        }
        return adviceOf({
          recommended: 'call',
          reasonCode: street === 'turn' ? 'TN_POT_ODDS_CALL_GOOD' : 'FL_CALL_ODDS_GOOD',
          concepts: [...concepts, 'pot-odds', 'draws'],
          handClass,
          position: pos,
          potOdds: odds,
          spr: sprVal,
          street,
          boardTags,
          sprBand: band,
        });
      }
      return adviceOf({
        recommended: 'fold',
        reasonCode: street === 'turn' ? 'TN_CALL_MISSED_LEAK' : 'FL_CALL_NO_ODDS_LEAK',
        concepts: [...concepts, 'pot-odds'],
        handClass,
        position: pos,
        potOdds: odds,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }

    if (handClass === 'weakMade') {
      if (betFrac >= 0.55 || band === 'high') {
        return adviceOf({
          recommended: 'fold',
          reasonCode: 'FL_CALL_WEAK_VS_LARGE_LEAK',
          concepts,
          handClass,
          position: pos,
          potOdds: odds,
          spr: sprVal,
          street,
          boardTags,
          sprBand: band,
        });
      }
      if (odds <= 0.28) {
        return adviceOf({
          recommended: 'call',
          reasonCode: 'GEN_ALT_LINE_OK',
          concepts: [...concepts, 'pot-control'],
          handClass,
          position: pos,
          potOdds: odds,
          spr: sprVal,
          street,
          boardTags,
          sprBand: band,
        });
      }
      return adviceOf({
        recommended: 'fold',
        reasonCode: 'FL_CALL_WEAK_VS_LARGE_LEAK',
        concepts,
        handClass,
        position: pos,
        potOdds: odds,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }

    // air
    return adviceOf({
      recommended: 'fold',
      reasonCode: street === 'river' ? 'RV_FOLD_BEATEN_GOOD' : 'FL_FOLD_AIR_GOOD',
      concepts,
      handClass,
      position: pos,
      potOdds: odds,
      spr: sprVal,
      street,
      boardTags,
      sprBand: band,
    });
  }

  // --- Checked to us / first to act (toCall === 0) ---
  if (street === 'river') {
    if (handClass === 'nuts' || handClass === 'strongMade') {
      const s = chipSizeFromPot(input.pot, 0, 0.75, '~66–100% pot');
      return adviceOf({
        recommended: 'bet',
        reasonCode: 'RV_VALUE_BET_GOOD',
        concepts: [...concepts, 'river', 'value'],
        handClass,
        position: pos,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
        sizeRange: { min: s.min, max: s.max, label: s.label },
        sizeSpec: { min: 0.5, max: 1.0, unit: 'pot', label: s.label },
      });
    }
    if (handClass === 'air') {
      return adviceOf({
        recommended: 'check',
        reasonCode: 'RV_BLUFF_THIN_OK',
        concepts: [...concepts, 'river'],
        handClass,
        position: pos,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }
    return adviceOf({
      recommended: handClass === 'weakMade' ? 'check' : 'bet',
      reasonCode: handClass === 'weakMade' ? 'GEN_ALT_LINE_OK' : 'RV_VALUE_BET_GOOD',
      concepts,
      handClass,
      position: pos,
      spr: sprVal,
      street,
      boardTags,
      sprBand: band,
    });
  }

  if (street === 'turn') {
    if (handClass === 'nuts' || handClass === 'strongMade' || handClass === 'strongDraw') {
      if (heroIsPfr) {
        const s = chipSizeFromPot(input.pot, 0, 0.66, '~66% pot');
        return adviceOf({
          recommended: 'bet',
          reasonCode: 'TN_BARREL_VALUE_GOOD',
          concepts: [...concepts, 'barrel'],
          handClass,
          position: pos,
          spr: sprVal,
          street,
          boardTags,
          sprBand: band,
          sizeRange: { min: s.min, max: s.max, label: s.label },
          sizeSpec: { min: 0.5, max: 0.75, unit: 'pot', label: s.label },
        });
      }
    }
    if (handClass === 'air' && heroIsPfr) {
      return adviceOf({
        recommended: 'check',
        reasonCode: 'TN_BARREL_AIR_LEAK',
        concepts: [...concepts, 'give-up'],
        handClass,
        position: pos,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }
    if (handClass === 'weakMade' && isWetish(boardTags)) {
      return adviceOf({
        recommended: 'check',
        reasonCode: 'TN_SCARE_CHECK_OK',
        concepts,
        handClass,
        position: pos,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }
  }

  // Flop (and turn fallthrough) — c-bet / check
  if (multiway && (handClass === 'air' || handClass === 'weakDraw')) {
    return adviceOf({
      recommended: 'check',
      reasonCode: 'MW_TIGHTEN_GOOD',
      concepts,
      handClass,
      position: pos,
      spr: sprVal,
      street,
      boardTags,
      sprBand: band,
    });
  }

  if (heroIsPfr) {
    if (hasTag(boardTags, 'monotone') && (handClass === 'weakMade' || handClass === 'strongMade')) {
      return adviceOf({
        recommended: 'check',
        reasonCode: 'FL_CBET_MONO_LEAK',
        concepts: [...concepts, 'cbet', 'monotone'],
        handClass,
        position: pos,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }

    if (isDryish(boardTags)) {
      if (
        handClass === 'nuts' ||
        handClass === 'strongMade' ||
        handClass === 'strongDraw' ||
        handClass === 'air'
      ) {
        const frac = 0.33;
        const s = chipSizeFromPot(input.pot, 0, frac, '~33% pot');
        const code: ReasonCode =
          handClass === 'strongDraw'
            ? 'FL_CBET_DRAW_GOOD'
            : handClass === 'air'
              ? 'FL_CBET_DRY_GOOD'
              : 'FL_CBET_DRY_GOOD';
        return adviceOf({
          recommended: 'bet',
          reasonCode: code,
          concepts: [...concepts, 'cbet', 'texture'],
          handClass,
          position: pos,
          spr: sprVal,
          street,
          boardTags,
          sprBand: band,
          sizeRange: { min: s.min, max: s.max, label: s.label },
          sizeSpec: { min: 0.25, max: 0.4, unit: 'pot', label: s.label },
        });
      }
      if (handClass === 'weakMade') {
        return adviceOf({
          recommended: 'check',
          reasonCode: 'FL_CHECK_WEAK_MADE_GOOD',
          concepts: [...concepts, 'pot-control'],
          handClass,
          position: pos,
          spr: sprVal,
          street,
          boardTags,
          sprBand: band,
        });
      }
    }

    if (isWetish(boardTags)) {
      if (handClass === 'nuts' || handClass === 'strongMade' || handClass === 'strongDraw') {
        const frac = hasTag(boardTags, 'monotone') ? 0.4 : 0.66;
        const s = chipSizeFromPot(input.pot, 0, frac, `~${Math.round(frac * 100)}% pot`);
        return adviceOf({
          recommended: 'bet',
          reasonCode: handClass === 'strongDraw' ? 'FL_CBET_DRAW_GOOD' : 'FL_CBET_WET_OK',
          concepts: [...concepts, 'cbet', 'texture'],
          handClass,
          position: pos,
          spr: sprVal,
          street,
          boardTags,
          sprBand: band,
          sizeRange: { min: s.min, max: s.max, label: s.label },
          sizeSpec: { min: 0.5, max: 0.75, unit: 'pot', label: s.label },
        });
      }
      return adviceOf({
        recommended: 'check',
        reasonCode: 'FL_CBET_WET_OK',
        concepts: [...concepts, 'cbet'],
        handClass,
        position: pos,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
      });
    }

    // semiWet default
    if (handClass === 'nuts' || handClass === 'strongMade' || handClass === 'strongDraw') {
      const s = chipSizeFromPot(input.pot, 0, 0.55, '~50–66% pot');
      return adviceOf({
        recommended: 'bet',
        reasonCode: handClass === 'strongDraw' ? 'FL_CBET_DRAW_GOOD' : 'FL_CBET_DRY_GOOD',
        concepts: [...concepts, 'cbet'],
        handClass,
        position: pos,
        spr: sprVal,
        street,
        boardTags,
        sprBand: band,
        sizeRange: { min: s.min, max: s.max, label: s.label },
        sizeSpec: { min: 0.45, max: 0.7, unit: 'pot', label: s.label },
      });
    }
  }

  // Not PFR — check more; bet value with nuts
  if (handClass === 'nuts' || handClass === 'strongMade') {
    const s = chipSizeFromPot(input.pot, 0, 0.66, '~66% pot');
    return adviceOf({
      recommended: 'bet',
      reasonCode: 'FL_CHECK_NUTS_LEAK',
      concepts: [...concepts, 'value'],
      handClass,
      position: pos,
      spr: sprVal,
      street,
      boardTags,
      sprBand: band,
      sizeRange: { min: s.min, max: s.max, label: s.label },
      sizeSpec: { min: 0.5, max: 0.75, unit: 'pot', label: s.label },
    });
  }

  return adviceOf({
    recommended: 'check',
    reasonCode: 'GEN_GOOD_DEFAULT',
    concepts,
    handClass,
    position: pos,
    spr: sprVal,
    street,
    boardTags,
    sprBand: band,
  });
}

export function recommend(input: RecommendInput): CoachAdvice {
  const seatCount = input.seatCount ?? 6;
  const pos = positionForSeat(input.hero.seat, input.buttonSeat, seatCount);
  const handClass: HandClass = classifyHand(input.hole, input.board, input.street);

  if (input.street === 'preflop') {
    return recommendPreflop(input, pos, handClass);
  }

  return recommendPostflop(input, pos, handClass);
}
