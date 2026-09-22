import { botAction } from './bots';
import { createDeck, shuffle } from './cards';
import { evaluateHand } from './evaluator';
import { buildPots, totalPot } from './pots';
import { positionForSeat } from './positions';
import type {
  Card,
  GameConfig,
  PlayerAction,
  PlayerState,
  Pot,
  Street,
} from './types';
import { DEFAULT_CONFIG } from './types';

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  board: Card[];
  deck: Card[];
  street: Street;
  buttonSeat: number;
  /** Seat whose turn it is; -1 if waiting / hand over */
  actingSeat: number;
  currentBet: number;
  minRaise: number;
  lastAggressorSeat: number;
  /** Seats that have voluntarily acted this betting round (blinds do not count). */
  actedThisRound: boolean[];
  pots: Pot[];
  handNumber: number;
  winners: { playerId: number; amount: number; description: string }[];
  log: string[];
  heroSeat: number;
  /** Injectable RNG (default Math.random) */
  rng: () => number;
}

export interface PublicTableView {
  street: Street;
  board: Card[];
  pot: number;
  pots: Pot[];
  currentBet: number;
  minRaise: number;
  toCall: number;
  actingSeat: number;
  buttonSeat: number;
  handNumber: number;
  players: PublicPlayerView[];
  winners: GameState['winners'];
  log: string[];
  heroSeat: number;
  legalActions: LegalActions | null;
}

export interface PublicPlayerView {
  id: number;
  name: string;
  style: PlayerState['style'];
  stack: number;
  betThisStreet: number;
  folded: boolean;
  allIn: boolean;
  isHero: boolean;
  seat: number;
  position: ReturnType<typeof positionForSeat>;
  /** Hole cards only revealed for hero, or at showdown if not folded */
  holeCards: Card[] | null;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  minBet: number;
  maxBet: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  quickSizes: { label: string; amount: number }[];
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

const BOT_NAMES = ['Tina Tight', 'Larry LAG', 'Cathy Call', 'Vic Value', 'Pam Passive'];
const BOT_STYLES: PlayerState['style'][] = [
  'tight',
  'lag',
  'callingStation',
  'tight',
  'callingStation',
];

function makePlayers(config: GameConfig, heroSeat: number): PlayerState[] {
  const players: PlayerState[] = [];
  let botIdx = 0;
  for (let seat = 0; seat < config.seats; seat++) {
    const isHero = seat === heroSeat;
    players.push({
      id: seat,
      name: isHero ? 'You' : BOT_NAMES[botIdx]!,
      style: isHero ? 'human' : BOT_STYLES[botIdx++]!,
      stack: config.startingStack,
      holeCards: [],
      betThisStreet: 0,
      totalInvested: 0,
      folded: false,
      allIn: false,
      isHero,
      seat,
    });
  }
  return players;
}

export interface CreateTableOptions {
  heroSeat?: number;
  rng?: () => number;
}

export function createInitialState(
  config: Partial<GameConfig> | GameConfig = DEFAULT_CONFIG,
  heroSeatOrOpts: number | CreateTableOptions = 3,
): GameState {
  const merged: GameConfig = { ...DEFAULT_CONFIG, ...config };
  const opts: CreateTableOptions =
    typeof heroSeatOrOpts === 'number'
      ? { heroSeat: heroSeatOrOpts }
      : heroSeatOrOpts;
  const heroSeat = opts.heroSeat ?? 3;
  return {
    config: merged,
    players: makePlayers(merged, heroSeat),
    board: [],
    deck: [],
    street: 'handOver',
    buttonSeat: 0,
    actingSeat: -1,
    currentBet: 0,
    minRaise: merged.bigBlind,
    lastAggressorSeat: -1,
    actedThisRound: Array(merged.seats).fill(false),
    pots: [],
    handNumber: 0,
    winners: [],
    log: [],
    heroSeat,
    rng: opts.rng ?? Math.random,
  };
}

function playersInHand(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.folded);
}

