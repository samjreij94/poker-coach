# A1 — Educational Live Coach Heuristics (Dealer-ready)

**For:** Theodore → CoS → Dealer ticket **B4**  
**Product:** NLHE educational live coach (iPhone MVP)  
**Format lock:** 6-max cash **$1/$2**, **~100bb** effective (`DEFAULT_CONFIG`: SB=1, BB=2, stack=200)  
**Engine stance:** Heuristic if/then rules — **not** GTO solver dumps or frequency matrices  
**Repo alignment:** Reuse `src/poker/types.ts` names; helpers in `src/poker/odds.ts`; rules intended for empty `src/coach/`

---

## Executive summary

1. Teach recreational learners **street-by-street** with small rule tables keyed by `Position`, facing action, board tags, `HandClass`, and SPR.
2. Preflop = bucket charts (`open` / `threeBet` / `call` / `fold`) + fixed size bands; postflop = SPR bands × hand class × texture tags.
3. Grading is ternary: **`Good` | `OK` | `Leak`**, with one-sentence `why` strings (see A2).
4. Equity for draws uses existing `outsToEquity` / pot-odds helpers — no Monte Carlo on the hot path.
5. Frequencies only as coarse bands: `always | often | sometimes | rarely | never`.
6. Experts should not call this harmful: raise-first-in, position-aware ranges, texture-aware c-bets, SPR-aware stack-off, pot-odds draws.
7. Out of scope for MVP: rake model, HUD stats, multiway deep trees, 4-bet polar mixes, ICM/tournaments.

---

## 1) Preflop framework (simplified charts)

### Size guidance (100bb cash, no ante)

| Situation | Size | Notes |
|-----------|------|--------|
| Open (RFI) EP/MP/CO | **2.2–2.5× BB** | Prefer consistent ~2.5× for MVP simplicity |
| Open BTN | **2.5× BB** | Slightly larger OK |
| Open SB | **3–3.5× BB** | Larger vs BB who has position + discount |
| 3-bet **IP** | **~3×** open | Vs min/2.2× open → ~3.5× |
| 3-bet **OOP** | **~3.5–4.5×** open | SB/BB vs open: prefer ~4× |
| Call | — | Price + playability; BB defends widest |

Sources: Upswing RFI / 6-max / 3-bet articles (see Sources).

### Position map (repo)

| Repo `Position` | Table name |
|-----------------|------------|
| `EP` | UTG / LJ |
| `MP` | HJ |
| `CO` | Cutoff |
| `BTN` | Button |
| `SB` | Small blind |
| `BB` | Big blind |

### Hand notation for charts

- `AA–TT` = pairs from AA down to TT  
- `AKs` / `AKo` = suited / offsuit  
- `ATs+` = ATs, AJs, AQs, AKs  
- Charts are **buckets**, not combo mixes. Bottom of range = marginal → fold vs aggressive tables.

### 1.1 Raise First In (everyone folded to you)

**Policy:** Never limp RFI (except rare SB limp vs tough BB — MVP: **always raise or fold**).

| Position | Approx % | **OPEN** bucket (raise) | **FOLD** |
|----------|----------|-------------------------|----------|
| EP | ~15–18% | `55+`, `A2s+`, `K9s+`, `Q9s+`, `J9s+`, `T8s+`, `98s`, `87s`, `76s`, `AJo+`, `KQo` | Rest |
| MP | ~20% | EP + `44`, `97s`, `65s`, `ATo+`, `KJo+`, `QJo` | Rest |
| CO | ~25% | MP + `22+`, `K8s+`, `Q8s+`, `J8s+`, `T8s+`, `86s+`, `54s`, `KTo+`, `QTo+`, `JTo` | Rest |
| BTN | ~40% | Wide: `22+`, `A2s+`, `K3s+`, `Q5s+`, suited connectors/gappers, `A2o+`, `K9o+`, `Q9o+`, `J9o+`, `T9o` | Rest |
| SB | ~40–48% | Similar to BTN but **larger size**; tighten bottom vs aggressive BB | Rest |
| BB | — | No RFI (blinds already posted) | — |

