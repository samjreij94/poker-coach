import { useCallback, useState } from 'react';
import SoloApp from './SoloApp';
import { Lobby } from './components/lobby/Lobby';
import { RoomApp } from './components/room/RoomApp';
import {
  loadSession,
  roomCodeFromUrl,
  saveSession,
  setRoomInUrl,
} from './multiplayer/config';

type Mode =
  | { kind: 'lobby'; code: string | null; notice: string | null }
  | { kind: 'solo' }
  | { kind: 'room'; code: string; name: string };

function initialMode(): Mode {
  const urlCode = roomCodeFromUrl();
  const session = loadSession();
  // Refresh / reopen: auto-rejoin the active room (token lives in localStorage).
  if (session && (!urlCode || urlCode === session.code)) {
    return { kind: 'room', code: session.code, name: session.name };
  }
  return { kind: 'lobby', code: urlCode, notice: null };
}

/**
 * Top-level mode switch: Lobby → Solo (unchanged trainer) or Room (multiplayer).
 */
function App() {
  const [mode, setMode] = useState<Mode>(initialMode);

  const enterRoom = useCallback((code: string, name: string) => {
    saveSession({ code, name });
    setRoomInUrl(code);
    setMode({ kind: 'room', code, name });
  }, []);

  const exitRoom = useCallback((message?: string) => {
    saveSession(null);
    setRoomInUrl(null);
    setMode({ kind: 'lobby', code: null, notice: message ?? null });
  }, []);

  if (mode.kind === 'solo') return <SoloApp />;
  if (mode.kind === 'room') {
    return <RoomApp key={mode.code} code={mode.code} name={mode.name} onExit={exitRoom} />;
  }
  return (
    <Lobby
      initialCode={mode.code}
      notice={mode.notice}
      onSolo={() => {
        setRoomInUrl(null);
        setMode({ kind: 'solo' });
      }}
      onEnterRoom={enterRoom}
    />
  );
}

export default App;
