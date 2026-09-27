/**
 * Pure, transport-agnostic room logic (no Workers / Node APIs).
 * The Durable Object in ./index.ts is a thin wrapper around this class:
 * it feeds socket events in and forwards `send()` calls out.
 */
import {
  applyAction,
  createInitialState,
  IllegalActionError,
  isHumanToAct,
  runBotsUntilHuman,
  setSeatOccupant,
  startHand,
  timeoutAction,
  toPublicView,
  topUpBustedStacks,
  validateAction,
  type GameState,
} from '../../src/poker/game';
import { DEFAULT_CONFIG, type ActionType, type PlayerAction } from '../../src/poker/types';
import {
  ACTION_TIMEOUT_MS,
  MAX_NAME_LENGTH,
  MIN_HUMANS_TO_START,
  PROTOCOL_VERSION,
  ROOM_IDLE_EXPIRY_MS,
  normalizeRoomCode,
  parseMessage,
  type ClientMessage,
  type ClientMessageType,
  type LobbySeat,
  type LobbyState,
  type RoomInfoResponse,
  type RoomPhase,
  type ServerErrorCode,
  type ServerMessage,
} from '../../src/multiplayer/protocol';

export interface RoomDeps {
  now(): number;
  /** Server-side RNG for shuffles (crypto-backed in the DO). */
  rng(): number;
  /** Unguessable secret (reconnect tokens). */
  randomToken(): string;
  /** Non-secret id (player ids). */
  randomId(): string;
}

export type SendFn = (connId: string, msg: ServerMessage) => void;

export interface RoomPlayer {
  playerId: string;
  name: string;
  token: string;
  seat: number | null;
  /** Socket currently bound to this player (latest wins). */
  connId: string | null;
  /** Seated while a hand was running; takes over at next deal. */
  pending: boolean;
  /** Timed out while disconnected; auto-acts instantly until they return/act. */
  sittingOut: boolean;
  /** Sent `leave`; removed when the current hand ends. */
  left: boolean;
  /** handNumber this player was last dealt into (their seat's cards are theirs). */
  dealtHand: number | null;
}

type SerializedGame = Omit<GameState, 'rng'>;

export interface RoomSnapshot {
  v: 1;
  code: string;
  created: boolean;
  hostId: string | null;
  players: RoomPlayer[];
  game: SerializedGame | null;
  turnDeadline: number | null;
  emptySince: number | null;
}

const ACTION_TYPES: ActionType[] = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];
const MAX_FRAME = 4096;

export class Room {
  code: string;
  created = false;
  hostId: string | null = null;
  players: RoomPlayer[] = [];
  game: GameState | null = null;
  turnDeadline: number | null = null;
  emptySince: number | null = null;
  /** connId -> playerId (null = connected but not joined) */
  conns = new Map<string, string | null>();

  private deps: RoomDeps;
  private send: SendFn;

  constructor(code: string, deps: RoomDeps, send: SendFn) {
    this.code = code;
    this.deps = deps;
    this.send = send;
  }

  // ───────────────────────── persistence ─────────────────────────

  snapshot(): RoomSnapshot {
    let game: SerializedGame | null = null;
    if (this.game) {
      const { rng: _rng, ...rest } = this.game;
      void _rng;
      game = rest;
    }
    return {
      v: 1,
      code: this.code,
      created: this.created,
      hostId: this.hostId,
      players: this.players.map((p) => ({ ...p })),
      game: game ? (JSON.parse(JSON.stringify(game)) as SerializedGame) : null,
      turnDeadline: this.turnDeadline,
      emptySince: this.emptySince,
    };
  }

  /**
   * Rebuild after DO hibernation/eviction. `liveConns` = sockets still open
   * (from WebSocket attachments). Players whose socket is gone are marked
   * disconnected.
   */
  static restore(
    snap: RoomSnapshot,
    deps: RoomDeps,
    send: SendFn,
    liveConns: { connId: string; playerId: string | null }[],
  ): Room {
    const r = new Room(snap.code, deps, send);
    r.created = snap.created;
    r.hostId = snap.hostId;
    r.players = snap.players.map((p) => ({ ...p }));
    r.game = snap.game ? { ...(snap.game as GameState), rng: deps.rng } : null;
    r.turnDeadline = snap.turnDeadline;
    r.emptySince = snap.emptySince;
    for (const c of liveConns) r.conns.set(c.connId, c.playerId);
    for (const p of r.players) {
      if (p.connId && !r.conns.has(p.connId)) p.connId = null;
    }
    if (r.conns.size === 0 && r.emptySince == null) r.emptySince = deps.now();
    return r;
  }

