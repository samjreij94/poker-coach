/**
 * Thin normalize for splash: bind ONLY to view.handResult.
 * Prefers Chief/Dealer fields; falls back if engine still has summary/label/amount.
 */
import type { Card } from '../poker/types';
import type { HandResult, HeroHandOutcome } from '../poker/game';

export type { HandResult, HeroHandOutcome };

export type HandResultKind = 'fold' | 'showdown';

export interface UiHandResultWinner {
  seat: number;
  name: string;
  amountWon: number;
  handName?: string;
  /** Card objects or keys like "As" */
  holeCards?: Array<Card | string>;
}

export interface UiHandResult {
  kind: HandResultKind;
  heroOutcome: HeroHandOutcome;
  winners: UiHandResultWinner[];
  board: Card[];
  potTotal: number;
  why: string;
}

/** Accept live HandResult plus legacy field aliases (no Partial<HandResult> intersect). */
export interface RawHandResult {
  heroOutcome: HeroHandOutcome;
  potTotal: number;
  winners: Array<{
    seat: number;
    name?: string;
    label?: string;
    amountWon?: number;
    amount?: number;
    handName?: string;
    holeCards?: Array<Card | string>;
  }>;
  summary?: string;
  why?: string;
  kind?: HandResultKind;
  board?: Card[];
}

export function normalizeHandResult(
  raw: RawHandResult | HandResult | null | undefined,
  fallbackBoard: Card[] = [],
): UiHandResult | null {
  if (!raw) return null;

  const winners: UiHandResultWinner[] = (raw.winners ?? []).map((w) => {
    const legacy = w as {
      name?: string;
      label?: string;
      amountWon?: number;
      amount?: number;
      handName?: string;
      holeCards?: Array<Card | string>;
      seat: number;
    };
    return {
      seat: legacy.seat,
      name: legacy.name ?? legacy.label ?? `Seat ${legacy.seat}`,
      amountWon: legacy.amountWon ?? legacy.amount ?? 0,
      ...(legacy.handName ? { handName: legacy.handName } : {}),
      ...(legacy.holeCards?.length ? { holeCards: legacy.holeCards } : {}),
    };
  });

  const why =
    ('why' in raw && raw.why) ||
    ('summary' in raw && (raw as RawHandResult).summary) ||
    '';
  const board = raw.board?.length ? raw.board : fallbackBoard;
  const kind: HandResultKind =
    raw.kind ??
    (winners.some((w) => w.handName || (w.holeCards?.length ?? 0) > 0)
      ? 'showdown'
      : 'fold');

  return {
    kind,
    heroOutcome: raw.heroOutcome,
    winners,
    board,
    potTotal: raw.potTotal,
    why: String(why),
  };
}
