/**
 * Poker Coach multiplayer — shared client <-> room-server WebSocket protocol (v1).
 *
 * PURE TypeScript (no DOM, no React, no Node, no Workers APIs) so both the
 * Vite client (src/**) and the Cloudflare Worker (server/**) import this file.
 *
 * Transport
 *  - Base URL: `VITE_ROOM_SERVER_URL` in prod (https://<worker>.workers.dev),
 *    `http://localhost:8787` in local dev (`cd server && npm run dev`).
 *    Derive http(s)/ws(s) from the one base ({@link roomHttpUrl} / {@link roomWsUrl}).
 *  - HTTP  POST /api/rooms          -> 200 { code }                       (CORS *)
 *  - HTTP  GET  /api/rooms/:code    -> 200 { code, exists, seatsFree, phase } | 404  (CORS *)
 *  - WS    GET  /room/:code (Upgrade) — one socket per tab; JSON text frames,
 *    one message per frame, discriminated on `type`.
 *
 * Flow: connect WS -> send `join { code, name, seatToken? }`.
 *  - Without seatToken: new player, auto-seated in the first free seat
 *    (`spectate: true` to watch). If a hand is running, the seat is `pending`:
 *    the bot finishes that hand and you take over from the next deal.
 *  - With seatToken (from `lobby.you.seatToken`; keep it in localStorage per
 *    room code): reconnects that same player + seat, including mid-hand.
 *  - The first player to join a room becomes host (only host may start/nextHand).
 *    If the host leaves, host passes to the next seated human.
 *  - `create { name }` over WS is a convenience alias: initialises the room at
 *    this socket's code (if not yet created) and joins as host. HTTP create is canonical.
 *
 * Game config is locked for v1: 6-max, $1/$2, 100bb (200 chips). Seats without
 * a human are played by server-side bots. Busted stacks auto-rebuy to 100bb
 * between hands.
 *
 * All amounts are chips; bet/raise `amount` = chips put in on THIS action
 * (not "raise to"), same as the local engine's PlayerAction.
 */
import type { HandResult, PublicTableView } from '../poker/game';
import type { ActionType } from '../poker/types';

/** Bump on any breaking change; server rejects mismatches with error{code:'protocolVersion'}. */
export const PROTOCOL_VERSION = 1 as const;

/** Seats per table in v1. */
export const MAX_SEATS = 6 as const;

/** Soft action clock for humans (server auto-checks, else folds, when it expires). */
export const ACTION_TIMEOUT_MS = 30_000;
/** Empty rooms (no sockets) are deleted after this long. */
export const ROOM_IDLE_EXPIRY_MS = 2 * 60 * 60 * 1000;
export const MAX_NAME_LENGTH = 20;
/** Humans needed before the host may start (bots fill the rest). */
export const MIN_HUMANS_TO_START = 2;

/** Room code alphabet: uppercase letters, no ambiguous chars (I, L, O). Server issues 6-letter codes. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_MIN = 4;
export const ROOM_CODE_MAX = 6;
export const ROOM_CODE_LENGTH = 6;

/** Normalize user input to a room code (uppercase, strip non-alphabet, max length). */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, ROOM_CODE_MAX);
}

export function isValidRoomCode(code: string): boolean {
  return (
    code.length >= ROOM_CODE_MIN &&
    code.length <= ROOM_CODE_MAX &&
    code.split('').every((c) => ROOM_CODE_ALPHABET.includes(c))
  );
}

/** `POST /api/rooms` response body. */
export interface CreateRoomResponse {
  code: string;
}

/** `GET /api/rooms/:code` response body. */
export interface RoomInfoResponse {
  code: string;
  exists: boolean;
  seatsFree: number;
  phase: RoomPhase;
}

/** http(s) URL for a path on the room server, from one base URL (http or ws scheme). */
export function roomHttpUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '').replace(/^ws(s?):\/\//, 'http$1://');
  return `${b}${path.startsWith('/') ? path : `/${path}`}`;
}

