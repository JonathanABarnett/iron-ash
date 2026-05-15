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
import { Die } from '@ui/components/Die';
import { ResourceCount } from '@ui/components/ResourceGem';
import { VPMedallion } from '@ui/components/VPMedallion';

/** Thematic accent colour per faction — used for card tinting and end-game display. */
export const FACTION_COLORS: Record<FactionId, string> = {
  warriors:     '#ef4444',  // red
  assassins:    '#14b8a6',  // teal
  mages:        '#a855f7',  // violet
  necromancers: '#22c55e',  // green
  merchants:    '#f59e0b',  // amber
  rangers:      '#84cc16',  // lime
  paladins:     '#fbbf24',  // gold
  beastmasters: '#f97316',  // orange
};

const ALL_FACTIONS: FactionId[] = [
  'warriors','assassins','mages','necromancers',
  'merchants','rangers','paladins','beastmasters',
];


interface AILogEntry {
  turn: number; round: number; playerId: PlayerId; move: Move; reasoning: AIReasoning;
}

interface RoundSummary {
  completedRound: number;
  vpDeltas: Record<string, number>;              // playerId → VP gained this round
  goalId: string | null;                         // active round goal
  standings: Array<{ playerId: string; totalVP: number; factionId: FactionId }>;
}

interface ActiveGame {
  state: GameState; log: AILogEntry[]; rngSnapshot: string;
  humanPlayerId: PlayerId | null; waitingForHuman: boolean;
  pendingMoves: Move[]; selectedDieId: string | null;
  roundSummary: RoundSummary | null;
  /** VP totals per player after each round, for sparkline display. */
  vpHistory: Record<string, number[]>;
  /** Cleared each step; set when the most recent step resolved a battle. */
  lastBattle: { regionName: string; won: boolean; attackerPid: string } | null;
}

