// ─── Iron & Ash v2 — interactive sandbox ─────────────────────────────────────
//
// A single-screen "play the v2 model against the AI" sandbox. This page ONLY
// drives the pure v2 model in src/v2/ — it imports and reads that logic, never
// modifies it. Turn model: simultaneous commitment (human deploys, then every
// AI plans, then a single resolveRound + scoreRound).
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
import { FACTIONS, valueOf, type FactionId, type Spoil } from '../../v2/factions';
import { planDeployment } from '../../v2/ai';
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

type Phase = 'deploy' | 'review' | 'end';

interface ResolveResultRow {
  territoryId: string;
  changed: boolean;
  contested: boolean;
  newOwner: number | null;
}

// Human placements: territoryId → list of committed die VALUES placed there.
type Placements = Record<string, number[]>;

function ownerColor(ownerId: number | undefined): string {
  if (ownerId === undefined) return NEUTRAL_COLOR;
  return PLAYER_COLOR[ownerId] ?? NEUTRAL_COLOR;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// ── Page ────────────────────────────────────────────────────────────────────

// Build a fresh game + its rng stream + round-1 hand for a given seed counter.
// Pure: no React state touched, so it's safe to call from a lazy initializer.
function freshGame(counter: number): { game: GameV2; rng: Rng; hand: RolledDie[] } {
  const game = createGameV2(DEFAULT_FACTIONS, `v2-sandbox-${counter}`);
  // A separate, long-lived rng stream for rolling hands round-to-round.
  const rng = new Rng(`v2-sandbox-rng-${counter}`);
  game.round = 1; // begin round 1
  const hand = rollHand(game, HUMAN_ID, rng);
  return { game, rng, hand };
}

export function V2Page() {
  // A counter mixed into the seed so "New game" reseeds deterministically-ish.
  const [seedCounter, setSeedCounter] = useState(0);

  // The mutable game + its rng live in refs; `version` forces re-renders after
  // the model mutates in place. Lazy-init once so no setState fires in render.
  const initial = useRef<{ game: GameV2; rng: Rng; hand: RolledDie[] } | null>(null);
  if (initial.current === null) initial.current = freshGame(0);
  const gameRef = useRef<GameV2>(initial.current.game);
  const rngRef = useRef<Rng>(initial.current.rng);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [phase, setPhase] = useState<Phase>('deploy');
  const [hand, setHand] = useState<RolledDie[]>(() => initial.current!.hand);
  // Which hand-slot indices have been committed (so each die is used once).
  const [usedDice, setUsedDice] = useState<Set<number>>(new Set());
  // Selected die slot index (the one waiting to be placed), or null.
  const [selected, setSelected] = useState<number | null>(null);
  // territoryId → die values the human committed there.
  const [placements, setPlacements] = useState<Placements>({});
  const [log, setLog] = useState<string[]>([]);
  // The territory the player is hovering (drives the HUD inspector panel).
  const [hoveredTid, setHoveredTid] = useState<string | null>(null);
  // "How to play" overlay — auto-shows once (localStorage-gated), reopenable.
  const [howToOpen, setHowToOpen] = useState(false);
  useEffect(() => {
    if (shouldAutoShowHowTo()) setHowToOpen(true);
  }, []);
  const closeHowTo = useCallback(() => {
    setHowToOpen(false);
    markHowToSeen();
  }, []);

  // ── Game lifecycle ─────────────────────────────────────────────────────────

  // Start a brand-new game. Only called from event handlers, so setState is safe.
  const startGame = useCallback((counter: number) => {
    const next = freshGame(counter);
    gameRef.current = next.game;
    rngRef.current = next.rng;
    setHand(next.hand);
    setUsedDice(new Set());
    setSelected(null);
    setPlacements({});
    setLog([]);
    setPhase('deploy');
    bump();
  }, [bump]);

  const game = gameRef.current;
  const humanFaction = game.players[HUMAN_ID]!.faction;
  const reachableSet = useMemo(
    () => reachable(game, HUMAN_ID),
    // recompute whenever ownership/round may have changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, phase, game.round, game.clock],
  );

  function onNewGame() {
    const next = seedCounter + 1;
    setSeedCounter(next);
    startGame(next);
  }

  // ── Deploy interactions ──────────────────────────────────────────────────────

  function onSelectDie(slot: number) {
    if (phase !== 'deploy') return;
    if (usedDice.has(slot)) return;
    setSelected((cur) => (cur === slot ? null : slot));
  }

  function onTerritoryClick(tid: string) {
    if (phase !== 'deploy') return;
    if (!reachableSet.has(tid)) return;
    if (selected === null) return;
    const die = hand[selected];
    if (!die) return;
    setPlacements((p) => ({ ...p, [tid]: [...(p[tid] ?? []), die.value] }));
    setUsedDice((u) => {
      const next = new Set(u);
      next.add(selected);
      return next;
    });
    setSelected(null);
  }

  // Recall a single placed die (by hand slot) back to the hand. Used when the
  // player clicks a dimmed "placed" die in the hand. Removes ONE matching value
  // from its territory's committed list (the slot→territory map handles which).
  function recallDie(slot: number, tid: string) {
    if (phase !== 'deploy') return;
    if (!usedDice.has(slot)) return;
    const value = hand[slot]?.value;
    if (value === undefined) return;
    setPlacements((p) => {
      const values = p[tid];
      if (!values) return p;
      const idx = values.indexOf(value);
      if (idx === -1) return p;
      const nextValues = [...values];
      nextValues.splice(idx, 1);
      const next = { ...p };
      if (nextValues.length === 0) delete next[tid];
      else next[tid] = nextValues;
      return next;
    });
    setUsedDice((u) => {
      const next = new Set(u);
      next.delete(slot);
      return next;
    });
    setSelected(null);
  }

  // Clear all dice the human committed to a territory, returning them to hand.
  function clearTerritory(tid: string) {
    if (phase !== 'deploy') return;
    const committedValues = placements[tid];
    if (!committedValues || committedValues.length === 0) return;
    // Free the matching used-dice slots: find used slots whose value matches,
    // returning exactly as many as were committed here.
    setUsedDice((u) => {
      const next = new Set(u);
      const want = [...committedValues];
      for (const slot of [...next]) {
        const v = hand[slot]?.value;
        const idx = v === undefined ? -1 : want.indexOf(v);
        if (idx !== -1) {
          want.splice(idx, 1);
          next.delete(slot);
        }
        if (want.length === 0) break;
      }
      return next;
    });
    setPlacements((p) => {
      const next = { ...p };
      delete next[tid];
      return next;
    });
    setSelected(null);
  }

  // ── Resolve the round ────────────────────────────────────────────────────────

  function onResolve() {
    if (phase !== 'deploy') return;
    const rng = rngRef.current!;

    // 1. Build the merged Deployments object: human (player 0) + every AI.
    const deployments: Deployments = {};
    const addCommit = (tid: string, pid: number, value: number) => {
      if (value <= 0) return;
      const slot = (deployments[tid] ??= {});
      slot[pid] = (slot[pid] ?? 0) + value;
    };

    // Human placements.
    for (const [tid, values] of Object.entries(placements)) {
      const total = sum(values);
      if (total > 0) addCommit(tid, HUMAN_ID, total);
    }

    // Every AI player rolls + plans.
    const aiSummaries: string[] = [];
    for (let p = 1; p < game.players.length; p++) {
      const aiHand = rollHand(game, p, rng);
      const plan = planDeployment(game, p, aiHand);
      let placed = 0;
      for (const [tid, value] of Object.entries(plan)) {
        if (value > 0) {
          addCommit(tid, p, value);
          placed += value;
        }
      }
      aiSummaries.push(
        `${FACTIONS[game.players[p]!.faction].name} committed ${placed} force across ${
          Object.keys(plan).length
        } territories.`,
      );
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
            : FACTIONS[game.players[r.newOwner]!.faction].name;
      changeLines.push(`${terr.name} → ${who}${r.contested ? ' (contested)' : ''}`);
    }
    if (changeLines.length === 0) changeLines.push('No territories changed hands this round.');

    setLog([`— Round ${game.round} resolved —`, ...changeLines, ...aiSummaries]);
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
    setHand(nextHand);
    setUsedDice(new Set());
    setSelected(null);
    setPlacements({});
    setLog([]);
    setPhase('deploy');
    bump();
  }

  // ── Derived display data ─────────────────────────────────────────────────────

  const territories = Object.values(game.board.territories);
  const myValuation = (spoil: Spoil | 'universal') => valueOf(FACTIONS[humanFaction], spoil);
  const bonusDice = catchUpDiceCount(game, HUMAN_ID);

  const standings = [...game.players].sort((a, b) => b.vp - a.vp);
  const winner = standings[0];

  // Map each USED die slot → the territory it was committed to, so the hand can
  // show a "→ {territory}" tag on placed dice. Mirrors clearTerritory's
  // value-matching: walk each territory's committed values and claim a matching
  // unused slot for each. Greedy + deterministic, good enough for the tag UI.
  const slotPlacement = useMemo(() => {
    const map: Record<number, string> = {};
    const claimed = new Set<number>();
    for (const [tid, values] of Object.entries(placements)) {
      for (const v of values) {
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
  }, [placements, hand, usedDice]);

  // Live instruction line that tracks the deploy flow.
  const remainingDice = hand.length - usedDice.size;
  let instruction: string;
  if (selected !== null) {
    instruction = `② Click a glowing territory to send your ${hand[selected]?.value ?? ''}`;
  } else if (remainingDice > 0) {
    instruction = '① Click a die to select it';
  } else {
    instruction = 'All dice committed — press Resolve →';
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
            simultaneous commitment vs AI
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        {/* ── Board ── */}
        <section
          className="rounded-2xl p-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {phase === 'deploy' && <InstructionLine text={instruction} hasSelection={selected !== null} />}
          <Board
            territories={territories}
            game={game}
            reachableSet={reachableSet}
            placements={placements}
            phase={phase}
            selected={selected}
            myValuation={myValuation}
            onTerritoryClick={onTerritoryClick}
            onClearTerritory={clearTerritory}
            onHoverTerritory={setHoveredTid}
          />
          <BoardLegend />
        </section>

        {/* ── HUD / side panel ── */}
        <aside className="flex flex-col gap-3">
          <Standings players={game.players} phase={phase} />
          <Inspector
            territory={hoveredTerritory}
            game={game}
            myValuation={myValuation}
            placements={placements}
          />
          <FactionCard faction={humanFaction} myValuation={myValuation} />
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
              onSelectDie={onSelectDie}
              onRecallDie={recallDie}
            />
          )}

          {log.length > 0 && <ResolveLog lines={log} />}

          {/* ── Action buttons ── */}
          <div className="flex flex-col gap-2">
            {phase === 'deploy' && (
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
  placements: Placements;
  phase: Phase;
  selected: number | null;
  myValuation: (spoil: Spoil | 'universal') => number;
  onTerritoryClick: (tid: string) => void;
  onClearTerritory: (tid: string) => void;
  onHoverTerritory: (tid: string | null) => void;
}

function Board({
  territories,
  game,
  reachableSet,
  placements,
  phase,
  selected,
  myValuation,
  onTerritoryClick,
  onClearTerritory,
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
        const reachableNow = phase === 'deploy' && reachableSet.has(t.id);
        // Tiles you can't deploy into this turn are visibly dimmed.
        const dimmed = phase === 'deploy' && !reachableNow;
        const committed = placements[t.id] ?? [];
        const committedTotal = sum(committed);
        const armable = reachableNow && selected !== null;

        const ownerName =
          owner === undefined
            ? 'neutral'
            : owner === HUMAN_ID
              ? 'you'
              : FACTIONS[game.players[owner]!.faction].name;
        const tooltip =
          `${t.name} — ${t.role}, ${t.terrain}\n` +
          `Spoil: ${SPOIL_LABEL[t.spoil]} (worth ${myValuation(t.spoil)} to you)\n` +
          `Defense bonus: +${t.defenseBonus}\n` +
          `Owner: ${ownerName}` +
          (committedTotal > 0 ? `\nYour committed force: ${committedTotal}` : '');

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

            {/* committed dice — one chip per die value, in your colour, sitting
                just under the tile so you see exactly what you sent (not a sum). */}
            {committed.length > 0 && (
              <g>
                {committed.map((v, i) => {
                  const chipW = 16;
                  const gap = 3;
                  const totalW = committed.length * chipW + (committed.length - 1) * gap;
                  const startX = t.x - totalW / 2;
                  const cx = startX + i * (chipW + gap) + chipW / 2;
                  const cy = t.y + half + 9;
                  return (
                    <g key={i}>
                      <rect
                        x={cx - chipW / 2}
                        y={cy - 8}
                        width={chipW}
                        height={16}
                        rx={4}
                        fill={PLAYER_COLOR[HUMAN_ID]}
                      />
                      <text
                        x={cx}
                        y={cy + 4}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={800}
                        fill="#0a0a12"
                      >
                        {v}
                      </text>
                    </g>
                  );
                })}
                {committed.length > 1 && (
                  <text
                    x={t.x}
                    y={t.y + half + 26}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={700}
                    fill={PLAYER_COLOR[HUMAN_ID]}
                  >
                    = {committedTotal}
                  </text>
                )}
              </g>
            )}

            {/* clear hotspot — small × when the human has dice here */}
            {phase === 'deploy' && committed.length > 0 && (
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  onClearTerritory(t.id);
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

function BoardLegend() {
  const allSpoils: Spoil[] = ['iron', 'gold', 'essence', 'bone', 'wild', 'faith'];
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: '#a1a1aa' }}>
        <span className="mr-1" style={{ color: '#71717a' }}>spoils (hover):</span>
        {allSpoils.map((s) => (
          <span
            key={s}
            className="flex cursor-help items-center gap-1"
            title={`${SPOIL_LABEL[s]} — a tile bearing this spoil. As Warriors it is worth ${valueOf(
              FACTIONS.warriors,
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

// ── Instruction line + hover inspector ────────────────────────────────────────

function InstructionLine({ text, hasSelection }: { text: string; hasSelection: boolean }) {
  return (
    <div
      className="mb-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
      style={{
        background: hasSelection ? 'rgba(45,212,191,0.14)' : 'rgba(255,255,255,0.05)',
        color: hasSelection ? '#5eead4' : '#d4d4d8',
        border: `1px solid ${hasSelection ? 'rgba(45,212,191,0.4)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {text}
    </div>
  );
}

function Inspector({
  territory,
  game,
  myValuation,
  placements,
}: {
  territory: TerritoryV2 | undefined;
  game: GameV2;
  myValuation: (spoil: Spoil | 'universal') => number;
  placements: Placements;
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
                : FACTIONS[game.players[owner]!.faction].name;
          const v = myValuation(territory.spoil);
          const committed = placements[territory.id] ?? [];
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
              <InspectorRow label="Your dice">
                {committed.length === 0 ? (
                  <span style={{ color: '#71717a' }}>none committed</span>
                ) : (
                  <span style={{ color: PLAYER_COLOR[HUMAN_ID] }}>
                    {committed.join(' + ')} = {sum(committed)}
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

function Standings({ players, phase }: { players: GameV2['players']; phase: Phase }) {
  const sorted = phase === 'end' ? [...players].sort((a, b) => b.vp - a.vp) : players;
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
        Standings
      </h2>
      <div className="space-y-1.5">
        {sorted.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: PLAYER_COLOR[p.id] }} />
            <span className="flex-1 truncate" style={{ color: p.id === HUMAN_ID ? '#fafafa' : '#d4d4d8' }}>
              {FACTIONS[p.faction].name}
              {p.id === HUMAN_ID && <span className="ml-1 text-[10px]" style={{ color: '#71717a' }}>(you)</span>}
            </span>
            <span className="font-mono font-bold tabular-nums" style={{ color: PLAYER_COLOR[p.id] }}>
              {p.vp}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactionCard({
  faction,
  myValuation,
}: {
  faction: FactionId;
  myValuation: (spoil: Spoil | 'universal') => number;
}) {
  const def = FACTIONS[faction];
  const allSpoils: Spoil[] = ['iron', 'gold', 'essence', 'bone', 'wild', 'faith'];
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#71717a' }}>
        Your faction · {def.name}
      </h2>
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
  onSelectDie,
  onRecallDie,
}: {
  hand: RolledDie[];
  usedDice: Set<number>;
  selected: number | null;
  bonusDice: number;
  slotPlacement: Record<number, string>;
  territories: Record<string, TerritoryV2>;
  instruction: string;
  onSelectDie: (slot: number) => void;
  onRecallDie: (slot: number, tid: string) => void;
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
      <div className="flex flex-wrap gap-2">
        {hand.map((die, slot) => {
          const used = usedDice.has(slot);
          const isSelected = selected === slot;
          const profile = UNIT_PROFILE[die.unit.range];
          const tier = TIER_META[profile.tier] ?? TIER_META.Soldier!;
          const placedTid = slotPlacement[slot];
          const placedName = placedTid ? territories[placedTid]?.name : undefined;

          return (
            <button
              key={`${die.unit.id}-${slot}`}
              onClick={() => (used && placedTid ? onRecallDie(slot, placedTid) : onSelectDie(slot))}
              title={
                used
                  ? `Placed${placedName ? ` on ${placedName}` : ''} — click to recall. ${tier.help}`
                  : tier.help
              }
              className="relative flex w-16 flex-col items-center overflow-hidden rounded-lg pt-1.5 pb-1 transition-all"
              style={{
                background: isSelected ? PLAYER_COLOR[HUMAN_ID] : 'rgba(255,255,255,0.07)',
                border: isSelected ? `2px solid #fff` : `2px solid ${used ? 'transparent' : tier.band}`,
                opacity: used ? 0.4 : 1,
                cursor: 'pointer',
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
        {usedDice.size > 0 && <span style={{ color: '#71717a' }}> · click a dimmed die to recall it</span>}
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
        {lines.map((line, i) => (
          <div key={i} className={line.startsWith('—') ? 'font-bold text-white' : ''}>
            {line}
          </div>
        ))}
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