### 1.2 Facing one open (vs RFI) — continue buckets

MVP simplification (cash, no ante):

- **CO / MP / EP vs earlier open:** prefer **3-bet or fold** (little flat).  
- **BTN vs CO/MP/EP:** 3-bet value + some flats (suited connectors, small pairs).  
- **SB:** mostly **3-bet or fold**.  
- **BB:** widest **call** + polarized/linear 3-bet mix (simplified below).

#### Value 3-bet core (all positions, tighten EP)

Always/often 3-bet: `QQ+`, `AKs`, `AKo`.  
Often 3-bet (wider IP / vs late open): `JJ`, `TT`, `AQs`, `AJs`, `KQs`.

#### 3-bet bluff / semi (simplified)

Prefer suited Ax + suited connectors near call threshold: `A5s–A2s`, `76s–T9s`, sometimes `K9s`/`QTs` IP vs late opens.  
**Never** 3-bet pure trash (`72o`, `93o`) in MVP teaching.

#### Call buckets (when flatting allowed)

| Spot | CALL often | Prefer FOLD / 3-bet instead |
|------|------------|-----------------------------|
| BTN vs CO | `22–99`, `ATs–AQs`, `KJs+`, `QJs`, `JTs`, `T9s`, `98s` | Domination traps OOP; weak offsuit broadway |
| BB vs BTN | Wide: any pair, suited broadway, suited connectors, many Ax suited, some Kxo | Absolute trash offsuit |
| BB vs EP | Tight: pairs, strong suited broadway, `AQo+` | Speculative offsuit |
| SB | Rare flats | Mostly 3-bet/fold |

#### Facing 3-bet (as opener) — coarse

| | 4-bet / jam value | Call (IP preferred) | Fold |
|--|-------------------|---------------------|------|
| Hands | `QQ+`, `AK` (often 4-bet); `JJ` mix | `TT–99`, `AQs`, suited connectors **IP** | Weak Ax, most offsuit broadway, small pairs **OOP** |

Defense tightens OOP and vs EP 3-bets. Coarse fold rate of opening range vs 3-bet: often **~55–65%** (teaching band, not solver %).

---

## 2) Postflop heuristics (SPR × hand class × texture)

### 2.1 Hand classes (must match `HandClass`)

| `HandClass` | Definition for classifier (Dealer implements) |
|-------------|-----------------------------------------------|
| `nuts` | Best possible / near-nuts: quads, full house, nut flush, nut straight; set on dry boards often treated as `nuts` for aggression |
| `strongMade` | Overpair, TPTK/TPGK, two pair, non-nut strong made that wants value |
| `weakMade` | Underpair, weak top pair, middle/bottom pair, ace-high showdown-ish |
| `strongDraw` | Flush draw (esp. nut), OESD, combo draw (≥8–12 clean outs) |
| `weakDraw` | Gutshot, backdoor-heavy, weak flush draw to non-nuts |
| `air` | No pair, no meaningful draw |

**Optional finer tags** (internal, not replacing `HandClass`): `overpair`, `tptk`, `topPairWeak`, `secondPair`, `set`, `twoPair`, `fd`, `oesd`, `gutshot`, `comboDraw`.

### 2.2 Board texture tags (engine inputs)

| Tag | Meaning |
|-----|---------|
| `dry` | Disconnected, rainbow, unpaired (e.g. K72r) |
| `semiWet` | One draw possible (two-tone or mild connectivity) |
| `wet` | Coordinated + draws (e.g. JT9tt, two-tone connected) |
| `paired` | Board pair present |
| `monotone` | Three same suit |
| `aceHigh` | Ace on board |
| `broadwayHeavy` | High cards favoring PFR range |

### 2.3 SPR bands (flop, before bet)

`spr = effectiveStack / pot` (already in `odds.ts`).