function canAct(p: PlayerState): boolean {
  return !p.folded && !p.allIn && p.stack > 0;
}

/** Sum of all chips invested this hand (displayed pot). */
export function streetPot(state: GameState): number {
  return state.players.reduce((s, p) => s + p.totalInvested, 0);
}

export function potTotal(state: GameState): number {
  return streetPot(state);
}

export function toCall(state: GameState, seat?: number): number {
  const s = seat ?? state.actingSeat;
  if (s < 0) return 0;
  const p = state.players[s]!;
  return Math.max(0, state.currentBet - p.betThisStreet);
}

export function currentBet(state: GameState): number {
  return state.currentBet;
}

export function minRaise(state: GameState): number {
  return state.minRaise;
}

function resetStreetBets(state: GameState): void {
  for (const p of state.players) p.betThisStreet = 0;
  state.currentBet = 0;
  state.minRaise = state.config.bigBlind;
  state.actedThisRound = Array(state.config.seats).fill(false);
}

function postBlind(state: GameState, seat: number, amount: number): void {
  const p = state.players[seat]!;
  const post = Math.min(amount, p.stack);
  p.stack -= post;
  p.betThisStreet += post;
  p.totalInvested += post;
  if (p.stack === 0) p.allIn = true;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, holeCards: [...p.holeCards] })),
    board: [...state.board],
    deck: [...state.deck],
    pots: state.pots.map((p) => ({ ...p, eligible: [...p.eligible] })),
    winners: [...state.winners],
    log: [...state.log],
    actedThisRound: [...state.actedThisRound],
    config: { ...state.config },
  };
}

export function startHand(state: GameState, rng?: () => number): GameState {
  const next = cloneState(state);
  if (rng) next.rng = rng;

  next.players = next.players.map((p) => ({
    ...p,
    holeCards: [],
    betThisStreet: 0,
    totalInvested: 0,
    folded: p.stack <= 0,
    allIn: false,
  }));
  next.board = [];
  next.winners = [];
  next.pots = [];
  next.log = [];
  next.handNumber = state.handNumber + 1;
  next.buttonSeat = (state.buttonSeat + 1) % next.config.seats;
  next.actedThisRound = Array(next.config.seats).fill(false);

  // Skip busted players for button
  let guard = 0;
  while (
    next.players[next.buttonSeat]!.stack <= 0 &&
    guard < next.config.seats
  ) {
    next.buttonSeat = (next.buttonSeat + 1) % next.config.seats;
    guard++;
  }

  const withChips = next.players.filter((p) => p.stack > 0);
  if (withChips.length < 2) {
    next.street = 'handOver';
    next.actingSeat = -1;
    next.log.push('Not enough players with chips. Reset stacks.');
    return next;
  }

  for (const p of next.players) {
    if (p.stack <= 0) p.folded = true;
  }

  next.deck = shuffle(createDeck(), next.rng);
  next.street = 'preflop';

  const sbSeat = nextSeatWithChips(next, next.buttonSeat);
  const bbSeat = nextSeatWithChips(next, sbSeat);
  postBlind(next, sbSeat, next.config.smallBlind);
  postBlind(next, bbSeat, next.config.bigBlind);
  next.currentBet = Math.max(
    next.players[sbSeat]!.betThisStreet,
    next.players[bbSeat]!.betThisStreet,
  );
  next.minRaise = next.config.bigBlind;
  next.lastAggressorSeat = bbSeat;
  // Blinds are not voluntary actions — BB retains option if limped to

  // Deal hole cards starting left of button
  for (let i = 0; i < 2; i++) {
    for (let s = 0; s < next.config.seats; s++) {
      const seat = (next.buttonSeat + 1 + s) % next.config.seats;
      const p = next.players[seat]!;
      if (!p.folded) {
        p.holeCards.push(next.deck.pop()!);
      }
    }
  }

  next.log.push(
    `Hand #${next.handNumber} — BTN seat ${next.buttonSeat}. Blinds posted.`,
  );

  // First to act preflop: left of BB (UTG in 6-max)
  next.actingSeat = nextActiveSeat(next, bbSeat);
  if (next.actingSeat < 0) {
    return advanceStreet(next);
  }
  return next;
}

