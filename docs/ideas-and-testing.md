# Iron & Ash — Ideas & Testing Log

Live tracking of balance observations, mechanics ideas, and UI improvement ideas.
Updated after each sim run or testing session.

---

## Player Level Variability Results

**Script:** `scripts/test-player-levels.ts` — 100 games × 15 scenarios across all player counts.
**Key question:** does AI skill level matter, and by how much?

### Findings (100 games per scenario, Warriors/Mages for 1v1, Warriors/Merchants/Mages for 3p, etc.)

| Scenario | Hard Win% | Easy Win% | Gap | Interpretation |
|---|---|---|---|---|
| 1v1 — Hard vs Easy | 56% | 44% | **+12pp** | Moderate skill edge in 1v1 |
| 1v1 — Medium vs Easy | 65% | 35% | — | Warriors faction edge > skill |
| 1v2 — Hard vs 2 Easy | 29% | **43%** (Merchants) | **-14pp** | Easy AI wins! |
| 1v2 — Hard+Med+Easy | 33% | 20% | **+13pp** | vs *single* Easy = advantage |
| 1v3 — Hard vs 3 Easy | 19% | **26–32%** | **-7pp** | Hard loses to faction-strong Easy |
| 1v3 — Mixed H/M/E/E | 23% | 28% | **-5pp** | Consistent multi-player penalty |

### Key design insights

1. **Faction > skill in all configurations.** Warriors→Mages is an 18–25pp faction gap; skill only adds/removes ~12pp. A skilled player with a weak faction loses to an unskilled player with a strong faction.

2. **In multi-player, Hard AI can lose to Easy AI.** Easy AI's 30% noise makes it unpredictable. Hard AI plays deterministically and becomes a readable, predictable threat. Easy Merchants (with a good passive) outperforms Hard Warriors in 3-player by 14pp because Hard AI telegraphs its plays.

3. **"Randomness as strategy" effect.** Noise helps weak factions more than it hurts strong ones. Easy Mages wins 44% vs Hard Warriors in 1v1 — Hard Mages only wins 41%.

4. **Implication for balance:** the target audience (casual players) may be better served by Medium difficulty for all AIs rather than Hard. The game should feel tense even for beginners.

### Design recommendation
For single-player vs AI: default Hard AI for a satisfying 1v1 challenge. For watch-mode (all AI): all Medium gives the most representative faction balance. Mixed difficulties are an interesting chaos mode.

---

## Current Status (latest) — Player-Count Balance Pass

**All three player counts CLEAN ✅ — no faction warnings in 1v1, 1v2, or 1v3**

### 1v1 (2-player) — 560 games, exhaustive 28-matchup round-robin
| Faction | Win% | Δ from mean | Status |
|---|---|---|---|
| Assassins | 57.1% | +7.1pp | ✅ |
| Rangers | 55.0% | +5.0pp | ✅ |
| Warriors | 52.1% | +2.1pp | ✅ |
| Beastmasters | 52.1% | +2.1pp | ✅ |
| Paladins | 47.9% | -2.1pp | ✅ |
| Necromancers | 46.4% | -3.6pp | ✅ |
| Merchants | 45.0% | -5.0pp | ✅ |
| Mages | 44.3% | -5.7pp | ✅ |
- Round-7 reach: 51.6% (just over 50% target — threshold 7 is correct for 2-player)
- Fortress turnover: 40.9% ⚠ **structural** — in 1v1, fortresses get divided and rarely contested; 40-45% is the realistic 2-player ceiling, not a balance problem

### 1v2 (3-player) — 300 games, 6 balanced lineups × 50 games
| Faction | Win% | Δ from mean | Status |
|---|---|---|---|
| Paladins | 41.0% | +8.2pp | ✅ |
| Warriors | 40.0% | +7.2pp | ✅ |
| Beastmasters | 39.0% | +6.2pp | ✅ |
| Merchants | 35.0% | +2.2pp | ✅ |
| Assassins | 34.7% | +1.9pp | ✅ |
| Mages | 25.0% | -7.8pp | ✅ |
| Rangers | 25.0% | -7.8pp | ✅ |
| Necromancers | 23.0% | -9.8pp | ✅ |
- Round-7 reach: 38.7% ✅ | Fortress turnover: 62.0% ✅

