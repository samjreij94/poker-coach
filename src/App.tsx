import { useEffect, useRef } from 'react';
import {
  ActionBar,
  CoachStrip,
  Table,
  type HeroActionPayload,
} from './components/table';
import { usePokerCoach } from './hooks/usePokerCoach';
import './App.css';

/**
 * Felt UI shell over Dealer's usePokerCoach API (PublicTableView + coach).
 * Hero drawn bottom-center via seat→slot remap in Table.
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
      </main>

      <ActionBar
        legal={view.legalActions}
        onAction={onAction}
        disabled={!view.legalActions}
      />
    </div>
  );
}

export default App;