| Band | Approx SPR | Teaching meaning |
|------|------------|------------------|
| `low` | ≤ 3 | One-pair often stacks; draws jam/call wider |
| `mid` | 3–8 | Top pair careful; sets/two-pair/strong draws build |
| `high` | ≥ 8 | Need strong made or robust draws to play huge pots |

100bb SRP BTN vs BB ≈ SPR ~13 (high). 100bb 3-bet pot ≈ SPR ~4–6 (mid).

### 2.4 Pot odds / draws (use existing helpers)

```
requiredEquity = potOdds(pot, toCall)           // toCall/(pot+toCall)
estEquity      = outsToEquity(outs, cardsToCome) // rule of 2/4
```

**Rule:** If `estEquity + impliedOddsBuffer >= requiredEquity` → call is **Good/OK**; else fold unless strong fold equity plan.

Implied odds buffer (MVP constants):  
- IP, deep, `high` SPR, nut draw: `+0.05–0.10`  
- OOP, low SPR, non-nut draw: `+0` or negative (discount dirty outs)

Outs cheat sheet: FD≈9, OESD≈8, gutshot≈4, combo≈12–15 (cap rule-of-4 overestimate above ~12 outs).

### 2.5 C-bet as PFR (single-raised pot, heads-up)

Frequency bands by texture (IP > OOP):

| Texture | C-bet frequency | Size band |
|---------|-----------------|-----------|
| `dry` / `paired` / rainbow disconnected | **often** | ~25–40% pot |
| `semiWet` | **sometimes–often** | ~50–66% pot |
| `wet` / connected | **sometimes** (more polar) | ~66–75% pot |
| `monotone` | **rarely–sometimes** | smaller / more checks |

**By hand class (PFR, to act):**

| HandClass | Dry | Wet/monotone |
|-----------|-----|--------------|
| `nuts` / `strongMade` | Bet for value **often** | Bet or check based on XR risk; still value **often** |
| `weakMade` | Small bet **sometimes** or check (esp. ace-high boards) | Prefer check/control |
| `strongDraw` | Bet **often** (semi-bluff) | Bet larger **sometimes** or check-raise later if OOP |
| `weakDraw` / `air` | Small stab **sometimes** on dry | Prefer check; bluff less on wet |

Sources: GTO Wizard flop c-bet heuristics (cash IP).

### 2.6 Facing c-bet (BB defender, OOP)

| HandClass | vs small c-bet (~33%) | vs large c-bet (~75%+) |
|-----------|----------------------|-------------------------|
| `nuts` / set / strong two-pair | **Check-raise often** (esp. dry/non-monotone) | Raise or call (wet: call two-pair more) |
| `strongMade` | Call **often**; XR sometimes | Call or fold bottom |
| `weakMade` | Call **sometimes** (price); fold multiway | Fold **often** |
| `strongDraw` | Call or **XR sometimes** (FD/OESD) | Call if price; XR combo draws |
| `weakDraw` | Call if pot odds OK | Fold **often** |
| `air` | Fold **often**; rare XR bluff only with BDFD+ blockers on dry | Fold |

Check-raise size teaching: **~3–4×** the bet.

### 2.7 Turn / river (compressed MVP)

**Turn**

- If you c-bet flop as PFR: barrel **often** with `nuts`/`strongMade`/`strongDraw` when turn is blank; give up **often** with `air` on bricks if opponent sticky.  
- Scare cards that complete obvious draws: downshift bluffs; value thinner only vs calling stations (MVP: no HUD → default cautious).  
- SPR update each street; at `low` SPR, jam/call with `strongMade+` and strong draws more freely.

**River**

- Value bet `nuts`/`strongMade` that beat bluff-catchers; size up with nut advantage.  
- Bluff `air` **sometimes** only with blockers / missed strong draws vs ranges that fold — MVP band: bluff less than theory vs unknown recreational pools.  
- Never teach “pot committed because money in pot” (sunk cost).

### 2.8 Stack-off cheat sheet (heads-up)