### 1v3 (4-player) — 200 games, 4 balanced lineups × 50 games
| Faction | Win% | Δ from mean | Status |
|---|---|---|---|
| Beastmasters | 33.0% | +8.0pp | ✅ |
| Merchants | 31.0% | +6.0pp | ✅ |
| Assassins | 27.0% | +2.0pp | ✅ |
| Mages | 27.0% | +2.0pp | ✅ |
| Rangers | 21.0% | -4.0pp | ✅ |
| Paladins | 21.0% | -4.0pp | ✅ |
| Necromancers | 20.0% | -5.0pp | ✅ |
| Warriors | 20.0% | -5.0pp | ✅ |
- Round-7 reach: 46.0% ✅ | Fortress turnover: 64.0% ✅

### Cross-count faction archetypes (design insight)
- **"Small-game specialists"**: Warriors, Assassins — dominate 1v1, fall in 4-player
- **"Scaling factions"**: Beastmasters — most consistent spread (52% → 39% → 33%)
- **"Volatile factions"**: Necromancers — strong 1v1 (46%), weak in multi-player (23%, 20%)
- **"Mid-game kings"**: Paladins — unremarkable in 1v1/4p, surprisingly strong 3-player (41%)

### Previous best (mixed player count sim, 500 games medium)
| Faction | Win% | Δ from mean | Status |
|---|---|---|---|
| Warriors | 30.1% | -2.4pp | ✅ |
| Assassins | 39.2% | +6.7pp | ✅ |
| Mages | 27.9% | -4.6pp | ✅ |
| Necromancers | 27.0% | -5.5pp | ✅ |
| Merchants | 40.4% | +7.9pp | ✅ |
| Rangers | 34.8% | +2.3pp | ✅ |
| Paladins | 31.8% | -0.7pp | ✅ |
| Beastmasters | 29.1% | -3.4pp | ✅ |
- Round-7 reach: 41.0% ✅ | Fortress turnover: 57.0% ⚠

---

## Previous Status (before fixes)

**Sim: 400 games, medium difficulty**
| Faction | Win% | Δ from mean | Status |
|---|---|---|---|
| Warriors | 43.4% | +11.2pp | ❌ Too strong |
| Assassins | 25.9% | -6.3pp | ✅ OK |
| Mages | 19.9% | -12.3pp | ❌ Too weak |
| Necromancers | 24.5% | -7.7pp | ⚠ Slightly weak |
| Merchants | 32.4% | +0.2pp | ✅ OK |
| Rangers | 44.7% | +12.5pp | ❌ Too strong |
| Paladins | 42.6% | +10.4pp | ❌ Too strong |
| Beastmasters | 24.1% | -8.1pp | ⚠ Slightly weak |

**Key metrics**
- Round-7 reach: 49% ✅ (target 30-50%)
- Fortress turnover: 56.3% ⚠ (target ≥60%)
- Merc hire rate: 9.36% (low — mercs underused)

---

## Root Cause Analysis

**Why iron factions dominate (Warriors/Rangers/Paladins):**
1. Iron → die upgrades (2 iron + 1 gold → better dice)
2. Iron → barracks expand (1 iron + 2 gold → more dice)
3. Iron → Watchtower (3 iron, 2VP, ALL terrains — too accessible!)
4. All three compound → more dice → more regions → more VP

**Why Mages are weak:**
- Essence + gold passive, but essence only useful for Arcane Spire (mountain/swamp/ruins restriction)
- Arcane Precision is strong tactically but AI uses it sub-optimally
- No iron means can't build the universal Watchtower

**AI structure scoring bug:**
- `estimateVPGain('build-structure') = 2` (correct)
- `estimateResourceGain('build-structure') = 0` (WRONG — should be negative, costs 3-5 resources)
- AI treats structures as "free 2VP" instead of "costly investment"

---

## Fixes In Progress / Applied

### Player-count balance pass (this session)
- [x] **Threat track player-count scaling**: `threatTrackThresholdByPlayerCount` in rules.json
  - 2-player threshold: 7 (games shorter, less contested → hits 50% round-7 reach)
  - 3-player threshold: 8 (unchanged)
  - 4-player threshold: 10 (games faster with 4 players battling → slow to 46% round-7 reach)
