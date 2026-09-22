import { evaluateHand } from './evaluator';
import { potOdds } from './odds';
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
