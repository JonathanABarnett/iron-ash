// Interactive game viewer. Phase 5b first slice: AI-vs-AI watch mode.
// Set up a lineup, then step through turns or auto-play; per-turn AI reasoning
// is captured and surfaced in the side panel. Human-controlled players land
// in a follow-up (the action menu UI is the missing piece).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Rng } from '@engine/rng';
import { createGame } from '@engine/setup';
import { apply } from '@engine/moves';
import { endOfRound, isRoundOver, rollPhase } from '@engine/rounds';
import { pickMove } from '@ai/decide';
import type { Difficulty } from '@ai/types';
import type {
  AIReasoning,
  FactionId,
  GameState,
  Move,
  PlayerId,
} from '@engine/types';
import { loadConfigs } from '@ui/configLoader';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';
import { TerrainBadge, terrainLabel } from '@ui/components/TerrainBadge';
import { ResourceIcon } from '@ui/components/ResourceIcon';

const ALL_FACTIONS: FactionId[] = [
  'warriors',
  'assassins',
  'mages',
  'necromancers',
  'merchants',
  'rangers',
  'paladins',
  'beastmasters',
];

interface AILogEntry {
  turn: number;
  round: number;
  playerId: PlayerId;
  move: Move;
  reasoning: AIReasoning;
}

interface ActiveGame {
  state: GameState;
  log: AILogEntry[];
  rngSnapshot: string;
}

