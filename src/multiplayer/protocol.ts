/**
 * Shared room protocol (v1) between the Poker Coach PWA and the room server
 * (Cloudflare Worker + one Durable Object per room).
 *
 * PURE TYPES + tiny helpers only: no DOM, no React, no Node APIs, so the Worker
 * bundle can import this file as-is.
 *
 * Transport (agreed with Dealer):
 * - Base URL: `VITE_ROOM_SERVER_URL` (e.g. `https://rooms.example.workers.dev`),
 *   defaulting to `http://localhost:8787` in dev. Derive http(s) and ws(s)
 *   URLs from that one base (see {@link roomHttpUrl} / {@link roomWsUrl}).
 * - Create: `POST /api/rooms` → `200 { code }` ({@link CreateRoomResponse}). CORS on.
 * - Connect: WebSocket `GET /room/:code`. After `open`, the client MUST send
 *   `join { code, name, seatToken? }`. A valid `seatToken` reconnects that seat.
 * - The first human to join a freshly created room becomes host.
 * - All frames are JSON text, one message per frame, discriminated on `type`.
 *
 * Game config is locked for v1: 6-max, $1/$2, 100bb (200 chips). Empty seats
 * are filled with bots server-side when the host starts.
 *
 * Research: research/multiplayer-quickwin.md §2.
 */
import type { ActionType } from '../poker/types';
import type { PublicTableView } from '../poker/game';

/** Bump on any breaking change; server rejects mismatches with `error{code:'version'}`. */
export const PROTOCOL_VERSION = 1 as const;

/** Seats per table in v1. */
export const MAX_SEATS = 6 as const;

/** Room code alphabet: uppercase letters, no ambiguous chars (I, L, O). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_MIN = 4;
export const ROOM_CODE_MAX = 6;

/** Normalize user input to a room code (uppercase, strip non-alphabet). */
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
 * Optional in-socket create (alternative to `POST /api/rooms`). Server replies
 * with `lobby` for the new room. The client uses the HTTP route by default.
 */
export interface CreateMsg {
  type: 'create';
  name: string;
  v?: number;
}

/**
 * First message after the socket opens. `seatToken` (from a prior `lobby`
 * `you.seatToken`) reconnects the same player/seat, including mid-hand.
 */
export interface JoinMsg {
  type: 'join';
  code: string;
  name: string;
  seatToken?: string;
  /** PROTOCOL_VERSION the client speaks. */
  v?: number;
}

/** Claim / move to a specific seat (lobby only). Join auto-seats into the first free seat. */
export interface TakeSeatMsg {
  type: 'takeSeat';
  seat: number;
}

/** Host only: fill empty seats with bots and deal the first hand. */
export interface StartMsg {
  type: 'start';
}

/** Hero action; only accepted when `actingSeat` is the sender's seat. */
export interface ActionMsg {
  type: 'action';
  action: ActionType;
  /** Same semantics as PlayerAction.amount (total put in this street for bet/raise). */
  amount?: number;
}

/** Request the next hand after `handOver` (server may also auto-deal after intermission). */
export interface NextHandMsg {
  type: 'nextHand';
}

/** Leave the room for good (frees the seat; token becomes invalid). */
export interface LeaveMsg {
  type: 'leave';
}

/** Heartbeat. Server answers `pong`. */
export interface PingMsg {
  type: 'ping';
  t?: number;
}

export type ClientMsg =
  | CreateMsg
  | JoinMsg
  | TakeSeatMsg
  | StartMsg
  | ActionMsg
  | NextHandMsg
  | LeaveMsg
  | PingMsg;

// ───────────────────────────── Server → Client ─────────────────────────────

/** One seat in the lobby / room roster. */
export interface LobbySeat {
  seat: number;
  /** null when empty (becomes a bot at start). */
  playerId: string | null;
  name: string | null;
  isBot: boolean;
  isHost: boolean;
  /** Human's socket currently open. Bots are always `true`. */
  connected: boolean;
}

export type RoomPhase = 'lobby' | 'playing';

/**
 * Room roster, sent to each socket on join/reconnect and whenever
 * seats/host/connected flags/phase change.
 */
export interface LobbyMsg {
  type: 'lobby';
  v: number;
  code: string;
  phase: RoomPhase;
  hostId: string;
  /** Always MAX_SEATS entries, index === seat. */
  seats: LobbySeat[];
  /** Recipient identity. Persist `seatToken` to reconnect. */
  you: {
    playerId: string;
    seat: number | null;
    seatToken: string;
  };
  /** Humans needed before host may start (v1: 2). */
  minHumansToStart: number;
}

/**
 * Per-seat filtered table snapshot. Built server-side with
 * `toPublicView(state, viewerSeat)`: `heroSeat` = recipient's seat, hole cards
 * only for recipient (or showdown), `legalActions` only when the recipient acts.
 */
export interface TableMsg {
  type: 'table';
  view: PublicTableView;
}

export type ErrorCode =
  | 'version'
  | 'roomNotFound'
  | 'roomFull'
  | 'badToken'
  | 'notHost'
  | 'notYourTurn'
  | 'illegalAction'
  | 'notEnoughPlayers'
  | 'badRequest';

export interface ErrorMsg {
  type: 'error';
  code: ErrorCode;
  message: string;
}

export interface PlayerDisconnectedMsg {
  type: 'playerDisconnected';
  playerId: string;
  seat: number;
  name: string;
  /** Epoch ms until the seat is released / sat out (optional). */
  graceUntil?: number;
}

export interface PlayerReconnectedMsg {
  type: 'playerReconnected';
  playerId: string;
  seat: number;
  name: string;
}

export interface PongMsg {
  type: 'pong';
  t?: number;
}

export type ServerMsg =
  | LobbyMsg
  | TableMsg
  | ErrorMsg
  | PlayerDisconnectedMsg
  | PlayerReconnectedMsg
  | PongMsg;

/** Safe JSON parse of a frame into a message with a string `type` (no deep validation). */
export function parseMsg<T extends { type: string }>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try {
    const m = JSON.parse(raw) as unknown;
    if (m && typeof m === 'object' && typeof (m as { type?: unknown }).type === 'string') {
      return m as T;
    }
  } catch {
    /* ignore */
  }
  return null;
}
