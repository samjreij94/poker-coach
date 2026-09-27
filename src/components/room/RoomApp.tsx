import { useEffect, useMemo, useState } from 'react';
import {
  ActionBar,
  CoachStrip,
  HandResultSplash,
  Table,
  type HeroActionPayload,
} from '../table';
import { useMultiplayerTable } from '../../hooks/useMultiplayerTable';
import { normalizeHandResult } from '../../types/handResult';
import { WaitingRoom } from '../lobby/WaitingRoom';
import '../../App.css';
import './RoomApp.css';

export interface RoomAppProps {
  code: string;
  name: string;
  /** Leave / fatal error → back to lobby (optional message). */
  onExit: (message?: string) => void;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/**
 * Room mode shell: waiting room until the first `table` push, then the same
 * felt layout as solo (CoachStrip / tools / Table / sticky ActionBar) rendered
 * from useMultiplayerTable.
 */
export function RoomApp({ code, name, onExit }: RoomAppProps) {
  const mp = useMultiplayerTable(code, name);
  const { view, advice, lastGrade, coachEnabled, setCoachEnabled } = mp;

  useEffect(() => {
    if (mp.fatal) onExit(mp.error?.message ?? 'Could not join that room.');
  }, [mp.fatal, mp.error, onExit]);

  const leave = () => {
    mp.leave();
    onExit();
  };

  const [dismissedHand, setDismissedHand] = useState(-1);
  const splash = useMemo(
    () => normalizeHandResult(view.handResult, view.board),
    [view.handResult, view.board],
  );
  const showSplash = splash != null && dismissedHand !== view.handNumber;

  const now = useNow(mp.turnDeadline != null);
  const heroSeat = view.heroSeat;
  const acting = view.actingSeat >= 0 ? view.players[view.actingSeat] : undefined;
  const heroTurn = view.legalActions != null;
  const secsLeft =
    mp.turnDeadline != null ? Math.max(0, Math.ceil((mp.turnDeadline - now) / 1000)) : null;

  let turnText: string;
  if (view.street === 'handOver') {
    turnText = mp.isHost ? 'Hand over — deal the next one' : 'Waiting for host to deal…';
  } else if (acting && acting.seat !== heroSeat) {
    const seatInfo = mp.lobby?.seats[acting.seat];
    const away = seatInfo?.kind === 'human' && seatInfo.connected === false;
    turnText = away ? `Waiting for ${acting.name} (disconnected)…` : `Waiting for ${acting.name}…`;
  } else {
    turnText = 'Waiting…';
  }

  // Connection banner (own socket) + other-player notices.
  const ownBanner =
    mp.status === 'reconnecting'
      ? 'Connection lost — reconnecting…'
      : mp.status === 'connecting' && mp.lobby
        ? 'Reconnecting…'
        : null;
  const away = mp.disconnectedNames;
  const latest = mp.notices[0];
  const [shownNotice, setShownNotice] = useState<number | null>(null);
  useEffect(() => {
    if (!latest || latest.kind === 'disconnected') return;
    setShownNotice(latest.id);
    const t = setTimeout(() => setShownNotice(null), 3500);
    return () => clearTimeout(t);
  }, [latest]);
  const otherBanner =
    away.length > 0
      ? `${away.join(', ')} ${away.length === 1 ? 'is' : 'are'} disconnected`
      : latest && shownNotice === latest.id
        ? latest.kind === 'reconnected'
          ? `${latest.name} is back`
          : latest.kind === 'left'
            ? `${latest.name} left the room`
            : null
        : null;

  const banners = (
    <div className="pc-room-banners" aria-live="polite">
      {ownBanner ? (
        <div className="pc-room-banner pc-room-banner--own" role="status">
          <span className="pc-room-banner__spinner" aria-hidden />
          {ownBanner}
        </div>
      ) : null}
      {otherBanner ? (
        <div
          className={`pc-room-banner ${away.length ? 'pc-room-banner--warn' : 'pc-room-banner--info'}`}
          role="status"
        >
          {otherBanner}
        </div>
      ) : null}
    </div>
  );

  if (!mp.hasTable) {
    return (
      <>
        {banners}
        <WaitingRoom
          code={code}
          lobby={mp.lobby}
          status={mp.status}
          isHost={mp.isHost}
          onStart={mp.start}
          onLeave={leave}
          onTakeSeat={mp.takeSeat}
          error={mp.error && mp.error.code !== 'badToken' ? mp.error.message : null}
        />
      </>
    );
  }

  const onAction = (action: HeroActionPayload) => mp.heroAct(action);

  return (
    <div className="pc-app pc-app--room">
      {banners}
      <CoachStrip
        advice={coachEnabled ? advice : null}
        grade={coachEnabled ? lastGrade : null}
        collapsed={!coachEnabled || (!advice && !lastGrade)}
      />

      <div className="pc-app__tools">
        <span className="pc-app__room-code" aria-label="Room code">
          {code}
        </span>
        <button
          type="button"
          className="pc-app__tool"
          onClick={() => setCoachEnabled(!coachEnabled)}
          aria-pressed={coachEnabled}
        >
          Coach {coachEnabled ? 'On' : 'Off'}
        </button>
        <button type="button" className="pc-app__tool" onClick={leave}>
          Leave
        </button>
      </div>

      <main className="pc-app__table">
        <Table view={view} />
        {showSplash && splash ? (
          <HandResultSplash
            result={splash}
            onNextHand={() => {
              if (mp.isHost) mp.newHand();
              setDismissedHand(view.handNumber);
            }}
          />
        ) : null}
      </main>

      {showSplash ? null : heroTurn ? (
        <ActionBar legal={view.legalActions} onAction={onAction} />
      ) : (
        <div
          className="pc-actions pc-actions--placeholder pc-turn"
          role="status"
          aria-live="polite"
          aria-label="Turn"
        >
          <span className="pc-turn__text">
            {view.street !== 'handOver' ? <span className="pc-turn__pulse" aria-hidden /> : null}
            {turnText}
          </span>
          {secsLeft != null && view.street !== 'handOver' ? (
            <span className="pc-turn__clock">{secsLeft}s</span>
          ) : null}
          {view.street === 'handOver' && mp.isHost ? (
            <button type="button" className="pc-turn__deal" onClick={mp.newHand}>
              Deal next hand
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