- [x] **Rangers Pathfinder nerf**: +1 iron+gold+essence → +1 gold+essence (iron stacked with +1 iron passive)
- [x] **Rangers goalFocus nerf**: 0.5 → 0.35 (was 67% in 1v1; now 55%)
- [x] **Merchants Trade Deal nerf**: +2 gold → +1 gold (passive already gives +2/round)
- [x] **Merchants AI nerf**: enginePriority 0.9→0.75, goalFocus 0.8→0.65
- [x] **Mages AI buff**: fortressPriority 0.6→0.8, battlePriority 0.5→0.65, riskTolerance 0.4→0.5, resourceHoarding 0.5→0.35, combo 0.65→0.55, engine 0.7→0.55
- [x] **Assassins AI nerf**: goalFocus 0.7→0.45, riskTolerance 0.65→0.4, mercenaryAffinity 0.7→0.55
- [x] **Necromancers AI fix**: enginePriority 0.8→0.6, mercenaryAffinity 0.5→0.65 (to use Soul Conversion more)
- [x] **Warriors AI trim**: battlePriority 0.9→0.75 (was 61% in 1v1 lineup artifact; 52% with balanced matchups)
- [x] **Game log pruning**: filter log to current+previous round at end-of-round to prevent memory accumulation in sim
- [x] **Test script overhaul**: exhaustive 28-matchup 1v1 round-robin + fresh seeds (v2-prefix) for accurate baseline
- [x] **Necromancers passive revert**: gold passive removed (overcorrected to 61% in 1v1); essence only is correct

### Previous balance fixes
- [x] Watchtower restricted to plains/forest only (was all-terrain — favoured iron factions)
- [x] Rangers goalFocus 0.8→0.5 (was hyper-chasing round goals)
- [x] score.ts: enginePriority now tilts upgrade-die + expand-barracks (was cards only)
- [x] Fortress usurp threat: +2 → +1 (less deterrence = more contested fortresses)
- [x] Threat threshold: 10 → 8 (compensates for less usurp threat per event)
- [x] Specialist round-1 cost: 3 gold → 2 gold (R1 claim rate 36% → 53%)
- [x] Merchants mercenaryAffinity: 0.8 → 0.6 (was winning at 43% via merc spam)
- [x] Beastmasters Wild Surge face: 4 → 5 (more impactful)
- [x] Rules audit: fixed misleading comments and descriptions in code

### Previously applied balance changes
- Assassins Shadow Step nerfed: any value → max ≤3 only
- Merchants Trade Deal nerfed: +3 gold → +2 gold
- Mages passive buffed: essence → essence + gold
- Rangers Pathfinder tuned: +1/+1/+1 → +2/+2/+1

---

## Mechanic Ideas to Test

### High priority
1. **Battle incentive** — ✅ DONE. Attacker now gains +1 iron on battle win (war spoils).
   Merc hire rate: 9% → 12.4%. Battle heuristic also boosted (+0.4 iron-equivalent estimate).
   AI battlePriority multiplier means Warriors benefit most; all factions now more willing to fight.

2. **Fortress stickiness** — turnover 56% → still 56.2% (target ≥60%). Persistent structural issue.
   The 1v1 structural ceiling is ~40-45%; 3-player/4-player both hit 62-76% when lineups are fair.
   The mixed-mode sim average of 56% may reflect the 2-player games dragging the average down.
   Next idea: test whether reducing fortress `garrisonMinDice` from 1 to 0 increases turnover.

3. **Specialist merc usage** — ✅ DONE. Extended discount to rounds 1-2 (cost 2 gold in R1+R2).
   R1 claim: 50% ✅ | R2 claim: 45% ✅ (was 32%, target ≥40%)
   Also fixed: specialist metrics were broken by log pruning; fixed with dedicated mercHireLog.

4. **Structures terrain balance** — Watchtower on all terrains favours iron factions.
   Idea: each terrain type should have ONE structure that works best there:
   - Fortress/Mountain: Citadel (exists, 4VP)
   - Plains/Forest: Market (exists, 3 gold, 2VP)
   - Mountain/Swamp/Ruins: Arcane Spire (exists, 3 essence, 2VP)
   - Replace Watchtower with terrain-specific "Outpost": 2 iron, 1VP, plains/forest only

5. **Essence value** — essence is the weakest resource.
   Idea: make cards cheaper (essence discount), or add a card that converts essence to VP.

### Medium priority
6. **Round goal variety** — are all 7 round goals actually triggering different strategies?
   Current goals: most-iron, most-gold, most-essence, most-regions, most-fortresses,
   least-resources, most-dice-placed. Need to verify goal diversity.

7. **Combine rate** — at 37%, combines are moderately used. Good.
   Idea: "Great Combine" bonus: combining 2 dice of max face value gives +1 VP.

