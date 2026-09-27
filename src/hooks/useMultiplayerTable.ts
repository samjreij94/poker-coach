import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gradeAction, recommend, recommendInputFromView } from '../coach';
import type { CoachAdvice, CoachGrade, PlayerAction } from '../poker';
import { positionForSeat } from '../poker/positions';
import type { HandResult, PublicTableView } from '../poker/game';
import {
  loadSeatToken,
  roomWsUrl,
  saveSeatToken,
} from '../multiplayer/config';
import {
  parseMessage,
  type ClientMessage,
  type LobbyState,
  type ServerErrorCode,
  type ServerMessage,
} from '../multiplayer/protocol';
import type { PokerCoachApi } from './usePokerCoach';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface RoomNotice {
  id: number;
  kind: 'disconnected' | 'reconnected' | 'left' | 'auto';
  playerId?: string;
  name: string;
  at: number;
}

export interface MultiplayerTableApi extends Omit<PokerCoachApi, 'state'> {
  /** True once the server has pushed a real `table` for this room. */
  hasTable: boolean;
  status: ConnStatus;
  lobby: LobbyState | null;
  code: string;
  isHost: boolean;
  /** Your seat (null = spectator / not yet seated). */
  yourSeat: number | null;
  turnDeadline: number | null;
  /** Last server error (cleared on next successful lobby). */
  error: { code: ServerErrorCode | 'network'; message: string } | null;
  /** Fatal: room gone / cannot join — UI should return to lobby. */
  fatal: boolean;
  /** Other players' disconnects (latest first; `disconnected` ones stay until they return). */
  notices: RoomNotice[];
  /** Humans currently disconnected (from lobby roster). */
  disconnectedNames: string[];
  start: () => void;
  takeSeat: (seat?: number) => void;
  leave: () => void;
}

const PING_MS = 25_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 10_000;

/** Seat placeholder view (before the first `table` arrives) built from the lobby roster. */
function viewFromLobby(lobby: LobbyState | null): PublicTableView {
  const seats = lobby?.config.seats ?? 6;
  const heroSeat = lobby?.you?.seat ?? 0;
  return {
    street: 'handOver',
    board: [],
    pot: 0,
    pots: [],
    currentBet: 0,
    minRaise: lobby?.config.bigBlind ?? 2,
    toCall: 0,
    actingSeat: -1,
    buttonSeat: 0,
    handNumber: lobby?.handNumber ?? 0,
    winners: [],
    handResult: null,
    log: [],
    heroSeat,
    legalActions: null,
    players: Array.from({ length: seats }, (_, i) => {
      const s = lobby?.seats[i];
      return {
        id: i,
        name: s?.name || (s?.kind === 'empty' || !s ? 'Open seat' : `Seat ${i + 1}`),
        style: s?.kind === 'human' ? 'human' : 'tight',
        stack: s?.stack ?? lobby?.config.startingStack ?? 200,
        betThisStreet: 0,
        folded: false,
        allIn: false,
        isHero: i === heroSeat,
        seat: i,
        position: positionForSeat(i, 0, seats),
        holeCards: null,
      };
    }),
  };
}

/** Recompute heroOutcome from the recipient's seat so the splash is always per-viewer. */
function perViewerResult(r: HandResult | null, heroSeat: number): HandResult | null {
  if (!r) return r;
  const heroWon = r.winners.some((w) => w.seat === heroSeat);
  const heroOutcome = !heroWon ? 'lose' : r.winners.length > 1 ? 'split' : 'win';
  return heroOutcome === r.heroOutcome ? r : { ...r, heroOutcome };
}

/**
 * Room-mode twin of usePokerCoach: same surface (view / advice / lastGrade /
 * coach toggle / newHand / heroAct) backed by the room server over WebSocket.
 *
 * - Sends `join { code, name, seatToken? }` on every (re)connect; persists
 *   `lobby.you.seatToken` per room in localStorage → refresh = auto-rejoin.
 * - Auto-reconnects with exponential backoff on socket close.
 * - Coach is client-only, computed from the hero's filtered view; OFF by default.
 */
