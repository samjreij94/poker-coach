import { useEffect, useMemo, useRef } from 'react';
import {
  ActionBar,
  CoachStrip,
  HandResultSplash,
  Table,
  type HeroActionPayload,
} from './components/table';
import { usePokerCoach } from './hooks/usePokerCoach';
import { normalizeHandResult } from './types/handResult';
import './App.css';

/**
 * Felt UI shell over Dealer's usePokerCoach API (PublicTableView + coach).
 * Hand-over splash from view.handResult (Dealer HandResult → normalize → splash).
 */
function App() {
  const {
    view,
    advice,
    lastGrade,
    coachEnabled,
    setCoachEnabled,
    newHand,
    resetStacks,
    heroAct,
  } = usePokerCoach(0);

  const dealt = useRef(false);
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    newHand();
  }, [newHand]);

  const splash = useMemo(
    () => normalizeHandResult(view.handResult, view.board),
    [view.handResult, view.board],
  );
  const showSplash = splash != null;

  const onAction = (action: HeroActionPayload) => {
    heroAct(action);
  };

  return (
    <div className="pc-app">
      <CoachStrip
        advice={coachEnabled ? advice : null}
        grade={coachEnabled ? lastGrade : null}
        collapsed={!coachEnabled || (!advice && !lastGrade)}
      />

      <div className="pc-app__tools">
        <button type="button" className="pc-app__tool" onClick={newHand}>
          Next hand
        </button>
        <button type="button" className="pc-app__tool" onClick={resetStacks}>
          Reset stacks
        </button>
        <button
          type="button"
          className="pc-app__tool"
          onClick={() => setCoachEnabled(!coachEnabled)}
          aria-pressed={coachEnabled}
        >
          Coach {coachEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <main className="pc-app__table">
        <Table view={view} />
        {showSplash && splash ? (
          <HandResultSplash result={splash} onNextHand={newHand} />
        ) : null}
      </main>

      {!showSplash ? (
        <ActionBar
          legal={view.legalActions}
          onAction={onAction}
          disabled={!view.legalActions}
        />
      ) : null}
    </div>
  );
}

export default App;