| SPR | Comfortably stack `strongMade` (TPTK/overpair)? | Prefer `nuts`/set/two-pair/combo |
|-----|-----------------------------------------------|----------------------------------|
| ≤3 | **Yes, often** | Yes |
| 3–8 | **Sometimes** (board + line) | Yes |
| ≥8 | **Rarely** without extras | Yes |

Draws retain equity better at high SPR than marginal one-pair (GTO Wizard SPR primer).

---

## 3) Implementable if/then catalog (inputs → action)

### Engine inputs (decision context)

```
street, position, heroIsPfr, inPosition,
facing: 'none' | 'bet' | 'raise' | 'check',
betSizePotFrac?, pot, toCall, effectiveStack,
sprBand: 'low'|'mid'|'high',
boardTags[], handClass, outs?,
preflopBucket?: 'open'|'threeBet'|'call'|'fold',
numPlayersInPot
```

### Preflop rules (examples)

```
IF street=preflop AND facing=none AND position=EP AND hand in EP_OPEN → raise 2.5bb
IF street=preflop AND facing=none AND hand not in OPEN[position] → fold
IF street=preflop AND facing=open AND position in {EP,MP,CO,SB} AND hand in VALUE_3BET → raise ~3x IP / ~4x OOP
IF street=preflop AND facing=open AND position=BB AND hand in BB_DEFEND_CALL → call
IF street=preflop AND facing=open AND hand not in continue → fold
IF street=preflop AND facing=3bet AND hand in QQ+,AKs,AKo → often 4bet; TT–AQs IP → often call; else fold weak
```

### Flop rules (examples)

```
IF heroIsPfr AND facing=check AND board has dry|paired AND handClass in {strongMade,nuts,strongDraw,air?} → bet 33% often (air only sometimes)
IF heroIsPfr AND facing=check AND board monotone AND handClass=weakMade → check often
IF !heroIsPfr AND facing=bet AND handClass=nuts AND !monotone → raise 3–4x often
IF facing=bet AND handClass in {strongDraw,weakDraw} AND outsToEquity>=potOdds → call (OK/Good)
IF facing=bet AND handClass=air AND estEquity < potOdds → fold
IF sprBand=low AND handClass=strongMade AND facing=bet/raise → call/raise all-in often
IF sprBand=high AND handClass=weakMade AND facing=large bet → fold often
IF numPlayersInPot>=3 → tighten continues; c-bet air rarely
```

### Turn/river rules (examples)

```
IF turn AND priorLine=cbet AND handClass=air AND opponent called flop AND turn blank → check/fold often
IF river AND handClass=nuts → bet value often (size 66–100%+)
IF river AND handClass=air AND no blocker story → check (don't bluff always)
```

---

## 4) Grading rubric + concrete examples

### Rubric

| Grade | Meaning | When |
|-------|---------|------|
| **Good** | Matches recommended action (± size band) | Primary line or clearly +EV teaching line |
| **OK** | Playable alternate; slight leak or size off | Secondary line solvers/heuristics mix; size 0.5–1.5× outside band |
| **Leak** | Clear mistake vs framework | Folds value, calls without odds, limps RFI, stacks off light at high SPR, etc. |

### Size tolerance (MVP)

- Preflop open within **2.0–3.0×** (SB **2.5–4.0×**) → not Leak for size alone if action type correct.  
- Postflop bet within **recommended ±20% pot** → Good; outside → OK; wildly off (min-bet nuts / overbet air randomly) → Leak.

### Concrete example lines (spot → action → grade → reason)