function nextSeatWithChips(state: GameState, fromSeat: number): number {
  for (let i = 1; i <= state.config.seats; i++) {
    const s = (fromSeat + i) % state.config.seats;
    if (state.players[s]!.stack > 0 && !state.players[s]!.folded) return s;
  }
  return (fromSeat + 1) % state.config.seats;
}

/**
 * Next player who still needs to act this betting round.
 * Needs action if: can act AND (behind the current bet OR has not acted yet).
 */
function findNextActor(state: GameState, fromSeat: number): number {
  for (let i = 1; i <= state.config.seats; i++) {
    const s = (fromSeat + i) % state.config.seats;
    const p = state.players[s]!;
    if (!canAct(p)) continue;
    if (p.betThisStreet < state.currentBet) return s;
    if (!state.actedThisRound[s]) return s;
  }
  return -1;
}

function dealBoard(state: GameState, n: number): void {
  state.deck.pop(); // burn
  for (let i = 0; i < n; i++) {
    state.board.push(state.deck.pop()!);
  }
}

function advanceStreet(state: GameState): GameState {
  state.pots = buildPots(state.players);
  resetStreetBets(state);

  const alive = playersInHand(state);
  if (alive.length <= 1) {
    return awardPots(state);
  }

  const canStillBet = alive.filter((p) => !p.allIn && p.stack > 0);

  const runOutAndShowdown = (): GameState => {
    while (state.board.length < 5) {
      if (state.board.length === 0) dealBoard(state, 3);
      else dealBoard(state, 1);
    }
    state.street = 'showdown';
    return awardPots(state);
  };

  // If ≤1 player can still bet, run out remaining board
  if (canStillBet.length <= 1) {
    return runOutAndShowdown();
  }

  if (state.street === 'preflop') {
    dealBoard(state, 3);
    state.street = 'flop';
  } else if (state.street === 'flop') {
    dealBoard(state, 1);
    state.street = 'turn';
  } else if (state.street === 'turn') {
    dealBoard(state, 1);
    state.street = 'river';
  } else if (state.street === 'river') {
    state.street = 'showdown';
    return awardPots(state);
  }

  // First to act postflop: left of button
  const first = nextActiveSeat(state, state.buttonSeat);
  state.lastAggressorSeat = first;
  state.actingSeat = first;
  state.actedThisRound = Array(state.config.seats).fill(false);
  state.log.push(`--- ${state.street.toUpperCase()} ---`);

  if (first < 0 || canStillBet.length <= 1) {
    return runOutAndShowdown();
  }

  return state;
}

function nextActiveSeat(state: GameState, fromSeat: number): number {
  for (let i = 1; i <= state.config.seats; i++) {
    const s = (fromSeat + i) % state.config.seats;
    if (canAct(state.players[s]!)) return s;
  }
  return -1;
}