/** ws(s) URL for the room socket `/room/:code`, from one base URL. */
export function roomWsUrl(base: string, code: string): string {
  const b = base.replace(/\/+$/, '').replace(/^http(s?):\/\//, 'ws$1://');
  return `${b}/room/${encodeURIComponent(code)}`;
}

// ───────────────────────────── Client → Server ─────────────────────────────

/**
 * Bet/raise sizing — send exactly ONE of:
 *  - `raiseTo` (preferred; what the UI shows): your street total after the
 *    action, e.g. LegalActions.minRaiseTo / minBet / quickSizes[].amount.
 *  - `amount` (engine convention): chips ADDED on this action.
 * The server converts `raiseTo` using its authoritative state. Both are
 * ignored for fold/check/call/allin.
 */
export interface ClientAction {
  type: ActionType;
  raiseTo?: number;
  amount?: number;
}

export type ClientMessage =
  | { type: 'create'; name: string; v?: number }
  | {
      type: 'join';
      code: string;
      name: string;
      /** Reconnect token from a previous lobby.you.seatToken */
      seatToken?: string;
      /** Join without taking a seat */
      spectate?: boolean;
      /** PROTOCOL_VERSION the client speaks (optional). */
      v?: number;
    }
  /** Claim/move to a seat between hands. Omit seat = first free seat. */
  | { type: 'takeSeat'; seat?: number }
  /** Give up your seat (become spectator) between hands; a bot takes it. */
  | { type: 'standUp' }
  /** Host only: deal the first hand (lobby) — or the next hand when a hand is over. */
  | { type: 'start' }
  /** Host only: deal the next hand after handOver (alias of start). */
  | { type: 'nextHand' }
  | {
      type: 'action';
      action: ClientAction;
      /** Optional extra check; if present must equal your seat token. */
      seatToken?: string;
      /** Optional staleness guard; rejected if not the current hand. */
      handNumber?: number;
    }
  /** Leave for good: seat goes to a bot (at next deal), token becomes invalid. */
  | { type: 'leave' }
  | { type: 'ping'; t?: number };

export type ClientMessageType = ClientMessage['type'];

// ───────────────────────────── Server → Client ─────────────────────────────
// Every socket receives its own filtered copy.

export type RoomPhase = 'lobby' | 'inHand' | 'handOver';

export interface LobbyPlayer {
  playerId: string;
  name: string;
  /** null = spectator */
  seat: number | null;
  connected: boolean;
  isHost: boolean;
  /** Seated mid-hand: plays from the next deal. */
  pending: boolean;
  /** Timed out while disconnected; auto-check/fold instantly until they return. */
  sittingOut: boolean;
}

export interface LobbySeat {
  seat: number;
  kind: 'human' | 'bot' | 'empty';
  /** Present when kind === 'human' */
  playerId?: string;
  /** Human display name or bot name ('' for empty seats; a bot fills it at deal time). */
  name: string;
  /** Humans only */
  connected?: boolean;
  /** Human seated mid-hand; a bot finishes the current hand in this seat. */
  pending?: boolean;
  /** Chips at this seat (null before the first deal). */
  stack: number | null;
}

export interface LobbyYou {
  playerId: string;
  seat: number | null;
  /** Secret reconnect token — store it; never shown to other clients. */
  seatToken: string;
  isHost: boolean;
}

/** Room roster: sent on join/reconnect and whenever seats/host/connected/phase change. */
export interface LobbyState {
  type: 'lobby';
  protocolVersion: typeof PROTOCOL_VERSION;
  code: string;
  phase: RoomPhase;
  hostId: string | null;
  handNumber: number;
  /** Always config.seats entries, index === seat. */
  seats: LobbySeat[];
  players: LobbyPlayer[];
  /** Recipient identity (null only for sockets that have not joined). */
  you: LobbyYou | null;
  minHumansToStart: number;
  config: { smallBlind: number; bigBlind: number; startingStack: number; seats: number };
}

export interface TableMessage {
  type: 'table';
  /**
   * toPublicView(state, yourSeat): only your own hole cards, plus non-folded
   * players' cards once a showdown is over. legalActions non-null only when you
   * are to act. view.heroSeat === yourSeat (-1 for spectators);
   * view.players[i].isHero marks YOUR seat. view.handResult heroOutcome/why are
   * already relative to you.
   */
  view: PublicTableView;
  /** Your seat in this hand; null = watching (incl. `pending` seats). */
  yourSeat: number | null;
  /** Epoch ms (server clock) when the acting human is auto-checked/folded; null if bot/none. */
  turnDeadline: number | null;
  /**
   * Server epoch ms when this frame was built. Clock-skew fix:
   * localDeadline = turnDeadline - serverNow + Date.now() (at receipt).
   */
  serverNow: number;
}

export type ServerErrorCode =
  | 'badMessage'
  | 'protocolVersion'
  | 'roomNotFound'
  | 'roomExists'
  | 'roomFull'
  | 'notJoined'
  | 'alreadyJoined'
  | 'badToken'
  | 'notHost'
  | 'notYourTurn'
  | 'illegalAction'
  | 'staleHand'
  | 'handInProgress'
  | 'seatTaken'
  | 'notEnoughPlayers';

export type ServerMessage =
  | LobbyState
  | TableMessage
  /** Sent once per hand end, filtered for the recipient (also on view.handResult). */
  | { type: 'handResult'; handNumber: number; result: HandResult }
  | { type: 'error'; code: ServerErrorCode; message: string; requestType?: ClientMessageType }
  | { type: 'playerDisconnected'; playerId: string; seat: number | null; name: string }
  | { type: 'playerReconnected'; playerId: string; seat: number | null; name: string }
  | { type: 'playerLeft'; playerId: string; seat: number | null; name: string }
  /** Server acted for an afk/disconnected/departed human; a `table` follows. */
  | {
      type: 'autoAction';
      seat: number;
      playerId: string;
      action: ClientAction;
      reason: 'timeout' | 'disconnected' | 'left';
    }
  /** `t` echoes the ping; `serverNow` = server epoch ms (`serverTime` is a deprecated alias). */
  | { type: 'pong'; t?: number; serverNow: number; serverTime: number };

export type ServerMessageType = ServerMessage['type'];

/** Safe JSON parse of a frame into a message with a string `type` (no deep validation). */
export function parseMessage<T extends { type: string }>(raw: unknown): T | null {
  try {
    const obj: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (obj && typeof obj === 'object' && typeof (obj as { type?: unknown }).type === 'string') {
      return obj as T;
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ── Aliases kept for the first committed draft of this file (87c9d4c) ──
export type ClientMsg = ClientMessage;
export type ServerMsg = ServerMessage;
export type LobbyMsg = LobbyState;
export type TableMsg = TableMessage;
export type ErrorCode = ServerErrorCode;
export const parseMsg = parseMessage;
