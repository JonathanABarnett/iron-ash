// ─── Iron & Ash v2 — interactive sandbox ─────────────────────────────────────
//
// A single-screen "play the v2 model against the AI" sandbox. This page ONLY
// drives the pure v2 model in src/v2/ — it imports and reads that logic, never
// modifies it. Turn model: SEQUENTIAL, VISIBLE turn-by-turn deployment. Players
// alternate placing ONE die at a time onto reachable tiles; BOTH sides' dice are
// visible on the board the whole time, so you watch forces mass on contested
// tiles and react. When everyone has passed or emptied their hand, a single
// resolveRound + scoreRound settles the round (unchanged from before).
//
// The GameV2 object is mutated in place by resolveRound/scoreRound, so we hold
// it in a ref and bump a `version` counter to force re-renders after mutations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rng } from '@engine/rng';
import { V2HowTo, shouldAutoShowHowTo, markHowToSeen } from './V2HowTo';
import {
  createGameV2,
  reachable,
  rollHand,
  resolveRound,
  scoreRound,
  catchUpDiceCount,
  ROUNDS,
  type GameV2,
  type Deployments,
} from '../../v2/game';
import {
  FACTIONS,
  valueOf,
  validCombos,
  combatBonus,
  attackBonus,
  defenseBonusFor,
  type FactionId,
  type Spoil,
} from '../../v2/factions';
import { pickOneDie, type CommittedSums } from '../../v2/ai';
import { scoreObjectives, objectiveById } from '../../v2/objectives';
import { UNIT_PROFILE, type RolledDie } from '../../v2/units';
import type { TerritoryV2 } from '../../v2/board';

// ── Palette ───────────────────────────────────────────────────────────────────

const SPOIL_COLOR: Record<Spoil | 'universal', string> = {
  iron: '#9ca3af',
  gold: '#facc15',
  essence: '#a855f7',
  bone: '#e5e7eb',
  wild: '#4ade80',
  faith: '#60a5fa',
  universal: '#fb923c',
};

const SPOIL_LABEL: Record<Spoil | 'universal', string> = {
  iron: 'Iron',
  gold: 'Gold',
  essence: 'Essence',
  bone: 'Bone',
  wild: 'Wild',
  faith: 'Faith',
  universal: 'Universal',
};

const PLAYER_COLOR = ['#2dd4bf', '#a78bfa', '#fbbf24', '#fb7185'] as const;
const NEUTRAL_COLOR = '#52525b';

// Per-tier accent + one-line explanation so dice tiers are visually distinct
// and self-documenting (used for the colour band + the tier `title` tooltip).
const TIER_META: Record<
  string,
  { band: string; text: string; help: string }
> = {
  Levy: { band: '#71717a', text: '#d4d4d8', help: 'Levy — rolls 1-3, cheap fodder that often comes up low.' },
  Soldier: { band: '#60a5fa', text: '#bfdbfe', help: 'Soldier — rolls 2-5, reliable line troops.' },
  Elite: { band: '#34d399', text: '#a7f3d0', help: 'Elite — rolls 3-6, reliably strong, rarely whiffs.' },
  Champion: { band: '#fbbf24', text: '#fde68a', help: 'Champion — rolls 1-6, swingy with a high ceiling.' },
};

// Human-readable terrain blurbs for the inspector + the defense-icon tooltip.
const TERRAIN_HELP: Record<string, string> = {
  center: 'Centre — the universal prize; +3 to the defender, worth 3 VP to everyone.',
  fortress: 'Fortress — a stronghold; +3 to the defender.',
  mountain: 'Mountain — a defensible chokepoint; +2 to the defender.',
  home: 'Home — a safe base; +1 to the defender.',
  forest: 'Forest — light cover; +1 to the defender.',
  plains: 'Plains — open, exposed ground; no defensive bonus.',
};

const HUMAN_ID = 0;
const DEFAULT_FACTIONS: FactionId[] = ['warriors', 'merchants'];
const ALL_FACTIONS: FactionId[] = ['warriors', 'merchants', 'rangers', 'necromancers', 'mages', 'paladins'];
// How long each AI placement lingers so the player SEES it appear, in ms.
const AI_TURN_DELAY_MS = 550;

type Phase = 'deploy' | 'review' | 'end';

// Build a legal, conflict-guaranteed faction set of `count` players that
// INCLUDES the human's pick, with the human seated first (player 0). We scan
// the valid ring-arc combos (validCombos) for one containing the chosen
// faction, rotate it so the human leads, and fall back to a manual ring slice
// if — impossibly — none matches. `pickIndex` lets the caller cycle through the
// distinct valid combos (the "shuffle opponents" affordance).
function buildFactionIds(human: FactionId, count: number, pickIndex = 0): FactionId[] {
  const combos = validCombos(count).filter((c) => c.includes(human));
  if (combos.length === 0) {
    // Defensive fallback — shouldn't happen for n ≤ 6, but keep the human first.
    const rest = ALL_FACTIONS.filter((f) => f !== human).slice(0, count - 1);
    return [human, ...rest];
  }
  const combo = combos[((pickIndex % combos.length) + combos.length) % combos.length]!;
  // Rotate the arc so the human sits at seat 0, preserving the ring adjacency
  // (and thus the guaranteed-rivalry property) of the remaining seats.
  const start = combo.indexOf(human);
  return [...combo.slice(start), ...combo.slice(0, start)];
}

// How many distinct valid combos contain the human's pick at a given count —
// used to decide whether the "shuffle opponents" control is meaningful.
function comboCountFor(human: FactionId, count: number): number {
  return validCombos(count).filter((c) => c.includes(human)).length;
}

interface ResolveResultRow {
  territoryId: string;
  changed: boolean;
  contested: boolean;
  newOwner: number | null;
}

// Visible commitments: territoryId → playerId → list of committed die VALUES.
type Commitments = Record<string, Record<number, number[]>>;