| # | Spot | User action | Grade | Reason (short) |
|---|------|-------------|-------|----------------|
| 1 | BTN RFI with `A9o` | raise 2.5bb | **Good** | Late-position open; hand in BTN open bucket |
| 2 | EP RFI with `KTo` | raise 2.5bb | **Leak** | Too weak for EP; fold |
| 3 | EP with `AA`, folds to hero | limp | **Leak** | Never limp RFI; raise for value |
| 4 | BB vs BTN 2.5× with `76s` | call | **Good** | Strong BB defend; playability + price |
| 5 | SB vs CO open with `A5s` | call | **OK** | Prefer 3-bet; flat is playable but OOP leak-prone |
| 6 | SB vs CO with `A5s` | 3-bet 4× | **Good** | Suited Ax 3-bet; OOP sizing |
| 7 | BB vs EP open with `J7o` | call | **Leak** | Trash vs tight range; fold |
| 8 | BTN open, BB 3-bets; hero `AKo` | 4-bet | **Good** | Premium continues vs 3-bet |
| 9 | BTN open, BB 3-bets; hero `A9o` | call | **Leak** | Dominated; fold |
| 10 | PFR IP, flop K72r, hero `AKo` (TPTK) | bet 33% | **Good** | Dry board; value/protection small c-bet |
| 11 | PFR IP, flop K72r, hero `72o` air | check | **OK** | Small stab also OK; check is fine |
| 12 | PFR IP, flop K72r, air | bet 125% | **Leak** | Overbet air on dry without story |
| 13 | PFR, flop JhTh9h monotone, hero `AA` no heart | bet 75% | **OK/Leak*** | Prefer smaller/check often; XR risk (*OK if tagged cautious) |
| 14 | BB, flop Q94tt, hero `99` set, faces 33% | check-raise | **Good** | Set XR for value |
| 15 | BB, wet Q94tt, hero `Q4` two-pair, faces 33% | check-raise | **OK** | Call often on wet; XR still strong |
| 16 | BB faces 75% c-bet, gutshot 4 outs, SPR high | call | **Leak** | Price too steep; fold |
| 17 | BB faces 33% , nut FD 9 outs flop | call | **Good** | Odds + implied odds |
| 18 | SPR~2, TPTK faces jam | call | **Good** | Low SPR stack-off |
| 19 | SPR~12, weak top pair faces 3-bet shove | call | **Leak** | High SPR; need stronger |
| 20 | River, nut flush, checked to hero | check | **Leak** | Missed value; bet |
| 21 | River, pure air, no blockers, villager calling station unknown | bluff pot | **OK/Leak** | Default OK→Leak for MVP recreational; prefer check |
| 22 | Turn, missed draw air after flop call, faces 2/3 pot | call | **Leak** | No odds; fold |

\*Monotone overpair: teach **check more** — grade large c-bet as **OK** with reason “prefer smaller or check on monotone”.

---

## 5) Typed rubric shape (for `src/coach/`)

Align with existing:

```ts
Grade = 'Good' | 'OK' | 'Leak'
HandClass = 'air' | 'weakDraw' | 'strongDraw' | 'weakMade' | 'strongMade' | 'nuts'
CoachAdvice, CoachGrade from types.ts
```

**Proposed additions** (Dealer B4 — see also `coachHeuristics.examples.ts`):

- `PreflopBucket`, `FrequencyBand`, `SprBand`, `BoardTag`
- `CoachRule` — if/then with `when` matcher + `advice: CoachAdvice`
- `gradeAction(ctx, userAction, advice) => CoachGrade`
- Reason codes → A2 string table

Pseudo-flow:

```
1. classifyHandClass(hole, board) → HandClass
2. tagBoard(board) → BoardTag[]
3. sprBand = band(spr(stack, pot))
4. match first CoachRule → CoachAdvice
5. grade user ActionType (+ size) vs advice → CoachGrade { grade, why, advice }
```

---

## 6) Myths / what NOT to teach

| Avoid | Why | Teach instead |
|-------|-----|----------------|
| Always c-bet as PFR | Texture/range dependent | C-bet more dry/paired; less monotone/wet |
| Never fold AA / top pair | Multiway + raises + high SPR | SPR + relative strength |
| If you call street N you must call N+1 | Streets are independent | Re-evaluate pot odds each street |
| Limp strong hands to “trap” | Builds multiway, shrinks AA equity | Raise RFI |
| Pot committed (sunk cost) | False | Only pot odds + equity matter |
| Any two suited / any Ace from EP | Too loose early | Position-based open charts |
| Never bluff river | Too passive | Selective bluffs; MVP under-bluff vs unknowns OK |
| Exact solver frequencies as truth | Unimplementable live; rake/pool differ | Coarse bands + heuristics |
| Set-mine any pair any depth | Needs implied odds | Prefer deeper / aggressive opponents |

