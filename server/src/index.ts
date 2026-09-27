/**
 * Poker Coach room server — Cloudflare Worker + one Durable Object per room.
 *
 * Routes
 *   POST /api/rooms          -> { code }            create a room (CORS)
 *   GET  /api/rooms/:code    -> RoomInfoResponse    (CORS; 404 if unknown)
 *   GET  /room/:code         -> WebSocket upgrade into that room's DO
 *   GET  /health             -> "ok"
 *
 * The DO uses the WebSocket Hibernation API (ctx.acceptWebSocket) and persists
 * the whole room to DO storage after every event so a hibernated/evicted DO
 * rebuilds its state from storage + socket attachments. Action clock = DO alarm.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ServerMessage,
} from '../../src/multiplayer/protocol';
import { corsHeaders, clientIp, json, originAllowed, rateLimit, tooMany } from './http';
import { Room, type RoomDeps, type RoomSnapshot } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  /**
   * Comma-separated browser origins allowed for CORS and WebSocket upgrades
   * (e.g. "https://samjreij94.github.io,http://localhost:5173"). "*" = any.
   * Requests without an Origin header (non-browser tools) are allowed.
   */
  ALLOWED_ORIGINS?: string;
}

interface Attachment {
  connId: string;
  playerId: string | null;
}

const STORAGE_KEY = 'room';

function cryptoRng(): number {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  // 53-bit uniform float in [0, 1)
  return (b[0]! * 2 ** 21 + (b[1]! >>> 11)) / 2 ** 53;
}

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function generateRoomCode(): string {
  const b = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(b);
  let out = '';
  for (const x of b) out += ROOM_CODE_ALPHABET[x % ROOM_CODE_ALPHABET.length];
  return out;
}

const deps: RoomDeps = {
  now: () => Date.now(),
  rng: cryptoRng,
  randomToken: () => randomHex(24), // 192-bit reconnect secret
  randomId: () => randomHex(8),
};

function stubFor(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    }
    if (path === '/health' || path === '/') {
      return new Response('ok', { headers: corsHeaders(req, env) });
    }

    if (!originAllowed(req, env)) {
      return json(req, env, { error: 'Origin not allowed' }, 403);
    }

    if (path === '/api/rooms' && req.method === 'POST') {
      if (!rateLimit('create', clientIp(req))) return tooMany(req, env);
      for (let i = 0; i < 8; i++) {
        const code = generateRoomCode();
        const res = await stubFor(env, code).fetch('https://room/init', {
          method: 'POST',
          headers: { 'x-room-code': code },
        });
        if (res.status === 200) return json(req, env, { code });
      }
      return json(req, env, { error: 'Could not allocate a room code' }, 503);
    }

    const info = path.match(/^\/api\/rooms\/([^/]+)$/);
    if (info && req.method === 'GET') {
      if (!rateLimit('join', clientIp(req))) return tooMany(req, env);
      const code = normalizeRoomCode(decodeURIComponent(info[1]!));
      if (!isValidRoomCode(code)) return json(req, env, { error: 'Bad room code' }, 400);
      const res = await stubFor(env, code).fetch('https://room/info', { headers: { 'x-room-code': code } });
      return json(req, env, await res.json(), res.status);
    }

    const ws = path.match(/^\/room\/([^/]+)$/);
    if (ws) {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return json(req, env, { error: 'Expected WebSocket upgrade' }, 426);
      }
      if (!rateLimit('join', clientIp(req))) return tooMany(req, env);
      const code = normalizeRoomCode(decodeURIComponent(ws[1]!));
      if (!isValidRoomCode(code)) return json(req, env, { error: 'Bad room code' }, 400);
      const headers = new Headers(req.headers);
      headers.set('x-room-code', code);
      return stubFor(env, code).fetch(new Request('https://room/ws', { headers }));
    }

    return json(req, env, { error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const snap = await ctx.storage.get<RoomSnapshot>(STORAGE_KEY);
      if (snap) {
        const live = ctx.getWebSockets().map((w) => w.deserializeAttachment() as Attachment);
        this.room = Room.restore(snap, deps, this.sendTo, live);
      }
    });
  }

  private sendTo = (connId: string, msg: ServerMessage): void => {
    for (const w of this.ctx.getWebSockets(connId)) {
      try {
        w.send(JSON.stringify(msg));
      } catch {
        /* socket closing */
      }
    }
  };

  private ensureRoom(code: string): Room {
    if (!this.room) this.room = new Room(code, deps, this.sendTo);
    return this.room;
  }

  /** Persist state, refresh socket attachments, and (re)arm the alarm. */
  private async commit(): Promise<void> {
    const room = this.room;
    if (!room) return;
    for (const w of this.ctx.getWebSockets()) {
      const att = w.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      const pid = room.conns.get(att.connId) ?? null;
      if (pid !== att.playerId) w.serializeAttachment({ ...att, playerId: pid });
    }
    if (room.created) await this.ctx.storage.put(STORAGE_KEY, room.snapshot());
    const at = room.nextAlarmAt();
    if (at == null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(at, Date.now() + 50));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = req.headers.get('x-room-code') ?? '';

    if (url.pathname === '/init') {
      const room = this.ensureRoom(code);
      if (!room.init()) return new Response('exists', { status: 409 });
      await this.commit();
      return new Response('ok');
    }

    if (url.pathname === '/info') {
      const room = this.room;
      if (!room?.created) {
        return Response.json({ code, exists: false, seatsFree: 0, phase: 'lobby' }, { status: 404 });
      }
      return Response.json(room.info());
    }

    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      const connId = crypto.randomUUID();
      this.ctx.acceptWebSocket(server, [connId]);
      server.serializeAttachment({ connId, playerId: null } satisfies Attachment);
      this.ensureRoom(code).connect(connId);
      await this.commit();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;
    const room = this.room;
    if (!room || !att) return;
    room.handleRaw(att.connId, message);
    await this.commit();
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att && this.room) {
      this.room.disconnect(att.connId);
      await this.commit();
    }
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye');
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att && this.room) {
      this.room.disconnect(att.connId);
      await this.commit();
    }
  }

  async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    if (room.isExpired()) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    room.onAlarm();
    await this.commit();
  }
}
