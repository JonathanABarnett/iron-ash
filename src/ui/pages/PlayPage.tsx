// Interactive game viewer — Phase 5c: human player input added.
// A faction can be marked "You" in the lineup picker; when it's that player's
// turn the AI is bypassed, autoplay pauses, and a grouped action menu appears.
// All other turns continue to auto-play as before.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Rng } from '@engine/rng';
import { createGame } from '@engine/setup';
import { apply, enumerate } from '@engine/moves';
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
import { MapView } from '@ui/components/MapView';
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
  /** ID of the human-controlled player, if any. */
  humanPlayerId: PlayerId | null;
  /** True when it's the human's action turn — engine pauses until a move is submitted. */
  waitingForHuman: boolean;
  /** All legal moves for the current human turn. */
  pendingMoves: Move[];
  /**
   * Die the human has pre-selected in their player panel.
   * When set, the map only highlights regions reachable by that die and
   * the action menu filters to moves using it.
   */
  selectedDieId: string | null;
}

export function PlayPage() {
  const [lineup, setLineup] = useState<FactionId[]>([
    'warriors',
    'mages',
    'merchants',
  ]);
  const [humanFaction, setHumanFaction] = useState<FactionId | null>('warriors');
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
          isAI: true, // engine treats all as AI; UI intercepts the human's turns
        })),
        regions: configs.regions,
        factions: configs.factions,
        rules: configs.rules,
        roundGoals: configs.roundGoals,
        secretGoals: configs.secretGoals,
      });
      // Derive the human player's id from the chosen faction (order in lineup = p1, p2, …).
      const humanIdx = humanFaction ? lineup.indexOf(humanFaction) : -1;
      const humanPlayerId = humanIdx >= 0 ? `p${humanIdx + 1}` : null;
      setActive({
        state,
        log: [],
        rngSnapshot: state.rngState,
        humanPlayerId,
        waitingForHuman: false,
        pendingMoves: [],
        selectedDieId: null,
      });
      setAutoplay(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function step(prev: ActiveGame): ActiveGame {
    // If already waiting for the human, nothing to advance.
    if (prev.waitingForHuman) return prev;

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
      // Human turn: pause and expose legal moves.
      if (prev.humanPlayerId && state.activePlayerId === prev.humanPlayerId) {
        const pending = enumerate(state, {
          rules: configs.rules,
          cards: configs.cards,
          rng,
        });
        return {
          ...prev,
          rngSnapshot: JSON.stringify(rng.snapshot()),
          waitingForHuman: true,
          pendingMoves: pending,
          selectedDieId: null, // clear selection at start of each human turn
        };
      }

      // AI turn.
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
        ...prev.log.slice(-49),
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
      ...prev,
      state,
      log: newLog,
      rngSnapshot: JSON.stringify(rng.snapshot()),
      waitingForHuman: false,
      pendingMoves: [],
    };
  }

  /** Apply the human's chosen move, clear the waiting state, then advance. */
  function applyHumanMove(move: Move) {
    setActive((prev) => {
      if (!prev || !prev.waitingForHuman) return prev;
      const rng = Rng.fromSnapshot(JSON.parse(prev.rngSnapshot));
      const state = apply(prev.state, move, {
        rules: configs.rules,
        cards: configs.cards,
        rng,
      });
      // Resume normal step cycle from the new state.
      const resumed: ActiveGame = {
        ...prev,
        state,
        rngSnapshot: JSON.stringify(rng.snapshot()),
        waitingForHuman: false,
        pendingMoves: [],
        selectedDieId: null,
      };
      // Immediately advance past any non-human non-action steps (roll / end-of-round).
      return step(resumed);
    });
  }

  /** Toggle die selection. Clicking the same die again clears the selection. */
  function selectDie(dieId: string) {
    setActive((prev) => {
      if (!prev?.waitingForHuman) return prev;
      return {
        ...prev,
        selectedDieId: prev.selectedDieId === dieId ? null : dieId,
      };
    });
  }

  function stepOnce() {
    setActive((prev) => (prev ? step(prev) : prev));
  }

  // Auto-play: step every N ms until finished, paused, or waiting for human.
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  useEffect(() => {
    if (!active || !autoplay) return;
    if (active.state.phase === 'finished') {
      setAutoplay(false);
      return;
    }
    // Pause for human — don't advance, let the action menu handle it.
    if (active.waitingForHuman) return;
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
        Pick a faction, mark it <strong className="text-teal-300">YOU</strong>, then play against AI opponents.
        All AI turns auto-step with scoring reasoning shown.
      </p>

      {/* Setup */}
      <section className="mt-6 rounded border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <LineupPicker
          value={lineup}
          humanFaction={humanFaction}
          onChange={setLineup}
          onSetHuman={setHumanFaction}
        />
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
              humanPlayerId={active.humanPlayerId}
              waitingForHuman={active.waitingForHuman}
              onStep={stepOnce}
              autoplay={autoplay}
              onToggleAutoplay={() => setAutoplay((p) => !p)}
            />
            {active.waitingForHuman && (
              <HumanActionMenu
                moves={active.pendingMoves}
                state={active.state}
                selectedDieId={active.selectedDieId}
                onChoose={applyHumanMove}
                onClearSelection={() =>
                  setActive((p) => (p ? { ...p, selectedDieId: null } : p))
                }
              />
            )}
            <MercPool state={active.state} />
            <PlayersGrid
              state={active.state}
              humanPlayerId={active.humanPlayerId}
              waitingForHuman={active.waitingForHuman}
              selectedDieId={active.selectedDieId}
              onSelectDie={selectDie}
            />
            <MapView
              state={active.state}
              humanMoves={active.waitingForHuman ? active.pendingMoves : []}
              selectedDieId={active.selectedDieId}
              onRegionClick={(_regionId, moves) => {
                // Apply immediately when there's exactly one move (no ambiguity).
                // Multiple moves → fall through to HumanActionMenu.
                if (moves.length === 1) applyHumanMove(moves[0]!);
              }}
            />
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
  humanFaction,
  onChange,
  onSetHuman,
}: {
  value: FactionId[];
  humanFaction: FactionId | null;
  onChange: (next: FactionId[]) => void;
  onSetHuman: (f: FactionId | null) => void;
}) {
  function toggle(id: FactionId) {
    if (value.includes(id)) {
      if (value.length <= 2) return;
      if (humanFaction === id) onSetHuman(null);
      onChange(value.filter((x) => x !== id));
    } else {
      if (value.length >= 4) return;
      onChange([...value, id]);
    }
  }
  return (
    <div className="flex flex-col gap-1.5 text-xs uppercase tracking-wide text-neutral-400">
      <span>Lineup ({value.length}/4)</span>
      <div className="flex flex-wrap gap-1">
        {ALL_FACTIONS.map((id) => {
          const picked = value.includes(id);
          const isHuman = humanFaction === id;
          return (
            <div key={id} className="flex overflow-hidden rounded border border-neutral-700">
              <button
                type="button"
                onClick={() => toggle(id)}
                className={`flex items-center gap-1 px-2 py-1 text-xs normal-case tracking-normal transition ${
                  picked
                    ? 'bg-purple-950/50 text-purple-100'
                    : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                }`}
                title={`Toggle ${factionLabel(id)}`}
              >
                <FactionEmblem factionId={id} size={20} />
                <span>{factionLabel(id)}</span>
              </button>
              {picked && (
                <button
                  type="button"
                  onClick={() => onSetHuman(isHuman ? null : id)}
                  title={isHuman ? 'Switch to AI' : 'Play as this faction'}
                  className={`px-2 py-1 text-[10px] font-bold transition ${
                    isHuman
                      ? 'bg-teal-700 text-white hover:bg-teal-600'
                      : 'bg-neutral-800 text-neutral-500 hover:text-neutral-200'
                  }`}
                >
                  {isHuman ? 'YOU' : 'AI'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GameStatusBar({
  state,
  humanPlayerId,
  waitingForHuman,
  onStep,
  autoplay,
  onToggleAutoplay,
}: {
  state: GameState;
  humanPlayerId: PlayerId | null;
  waitingForHuman: boolean;
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
      {waitingForHuman && (
        <span className="animate-pulse rounded bg-teal-700/60 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-teal-100">
          ⚔ Your Turn
        </span>
      )}
      {!waitingForHuman && humanPlayerId && state.activePlayerId === humanPlayerId && state.phase === 'action' && (
        <span className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
          Your turn next…
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

function PlayersGrid({
  state,
  humanPlayerId,
  waitingForHuman,
  selectedDieId,
  onSelectDie,
}: {
  state: GameState;
  humanPlayerId?: PlayerId | null;
  waitingForHuman?: boolean;
  selectedDieId?: string | null;
  onSelectDie?: (dieId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {state.turnOrder.map((pid) => {
        const player = state.players[pid]!;
        const isActive = pid === state.activePlayerId && state.phase === 'action';
        const isHuman = pid === humanPlayerId;
        const isHumanTurn = isHuman && waitingForHuman;
        return (
          <div
            key={pid}
            className={`rounded border p-3 text-sm transition ${
              isActive
                ? isHuman && waitingForHuman
                  ? 'border-teal-600 bg-teal-950/20'
                  : 'border-purple-600 bg-purple-950/20'
                : 'border-neutral-800 bg-neutral-900/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <FactionEmblem factionId={player.factionId} size={28} />
                <span className="font-medium">
                  {player.id} — {factionLabel(player.factionId)}
                  {isHuman && (
                    <span className="ml-1.5 rounded bg-teal-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-200">
                      You
                    </span>
                  )}
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
                {player.dice.filter((d) => d.location.kind === 'barracks').length} in barracks ·{' '}
                {player.dice.filter((d) => d.location.kind === 'region').length} placed ·{' '}
                {player.dice.filter((d) => d.location.kind === 'garrison').length} garrisoned
              </span>
            </div>

            {/* Barracks dice — clickable on human's turn */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {player.dice
                .filter((d) => d.location.kind === 'barracks' && d.faceValue !== null)
                .map((d) => {
                  const isSelected = d.id === selectedDieId;
                  const clickable = isHumanTurn && !!onSelectDie;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && onSelectDie(d.id)}
                      title={`${d.range} die • face: ${d.faceValue}${clickable ? ' — click to select' : ''}`}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded text-sm font-bold transition ${
                        isSelected
                          ? 'bg-teal-600 text-white ring-2 ring-teal-400 ring-offset-1 ring-offset-neutral-900'
                          : clickable
                            ? 'cursor-pointer bg-neutral-700 text-neutral-100 hover:bg-neutral-600 hover:ring-1 hover:ring-teal-500'
                            : 'bg-neutral-800 text-neutral-100'
                      }`}
                    >
                      {d.faceValue}
                    </button>
                  );
                })}
            </div>

            {isHumanTurn && (
              <p className="mt-1.5 text-[10px] text-teal-400/70">
                Click a die to filter moves · click a glowing region to place
              </p>
            )}

            {player.hand.length > 0 && (
              <div className="mt-2 text-xs text-neutral-400">
                Hand: {player.hand.length} card{player.hand.length !== 1 ? 's' : ''}
              </div>
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

// RegionsGrid removed — replaced by MapView component.

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

function HumanActionMenu({
  moves,
  state,
  selectedDieId,
  onChoose,
  onClearSelection,
}: {
  moves: Move[];
  state: GameState;
  selectedDieId?: string | null;
  onChoose: (m: Move) => void;
  onClearSelection?: () => void;
}) {
  const player = state.players[state.activePlayerId];
  if (!player) return null;

  // When a die is selected, filter moves to those that use that die.
  const visibleMoves = selectedDieId
    ? moves.filter(
        (m) =>
          (m.kind === 'place' && m.dieId === selectedDieId) ||
          (m.kind === 'combine' && (m.dieIds[0] === selectedDieId || m.dieIds[1] === selectedDieId)) ||
          (m.kind === 'battle' && m.attackerDieId === selectedDieId) ||
          m.kind === 'pass',
      )
    : moves;

  // Group moves by kind for a structured display.
  type Group = { label: string; color: string; moves: Move[] };
  const groups: Group[] = [
    { label: '⚔ Battle', color: 'border-red-800 bg-red-950/30', moves: visibleMoves.filter((m) => m.kind === 'battle') },
    { label: '🏰 Garrison / Place', color: 'border-amber-800 bg-amber-950/20', moves: visibleMoves.filter((m) => (m.kind === 'place' || m.kind === 'combine') && state.regionDefs[m.regionId]?.isFortress) },
    { label: '📍 Place / Combine', color: 'border-purple-800 bg-purple-950/20', moves: visibleMoves.filter((m) => (m.kind === 'place' || m.kind === 'combine') && !state.regionDefs[m.regionId]?.isFortress) },
    { label: '⚡ Hire Merc', color: 'border-blue-800 bg-blue-950/20', moves: visibleMoves.filter((m) => m.kind === 'hire-merc') },
    { label: '🃏 Cards', color: 'border-teal-800 bg-teal-950/20', moves: visibleMoves.filter((m) => m.kind === 'draft-card' || m.kind === 'play-card') },
    { label: '⏸ Pass', color: 'border-neutral-700 bg-neutral-900/40', moves: visibleMoves.filter((m) => m.kind === 'pass') },
  ].filter((g) => g.moves.length > 0);

  return (
    <div className="rounded border-2 border-teal-700 bg-teal-950/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-teal-200">
          Choose your action —{' '}
          <span className="text-neutral-300">{player.id} ({factionLabel(player.factionId)})</span>
        </h3>
        <div className="flex items-center gap-2">
          {selectedDieId && (
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded border border-neutral-700 px-2 py-0.5 text-[10px] hover:bg-neutral-800"
              title="Show all moves"
            >
              ✕ Die filter
            </button>
          )}
          <span className="text-xs text-neutral-400">
            {visibleMoves.length}{selectedDieId ? `/${moves.length}` : ''} moves
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              {g.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.moves.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onChoose(m)}
                  className={`rounded border px-3 py-1.5 text-xs transition hover:brightness-125 active:scale-95 ${g.color}`}
                >
                  <HumanMoveLabel move={m} state={state} player={player} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HumanMoveLabel({
  move,
  state,
  player,
}: {
  move: Move;
  state: GameState;
  player: ReturnType<typeof Object.values<typeof state.players[string]>>[number];
}) {
  switch (move.kind) {
    case 'place': {
      const die = player?.dice.find((d) => d.id === move.dieId);
      const region = state.regionDefs[move.regionId];
      return (
        <span>
          [{die?.range ?? '?'}: <strong>{die?.faceValue}</strong>] →{' '}
          <span className="text-neutral-200">{region?.name ?? move.regionId}</span>
          <span className="ml-1 text-neutral-500">({region?.vp}VP)</span>
        </span>
      );
    }
    case 'combine': {
      const dieA = player?.dice.find((d) => d.id === move.dieIds[0]);
      const dieB = player?.dice.find((d) => d.id === move.dieIds[1]);
      const region = state.regionDefs[move.regionId];
      const sum = (dieA?.faceValue ?? 0) + (dieB?.faceValue ?? 0);
      return (
        <span>
          <strong>{dieA?.faceValue}</strong> + <strong>{dieB?.faceValue}</strong> ={' '}
          <strong className="text-teal-300">{sum}</strong> →{' '}
          <span className="text-neutral-200">{region?.name ?? move.regionId}</span>
        </span>
      );
    }
    case 'battle': {
      const die = player?.dice.find((d) => d.id === move.attackerDieId);
      const region = state.regionDefs[move.targetRegionId];
      return (
        <span>
          Attack <span className="text-neutral-200">{region?.name ?? move.targetRegionId}</span>{' '}
          with <strong className="text-red-300">{die?.faceValue}</strong>
        </span>
      );
    }
    case 'hire-merc': {
      const slot = move.mercSlot;
      const die = state.mercs[slot];
      const val = die && typeof die === 'object' && 'faceValue' in die ? die.faceValue : state.mercs.specialistValue;
      return (
        <span>
          {slot === 'low' ? 'Low' : slot === 'high' ? 'High' : 'Specialist'} merc{' '}
          {val !== null && <strong>({val})</strong>}
        </span>
      );
    }
    case 'draft-card':
      return <span>Draft <span className="text-neutral-200">{move.cardId.replace('card-', '')}</span></span>;
    case 'play-card':
      return <span>Play <span className="text-neutral-200">{move.cardId.replace('card-', '')}</span></span>;
    case 'pass':
      return <span className="text-neutral-400">Pass (end turn)</span>;
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
