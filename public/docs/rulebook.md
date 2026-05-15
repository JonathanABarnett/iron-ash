# Iron & Ash — Rulebook

> **Version**: current playtesting build · all values match the live config.  
> Last updated from sim pass 3 (500-game validated, no faction warnings).

---

## Contents

1. [Overview](#1-overview)
2. [Setup](#2-setup)
3. [Round Structure](#3-round-structure)
4. [Roll Phase](#4-roll-phase)
5. [Action Phase](#5-action-phase)
6. [Actions Reference](#6-actions-reference)
7. [Fortresses & Garrisons](#7-fortresses--garrisons)
8. [Mercenaries](#8-mercenaries)
9. [Cards](#9-cards)
10. [Structures](#10-structures)
11. [Threat Track & Early End](#11-threat-track--early-end)
12. [End-of-Round Resolution](#12-end-of-round-resolution)
13. [Round Goals](#13-round-goals)
14. [Secret Goals](#14-secret-goals)
15. [Scoring & Winning](#15-scoring--winning)
16. [Round 7 — Free-for-All](#16-round-7--free-for-all)
17. [Faction Reference](#17-faction-reference)
18. [Region Reference](#18-region-reference)
19. [FAQ](#19-faq)
20. [Quick Reference Card](#20-quick-reference-card)

---

## 1. Overview

Iron & Ash is a 2–4 player dice-placement game set in a medieval-fantasy world. Each player controls an asymmetric faction with unique dice, resources, and abilities. Compete to garrison fortresses, place dice on valuable regions, and outmanoeuvre opponents over 7 rounds.

**Victory**: highest combined VP at game end.

**Resources**: three types — **Iron** ⚙, **Gold** 🪙, **Essence** 💎. Cap: 8 of each per player.

**Dice**: each die has a **range** (1-3, 2-5, 3-6, or 1-6) and shows a **face value** after rolling. Higher range = stronger die. Dice live in your **barracks** until placed.

---

## 2. Setup

1. Each player picks a faction and takes that faction's starting dice, resources, and a barracks of the listed maximum capacity.
2. Assign player order (random).
3. Shuffle the round goal pool; assign one goal per round (rounds 1–7).
4. Deal each player 2 secret goals from the pool (kept private until scoring).
5. Place the specialist die at value **6** (it counts down each round: 6→5→4→3→2→1→1).
6. Set the threat track to **0**. The threshold is **8** — reaching it ends the game early.

### Starting Resources & Dice by Faction

| Faction | Dice | Iron | Gold | Essence | Barracks Cap |
|---|---|---|---|---|---|
| Warriors | 1×(1-6) + 2×(1-3) | 2 | 1 | 0 | 8 |
| Assassins | 1×(1-6) + 2×(1-3) | 1 | 2 | 0 | 5 |
| Mages | 1×(1-6) + 1×(1-3) | 0 | 1 | 2 | 6 |
| Necromancers | 1×(1-6) + 2×(1-3) | 1 | 0 | 2 | 7 |
| Merchants | 1×(1-6) + 1×(1-3) | 0 | 3 | 0 | 6 |
| Rangers | 1×(1-6) + 2×(1-3) | 1 | 1 | 1 | 7 |
| Paladins | 1×(1-6) + 1×(1-3) | 1 | 1 | 1 | 7 |
| Beastmasters | 1×(1-6) + 1×(1-3) | 1 | 0 | 2 | 6 |

---

## 3. Round Structure

Each round has three phases in order:

```
ROLL PHASE → ACTION PHASE → END-OF-ROUND RESOLUTION
```

Repeat for rounds 1–7, or until the threat track reaches 8.

---

## 4. Roll Phase

- **All players simultaneously** roll all barracks dice (dice not garrisoning a fortress).  
  *Garrisoned dice do not roll — their face values are locked until they leave.*
- After rolling, the merc pool refreshes: a new Low (1-3), High (3-6), and Specialist die appear.
- The market refreshes: new cards become available.
- **Passives fire**: each faction gains its passive resource income (see faction table).

### Die Faces (custom, not standard d6)

| Range | Faces |
|---|---|
| 1-3 | 1, 1, 2, 2, 3, 3 |
| 2-5 | 2, 2, 3, 3, 4, 5 |
| 3-6 | 3, 3, 4, 5, 6, 6 |
| 1-6 | 1, 2, 3, 4, 5, 6 |

---

## 5. Action Phase

Players take **turns in order**, each performing exactly **one action** per turn. A turn passes to the next player after each action.

**Passing**: if you choose to pass, you are **done for the round** — you skip all remaining turns this round.

The round ends when **every player has either passed OR has no legal non-pass actions**.

> **Note**: You can still play cards, hire mercs, build structures, or use your active ability even after exhausting placement options — these count as actions and don't force a pass.

---

## 6. Actions Reference

### Place a Die

Put one barracks die onto a non-fortress region. The die must meet the region's **value requirement**:

| Requirement type | Example | Rule |
|---|---|---|
| min | ≥3 | Die face ≥ 3 |
| max | ≤2 | Die face ≤ 2 |
| exact | =4 | Die face = exactly 4 |
| minSum | Σ≥7 | Use a Combine (two dice) — their face values must sum to ≥7 |

Only **one die** occupies a non-fortress region at end of turn (but multiple dice can pile up through combines in one action). Any number of players may share the same non-fortress region.

**Placing on a fortress** triggers garrison rules (see Section 7).

---

### Combine Two Dice

Spend one action to place **two** of your barracks dice onto the same region. Their face values are **summed** to check the region's requirement. Both dice occupy that region.

> **Example**: Iron Pass requires ≥5. Combining a 3 and a 3 = sum 6, which meets ≥5. ✓

*Tactical Synergy card adds +1 to the sum and ignores the terrain requirement for your next combine.*

---

### Battle

Spend one action to send a barracks die to attack a **non-fortress** region occupied by at least one enemy die.

- **Win condition**: your die's face value > (sum of all enemy dice on that region) + 1.
  *(Defender gets an implicit +1 bonus.)*
- **Win**: all enemy dice are evicted to their barracks (face values cleared). Your die occupies the region. You gain **+1 VP** and **+1 iron** (war spoils — the victor claims the territory's resources).
- **Lose**: your attacking die returns to barracks (face value cleared). No VP change.
- **Regardless of outcome**: the threat track advances by **+1**.

> Fortresses have their own attack mechanic (usurp) — see Section 7.

---

### Hire a Mercenary

Spend **3 gold** (see discounts below) to acquire a merc die from the pool. Merc dice:
- Sit in your barracks like normal dice.
- **Must be used (placed) this round** — at end of round, all remaining merc dice are removed.
- Unused merc dice **refund** their gold cost.

Three slots:

| Slot | Range | Face | Cost |
|---|---|---|---|
| Low | 1-3 | Rolled fresh | 3g (or less — see below) |
| High | 3-6 | Rolled fresh | 3g (or less) |
| Specialist | 1-6 | Fixed per round (see countdown) | 3g (or less) |

**Specialist countdown**: values 6, 5, 4, 3, 2, 1, 1 for rounds 1–7.

**Cost discounts** (stack):
- **Rounds 1–2**: Specialist costs **2 gold** (not 3) — value-6 and value-5 are hot commodities worth contesting early.
- **Warriors** faction: all mercs cost **−1 gold** (minimum 0).
- **Assassins** faction: Low merc costs **2 gold** (not 3).
- **Necromancers** faction: all mercs cost **−1 gold** (funds Soul Conversion; same discount as Warriors).

---

### Draft a Card

Pay the card's resource cost to take it from the market into your hand (maximum hand size: 3 cards; see Section 9). Takes one action.

---

### Play a Card

Play one card from your hand. See Section 9 for all card effects. Takes one action.

---

### Build a Structure

While you have at least one die on a region (placed or garrisoned), you may spend resources to erect a permanent structure there. One structure per region; the builder keeps the VP at game end regardless of who controls the region later.

| Structure | Cost | VP | Terrain |
|---|---|---|---|
| Watchtower | 3 ⚙ iron | 2 | Plains, Forest |
| Market | 3 🪙 gold | 2 | Plains, Forest, Ruins |
| Arcane Spire | 3 💎 essence | 2 | Mountain, Swamp, Ruins |
| Citadel | 3 ⚙ + 2 🪙 | 4 | Fortress, Mountain |

> **Die upgrade first**: Upgrading a 2-5 die to 3-6 requires you to currently control a **mountain or fortress** region. 1-3→2-5 has no terrain requirement.

---

### Upgrade a Die

Advance one barracks die up one range tier. **Costs 2 iron + 1 gold**. A new 1-3 die added to barracks via Expand starts here.

| From | To |
|---|---|
| 1-3 | 2-5 |
| 2-5 | 3-6 (*requires mountain or fortress control*) |
| 3-6 | — (max) |

*The 1-6 die (your starting wild die) cannot be upgraded — it's already full range.*

---

### Expand Barracks

Add one new 1-3 die to your roster. **Costs 1 iron + 2 gold**. Cannot exceed your faction's barracks maximum.

---

### Use Faction Active Ability

Each player may use their faction's active ability **once per round**. See Section 17 for each faction's ability. Takes one action.

---

### Pass

Declare that you are done for the rest of this round. All subsequent turns in this round are skipped for you.

---

## 7. Fortresses & Garrisons

Three fortresses on the map: **Black Citadel** (3VP), **Stormwall Keep** (3VP), **Highspire** (3VP, unlocks round 2).

### Garrisoning

Place one or more dice onto a fortress to garrison it. Your dice stay there **across rounds** (they don't return to barracks at end of round) and you keep their face values locked.

Dice placed on fortresses are **not rolled** during the Roll Phase.

### Usurping

If another player already garrisons a fortress, you can attempt to **usurp** them. To succeed:

```
Your placement sum > current garrison sum + 1
```

*(Defenders get a +1 implicit bonus — same as regular battles.)*

- **Success**: defender's dice return to barracks (face values cleared). You now hold the garrison.  
  The threat track advances by **+1**.
- **Failure**: you cannot place on that fortress this action.

### Per-Round Fortress VP

At end of each round, **every player holding a garrison earns VP equal to that fortress's VP value**.

> Example: holding Black Citadel (3VP) for 3 rounds = 9 VP from fortress income alone.

### End-Game Fortress VP

Additionally, at game end, garrisons contribute their fortress VP to the garrison holder's **end-game score** (separate from the accumulated per-round income).

---

## 8. Mercenaries

*Full cost table in Section 6. Here's what else you need to know.*

### Faction Merc Bonuses (passive, no action required)

| Faction | Bonus | When |
|---|---|---|
| Assassins | Low merc costs 2 gold (not 3) | Always |
| Mages | Hired Low/High merc die is set to its **maximum** face value | On hire |
| Necromancers | Used merc dice (placed or garrisoned) become **permanent** barracks dice | End of round |
| Merchants | Hiring any merc yields +1 Essence | On hire |
| Warriors | All mercs cost −1 gold | Always |

### Merc Rules Summary

- Each merc slot can only be claimed by one player per round.
- Unused merc dice (still in barracks at end of round) are removed and **refund** their gold.
- Necromancers exception: merc dice that were used (placed/garrisoned) convert to permanent dice.
- Merc dice IDs start with "merc-" — the engine uses this to track them.

---

## 9. Cards

Cards are drafted from the market for their resource cost, held in hand (max 3), and played for effects. At end of round, you may keep cards over the limit by paying **1 gold per extra card**.

### Card List

| Card | Cost | Effect |
|---|---|---|
| **Forge Edge** | 1 ⚙ | +1 to a barracks die's face value |
| **Mind Sharpen** | 1 💎 | +2 to a barracks die's face value |
| **Whisper Step** | 1 🪙 | −1 to a barracks die (useful for ≤X regions) |
| **Second Wind** | 1 🪙 | Reroll one barracks die |
| **Tactical Synergy** | 1 ⚙ | Your next combine: +1 to sum AND ignores terrain requirement |
| **Sealed Ground** | 1 💎 | Lock a region (opponents can't place there this round). Gain 1VP if uncontested at round end |
| **Hand of the Thief** | 2 🪙 | Steal 1 resource from any opponent + draw a free card from market |
| **Forced March** | 1 ⚙ | Move one of your placed dice to an adjacent region, ignoring that region's value requirement |

### Notes on Specific Cards

- **Tactical Synergy**: the +1 and requirement-ignore only apply to your *next* combine this round; the flag clears after use.
- **Sealed Ground**: other players may not place or combine there; you still can. You gain 1 VP only if no opponent die ends up on the region by round end.
- **Hand of the Thief**: the stolen resource is taken from the opponent with the highest total of that resource type. The free card draw doesn't cost an action.
- **Forced March**: the destination must be adjacent (on the map). You ignore the destination's value requirement but the die still occupies that region normally.

---

## 10. Structures

Structures are permanent. Once built, they stay on the region forever — even if you lose control. VP is awarded to the **original builder** at game end, not whoever holds the region.

Only one structure per region. You must have at least one die present (placed or garrisoned) when you build.

---

## 11. Threat Track & Early End

The threat track starts at **0** and advances from multiple sources:

| Source | Threat added |
|---|---|
| End of each round (automatic) | +1 |
| Battle (regardless of outcome) | +1 |
| Fortress usurp (successful or not*) | +1 |

*\*Only on a successful usurp — failed attempts do not push the track.*

When the threat track reaches **8**, the game **ends immediately** at the end of the current round (before the next roll phase). Normal end-game scoring applies.

If the game reaches **round 7** without hitting the threshold, round 7 plays out normally, then scoring happens. Round 7 also activates the **Free-for-All** rules (Section 16).

---

## 12. End-of-Round Resolution

In order after the action phase ends:

1. **Score the round goal** — award 3/2/1 VP to top-3 ranked players (ties share the full VP at their tier).
2. **Score fortress VP** — each garrison holder gains VP = that fortress's VP value.
3. **Remove merc dice** — unused mercs refund gold; used mercs are removed (except Necromancers').
4. **Hand cleanup** — discard hands beyond limit (3 cards), or pay 1 gold per extra to keep.
5. **Return dice** — all non-garrison dice return to barracks; face values are cleared.
6. **Advance threat track** — +1 (automatic).
7. **Check for game end** — if threat ≥ 8 or this was round 7: score and end. Otherwise start next round.

### What Resets Each Round

- Dice face values (all barracks dice rerolled at start of next round's Roll Phase)
- Players' `passed` status
- Active ability uses (each faction gets one use again)
- Combine Bonus flag (Tactical Synergy)
- Locked regions (Sealed Ground)
- Merc pool dice

### What Persists

- Garrison dice and their face values
- Structures
- Resources (subject to 8-cap)
- Cards in hand
- VP accumulated so far

---

## 13. Round Goals

One goal is active each round. Revealed at the start of the round. Scored at end of round.

**Scoring**: 3 VP to 1st place, 2 VP to 2nd, 1 VP to 3rd. Ties **share the full VP at that tier** (both tied-1st players each receive 3 VP; the next distinct rank receives 2 VP, etc.).

| Goal ID | Name | Condition | Direction |
|---|---|---|---|
| most-fortresses | Hold the Line | Most fortresses garrisoned | Highest |
| most-regions | Wide Reach | Most regions with ≥1 your die | Highest |
| most-combines | Coordinated March | Most combines taken this round | Highest |
| least-resources | Spendthrift | Lowest total resources | Lowest |
| most-low-placements | Stealth | Most placements with face ≤2 this round | Highest |
| most-high-placements | Show of Force | Most placements with face ≥5 this round | Highest |
| most-dice-placed | Mobilization | Most dice not in barracks at round end | Highest |
| equal-resources | Balance | Largest minimum across all 3 resources | Highest |
| most-iron | Steel Magnate | Most iron held | Highest |
| most-gold | Coin Hoarder | Most gold held | Highest |
| most-essence | Arcane Reservoir | Most essence held | Highest |
| most-passes | Patience | Most pass actions taken this round | Highest |

---

## 14. Secret Goals

At setup, each player chooses 2 secret goals from a pool of 4 dealt to them. These are revealed and scored at game end only.

**Bonus**: completing **both** secret goals earns an extra **+4 VP** on top of each goal's individual VP.

| Goal | VP | Condition |
|---|---|---|
| Triple Crown | 6 | Hold 3 fortresses simultaneously at any point |
| Master Tactician | 5 | Use combine 5+ times total |
| Land Specialist | 7 | End game controlling 4+ regions of the same terrain |
| Reservoir | 5 | End game with 6+ of any one resource |
| Full Mobilization | 5 | At any round-end, have every die placed or garrisoned |
| Wanderer | 7 | Place on all 6 terrain types during the game |
| Castellan | 6 | Hold 2+ fortresses at game end |
| All In | 5 | End game with 0 dice in barracks |
| Champion | 6 | Win 3+ battles |
| Sellsword Friend | 5 | Hire 3+ mercenaries |

---

## 15. Scoring & Winning

### VP Sources (all cumulative)

| Source | When | Amount |
|---|---|---|
| **Round goals** | Each round end | 1–3 VP per round (via 3/2/1 ranking) |
| **Fortress per-round income** | Each round end | Fortress VP value (3 for all three fortresses) |
| **Battle wins** | Each battle won | +1 VP |
| **Region control** (end game) | Game end | Sum of VP values of regions where you have placed dice |
| **Fortress garrison** (end game) | Game end | Fortress VP value for each fortress you hold |
| **Structures** (end game) | Game end | Structure's VP value (2 or 4) |
| **Full barracks bonus** | Game end | +3 VP if all your barracks slots are filled |
| **Secret goals** | Game end | 5–7 VP each + 4 VP bonus if both completed |

> **Region control at game end**: only counts dice you have *placed* on non-fortress regions at the moment the game ends (your last action phase placement, not garrisoned dice). Garrisoned dice are counted separately under "fortress garrison."

### Tiebreaker

Ties in total VP are broken by **player ID alphabetically** (p1 < p2 < p3 < p4). First alphabetically wins ties.

---

## 16. Round 7 — Free-for-All

If the game reaches round 7, these rules apply for that round only:

| Toggle | Default |
|---|---|
| All actions are free (0 resources) | ✅ |
| All mercs are free | ✅ |
| Cards cost half (rounded up) | ✅ |
| Specialist die is choosable (any value 1-6) | ✅ |
| Hand limit waived | ❌ (hand limit still applies) |

Round 7 is intentionally chaotic — it rewards players who have been building up their engine for late-game explosive turns.

---

## 17. Faction Reference

### Die Ranges Summary

| Range | Min | Max | Notes |
|---|---|---|---|
| 1-3 | 1 | 3 | Starting tier; cheap to produce from barracks expansion |
| 2-5 | 2 | 5 | Mid tier; upgrade from 1-3 costs 2⚙+1🪙 |
| 3-6 | 3 | 6 | Top tier; requires mountain or fortress control to upgrade to |
| 1-6 | 1 | 6 | Wild; given as starting die; used for specialist merc slot |

---

### ⚔ Warriors

**Passive**: +1 iron per round  
**Active — Iron Discipline**: Gain 2 iron immediately. *(Passive bonus: all mercs cost −1 gold.)*  
**Merc perk**: −1 gold on all mercs (mercDiscount)  
**Playstyle**: Fortress aggressor. High fortress priority, loves battles. Iron fuels die upgrades and Citadel structures. Merc discount makes bulk-buying worthwhile.  
**Starting**: 1×(1-6), 2×(1-3) | 2⚙ 1🪙 0💎 | cap 8

---

### 🗡 Assassins

**Passive**: +1 gold per round  
**Active — Shadow Step**: Set one barracks die to any face value **≤3**. Ideal for max-2 or exact-3 regions.  
**Merc perk — First Refusal**: Low merc (1-3 range) costs only 2 gold.  
**Playstyle**: Infiltrator. Targets restricted low-value regions others can't reach efficiently. Shadow Step enables precise placement; low-cap barracks (5 max) keeps them agile.  
**Starting**: 1×(1-6), 2×(1-3) | 1⚙ 2🪙 0💎 | cap 5

---

### 🔮 Mages

**Passive**: +1 essence + 1 gold per round  
**Active — Arcane Precision**: Set one barracks die to **any** face value within its legal range.  
**Merc perk — Arcane Analysis**: Hired Low or High merc die is automatically set to its **maximum** face value (e.g. Low merc → face 3, High merc → face 6). *Not a reroll — deterministic.*  
**Playstyle**: Control. Arcane Precision is the strongest single-die manipulation ability; use it to guarantee exactly the value needed for contested regions. Arcane Analysis makes mercs immediately deployable at their peak.  
**Starting**: 1×(1-6), 1×(1-3) | 0⚙ 1🪙 2💎 | cap 6

---

### 💀 Necromancers

**Passive**: +1 essence per round · all mercs cost **−1 gold** (minimum 0)  
**Active — Soul Recall**: Return one of your placed (non-garrisoned) dice from any region back to barracks.  
**Merc perk — Soul Conversion**: Any merc die you used this round (placed or garrisoned) becomes a **permanent barracks die** at end of round instead of being removed.  
**Playstyle**: Attrition and recovery. Soul Recall lets you rescue dice from bad positions and redeploy efficiently. Soul Conversion slowly grows your dice pool — the merc discount makes this accessible every round. Chain: hire → place → Soul Conversion → permanent die → repeat.  
**Starting**: 1×(1-6), 2×(1-3) | 1⚙ 0🪙 2💎 | cap 7

---

### 💰 Merchants

**Passive**: +2 gold per round  
**Active — Trade Deal**: Gain 1 gold immediately.  
**Merc perk — Trade Commission**: Hiring any merc yields +1 essence as a bonus.  
**Playstyle**: Economy engine. Gold surplus buys cards, mercs, and barracks expansion. Market structures (3 gold, 2VP) align naturally. Strong engine, but lower fortress/battle priority; wins through VP accumulation not aggression.  
**Starting**: 1×(1-6), 1×(1-3) | 0⚙ 3🪙 0💎 | cap 6

---

### 🌿 Rangers

**Passive**: +1 iron per round  
**Active — Pathfinder**: Gain 1 iron + 1 gold + 1 essence (versatility package).  
**Merc perk**: none beyond standard pricing.  
**Playstyle**: Flexible generalist. Pathfinder's three-resource gain enables any strategy: upgrades (iron), mercs (gold), cards/spires (essence). No extreme speciality; adapts to round goals well. Good engine priority.  
**Starting**: 1×(1-6), 2×(1-3) | 1⚙ 1🪙 1💎 | cap 7

---

### ✝ Paladins

**Passive**: +1 iron per round  
**Active — Sacred Seal**: Gain 1 iron + 1 essence.  
**Merc perk**: none.  
**Playstyle**: Balanced defender. Fortress-focused; moderate battle priority. Sacred Seal provides a steady hybrid income that unlocks both upgrades (iron) and Arcane Spires (essence). Consistent without being explosive.  
**Starting**: 1×(1-6), 1×(1-3) | 1⚙ 1🪙 1💎 | cap 7

---

### 🐾 Beastmasters

**Passive**: +1 essence per round  
**Active — Wild Surge**: Add a **temporary** die (1-6 range, face value **5**) to barracks. It counts as a merc die and is removed at end of round (or kept if Necromancers — but Wild Surge is only Beastmasters').  
**Merc perk**: none.  
**Playstyle**: Burst tactician. Wild Surge provides an immediate face-5 die usable for any region requiring ≤5. Combines especially well with a second barracks die (Σ≥9 combinations). Essence income fuels Arcane Spires.  
**Starting**: 1×(1-6), 1×(1-3) | 1⚙ 0🪙 2💎 | cap 6

---

## 18. Region Reference

16 regions in a 4×4 grid. Adjacency is horizontal/vertical only (no diagonals).

| Region | Terrain | Requirement | VP | Unlocks | Notes |
|---|---|---|---|---|---|
| Iron Pass | Mountain | ≥5 | 2 | Round 1 | Needs upgraded die or 1-6 at 5+ |
| Black Citadel | **Fortress** | ≥4 | 3 | Round 1 | Can garrison; requires 4+ face |
| Silverwood | Forest | =3 | 1 | Round 1 | Exact value — tricky to hit |
| Marshlands | Swamp | ≤2 | 1 | Round 1 | Low-value only; Assassins love this |
| Whispering Vale | Plains | ≥2 | 1 | Round 1 | Easy access |
| Skull Ruins | Ruins | =4 | 2 | Round 1 | Exact 4 — Assassins' shadow step or 2-5 die |
| Stormwall Keep | **Fortress** | Σ≥7 | 3 | Round 1 | Combine required (two dice summing ≥7) |
| Goldhaven | Plains | ≥3 | 2 | Round 1 | Accessible; decent VP |
| Dragon's Reach | Mountain | ≥6 | 3 | **Round 3** | 3VP, but needs a 3-6 die at 6 or 1-6 at 6 |
| Mireborn Bog | Swamp | =2 | 1 | Round 1 | Exact 2 — very restrictive |
| Emerald Glade | Forest | ≥2 | 1 | Round 1 | Easy access; good for spread |
| Crow's Nest | Ruins | ≤3 | 1 | Round 1 | Low-cap ruins; Assassins target |
| Highspire | **Fortress** | ≥5 | 3 | **Round 2** | Unlocks round 2; needs strong die |
| Bonewatch | Mountain | Σ≥8 | 2 | **Round 4** | Combine needed; late game only |
| Verdant Grove | Plains | ≥4 | 2 | Round 1 | Mid-value plains; solid |
| Drownland | Swamp | ≥3 | 1 | Round 1 | Accessible swamp; Arcane Spire territory |

### Terrain Summary

| Terrain | Count | Structures buildable here |
|---|---|---|
| Mountain | 3 | Arcane Spire, Citadel |
| Fortress | 3 | Citadel |
| Forest | 3 | Watchtower, Market |
| Swamp | 3 | Arcane Spire |
| Plains | 3 | Watchtower, Market |
| Ruins | 1* | Market, Arcane Spire |

*\*One region (Skull Ruins and Crow's Nest are ruins; Drownland is swamp — see above)*

---

## 19. FAQ

### Dice & Placement

**Q: Can I place a die with face value 0 after a modifier card reduces it?**  
A: No. A die must have face value ≥1 to be placed. If a card would reduce a die below 1, it stops at 1.

**Q: Can I place multiple dice on the same non-fortress region in one action?**  
A: Only via the Combine action (two dice in one action). A single Place action places exactly one die.

**Q: What if I roll a die and it shows a value that can't reach any region?**  
A: You can still use it for combines, upgrade it, use a card to modify it, or just pass. Having useless dice sometimes happens — it's part of the game's pressure.

**Q: Does garrisoning a fortress count as "placing" a die for round goals like Most Regions or Most Dice Placed?**  
A: Yes — garrisoned dice count toward "most dice not in barracks" and garrisoned fortresses count as "regions with your dice."

**Q: When dice return to barracks at end of round, does their face value reset?**  
A: Yes. All barracks dice have face value **null** (unrolled) at the start of the Roll Phase and get new values when rolled. Garrisoned dice don't return and keep their face values.

---

### Fortresses

**Q: Can I place a single die on Stormwall Keep (Σ≥7)?**  
A: No. The minSum requirement specifically requires a Combine action (two dice summing ≥7). A single die cannot satisfy a minSum.

**Q: Does my garrison die get rolled in the Roll Phase?**  
A: No. Garrisoned dice stay fixed with their locked face values until they leave the garrison.

**Q: I used Forced March to move a die into a fortress. Does it garrison?**  
A: Yes. Any die placed on a fortress (by any means) garrisons it. The value requirement still applies — the moved die must meet the fortress's requirement (or have enough sum if minSum).

**Q: Can I voluntarily remove my own garrison?**  
A: No explicit "recall" action exists (unless you're Necromancers using Soul Recall). To vacate a fortress, you'd have to let another player usurp you.

**Q: Does the usurping player need to use a Combine, or can one die do it?**  
A: One die can usurp if its face value alone exceeds the garrison sum + 1. For Stormwall Keep (Σ≥7 garrison), you'd typically need a combine — one die can't easily exceed a garrison sum of 7+.

---

### Resources

**Q: Is there a resource cap?**  
A: Yes — **8 of each resource**. Any income that would push you over 8 is lost. Plan your spending accordingly at end of round.

**Q: Merchants' passive is +2 gold per round. Can I voluntarily not take it to avoid hitting the cap?**  
A: No — the passive fires automatically. If you're at 8 gold and receive +2, you just stay at 8 (the excess is lost).

**Q: Can I spend resources at any point in my turn, or only when taking the relevant action?**  
A: Resources are spent when you take the action they fund. You can't "bank" a spend for later.

---

### Mercenaries

**Q: I hired a merc but didn't use it (it's still in barracks). Do I get my gold back?**  
A: Yes — unused merc dice refund their cost at end of round.

**Q: Necromancers' Soul Conversion says used mercs become permanent. What counts as "used"?**  
A: Any merc die that was placed on a region or garrisoned a fortress. Mercs still sitting in barracks are NOT converted — they're refunded and removed normally.

**Q: Can Mages use Arcane Precision on a merc die after Arcane Analysis sets it to max?**  
A: Yes — Arcane Precision sets any barracks die to any value in its range, merc or otherwise. You could set it to a different value after Arcane Analysis already set it to max.

**Q: The specialist die has a fixed face value (e.g., face 5 in round 2). Can I use Arcane Precision to change its face?**  
A: Yes — once you own the die, it's a normal 1-6 die in your barracks and Arcane Precision applies.

---

### Cards

**Q: What is the hand limit?**  
A: **3 cards**. At end of round, you can keep cards over the limit by paying **1 gold per extra card**. If you can't or won't pay, excess cards are discarded (your choice which to keep).

**Q: Can I play multiple cards in one turn?**  
A: No — each card play costs one action. You can play one card per turn.

**Q: Forced March says "move a placed die to an adjacent region ignoring requirements." Does the die stay placed after moving?**  
A: Yes — the die moves from its current region to an adjacent one. It is now placed on the new region (in the normal placed-dice list there).

**Q: Sealed Ground locks a region — what exactly can't opponents do there?**  
A: Opponents cannot Place or Combine dice onto that region for the rest of the round. They CAN battle there. You (the locker) can still place there normally.

**Q: Hand of the Thief steals from "the richest opponent." What if two opponents are tied?**  
A: The engine picks the player with the highest total of the targeted resource type. In case of a tie, it picks the first in turn order.

---

### Structures

**Q: I lost control of a region where I built a Watchtower. Do I still get the 2 VP?**  
A: Yes. Structures are permanently owned by the builder. VP is awarded to the original builder at game end regardless of current control.

**Q: Can I build a structure on a fortress while garrisoning it?**  
A: Yes — garrisoned dice count as "present on the region." Citadel (fortress/mountain, 4VP) can be built on a fortress you hold. This is expensive but powerful.

**Q: Can two players each build a structure on the same region?**  
A: No. One structure per region, first come first served.

**Q: The die upgrade says upgrading to 3-6 requires controlling a mountain or fortress. "Controlling" means having a die there?**  
A: Yes — you need at least one of your dice currently placed on OR garrisoning a mountain or fortress region. It doesn't matter if others are also there; you just need presence.

---

### Threat Track & Timing

**Q: The threat track hit 8 mid-round. Does the game end immediately?**  
A: No — the check happens at **end of round**, after all actions are complete and end-of-round resolution runs. Finish the current round, then score and end.

**Q: Does a failed usurp attempt still push the threat track?**  
A: No — only a **successful** usurp pushes the threat track (+1). A failed attempt (your placement sum wasn't high enough) has no threat effect.

**Q: Does a battle that ends in a draw push the threat track?**  
A: There are no draws in battles — the attacker either wins (face > garrison+1) or loses. Every battle attempt pushes threat +1 regardless of outcome.

---

### Scoring

**Q: What's the difference between "per-round fortress VP" and "fortress end-game VP"?**  
A: Per-round: at end of each round you hold a garrison, you earn that fortress's VP. End-game: additionally, at game end, if you hold a garrison, you score that fortress's VP again as a one-time bonus. They're both tracked separately in the score breakdown.

**Q: Region control at game end — does it count placed dice or garrisoned dice?**  
A: Only **placed** dice (on non-fortress regions). Garrisoned dice on fortresses are counted under the fortress end-game scoring, not region control.

**Q: Full barracks bonus: what counts toward "all barracks slots filled"?**  
A: Your **total dice count** (placed + garrisoned + in barracks) must equal your faction's barracks maximum. It doesn't matter where the dice are.

**Q: Can I complete both secret goals?**  
A: Yes, and you get a **+4 VP bonus** for doing so. If you only complete one, you get that goal's VP but no bonus.

---

## 20. Quick Reference Card

### On Your Turn (choose one)

| Action | Cost | Effect |
|---|---|---|
| **Place** | Free | One die → non-fortress region (must meet value req.) |
| **Combine** | Free | Two dice → one region (sum must meet req.) |
| **Battle** | Free | One die attacks enemy-held region (win = +1VP, lose = die cleared) |
| **Hire Merc** | 3🪙 (see discounts) | Add Low/High/Specialist die to barracks for this round |
| **Draft Card** | Card cost | Take from market to hand |
| **Play Card** | Card cost (paid on draft) | Activate card effect |
| **Build Structure** | Structure cost | Permanent VP on a region you occupy |
| **Upgrade Die** | 2⚙ + 1🪙 | Advance die one tier (1-3→2-5 or 2-5→3-6*) |
| **Expand Barracks** | 1⚙ + 2🪙 | Add a new 1-3 die (if under cap) |
| **Use Active** | Once per round | Faction-specific ability |
| **Pass** | — | Done for this round |

*\*3-6 upgrade requires mountain/fortress control.*

### Threat Events (+1 each)

- End of round (automatic)
- Any battle (win or lose)
- Successful fortress usurp

**Threshold**: 8 → game ends at end of current round.

### End-Game VP Sources

- Round goals (ongoing): 1–3 VP/round via ranking
- Fortress per-round income: fortress VP each round you hold it
- Battle wins: +1 VP each
- Region control: VP value of non-fortress regions with your placed dice
- Fortress garrison: VP value of fortresses you hold
- Structures: 2 or 4 VP each (owned by builder permanently)
- Full barracks bonus: +3 VP (if dice count = your barracks max)
- Secret goals: 5–7 VP each + 4 bonus for completing both

### Merc Costs (round 1 example, 3-player)

| | Low | High | Specialist (value 6) |
|---|---|---|---|
| Standard | 3🪙 | 3🪙 | **2🪙** (R1 discount) |
| Warriors | 2🪙 | 2🪙 | **1🪙** |
| Assassins | **2🪙** | 3🪙 | **2🪙** |