function awardPots(state: GameState): GameState {
  state.pots = buildPots(state.players);
  state.winners = [];
  state.actingSeat = -1;

  const alive = playersInHand(state);
  if (alive.length === 1) {
    const w = alive[0]!;
    const amt = totalPot(state.pots);
    w.stack += amt;
    state.winners.push({
      playerId: w.id,
      amount: amt,
      description: `${w.name} wins $${amt} (others folded)`,
    });
    state.log.push(state.winners[0]!.description);
    state.street = 'handOver';
    state.pots = [];
    for (const p of state.players) {
      p.totalInvested = 0;
      p.betThisStreet = 0;
    }
    return state;
  }

  // Showdown — ensure full board
  if (state.board.length < 5) {
    while (state.board.length < 5) {
      if (state.board.length === 0) dealBoard(state, 3);
      else dealBoard(state, 1);
    }
  }

  for (const pot of state.pots) {
    const elig = pot.eligible
      .map((id) => state.players.find((p) => p.id === id)!)
      .filter((p) => p && !p.folded);
    if (elig.length === 0) continue;

    let bestVal = -1;
    let winners: PlayerState[] = [];
    for (const p of elig) {
      const hr = evaluateHand([...p.holeCards, ...state.board]);
      if (hr.rankValue > bestVal) {
        bestVal = hr.rankValue;
        winners = [p];
      } else if (hr.rankValue === bestVal) {
        winners.push(p);
      }
    }
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const w of winners) {
      let get = share;
      if (remainder > 0) {
        get += 1;
        remainder -= 1;
      }
      w.stack += get;
      const hr = evaluateHand([...w.holeCards, ...state.board]);
      state.winners.push({
        playerId: w.id,
        amount: get,
        description: `${w.name} wins $${get} with ${hr.description}`,
      });
      state.log.push(state.winners[state.winners.length - 1]!.description);
    }
  }

  state.street = 'handOver';
  state.pots = [];
  for (const p of state.players) {
    p.totalInvested = 0;
    p.betThisStreet = 0;
  }
  return state;
}

/**
 * amount on bet/raise/allin = chips put in on this action (not "raise to").
 * Throws IllegalActionError for clearly illegal moves.
 */
export function applyAction(state: GameState, action: PlayerAction): GameState {
  if (state.actingSeat < 0 || state.street === 'handOver') {
    throw new IllegalActionError('No player to act');
  }
  const next = cloneState(state);
  const actor = next.players[next.actingSeat]!;
  if (!canAct(actor)) {
    throw new IllegalActionError(`${actor.name} cannot act`);
  }

  const callAmt = Math.max(0, next.currentBet - actor.betThisStreet);
  const act = action;

  if (act.type === 'fold') {
    if (callAmt === 0) {
      throw new IllegalActionError('Cannot fold facing no bet (check instead)');
    }
    actor.folded = true;
    next.actedThisRound[actor.seat] = true;
    next.log.push(`${actor.name} folds`);
  } else if (act.type === 'check') {
    if (callAmt > 0) {
      throw new IllegalActionError('Cannot check facing a bet');
    }
    next.actedThisRound[actor.seat] = true;
    next.log.push(`${actor.name} checks`);
  } else if (act.type === 'call') {
    if (callAmt === 0) {
      throw new IllegalActionError('Nothing to call (check instead)');
    }
    const amt = Math.min(callAmt, actor.stack);
    actor.stack -= amt;
    actor.betThisStreet += amt;
    actor.totalInvested += amt;
    if (actor.stack === 0) actor.allIn = true;
    next.actedThisRound[actor.seat] = true;
    next.log.push(`${actor.name} calls $${amt}`);
  } else if (act.type === 'bet' || act.type === 'raise' || act.type === 'allin') {
    let putIn = act.amount ?? actor.stack;
    if (act.type === 'allin') putIn = actor.stack;
    putIn = Math.floor(putIn);

    if (putIn <= 0) {
      throw new IllegalActionError('Bet amount must be positive');
    }
    if (putIn > actor.stack) {
      throw new IllegalActionError('Cannot bet more than stack');
    }

    const isAllIn = putIn === actor.stack;
    const newBet = actor.betThisStreet + putIn;
    const raiseBy = newBet - next.currentBet;

    if (callAmt === 0) {
      // Opening bet
      if (act.type === 'raise') {
        throw new IllegalActionError('Cannot raise when there is no bet');
      }
      const minBet = next.config.bigBlind;
      if (!isAllIn && putIn < minBet) {
        throw new IllegalActionError(`Min bet is $${minBet}`);
      }
    } else {
      // Facing a bet — must at least call; raise must meet minRaise unless all-in
      if (putIn < callAmt && !isAllIn) {
        throw new IllegalActionError(`Must put in at least $${callAmt} to call`);
      }
      if (newBet > next.currentBet) {
        if (!isAllIn && raiseBy < next.minRaise) {
          throw new IllegalActionError(
            `Min raise is $${next.minRaise} (raise to at least $${next.currentBet + next.minRaise})`,
          );
        }
      } else if (putIn < callAmt) {
        // short all-in call already handled via isAllIn
      } else if (newBet <= next.currentBet && act.type !== 'allin' && putIn === callAmt) {
        // treat as call via bet/raise amount equal to call — allow as call-equivalent
      }
    }

    if (newBet > next.currentBet) {
      const actualRaise = newBet - next.currentBet;
      if (actualRaise >= next.minRaise || isAllIn) {
        if (actualRaise >= next.minRaise) {
          next.minRaise = actualRaise;
        }
      }
      next.currentBet = newBet;
      next.lastAggressorSeat = actor.seat;
      // New aggression: clear acted flags except aggressor
      next.actedThisRound = Array(next.config.seats).fill(false);
    }
    next.actedThisRound[actor.seat] = true;

    actor.stack -= putIn;
    actor.betThisStreet += putIn;
    actor.totalInvested += putIn;
    if (actor.stack === 0) actor.allIn = true;

    const label =
      act.type === 'allin' || actor.allIn
        ? 'all-in'
        : callAmt > 0
          ? 'raises to'
          : 'bets';
    next.log.push(
      `${actor.name} ${label} $${actor.betThisStreet}${actor.allIn ? ' (all-in)' : ''}`,
    );
  } else {
    throw new IllegalActionError(`Unknown action type`);
  }

  if (playersInHand(next).length <= 1) {
    return awardPots(next);
  }

  const nextActor = findNextActor(next, next.actingSeat);
  if (nextActor < 0) {
    return advanceStreet(next);
  }
  next.actingSeat = nextActor;
  return next;
}