  // ───────────────────────── queries ─────────────────────────

  get phase(): RoomPhase {
    if (!this.game || this.game.handNumber === 0) return 'lobby';
    return this.game.street === 'handOver' ? 'handOver' : 'inHand';
  }

  get handRunning(): boolean {
    return this.phase === 'inHand';
  }

  get seatCount(): number {
    return DEFAULT_CONFIG.seats;
  }

  playerForConn(connId: string): RoomPlayer | null {
    const id = this.conns.get(connId);
    return id ? (this.players.find((p) => p.playerId === id) ?? null) : null;
  }

  playerAtSeat(seat: number): RoomPlayer | null {
    return this.players.find((p) => p.seat === seat && !p.left) ?? null;
  }

  isConnected(p: RoomPlayer): boolean {
    return p.connId != null && this.conns.get(p.connId) === p.playerId;
  }

  seatedHumans(): RoomPlayer[] {
    return this.players.filter((p) => p.seat != null && !p.left);
  }

  info(): RoomInfoResponse {
    return {
      code: this.code,
      exists: this.created,
      seatsFree: this.created ? this.seatCount - this.seatedHumans().length : 0,
      phase: this.phase,
    };
  }

  /** Epoch ms of the next thing the DO alarm must wake for, or null. */
  nextAlarmAt(): number | null {
    const times: number[] = [];
    if (this.turnDeadline != null) times.push(this.turnDeadline);
    if (this.emptySince != null) times.push(this.emptySince + ROOM_IDLE_EXPIRY_MS);
    return times.length ? Math.min(...times) : null;
  }

  /** True when the room has been empty long enough to be deleted. */
  isExpired(now = this.deps.now()): boolean {
    return (
      this.conns.size === 0 &&
      this.emptySince != null &&
      now >= this.emptySince + ROOM_IDLE_EXPIRY_MS
    );
  }

  // ───────────────────────── lifecycle ─────────────────────────

  /** Mark room as created (HTTP POST /api/rooms). Returns false if it already exists. */
  init(): boolean {
    if (this.created) return false;
    this.created = true;
    if (this.conns.size === 0) this.emptySince = this.deps.now();
    return true;
  }

  connect(connId: string): void {
    this.conns.set(connId, null);
    this.emptySince = null;
  }

  disconnect(connId: string): void {
    const p = this.playerForConn(connId);
    this.conns.delete(connId);
    if (this.conns.size === 0) this.emptySince = this.deps.now();
    if (p && p.connId === connId) {
      p.connId = null;
      if (!p.left) {
        this.broadcast({ type: 'playerDisconnected', playerId: p.playerId, seat: p.seat, name: p.name });
        this.broadcastLobby();
      }
    }
  }

  handleRaw(connId: string, raw: string | ArrayBuffer): void {
    if (typeof raw !== 'string' || raw.length > MAX_FRAME) {
      this.error(connId, 'badMessage', 'Expected a JSON text frame (max 4KB)');
      return;
    }
    const msg = parseMessage<ClientMessage>(raw);
    if (!msg) {
      this.error(connId, 'badMessage', 'Malformed message');
      return;
    }
    this.handleMessage(connId, msg);
  }

