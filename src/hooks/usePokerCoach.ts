import { useCallback, useMemo, useState } from 'react';
import { gradeAction, recommend } from '../coach';
import type { CoachAdvice, CoachGrade, PlayerAction } from '../poker';
import {
  applyAction,
  createInitialState,
  IllegalActionError,
  resetStacks,
  runBotsUntilHero,
  startHand,
  streetPot,
  toPublicView,
  type GameState,
  type PublicTableView,
} from '../poker';

export interface PokerCoachApi {
  /** Table snapshot for rendering */
  view: PublicTableView;
  /** Live coach advice for hero's pending decision (null if not hero's turn) */
  advice: CoachAdvice | null;
  /** Grade of last hero action */
  lastGrade: CoachGrade | null;
  coachEnabled: boolean;
  setCoachEnabled: (on: boolean) => void;
  /** Start / deal next hand (runs bots until hero acts) */
  newHand: () => void;
  resetStacks: () => void;
  /** Hero action — applies, grades, then runs bots */
  heroAct: (action: PlayerAction) => void;
  /** Raw state escape hatch for advanced UI */
  state: GameState;
}

/**
 * Primary React API for Graphics.
 * Own table chrome / coach sheet; consume this hook (or mirror its surface).
 */
export function usePokerCoach(heroSeat = 3): PokerCoachApi {
  const [state, setState] = useState<GameState>(() =>
    createInitialState(undefined, heroSeat),
  );
  const [coachEnabled, setCoachEnabled] = useState(true);
  const [lastGrade, setLastGrade] = useState<CoachGrade | null>(null);

  const view = useMemo(() => toPublicView(state), [state]);

  const advice = useMemo(() => {
    if (!coachEnabled) return null;
    if (state.actingSeat < 0) return null;
    const hero = state.players[state.actingSeat];
    if (!hero?.isHero) return null;
    const toCall = Math.max(0, state.currentBet - hero.betThisStreet);
    const villains = state.players.filter(
      (p) => !p.folded && !p.isHero,
    ).length;
    return recommend({
      hole: hero.holeCards,
      board: state.board,
      street: state.street,
      pot: streetPot(state),
      toCall,
      hero,
      buttonSeat: state.buttonSeat,
      seatCount: state.config.seats,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      villainsInHand: villains,
    });
  }, [state, coachEnabled]);

  const newHand = useCallback(() => {
    setLastGrade(null);
    setState((s) => runBotsUntilHero(startHand(s)));
  }, []);

  const doResetStacks = useCallback(() => {
    setLastGrade(null);
    setState((s) => resetStacks(s));
  }, []);

  const heroAct = useCallback(
    (action: PlayerAction) => {
      setState((s) => {
        if (s.actingSeat < 0) return s;
        const hero = s.players[s.actingSeat];
        if (!hero?.isHero) return s;

        const toCall = Math.max(0, s.currentBet - hero.betThisStreet);
        const villains = s.players.filter(
          (p) => !p.folded && !p.isHero,
        ).length;
        const adv = recommend({
          hole: hero.holeCards,
          board: s.board,
          street: s.street,
          pot: streetPot(s),
          toCall,
          hero,
          buttonSeat: s.buttonSeat,
          seatCount: s.config.seats,
          currentBet: s.currentBet,
          minRaise: s.minRaise,
          villainsInHand: villains,
        });
        const putIn = action.amount;
        setLastGrade(gradeAction(adv, action.type, putIn));

        try {
          return runBotsUntilHero(applyAction(s, action));
        } catch (e) {
          if (e instanceof IllegalActionError) {
            console.warn(e.message);
            return s;
          }
          throw e;
        }
      });
    },
    [],
  );

  return {
    view,
    advice: coachEnabled ? advice : null,
    lastGrade: coachEnabled ? lastGrade : null,
    coachEnabled,
    setCoachEnabled,
    newHand,
    resetStacks: doResetStacks,
    heroAct,
    state,
  };
}

export type {
  CoachAdvice,
  CoachGrade,
  PublicTableView,
  PlayerAction,
  HandResult,
  HandResultWinner,
  HeroHandOutcome,
} from '../poker';