8. **Necromancer soul conversion** — tried gold passive buff; overcorrected to +11pp.
   Current design: essence-only passive, earn gold naturally. Soul Conversion fires when
   Necromancers choose to invest in mercs. Personality tuned (mercenaryAffinity 0.65)
   to prioritize mercs when gold is available. **May revisit if 3-player win rate stays below 25%.**

9. **Beastmaster Wild Surge** — ✅ already updated to face 5 (was 4). Beastmasters now
   scales well across player counts (52% → 39% → 33%), best consistency of any faction.

### Lower priority / Future
10. **Event cards** — random global events once per round (flood, drought, siege, festival).
    Disrupts optimal play, creates memorable moments.

11. **Alliance mechanic** — 2 players can declare "non-aggression" for 1 round.
    No battles between them, but they split contested region VP. Adds diplomacy.

12. **Terrain bonuses (passive)** — garrisoning different terrains gives minor bonuses:
    - Fortress: +1 iron/round (as already implemented via fortress VP)
    - Forest: +1 gold/round
    - Mountain: +1 iron/round (for upgrades)
    - Swamp: +1 essence/round
    Good for late game economy diversification.

13. **Die wear** — a die that has been placed and retrieved 3+ times degrades (range -1).
    Creates "attrition" mechanic and rewards upgrading dice before they wear.

---

## UI Ideas to Implement

### High priority
- [x] **Autoplay speed slider** — ✅ already implemented (80ms–2000ms, 🐢/🐇 visual, shows during autoplay).
- [ ] **Battle animation** — when battle happens, flash/highlight the attacker and defender dice.
- [x] **Round summary panel** — ✅ DONE. Full-screen glass-morphism overlay at each round end.
  Shows: round number, active goal, per-player VP gained this round + total VP, 1st/2nd/3rd rank.
  Auto-dismisses in autoplay (1.8–3.5s based on speed setting). "Continue →" button in step mode.
- [ ] **Faction ability tooltip** — hover on faction name to see active ability description.
- [ ] **Merc hire count** — show running count in merc bar ("Spec (3) → p2 claimed").

### Medium priority
- [ ] **Score trend graph** — small sparkline in player card showing VP over rounds.
- [ ] **Move history** — last 5 moves for each player visible in their card.
- [ ] **Map zoom** — click region to expand it in a modal with full details.
- [ ] **AI confidence display** — show top-3 candidates with their scores in AI log.
- [ ] **Colour-blind mode** — replace player palette with shapes in addition to colours.

### Lower priority
- [ ] **Sound effects** — dice roll (rattle), place die (click), fortress taken (boom).
- [ ] **Animated map tiles** — fog of war clears as regions unlock.
- [ ] **Victory screen** — full-screen celebration with winning faction art.
- [ ] **Print-and-play export** — generate a PDF rulebook from current config.

---

## Sim Results History

| Date | Config | Games | Warriors | Rangers | Mages | Assassins | Notes |
|---|---|---|---|---|---|---|---|
| Latest | 500 mixed | 500 | 29.6% ✅ | 32.1% ✅ | 32.2% ✅ | 37.2% ✅ | Post-war-spoils, specialist fix |
| Prior  | 1v1 28-matchup | 560 | 52.1% ✅ | 55.0% ✅ | 44.3% ✅ | 57.1% ✅ | All clean, exhaustive round-robin |
| Latest | 1v2 3-player | 300 | 40.0% ✅ | 25.0% ✅ | 25.0% ✅ | 34.7% ✅ | All clean |
| Latest | 1v3 4-player | 200 | 20.0% ✅ | 21.0% ✅ | 27.0% ✅ | 27.0% ✅ | All clean |
| Earlier | Mixed 2-4p | 500 | 30.1% ✅ | 34.8% ✅ | 27.9% ✅ | 39.2% ✅ | Best previous benchmark |
| Earlier | Mixed 2-4p | 400 | 43.4% ❌ | 44.7% ❌ | 19.9% ❌ | 25.9% ✅ | Post-structures regression |

---

## Balance Targets

| Metric | Target | Warning threshold |
|---|---|---|
| Per-faction win rate | ~25% (4-player) | >10pp from mean |
| Round-7 reach | 30–50% | outside range |
| Fortress turnover | ≥60% | below 60% |
| Specialist round-1 claim | ≥40% | below 40% |
| Merc hire rate | >10% per eligible turn | below 5% |
| Combine rate | 30–50% | outside range |