  handleMessage(connId: string, msg: ClientMessage): void {
    if (!this.conns.has(connId)) this.connect(connId);
    switch (msg.type) {
      case 'ping':
        this.send(connId, { type: 'pong', t: typeof msg.t === 'number' ? msg.t : undefined, serverTime: this.deps.now() });
        return;
      case 'create':
        if (this.created) {
          this.error(connId, 'roomExists', 'Room already exists — join it instead', 'create');
          return;
        }
        this.init();
        this.join(connId, { type: 'join', code: this.code, name: String(msg.name ?? '') });
        return;
      case 'join':
        this.join(connId, msg);
        return;
      default:
        break;
    }
    const player = this.playerForConn(connId);
    if (!player) {
      this.error(connId, 'notJoined', 'Send join first', msg.type);
      return;
    }
    switch (msg.type) {
      case 'takeSeat':
        this.takeSeat(connId, player, msg.seat);
        return;
      case 'standUp':
        this.standUp(connId, player);
        return;
      case 'start':
      case 'nextHand':
        this.start(connId, player, msg.type);
        return;
      case 'action':
        this.action(connId, player, msg);
        return;
      case 'leave':
        this.leave(connId, player);
        return;
      default:
        this.error(connId, 'badMessage', `Unknown message type`);
    }
  }

  /** DO alarm: enforce the action clock. */
  onAlarm(): void {
    const now = this.deps.now();
    if (this.turnDeadline != null && now >= this.turnDeadline && this.game && isHumanToAct(this.game)) {
      const seat = this.game.actingSeat;
      const p = this.playerAtSeat(seat);
      const connected = p ? this.isConnected(p) : false;
      if (p && !connected) p.sittingOut = true;
      this.autoAct(connected ? 'timeout' : 'disconnected');
      this.advance();
    } else if (this.turnDeadline != null && now >= this.turnDeadline) {
      this.turnDeadline = null;
    }
  }

  // ───────────────────────── handlers ─────────────────────────

  private join(connId: string, msg: Extract<ClientMessage, { type: 'join' }>): void {
    if (msg.v != null && msg.v !== PROTOCOL_VERSION) {
      this.error(connId, 'protocolVersion', `Server speaks protocol v${PROTOCOL_VERSION}`, 'join');
      return;
    }
    if (!this.created || normalizeRoomCode(String(msg.code ?? '')) !== this.code) {
      this.error(connId, 'roomNotFound', 'Room not found', 'join');
      return;
    }
    const current = this.playerForConn(connId);
    if (current) {
      if (msg.seatToken && msg.seatToken === current.token) {
        this.sendState(connId);
        return;
      }
      this.error(connId, 'alreadyJoined', 'This socket already joined', 'join');
      return;
    }

    if (msg.seatToken) {
      const p = this.players.find((x) => x.token === msg.seatToken && !x.left);
      if (!p) {
        this.error(connId, 'badToken', 'Seat token not recognised', 'join');
        return;
      }
      const wasConnected = this.isConnected(p);
      if (p.connId && p.connId !== connId) this.conns.set(p.connId, null); // old tab unbound
      p.connId = connId;
      p.sittingOut = false;
      this.conns.set(connId, p.playerId);
      if (!wasConnected) {
        this.broadcast({ type: 'playerReconnected', playerId: p.playerId, seat: p.seat, name: p.name }, connId);
      }
      // Give them their clock back if they were auto-acting.
      if (this.game && isHumanToAct(this.game) && this.game.actingSeat === p.seat && this.turnDeadline == null) {
        this.turnDeadline = this.deps.now() + ACTION_TIMEOUT_MS;
      }
      this.broadcastLobby();
      this.broadcastTable();
      return;
    }

    let seat: number | null = null;
    if (!msg.spectate) {
      seat = this.firstFreeSeat();
      if (seat == null) {
        this.error(connId, 'roomFull', 'All seats are taken', 'join');
        return;
      }
    }
    const p: RoomPlayer = {
      playerId: this.deps.randomId(),
      name: sanitizeName(msg.name, this.players),
      token: this.deps.randomToken(),
      seat,
      connId,
      pending: seat != null && this.handRunning,
      sittingOut: false,
      left: false,
      dealtHand: null,
    };
    this.players.push(p);
    this.conns.set(connId, p.playerId);
    if (!this.hostId || !this.players.some((x) => x.playerId === this.hostId && !x.left)) {
      this.hostId = p.playerId;
    }
    this.syncSeats();
    this.broadcastLobby();
    this.broadcastTable();
  }

