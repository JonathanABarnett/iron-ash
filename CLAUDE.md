# Iron & Ash — Claude Context

Medieval-fantasy dice-placement game playtesting tool. Primary purpose: **balance validation through simulation**. Interactive play (including a scripted tutorial) is a secondary, human-readable window into the engine.

## Tech Stack

| Concern | Choice |
|---|---|
| Build tool | **Vite** (fast dev loop, client-side only) |
| Language | **TypeScript** strict + `noUncheckedIndexedAccess` |
| UI | **React 19** |
| State | **Zustand** (game store + tutorial store) |
| Styling | **Tailwind CSS v4** |
| Charts | **Recharts** (sim reports) |
| Testing | **Vitest** |
| RNG | **seedrandom** (deterministic, seeded) |
| Package manager | **pnpm** |
| Node | 20 LTS |

## Key Commands

```bash
pnpm dev            # Vite dev server (localhost:5173)
pnpm build          # Production build → dist/
pnpm preview        # Preview production build locally
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest (93 tests, ~3s)
pnpm lint           # ESLint

# Headless sim CLI
pnpm sim            # runs scripts/run-sim.ts via tsx

# Tutorial QA (run from project root)
npx tsx scripts/test-tutorial.ts           # Happy-path: 22/22 steps
npx tsx scripts/test-tutorial-deviation.ts # Resilience: any-action still advances
```

## Deployment — Two Branches, Two URLs

Both branches auto-deploy via GitHub Actions (`.github/workflows/deploy.yml`) to the same `gh-pages` branch, using `peaceiris/actions-gh-pages` with `keep_files: true` so they coexist.

| Branch | URL | Purpose |
|---|---|---|
| `master` | https://JonathanABarnett.github.io/iron-ash/ | **v1** — stable, locked |
| `steam` | https://JonathanABarnett.github.io/iron-ash/next/ | **v2** — Steam / map redesign work |

- `master` vite base: `/iron-ash/`
- `steam` vite base: `/iron-ash/next/`
- All asset and fetch paths must use `import.meta.env.BASE_URL` — **never** bare `/` paths
- Common trap: `<img src="/art/factions/X.jpg">` breaks on Pages; use `` `${import.meta.env.BASE_URL}art/factions/${id}.jpg` ``
- Same trap applies to `fetch()` calls (e.g. rulebook markdown)

**Do not merge `steam` back into `master` without explicit intent** — they have different vite base URLs and are intentionally diverged.

## Project Structure

```
iron-ash/
├─ config/              # JSON data files (hot-reloadable)
│  ├─ factions.json     # 8 factions, abilities, starting resources
│  ├─ regions.json      # 16 regions, terrain, VP, placement rules
│  ├─ cards.json
│  ├─ round-goals.json
│  ├─ secret-goals.json
│  ├─ structures.json
│  ├─ costs.json
│  └─ rules.json        # round count, threat thresholds, specialist sequence, R7 toggles
├─ src/
│  ├─ engine/           # PURE — no React, no DOM, no Date.now()
│  ├─ ai/               # Heuristic AI with faction personalities
│  ├─ simulation/       # Headless batch runner + metrics
│  └─ ui/               # React app, Zustand stores, components
├─ scripts/
│  ├─ test-tutorial.ts          # 22-step tutorial happy-path integration test
│  ├─ test-tutorial-deviation.ts # Deviation-resilience test
│  └─ run-sim.ts                # CLI sim runner
└─ tests/
   ├─ engine/           # Vitest unit tests
   ├─ ai/
   └─ simulation/
```

## Critical Architectural Rules

- **Engine is pure**: no React, no Zustand, no DOM inside `src/engine/**` or `src/ai/**`. ESLint `no-restricted-imports` enforces this.
- **All randomness through `src/engine/rng.ts`**: never call `Math.random()` or `crypto.randomUUID()` in engine or AI code.
- **All state transitions are pure functions**: `(GameState, Move) → GameState` via Immer.
- **Configs are loaded once** at game-start through `src/engine/config-loader.ts` (zod-validated). Bad config fails loudly.

## Tutorial System

### Architecture

The tutorial (`src/ui/pages/TutorialPage.tsx`) is a fully scripted 22-step walkthrough of 2 complete rounds.

**Deterministic dice forcing:**
```typescript
const TUTORIAL_DICE: Record<number, Record<string, number[]>> = {
  1: { p1: [6, 3, 2], p2: [5, 3] },
  2: { p1: [6, 3, 2], p2: [4, 2] },
};
```
After each `rollPhase()`, `applyForcedTutorialDice(state)` overwrites both players' barracks dice with the above values in tier order (`1-6 > 3-6 > 2-5 > 1-3`).

**Step kinds:**
- `info` — modal-only narrative, no game action required
- `place` — user takes an action (ANY legal action advances; the `move` field is a suggestion)
- `ai-turn` — engine auto-loops AI until the human is next or the round ends
- `end-of-round` — calls `endOfRound()` then transitions
- `new-round` — calls `rollPhase()` + `applyForcedTutorialDice()` then transitions
- `finish` — tutorial complete, transitions to free-play mode on the same game state

