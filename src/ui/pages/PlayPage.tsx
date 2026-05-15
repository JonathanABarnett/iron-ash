// Iron & Ash — Play page.
// Layout when active:
//   sticky header — round / threat bar / phase / active player / controls
//   human action  — teal banner (only when waitingForHuman)
//   merc bar      — compact single line
//   map           — full-width SVG (no sidebar competition)
//   player strip  — horizontal compact cards
//   AI log        — collapsible bottom section

import { useEffect, useMemo, useRef, useState } from 'react';
import { Rng } from '@engine/rng';
import { createGame } from '@engine/setup';
import { apply, enumerate } from '@engine/moves';
import { endOfRound, isRoundOver, rollPhase } from '@engine/rounds';
import { pickMove } from '@ai/decide';
import type { Difficulty } from '@ai/types';
import type { AIReasoning, FactionId, GameState, Move, PlayerId } from '@engine/types';
import { nextDieRange } from '@engine/types';
import { FACTION_ABILITIES } from '@engine/factions/abilities';
import { loadConfigs } from '@ui/configLoader';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';
import { MapView } from '@ui/components/MapView';
import { ResourceIcon } from '@ui/components/ResourceIcon';
import { Die } from '@ui/components/Die';

const ALL_FACTIONS: FactionId[] = [
  'warriors','assassins','mages','necromancers',
  'merchants','rangers','paladins','beastmasters',
];


interface AILogEntry {
  turn: number; round: number; playerId: PlayerId; move: Move; reasoning: AIReasoning;
}

interface ActiveGame {
  state: GameState; log: AILogEntry[]; rngSnapshot: string;
  humanPlayerId: PlayerId | null; waitingForHuman: boolean;
  pendingMoves: Move[]; selectedDieId: string | null;
}