/** Auto-play bot seats until hero must act or hand ends. */
export function runBotsUntilHero(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (
    s.actingSeat >= 0 &&
    s.street !== 'handOver' &&
    !s.players[s.actingSeat]!.isHero &&
    guard++ < 200
  ) {
    const actor = s.players[s.actingSeat]!;
    const callAmt = Math.max(0, s.currentBet - actor.betThisStreet);
    const action = botAction({
      player: actor,
      players: s.players,
      board: s.board,
      street: s.street,
      pot: streetPot(s),
      toCall: callAmt,
      minRaise: s.minRaise,
      buttonSeat: s.buttonSeat,
      currentBet: s.currentBet,
    });
    try {
      s = applyAction(s, action);
    } catch {
      // Bot produced illegal action — fall back to safe default
      const fallback: PlayerAction =
        callAmt > 0
          ? callAmt >= actor.stack
            ? { type: 'allin', amount: actor.stack }
            : { type: 'call', amount: callAmt }
          : { type: 'check' };
      s = applyAction(s, fallback);
    }
  }
  return s;
}

/**
 * Headless full-hand runner: every seat (including hero) uses botAction
 * until handOver. Useful for B3 smoke tests.
 */
export function runHandWithBots(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.actingSeat >= 0 && s.street !== 'handOver' && guard++ < 500) {
    const actor = s.players[s.actingSeat]!;
    const callAmt = Math.max(0, s.currentBet - actor.betThisStreet);
    // Temporarily treat human as tight for headless play
    const botPlayer =
      actor.style === 'human' ? { ...actor, style: 'tight' as const } : actor;
    const action = botAction({
      player: botPlayer,
      players: s.players,
      board: s.board,
      street: s.street,
      pot: streetPot(s),
      toCall: callAmt,
      minRaise: s.minRaise,
      buttonSeat: s.buttonSeat,
      currentBet: s.currentBet,
    });
    try {
      s = applyAction(s, action);
    } catch {
      const fallback: PlayerAction =
        callAmt > 0
          ? callAmt >= actor.stack
            ? { type: 'allin', amount: actor.stack }
            : { type: 'call', amount: callAmt }
          : { type: 'check' };
      s = applyAction(s, fallback);
    }
  }
  return s;
}