  private takeSeat(connId: string, p: RoomPlayer, seat: number | undefined): void {
    if (this.handRunning) {
      this.error(connId, 'handInProgress', 'Change seats between hands', 'takeSeat');
      return;
    }
    let target: number | null;
    if (seat == null) target = p.seat ?? this.firstFreeSeat();
    else if (!Number.isInteger(seat) || seat < 0 || seat >= this.seatCount) {
      this.error(connId, 'badMessage', 'No such seat', 'takeSeat');
      return;
    } else target = seat;
    if (target == null) {
      this.error(connId, 'roomFull', 'All seats are taken', 'takeSeat');
      return;
    }
    const owner = this.playerAtSeat(target);
    if (owner && owner !== p) {
      this.error(connId, 'seatTaken', 'Seat is taken', 'takeSeat');
      return;
    }
    p.seat = target;
    p.pending = false;
    this.syncSeats();
    this.broadcastLobby();
    this.broadcastTable();
  }

  private standUp(connId: string, p: RoomPlayer): void {
    if (this.handRunning && p.seat != null && !p.pending) {
      this.error(connId, 'handInProgress', 'Stand up between hands', 'standUp');
      return;
    }
    p.seat = null;
    p.pending = false;
    this.syncSeats();
    this.broadcastLobby();
    this.broadcastTable();
  }

  private start(connId: string, p: RoomPlayer, type: ClientMessageType): void {
    const host = this.players.find((x) => x.playerId === this.hostId);
    const hostAway = !host || !this.isConnected(host);
    // Host deals; if the host is disconnected any seated human may deal.
    if (p.playerId !== this.hostId && !(hostAway && p.seat != null)) {
      this.error(connId, 'notHost', 'Only the host can deal', type);
      return;
    }
    if (this.handRunning) {
      this.error(connId, 'handInProgress', 'Hand already in progress', type);
      return;
    }
    if (this.seatedHumans().length < MIN_HUMANS_TO_START) {
      this.error(connId, 'notEnoughPlayers', `Need at least ${MIN_HUMANS_TO_START} seated players`, type);
      return;
    }
    this.deal();
  }

  private action(
    connId: string,
    p: RoomPlayer,
    msg: Extract<ClientMessage, { type: 'action' }>,
  ): void {
    if (msg.seatToken != null && msg.seatToken !== p.token) {
      this.error(connId, 'badToken', 'Seat token mismatch', 'action');
      return;
    }
    const g = this.game;
    if (!g || !this.handRunning || p.seat == null || p.pending || g.actingSeat !== p.seat) {
      this.error(connId, 'notYourTurn', 'Not your turn', 'action');
      return;
    }
    if (msg.handNumber != null && msg.handNumber !== g.handNumber) {
      this.error(connId, 'staleHand', 'That hand is over', 'action');
      return;
    }
    const a = msg.action as unknown;
    if (!a || typeof a !== 'object' || !ACTION_TYPES.includes((a as PlayerAction).type)) {
      this.error(connId, 'badMessage', 'action must be { type, amount? }', 'action');
      return;
    }
    const raw = a as PlayerAction;
    const action: PlayerAction =
      raw.type === 'bet' || raw.type === 'raise' ? { type: raw.type, amount: raw.amount } : { type: raw.type };
    const why = validateAction(g, action);
    if (why) {
      this.error(connId, 'illegalAction', why, 'action');
      return;
    }
    try {
      this.game = applyAction(g, action);
    } catch (e) {
      if (e instanceof IllegalActionError) {
        this.error(connId, 'illegalAction', e.message, 'action');
        return;
      }
      throw e;
    }
    p.sittingOut = false;
    this.advance();
  }

  private leave(connId: string, p: RoomPlayer): void {
    p.left = true;
    p.token = '';
    this.conns.set(connId, null);
    p.connId = null;
    this.broadcast({ type: 'playerLeft', playerId: p.playerId, seat: p.seat, name: p.name });
    if (this.hostId === p.playerId) {
      const next = this.players.find((x) => !x.left && x.seat != null) ?? this.players.find((x) => !x.left);
      this.hostId = next?.playerId ?? null;
    }
    const inHand =
      this.handRunning && p.seat != null && !p.pending && !this.game!.players[p.seat]!.folded;
    if (!inHand) this.removeLeft();
    this.syncSeats();
    if (this.game && isHumanToAct(this.game) && this.game.actingSeat === p.seat) {
      this.advance();
      return;
    }
    this.broadcastLobby();
    this.broadcastTable();
  }