export function PlayPage() {
  const [lineup, setLineup]                         = useState<FactionId[]>(['warriors','mages','merchants']);
  const [humanFaction, setHumanFaction]             = useState<FactionId | null>('warriors');
  const [difficulty, setDifficulty]                 = useState<Difficulty>('medium'); // global default / fallback
  const [playerDifficulties, setPlayerDifficulties] = useState<Difficulty[]>(['medium','medium','medium']);
  const [seed, setSeed]                             = useState('play-1');

  // ── Animation state (ephemeral — never affects game logic) ─────────────────
  const [justRolled, setJustRolled]               = useState(false);
  const [vpGains, setVpGains]                     = useState<Record<string, number>>({});
  const [threatPulse, setThreatPulse]             = useState(false);
  const [resourcePulse, setResourcePulse]         = useState<Set<string>>(new Set());

  // Auto-clear animation flags
  useEffect(() => { if (!justRolled) return; const t = setTimeout(() => setJustRolled(false), 650); return () => clearTimeout(t); }, [justRolled]);
  useEffect(() => { if (!Object.keys(vpGains).length) return; const t = setTimeout(() => setVpGains({}), 1400); return () => clearTimeout(t); }, [vpGains]);
  useEffect(() => { if (!threatPulse) return; const t = setTimeout(() => setThreatPulse(false), 750); return () => clearTimeout(t); }, [threatPulse]);
  useEffect(() => { if (!resourcePulse.size) return; const t = setTimeout(() => setResourcePulse(new Set()), 500); return () => clearTimeout(t); }, [resourcePulse]);

  /** Keep playerDifficulties in sync with lineup length. */
  function handleLineupChange(next: FactionId[]) {
    setLineup(next);
    setPlayerDifficulties((prev) => {
      const updated = [...prev];
      while (updated.length < next.length) updated.push(difficulty);
      return updated.slice(0, next.length);
    });
  }
  const [active, setActive]             = useState<ActiveGame | null>(null);
  const [autoplay, setAutoplay]         = useState(false);
  const [autoSpeed, setAutoSpeed]       = useState(300); // ms between AI steps
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
      setActive({ state, log: [], rngSnapshot: state.rngState, humanPlayerId, waitingForHuman: false, pendingMoves: [], selectedDieId: null, roundSummary: null, vpHistory: {}, lastBattle: null });
      setAutoplay(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const structuresCtx = configs.structures.length ? { structures: configs.structures } : {};

  function step(prev: ActiveGame): ActiveGame {
    if (prev.waitingForHuman) return prev;
    const rng = Rng.fromSnapshot(JSON.parse(prev.rngSnapshot));
    let state = prev.state;
    let newLog = prev.log;
    let roundSummary: RoundSummary | null = null;
    let vpHistory = prev.vpHistory;
    let lastBattle: ActiveGame['lastBattle'] = null; // cleared every step unless a battle fired

    if (state.phase === 'finished') return prev;
    if (state.phase === 'roll') {
      state = rollPhase(state, { rng, cards: configs.cards });
    } else if (isRoundOver(state)) {
      // Snapshot VP before end-of-round scoring so we can show per-round gains.
      const prevVPs: Record<string, number> = {};
      for (const [pid, p] of Object.entries(state.players)) prevVPs[pid] = p.vp;
      const completedRound = state.round;
      const goalSlot = state.roundGoals.find((g) => g.forRound === completedRound);

      state = endOfRound(state, { rules: configs.rules, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals, cardKeepCost: configs.costs.cardKeep, ...structuresCtx });

      const vpDeltas: Record<string, number> = {};
      for (const [pid, p] of Object.entries(state.players)) {
        vpDeltas[pid] = p.vp - (prevVPs[pid] ?? 0);
      }
      const standings = Object.values(state.players)
        .map((p) => ({ playerId: p.id, totalVP: p.vp, factionId: p.factionId }))
        .sort((a, b) => b.totalVP - a.totalVP);
      roundSummary = { completedRound, vpDeltas, goalId: goalSlot?.goalId ?? null, standings };

      // Update VP history with post-round totals for sparklines.
      const nextHistory = { ...vpHistory };
      for (const [pid, p] of Object.entries(state.players)) {
        nextHistory[pid] = [...(nextHistory[pid] ?? []), p.vp];
      }
      vpHistory = nextHistory;
    } else {
      if (prev.humanPlayerId && state.activePlayerId === prev.humanPlayerId) {
        const pending = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
        return { ...prev, rngSnapshot: JSON.stringify(rng.snapshot()), waitingForHuman: true, pendingMoves: pending, selectedDieId: null };
      }
      const playerIdAtMove = state.activePlayerId, turnAtMove = state.turn, roundAtMove = state.round;
      // Per-player difficulty: p1→index 0, p2→index 1, etc.
      const playerIdx = parseInt(state.activePlayerId.replace('p', ''), 10) - 1;
      const activeDiff: Difficulty = playerDifficulties[playerIdx] ?? difficulty;
      const { move, reasoning } = pickMove(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals, rng, difficulty: activeDiff });
      state  = apply(state, move, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
      newLog = [...prev.log.slice(-49), { turn: turnAtMove, round: roundAtMove, playerId: playerIdAtMove, move, reasoning }];

      // Detect battle outcome for flash animation.
      if (move.kind === 'battle') {
        const dieAfter = state.players[playerIdAtMove]?.dice.find((d) => d.id === move.attackerDieId);
        const won = dieAfter?.location.kind === 'region';
        const regionName = state.regionDefs[move.targetRegionId]?.name ?? move.targetRegionId;
        lastBattle = { regionName, won, attackerPid: playerIdAtMove };
      }
    }
    return { ...prev, state, log: newLog, rngSnapshot: JSON.stringify(rng.snapshot()), waitingForHuman: false, pendingMoves: [], roundSummary, vpHistory, lastBattle };
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
    if (active.roundSummary) {
      // Auto-dismiss round summary after a brief pause, then continue autoplay.
      const delay = Math.min(Math.max(autoSpeed * 4, 1800), 3500);
      const id = window.setTimeout(() => {
        if (autoplayRef.current) setActive((p) => p ? { ...p, roundSummary: null } : p);
      }, delay);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      if (!autoplayRef.current) return;
      setActive((prev) => {
        if (!prev) return prev;
        const next = step(prev);

        // ── Detect animation triggers ──────────────────────────────────────
        const ps = prev.state, ns = next.state;

        // 1. Roll animation: roll phase just completed → brief tumble on all dice
        if (ps.phase === 'roll' && ns.phase === 'action') {
          setJustRolled(true);
          // Detect resource gains from passives (fired during rollPhase)
          const pulsed = new Set<string>();
          for (const [pid, pp] of Object.entries(ps.players)) {
            const np = ns.players[pid];
            if (!np) continue;
            if (np.resources.iron > pp.resources.iron || np.resources.gold > pp.resources.gold || np.resources.essence > pp.resources.essence) pulsed.add(pid);
          }
          if (pulsed.size) setResourcePulse(pulsed);
        }

        // 2. Threat track increase → flash the bar
        if (ns.threatTrack > ps.threatTrack) setThreatPulse(true);

        // 3. VP gain → float indicators
        const gains: Record<string, number> = {};
        for (const [pid, np] of Object.entries(ns.players)) {
          const prevVP = ps.players[pid]?.vp ?? 0;
          if (np.vp > prevVP) gains[pid] = np.vp - prevVP;
        }
        if (Object.keys(gains).length) setVpGains(gains);

        return next;
      });
    }, autoSpeed);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, autoplay]);

  const rules = configs.rules;

  return (
    <main className="relative min-h-screen animate-fade-in page-bg-dots" style={{ background: 'var(--color-bg)' }}>
      {!active && (
        <SetupPanel
          lineup={lineup} humanFaction={humanFaction} difficulty={difficulty} seed={seed} error={error}
          onLineupChange={handleLineupChange} onHumanFactionChange={setHumanFaction} onDifficultyChange={setDifficulty}
          playerDifficulties={playerDifficulties} onPlayerDifficultiesChange={setPlayerDifficulties}
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
            <ThreatBar track={active.state.threatTrack} threshold={rules.threatTrackThreshold} pulse={threatPulse} />
            <PhaseChip phase={active.state.phase} />
            <ActivePlayerChip state={active.state} humanPlayerId={active.humanPlayerId} waitingForHuman={active.waitingForHuman} />
            {active.state.freeForAll && <span className="rounded-md bg-amber-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Free-for-all</span>}
            {(() => { const s = active.state.roundGoals.find((g) => g.forRound === active.state.round); return s ? <span className="text-[10px] text-neutral-500">Goal: <span className="text-neutral-300">{s.goalId}</span></span> : null; })()}
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={stepOnce} disabled={active.state.phase === 'finished'} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-medium hover:bg-neutral-800 disabled:opacity-40 transition">Step ›</button>
              <button type="button" onClick={() => setAutoplay((p) => !p)} disabled={active.state.phase === 'finished'} className={`rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-40 transition ${autoplay ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-purple-600 text-white hover:bg-purple-500'}`}>{autoplay ? '⏸ Pause' : '▶ Auto'}</button>
              {/* Speed control — only visible during autoplay */}
              {autoplay && (
                <div className="flex items-center gap-1.5" title={`Step speed: ${autoSpeed}ms`}>
                  <span className="text-[9px] text-neutral-500">🐢</span>
                  <input type="range" min={80} max={2000} step={50} value={autoSpeed}
                    onChange={(e) => setAutoSpeed(Number(e.target.value))}
                    className="w-16 h-1 cursor-pointer accent-purple-500"
                  />
                  <span className="text-[9px] text-neutral-500">🐇</span>
                </div>
              )}
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

          {/* ── Battle flash ── */}
          {active.lastBattle && (
            <div key={`${active.lastBattle.regionName}-${active.state.round}-${active.state.turn}`}
              className={`animate-fade-in mx-4 mt-2 flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold ${active.lastBattle.won ? 'battle-win-anim' : 'battle-loss-anim'}`}
              style={{
                background: active.lastBattle.won
                  ? 'rgba(239,68,68,0.12)'
                  : 'rgba(107,114,128,0.10)',
                border: `1px solid ${active.lastBattle.won ? 'rgba(239,68,68,0.3)' : 'rgba(107,114,128,0.2)'}`,
              }}>
              <span>{active.lastBattle.won ? '⚔' : '🛡'}</span>
              <span style={{ color: active.lastBattle.won ? '#fca5a5' : '#9ca3af' }}>
                {active.lastBattle.won
                  ? `${active.state.players[active.lastBattle.attackerPid] ? factionLabel(active.state.players[active.lastBattle.attackerPid]!.factionId) : active.lastBattle.attackerPid} won the battle at ${active.lastBattle.regionName} — seized +1 VP +1 iron`
                  : `${active.state.players[active.lastBattle.attackerPid] ? factionLabel(active.state.players[active.lastBattle.attackerPid]!.factionId) : active.lastBattle.attackerPid} attack on ${active.lastBattle.regionName} repelled`}
              </span>
            </div>
          )}

          {/* ── Merc bar ── */}
          <div className="flex items-center gap-3 border-b border-neutral-800/60 bg-neutral-900/30 px-4 py-1.5 mt-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Mercs</span>
            {(['low','high','specialist'] as const).map((slot) => {
              const claimedBy = active.state.mercs.claimed[slot];
              const claimerFactionId = claimedBy ? active.state.players[claimedBy]?.factionId : undefined;
              const die = active.state.mercs[slot];
              const label = slot === 'specialist' ? `Spec·${active.state.mercs.specialistValue}` : slot === 'low' ? 'Low' : 'High';
              return <MercSlot key={slot} label={label} die={die} claimedBy={claimedBy} claimerFactionId={claimerFactionId} />;
            })}
          </div>

          {/* ── Map ── */}
          <div className="px-4 pt-2">
            <MapView state={active.state} humanMoves={active.waitingForHuman ? active.pendingMoves : []} selectedDieId={active.selectedDieId} onRegionClick={(_id, moves) => { if (moves.length === 1) applyHumanMove(moves[0]!); }} />
          </div>

          {/* ── Round summary overlay ── */}
          {active.roundSummary && (
            <RoundSummaryOverlay
              summary={active.roundSummary}
              autoplay={autoplay}
              totalRounds={rules.totalRounds}
              onDismiss={() => setActive((p) => p ? { ...p, roundSummary: null } : p)}
            />
          )}

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
                  vpHistory={active.vpHistory[pid]}
                  vpGain={vpGains[pid] ?? 0}
                  isRolling={justRolled}
                  resourcePulsed={resourcePulse.has(pid)}
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

// ─── Round Summary Overlay ────────────────────────────────────────────────────

function RoundSummaryOverlay({
  summary, autoplay, onDismiss, totalRounds,
}: { summary: RoundSummary; autoplay: boolean; onDismiss: () => void; totalRounds: number }) {
  const isLastRound = summary.completedRound >= totalRounds;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(155deg, rgba(18,12,30,0.98) 0%, rgba(22,14,36,0.98) 100%)',
          border: '1px solid rgba(124,58,237,0.35)',
          boxShadow: '0 0 80px rgba(124,58,237,0.18), 0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        {/* Accent bar */}
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #7c3aed, #06b6d4, #7c3aed)', backgroundSize: '200%' }} />

        <div className="p-6">
          {/* Header */}
          <div className="mb-5 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-purple-400 mb-1">Round Complete</div>
            <div className="text-4xl font-black text-white tabular-nums">{summary.completedRound}</div>
            {summary.goalId && (
              <div className="mt-1.5 inline-block rounded-full px-3 py-0.5 text-[11px] font-semibold"
                style={{ background: 'rgba(124,58,237,0.18)', color: '#c4b5fd' }}>
                🎯 {summary.goalId.replace(/-/g, ' ')}
              </div>
            )}
          </div>

          {/* Standings */}
          <div className="space-y-2 mb-5">
            {summary.standings.map(({ playerId, totalVP, factionId }, idx) => {
              const delta = summary.vpDeltas[playerId] ?? 0;
              const isLeader = idx === 0 && totalVP > 0;
              return (
                <div
                  key={playerId}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all"
                  style={{
                    background: isLeader
                      ? 'rgba(124,58,237,0.14)'
                      : 'rgba(255,255,255,0.03)',
                    border: isLeader ? '1px solid rgba(124,58,237,0.25)' : '1px solid transparent',
                  }}
                >
                  {/* Rank */}
                  <div className="w-5 text-center text-[10px] font-black"
                    style={{ color: idx === 0 ? '#a78bfa' : idx === 1 ? '#94a3b8' : '#6b7280' }}>
                    {idx === 0 ? '👑' : idx + 1}
                  </div>
                  <FactionEmblem factionId={factionId} size={22} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-neutral-200 truncate">{factionLabel(factionId)}</div>
                    <div className="text-[9px] text-neutral-600">{playerId}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-black text-white tabular-nums">{totalVP} <span className="text-[10px] font-normal text-neutral-500">VP</span></div>
                    {delta > 0
                      ? <div className="text-[10px] font-bold text-emerald-400 tabular-nums">+{delta} this round</div>
                      : <div className="text-[10px] text-neutral-700">+0</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action */}
          {autoplay ? (
            <div className="text-center text-[10px] text-neutral-600 tracking-wide">Resuming automatically…</div>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              className="w-full rounded-2xl py-2.5 text-sm font-bold tracking-wide transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: 'rgba(124,58,237,0.85)', color: 'white' }}
            >
              {isLastRound ? 'View Results →' : `Continue to Round ${summary.completedRound + 1} →`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function SetupPanel({ lineup, humanFaction, difficulty, seed, error,
  playerDifficulties, onPlayerDifficultiesChange,
  onLineupChange, onHumanFactionChange, onDifficultyChange, onSeedChange, onStart, hasActiveGame,
}: {
  lineup: FactionId[]; humanFaction: FactionId | null; difficulty: Difficulty; seed: string; error: string | null;
  playerDifficulties: Difficulty[];
  onPlayerDifficultiesChange: (d: Difficulty[]) => void;
  onLineupChange: (n: FactionId[]) => void; onHumanFactionChange: (f: FactionId | null) => void;
  onDifficultyChange: (d: Difficulty) => void; onSeedChange: (s: string) => void;
  onStart: () => void; hasActiveGame: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      {/* Header — no redundant title, sidebar already shows it */}
      <div className="mb-8">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>New game</div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Configure your match</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>Pick a player count, choose factions, and start playing.</p>
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
                  const keepHuman = humanFaction && defaults.includes(humanFaction) ? humanFaction : defaults[0]!;
                  onHumanFactionChange(keepHuman);
                }}
                className="rounded-2xl py-4 text-center transition-all hover:scale-[1.02]"
                style={{
                  border: `2px solid ${active ? 'rgba(124,58,237,0.7)' : 'var(--color-border)'}`,
                  background: active ? 'rgba(124,58,237,0.1)' : 'var(--color-surface-1)',
                  boxShadow: active ? '0 0 16px rgba(124,58,237,0.2)' : 'none',
                }}
              >
                <div className="text-3xl font-black" style={{ color: active ? 'white' : 'var(--color-muted)' }}>{n}</div>
                <div className="text-xs mt-0.5 font-medium" style={{ color: active ? '#a78bfa' : 'var(--color-subtle)' }}>
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

      {/* ── Per-player difficulty ── */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">AI Difficulty per player</span>
          {/* Set-all shortcuts */}
          <div className="flex gap-1">
            {(['easy','medium','hard'] as Difficulty[]).map((d) => (
              <button key={d} type="button"
                onClick={() => { onDifficultyChange(d); onPlayerDifficultiesChange(lineup.map(() => d)); }}
                className="rounded-lg px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition hover:brightness-125"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: d === 'easy' ? '#4ade80' : d === 'medium' ? '#facc15' : '#f87171' }}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          {lineup.map((factionId, idx) => {
            const isHuman = humanFaction === factionId;
            const current = playerDifficulties[idx] ?? 'medium';
            return (
              <div key={factionId} className="flex items-center gap-3 px-4 py-2.5"
                style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: idx < lineup.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <FactionEmblem factionId={factionId} size={24} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-neutral-200">{factionLabel(factionId)}</span>
                </div>
                {isHuman ? (
                  <span className="rounded-md bg-teal-800/60 px-2 py-0.5 text-[10px] font-bold text-teal-300">You</span>
                ) : (
                  <div className="flex gap-1">
                    {(['easy','medium','hard'] as Difficulty[]).map((d) => {
                      const active = current === d;
                      const col = d === 'easy' ? '#4ade80' : d === 'medium' ? '#facc15' : '#f87171';
                      return (
                        <button key={d} type="button"
                          onClick={() => {
                            const next = [...playerDifficulties];
                            next[idx] = d;
                            onPlayerDifficultiesChange(next);
                          }}
                          className="rounded-lg px-2 py-0.5 text-[10px] font-bold capitalize transition-all"
                          style={{
                            background: active ? `${col}22` : 'transparent',
                            border: `1px solid ${active ? col : 'rgba(255,255,255,0.08)'}`,
                            color: active ? col : 'var(--color-muted)',
                          }}>
                          {d === 'easy' ? '🟢' : d === 'medium' ? '🟡' : '🔴'} {d}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Seed + Start ── */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>Seed</span>
          <input type="text" value={seed} onChange={(e) => onSeedChange(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }} />
        </label>
        <button type="button" onClick={onStart}
          className="rounded-xl px-8 py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
          {hasActiveGame ? '⟳ Restart' : '▶ Start'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Header chips ─────────────────────────────────────────────────────────────

function ThreatBar({ track, threshold, pulse = false }: { track: number; threshold: number; pulse?: boolean }) {
  const pct = Math.min(100, Math.round((track / threshold) * 100));
  const bar = pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-1 ${pulse ? 'threat-pulse' : ''}`} title={`Threat ${track}/${threshold}`}>
      <span className="text-[10px] text-neutral-500">☠</span>
      <div className="h-2 w-14 overflow-hidden rounded-full bg-neutral-800">
        <div className={`h-full rounded-full transition-all duration-300 ${bar}`} style={{ width: `${pct}%` }} />
      </div>
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

function MercSlot({
  label, die, claimedBy, claimerFactionId,
}: {
  label: string;
  die: { faceValue: number | null } | null;
  claimedBy?: string | undefined;
  claimerFactionId?: FactionId | undefined;
}) {
  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] ${claimedBy ? 'border-amber-700/60 bg-amber-950/30 text-amber-200' : die ? 'border-neutral-700 bg-neutral-900 text-neutral-300' : 'border-neutral-800 bg-neutral-950 text-neutral-600'}`}>
      <span className="font-medium">{label}</span>
      {die?.faceValue !== null && die?.faceValue !== undefined && (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-800 text-xs font-bold">{die.faceValue}</span>
      )}
      {claimedBy ? (
        <span className="flex items-center gap-1 text-amber-400/80">
          →{' '}
          {claimerFactionId && <FactionEmblem factionId={claimerFactionId} size={12} className="rounded-sm" />}
          <span>{claimerFactionId ? factionLabel(claimerFactionId) : claimedBy}</span>
        </span>
      ) : !die ? (
        <span>—</span>
      ) : null}
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

function VPSparkline({ history, width = 88, height = 18 }: { history: number[]; width?: number; height?: number }) {
  if (history.length < 2) return null;
  const max = Math.max(...history, 1);
  const pts = history
    .map((v, i) => `${((i / (history.length - 1)) * width).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      {history.map((v, i) => (
        <circle key={i} cx={((i / (history.length - 1)) * width).toFixed(1)} cy={(height - (v / max) * (height - 2) - 1).toFixed(1)} r={i === history.length - 1 ? 2.5 : 1.5} fill={i === history.length - 1 ? '#a78bfa' : '#7c3aed'} opacity="0.85" />
      ))}
    </svg>
  );
}

function CompactPlayerCard({ player, isActive, isHuman, isLeader, waitingForHuman, selectedDieId, onSelectDie, pendingMoves, onChooseMove, configs, vpHistory, vpGain = 0, isRolling = false, resourcePulsed = false }: {
  player: NonNullable<GameState['players'][string]>; isActive: boolean; isHuman: boolean; isLeader: boolean;
  waitingForHuman: boolean; selectedDieId: string | null; onSelectDie: (id: string) => void;
  pendingMoves: Move[]; onChooseMove: (m: Move) => void; configs: ReturnType<typeof loadConfigs>;
  vpHistory?: number[];
  /** VP gained in the most recent step — drives float animation */
  vpGain?: number;
  /** Barracks dice should show roll tumble animation */
  isRolling?: boolean;
  /** Resources gained from passive this round — pulse gems */
  resourcePulsed?: boolean;
}) {
  const isHumanTurn = isHuman && waitingForHuman;
  const fc = FACTION_COLORS[player.factionId] ?? '#7c3aed'; // faction accent colour
  const placed  = player.dice.filter((d) => d.location.kind === 'region').length;
  const garr    = player.dice.filter((d) => d.location.kind === 'garrison').length;
  const barracksDice = player.dice.filter((d) => d.location.kind === 'barracks' && d.faceValue !== null);

  return (
    <div className="relative w-56 shrink-0 rounded-2xl p-3 text-xs transition-all backdrop-blur-sm overflow-hidden"
      style={{
        border: `1px solid ${isHumanTurn ? 'rgba(20,184,166,0.5)' : `${fc}${isActive ? '55' : '1a'}`}`,
        background: isHumanTurn
          ? 'rgba(20,184,166,0.06)'
          : `linear-gradient(145deg, ${fc}08 0%, rgba(9,9,11,0.7) 100%)`,
        boxShadow: isHumanTurn
          ? `0 0 24px 4px rgba(20,184,166,0.12), inset 0 1px 0 rgba(255,255,255,0.06)`
          : isActive
            ? `0 0 18px 3px ${fc}18, inset 0 1px 0 rgba(255,255,255,0.05)`
            : `inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.45)`,
      }}
    >
      {/* Faction colour top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, ${fc}80, ${fc}20, transparent)` }} />
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-2.5">
        {/* Faction emblem with ability tooltip */}
        <div className="relative shrink-0 group">
          <FactionEmblem factionId={player.factionId} size={34} className="rounded-xl" />
          {isActive && !isHumanTurn && (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-purple-400 ring-2 ring-neutral-950 animate-pulse" />
          )}
          {/* Ability tooltip — appears on hover */}
          <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-56 rounded-2xl p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            style={{ background: 'rgba(12,8,22,0.97)', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
            <div className="mb-1 text-[10px] font-black text-purple-300 uppercase tracking-wide">
              {FACTION_ABILITIES[player.factionId]?.activeLabel}
            </div>
            <div className="text-[10px] leading-relaxed text-neutral-400">
              {FACTION_ABILITIES[player.factionId]?.activeDescription}
            </div>
          </div>
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
        {/* VP medallion with float animation */}
        <div className="relative shrink-0">
          <VPMedallion vp={player.vp} isLeader={isLeader} size="md" />
          {vpGain > 0 && (
            <div key={player.vp} // key change re-triggers animation
              className="vp-float absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-black text-emerald-400 whitespace-nowrap"
              style={{ textShadow: '0 0 8px rgba(52,211,153,0.6)' }}>
              +{vpGain} VP
            </div>
          )}
        </div>
      </div>

      {/* ── Resources + VP sparkline ── */}
      <div className="flex items-center justify-between gap-1.5 mb-2.5">
        <div className="flex items-center gap-1.5">
          <ResourceCount resource="iron"    value={player.resources.iron}    size={13} pulsed={resourcePulsed} />
          <ResourceCount resource="gold"    value={player.resources.gold}    size={13} pulsed={resourcePulsed} />
          <ResourceCount resource="essence" value={player.resources.essence} size={13} pulsed={resourcePulsed} />
        </div>
        {vpHistory && vpHistory.length >= 2 && (
          <div title={`VP trend: ${vpHistory.join(', ')}`}>
            <VPSparkline history={vpHistory} />
          </div>
        )}
      </div>

      {/* ── Dice tray ── */}
      {barracksDice.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-neutral-700">Barracks</div>
          <div className="flex flex-wrap gap-1.5">
            {barracksDice.map((d, idx) => (
              <Die
                key={d.id}
                value={d.faceValue}
                range={d.range}
                size={30}
                isSelected={d.id === selectedDieId}
                isRolling={isRolling}
                rollDelay={idx * 55}
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

const SCORE_CATEGORIES: Array<{
  key: keyof NonNullable<GameState['scoreBreakdown']>['perPlayer'][string]['parts'];
  icon: string; label: string; color: string;
}> = [
  { key: 'roundGoals',           icon: '🎯', label: 'Goals',      color: '#a78bfa' },
  { key: 'fortressesPerRound',   icon: '⏱',  label: 'Fortress VP', color: '#f59e0b' },
  { key: 'regionControl',        icon: '🗺',  label: 'Regions',    color: '#34d399' },
  { key: 'fortressEndGame',      icon: '🏰', label: 'Fort bonus', color: '#fbbf24' },
  { key: 'secretGoals',          icon: '🔮', label: 'Secrets',    color: '#c084fc' },
  { key: 'fullBarracksBonus',    icon: '🎲', label: 'Barracks',   color: '#94a3b8' },
  { key: 'structures',           icon: '🏗',  label: 'Structures', color: '#67e8f9' },
];

function EndGamePanel({ state, onExport }: { state: GameState; onExport: () => void }) {
  const b = state.scoreBreakdown;
  if (!b) return null;

  const ordered = state.turnOrder
    .map((pid) => ({ pid, player: state.players[pid]!, score: b.perPlayer[pid]! }))
    .sort((a, x) => x.score.total - a.score.total);

  const maxTotal = ordered[0]?.score.total ?? 1;
  const winner   = ordered[0]!;
  const winnerFc = FACTION_COLORS[winner.player.factionId] ?? '#7c3aed';

  const medals = ['🥇', '🥈', '🥉', ''];

  return (
    <div className="rounded-3xl overflow-hidden animate-fade-in"
      style={{
        background: 'rgba(10,6,20,0.98)',
        border: `1px solid ${winnerFc}30`,
        boxShadow: `0 0 80px ${winnerFc}18, 0 24px 64px rgba(0,0,0,0.7)`,
      }}>

      {/* Winner hero */}
      <div className="relative px-6 py-8 text-center overflow-hidden">
        {/* Radial glow behind winner emblem */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(ellipse 60% 50% at 50% 40%, ${winnerFc}14 0%, transparent 70%)` }} />
        {/* Shimmer line */}
        <div className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: `linear-gradient(90deg, transparent, ${winnerFc}80, transparent)` }} />

        <div className="relative">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: `${winnerFc}99` }}>
            Victory
          </div>
          <div className="mb-4 flex justify-center">
            <div className="relative">
              <FactionEmblem factionId={winner.player.factionId} size={72} className="rounded-2xl" />
              <div className="absolute -bottom-1 -right-1 text-xl">👑</div>
            </div>
          </div>
          <div className="text-2xl font-black text-white mb-0.5">
            {factionLabel(winner.player.factionId)}
          </div>
          <div className="text-4xl font-black tabular-nums" style={{ color: winnerFc }}>
            {winner.score.total} <span className="text-xl font-bold opacity-60">VP</span>
          </div>
        </div>
      </div>

      {/* Player score cards */}
      <div className="px-4 pb-4 space-y-3">
        {ordered.map(({ pid, player, score }, rank) => {
          const fc    = FACTION_COLORS[player.factionId] ?? '#7c3aed';
          const isWin = rank === 0;
          const pct   = Math.round((score.total / maxTotal) * 100);

          return (
            <div key={pid} className="rounded-2xl overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${fc}0a, rgba(255,255,255,0.02))`,
                border: `1px solid ${fc}${isWin ? '35' : '18'}`,
              }}>
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg">{medals[rank] ?? ''}</span>
                <FactionEmblem factionId={player.factionId} size={32} className="rounded-xl shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-neutral-100">{factionLabel(player.factionId)}</div>
                  {/* Total VP bar */}
                  <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-800/60">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${fc}, ${fc}80)` }} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-black tabular-nums text-white">{score.total}</div>
                  <div className="text-[9px] text-neutral-600 uppercase tracking-wide">VP</div>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="grid grid-cols-4 gap-px border-t border-white/[0.04]">
                {SCORE_CATEGORIES.filter((c) => (score.parts[c.key] ?? 0) > 0).map((cat) => (
                  <div key={cat.key} className="px-3 py-2 bg-black/20 text-center">
                    <div className="text-sm">{cat.icon}</div>
                    <div className="text-[10px] font-black tabular-nums" style={{ color: cat.color }}>
                      {score.parts[cat.key]}
                    </div>
                    <div className="text-[8px] text-neutral-600 leading-none mt-0.5 truncate">{cat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 pb-4 pt-1">
        <div className="text-[10px] text-neutral-600">
          {state.round} rounds · {state.turnOrder.length} players
        </div>
        <button type="button" onClick={onExport}
          className="rounded-xl border border-neutral-700 px-4 py-1.5 text-xs font-semibold text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200">
          📥 Export Replay
        </button>
      </div>
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
