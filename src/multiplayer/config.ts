/**
 * Client-side room config + persistence (browser only; NOT imported by the Worker).
 * Protocol shapes live in ./protocol.ts (shared with the server).
 */
import {
  normalizeRoomCode,
  roomHttpUrl as protoHttpUrl,
  roomWsUrl as protoWsUrl,
} from './protocol';

/**
 * One base URL for the room server; http(s) and ws(s) are derived from it.
 * Set VITE_ROOM_SERVER_URL for prod (e.g. https://poker-rooms.example.workers.dev).
 */
export const ROOM_SERVER_URL: string =
  (import.meta.env.VITE_ROOM_SERVER_URL as string | undefined) || 'ws://localhost:8787';

/** http(s) URL for a path on the room server (see protocol.roomHttpUrl). */
export function roomHttpUrl(path: string, base = ROOM_SERVER_URL): string {
  return protoHttpUrl(base, path);
}

/** ws(s) URL for the room socket `/room/:code` (see protocol.roomWsUrl). */
export function roomWsUrl(code: string, base = ROOM_SERVER_URL): string {
  return protoWsUrl(base, code);
}

/** `POST /api/rooms` → room code. */
export async function createRoomCode(signal?: AbortSignal): Promise<string> {
  const res = await fetch(roomHttpUrl('/api/rooms'), { method: 'POST', signal });
  if (!res.ok) throw new Error(`Create room failed (${res.status})`);
  const body = (await res.json()) as { code?: unknown };
  if (typeof body.code !== 'string' || !body.code) throw new Error('Bad create response');
  return normalizeRoomCode(body.code);
}

/** Share link on the current origin + Vite base path: `…/poker-coach/?room=CODE`. */
export function shareLinkFor(code: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base}?room=${encodeURIComponent(code)}`;
}

/** `?room=CODE` from the current URL (normalized) or null. */
export function roomCodeFromUrl(): string | null {
  const raw = new URLSearchParams(window.location.search).get('room');
  const code = raw ? normalizeRoomCode(raw) : '';
  return code || null;
}

/** Reflect the active room in the address bar (so refresh/share keep it). */
export function setRoomInUrl(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url.toString());
}

// ─────────────────────────── localStorage session ───────────────────────────

const K_SESSION = 'pc.mp.session';
const K_TOKENS = 'pc.mp.tokens';
const K_NAME = 'pc.mp.name';

export interface RoomSession {
  code: string;
  name: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/** Active room (auto-rejoin on refresh). */
export function loadSession(): RoomSession | null {
  const s = readJson<RoomSession>(K_SESSION);
  return s && typeof s.code === 'string' && typeof s.name === 'string' ? s : null;
}
export function saveSession(s: RoomSession | null): void {
  writeJson(K_SESSION, s);
  if (s) saveName(s.name);
}

/** Reconnect tokens, per room code. */
export function loadSeatToken(code: string): string | undefined {
  return readJson<Record<string, string>>(K_TOKENS)?.[code] ?? undefined;
}
export function saveSeatToken(code: string, token: string | null): void {
  const all = readJson<Record<string, string>>(K_TOKENS) ?? {};
  if (token) all[code] = token;
  else delete all[code];
  writeJson(K_TOKENS, all);
}

export function loadName(): string {
  try {
    return localStorage.getItem(K_NAME) ?? '';
  } catch {
    return '';
  }
}
export function saveName(name: string): void {
  try {
    localStorage.setItem(K_NAME, name);
  } catch {
    /* ignore */
  }
}