**Spotlight system:**  
Each step can set `anchor: 'data-tour-attribute-value'`. The tutorial renders a `<div className="tutorial-spotlight">` which applies a pulsing purple ring + full-screen dimming via CSS `box-shadow`. If `anchor` is undefined the step is purely modal.

`data-tour` attributes in the game UI:
- `threat-bar`, `action-menu`, `merc-bar`, `map`, `player-cards`, `goal-bar`, `fortress-strip`

**React hook ordering:** All `useEffect` calls (including the spotlight effect) must appear **before** any conditional `return` statements (e.g. the `<TutorialSplash>` gate). The `firstAnchor` variable is computed before any early returns for this reason.

**Free-play after tutorial:** When the tutorial finishes, `freePlayMode = true` and the user continues the same game with the normal action menu + AI autoplay toggle.

### Designing Tutorial Steps

The 22 steps are structured so:
- R1: User places three dice, passes → Mages take their turns → end of round
- R2: User combines for fortress garrison (6+3=9, un-usurpable by Mages who max at 8), hires Specialist, passes → Mages take their turns → end of round → tutorial ends

Fortress math: to usurp a garrison with sum S, the attacker needs face value > S+1.
- User's 6+3=9 garrison threshold: attacker needs >10
- Mages' max combine: 5+3=8 — cannot usurp

### Running QA

```bash
# Happy path — verify all 22 steps apply legal moves and advance state
npx tsx scripts/test-tutorial.ts

# Deviation resilience — every user step picks the FIRST non-pass action
# (ignores the suggested move). Verifies the game doesn't break.
npx tsx scripts/test-tutorial-deviation.ts
```

Both scripts share the same `TUTORIAL_DICE` forcing logic as the UI.

## Engine — Notable Details

### mercCost (src/engine/mercenaries.ts)

Faction discounts **stack on top of** base/special costs — they do NOT short-circuit.

```typescript
export function mercCost(state, rules, hirerId?, slot?): number {
  if (state.freeForAll && rules.freeForAllToggles.allMercsFree) return 0;
  let cost = DEFAULT_MERC_COST;                    // 3
  if (slot === 'specialist' && state.round <= 2) cost = 2;   // early-round discount
  if (hirerId && slot === 'low') {                 // Assassins First Refusal
    const player = state.players[hirerId];
    if (player?.factionId === 'assassins') cost = Math.min(cost, 2);
  }
  if (hirerId) {                                   // Warriors/Necromancers -1
    const player = state.players[hirerId];
    if (player) cost = Math.max(0, cost - getMercDiscount(player.factionId, hirerId));
  }
  return cost;
}
```

Warriors Specialist R1-R2 correctly costs **1 gold** (2 base − 1 warrior discount), not 2.

### Threat Track Thresholds (src/engine/rounds.ts)

The engine checks `threatTrackThresholdByPlayerCount[playerCount]` **first** and falls back to `threatTrackThreshold` only if the map key is absent. When writing tests with a custom low threshold, override **both**:

```typescript
const lowThresholdRules = {
  ...parseRules(rulesJson),
  threatTrackThreshold: 3,
  threatTrackThresholdByPlayerCount: { '2': 3, '3': 3, '4': 3 },
};
```

### Per-Player Difficulty (src/ai/decide.ts)

`pickMove()` accepts `difficulty: Difficulty` in `RunOptions`. The game store supports `playerDifficulties?: Difficulty[]` (indexed by turn order) so each AI player can run at a different skill level.

## AI Personalities — Current Tuned Values

After 4 balance passes, the canonical values are (see `src/ai/personalities.ts`):

| Faction | Key weights (post-tuning) |
|---|---|
| Warriors | `fortressPriority: 0.9`, `battlePriority: 0.75` (was 0.9) |
| Merchants | `enginePriority: 0.75` (was 0.9), `mercenaryAffinity: 0.6` (was 0.8) |
| Assassins | `riskTolerance: 0.4` (was 0.65 → 0.5 → 0.4) |
| Mages | `combinationAffinity: 0.55` (was 0.8) |
| Necromancers | `enginePriority: 0.6` (was 0.8) |

If you see test failures in `tests/ai/personalities.test.ts` after a balance pass, update the expected constants there to match the new values in `personalities.ts`.

## Balance Targets (Phase 4 sim)

All 8 factions must land within ±10 percentage points of each other across 1v1, 1v2, and 1v3 player-count matchups at `difficulty: 'medium'`. Run `pnpm sim --games=1000 --difficulty=medium` to get a fresh read. Specialist claim rate per round is tracked separately — R1 target ≥40%.

## Simulation CLI

```bash
pnpm sim --games=1000 --difficulty=medium --output=runs/$(date +%Y-%m-%d).json
```

Output JSON validates against the zod schema in `src/simulation/output.ts`. `warnings[]` flags any balance-target violations. The sim runs in a Web Worker when triggered from the UI (`/sim` route) to keep the page responsive.

## Open Design Questions

See `docs/open-questions.md`. Current defaults:
- Battle: defender +1 bonus; dice spent regardless of win/loss
- Fortress recall: voluntary recall allowed; accumulated VP not refunded
- R7 free-for-all toggle bag in `config/rules.json` (`free: true`, `allMercsFree: true`, `halfPriceCards: true`, `specialistChoosable: true`, `waiveCardHandLimit: false`)