  // ───────────────────────── game flow ─────────────────────────

  private deal(): void {
    if (!this.game) {
      const seated = this.seatedHumans();
      const names: Record<number, string> = {};
      for (const h of seated) names[h.seat!] = h.name;
      const g = createInitialState(DEFAULT_CONFIG, {
        humanSeats: seated.map((h) => h.seat!),
        names,
        rng: this.deps.rng,
      });
      // Random first button (startHand advances it by one)
      g.buttonSeat = Math.floor(this.deps.rng() * g.config.seats) % g.config.seats;
      this.game = g;
    }
    for (const p of this.players) p.pending = false;
    this.syncSeats();
    this.game = topUpBustedStacks(this.game);
    this.game = startHand(this.game, this.deps.rng);
    for (const p of this.seatedHumans()) p.dealtHand = this.game.handNumber;
    this.advance();
  }

  /** Run bots / auto-actions until a live human must act or the hand ends; then broadcast. */
  private advance(): void {
    let g = this.game!;
    let guard = 0;
    for (;;) {
      g = runBotsUntilHuman(g);
      this.game = g;
      if (!isHumanToAct(g) || guard++ > 200) break;
      const p = this.playerAtSeat(g.actingSeat);
      const connected = p ? this.isConnected(p) : false;
      if (!p || p.left) this.autoAct('left');
      else if (p.sittingOut && !connected) this.autoAct('disconnected');
      else break;
      g = this.game!;
    }
    this.turnDeadline = isHumanToAct(g) ? this.deps.now() + ACTION_TIMEOUT_MS : null;

    if (g.street === 'handOver') {
      this.turnDeadline = null;
      for (const connId of this.conns.keys()) {
        const view = toPublicView(g, this.viewerSeat(connId));
        if (view.handResult) {
          this.send(connId, { type: 'handResult', handNumber: g.handNumber, result: view.handResult });
        }
      }
      this.removeLeft();
      for (const p of this.players) p.pending = false;
      // Seat changes apply to the table between hands; keep the finished hand's
      // result visible (setSeatOccupant preserves handResult/board).
      this.syncSeats();
    }
    this.broadcastTable();
    this.broadcastLobby();
  }

  private autoAct(reason: 'timeout' | 'disconnected' | 'left'): void {
    const g = this.game!;
    const seat = g.actingSeat;
    const action = timeoutAction(g);
    const p = this.playerAtSeat(seat) ?? this.players.find((x) => x.seat === seat);
    this.game = applyAction(g, action);
    this.broadcast({
      type: 'autoAction',
      seat,
      playerId: p?.playerId ?? '',
      action: { type: action.type },
      reason,
    });
  }

  /** Between hands: mirror room seating into the engine (humans vs bots). */
  private syncSeats(): void {
    const g = this.game;
    if (!g || g.street !== 'handOver') return;
    let next = g;
    for (let s = 0; s < this.seatCount; s++) {
      const owner = this.playerAtSeat(s);
      const gp = next.players[s]!;
      if (owner) {
        if (gp.style !== 'human' || gp.name !== owner.name) {
          next = setSeatOccupant(next, s, { kind: 'human', name: owner.name });
        }
      } else if (gp.style === 'human' || gp.isHero) {
        next = setSeatOccupant(next, s, { kind: 'bot' });
      }
    }
    this.game = next;
  }

  private removeLeft(): void {
    this.players = this.players.filter((p) => !p.left);
  }

  private firstFreeSeat(): number | null {
    for (let s = 0; s < this.seatCount; s++) if (!this.playerAtSeat(s)) return s;
    return null;
  }

  // ───────────────────────── outbound ─────────────────────────

  /**
   * Seat whose PRIVATE view (hole cards, legal actions) this socket gets:
   * only a seat the player was actually dealt into this hand. null = watcher.
   */
  viewerSeat(connId: string): number | null {
    const p = this.playerForConn(connId);
    const g = this.game;
    if (!p || p.seat == null || p.pending || !g) return null;
    if (p.dealtHand !== g.handNumber) return null;
    const gp = g.players[p.seat];
    if (!gp || gp.style !== 'human') return null;
    return p.seat;
  }

