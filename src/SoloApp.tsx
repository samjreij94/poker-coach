import { useEffect, useMemo, useRef } from 'react';
import {
  ActionBar,
  CoachStrip,
  HandResultSplash,
  Table,
  formatChips,
  type HeroActionPayload,
} from './components/table';
import { usePokerCoach } from './hooks/usePokerCoach';
import { normalizeHandResult } from './types/handResult';
import './App.css';

/**
 * Felt UI shell over Dealer's usePokerCoach API (PublicTableView + coach).
 * Hand-over splash from view.handResult (Dealer HandResult → normalize → splash).
 */
function SoloApp() {
  const {
    view,
    advice,
    lastGrade,
    coachEnabled,
    setCoachEnabled,
    newHand,
    resetStacks,
    heroBusted,
    rebuy,
    heroAct,
    state,
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

  // Solo hero at $0: the splash offers a rebuy / reset instead of "Next Hand".
  const outOfChips = heroBusted
    ? {
        onRebuy: rebuy,
        onReset: () => {
          resetStacks();
          newHand();
        },
        rebuyLabel: `Rebuy ${formatChips(state.config.startingStack)} & deal`,
      }
    : undefined;

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
        <button
          type="button"
          className="pc-app__tool"
          onClick={heroBusted ? rebuy : newHand}
        >
          {heroBusted ? 'Rebuy' : 'Next hand'}
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
          <HandResultSplash
            result={splash}
            onNextHand={newHand}
            outOfChips={outOfChips}
          />
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

export default SoloApp;