---

## 7) Suggested MVP data model

Reuse: `Position`, `ActionType`, `Street`, `HandClass`, `Grade`, `CoachAdvice`, `CoachGrade`, `potOdds`, `spr`, `outsToEquity`.

Add in `src/coach/`:

- `BoardTag`, `SprBand`, `FrequencyBand`, `PreflopBucket`
- Preflop range tables: `Record<Position, Set<HandKey>>` for open/3bet/call
- `CoachRule[]` ordered lists per street
- `REASON_STRINGS: Record<ReasonCode, string>` (A2)

---

## 8) Assumptions / unknowns

- **No rake** in EV teaching (cash rake would fold more thin river calls).  
- **No HUD** — population defaults for recreational $1/$2.  
- **Heads-up postflop first**; multiway = tighten only.  
- **Cash ≠ MTT** (no ICM); don't import shove charts.  
- Hand class classifier accuracy is the main unknown — Dealer must map evaluator category + draw detect → `HandClass`.  
- Exact open % may vary by rake; charts are teaching-safe approximations from Upswing-style 6-max 100bb.  
- Live app latency: rule match O(rules), no solver.

---

## 9) Handoff notes for planner / Dealer B4

**Build first**

1. Preflop open + BB defend tables + size constants.  
2. `classifyHandClass` + board tags.  
3. Flop c-bet + face-bet rules using SPR + HandClass.  
4. `gradeAction` + A2 reason strings.  
5. Turn/river thin slice (value/odds/fold air).

**Defer:** 4-bet polar mixes, multiway XR trees, exploit toggles, rake-aware thresholds.

**Files:**  
- This doc → heuristics  
- `A2-coach-strings.md` → UI copy  
- `coachHeuristics.examples.ts` → typed seeds for `src/coach/`

---

## Sources

1. Upswing — Preflop RFI Strategy: https://upswingpoker.com/preflop-open-strategy-rfi-explained/  
2. Upswing — Ultimate Guide to 6-Handed Poker: https://upswingpoker.com/6-handed-max-poker-strategy/  
3. Upswing — Preflop charts hub: https://upswingpoker.com/charts/  
4. Upswing — 3-Bet Preflop Strategy: https://upswingpoker.com/3-bet-strategy-aggressive-preflop/  
5. Upswing — Level-Up 3-bet sizing notes: https://upswingpoker.com/podcast/ep2-three-bet/  
6. Upswing — Check-raise flop tips: https://upswingpoker.com/check-raise-lucid/  
7. Upswing — Misconceptions: https://upswingpoker.com/poker-misconceptions-common-falsehoods/  
8. GTO Wizard — Flop Heuristics IP C-Betting Cash: https://blog.gtowizard.com/flop-heuristics-ip-c-betting-in-cash-games/  
9. GTO Wizard — Stack-to-Pot Ratio: https://blog.gtowizard.com/stack-to-pot-ratio/  
10. GTO Wizard — C-Betting OOP in 3-Bet Pots: https://blog.gtowizard.com/c-betting-oop-in-3-bet-pots/  
11. Pot odds / rule of 2–4 primers: https://www.vip-grinders.com/poker-strategy/pot-odds/ ; PokerStars School beginners PDF  
12. Unmatched Poker — Pot Odds, Equity, SPR: https://unmatchedpoker.com/strategy/pot-odds-equity-spr  

**Flag outdated:** “Always bet for value thin every street”, “never fold top pair”, automatic limping traps — pre-solver live lore; prefer 2018+ texture/SPR thinking above.