  /** Table message for one socket. */
  tableFor(connId: string): Extract<ServerMessage, { type: 'table' }> | null {
    const g = this.game;
    if (!g || g.handNumber === 0) return null;
    const seat = this.viewerSeat(connId);
    const view = toPublicView(g, seat);
    const p = this.playerForConn(connId);
    let yourSeat = seat;
    if (seat == null && p && p.seat != null && !p.pending && g.street === 'handOver') {
      // Seated between hands (not dealt into the last hand): lay the table out
      // around their seat, but reveal nothing extra (watcher view).
      yourSeat = p.seat;
      view.heroSeat = p.seat;
      view.players = view.players.map((pl) => ({ ...pl, isHero: pl.seat === p.seat }));
    }
    return { type: 'table', view, yourSeat, turnDeadline: this.turnDeadline };
  }

  private sendState(connId: string): void {
    this.send(connId, this.lobbyFor(connId));
    this.sendTable(connId);
  }

  private sendTable(connId: string): void {
    const t = this.tableFor(connId);
    if (t) this.send(connId, t);
  }

  private broadcastTable(): void {
    for (const connId of this.conns.keys()) {
      if (this.conns.get(connId)) this.sendTable(connId);
    }
  }

  private broadcastLobby(): void {
    for (const connId of this.conns.keys()) {
      if (this.conns.get(connId)) this.send(connId, this.lobbyFor(connId));
    }
  }

  /** Only sockets that joined receive room events. */
  private broadcast(msg: ServerMessage, exceptConn?: string): void {
    for (const [connId, pid] of this.conns) {
      if (pid && connId !== exceptConn) this.send(connId, msg);
    }
  }

  private error(connId: string, code: ServerErrorCode, message: string, requestType?: ClientMessageType): void {
    this.send(connId, { type: 'error', code, message, requestType });
  }

  lobbyFor(connId: string): LobbyState {
    const me = this.playerForConn(connId);
    const g = this.game;
    const seats: LobbySeat[] = [];
    for (let s = 0; s < this.seatCount; s++) {
      const owner = this.playerAtSeat(s);
      const gp = g?.players[s];
      if (owner) {
        seats.push({
          seat: s,
          kind: 'human',
          playerId: owner.playerId,
          name: owner.name,
          connected: this.isConnected(owner),
          pending: owner.pending,
          stack: gp ? gp.stack : null,
        });
      } else if (gp) {
        seats.push({ seat: s, kind: gp.style === 'human' ? 'human' : 'bot', name: gp.name, stack: gp.stack });
      } else {
        seats.push({ seat: s, kind: 'empty', name: '', stack: null });
      }
    }
    return {
      type: 'lobby',
      protocolVersion: PROTOCOL_VERSION,
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      handNumber: g?.handNumber ?? 0,
      seats,
      players: this.players
        .filter((p) => !p.left)
        .map((p) => ({
          playerId: p.playerId,
          name: p.name,
          seat: p.seat,
          connected: this.isConnected(p),
          isHost: p.playerId === this.hostId,
          pending: p.pending,
          sittingOut: p.sittingOut,
        })),
      you: me
        ? { playerId: me.playerId, seat: me.seat, seatToken: me.token, isHost: me.playerId === this.hostId }
        : null,
      minHumansToStart: MIN_HUMANS_TO_START,
      config: { ...DEFAULT_CONFIG },
    };
  }
}

function sanitizeName(raw: unknown, existing: RoomPlayer[]): string {
  let name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (!name) name = `Player ${existing.length + 1}`;
  const taken = new Set(existing.filter((p) => !p.left).map((p) => p.name));
  if (taken.has(name)) {
    let i = 2;
    while (taken.has(`${name.slice(0, MAX_NAME_LENGTH - 3)} ${i}`)) i++;
    name = `${name.slice(0, MAX_NAME_LENGTH - 3)} ${i}`;
  }
  return name;
}