export function useMultiplayerTable(code: string, name: string): MultiplayerTableApi {
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [tableView, setTableView] = useState<PublicTableView | null>(null);
  const [yourSeatFromTable, setYourSeatFromTable] = useState<number | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<{ hand: number; result: HandResult } | null>(null);
  const [error, setError] = useState<MultiplayerTableApi['error']>(null);
  const [fatal, setFatal] = useState(false);
  const [notices, setNotices] = useState<RoomNotice[]>([]);
  const [coachEnabled, setCoachEnabled] = useState(false);
  const [lastGrade, setLastGrade] = useState<CoachGrade | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const leavingRef = useRef(false);
  const fatalRef = useRef(false);
  const noticeId = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const pushNotice = useCallback((n: Omit<RoomNotice, 'id' | 'at'>) => {
    setNotices((prev) => {
      const rest = n.playerId ? prev.filter((p) => p.playerId !== n.playerId) : prev;
      return [{ ...n, id: ++noticeId.current, at: Date.now() }, ...rest].slice(0, 5);
    });
  }, []);

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'lobby':
          attemptRef.current = 0;
          setLobby(msg);
          setError(null);
          if (msg.you?.seatToken) saveSeatToken(msg.code, msg.you.seatToken);
          if (msg.phase === 'lobby') setTableView(null);
          break;
        case 'table':
          setTableView(msg.view);
          setYourSeatFromTable(msg.yourSeat);
          setTurnDeadline(msg.turnDeadline);
          break;
        case 'handResult':
          setLastResult({ hand: msg.handNumber, result: msg.result });
          break;
        case 'error':
          setError({ code: msg.code, message: msg.message });
          if (msg.code === 'badToken') {
            // Seat no longer ours: forget token, rejoin as a new player.
            saveSeatToken(code, null);
            send({ type: 'join', code, name });
          } else if (
            msg.code === 'roomNotFound' ||
            msg.code === 'roomFull' ||
            msg.code === 'protocolVersion'
          ) {
            fatalRef.current = true;
            setFatal(true);
            wsRef.current?.close();
          }
          break;
        case 'playerDisconnected':
          pushNotice({ kind: 'disconnected', playerId: msg.playerId, name: msg.name });
          break;
        case 'playerReconnected':
          pushNotice({ kind: 'reconnected', playerId: msg.playerId, name: msg.name });
          break;
        case 'playerLeft':
          pushNotice({ kind: 'left', playerId: msg.playerId, name: msg.name });
          break;
        case 'autoAction':
        case 'pong':
          break;
      }
    },
    [code, name, pushNotice, send],
  );

  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const scheduleReconnect = useCallback(() => {
    if (leavingRef.current || fatalRef.current) return;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    const n = attemptRef.current++;
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** n) * (0.8 + Math.random() * 0.4);
    reconnectTimer.current = setTimeout(() => connectRef.current(), delay);
  }, []);

  const connect = useCallback(() => {
    if (leavingRef.current || fatalRef.current) return;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    const prev = wsRef.current;
    if (prev && (prev.readyState === WebSocket.OPEN || prev.readyState === WebSocket.CONNECTING)) {
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(roomWsUrl(code));
    } catch {
      setStatus('reconnecting');
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;
    let ping: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      setStatus('open');
      const seatToken = loadSeatToken(code);
      ws.send(
        JSON.stringify({
          type: 'join',
          code,
          name,
          ...(seatToken ? { seatToken } : {}),
        } satisfies ClientMessage),
      );
      ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', t: Date.now() } satisfies ClientMessage));
        }
      }, PING_MS);
    };
    ws.onmessage = (ev) => {
      const msg = parseMessage<ServerMessage>(ev.data);
      if (msg) onMessageRef.current(msg);
    };
    ws.onclose = () => {
      if (ping) clearInterval(ping);
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (leavingRef.current || fatalRef.current) {
        setStatus('closed');
        return;
      }
      setStatus('reconnecting');
      scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }, [code, name, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    leavingRef.current = false;
    fatalRef.current = false;
    attemptRef.current = 0;
    connect();
    // Wake-ups: reconnect immediately when the tab returns / network comes back.
    const wake = () => {
      if (document.visibilityState === 'visible' && !wsRef.current) {
        attemptRef.current = 0;
        connectRef.current();
      }
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      leavingRef.current = true;
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect]);

  // ─────────────────────────── derived view / coach ───────────────────────────

  const view = useMemo<PublicTableView>(() => {
    const base = tableView ?? viewFromLobby(lobby);
    let handResult = base.handResult;
    if (!handResult && base.street === 'handOver' && lastResult?.hand === base.handNumber) {
      handResult = lastResult.result;
    }
    handResult = perViewerResult(handResult, base.heroSeat);
    return handResult === base.handResult ? base : { ...base, handResult };
  }, [tableView, lobby, lastResult]);

  const advice = useMemo<CoachAdvice | null>(() => {
    if (!coachEnabled || !tableView?.legalActions) return null;
    const input = recommendInputFromView(tableView);
    return input ? recommend(input) : null;
  }, [coachEnabled, tableView]);

  // Clear last grade on a new hand.
  const handNo = tableView?.handNumber ?? -1;
  useEffect(() => {
    setLastGrade(null);
  }, [handNo]);

  const heroAct = useCallback(
    (action: PlayerAction) => {
      if (!tableView?.legalActions) return;
      const input = recommendInputFromView(tableView);
      if (input) setLastGrade(gradeAction(recommend(input), action.type, action.amount));
      send({
        type: 'action',
        action: { type: action.type, ...(action.amount != null ? { amount: action.amount } : {}) },
        handNumber: tableView.handNumber,
      });
    },
    [tableView, send],
  );

  const newHand = useCallback(() => send({ type: 'nextHand' }), [send]);
  const start = useCallback(() => send({ type: 'start' }), [send]);
  const takeSeat = useCallback(
    (seat?: number) => send(seat == null ? { type: 'takeSeat' } : { type: 'takeSeat', seat }),
    [send],
  );
  const leave = useCallback(() => {
    send({ type: 'leave' });
    leavingRef.current = true;
    saveSeatToken(code, null);
    const ws = wsRef.current;
    wsRef.current = null;
    // Give the leave frame a tick to flush before closing.
    setTimeout(() => ws?.close(), 50);
    setStatus('closed');
  }, [code, send]);

  const yourSeat = lobby?.you?.seat ?? yourSeatFromTable;
  const disconnectedNames = useMemo(
    () =>
      (lobby?.players ?? [])
        .filter((p) => !p.connected && p.playerId !== lobby?.you?.playerId)
        .map((p) => p.name),
    [lobby],
  );

  return {
    view,
    advice: coachEnabled ? advice : null,
    lastGrade: coachEnabled ? lastGrade : null,
    coachEnabled,
    setCoachEnabled,
    newHand,
    resetStacks: () => {},
    heroAct,
    hasTable: tableView != null,
    status,
    lobby,
    code,
    isHost: lobby?.you?.isHost ?? false,
    yourSeat,
    turnDeadline,
    error,
    fatal,
    notices,
    disconnectedNames,
    start,
    takeSeat,
    leave,
  };
}