export function PlayPage() {
  const [lineup, setLineup]             = useState<FactionId[]>(['warriors','mages','merchants']);
  const [humanFaction, setHumanFaction] = useState<FactionId | null>('warriors');
  const [difficulty, setDifficulty]     = useState<Difficulty>('medium');
  const [seed, setSeed]                 = useState('play-1');
  const [active, setActive]             = useState<ActiveGame | null>(null);
  const [autoplay, setAutoplay]         = useState(false);
  const [showLog, setShowLog]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const configs = useMemo(() => loadConfigs(), []);

  function exportReplay() {
    if (!active || active.state.phase !== 'finished') return;
    const payload = {
      version: 1 as const, seed,
      lineup: lineup.map((factionId, i) => ({ playerId: `p${i + 1}`, factionId })),
      difficulty, timestamp: new Date().toISOString(), finalState: active.state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `replay-${seed}-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function start() {
    try {
      setError(null);
      const state = createGame({
        seed,
        players:     lineup.map((factionId, i) => ({ id: `p${i + 1}`, factionId, isAI: true })),
        regions:     configs.regions,
        factions:    configs.factions,
        rules:       configs.rules,
        roundGoals:  configs.roundGoals,
        secretGoals: configs.secretGoals,
      });
      const humanIdx      = humanFaction ? lineup.indexOf(humanFaction) : -1;
      const humanPlayerId = humanIdx >= 0 ? `p${humanIdx + 1}` : null;
      setActive({ state, log: [], rngSnapshot: state.rngState, humanPlayerId, waitingForHuman: false, pendingMoves: [], selectedDieId: null });
      setAutoplay(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const structuresCtx = configs.structures.length ? { structures: configs.structures } : {};

  function step(prev: ActiveGame): ActiveGame {
    if (prev.waitingForHuman) return prev;
    const rng = Rng.fromSnapshot(JSON.parse(prev.rngSnapshot));
    let state = prev.state;
    let newLog = prev.log;
    if (state.phase === 'finished') return prev;
    if (state.phase === 'roll') {
      state = rollPhase(state, { rng, cards: configs.cards });
    } else if (isRoundOver(state)) {
      state = endOfRound(state, { rules: configs.rules, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals, cardKeepCost: configs.costs.cardKeep, ...structuresCtx });
    } else {
      if (prev.humanPlayerId && state.activePlayerId === prev.humanPlayerId) {
        const pending = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
        return { ...prev, rngSnapshot: JSON.stringify(rng.snapshot()), waitingForHuman: true, pendingMoves: pending, selectedDieId: null };
      }
      const playerIdAtMove = state.activePlayerId, turnAtMove = state.turn, roundAtMove = state.round;
      const { move, reasoning } = pickMove(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals, rng, difficulty });
      state  = apply(state, move, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
      newLog = [...prev.log.slice(-49), { turn: turnAtMove, round: roundAtMove, playerId: playerIdAtMove, move, reasoning }];
    }
    return { ...prev, state, log: newLog, rngSnapshot: JSON.stringify(rng.snapshot()), waitingForHuman: false, pendingMoves: [] };
  }

  function applyHumanMove(move: Move) {
    setActive((prev) => {
      if (!prev || !prev.waitingForHuman) return prev;
      const rng   = Rng.fromSnapshot(JSON.parse(prev.rngSnapshot));
      const state = apply(prev.state, move, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
      return step({ ...prev, state, rngSnapshot: JSON.stringify(rng.snapshot()), waitingForHuman: false, pendingMoves: [], selectedDieId: null });
    });
  }

  function selectDie(dieId: string) {
    setActive((prev) => !prev?.waitingForHuman ? prev : { ...prev, selectedDieId: prev.selectedDieId === dieId ? null : dieId });
  }

  function stepOnce() { setActive((prev) => prev ? step(prev) : prev); }

  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  useEffect(() => {
    if (!active || !autoplay) return;
    if (active.state.phase === 'finished') { setAutoplay(false); return; }
    if (active.waitingForHuman) return;
    const id = window.setTimeout(() => { if (autoplayRef.current) setActive((p) => p ? step(p) : p); }, 120);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, autoplay]);

  const rules = configs.rules;

  return (
    <main className="min-h-screen bg-neutral-950">
      {!active && (
        <SetupPanel
          lineup={lineup} humanFaction={humanFaction} difficulty={difficulty} seed={seed} error={error}
          onLineupChange={setLineup} onHumanFactionChange={setHumanFaction} onDifficultyChange={setDifficulty}
          onSeedChange={setSeed} onStart={start} hasActiveGame={false}
        />
      )}

      {active && (
        <>
          {/* ── Sticky header ── */}
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-black/80 px-4 py-2.5 backdrop-blur-xl" style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.4)' }}>
            <span className="text-sm font-bold text-white">
              Round <span className="text-purple-300">{active.state.round}</span>
              <span className="text-neutral-600">/{active.state.phase === 'finished' ? active.state.round : rules.totalRounds}</span>
            </span>
            <ThreatBar track={active.state.threatTrack} threshold={rules.threatTrackThreshold} />
            <PhaseChip phase={active.state.phase} />
            <ActivePlayerChip state={active.state} humanPlayerId={active.humanPlayerId} waitingForHuman={active.waitingForHuman} />
            {active.state.freeForAll && <span className="rounded-md bg-amber-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Free-for-all</span>}
            {(() => { const s = active.state.roundGoals.find((g) => g.forRound === active.state.round); return s ? <span className="text-[10px] text-neutral-500">Goal: <span className="text-neutral-300">{s.goalId}</span></span> : null; })()}
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={stepOnce} disabled={active.state.phase === 'finished'} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-medium hover:bg-neutral-800 disabled:opacity-40 transition">Step ›</button>
              <button type="button" onClick={() => setAutoplay((p) => !p)} disabled={active.state.phase === 'finished'} className={`rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-40 transition ${autoplay ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-purple-600 text-white hover:bg-purple-500'}`}>{autoplay ? '⏸ Pause' : '▶ Auto'}</button>
              <button type="button" onClick={() => setShowLog((p) => !p)} className={`rounded-lg px-3 py-1 text-xs font-medium transition ${showLog ? 'bg-neutral-700 text-white' : 'border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-200'}`}>📋 Log</button>
              <button type="button" onClick={() => { if (window.confirm('Restart?')) setActive(null); }} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-200 transition" title="Restart">⟳</button>
            </div>
          </div>

          {/* ── Human action banner ── */}
          {active.waitingForHuman && (
            <div className="mx-4 mt-3 rounded-2xl p-4 glow-teal"
              style={{
                background: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, rgba(6,182,212,0.04) 100%)',
                border: '1px solid rgba(20,184,166,0.3)',
                boxShadow: '0 0 30px 6px rgba(20,184,166,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-black text-teal-300 uppercase tracking-wide">
                  ⚔ Your Turn — {active.humanPlayerId ? factionLabel(active.state.players[active.humanPlayerId]?.factionId ?? 'warriors') : ''}
                </span>
                {active.selectedDieId && (
                  <button type="button" onClick={() => setActive((p) => p ? { ...p, selectedDieId: null } : p)}
                    className="rounded-lg border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-800 transition">
                    ✕ clear filter
                  </button>
                )}
              </div>
              <HumanActionMenu moves={active.pendingMoves} state={active.state} selectedDieId={active.selectedDieId} onChoose={applyHumanMove} />
            </div>
          )}

          {/* ── Merc bar ── */}
          <div className="flex items-center gap-3 border-b border-neutral-800/60 bg-neutral-900/30 px-4 py-1.5 mt-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Mercs</span>
            <MercSlot label="Low"  die={active.state.mercs.low}       claimedBy={active.state.mercs.claimed.low}       />
            <MercSlot label="High" die={active.state.mercs.high}      claimedBy={active.state.mercs.claimed.high}      />
            <MercSlot label={`Spec·${active.state.mercs.specialistValue}`} die={active.state.mercs.specialist} claimedBy={active.state.mercs.claimed.specialist} />
          </div>

          {/* ── Map ── */}
          <div className="px-4 pt-2">
            <MapView state={active.state} humanMoves={active.waitingForHuman ? active.pendingMoves : []} selectedDieId={active.selectedDieId} onRegionClick={(_id, moves) => { if (moves.length === 1) applyHumanMove(moves[0]!); }} />
          </div>

          {/* ── End-game ── */}
          {active.state.phase === 'finished' && (
            <div className="mx-4 mt-3"><EndGamePanel state={active.state} onExport={exportReplay} /></div>
          )}

          {/* ── Player strip ── */}
          <div className="flex gap-2.5 overflow-x-auto px-4 py-3">
            {active.state.turnOrder.map((pid) => {
              const maxVP = Math.max(...Object.values(active.state.players).map((p) => p?.vp ?? 0));
              return (
                <CompactPlayerCard
                  key={pid}
                  player={active.state.players[pid]!}
                  isActive={pid === active.state.activePlayerId && active.state.phase === 'action'}
                  isHuman={pid === active.humanPlayerId}
                  isLeader={maxVP > 0 && (active.state.players[pid]?.vp ?? 0) === maxVP}
                  waitingForHuman={active.waitingForHuman}
                  selectedDieId={active.selectedDieId}
                  onSelectDie={selectDie}
                  pendingMoves={active.pendingMoves}
                  onChooseMove={applyHumanMove}
                  configs={configs}
                />
              );
            })}
          </div>

          {/* ── AI log ── */}
          {showLog && (
            <div className="border-t border-neutral-800 bg-neutral-900/30 px-4 py-3 mt-1">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-600">AI Reasoning Log</div>
              <div className="max-h-52 overflow-y-auto space-y-0.5">
                {active.log.length === 0 && <div className="text-xs text-neutral-600">No moves yet.</div>}
                {active.log.slice(-20).slice().reverse().map((entry, i) => {
                  const p = active.state.players[entry.playerId];
                  const top = entry.reasoning.candidates[0]?.score;
                  return (
                    <div key={i} className="flex items-center gap-2 rounded px-2 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-800/40">
                      <span className="shrink-0 tabular-nums text-neutral-600">R{entry.round}T{entry.turn}</span>
                      {p && <FactionEmblem factionId={p.factionId} size={12} />}
                      <span className="font-mono text-neutral-300 truncate flex-1"><MoveSummaryInline move={entry.move} state={active.state} /></span>
                      {top !== undefined && <span className="shrink-0 tabular-nums text-neutral-600">{top.toFixed(1)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

// Good default lineups per player count (balanced variety, well-tested combos)
const COUNT_DEFAULTS: Record<number, FactionId[]> = {
  2: ['warriors', 'mages'],
  3: ['warriors', 'mages', 'merchants'],
  4: ['warriors', 'assassins', 'mages', 'merchants'],
};

function SetupPanel({ lineup, humanFaction, difficulty, seed, error, onLineupChange, onHumanFactionChange, onDifficultyChange, onSeedChange, onStart, hasActiveGame }: {
  lineup: FactionId[]; humanFaction: FactionId | null; difficulty: Difficulty; seed: string; error: string | null;
  onLineupChange: (n: FactionId[]) => void; onHumanFactionChange: (f: FactionId | null) => void;
  onDifficultyChange: (d: Difficulty) => void; onSeedChange: (s: string) => void;
  onStart: () => void; hasActiveGame: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-5xl font-black tracking-tight text-white">Iron &amp; Ash</h1>
        <p className="mt-2 text-neutral-400">Asymmetric dice-placement · 8 factions · 16 regions · 7 rounds</p>
      </div>

      {/* ── Player count — primary choice ── */}
      <div className="mb-6">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500">How many players?</div>
        <div className="grid grid-cols-3 gap-3">
          {[2, 3, 4].map((n) => {
            const active = lineup.length === n;
            return (
              <button key={n} type="button"
                onClick={() => {
                  const defaults = COUNT_DEFAULTS[n] ?? COUNT_DEFAULTS[2]!;
                  onLineupChange(defaults);
                  // Keep human faction if it's in the new lineup, else pick first
                  const keepHuman = humanFaction && defaults.includes(humanFaction) ? humanFaction : defaults[0]!;
                  onHumanFactionChange(keepHuman);
                }}
                className={`rounded-2xl border-2 py-4 text-center transition ${
                  active
                    ? 'border-purple-500 bg-purple-900/30 shadow-lg shadow-purple-950/40'
                    : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-800/60'
                }`}
              >
                <div className={`text-3xl font-black ${active ? 'text-white' : 'text-neutral-400'}`}>{n}</div>
                <div className={`text-xs mt-0.5 font-medium ${active ? 'text-purple-300' : 'text-neutral-600'}`}>
                  {n === 2 ? 'head-to-head' : n === 3 ? 'three-way' : 'free-for-all'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Play mode: human vs watch ── */}
      <div className="mb-6">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-500">Your role</div>
        <div className="flex gap-2">
          <button type="button"
            onClick={() => { if (!humanFaction) onHumanFactionChange(lineup[0]!); }}
            className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
              humanFaction ? 'border-teal-600 bg-teal-900/30 text-teal-200 shadow shadow-teal-950/40' : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-600'
            }`}
          >
            🎮 Play (control one faction)
          </button>
          <button type="button"
            onClick={() => onHumanFactionChange(null)}
            className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
              !humanFaction ? 'border-purple-600 bg-purple-900/30 text-purple-200 shadow shadow-purple-950/40' : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-600'
            }`}
          >
            👁 Watch (all AIs)
          </button>
        </div>
      </div>

      {/* ── Faction grid ── */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            Factions in game ({lineup.length}) &nbsp;·&nbsp; click to swap
          </span>
          {humanFaction && (
            <span className="text-[10px] text-teal-400/70">Teal border = YOU</span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ALL_FACTIONS.map((id) => {
            const picked  = lineup.includes(id);
            const isHuman = humanFaction === id;
            return (
              <div key={id} className={`group relative overflow-hidden rounded-xl border-2 transition-all ${
                picked
                  ? isHuman
                    ? 'border-teal-500 bg-teal-950/25 shadow shadow-teal-950/40'
                    : 'border-purple-600/70 bg-purple-950/15'
                  : 'border-neutral-800 bg-neutral-900/50 opacity-40 hover:opacity-70 hover:border-neutral-600 hover:bg-neutral-800/60'
              }`}>
                <button type="button" className="w-full p-3 pb-2 text-left" onClick={() => {
                  if (picked) {
                    if (lineup.length <= 2) return;
                    if (humanFaction === id) onHumanFactionChange(null);
                    onLineupChange(lineup.filter((x) => x !== id));
                  } else {
                    if (lineup.length >= 4) return;
                    onLineupChange([...lineup, id]);
                  }
                }}>
                  <FactionEmblem factionId={id} size={44} className="mb-2 rounded-lg" />
                  <div className="text-[11px] font-bold text-neutral-100 leading-tight">{factionLabel(id)}</div>
                </button>
                {/* YOU/AI badge — only show when picked */}
                {picked && (
                  <button type="button"
                    onClick={() => onHumanFactionChange(isHuman ? null : id)}
                    className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide transition ${
                      isHuman ? 'bg-teal-500 text-white' : 'bg-neutral-700/80 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-200'
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

      {/* ── Settings + Start ── */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">AI Difficulty</span>
          <select value={difficulty} onChange={(e) => onDifficultyChange(e.target.value as Difficulty)}
            className="rounded-xl border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm text-neutral-100 focus:border-purple-500 focus:outline-none">
            <option value="easy">🟢 Easy (30% noise)</option>
            <option value="medium">🟡 Medium (10% noise)</option>
            <option value="hard">🔴 Hard (3% noise)</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Seed</span>
          <input type="text" value={seed} onChange={(e) => onSeedChange(e.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-sm font-mono text-neutral-100 focus:border-purple-500 focus:outline-none" />
        </label>
        <button type="button" onClick={onStart}
          className="rounded-xl bg-purple-600 px-8 py-2.5 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-purple-950/50 hover:bg-purple-500 transition-all hover:scale-[1.02] active:scale-[0.98]">
          {hasActiveGame ? '⟳ Restart' : '▶ Start'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Header chips ─────────────────────────────────────────────────────────────

function ThreatBar({ track, threshold }: { track: number; threshold: number }) {
  const pct = Math.min(100, Math.round((track / threshold) * 100));
  const bar = pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-1.5" title={`Threat ${track}/${threshold}`}>
      <span className="text-[10px] text-neutral-500">☠</span>
      <div className="h-2 w-14 overflow-hidden rounded-full bg-neutral-800"><div className={`h-full rounded-full transition-all duration-300 ${bar}`} style={{ width: `${pct}%` }} /></div>
      <span className="text-[10px] tabular-nums text-neutral-400">{track}/{threshold}</span>
    </div>
  );
}

function PhaseChip({ phase }: { phase: string }) {
  const m: Record<string,string> = { roll:'bg-blue-900/50 text-blue-200', action:'bg-purple-900/50 text-purple-200', 'end-of-round':'bg-amber-900/50 text-amber-200', finished:'bg-emerald-900/50 text-emerald-200' };
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m[phase] ?? 'bg-neutral-800 text-neutral-400'}`}>{phase}</span>;
}

function ActivePlayerChip({ state, humanPlayerId, waitingForHuman }: { state: GameState; humanPlayerId: PlayerId | null; waitingForHuman: boolean }) {
  if (state.phase !== 'action') return null;
  const player = state.players[state.activePlayerId];
  if (!player) return null;
  const isHuman = state.activePlayerId === humanPlayerId;
  return (
    <span className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${isHuman && waitingForHuman ? 'animate-pulse bg-teal-700 text-white' : 'bg-neutral-800 text-neutral-300'}`}>
      <FactionEmblem factionId={player.factionId} size={14} />
      {isHuman && waitingForHuman ? '⚔ Your Turn!' : factionLabel(player.factionId)}
    </span>
  );
}

// ─── Merc slot ────────────────────────────────────────────────────────────────

function MercSlot({ label, die, claimedBy }: { label: string; die: { faceValue: number | null } | null; claimedBy?: string | undefined }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] ${claimedBy ? 'border-amber-700/60 bg-amber-950/30 text-amber-200' : die ? 'border-neutral-700 bg-neutral-900 text-neutral-300' : 'border-neutral-800 bg-neutral-950 text-neutral-600'}`}>
      <span className="font-medium">{label}</span>
      {die?.faceValue !== null && die?.faceValue !== undefined && <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-800 text-xs font-bold">{die.faceValue}</span>}
      {claimedBy ? <span className="text-amber-400/70">→ {claimedBy}</span> : !die && <span>—</span>}
    </div>
  );
}

// ─── Human action menu ────────────────────────────────────────────────────────

function HumanActionMenu({ moves, state, selectedDieId, onChoose }: {
  moves: Move[]; state: GameState; selectedDieId?: string | null; onChoose: (m: Move) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const player = state.players[state.activePlayerId];
  if (!player) return null;

  const visible = selectedDieId
    ? moves.filter((m) => (m.kind === 'place' && m.dieId === selectedDieId) || (m.kind === 'combine' && (m.dieIds[0] === selectedDieId || m.dieIds[1] === selectedDieId)) || (m.kind === 'battle' && m.attackerDieId === selectedDieId) || m.kind === 'pass')
    : moves;

  const vp = (m: Move) => (m.kind === 'place' || m.kind === 'combine') ? (state.regionDefs[m.regionId]?.vp ?? 0) + (state.regionDefs[m.regionId]?.isFortress ? 2 : 0) : 0;
  const placement = visible.filter((m) => m.kind === 'place' || m.kind === 'combine');
  const topMoves  = [...placement].sort((a, b) => vp(b) - vp(a)).slice(0, 5);
  const others: { label: string; color: string; moves: Move[] }[] = [
    { label: '⚔ Battle',    color: 'border-red-800 bg-red-950/30',       moves: visible.filter((m) => m.kind === 'battle') },
    { label: '⚡ Merc',     color: 'border-blue-800 bg-blue-950/20',     moves: visible.filter((m) => m.kind === 'hire-merc') },
    { label: '🃏 Cards',    color: 'border-teal-800 bg-teal-950/20',     moves: visible.filter((m) => m.kind === 'draft-card' || m.kind === 'play-card') },
    { label: '✦ Active',    color: 'border-violet-800 bg-violet-950/30', moves: visible.filter((m) => m.kind === 'use-active') },
    { label: '🏗 Build',    color: 'border-yellow-800 bg-yellow-950/20', moves: visible.filter((m) => m.kind === 'build-structure') },
    { label: '↑ Upgrade',   color: 'border-amber-800 bg-amber-950/20',   moves: visible.filter((m) => m.kind === 'upgrade-die' || m.kind === 'expand-barracks') },
  ].filter((g) => g.moves.length > 0);

  const allGroups: { label: string; color: string; moves: Move[] }[] = [
    { label: '🏰 Garrison', color: 'border-amber-800 bg-amber-950/20',   moves: visible.filter((m) => (m.kind === 'place' || m.kind === 'combine') && state.regionDefs[m.regionId]?.isFortress) },
    { label: '📍 Place',    color: 'border-purple-800 bg-purple-950/20', moves: visible.filter((m) => (m.kind === 'place' || m.kind === 'combine') && !state.regionDefs[m.regionId]?.isFortress) },
  ].filter((g) => g.moves.length > 0);

  return (
    <div className="space-y-2.5">
      {topMoves.length > 0 && (
        <div>
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-emerald-500/80">★ Best by VP</div>
          <div className="flex flex-wrap gap-1.5">
            {topMoves.map((m, i) => (
              <button key={i} type="button" onClick={() => onChoose(m)} className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/40 transition">
                <HumanMoveLabel move={m} state={state} player={player} />
              </button>
            ))}
            {placement.length > 5 && (
              <button type="button" onClick={() => setShowAll((p) => !p)} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-[10px] text-neutral-400 hover:bg-neutral-800 transition">
                {showAll ? '▲ less' : `+${placement.length - 5} more placements`}
              </button>
            )}
          </div>
        </div>
      )}
      {showAll && allGroups.map((g) => (
        <div key={g.label}>
          <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-neutral-600">{g.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.moves.map((m, i) => <button key={i} type="button" onClick={() => onChoose(m)} className={`rounded border px-2.5 py-1 text-xs transition hover:brightness-125 ${g.color}`}><HumanMoveLabel move={m} state={state} player={player} /></button>)}
          </div>
        </div>
      ))}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.flatMap((g) => g.moves.map((m, i) => <button key={`${g.label}-${i}`} type="button" onClick={() => onChoose(m)} className={`rounded border px-2.5 py-1 text-xs transition hover:brightness-125 ${g.color}`}><HumanMoveLabel move={m} state={state} player={player} /></button>))}
        </div>
      )}
      <button type="button" onClick={() => onChoose({ kind: 'pass' })} className="rounded-lg border border-neutral-700 bg-neutral-900/50 px-4 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition">⏸ Pass (end turn)</button>
    </div>
  );
}

function HumanMoveLabel({ move, state, player }: { move: Move; state: GameState; player: NonNullable<GameState['players'][string]> }) {
  switch (move.kind) {
    case 'place':    { const d = player.dice.find((x) => x.id === move.dieId); const r = state.regionDefs[move.regionId]; return <span>[{d?.range}:<strong>{d?.faceValue}</strong>] → <span className="text-neutral-200">{r?.name}</span> <span className="text-neutral-500">({r?.vp}VP)</span></span>; }
    case 'combine':  { const a = player.dice.find((x) => x.id === move.dieIds[0]); const b = player.dice.find((x) => x.id === move.dieIds[1]); const r = state.regionDefs[move.regionId]; return <span>{a?.faceValue}+{b?.faceValue}={(a?.faceValue??0)+(b?.faceValue??0)} → <span className="text-neutral-200">{r?.name}</span> <span className="text-neutral-500">({r?.vp}VP)</span></span>; }
    case 'battle':   { const r = state.regionDefs[move.targetRegionId]; return <span>Attack <span className="text-red-300">{r?.name}</span></span>; }
    case 'hire-merc': return <span>Hire <span className="text-blue-200">{move.mercSlot}</span></span>;
    case 'draft-card': return <span>Draft {move.cardId.replace('card-','')}</span>;
    case 'play-card':  return <span>Play {move.cardId.replace('card-','')}</span>;
    case 'use-active': return <span className="text-violet-300">✦ {FACTION_ABILITIES[player.factionId]?.activeLabel}</span>;
    case 'upgrade-die': { const d = player.dice.find((x) => x.id === move.dieId); return <span>↑ {d?.range}→{nextDieRange(d?.range??'1-3')}</span>; }
    case 'expand-barracks': return <span>+ Expand ({player.dice.length}/{player.barracksMax})</span>;
    case 'build-structure': { const r = state.regionDefs[move.regionId]; return <span>🏗 {move.structureId.replace(/-/g,' ')} on {r?.name}</span>; }
    case 'pass': return <span>Pass</span>;
  }
}

// ─── Compact player card ──────────────────────────────────────────────────────

function CompactPlayerCard({ player, isActive, isHuman, isLeader, waitingForHuman, selectedDieId, onSelectDie, pendingMoves, onChooseMove, configs }: {
  player: NonNullable<GameState['players'][string]>; isActive: boolean; isHuman: boolean; isLeader: boolean;
  waitingForHuman: boolean; selectedDieId: string | null; onSelectDie: (id: string) => void;
  pendingMoves: Move[]; onChooseMove: (m: Move) => void; configs: ReturnType<typeof loadConfigs>;
}) {
  const isHumanTurn = isHuman && waitingForHuman;
  const placed  = player.dice.filter((d) => d.location.kind === 'region').length;
  const garr    = player.dice.filter((d) => d.location.kind === 'garrison').length;
  const barracksDice = player.dice.filter((d) => d.location.kind === 'barracks' && d.faceValue !== null);

  return (
    <div className={`w-56 shrink-0 rounded-2xl p-3 text-xs transition-all ${
      isHumanTurn
        ? 'glow-teal border border-teal-500/60 bg-teal-950/20 backdrop-blur-sm'
        : isActive
          ? 'border border-purple-500/50 bg-purple-950/15 backdrop-blur-sm'
          : 'glass border-transparent'
    }`}
      style={isHumanTurn ? { boxShadow: '0 0 20px 4px rgba(20,184,166,0.15), inset 0 1px 0 rgba(255,255,255,0.05)' }
           : isActive    ? { boxShadow: '0 0 15px 2px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.04)' }
           : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 8px rgba(0,0,0,0.4)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="relative shrink-0">
          <FactionEmblem factionId={player.factionId} size={34} className="rounded-xl" />
          {isActive && !isHumanTurn && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-purple-400 ring-2 ring-neutral-950 animate-pulse" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="font-bold text-neutral-100 truncate text-[11px]">{factionLabel(player.factionId)}</span>
            {isHuman && <span className="shrink-0 rounded-md bg-teal-600 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide">YOU</span>}
          </div>
          <div className="text-[9px] text-neutral-600">
            {barracksDice.length}d ready · {placed}p · {garr}g
            {player.passedThisRound && <span className="ml-1 text-amber-500">passed</span>}
          </div>
        </div>
        {/* VP display */}
        <div className="shrink-0 text-right">
          {isLeader && <div className="text-sm leading-none mb-0.5">👑</div>}
          <div className="text-2xl font-black tabular-nums leading-none" style={{
            background: isLeader ? 'linear-gradient(135deg,#fbbf24,#f97316)' : 'linear-gradient(135deg,#e2e8f0,#94a3b8)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>{player.vp}</div>
          <div className="text-[8px] text-neutral-600 uppercase tracking-wider">VP</div>
        </div>
      </div>

      {/* ── Resources ── */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <div className="flex items-center gap-0.5 rounded-lg bg-slate-900/80 px-2 py-1 text-[10px] tabular-nums text-slate-300 border border-slate-700/40">
          <ResourceIcon resource="iron" size={10}/><span className="ml-0.5 font-semibold">{player.resources.iron}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-amber-950/60 px-2 py-1 text-[10px] tabular-nums text-amber-300 border border-amber-800/40">
          <ResourceIcon resource="gold" size={10}/><span className="ml-0.5 font-semibold">{player.resources.gold}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-violet-950/60 px-2 py-1 text-[10px] tabular-nums text-violet-300 border border-violet-800/40">
          <ResourceIcon resource="essence" size={10}/><span className="ml-0.5 font-semibold">{player.resources.essence}</span>
        </div>
      </div>

      {/* ── Dice tray ── */}
      {barracksDice.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-neutral-700">Barracks</div>
          <div className="flex flex-wrap gap-1.5">
            {barracksDice.map((d) => (
              <Die
                key={d.id}
                value={d.faceValue}
                range={d.range}
                size={30}
                isSelected={d.id === selectedDieId}
                onClick={isHumanTurn ? () => onSelectDie(d.id) : undefined}
              />
            ))}
          </div>
          {isHumanTurn && <p className="mt-1 text-[9px] text-teal-400/60">Click die to filter · click glowing region</p>}
        </div>
      )}

      {/* ── Card hand ── */}
      {player.hand.length > 0 && (
        <div className="mb-1.5">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-neutral-700">Hand ({player.hand.length})</div>
          <div className="flex flex-wrap gap-1">
            {player.hand.map((cardId) => {
              const cd = configs.cards.find((c) => c.id === cardId);
              const ok = isHumanTurn && pendingMoves.some((m) => m.kind === 'play-card' && m.cardId === cardId);
              return (
                <button key={cardId} type="button" disabled={!ok}
                  onClick={() => ok && onChooseMove({ kind: 'play-card', cardId })}
                  title={cd?.description}
                  className={`rounded-lg border px-2 py-0.5 text-[9px] font-medium transition ${
                    ok ? 'border-teal-600/60 bg-teal-950/40 text-teal-200 hover:bg-teal-900/50 cursor-pointer' : 'border-white/5 bg-white/[0.02] text-neutral-600'
                  }`}
                >
                  {cd?.name ?? cardId.replace('card-','')}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Economy actions ── */}
      {isHumanTurn && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {player.dice.filter((d) => d.location.kind === 'barracks' && nextDieRange(d.range)).map((d) => {
            const ok = pendingMoves.some((m) => m.kind === 'upgrade-die' && m.dieId === d.id);
            return ok ? (
              <button key={d.id} type="button" onClick={() => onChooseMove({ kind: 'upgrade-die', dieId: d.id })}
                className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-2 py-0.5 text-[9px] text-amber-300 hover:bg-amber-900/50 transition">
                ↑ {d.range}→{nextDieRange(d.range)}
              </button>
            ) : null;
          })}
          {pendingMoves.some((m) => m.kind === 'expand-barracks') && (
            <button type="button" onClick={() => onChooseMove({ kind: 'expand-barracks' })}
              className="rounded-lg border border-blue-700/50 bg-blue-950/30 px-2 py-0.5 text-[9px] text-blue-300 hover:bg-blue-900/50 transition">
              + Expand
            </button>
          )}
          {pendingMoves.some((m) => m.kind === 'use-active') && !player.activeUsedThisRound && (
            <button type="button" onClick={() => onChooseMove({ kind: 'use-active' })}
              title={FACTION_ABILITIES[player.factionId]?.activeDescription}
              className="rounded-lg border border-violet-600/50 bg-violet-950/40 px-2 py-0.5 text-[9px] font-bold text-violet-300 hover:bg-violet-900/50 transition">
              ✦ {FACTION_ABILITIES[player.factionId]?.activeLabel}
            </button>
          )}
        </div>
      )}
      {player.activeUsedThisRound && (
        <div className="mt-1 text-[9px] text-neutral-700 line-through opacity-50">Active used</div>
      )}
    </div>
  );
}

// ─── End game ─────────────────────────────────────────────────────────────────

function EndGamePanel({ state, onExport }: { state: GameState; onExport: () => void }) {
  const b = state.scoreBreakdown;
  if (!b) return null;
  const ordered = state.turnOrder.map((pid) => b.perPlayer[pid]!).sort((a, x) => x.total - a.total);
  return (
    <div className="rounded-xl border border-purple-700 bg-purple-950/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-purple-200">🏆 {factionLabel(state.players[b.winnerId]!.factionId)} wins · {b.perPlayer[b.winnerId]!.total} VP</h3>
        <button type="button" onClick={onExport} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800 transition">Export Replay</button>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-[9px] uppercase tracking-wide text-neutral-500">
          <tr><th className="pb-1">Player</th><th className="pb-1 text-right">Total</th><th className="pb-1 text-right">Goals</th><th className="pb-1 text-right">Regions</th><th className="pb-1 text-right">Fort</th><th className="pb-1 text-right">Secrets</th><th className="pb-1 text-right">Struct</th></tr>
        </thead>
        <tbody>
          {ordered.map((p) => {
            const pl = state.players[p.playerId]!;
            return (
              <tr key={p.playerId} className="border-t border-neutral-800">
                <td className="py-1.5"><span className="inline-flex items-center gap-1.5">{p.playerId === b.winnerId && '🏆'}<FactionEmblem factionId={pl.factionId} size={18}/>{factionLabel(pl.factionId)}</span></td>
                <td className="py-1.5 text-right font-bold tabular-nums text-white">{p.total}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-300">{p.parts.roundGoals}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-300">{p.parts.regionControl}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-300">{p.parts.fortressEndGame}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-300">{p.parts.secretGoals}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-300">{p.parts.structures}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── AI log inline ─────────────────────────────────────────────────────────────

function MoveSummaryInline({ move, state }: { move: Move; state: GameState }) {
  switch (move.kind) {
    case 'place':    return <>{state.regionDefs[move.regionId]?.name ?? move.regionId}</>;
    case 'combine':  return <>combine → {state.regionDefs[move.regionId]?.name ?? move.regionId}</>;
    case 'battle':   return <>attack {state.regionDefs[move.targetRegionId]?.name ?? move.targetRegionId}</>;
    case 'hire-merc': return <>hire {move.mercSlot} merc</>;
    case 'pass':     return <>pass</>;
    case 'draft-card': return <>draft {move.cardId.replace('card-','')}</>;
    case 'play-card':  return <>play {move.cardId.replace('card-','')}</>;
    case 'use-active': return <>active ability</>;
    case 'upgrade-die': return <>upgrade die</>;
    case 'expand-barracks': return <>expand barracks</>;
    case 'build-structure': return <>build {move.structureId}</>;
  }
}
