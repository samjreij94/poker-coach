import { useState, type FormEvent } from 'react';
import { createRoomCode, loadName } from '../../multiplayer/config';
import {
  MAX_NAME_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  isValidRoomCode,
  normalizeRoomCode,
} from '../../multiplayer/protocol';
import './Lobby.css';

export interface LobbyProps {
  onSolo: () => void;
  onEnterRoom: (code: string, name: string) => void;
  /** From `?room=CODE`: prefill + land on Join. */
  initialCode?: string | null;
  /** Error to surface (e.g. room not found after a failed rejoin). */
  notice?: string | null;
}

type Screen = 'home' | 'create' | 'join';

function cleanCode(raw: string): string {
  return normalizeRoomCode(raw)
    .split('')
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

/**
 * Entry screen: Play Solo (unchanged trainer) / Create Room / Join Room.
 * iPhone-first; every control ≥ 44px tall.
 */
export function Lobby({ onSolo, onEnterRoom, initialCode, notice }: LobbyProps) {
  const [screen, setScreen] = useState<Screen>(initialCode ? 'join' : 'home');
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(cleanCode(initialCode ?? ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(notice ?? null);

  const trimmedName = name.trim().slice(0, MAX_NAME_LENGTH);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmedName || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const newCode = await createRoomCode();
      onEnterRoom(newCode, trimmedName);
    } catch (ex) {
      setErr(
        ex instanceof Error && ex.message.startsWith('Create')
          ? ex.message
          : "Couldn't reach the room server. Check your connection and try again.",
      );
      setBusy(false);
    }
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmedName || !isValidRoomCode(code)) return;
    onEnterRoom(code, trimmedName);
  };

  const nameField = (
    <label className="pc-lobby__field">
      <span className="pc-lobby__label">Your name</span>
      <input
        className="pc-lobby__input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_NAME_LENGTH}
        autoComplete="nickname"
        autoCapitalize="words"
        enterKeyHint="go"
        placeholder="e.g. Sam"
        autoFocus={screen === 'create' || (screen === 'join' && Boolean(initialCode))}
      />
    </label>
  );

  return (
    <div className="pc-lobby">
      <header className="pc-lobby__header">
        <p className="pc-lobby__kicker">Poker Coach</p>
        <h1 className="pc-lobby__title">
          {screen === 'home' ? 'Take a seat' : screen === 'create' ? 'Create room' : 'Join room'}
        </h1>
        <p className="pc-lobby__sub">6-max · $1/$2 · 100bb · bots fill empty seats</p>
      </header>

      {err ? (
        <p className="pc-lobby__error" role="alert">
          {err}
        </p>
      ) : null}

      {screen === 'home' ? (
        <div className="pc-lobby__stack">
          <button type="button" className="pc-lobby__btn pc-lobby__btn--primary" onClick={onSolo}>
            <span className="pc-lobby__btn-title">Play Solo</span>
            <span className="pc-lobby__btn-sub">Train vs bots with the live coach</span>
          </button>
          <button
            type="button"
            className="pc-lobby__btn"
            onClick={() => {
              setErr(null);
              setScreen('create');
            }}
          >
            <span className="pc-lobby__btn-title">Create Room</span>
            <span className="pc-lobby__btn-sub">Private table · share a code with friends</span>
          </button>
          <button
            type="button"
            className="pc-lobby__btn"
            onClick={() => {
              setErr(null);
              setScreen('join');
            }}
          >
            <span className="pc-lobby__btn-title">Join Room</span>
            <span className="pc-lobby__btn-sub">Have a code? Jump in</span>
          </button>
        </div>
      ) : null}

      {screen === 'create' ? (
        <form className="pc-lobby__stack" onSubmit={onCreate}>
          {nameField}
          <button
            type="submit"
            className="pc-lobby__btn pc-lobby__btn--primary pc-lobby__btn--center"
            disabled={!trimmedName || busy}
          >
            {busy ? 'Creating…' : 'Create room'}
          </button>
          <button type="button" className="pc-lobby__link" onClick={() => setScreen('home')}>
            Back
          </button>
        </form>
      ) : null}

      {screen === 'join' ? (
        <form className="pc-lobby__stack" onSubmit={onJoin}>
          <label className="pc-lobby__field">
            <span className="pc-lobby__label">Room code</span>
            <input
              className="pc-lobby__input pc-lobby__input--code"
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              placeholder="ABC234"
              maxLength={ROOM_CODE_LENGTH}
              autoFocus={!initialCode}
            />
          </label>
          {nameField}
          <button
            type="submit"
            className="pc-lobby__btn pc-lobby__btn--primary pc-lobby__btn--center"
            disabled={!trimmedName || !isValidRoomCode(code)}
          >
            Join room
          </button>
          <button type="button" className="pc-lobby__link" onClick={() => setScreen('home')}>
            Back
          </button>
        </form>
      ) : null}
    </div>
  );
}