export function PlayPage() {
  const [lineup, setLineup] = useState<FactionId[]>([
    'warriors',
    'mages',
    'merchants',
  ]);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [seed, setSeed] = useState('play-1');
  const [active, setActive] = useState<ActiveGame | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configs = useMemo(() => loadConfigs(), []);

  function start() {
    try {
      setError(null);
      const state = createGame({
        seed,
        players: lineup.map((factionId, i) => ({
          id: `p${i + 1}`,
          factionId,
          isAI: true,
        })),
        regions: configs.regions,
        factions: configs.factions,
        rules: configs.rules,
        roundGoals: configs.roundGoals,
        secretGoals: configs.secretGoals,
      });
      setActive({ state, log: [], rngSnapshot: state.rngState });
      setAutoplay(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function step(prev: ActiveGame): ActiveGame {
    const rng = Rng.fromSnapshot(JSON.parse(prev.rngSnapshot));
    let state = prev.state;
    let newLog = prev.log;

    if (state.phase === 'finished') return prev;

    if (state.phase === 'roll') {
      state = rollPhase(state, { rng, cards: configs.cards });
    } else if (isRoundOver(state)) {
      state = endOfRound(state, {
        rules: configs.rules,
        roundGoals: configs.roundGoals,
        secretGoals: configs.secretGoals,
      });
    } else {
      const playerIdAtMove = state.activePlayerId;
      const turnAtMove = state.turn;
      const roundAtMove = state.round;
      const { move, reasoning } = pickMove(state, {
        rules: configs.rules,
        cards: configs.cards,
        roundGoals: configs.roundGoals,
        secretGoals: configs.secretGoals,
        rng,
        difficulty,
      });
      state = apply(state, move, {
        rules: configs.rules,
        cards: configs.cards,
        rng,
      });
      newLog = [
        ...prev.log.slice(-49), // keep last 50
        {
          turn: turnAtMove,
          round: roundAtMove,
          playerId: playerIdAtMove,
          move,
          reasoning,
        },
      ];
    }

    return {
      state,
      log: newLog,
      rngSnapshot: JSON.stringify(rng.snapshot()),
    };
  }

  function stepOnce() {
    setActive((prev) => (prev ? step(prev) : prev));
  }

  // Auto-play: step every N ms until finished or paused.
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  useEffect(() => {
    if (!active || !autoplay) return;
    if (active.state.phase === 'finished') {
      setAutoplay(false);
      return;
    }
    const id = window.setTimeout(() => {
      if (!autoplayRef.current) return;
      setActive((prev) => (prev ? step(prev) : prev));
    }, 80);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, autoplay]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Iron &amp; Ash — Play</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Watch AI factions play a full game with their per-turn scoring reasoning shown.
        Human input lands later.
      </p>

      {/* Setup */}
      <section className="mt-6 rounded border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <LineupPicker value={lineup} onChange={setLineup} />
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-neutral-400">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-100"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-neutral-400">
            Seed
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="rounded bg-neutral-800 px-3 py-2 text-sm font-mono text-neutral-100"
            />
          </label>
          <button
            type="button"
            onClick={start}
            className="rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500"
          >
            {active ? 'Restart' : 'Start game'}
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded border border-red-700 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}
      </section>

      {active && (
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <GameStatusBar
              state={active.state}
              onStep={stepOnce}
              autoplay={autoplay}
              onToggleAutoplay={() => setAutoplay((p) => !p)}
            />
            <MercPool state={active.state} />
            <PlayersGrid state={active.state} />
            <RegionsGrid state={active.state} />
            {active.state.phase === 'finished' && <EndGamePanel state={active.state} />}
          </div>
          <AILogPanel entries={active.log} state={active.state} />
        </section>
      )}
    </main>
  );
}

function LineupPicker({
  value,
  onChange,
}: {
  value: FactionId[];
  onChange: (next: FactionId[]) => void;
}) {
  function toggle(id: FactionId) {
    if (value.includes(id)) {
      if (value.length <= 2) return; // need at least 2
      onChange(value.filter((x) => x !== id));
    } else {
      if (value.length >= 4) return;
      onChange([...value, id]);
    }
  }
  return (
    <div className="flex flex-col gap-1 text-xs uppercase tracking-wide text-neutral-400">
      <span>Lineup ({value.length}/4)</span>
      <div className="flex flex-wrap gap-1">
        {ALL_FACTIONS.map((id) => {
          const picked = value.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-xs normal-case tracking-normal ${
                picked
                  ? 'border-purple-600 bg-purple-950/40 text-purple-100'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
              }`}
              title={factionLabel(id)}
            >
              <FactionEmblem factionId={id} size={20} />
              <span>{factionLabel(id)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GameStatusBar({
  state,
  onStep,
  autoplay,
  onToggleAutoplay,
}: {
  state: GameState;
  onStep: () => void;
  autoplay: boolean;
  onToggleAutoplay: () => void;
}) {
  const goalSlot = state.roundGoals.find((s) => s.forRound === state.round);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-800 bg-neutral-900/40 p-3 text-sm">
      <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs uppercase tracking-wide">
        Round {state.round} / {state.phase === 'finished' ? state.round : '7'}
      </span>
      <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs uppercase tracking-wide">
        Phase: {state.phase}
      </span>
      <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs uppercase tracking-wide">
        Threat: {state.threatTrack}
      </span>
      {state.freeForAll && (
        <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-200">
          Free-for-all
        </span>
      )}
      {goalSlot && (
        <span className="text-xs text-neutral-300">
          Goal: <span className="font-medium text-neutral-100">{goalSlot.goalId}</span>
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onStep}
          disabled={state.phase === 'finished'}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
        >
          Step
        </button>
        <button
          type="button"
          onClick={onToggleAutoplay}
          disabled={state.phase === 'finished'}
          className={`rounded px-3 py-1 text-xs font-semibold ${
            autoplay
              ? 'bg-amber-600 text-white hover:bg-amber-500'
              : 'bg-purple-600 text-white hover:bg-purple-500'
          } disabled:opacity-50`}
        >
          {autoplay ? 'Pause' : 'Auto-play'}
        </button>
      </div>
    </div>
  );
}

function PlayersGrid({ state }: { state: GameState }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {state.turnOrder.map((pid) => {
        const player = state.players[pid]!;
        const isActive = pid === state.activePlayerId && state.phase === 'action';
        return (
          <div
            key={pid}
            className={`rounded border p-3 text-sm ${
              isActive
                ? 'border-purple-600 bg-purple-950/20'
                : 'border-neutral-800 bg-neutral-900/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <FactionEmblem factionId={player.factionId} size={28} />
                <span className="font-medium">
                  {player.id} — {factionLabel(player.factionId)}
                </span>
              </span>
              <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">
                {player.vp} VP
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-400">
              <ResourceRow resources={player.resources} />
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-neutral-400">
              <span>
                Dice: {player.dice.filter((d) => d.location.kind === 'barracks').length} in
                barracks · {player.dice.filter((d) => d.location.kind === 'region').length}{' '}
                placed · {player.dice.filter((d) => d.location.kind === 'garrison').length}{' '}
                garrisoned
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {player.dice
                .filter((d) => d.location.kind === 'barracks' && d.faceValue !== null)
                .map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex h-7 w-7 items-center justify-center rounded bg-neutral-800 text-sm font-semibold text-neutral-100"
                    title={`${d.range} die showing ${d.faceValue}`}
                  >
                    {d.faceValue}
                  </span>
                ))}
            </div>
            {player.hand.length > 0 && (
              <div className="mt-2 text-xs text-neutral-400">Hand: {player.hand.length}</div>
            )}
            {player.passedThisRound && (
              <div className="mt-1 text-xs text-amber-300">Passed for round</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResourceRow({
  resources,
}: {
  resources: { iron: number; gold: number; essence: number };
}) {
  return (
    <span className="flex items-center gap-3">
      <span className="inline-flex items-center gap-1">
        <ResourceIcon resource="iron" size={16} />
        <span className="tabular-nums">{resources.iron}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <ResourceIcon resource="gold" size={16} />
        <span className="tabular-nums">{resources.gold}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <ResourceIcon resource="essence" size={16} />
        <span className="tabular-nums">{resources.essence}</span>
      </span>
    </span>
  );
}

function MercPool({ state }: { state: GameState }) {
  return (
    <div className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900/40 p-3 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Mercs
      </span>
      <MercSlot label="Low" die={state.mercs.low} claimedBy={state.mercs.claimed.low} />
      <MercSlot label="High" die={state.mercs.high} claimedBy={state.mercs.claimed.high} />
      <MercSlot
        label={`Specialist (${state.mercs.specialistValue})`}
        die={state.mercs.specialist}
        claimedBy={state.mercs.claimed.specialist}
      />
    </div>
  );
}

function MercSlot({
  label,
  die,
  claimedBy,
}: {
  label: string;
  die: { faceValue: number | null } | null;
  claimedBy?: string | undefined;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${
        claimedBy
          ? 'border-amber-700 bg-amber-950/30 text-amber-200'
          : die
            ? 'border-neutral-700 bg-neutral-900'
            : 'border-neutral-800 bg-neutral-950 text-neutral-500'
      }`}
    >
      <span>{label}</span>
      {die && die.faceValue !== null && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-neutral-800 text-sm font-semibold">
          {die.faceValue}
        </span>
      )}
      {claimedBy && <span>→ {claimedBy}</span>}
      {!die && !claimedBy && <span>empty</span>}
    </div>
  );
}

function RegionsGrid({ state }: { state: GameState }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Regions
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.values(state.regionDefs).map((region) => {
          const rt = state.regions[region.id]!;
          const locked =
            region.unlocksRound !== undefined && state.round < region.unlocksRound;
          return (
            <div
              key={region.id}
              className={`rounded border p-2 text-xs ${
                locked
                  ? 'border-neutral-900 bg-neutral-950/40 text-neutral-600'
                  : region.isFortress
                    ? 'border-amber-900/60 bg-amber-950/10'
                    : 'border-neutral-800 bg-neutral-900/40'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="flex items-center gap-1 truncate font-medium">
                  <TerrainBadge terrain={region.terrain} size={16} />
                  <span className="truncate">{region.name}</span>
                </span>
                <span className="rounded bg-neutral-800 px-1 text-[10px] uppercase">
                  {region.vp}VP
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-400">
                <span>
                  {region.valueRequirement.kind === 'min' && `≥${region.valueRequirement.value}`}
                  {region.valueRequirement.kind === 'max' && `≤${region.valueRequirement.value}`}
                  {region.valueRequirement.kind === 'exact' && `=${region.valueRequirement.value}`}
                  {region.valueRequirement.kind === 'minSum' &&
                    `Σ≥${region.valueRequirement.value}`}
                </span>
                <span>{terrainLabel(region.terrain)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-0.5">
                {rt.placedDieIds.map((id) => {
                  const die = findDie(state, id);
                  if (!die) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-800 text-[10px] font-semibold"
                      title={`${die.ownerId}`}
                    >
                      {die.faceValue}
                    </span>
                  );
                })}
                {rt.garrisonedDieIds.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-900/40 px-1 text-[10px] text-amber-200">
                    🛡 {rt.garrisonedDieIds.length}
                  </span>
                )}
              </div>
              {locked && (
                <div className="mt-1 text-[10px] uppercase tracking-wide">
                  Unlocks R{region.unlocksRound}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function findDie(state: GameState, id: string) {
  for (const player of Object.values(state.players)) {
    const die = player.dice.find((d) => d.id === id);
    if (die) return die;
  }
  return undefined;
}

function AILogPanel({
  entries,
  state,
}: {
  entries: AILogEntry[];
  state: GameState;
}) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        AI reasoning (latest first)
      </h3>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto text-xs">
        {entries
          .slice()
          .reverse()
          .map((entry, idx) => {
            const player = state.players[entry.playerId];
            return (
              <div
                key={`${entry.round}-${entry.turn}-${idx}`}
                className="rounded border border-neutral-800 bg-neutral-950/40 p-2"
              >
                <div className="flex items-center justify-between gap-1 text-[11px] text-neutral-400">
                  <span className="flex items-center gap-1">
                    {player && <FactionEmblem factionId={player.factionId} size={16} />}
                    R{entry.round} T{entry.turn} · {entry.playerId}
                  </span>
                  <span className="rounded bg-neutral-800 px-1 text-[10px]">
                    {entry.move.kind}
                  </span>
                </div>
                <MoveSummary move={entry.move} state={state} />
                {entry.reasoning.candidates.slice(0, 3).map((c, i) => (
                  <div key={i} className="mt-1 text-[10px] text-neutral-500 tabular-nums">
                    {i === 0 ? '★ ' : '  '}
                    {c.move.kind}
                    {c.move.kind === 'place' || c.move.kind === 'combine'
                      ? ` → ${c.move.regionId}`
                      : ''}
                    {' · '}
                    score {c.score}
                  </div>
                ))}
              </div>
            );
          })}
        {entries.length === 0 && (
          <div className="text-xs text-neutral-500">
            No moves yet — press Step or Auto-play.
          </div>
        )}
      </div>
    </div>
  );
}

function MoveSummary({ move, state }: { move: Move; state: GameState }) {
  switch (move.kind) {
    case 'place':
      return (
        <div className="mt-1 text-[11px]">
          Place die on{' '}
          <span className="text-neutral-200">
            {state.regionDefs[move.regionId]?.name ?? move.regionId}
          </span>
        </div>
      );
    case 'combine':
      return (
        <div className="mt-1 text-[11px]">
          Combine 2 dice on{' '}
          <span className="text-neutral-200">
            {state.regionDefs[move.regionId]?.name ?? move.regionId}
          </span>
        </div>
      );
    case 'battle':
      return (
        <div className="mt-1 text-[11px]">
          Battle at{' '}
          <span className="text-neutral-200">
            {state.regionDefs[move.targetRegionId]?.name ?? move.targetRegionId}
          </span>
        </div>
      );
    case 'hire-merc':
      return <div className="mt-1 text-[11px]">Hire {move.mercSlot} merc</div>;
    case 'draft-card':
      return <div className="mt-1 text-[11px]">Draft {move.cardId}</div>;
    case 'play-card':
      return <div className="mt-1 text-[11px]">Play {move.cardId}</div>;
    case 'pass':
      return <div className="mt-1 text-[11px]">Pass</div>;
  }
}

function EndGamePanel({ state }: { state: GameState }) {
  const breakdown = state.scoreBreakdown;
  if (!breakdown) return null;
  const ordered = state.turnOrder
    .map((pid) => breakdown.perPlayer[pid]!)
    .sort((a, b) => b.total - a.total);
  return (
    <div className="rounded border border-purple-700 bg-purple-950/20 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-purple-200">
        Game over — Winner: {state.players[breakdown.winnerId]!.factionId} ({breakdown.winnerId}) ·{' '}
        {breakdown.perPlayer[breakdown.winnerId]!.total} VP
      </h3>
      <table className="mt-3 w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-neutral-400">
          <tr>
            <th className="py-1">Player</th>
            <th className="py-1 text-right">Total</th>
            <th className="py-1 text-right">Goals + Fort/Round</th>
            <th className="py-1 text-right">Region Control</th>
            <th className="py-1 text-right">Fort End-Game</th>
            <th className="py-1 text-right">Full Barracks</th>
            <th className="py-1 text-right">Secret Goals</th>
            <th className="py-1 text-right">Both Bonus</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((p) => {
            const player = state.players[p.playerId]!;
            return (
              <tr key={p.playerId} className="border-t border-neutral-800">
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <FactionEmblem factionId={player.factionId} size={20} />
                    {p.playerId} — {factionLabel(player.factionId)}
                  </span>
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{p.total}</td>
                <td className="py-1.5 text-right tabular-nums">{p.parts.roundGoals}</td>
                <td className="py-1.5 text-right tabular-nums">{p.parts.regionControl}</td>
                <td className="py-1.5 text-right tabular-nums">{p.parts.fortressEndGame}</td>
                <td className="py-1.5 text-right tabular-nums">{p.parts.fullBarracksBonus}</td>
                <td className="py-1.5 text-right tabular-nums">{p.parts.secretGoals}</td>
                <td className="py-1.5 text-right tabular-nums">{p.parts.bothSecretGoalsBonus}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
