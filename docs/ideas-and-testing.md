# Iron & Ash — Ideas & Testing Log

Live tracking of balance observations, mechanics ideas, and UI improvement ideas.
Updated after each sim run or testing session.

---

## Current Status (latest)

**Sim: 500 games, medium difficulty — CLEAN ✅**
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

**Key metrics**
- Round-7 reach: 41.0% ✅ (target 30-50%)
- Fortress turnover: 57.0% ⚠ (target ≥60%, close)
- Specialist R1 claim: 53% ✅ (was 36%, fixed by round-1 discount)
- Specialist R2 claim: 32.4% ⚠ (target ≥40% — value-5 specialist underused)
- Combine rate: 37.8% ✅

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

### Balance fixes applied this session
- [x] Watchtower restricted to plains/forest only (was all-terrain — favoured iron factions)
- [x] Rangers Pathfinder: back to +1/+1/+1 baseline (versatility, not power)
- [x] Rangers AI personality: goalFocus 0.8→0.5 (was hyper-chasing round goals)
- [x] score.ts: enginePriority now tilts upgrade-die + expand-barracks (was cards only)
- [x] Fortress usurp threat: +2 → +1 (less deterrence = more contested fortresses)
- [x] Threat threshold: 10 → 8 (compensates for less usurp threat per event)
- [x] Specialist round-1 cost: 3 gold → 2 gold (R1 claim rate 36% → 53%)
- [x] Merchants mercenaryAffinity: 0.8 → 0.6 (was winning at 43% via merc spam)
- [x] Beastmasters Wild Surge face: 4 → 5 (more impactful)
- [x] **Rules audit: fixed misleading comments and descriptions in code**
  - abilities.ts header: corrected all ability descriptions to match actual code
  - Assassins First Refusal: "1 gold" → "2 gold"
  - Mages Arcane Analysis: "rerolled" → "set to MAX face value (deterministic)"
  - Trade Deal: "+3 gold" → "+2 gold"
  - Warriors description: added note about −1 merc discount
  - Beastmasters description: specified "face value 5" explicitly

### Previously applied balance changes
- Assassins Shadow Step nerfed: any value → max ≤3 only
- Merchants Trade Deal nerfed: +3 gold → +2 gold
- Mages passive buffed: essence → essence + gold
- Rangers Pathfinder tuned: +1/+1/+1 → +2/+2/+1

---

## Mechanic Ideas to Test

### High priority
1. **Battle incentive** — battles are too rare (merc hire rate ~9%, battle rate even lower).
   Idea: attacker gains 1 extra iron (war spoils) on a win. Would Warriors/Rangers use this?

2. **Fortress stickiness** — turnover 56% below 60% target.
   Idea: reduce usurp bonus from +2 threat to +1 (less deterrent for attacking fortresses)?
   OR: reduce fortress garrison dice requirement by 1 to make usurping easier.

3. **Specialist merc usage** — only 38% claimed in round 1 (target ≥40%).
   Idea: AI personality weights for specialist need tuning, or specialist value 6 is too expensive.

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

8. **Necromancer soul conversion** — used mercs becoming permanent sounds good but
   Necromancers have no gold income, so they can't hire mercs. Passive is wasted.
   Idea: give Necromancers a small gold passive (+1/round), or change Soul Conversion
   to trigger on regular dice returning to barracks (not just mercs).

9. **Beastmaster Wild Surge** — adds 1-6 die face 4. Might not be strong enough.
   Idea: Wild Surge die gets face 5 instead of 4, making it immediately useful for more regions.

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
- [ ] **Autoplay speed slider** — currently fixed 120ms. User wants control (100ms–2000ms).
- [ ] **Battle animation** — when battle happens, flash/highlight the attacker and defender dice.
- [ ] **Round summary panel** — at end-of-round, show what VP was scored this round (goals + fortress).
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

| Date | Games | Difficulty | Warriors | Rangers | Paladins | Mages | Notes |
|---|---|---|---|---|---|---|---|
| Session | 400 | medium | 43.4% ❌ | 44.7% ❌ | 42.6% ❌ | 19.9% ❌ | Post-structures regression |
| Earlier | 500 | medium | 28.6% ✅ | 40.1% ✅ | 31.8% ✅ | 27.3% ✅ | Best balance achieved |
| Earlier | 400 | medium | 32.8% ✅ | 37.3% ✅ | 31.4% ✅ | 28.1% ✅ | After merc relationship tuning |

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
