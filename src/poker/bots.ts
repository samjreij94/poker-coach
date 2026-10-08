import { evaluateHand } from './evaluator';
import { outsToEquity, potOdds } from './odds';
import { positionForSeat } from './positions';
import type {
  ActionType,
  BotStyle,
  Card,
  PlayerAction,
  PlayerState,
  Street,
} from './types';

export interface BotContext {
  player: PlayerState;
  players: PlayerState[];
  board: Card[];
  street: Street;
  pot: number;
  toCall: number;
  minRaise: number;
  buttonSeat: number;
  currentBet: number;
  /** Table big blind; used to tell a real preflop raise from the blinds. */
  bigBlind?: number;
}

function holeStrength(hole: Card[]): number {
  if (hole.length < 2) return 0;
  const [a, b] = hole;
  const hi = Math.max(a!.rank, b!.rank);
  const lo = Math.min(a!.rank, b!.rank);
  const paired = a!.rank === b!.rank;
  const suited = a!.suit === b!.suit;
  let s = hi * 2 + lo;
  if (paired) s += 20;
  if (suited) s += 4;
  if (hi - lo <= 2 && !paired) s += 3; // connected
  return s; // roughly 10–50
}

function madeStrength(hole: Card[], board: Card[]): number {
  if (board.length < 3) return holeStrength(hole) / 50;
  const hand = evaluateHand([...hole, ...board]);
  const cat = hand.category;
  const map: Record<string, number> = {
    highCard: 0.15,
    pair: 0.4,
    twoPair: 0.65,
    trips: 0.8,
    straight: 0.88,
    flush: 0.9,
    fullHouse: 0.95,
    quads: 0.99,
    straightFlush: 1,
  };
  return map[cat] ?? 0.2;
}

/**
 * Rough outs for an unmade hand: flush draw 9, open-ender 8, gutshot 4, plus
 * 3 per overcard to the board. Capped at 15. Only meaningful on flop/turn.
 */
function drawOuts(hole: Card[], board: Card[]): number {
  if (board.length < 3 || board.length > 4) return 0;
  const cards = [...hole, ...board];
  let outs = 0;

  for (const suit of ['s', 'h', 'd', 'c'] as const) {
    const n = cards.filter((c) => c.suit === suit).length;
    if (n === 4 && hole.some((c) => c.suit === suit)) outs += 9;
  }

  // Straight draws: ranks (ace also low) that would complete 5 in a row,
  // counted only when a hole card is part of the run.
  const withLowAce = (r: number) => (r === 14 ? [14, 1] : [r]);
  const ranks = new Set(cards.flatMap((c) => withLowAce(c.rank)));
  const holeRanks = new Set(hole.flatMap((c) => withLowAce(c.rank)));
  const completing = new Set<number>();
  for (let low = 1; low <= 10; low++) {
    const run = [low, low + 1, low + 2, low + 3, low + 4];
    const missing = run.filter((r) => !ranks.has(r));
    if (missing.length === 1 && run.some((r) => holeRanks.has(r))) {
      completing.add(missing[0]!);
    }
  }
  if (completing.size >= 2) outs += 8;
  else if (completing.size === 1) outs += 4;

  const topBoard = Math.max(...board.map((c) => c.rank));
  outs += hole.filter((c) => c.rank > topBoard).length * 3;
  return Math.min(outs, 15);
}

/**
 * A made hand that uses the bot's own cards: pocket pair, a hole card pairing
 * the board, or a straight/flush or better. Playing a paired board with
 * nothing (e.g. A-K on 8-8-3) does not count.
 */
function hasOwnMadeHand(hole: Card[], board: Card[]): boolean {
  if (hole[0]!.rank === hole[1]!.rank) return true;
  if (hole.some((h) => board.some((b) => b.rank === h.rank))) return true;
  const cat = evaluateHand([...hole, ...board]).category;
  return (
    cat === 'straight' ||
    cat === 'flush' ||
    cat === 'fullHouse' ||
    cat === 'quads' ||
    cat === 'straightFlush'
  );
}

