# Poker Coach

iPhone-first 6-max poker trainer (Vite + React + TypeScript).

## Run

```bash
npm install   # already present in this workspace
npm run dev   # http://localhost:5173 — DevTools device mode 390×844
npm run build
npm test
```

## Scope

### C1 — Felt table shell
- Dark casino felt, oval 6-max table
- Seats: name/avatar, stack, dealer button, fold/active states
- Hero bottom-center (visual remap), face-up holes; villains face-down backs
- Community cards, pot, formatted stacks
- Layout: 390×844-first PWA portrait, `env(safe-area-inset-*)`, dark theme, ≥44px targets
- Types aligned to Dealer `PublicTableView` / `src/poker/types.ts` (see `src/types/table.ts`)
- `mockState.ts` kept for offline demos; live app uses `usePokerCoach`

### C2 — Action bar + Live Coach
- Bottom action bar driven by `view.legalActions` (`ActionBar`)
- Sticky Coach strip via `recommend` / `gradeAction` through `usePokerCoach`
- `Next hand` / Coach On-Off tools; auto-deal on first mount

### Other owners
- Engine loop / bots: `src/poker` + `src/hooks/usePokerCoach.ts` (Dealer)
- Coach logic: `src/coach`

## Key UI files

| Path | Role |
|------|------|
| `src/App.tsx` | Shell: CoachStrip + Table + ActionBar → `usePokerCoach` |
| `src/components/table/Table.tsx` | Felt + board + seats |
| `src/components/table/Seat.tsx` | Plaque / cards / dealer / acting |
| `src/components/table/CardView.tsx` | Rank/suit + backs |
| `src/components/table/Pot.tsx` | Center pot |
| `src/components/table/ActionBar.tsx` | Fold/Check/Call/Raise/sizing |
| `src/components/table/CoachStrip.tsx` | Sticky Live Coach |
| `src/components/table/mockState.ts` | Mock `PublicTableView` |
| `src/types/table.ts` | Aliases → engine types |
| `src/hooks/usePokerCoach.ts` | Dealer React API |

## Layout notes for C2+
- Bottom band ~120–160px reserved for `ActionBar` (safe-area bottom)
- Top sticky Coach collapsed ~36–40px; expands when advice/grade present — keep under ~160px so top seats stay clear
- Hero always visual slot 0 (bottom) via `(seat - heroSeat) % 6` even if `heroSeat !== 0`
- `StubTable` remains as a minimal alternate; felt UI is the primary chrome

## Engine ↔ UI contract
- `toPublicView(state) → PublicTableView`
- Flow: `startHand → runBotsUntilHero → heroAct → loop`
- Actions: `legalActions`; Coach: `recommend` / `gradeAction`