function ownerColor(ownerId: number | undefined): string {
  if (ownerId === undefined) return NEUTRAL_COLOR;
  return PLAYER_COLOR[ownerId] ?? NEUTRAL_COLOR;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function factionName(game: GameV2, pid: number): string {
  return FACTIONS[game.players[pid]!.faction].name;
}

// Reduce the visible per-die commitments to the summed shape the model + AI
// brain want: territoryId → playerId → summed value.
function toCommittedSums(commitments: Commitments): CommittedSums {
  const out: CommittedSums = {};
  for (const [tid, perPlayer] of Object.entries(commitments)) {
    for (const [pid, values] of Object.entries(perPlayer)) {
      const total = sum(values);
      if (total <= 0) continue;
      (out[tid] ??= {})[Number(pid)] = total;
    }
  }
  return out;
}

// ── Page ────────────────────────────────────────────────────────────────────

// Build a fresh game + its rng stream + round-1 hands for a given seed counter.
// Rolls the human hand AND every AI's hand up front so round 1 of a new game
// has the AI armed (the bug fix: aiRemaining used to start empty on mount, so
// the AI passed all of round 1). Pure — safe to call from a lazy initializer.
function freshGame(counter: number, factionIds: FactionId[] = DEFAULT_FACTIONS): {
  game: GameV2; rng: Rng; hand: RolledDie[]; ai: Record<number, number[]>;
} {
  const game = createGameV2(factionIds, `v2-sandbox-${counter}`);
  // A separate, long-lived rng stream for rolling hands round-to-round.
  const rng = new Rng(`v2-sandbox-rng-${counter}`);
  game.round = 1; // begin round 1
  const hand = rollHand(game, HUMAN_ID, rng);
  const ai: Record<number, number[]> = {};
  for (let p = 1; p < game.players.length; p++) {
    ai[p] = rollHand(game, p, rng).map((d) => d.value);
  }
  return { game, rng, hand, ai };
}

export function V2Page() {
  // Seed counter feeds the dice RNG. Start it RANDOM so every page load is a
  // different game (a fixed start made each reload replay the identical round-1
  // hand, which read as "rigged"). Math.random is fine here — this is the UI,
  // not the pure engine; the underlying Rng is still seeded from this value, so
  // a given counter is reproducible.
  const [seedCounter, setSeedCounter] = useState(() => Math.floor(Math.random() * 1e9));

  // The mutable game + its rng live in refs; `version` forces re-renders after
  // the model mutates in place. Lazy-init once so no setState fires in render.
  const initial = useRef<{ game: GameV2; rng: Rng; hand: RolledDie[]; ai: Record<number, number[]> } | null>(null);
  if (initial.current === null) initial.current = freshGame(seedCounter);
  const gameRef = useRef<GameV2>(initial.current.game);
  const rngRef = useRef<Rng>(initial.current.rng);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [phase, setPhase] = useState<Phase>('deploy');
  const [hand, setHand] = useState<RolledDie[]>(() => initial.current!.hand);
  // Which human hand-slot indices have been committed (so each die is used once).
  const [usedDice, setUsedDice] = useState<Set<number>>(new Set());
  // Selected die slot index (the one waiting to be placed), or null.
  const [selected, setSelected] = useState<number | null>(null);

  // ── Turn-by-turn deploy state ──
  // Visible commitments for EVERY player: tid → playerId → die values.
  const [commitments, setCommitments] = useState<Commitments>({});
  // Each AI player's remaining (unplaced) die VALUES this round. Index = playerId.
  // Human (index 0) is unused here — the human's remaining come from hand/usedDice.
  const [aiRemaining, setAiRemaining] = useState<Record<number, number[]>>(() => initial.current!.ai);
  // Whose turn it is right now (a playerId). Order: 0,1,2,…,then wraps.
  const [turn, setTurn] = useState<number>(HUMAN_ID);
  // Players who have chosen to stop placing (or run dry) this round.
  const [passed, setPassed] = useState<Set<number>>(new Set());
  // True once deployment is over and we're waiting on the Resolve button.
  const [deployDone, setDeployDone] = useState(false);

  const [log, setLog] = useState<string[]>([]);
  // The territory the player is hovering (drives the HUD inspector panel).
  const [hoveredTid, setHoveredTid] = useState<string | null>(null);
  // "How to play" overlay — auto-shows once (localStorage-gated), reopenable.
  const [howToOpen, setHowToOpen] = useState(false);
  // Faction-selection setup. Open on first load (and on every "New game") so the
  // player chooses their faction + opponents before a game runs. The game held
  // in the refs is a throwaway default until the user presses Start.
  // (The how-to auto-shows AFTER the first Start so two modals never stack.)
  const [setupOpen, setSetupOpen] = useState(true);
  const closeHowTo = useCallback(() => {
    setHowToOpen(false);
    markHowToSeen();
  }, []);

  const game = gameRef.current;
  const humanFaction = game.players[HUMAN_ID]!.faction;

  // ── Turn helpers ────────────────────────────────────────────────────────────

  // Remaining die count for any player given the current pass/used/hand state.
  const remainingCountFor = useCallback(
    (pid: number, used: Set<number>, ai: Record<number, number[]>): number => {
      if (pid === HUMAN_ID) return hand.length - used.size;
      return ai[pid]?.length ?? 0;
    },
    [hand.length],
  );

  // Find the next player (after `from`, cycling) who hasn't passed and still has
  // dice. Returns null if nobody qualifies → deployment is over.
  const nextActivePlayer = useCallback(
    (from: number, passedSet: Set<number>, used: Set<number>, ai: Record<number, number[]>): number | null => {
      const n = game.players.length;
      for (let step = 1; step <= n; step++) {
        const pid = (from + step) % n;
        if (passedSet.has(pid)) continue;
        if (remainingCountFor(pid, used, ai) <= 0) continue;
        return pid;
      }
      return null;
    },
    [game.players.length, remainingCountFor],
  );

  // ── Game lifecycle ─────────────────────────────────────────────────────────

  // Roll every AI's hand for the current round and store their remaining values.
  const rollAiHands = useCallback((): Record<number, number[]> => {
    const rng = rngRef.current!;
    const out: Record<number, number[]> = {};
    for (let p = 1; p < game.players.length; p++) {
      out[p] = rollHand(game, p, rng).map((d) => d.value);
    }
    return out;
  }, [game]);

  // Reset all per-round deploy state and hand the first turn to the round's
  // START PLAYER. Rotating it each round (player (round-1) % N goes first)
  // cancels the last-mover edge that a fixed order would compound over 6 rounds.
  const beginRoundDeploy = useCallback(
    (humanHand: RolledDie[]) => {
      setHand(humanHand);
      setUsedDice(new Set());
      setSelected(null);
      setCommitments({});
      setAiRemaining(rollAiHands());
      setPassed(new Set());
      setDeployDone(false);
      setTurn((game.round - 1) % game.players.length);
      setLog([]);
      setPhase('deploy');
    },
    [rollAiHands, game],
  );

  // Start a brand-new game. Only called from event handlers, so setState is safe.
  const startGame = useCallback(
    (counter: number, factionIds: FactionId[] = DEFAULT_FACTIONS) => {
      const next = freshGame(counter, factionIds);
      gameRef.current = next.game;
      rngRef.current = next.rng;
      // beginRoundDeploy reads gameRef via rollAiHands; gameRef is now updated.
      // We pass the freshly-rolled human hand explicitly.
      setHand(next.hand);
      setUsedDice(new Set());
      setSelected(null);
      setCommitments({});
      // AI hands were already rolled inside freshGame (same rng stream), so the
      // first round of a new game has the AI armed.
      setAiRemaining(next.ai);
      setPassed(new Set());
      setDeployDone(false);
      setTurn(HUMAN_ID);
      setLog([]);
      setPhase('deploy');
      bump();
    },
    [bump],
  );

  const reachableSet = useMemo(
    () => reachable(game, HUMAN_ID),
    // recompute whenever ownership/round may have changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, phase, game.round, game.clock],
  );

  // "New game" no longer starts immediately — it reopens the faction setup so
  // the player can pick a different matchup. Start happens from the panel.
  function onNewGame() {
    setSetupOpen(true);
  }

  // Called from the setup panel's Start button with the assembled factionIds
  // (human first). Advances the seed so the dice differ from any prior game.
  function onStartSetup(factionIds: FactionId[]) {
    const next = seedCounter + 1;
    setSeedCounter(next);
    startGame(next, factionIds);
    setSetupOpen(false);
    // First-ever start: surface the how-to once the matchup is chosen so the two
    // modals never overlap.
    if (shouldAutoShowHowTo()) setHowToOpen(true);
  }

  // ── Advancing the turn ───────────────────────────────────────────────────────

  // Hand the turn to the next eligible player given the LATEST state. We pass the
  // freshly-computed used/passed/ai so we don't read stale closure state.
  const advanceTurn = useCallback(
    (from: number, passedSet: Set<number>, used: Set<number>, ai: Record<number, number[]>) => {
      const next = nextActivePlayer(from, passedSet, used, ai);
      if (next === null) {
        setDeployDone(true);
      } else {
        setTurn(next);
      }
    },
    [nextActivePlayer],
  );

  // ── Human deploy interactions ──────────────────────────────────────────────────

  const isHumanTurn = phase === 'deploy' && !deployDone && turn === HUMAN_ID && !passed.has(HUMAN_ID);

  function onSelectDie(slot: number) {
    if (!isHumanTurn) return;
    if (usedDice.has(slot)) return;
    setSelected((cur) => (cur === slot ? null : slot));
  }

  function onTerritoryClick(tid: string) {
    if (!isHumanTurn) return;
    if (!reachableSet.has(tid)) return;
    if (selected === null) return;
    const die = hand[selected];
    if (die === undefined) return;

    // Commit this die value into the human's visible stack on the tile.
    setCommitments((c) => {
      const tile: Record<number, number[]> = { ...(c[tid] ?? {}) };
      tile[HUMAN_ID] = [...(tile[HUMAN_ID] ?? []), die.value];
      return { ...c, [tid]: tile };
    });
    const nextUsed = new Set(usedDice);
    nextUsed.add(selected);
    setUsedDice(nextUsed);
    setSelected(null);
    // End of the human's turn → advance.
    advanceTurn(HUMAN_ID, passed, nextUsed, aiRemaining);
  }

  // The human stops placing for this round.
  function onPass() {
    if (!isHumanTurn) return;
    const nextPassed = new Set(passed);
    nextPassed.add(HUMAN_ID);
    setPassed(nextPassed);
    setSelected(null);
    advanceTurn(HUMAN_ID, nextPassed, usedDice, aiRemaining);
  }

  // Recall the human's most-recent committed die from a tile back to the hand.
  // Allowed ONLY on the human's own turn (before they pass) — recalling mid-AI-turn
  // would desync the visible board the AI is reacting to. We recall the LAST die the
  // human committed to that tile and free a matching used hand-slot.
  function recallFromTile(tid: string) {
    if (!isHumanTurn) return;
    const mine = commitments[tid]?.[HUMAN_ID];
    if (!mine || mine.length === 0) return;
    const value = mine[mine.length - 1]!; // most-recent committed value

    setCommitments((c) => {
      const perPlayer = c[tid];
      if (!perPlayer) return c;
      const values = perPlayer[HUMAN_ID];
      if (!values || values.length === 0) return c;
      const nextValues = values.slice(0, -1);
      const nextPerPlayer = { ...perPlayer };
      if (nextValues.length === 0) delete nextPerPlayer[HUMAN_ID];
      else nextPerPlayer[HUMAN_ID] = nextValues;
      const next = { ...c };
      if (Object.keys(nextPerPlayer).length === 0) delete next[tid];
      else next[tid] = nextPerPlayer;
      return next;
    });
    // Free one used hand-slot whose die value matches the recalled die.
    setUsedDice((u) => {
      const next = new Set(u);
      for (const slot of next) {
        if (hand[slot]?.value === value) {
          next.delete(slot);
          break;
        }
      }
      return next;
    });
    setSelected(null);
  }

  // ── AI auto-turn (timed so the player SEES each enemy die appear) ─────────────
  // A guard ref prevents the effect from firing the same AI placement twice
  // (React StrictMode double-invoke, or a re-render landing on the same turn).
  const aiActingRef = useRef(false);
  useEffect(() => {
    if (phase !== 'deploy' || deployDone) return;
    const p = turn;
    if (p === HUMAN_ID) return; // human turns are user-driven
    if (passed.has(p)) return; // shouldn't be their turn, but guard anyway
    if (aiActingRef.current) return; // already scheduled for this turn

    aiActingRef.current = true;
    const timer = setTimeout(() => {
      const remaining = aiRemaining[p] ?? [];
      const committedSums = toCommittedSums(commitments);
      const choice = remaining.length > 0 ? pickOneDie(game, p, remaining, committedSums) : null;

      if (choice === null) {
        // AI passes (out of dice or nothing worth placing).
        const nextPassed = new Set(passed);
        nextPassed.add(p);
        setPassed(nextPassed);
        aiActingRef.current = false;
        advanceTurn(p, nextPassed, usedDice, aiRemaining);
        return;
      }

      // Place the chosen die: push its value into the AI's visible stack and
      // remove ONE matching value from that AI's remaining.
      const { dieValue, tid } = choice;
      setCommitments((c) => {
        const tile: Record<number, number[]> = { ...(c[tid] ?? {}) };
        tile[p] = [...(tile[p] ?? []), dieValue];
        return { ...c, [tid]: tile };
      });
      const nextAi = { ...aiRemaining };
      const arr = [...(nextAi[p] ?? [])];
      const idx = arr.indexOf(dieValue);
      if (idx !== -1) arr.splice(idx, 1);
      nextAi[p] = arr;
      setAiRemaining(nextAi);

      aiActingRef.current = false;
      advanceTurn(p, passed, usedDice, nextAi);
    }, AI_TURN_DELAY_MS);

    return () => {
      clearTimeout(timer);
      aiActingRef.current = false;
    };
    // `aiRemaining` is in the deps so a same-AI multi-die turn keeps firing:
    // when the human has passed, advanceTurn re-targets the SAME AI (turn
    // unchanged), so without this dep the effect would place exactly one die
    // and stall. Each placement shrinks aiRemaining → re-fires → next die.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, phase, deployDone, aiRemaining]);

  // ── Resolve the round ────────────────────────────────────────────────────────

  function onResolve() {
    if (phase !== 'deploy' || !deployDone) return;

    // 1. Build the merged Deployments object by summing every player's visible
    //    commitments on each tile.
    const deployments: Deployments = {};
    for (const [tid, perPlayer] of Object.entries(commitments)) {
      for (const [pid, values] of Object.entries(perPlayer)) {
        const total = sum(values);
        if (total <= 0) continue;
        (deployments[tid] ??= {})[Number(pid)] = total;
      }
    }

    // 2. Resolve + score (both mutate game).
    const results = resolveRound(game, deployments) as ResolveResultRow[];
    scoreRound(game);

    // 3. Build a human-readable log of what changed.
    const changeLines: string[] = [];
    for (const r of results) {
      if (!r.changed) continue;
      const terr = game.board.territories[r.territoryId]!;
      const who =
        r.newOwner === null
          ? 'no one (left neutral)'
          : r.newOwner === HUMAN_ID
            ? 'YOU'
            : factionName(game, r.newOwner);
      changeLines.push(`${terr.name} → ${who}${r.contested ? ' (contested)' : ''}`);
    }
    if (changeLines.length === 0) changeLines.push('No territories changed hands this round.');

    // Note any combat abilities that fed into the totals above — these resolve
    // inside the model (we can't show the per-tile arithmetic) so we surface
    // them here so the player knows the bonus was applied.
    const abilityLines: string[] = [];
    for (const p of game.players) {
      const who = p.id === HUMAN_ID ? 'You' : factionName(game, p.id);
      if (combatBonus(p.faction) > 0) {
        abilityLines.push(`⚔ ${who}: Warlord +${combatBonus(p.faction)} to every contested total.`);
      }
      if (attackBonus(p.faction) > 0) {
        abilityLines.push(`⚔ ${who}: Ambush +${attackBonus(p.faction)} when attacking a tile they don't hold.`);
      }
      if (defenseBonusFor(p.faction) > 0) {
        abilityLines.push(`🛡 ${who}: Consecrate +${defenseBonusFor(p.faction)} defending owned tiles.`);
      }
    }

    setLog([`— Round ${game.round} resolved —`, ...changeLines, ...abilityLines]);
    setPhase('review');
    bump();
  }

  // ── Advance to the next round / end the game ───────────────────────────────────

  function onNextRound() {
    if (phase !== 'review') return;
    const rng = rngRef.current!;

    if (game.round >= ROUNDS) {
      // Game over → reveal hidden objectives, finalize VP.
      scoreObjectives(game);
      setPhase('end');
      bump();
      return;
    }

    game.round += 1;
    const nextHand = rollHand(game, HUMAN_ID, rng);
    beginRoundDeploy(nextHand);
    bump();
  }

  // ── Derived display data ─────────────────────────────────────────────────────

  const territories = Object.values(game.board.territories);
  const myValuation = (spoil: Spoil | 'universal') => valueOf(FACTIONS[humanFaction], spoil);
  const bonusDice = catchUpDiceCount(game, HUMAN_ID);

  // ── Ability-trigger feedback (UI-computed) ──
  // Necromancers — Soul Harvest: the model pushes one extra Soldier die into the
  // hand for each contest lost last round. We can't tell those apart from the
  // catch-up reinforcements that also pad the hand, so we surface the total
  // "extra" beyond the base pool and attribute the non-catch-up remainder to the
  // harvest. (hand.length − pool.length − catch-up = raised-from-the-fallen.)
  const harvestReinforcements =
    humanFaction === 'necromancers'
      ? Math.max(0, hand.length - game.players[HUMAN_ID]!.pool.length - bonusDice)
      : 0;

  // Merchants — Coffers: +1 VP per 2 territories held. Project it from the live
  // ownership so the player sees the bonus they're banking this round.
  const tilesHeld =
    humanFaction === 'merchants'
      ? Object.values(game.owner).filter((o) => o === HUMAN_ID).length
      : 0;
  const coffersBonus = humanFaction === 'merchants' ? Math.floor(tilesHeld / 2) : 0;

  const standings = [...game.players].sort((a, b) => b.vp - a.vp);
  const winner = standings[0];

  // Map each USED human die slot → the tile it was committed to, so the hand can
  // show a "→ {territory}" tag on placed dice. Greedy value-match, deterministic.
  const slotPlacement = useMemo(() => {
    const map: Record<number, string> = {};
    const claimed = new Set<number>();
    for (const [tid, perPlayer] of Object.entries(commitments)) {
      const mine = perPlayer[HUMAN_ID];
      if (!mine) continue;
      for (const v of mine) {
        for (let slot = 0; slot < hand.length; slot++) {
          if (claimed.has(slot)) continue;
          if (!usedDice.has(slot)) continue;
          if (hand[slot]?.value === v) {
            claimed.add(slot);
            map[slot] = tid;
            break;
          }
        }
      }
    }
    return map;
  }, [commitments, hand, usedDice]);

  // Live instruction line that tracks the turn-based deploy flow.
  const remainingDice = hand.length - usedDice.size;
  let instruction: string;
  if (phase !== 'deploy') {
    instruction = '';
  } else if (deployDone) {
    instruction = 'Everyone has deployed — press Resolve →';
  } else if (turn !== HUMAN_ID) {
    instruction = `${factionName(game, turn)} is deploying…`;
  } else if (passed.has(HUMAN_ID)) {
    instruction = 'You passed — waiting for the round to finish…';
  } else if (selected !== null) {
    instruction = `Your turn — click a glowing territory to send your ${hand[selected]?.value ?? ''}`;
  } else if (remainingDice > 0) {
    instruction = 'Your turn — click a die to select it, then a tile (or Pass)';
  } else {
    instruction = 'Your turn — no dice left; press Pass';
  }

  const hoveredTerritory = hoveredTid ? game.board.territories[hoveredTid] : undefined;

  return (
    <div className="min-h-screen px-4 py-5 md:px-8" style={{ background: '#0a0a12', color: '#e4e4e7' }}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Iron &amp; Ash <span style={{ color: '#a78bfa' }}>v2</span> Sandbox
          </h1>
          <p className="text-xs" style={{ color: '#71717a' }}>
            You are <span style={{ color: PLAYER_COLOR[HUMAN_ID] }}>{FACTIONS[humanFaction].name}</span> ·
            turn-by-turn deployment vs AI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PhaseBadge phase={phase} round={game.round} />
          <button
            onClick={() => setHowToOpen(true)}
            className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{ background: 'rgba(124,58,237,0.18)', color: '#c4b5fd' }}
            title="How to play"
          >
            ? How to play
          </button>
          <button
            onClick={onNewGame}
            className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#e4e4e7' }}
          >
            New game
          </button>
        </div>
      </header>

      <V2HowTo open={howToOpen} onClose={closeHowTo} />
      <SetupPanel open={setupOpen} onStart={onStartSetup} myValuation={(f, s) => valueOf(FACTIONS[f], s)} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        {/* ── Board ── */}
        <section
          className="rounded-2xl p-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {phase === 'deploy' && (
            <TurnBanner
              turn={turn}
              deployDone={deployDone}
              humanPassed={passed.has(HUMAN_ID)}
              text={instruction}
              hasSelection={selected !== null}
            />
          )}
          <Board
            territories={territories}
            game={game}
            reachableSet={reachableSet}
            commitments={commitments}
            phase={phase}
            isHumanTurn={isHumanTurn}
            selected={selected}
            myValuation={myValuation}
            onTerritoryClick={onTerritoryClick}
            onRecallFromTile={recallFromTile}
            onHoverTerritory={setHoveredTid}
          />
          <BoardLegend game={game} />
        </section>

        {/* ── HUD / side panel ── */}
        <aside className="flex flex-col gap-3">
          <Standings players={game.players} phase={phase} turn={turn} deployDone={deployDone} />
          <Inspector
            territory={hoveredTerritory}
            game={game}
            myValuation={myValuation}
            commitments={commitments}
          />
          <FactionCard
            faction={humanFaction}
            myValuation={myValuation}
            abilityNote={
              humanFaction === 'merchants'
                ? `Coffers: +${coffersBonus} VP this round (holding ${tilesHeld} ${tilesHeld === 1 ? 'territory' : 'territories'})`
                : humanFaction === 'necromancers' && harvestReinforcements > 0
                  ? `Soul Harvest: +${harvestReinforcements} ${harvestReinforcements === 1 ? 'die' : 'dice'} raised from the fallen this round`
                  : null
            }
          />
          <ObjectiveCard objectiveId={game.players[HUMAN_ID]!.objectiveId} />

          {phase === 'deploy' && (
            <Hand
              hand={hand}
              usedDice={usedDice}
              selected={selected}
              bonusDice={bonusDice}
              slotPlacement={slotPlacement}
              territories={game.board.territories}
              instruction={instruction}
              interactive={isHumanTurn}
              onSelectDie={onSelectDie}
            />
          )}

          {log.length > 0 && <ResolveLog lines={log} />}

          {/* ── Action buttons ── */}
          <div className="flex flex-col gap-2">
            {phase === 'deploy' && !deployDone && isHumanTurn && (
              <button
                onClick={onPass}
                className="rounded-xl px-4 py-3 text-sm font-bold transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#e4e4e7' }}
                title="Stop placing dice for this round"
              >
                Pass
              </button>
            )}
            {phase === 'deploy' && deployDone && (
              <button
                onClick={onResolve}
                className="rounded-xl px-4 py-3 text-sm font-bold text-white transition-colors"
                style={{ background: '#7c3aed' }}
              >
                Resolve round →
              </button>
            )}
            {phase === 'review' && (
              <button
                onClick={onNextRound}
                className="rounded-xl px-4 py-3 text-sm font-bold text-white transition-colors"
                style={{ background: '#2563eb' }}
              >
                {game.round >= ROUNDS ? 'Reveal results →' : 'Next round →'}
              </button>
            )}
          </div>

          {phase === 'end' && winner && (
            <EndPanel players={standings} winner={winner} onPlayAgain={onNewGame} />
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Board (SVG) ───────────────────────────────────────────────────────────────

interface BoardProps {
  territories: TerritoryV2[];
  game: GameV2;
  reachableSet: Set<string>;
  commitments: Commitments;
  phase: Phase;
  isHumanTurn: boolean;
  selected: number | null;
  myValuation: (spoil: Spoil | 'universal') => number;
  onTerritoryClick: (tid: string) => void;
  onRecallFromTile: (tid: string) => void;
  onHoverTerritory: (tid: string | null) => void;
}

function Board({
  territories,
  game,
  reachableSet,
  commitments,
  phase,
  isHumanTurn,
  selected,
  myValuation,
  onTerritoryClick,
  onRecallFromTile,
  onHoverTerritory,
}: BoardProps) {
  // Dedupe undirected edge pairs.
  const edges = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ a: TerritoryV2; b: TerritoryV2 }> = [];
    for (const t of territories) {
      for (const adjId of t.adjacency) {
        const key = [t.id, adjId].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const adj = game.board.territories[adjId];
        if (adj) out.push({ a: t, b: adj });
      }
    }
    return out;
  }, [territories, game.board.territories]);

  const NODE = 92;
  const half = NODE / 2;

  return (
    <svg viewBox="0 0 800 600" className="w-full" style={{ maxHeight: '78vh' }}>
      <defs>
        {/* Pulsing teal ring for armed (selected-die) reachable tiles. Respects
            reduced-motion via a media query on the animate element. */}
        <style>{`
          @keyframes ia-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.95; } }
          .ia-reach-armed { animation: ia-pulse 1.1s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .ia-reach-armed { animation: none; opacity: 0.9; }
          }
        `}</style>
      </defs>

      {/* Edges */}
      {edges.map(({ a, b }, i) => (
        <line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={2}
        />
      ))}

      {/* Nodes */}
      {territories.map((t) => {
        const owner = game.owner[t.id];
        // Reachable glow only matters while it's actually the human's turn.
        const reachableNow = isHumanTurn && reachableSet.has(t.id);
        // Tiles you can't deploy into this turn are visibly dimmed.
        const dimmed = phase === 'deploy' && isHumanTurn && !reachableNow;
        const perPlayer = commitments[t.id] ?? {};
        const myCommitted = perPlayer[HUMAN_ID] ?? [];
        const armable = reachableNow && selected !== null;

        const ownerName =
          owner === undefined
            ? 'neutral'
            : owner === HUMAN_ID
              ? 'you'
              : factionName(game, owner);

        // Build a per-player committed summary for the tooltip.
        const committedLines = Object.entries(perPlayer)
          .map(([pid, values]) => {
            const id = Number(pid);
            const label = id === HUMAN_ID ? 'You' : factionName(game, id);
            return `${label}: ${values.join('+')} = ${sum(values)}`;
          });
        const tooltip =
          `${t.name} — ${t.role}, ${t.terrain}\n` +
          `Spoil: ${SPOIL_LABEL[t.spoil]} (worth ${myValuation(t.spoil)} to you)\n` +
          `Defense bonus: +${t.defenseBonus}\n` +
          `Owner: ${ownerName}` +
          (committedLines.length > 0 ? `\n${committedLines.join('\n')}` : '');

        // Players who have committed here, in playerId order, for the chip rows.
        const committedPlayers = Object.keys(perPlayer)
          .map(Number)
          .filter((pid) => (perPlayer[pid] ?? []).length > 0)
          .sort((a, b) => a - b);

        return (
          <g
            key={t.id}
            onClick={() => onTerritoryClick(t.id)}
            onMouseEnter={() => onHoverTerritory(t.id)}
            onMouseLeave={() => onHoverTerritory(null)}
            style={{ cursor: armable ? 'pointer' : 'default', opacity: dimmed ? 0.45 : 1 }}
          >
            {/* Native tooltip — reliable everywhere; HUD inspector is the richer view. */}
            <title>{tooltip}</title>

            {/* reachable ring — steady when no die is selected, pulsing teal when armed */}
            {reachableNow && (
              <rect
                className={armable ? 'ia-reach-armed' : undefined}
                x={t.x - half - 4}
                y={t.y - half - 4}
                width={NODE + 8}
                height={NODE + 8}
                rx={14}
                fill="none"
                stroke={PLAYER_COLOR[HUMAN_ID]}
                strokeWidth={armable ? 3.5 : 1.5}
                opacity={armable ? undefined : 0.4}
              />
            )}

            {/* node body — spoil fill, owner border */}
            <rect
              x={t.x - half}
              y={t.y - half}
              width={NODE}
              height={NODE}
              rx={10}
              fill={SPOIL_COLOR[t.spoil]}
              fillOpacity={0.22}
              stroke={ownerColor(owner)}
              strokeWidth={3}
            />

            {/* spoil dot + label (top-left) */}
            <circle cx={t.x - half + 11} cy={t.y - half + 12} r={6} fill={SPOIL_COLOR[t.spoil]} />
            <text x={t.x - half + 21} y={t.y - half + 16} fontSize={9} fill="#d4d4d8">
              {t.spoil === 'universal' ? 'all' : t.spoil}
            </text>

            {/* your valuation (top-right) — bigger, the key at-a-glance number */}
            <text
              x={t.x + half - 8}
              y={t.y - half + 17}
              textAnchor="end"
              fontSize={14}
              fontWeight={800}
              fill="#fde68a"
            >
              {myValuation(t.spoil)}
            </text>

            {/* defense bonus (bottom-left) */}
            {t.defenseBonus > 0 && (
              <text x={t.x - half + 8} y={t.y + half - 8} fontSize={11} fill="#93c5fd">
                🛡{t.defenseBonus}
              </text>
            )}

            {/* territory name (center) */}
            <text
              x={t.x}
              y={t.y + 3}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill="#fafafa"
            >
              {t.name.length > 15 ? `${t.name.slice(0, 14)}…` : t.name}
            </text>

            {/* role (under name) */}
            <text x={t.x} y={t.y + 17} textAnchor="middle" fontSize={9} fill="#a1a1aa" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t.role}
            </text>

            {/* committed dice — BOTH sides, one short row per player below the tile,
                each chip in that player's colour, so you see who massed what. */}
            {committedPlayers.length > 0 && (
              <g>
                {committedPlayers.map((pid, rowIdx) => {
                  const values = perPlayer[pid] ?? [];
                  const color = PLAYER_COLOR[pid] ?? NEUTRAL_COLOR;
                  const chipW = 15;
                  const gap = 3;
                  const rowH = 15;
                  const totalW = values.length * chipW + (values.length - 1) * gap;
                  const startX = t.x - totalW / 2;
                  const rowY = t.y + half + 8 + rowIdx * (rowH + 3);
                  const total = sum(values);
                  return (
                    <g key={pid}>
                      {values.map((v, i) => {
                        const cx = startX + i * (chipW + gap) + chipW / 2;
                        return (
                          <g key={i}>
                            <rect
                              x={cx - chipW / 2}
                              y={rowY}
                              width={chipW}
                              height={rowH}
                              rx={4}
                              fill={color}
                            />
                            <text
                              x={cx}
                              y={rowY + rowH - 4}
                              textAnchor="middle"
                              fontSize={9}
                              fontWeight={800}
                              fill="#0a0a12"
                            >
                              {v}
                            </text>
                          </g>
                        );
                      })}
                      {/* running total to the right of the row */}
                      {values.length > 1 && (
                        <text
                          x={startX + totalW + 5}
                          y={rowY + rowH - 4}
                          fontSize={9}
                          fontWeight={700}
                          fill={color}
                        >
                          ={total}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* recall hotspot — small × to pull back the human's last die here.
                Only on the human's own turn (recalling mid-AI desyncs the board). */}
            {isHumanTurn && myCommitted.length > 0 && (
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  onRecallFromTile(t.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={t.x + half - 6} cy={t.y - half + 6} r={8} fill="#27272a" stroke="#52525b" />
                <text
                  x={t.x + half - 6}
                  y={t.y - half + 9}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={800}
                  fill="#fca5a5"
                >
                  ×
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function BoardLegend({ game }: { game: GameV2 }) {
  const allSpoils: Spoil[] = ['iron', 'gold', 'essence', 'bone', 'wild', 'faith'];
  const humanFaction = game.players[HUMAN_ID]!.faction;
  return (
    <div className="mt-2 flex flex-col gap-2 px-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]" style={{ color: '#a1a1aa' }}>
        <span className="flex cursor-help items-center gap-1" title="The big number top-right of each tile is how many VP that tile's spoil is worth to YOU each round you hold it.">
          <span className="inline-block h-3 w-3 rounded" style={{ background: '#fde68a' }} />
          number top-right = your VP value
        </span>
        <span
          className="flex cursor-help items-center gap-1"
          title="The coloured border shows who currently owns the tile — your colour (teal) is yours, grey is neutral, other colours are rivals."
        >
          <span className="inline-block h-3 w-3 rounded border-2" style={{ borderColor: PLAYER_COLOR[0] }} />
          border = owner
        </span>
        <span
          className="cursor-help"
          title="🛡 +N is the defender's terrain bonus, added to whoever currently holds the tile when you attack it. Fortresses and the centre are +3 — hard to storm."
        >
          🛡+N = defense bonus
        </span>
      </div>
      {/* Who's-who: each player's colour, so the committed-dice chip rows read. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: '#a1a1aa' }}>
        <span className="mr-1" style={{ color: '#71717a' }}>dice under a tile = committed force:</span>
        {game.players.map((p) => (
          <span key={p.id} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded"
              style={{ background: PLAYER_COLOR[p.id] ?? NEUTRAL_COLOR }}
            />
            {p.id === HUMAN_ID ? 'You' : FACTIONS[p.faction].name}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: '#a1a1aa' }}>
        <span className="mr-1" style={{ color: '#71717a' }}>spoils (hover):</span>
        {allSpoils.map((s) => (
          <span
            key={s}
            className="flex cursor-help items-center gap-1"
            title={`${SPOIL_LABEL[s]} — a tile bearing this spoil. As ${FACTIONS[humanFaction].name} it is worth ${valueOf(
              FACTIONS[humanFaction],
              s,
            )} VP to you.`}
          >
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: SPOIL_COLOR[s] }} />
            {SPOIL_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Turn banner + hover inspector ──────────────────────────────────────────────

// The whose-turn indicator that sits above the board during deployment.
function TurnBanner({
  turn,
  deployDone,
  humanPassed,
  text,
  hasSelection,
}: {
  turn: number;
  deployDone: boolean;
  humanPassed: boolean;
  text: string;
  hasSelection: boolean;
}) {
  const yourTurn = !deployDone && turn === HUMAN_ID && !humanPassed;
  const aiTurn = !deployDone && turn !== HUMAN_ID;
  const accent = deployDone
    ? '#a78bfa'
    : yourTurn
      ? PLAYER_COLOR[HUMAN_ID]
      : aiTurn
        ? PLAYER_COLOR[turn] ?? '#a78bfa'
        : '#a1a1aa';

  return (
    <div
      className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
      style={{
        background: hasSelection ? 'rgba(45,212,191,0.14)' : 'rgba(255,255,255,0.05)',
        color: yourTurn ? (hasSelection ? '#5eead4' : '#d4d4d8') : accent,
        border: `1px solid ${hasSelection ? 'rgba(45,212,191,0.4)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {/* turn dot — pulses while an AI is deploying */}
      <span
        className={aiTurn ? 'ia-reach-armed' : undefined}
        style={{
          display: 'inline-block',
          height: 10,
          width: 10,
          borderRadius: 9999,
          background: accent,
          flexShrink: 0,
        }}
      />
      <span>{text}</span>
      {aiTurn && (
        <span className="ml-1 text-[10px]" style={{ color: '#71717a' }}>
          (watch the board)
        </span>
      )}
    </div>
  );
}

function Inspector({
  territory,
  game,
  myValuation,
  commitments,
}: {
  territory: TerritoryV2 | undefined;
  game: GameV2;
  myValuation: (spoil: Spoil | 'universal') => number;
  commitments: Commitments;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
        Territory inspector
      </h2>
      {!territory ? (
        <p className="text-xs" style={{ color: '#71717a' }}>
          Hover a territory on the board to see its details.
        </p>
      ) : (
        (() => {
          const owner = game.owner[territory.id];
          const ownerName =
            owner === undefined
              ? 'Neutral'
              : owner === HUMAN_ID
                ? 'You'
                : factionName(game, owner);
          const v = myValuation(territory.spoil);
          const perPlayer = commitments[territory.id] ?? {};
          const committedPlayers = Object.keys(perPlayer)
            .map(Number)
            .filter((pid) => (perPlayer[pid] ?? []).length > 0)
            .sort((a, b) => a - b);
          return (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{territory.name}</span>
                <span className="text-[10px] uppercase tracking-wide" style={{ color: '#a1a1aa' }}>
                  {territory.role}
                </span>
              </div>
              <InspectorRow label="Terrain">
                <span title={TERRAIN_HELP[territory.terrain]} className="cursor-help">
                  {territory.terrain}
                </span>
              </InspectorRow>
              <InspectorRow label="Spoil">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: SPOIL_COLOR[territory.spoil] }}
                  />
                  {SPOIL_LABEL[territory.spoil]}
                  <span style={{ color: '#fde68a' }}>· worth {v} to you</span>
                </span>
              </InspectorRow>
              <InspectorRow label="Defense">
                <span title={TERRAIN_HELP[territory.terrain]} className="cursor-help" style={{ color: '#93c5fd' }}>
                  🛡 +{territory.defenseBonus} to defender
                </span>
              </InspectorRow>
              <InspectorRow label="Owner">
                <span
                  className="flex items-center gap-1.5"
                  style={{ color: owner === HUMAN_ID ? '#fafafa' : '#d4d4d8' }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: ownerColor(owner) }}
                  />
                  {ownerName}
                </span>
              </InspectorRow>
              <InspectorRow label="Committed">
                {committedPlayers.length === 0 ? (
                  <span style={{ color: '#71717a' }}>none yet</span>
                ) : (
                  <span className="flex flex-col items-end gap-0.5">
                    {committedPlayers.map((pid) => {
                      const values = perPlayer[pid] ?? [];
                      const label = pid === HUMAN_ID ? 'You' : factionName(game, pid);
                      return (
                        <span key={pid} style={{ color: PLAYER_COLOR[pid] ?? NEUTRAL_COLOR }}>
                          {label}: {values.join(' + ')} = {sum(values)}
                        </span>
                      );
                    })}
                  </span>
                )}
              </InspectorRow>
            </div>
          );
        })()
      )}
    </div>
  );
}

function InspectorRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0" style={{ color: '#71717a' }}>
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}

// ── HUD components ────────────────────────────────────────────────────────────

function PhaseBadge({ phase, round }: { phase: Phase; round: number }) {
  const label = phase === 'deploy' ? 'Deploy' : phase === 'review' ? 'Review' : 'Game over';
  const color = phase === 'deploy' ? '#34d399' : phase === 'review' ? '#60a5fa' : '#fbbf24';
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs font-semibold"
      style={{ background: 'rgba(255,255,255,0.05)', color }}
    >
      Round {Math.min(round, ROUNDS)} / {ROUNDS} · {label}
    </div>
  );
}

function Standings({
  players,
  phase,
  turn,
  deployDone,
}: {
  players: GameV2['players'];
  phase: Phase;
  turn: number;
  deployDone: boolean;
}) {
  const sorted = phase === 'end' ? [...players].sort((a, b) => b.vp - a.vp) : players;
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
        Standings
      </h2>
      <div className="space-y-2">
        {sorted.map((p) => {
          const isActiveTurn = phase === 'deploy' && !deployDone && p.id === turn;
          const ability = FACTIONS[p.faction].ability;
          return (
            <div key={p.id}>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: PLAYER_COLOR[p.id] }} />
                <span className="flex-1 truncate" style={{ color: p.id === HUMAN_ID ? '#fafafa' : '#d4d4d8' }}>
                  {FACTIONS[p.faction].name}
                  {p.id === HUMAN_ID && <span className="ml-1 text-[10px]" style={{ color: '#71717a' }}>(you)</span>}
                  {isActiveTurn && (
                    <span className="ml-1.5 text-[10px] font-semibold" style={{ color: PLAYER_COLOR[p.id] }}>
                      ◀ deploying
                    </span>
                  )}
                </span>
                <span className="font-mono font-bold tabular-nums" style={{ color: PLAYER_COLOR[p.id] }}>
                  {p.vp}
                </span>
              </div>
              {/* Each faction's signature ability, so you can see what every
                  rival in the game can do (full text on hover). */}
              <div
                className="ml-5 cursor-help truncate text-[10px] leading-tight"
                style={{ color: '#71717a' }}
                title={`${ability.name} — ${ability.description}`}
              >
                <span style={{ color: '#a1a1aa' }}>✦ {ability.name}</span>
                <span> — {ability.description}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FactionCard({
  faction,
  myValuation,
  abilityNote,
}: {
  faction: FactionId;
  myValuation: (spoil: Spoil | 'universal') => number;
  /** A live "ability is firing right now" line, e.g. coffers/harvest. */
  abilityNote?: string | null;
}) {
  const def = FACTIONS[faction];
  const allSpoils: Spoil[] = ['iron', 'gold', 'essence', 'bone', 'wild', 'faith'];
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
        Your faction · {def.name}
      </h2>

      {/* Signature ability — prominent, since it's the second identity axis. */}
      <div
        className="mb-2.5 rounded-lg px-2.5 py-2"
        style={{ background: 'rgba(45,212,191,0.10)', border: '1px solid rgba(45,212,191,0.3)' }}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 12 }}>✦</span>
          <span className="text-xs font-bold" style={{ color: '#5eead4' }}>
            {def.ability.name}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] leading-snug" style={{ color: '#d4d4d8' }}>
          {def.ability.description}
        </div>
        {abilityNote && (
          <div
            className="mt-1.5 rounded px-1.5 py-1 text-[11px] font-semibold"
            style={{ background: 'rgba(45,212,191,0.18)', color: '#99f6e4' }}
          >
            {abilityNote}
          </div>
        )}
      </div>

      <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
        Spoils &amp; your VP value
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs">
        {allSpoils.map((s) => {
          const v = myValuation(s);
          const tier = v === 3 ? 'primary' : v === 2 ? 'secondary' : 'other';
          return (
            <div
              key={s}
              className="flex items-center gap-1.5 rounded px-1.5 py-1"
              style={{ background: v >= 2 ? 'rgba(255,255,255,0.05)' : 'transparent' }}
            >
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: SPOIL_COLOR[s] }} />
              <span className="flex-1 truncate" style={{ color: v >= 2 ? '#fafafa' : '#a1a1aa' }}>
                {SPOIL_LABEL[s]}
              </span>
              <span className="font-mono font-bold" style={{ color: v === 3 ? '#fde68a' : v === 2 ? '#d4d4d8' : '#71717a' }} title={tier}>
                {v}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ObjectiveCard({ objectiveId }: { objectiveId: string }) {
  const obj = objectiveById(objectiveId);
  if (!obj) return null;
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.3)' }}>
      <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#a78bfa' }}>
        Your hidden objective
      </h2>
      <div className="text-sm font-bold text-white">{obj.name}</div>
      <div className="text-xs" style={{ color: '#c4b5fd' }}>{obj.description}</div>
    </div>
  );
}

function Hand({
  hand,
  usedDice,
  selected,
  bonusDice,
  slotPlacement,
  territories,
  instruction,
  interactive,
  onSelectDie,
}: {
  hand: RolledDie[];
  usedDice: Set<number>;
  selected: number | null;
  bonusDice: number;
  slotPlacement: Record<number, string>;
  territories: Record<string, TerritoryV2>;
  instruction: string;
  interactive: boolean;
  onSelectDie: (slot: number) => void;
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h2 className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
        <span>Your hand</span>
        {bonusDice > 0 && (
          <span
            className="cursor-help rounded px-1.5 py-0.5 text-[9px] normal-case"
            style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}
            title="Catch-up reinforcements — extra Soldier dice granted because you're trailing the leader. They give force to contest with, not free VP."
          >
            +{bonusDice} catch-up
          </span>
        )}
      </h2>
      <div className="flex flex-wrap gap-2" style={{ opacity: interactive ? 1 : 0.6 }}>
        {hand.map((die, slot) => {
          const used = usedDice.has(slot);
          const isSelected = selected === slot;
          const profile = UNIT_PROFILE[die.unit.range];
          const tier = TIER_META[profile.tier] ?? TIER_META.Soldier!;
          const placedTid = slotPlacement[slot];
          const placedName = placedTid ? territories[placedTid]?.name : undefined;
          const clickable = interactive && !used;

          return (
            <button
              key={`${die.unit.id}-${slot}`}
              onClick={() => clickable && onSelectDie(slot)}
              disabled={!clickable}
              title={
                used
                  ? `Placed${placedName ? ` on ${placedName}` : ''}. ${tier.help}`
                  : interactive
                    ? tier.help
                    : `${tier.help} — wait for your turn.`
              }
              className="relative flex w-16 flex-col items-center overflow-hidden rounded-lg pt-1.5 pb-1 transition-all"
              style={{
                background: isSelected ? PLAYER_COLOR[HUMAN_ID] : 'rgba(255,255,255,0.07)',
                border: isSelected ? `2px solid #fff` : `2px solid ${used ? 'transparent' : tier.band}`,
                opacity: used ? 0.4 : 1,
                cursor: clickable ? 'pointer' : 'default',
                transform: isSelected ? 'translateY(-4px)' : 'none',
                boxShadow: isSelected ? `0 0 0 3px ${PLAYER_COLOR[HUMAN_ID]}66, 0 6px 14px rgba(0,0,0,0.5)` : 'none',
              }}
            >
              {/* tier colour band across the top */}
              <span
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: isSelected ? '#fff' : tier.band }}
              />
              <span
                className="text-xl font-black leading-none"
                style={{ color: isSelected ? '#0a0a12' : '#fafafa' }}
              >
                {die.value}
              </span>
              <span
                className="mt-0.5 text-[8px] font-bold uppercase leading-none tracking-wide"
                style={{ color: isSelected ? '#0a0a12' : tier.text }}
              >
                {profile.tier}
              </span>
              <span className="text-[7px] leading-none" style={{ color: isSelected ? '#1c1917' : '#71717a' }}>
                {die.unit.range}
              </span>
              {/* placed → territory tag */}
              {used && placedName && (
                <span
                  className="mt-1 max-w-full truncate px-0.5 text-[7px] leading-tight"
                  style={{ color: PLAYER_COLOR[HUMAN_ID] }}
                >
                  → {placedName}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px]" style={{ color: '#a1a1aa' }}>
        {instruction}
        {interactive && usedDice.size > 0 && (
          <span style={{ color: '#71717a' }}> · tap the × on a tile to recall your last die</span>
        )}
      </p>
    </div>
  );
}

function ResolveLog({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
        Round log
      </h2>
      <div className="space-y-1 text-xs" style={{ color: '#d4d4d8' }}>
        {lines.map((line, i) => {
          const isHeader = line.startsWith('—');
          // Ability notes (⚔/🛡) are secondary context — dim them.
          const isAbility = line.startsWith('⚔') || line.startsWith('🛡');
          return (
            <div
              key={i}
              className={isHeader ? 'font-bold text-white' : ''}
              style={isAbility ? { color: '#a1a1aa', fontSize: '0.6875rem' } : undefined}
            >
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EndPanel({
  players,
  winner,
  onPlayAgain,
}: {
  players: GameV2['players'];
  winner: GameV2['players'][number];
  onPlayAgain: () => void;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)' }}>
      <div className="mb-2 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#fbbf24' }}>
          Winner
        </div>
        <div className="text-lg font-black text-white">
          {FACTIONS[winner.faction].name}
          {winner.id === HUMAN_ID && ' — that’s you!'}
        </div>
        <div className="font-mono text-sm" style={{ color: '#fde68a' }}>{winner.vp} VP</div>
      </div>

      <div className="space-y-2 border-t pt-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        {players.map((p) => {
          const obj = objectiveById(p.objectiveId);
          return (
            <div key={p.id} className="text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PLAYER_COLOR[p.id] }} />
                  <span className="font-semibold text-white">{FACTIONS[p.faction].name}</span>
                </span>
                <span className="font-mono font-bold" style={{ color: PLAYER_COLOR[p.id] }}>{p.vp} VP</span>
              </div>
              <div className="pl-4" style={{ color: '#a1a1aa' }}>
                {obj ? (
                  <>
                    {obj.name}: <span style={{ color: p.objectiveVp > 0 ? '#34d399' : '#71717a' }}>+{p.objectiveVp}</span>
                  </>
                ) : (
                  'no objective'
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onPlayAgain}
        className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition-colors"
        style={{ background: '#7c3aed' }}
      >
        Play again
      </button>
    </div>
  );
}

// ── Faction setup (New Game) ────────────────────────────────────────────────
//
// Pre-game modal: choose player count (2/3/4) and your faction, then the
// opponents auto-fill to a VALID, conflict-guaranteed ring combo containing
// your pick (you seated first). "Shuffle" cycles the distinct valid combos when
// more than one exists. Showing each faction's ability + primary spoil up front
// makes the choice informed; showing the opponents' abilities makes the matchup
// clear before the first die is placed.

function SetupPanel({
  open,
  onStart,
  myValuation,
}: {
  open: boolean;
  onStart: (factionIds: FactionId[]) => void;
  myValuation: (faction: FactionId, spoil: Spoil | 'universal') => number;
}) {
  const [count, setCount] = useState<number>(2);
  const [human, setHuman] = useState<FactionId>('warriors');
  // Cycles the distinct valid combos that contain the human's pick.
  const [comboPick, setComboPick] = useState<number>(0);

  if (!open) return null;

  const factionIds = buildFactionIds(human, count, comboPick);
  const opponents = factionIds.slice(1);
  const comboOptions = comboCountFor(human, count);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New game setup"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(5,5,10,0.82)',
        backdropFilter: 'blur(2px)',
        overflowY: 'auto',
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-5 md:p-6"
        style={{
          background: '#15151f',
          border: '1px solid rgba(167,139,250,0.4)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          color: '#e4e4e7',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        <h2 className="mb-1 text-lg font-bold text-white">
          New game · <span style={{ color: '#a78bfa' }}>choose your matchup</span>
        </h2>
        <p className="mb-4 text-xs" style={{ color: '#a1a1aa' }}>
          Pick how many players and which faction you&rsquo;ll lead. Opponents are
          drawn from the rivalry ring so every neighbour shares spoils with you —
          guaranteed conflict.
        </p>

        {/* Player count */}
        <div className="mb-4">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
            Players
          </div>
          <div className="flex gap-2">
            {[2, 3, 4].map((n) => {
              const active = n === count;
              return (
                <button
                  key={n}
                  onClick={() => {
                    setCount(n);
                    setComboPick(0);
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-bold transition-colors"
                  style={{
                    background: active ? '#7c3aed' : 'rgba(255,255,255,0.07)',
                    color: active ? '#fff' : '#d4d4d8',
                    border: active ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {n} players
                </button>
              );
            })}
          </div>
        </div>

        {/* Faction picker */}
        <div className="mb-4">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
            Your faction
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ALL_FACTIONS.map((fid) => {
              const def = FACTIONS[fid];
              const active = fid === human;
              return (
                <button
                  key={fid}
                  onClick={() => {
                    setHuman(fid);
                    setComboPick(0);
                  }}
                  className="rounded-lg p-2.5 text-left transition-colors"
                  style={{
                    background: active ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.04)',
                    border: active ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white">{def.name}</span>
                    <span
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#d4d4d8' }}
                      title={`Primary spoil — worth ${myValuation(fid, def.primary)} VP to ${def.name}`}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: SPOIL_COLOR[def.primary] }}
                      />
                      {SPOIL_LABEL[def.primary]} · {myValuation(fid, def.primary)}VP
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-semibold" style={{ color: active ? '#c4b5fd' : '#a1a1aa' }}>
                    ✦ {def.ability.name}
                  </div>
                  <div className="text-[10px] leading-snug" style={{ color: '#a1a1aa' }}>
                    {def.ability.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Opponent preview */}
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
              Opponents ({opponents.length})
            </span>
            {comboOptions > 1 && (
              <button
                onClick={() => setComboPick((i) => i + 1)}
                className="rounded px-2 py-1 text-[10px] font-semibold transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#c4b5fd' }}
                title="Cycle to another valid set of opponents from the rivalry ring."
              >
                ⟳ Shuffle opponents
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {opponents.map((fid, i) => {
              const def = FACTIONS[fid];
              const color = PLAYER_COLOR[i + 1] ?? NEUTRAL_COLOR;
              return (
                <div
                  key={fid}
                  className="flex items-start gap-2 rounded-lg p-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <span className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{def.name}</span>
                      <span
                        className="flex items-center gap-1 text-[10px]"
                        style={{ color: '#a1a1aa' }}
                        title={`Primary spoil — worth ${myValuation(fid, def.primary)} VP to ${def.name}`}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: SPOIL_COLOR[def.primary] }}
                        />
                        {SPOIL_LABEL[def.primary]}
                      </span>
                    </div>
                    <div className="text-[10px] leading-snug" style={{ color: '#a1a1aa' }}>
                      <span style={{ color: '#c4b5fd' }}>✦ {def.ability.name}</span> — {def.ability.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => onStart(factionIds)}
          className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition-colors"
          style={{ background: '#7c3aed' }}
        >
          Start game →
        </button>
      </div>
    </div>
  );
}