export function resetStacks(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      stack: state.config.startingStack,
      holeCards: [],
      betThisStreet: 0,
      totalInvested: 0,
      folded: false,
      allIn: false,
    })),
    street: 'handOver',
    actingSeat: -1,
    board: [],
    pots: [],
    winners: [],
    actedThisRound: Array(state.config.seats).fill(false),
    log: ['Stacks reset to 100bb.'],
  };
}

export function getLegalActions(state: GameState): LegalActions | null {
  if (state.actingSeat < 0) return null;
  const actor = state.players[state.actingSeat]!;
  if (!canAct(actor)) return null;
  const callAmt = Math.max(0, state.currentBet - actor.betThisStreet);
  const pot = streetPot(state);
  const minBet = state.config.bigBlind;
  const minRaiseTo = state.currentBet + state.minRaise;
  const maxPut = actor.stack;

  const quickSizes: { label: string; amount: number }[] = [];
  const fracs: [string, number][] = [
    ['⅓ pot', 1 / 3],
    ['½ pot', 0.5],
    ['⅔ pot', 2 / 3],
    ['pot', 1],
  ];
  for (const [label, f] of fracs) {
    let amount: number;
    if (callAmt === 0) {
      amount = Math.max(minBet, Math.round(pot * f));
    } else {
      amount = callAmt + Math.max(state.minRaise, Math.round((pot + callAmt) * f));
    }
    amount = Math.min(amount, maxPut);
    if (
      (amount > callAmt &&
        amount >= (callAmt === 0 ? minBet : callAmt + state.minRaise)) ||
      amount === maxPut
    ) {
      quickSizes.push({ label, amount });
    }
  }
  if (maxPut > 0) {
    quickSizes.push({ label: 'All-in', amount: maxPut });
  }

  return {
    canFold: callAmt > 0,
    canCheck: callAmt === 0,
    canCall: callAmt > 0 && callAmt < actor.stack,
    callAmount: Math.min(callAmt, actor.stack),
    canBet: callAmt === 0 && actor.stack > 0,
    canRaise: callAmt > 0 && actor.stack > callAmt,
    minBet,
    maxBet: maxPut,
    minRaiseTo: Math.min(minRaiseTo, actor.betThisStreet + maxPut),
    maxRaiseTo: actor.betThisStreet + maxPut,
    quickSizes,
  };
}

export function toPublicView(state: GameState, revealAll = false): PublicTableView {
  const pot = streetPot(state);
  const hero = state.actingSeat >= 0 ? state.players[state.actingSeat] : undefined;
  const callAmt =
    state.actingSeat >= 0
      ? Math.max(0, state.currentBet - state.players[state.actingSeat]!.betThisStreet)
      : 0;

  return {
    street: state.street,
    board: state.board,
    pot,
    pots: buildPots(state.players),
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    toCall: callAmt,
    actingSeat: state.actingSeat,
    buttonSeat: state.buttonSeat,
    handNumber: state.handNumber,
    winners: state.winners,
    log: state.log.slice(-12),
    heroSeat: state.heroSeat,
    legalActions:
      state.actingSeat >= 0 && hero?.isHero ? getLegalActions(state) : null,
    players: state.players.map((p) => {
      const showCards =
        p.isHero ||
        revealAll ||
        (state.street === 'handOver' && !p.folded && state.winners.length > 0);
      return {
        id: p.id,
        name: p.name,
        style: p.style,
        stack: p.stack,
        betThisStreet: p.betThisStreet,
        folded: p.folded,
        allIn: p.allIn,
        isHero: p.isHero,
        seat: p.seat,
        position: positionForSeat(p.seat, state.buttonSeat, state.config.seats),
        holeCards: showCards ? p.holeCards : null,
      };
    }),
  };
}