/** Per-style looseness: how far a bad price is tolerated before giving up. */
const GIVE_UP_SLACK: Record<BotStyle, number> = {
  tight: 0,
  lag: 0.05,
  callingStation: 0.1,
  human: 0,
};

/** Preflop hole strength (holeStrength scale) below which a raise is folded. */
const PREFLOP_RAISE_FOLD_BELOW: Record<BotStyle, number> = {
  tight: 28,
  lag: 26,
  callingStation: 24,
  human: 0,
};

/**
 * Deterministic "clearly beaten" check shared by every bot style, applied
 * before the style policy:
 * - Preflop: facing a real raise (more than the big blind to call) with an
 *   unpaired junk hand below the style's threshold.
 * - Postflop: no made hand of its own (see hasOwnMadeHand) and the
 *   draw/overcard equity is worse than the price, e.g. a missed draw facing a
 *   river bet. A made hand never folds here; the style policy decides.
 */
function clearlyBeaten(ctx: BotContext): boolean {
  if (ctx.toCall <= 0) return false;
  const hole = ctx.player.holeCards;
  if (hole.length < 2) return false;
  const style = ctx.player.style;
  const odds = potOdds(ctx.pot, ctx.toCall);

  if (ctx.street === 'preflop') {
    const bb = ctx.bigBlind ?? ctx.minRaise;
    const facingRaise = ctx.currentBet > bb && ctx.toCall > bb;
    if (!facingRaise) return false;
    if (hole[0]!.rank === hole[1]!.rank) return false;
    return holeStrength(hole) < PREFLOP_RAISE_FOLD_BELOW[style];
  }

  if (ctx.board.length < 3) return false;
  if (hasOwnMadeHand(hole, ctx.board)) return false;
  const slack = GIVE_UP_SLACK[style];
  if (ctx.board.length >= 5) {
    // Missed everything on the river: only a tiny bet keeps them in.
    return odds > 0.15 + slack;
  }
  const cardsToCome = ctx.board.length === 3 ? 2 : 1;
  const equity = outsToEquity(drawOuts(hole, ctx.board), cardsToCome);
  return equity + slack < odds;
}

function decideTight(ctx: BotContext): PlayerAction {
  const str =
    ctx.street === 'preflop'
      ? holeStrength(ctx.player.holeCards) / 50
      : madeStrength(ctx.player.holeCards, ctx.board);
  const pos = positionForSeat(ctx.player.seat, ctx.buttonSeat);
  const late = pos === 'BTN' || pos === 'CO';

  if (ctx.toCall === 0) {
    if (str > 0.7 || (late && str > 0.55)) {
      const size = Math.min(
        ctx.player.stack,
        Math.max(ctx.minRaise, Math.round(ctx.pot * 0.66)),
      );
      return size >= ctx.player.stack
        ? { type: 'allin', amount: ctx.player.stack }
        : { type: 'bet', amount: size };
    }
    return { type: 'check' };
  }

  const odds = potOdds(ctx.pot, ctx.toCall);
  if (str > 0.75) {
    if (ctx.player.stack <= ctx.toCall) return { type: 'allin', amount: ctx.player.stack };
    const raiseTo = Math.min(
      ctx.player.stack + ctx.player.betThisStreet,
      ctx.currentBet + Math.max(ctx.minRaise, Math.round(ctx.pot * 0.75)),
    );
    if (str > 0.85 && raiseTo > ctx.currentBet) {
      return { type: 'raise', amount: raiseTo - ctx.player.betThisStreet };
    }
    return { type: 'call', amount: Math.min(ctx.toCall, ctx.player.stack) };
  }
  if (str > odds + 0.1 || (str > 0.45 && odds < 0.25)) {
    return { type: 'call', amount: Math.min(ctx.toCall, ctx.player.stack) };
  }
  return { type: 'fold' };
}

