# Iron & Ash v2 — design notes (working)

The lean territorial-war redesign. Pure-logic prototype in `src/v2/`,
validated via `scripts/v2-board-test.ts`. v1 (repo root) is untouched.

## Locked-in pillars
- **Board:** node graph, `3N + 1` territories (N homes + N chokes + N borders
  + 1 centre). Constant territory-per-player → consistent collision density.
- **Dice:** a small RENEWABLE hand (~5), re-rolled each round, returned to pool.
  Not a persistent growing army (that was the Warhammer/length trap).
- **Combat:** ONE comparison — committed total + terrain defense; ties to the
  owner. No attrition exchange. Fast, one-sitting.
- **Scoring:** per-round ACCRUAL is the main engine (visible VP).
- **Hidden VP:** one secret objective per player, revealed at game end —
  masks the leader, adds a climax, rewards axes orthogonal to centre-holding.
- **Catch-up:** trailing players roll bonus dice (force, not free VP) — curbs
  the 2p snowball without gutting accrual.
- **Asymmetry (in progress):** 6 factions on a rivalry RING. Each wants a
  primary spoil (3 VP/round to them) + 2 secondaries (2 VP) that OVERLAP with
  ring-neighbours → engineered, controllable conflict. Tiles carry spoils;
  setup places them by faction combo. Selection constrained so chosen factions
  always overlap (2p: pick a ring-neighbour; the "opposite" pairing is banned).
- **Target weight:** 45 min (2p) → 90 min (4p). Elegant, not crunchy.

## Backburner ideas (not yet built)
- **Spoil depletion / anti-camp:** a tile's yield slides DOWN each consecutive
  round the same player holds it, so you can't camp one spot — you're pushed to
  keep moving and taking fresh ground. Directly reinforces the fan-out goal.
  (Tune: decay rate, floor, whether losing+retaking resets it.)
- **Signature faction abilities:** each faction a flavoured verb beyond "scores
  spoil X" (Warriors upgrade dice via Iron, Merchants hire cheap via Gold, Mages
  set dice via Essence, …). Layer AFTER the spoil-scoring math is proven.
- **Variable setup + unlock schedule:** stable board within a game, but special
  tiles scattered differently per game; some tiles unlock on a round schedule so
  the meaningful surface area grows with the dice pool.
- **Theme/skin pass:** spoil names (iron/gold/essence/bone/wild/faith) and
  faction flavour are placeholders — reskin once the math is locked.
