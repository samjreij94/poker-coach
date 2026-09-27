import { useState } from 'react';
import { shareLinkFor } from '../../multiplayer/config';
import { MIN_HUMANS_TO_START, type LobbyState } from '../../multiplayer/protocol';
import type { ConnStatus } from '../../hooks/useMultiplayerTable';
import './Lobby.css';

export interface WaitingRoomProps {
  code: string;
  lobby: LobbyState | null;
  status: ConnStatus;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
  onTakeSeat: (seat: number) => void;
  error?: string | null;
}

/**
 * Room lobby: big shareable code, seat roster with connected/host/you badges,
 * host-only Start. Empty seats become bots server-side at deal time.
 */
export function WaitingRoom({
  code,
  lobby,
  status,
  isHost,
  onStart,
  onLeave,
  onTakeSeat,
  error,
}: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);
  const link = shareLinkFor(code);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    try {
      await navigator.share({ title: 'Poker Coach room', text: `Join my poker table: ${code}`, url: link });
    } catch {
      /* user cancelled */
    }
  };

  const seats = lobby?.seats ?? [];
  const humans = seats.filter((s) => s.kind === 'human').length;
  const youId = lobby?.you?.playerId;
  const youSeat = lobby?.you?.seat ?? null;
  const minHumans = lobby?.minHumansToStart ?? MIN_HUMANS_TO_START;
  const canStart = isHost && humans >= minHumans && status === 'open';
  const midHand = lobby != null && lobby.phase !== 'lobby';

  return (
    <div className="pc-lobby pc-lobby--room">
      <header className="pc-lobby__header">
        <p className="pc-lobby__kicker">Room code</p>
        <p className="pc-room-code" aria-label={`Room code ${code.split('').join(' ')}`}>
          {code}
        </p>
        <p className="pc-lobby__sub pc-room-link">{link.replace(/^https?:\/\//, '')}</p>
        <div className="pc-lobby__row">
          <button type="button" className="pc-lobby__chip-btn" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          {canShare ? (
            <button type="button" className="pc-lobby__chip-btn" onClick={share}>
              Share…
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="pc-lobby__error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="pc-seats" aria-label="Seats">
        <h2 className="pc-seats__title">
          Seats <span className="pc-seats__count">{humans}/{seats.length || 6} players</span>
        </h2>
        {lobby == null ? (
          <p className="pc-seats__loading">{status === 'open' ? 'Joining…' : 'Connecting to room…'}</p>
        ) : (
          <ul className="pc-seats__list">
            {seats.map((s) => {
              const isYou = s.kind === 'human' && s.playerId === youId;
              const host = s.kind === 'human' && s.playerId === lobby.hostId;
              const empty = s.kind !== 'human';
              return (
                <li
                  key={s.seat}
                  className={`pc-seats__item${isYou ? ' pc-seats__item--you' : ''}${empty ? ' pc-seats__item--empty' : ''}`}
                >
                  <span
                    className={`pc-seats__dot ${empty ? '' : s.connected ? 'pc-seats__dot--on' : 'pc-seats__dot--off'}`}
                    aria-hidden
                  />
                  <span className="pc-seats__seat">{s.seat + 1}</span>
                  <span className="pc-seats__name">
                    {empty ? (s.kind === 'bot' ? `${s.name} (bot)` : 'Open · bot at start') : s.name}
                  </span>
                  <span className="pc-seats__badges">
                    {host ? <span className="pc-badge pc-badge--host">Host</span> : null}
                    {isYou ? <span className="pc-badge pc-badge--you">You</span> : null}
                    {s.pending ? <span className="pc-badge pc-badge--you">Next hand</span> : null}
                    {!empty && !s.connected ? (
                      <span className="pc-badge pc-badge--off">Away</span>
                    ) : null}
                    {empty && s.kind === 'empty' && youSeat !== s.seat && !midHand ? (
                      <button
                        type="button"
                        className="pc-seats__take"
                        onClick={() => onTakeSeat(s.seat)}
                        aria-label={`Move to seat ${s.seat + 1}`}
                      >
                        Sit
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="pc-lobby__footer">
        {isHost ? (
          <>
            <button
              type="button"
              className="pc-lobby__btn pc-lobby__btn--primary pc-lobby__btn--center"
              disabled={!canStart}
              onClick={onStart}
            >
              Start game
            </button>
            <p className="pc-lobby__hint">
              {humans < minHumans
                ? `Waiting for at least ${minHumans} players · share the code`
                : 'Empty seats will be filled with bots'}
            </p>
          </>
        ) : (
          <p className="pc-lobby__hint pc-lobby__hint--wait">
            {midHand ? 'Hand in progress — you’ll be dealt in next hand' : 'Waiting for the host to start…'}
          </p>
        )}
        <button type="button" className="pc-lobby__link" onClick={onLeave}>
          Leave room
        </button>
      </footer>
    </div>
  );
}