function decideLag(ctx: BotContext): PlayerAction {
  const str =
    ctx.street === 'preflop'
      ? holeStrength(ctx.player.holeCards) / 50
      : madeStrength(ctx.player.holeCards, ctx.board);

  if (ctx.toCall === 0) {
    if (str > 0.35) {
      const size = Math.min(
        ctx.player.stack,
        Math.max(ctx.minRaise, Math.round(ctx.pot * (0.5 + str * 0.4))),
      );
      return size >= ctx.player.stack
        ? { type: 'allin', amount: ctx.player.stack }
        : { type: 'bet', amount: size };
    }
    return { type: 'check' };
  }

  if (str > 0.55) {
    const raiseExtra = Math.min(
      ctx.player.stack,
      Math.max(ctx.minRaise, Math.round(ctx.pot * 0.7)),
    );
    if (str > 0.65 && raiseExtra + ctx.toCall <= ctx.player.stack) {
      return { type: 'raise', amount: ctx.toCall + raiseExtra };
    }
    return { type: 'call', amount: Math.min(ctx.toCall, ctx.player.stack) };
  }
  if (str > 0.3 || potOdds(ctx.pot, ctx.toCall) < 0.3) {
    return { type: 'call', amount: Math.min(ctx.toCall, ctx.player.stack) };
  }
  return { type: 'fold' };
}

function decideCallingStation(ctx: BotContext): PlayerAction {
  const str =
    ctx.street === 'preflop'
      ? holeStrength(ctx.player.holeCards) / 50
      : madeStrength(ctx.player.holeCards, ctx.board);

  if (ctx.toCall === 0) {
    if (str > 0.8) {
      const size = Math.min(ctx.player.stack, Math.max(ctx.minRaise, Math.round(ctx.pot * 0.5)));
      return { type: 'bet', amount: size };
    }
    return { type: 'check' };
  }

  // Rarely folds; almost never raises
  if (str < 0.12 && potOdds(ctx.pot, ctx.toCall) > 0.4) {
    return { type: 'fold' };
  }
  if (ctx.toCall >= ctx.player.stack) {
    return { type: 'allin', amount: ctx.player.stack };
  }
  return { type: 'call', amount: ctx.toCall };
}

export function botAction(ctx: BotContext): PlayerAction {
  const style: BotStyle = ctx.player.style;
  if (style !== 'human' && clearlyBeaten(ctx)) {
    return { type: 'fold' };
  }
  let action: PlayerAction;
  switch (style) {
    case 'tight':
      action = decideTight(ctx);
      break;
    case 'lag':
      action = decideLag(ctx);
      break;
    case 'callingStation':
      action = decideCallingStation(ctx);
      break;
    default:
      action = { type: 'check' };
  }
  return normalizeAction(action, ctx);
}

function normalizeAction(action: PlayerAction, ctx: BotContext): PlayerAction {
  const stack = ctx.player.stack;
  if (action.type === 'fold') return { type: 'fold' };
  if (action.type === 'check') {
    if (ctx.toCall > 0) return { type: 'fold' };
    return { type: 'check' };
  }
  if (action.type === 'call') {
    const amt = Math.min(ctx.toCall, stack);
    if (amt <= 0) return { type: 'check' };
    if (amt >= stack) return { type: 'allin', amount: stack };
    return { type: 'call', amount: amt };
  }
  if (action.type === 'bet' || action.type === 'raise') {
    let putIn = action.amount ?? ctx.minRaise;
    putIn = Math.max(putIn, ctx.toCall > 0 ? ctx.toCall + ctx.minRaise : ctx.minRaise);
    putIn = Math.min(putIn, stack);
    if (putIn >= stack) return { type: 'allin', amount: stack };
    if (ctx.toCall > 0) return { type: 'raise', amount: putIn };
    return { type: 'bet', amount: putIn };
  }
  if (action.type === 'allin') {
    return { type: 'allin', amount: stack };
  }
  return { type: 'check' };
}

export type { ActionType };
