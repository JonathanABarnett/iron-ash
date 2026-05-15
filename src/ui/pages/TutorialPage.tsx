// TutorialPage — guided walkthrough of Iron & Ash mechanics.
//
// Runs a fixed live game (Warriors vs Mages, seed="tutorial-main") in slow autoplay.
// A panel at the bottom shows 17 steps; each step optionally highlights a specific
// section of the UI with a pulsing ring. The game advances automatically; some steps
// auto-advance when the game reaches a particular phase or round.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Rng } from '@engine/rng';
import { createGame } from '@engine/setup';
import { apply, enumerate } from '@engine/moves';
import { endOfRound, isRoundOver, rollPhase } from '@engine/rounds';
import { pickMove } from '@ai/decide';
import type { GameState, Move } from '@engine/types';
import { FACTION_ABILITIES } from '@engine/factions/abilities';
import { loadConfigs } from '@ui/configLoader';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';
import { MapView } from '@ui/components/MapView';
import { Die } from '@ui/components/Die';
import { ResourceCount } from '@ui/components/ResourceGem';
import { VPMedallion } from '@ui/components/VPMedallion';

// ─── Tutorial step definitions ────────────────────────────────────────────────

interface TutorialStep {
  title: string;
  body: string;
  /** Element data-tid value to highlight, or null for no highlight. */
  highlight: string | null;
  /** Auto-advance when the game phase matches, e.g. 'roll' or 'action'. */
  autoAdvancePhase?: string;
  /** Auto-advance when round >= this value. */
  autoAdvanceRound?: number;
}

const STEPS: TutorialStep[] = [
  {
    title: 'Welcome to Iron & Ash',
    body: 'This tutorial walks you through a live game — Warriors vs Mages. Watch the AIs play while each concept is explained. Click Next → to move through the steps at your own pace.',
    highlight: null,
  },
  {
    title: 'Your Factions',
    body: 'Warriors (left) specialise in iron, battles, and fortress control. Mages (right) focus on essence and precise die manipulation. Each faction has a unique passive income and a once-per-round active ability.',
    highlight: 'player-strip',
  },
  {
    title: 'Hover for Abilities',
    body: 'Hover the faction emblem on any player card to see their active ability. Warriors: "Iron Discipline" (+2 iron). Mages: "Arcane Precision" (set a die to any value in its range).',
    highlight: 'player-strip',
  },
  {
    title: 'The Roll Phase',
    body: 'Every round starts with a Roll Phase — all barracks dice are re-rolled to fresh face values. Dice in garrisons keep their locked values. Watch the dice numbers change.',
    highlight: 'player-strip',
    autoAdvancePhase: 'roll',
  },
  {
    title: 'Die Ranges',
    body: 'Die colour signals its range: Gray = 1–3 (weak), Blue = 2–5 (mid), Gold = 3–6 (strong), Purple = 1–6 (specialist or wild, any value). Upgrade dice by spending iron + gold.',
    highlight: 'player-strip',
  },
  {
    title: 'The Map',
    body: 'The map shows 16 regions across six terrain types. Each region displays its VP value and placement requirement — a die must meet that requirement to be placed there.',
    highlight: 'map',
  },
  {
    title: 'Placing Dice',
    body: 'The active player sends a barracks die to a region. The die\'s face value must satisfy the region\'s requirement (min, max, exact, or sum). Placed dice score 1 VP for the region.',
    highlight: 'map',
    autoAdvancePhase: 'action',
  },
  {
    title: 'Resources',
    body: 'Three resources drive your economy. Iron ⚙ funds die upgrades and structures. Gold 🪙 buys cards and mercenaries. Essence 💎 powers Arcane Spires and certain cards. Resources are capped at 8.',
    highlight: 'player-strip',
  },
  {
    title: 'Combining Dice',
    body: 'Two barracks dice can be combined into one placement using their summed value. Vital for high-requirement regions (e.g. minSum: 9). Both dice are spent — it\'s powerful but expensive.',
    highlight: 'map',
  },
  {
    title: 'Fortresses',
    body: 'Fortress regions (castle icon) are the most valuable territory. Place a die meeting the garrison requirement to hold it — you earn VP every round you control it. Expect heavy contesting!',
    highlight: 'map',
  },
  {
    title: 'The Threat Track',
    body: 'The Threat Track (top left bar) ticks up +1 each round, +1 per battle, +1 per fortress usurp. When it hits the threshold the game enters a climactic Round-7 Free-For-All with all mercs free.',
    highlight: 'threat',
  },
  {
    title: 'Round Goal',
    body: 'Each round has a shared competitive goal shown in the header — e.g. "Most Fortresses" or "Most Regions". The leader at round end earns bonus VP. Goals drive tactical pivots each round.',
    highlight: 'goal',
  },
  {
    title: 'Mercenaries',
    body: 'The Merc Pool offers three hire-able dice each round: Low (1–3), High (3–6), and the Specialist — a 1–6 die whose face value counts down 6→5→4→3→2→1 each round. Specialists cost 2 gold in rounds 1–2.',
    highlight: 'merc-bar',
  },
  {
    title: 'Battles',
    body: 'On your action turn you can attack an enemy-occupied region. Win condition: your die value > (sum of all enemy dice on that region) + 1. Victory evicts the defender, earns +1 VP, and gives you +1 iron as war spoils.',
    highlight: 'map',
  },
  {
    title: 'End of Round',
    body: 'After all players pass, the round ends. Garrison VP is awarded for every fortress held, round goal winners are scored, and merc dice are cleaned up (unused mercs refund their gold cost).',
    highlight: null,
    autoAdvanceRound: 2,
  },
  {
    title: 'Victory Points',
    body: 'The VP medallion on each player card shows their running total. At game end, additional points come from: fortresses held, secret goals, full barracks bonus, and region control. Highest VP wins.',
    highlight: 'player-strip',
  },
  {
    title: 'You\'re Ready!',
    body: 'That\'s the core loop. Round goals create urgency, fortresses reward patience, battles are high-risk high-reward, and the Threat Track builds toward a dramatic finale. Head to Play to start your own game!',
    highlight: null,
  },
];

// ─── Highlight ring component ─────────────────────────────────────────────────

function HighlightRing() {
  return (
    <span className="pointer-events-none absolute inset-0 z-10 rounded-inherit animate-pulse"
      style={{
        boxShadow: '0 0 0 2px rgba(124,58,237,0.7), 0 0 16px 4px rgba(124,58,237,0.3)',
        borderRadius: 'inherit',
      }} />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TutorialPage() {
  const navigate = useNavigate();
  const configs  = useMemo(() => loadConfigs(), []);

  // Tutorial step state
  const [step, setStep]     = useState(0);
  const [started, setStarted] = useState(false);

  // Game state (all-AI watch mode, fixed seed)
  const [gameState, setGameState]     = useState<GameState | null>(null);
  const [rngSnapshot, setRngSnapshot] = useState<string>('');
  const [autoplay, setAutoplay]       = useState(false);
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

  const currentStep = STEPS[step]!;

  function startGame() {
    const state = createGame({
      seed: 'tutorial-main',
      players: [
        { id: 'p1', factionId: 'warriors', isAI: true },
        { id: 'p2', factionId: 'mages',    isAI: true },
      ],
      regions:     configs.regions,
      factions:    configs.factions,
      rules:       configs.rules,
      roundGoals:  configs.roundGoals,
      secretGoals: configs.secretGoals,
    });
    setGameState(state);
    setRngSnapshot(state.rngState);
    setAutoplay(true);
    setStarted(true);
  }

  function advanceGame(prev: GameState, snap: string): { state: GameState; snap: string } {
    if (prev.phase === 'finished') return { state: prev, snap };
    const rng = Rng.fromSnapshot(JSON.parse(snap));
    let state = prev;
    if (state.phase === 'roll') {
      state = rollPhase(state, { rng, cards: configs.cards });
    } else if (isRoundOver(state)) {
      state = endOfRound(state, {
        rules: configs.rules, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
        cardKeepCost: configs.costs.cardKeep, structures: configs.structures,
      });
    } else {
      const { move } = pickMove(state, {
        rules: configs.rules, cards: configs.cards, costs: configs.costs,
        structures: configs.structures, roundGoals: configs.roundGoals,
        secretGoals: configs.secretGoals, rng, difficulty: 'medium',
      });
      state = apply(state, move, {
        rules: configs.rules, cards: configs.cards, costs: configs.costs,
        structures: configs.structures, rng,
      });
    }
    return { state, snap: JSON.stringify(rng.snapshot()) };
  }

  // Autoplay loop
  useEffect(() => {
    if (!autoplay || !gameState || gameState.phase === 'finished') return;
    const id = window.setTimeout(() => {
      if (!autoplayRef.current) return;
      setGameState((prev) => {
        if (!prev) return prev;
        const { state, snap } = advanceGame(prev, rngSnapshot);
        setRngSnapshot(snap);
        return state;
      });
    }, 600);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, autoplay]);

  // Auto-advance tutorial step when game reaches the specified phase/round
  useEffect(() => {
    if (!gameState) return;
    const s = STEPS[step]!;
    if (s.autoAdvancePhase && gameState.phase === s.autoAdvancePhase) {
      const t = setTimeout(() => setStep((p) => Math.min(p + 1, STEPS.length - 1)), 1200);
      return () => clearTimeout(t);
    }
    if (s.autoAdvanceRound && gameState.round >= s.autoAdvanceRound) {
      const t = setTimeout(() => setStep((p) => Math.min(p + 1, STEPS.length - 1)), 800);
      return () => clearTimeout(t);
    }
  }, [gameState, step]);

  const hl = currentStep.highlight;

  // ── Before start ──
  if (!started) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 animate-fade-in">
        <div className="mb-4 text-5xl">⚔</div>
        <h1 className="mb-2 text-3xl font-black text-white">Iron &amp; Ash Tutorial</h1>
        <p className="mb-8 max-w-md text-center text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
          Watch a live Warriors vs Mages game while each mechanic is explained step by step.
          Takes about 3 minutes — or skip any step with the Next button.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={startGame}
            className="rounded-xl px-8 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}
          >
            ▶ Start Tutorial
          </button>
          <button
            type="button"
            onClick={() => navigate('/play')}
            className="rounded-xl border px-6 py-3 text-sm font-semibold transition-all hover:bg-white/5"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
          >
            Skip — go to Play
          </button>
        </div>
        {/* Faction preview */}
        <div className="mt-10 flex gap-8">
          {(['warriors', 'mages'] as const).map((f) => (
            <div key={f} className="flex flex-col items-center gap-2">
              <FactionEmblem factionId={f} size={56} className="rounded-2xl" />
              <div className="text-sm font-bold text-neutral-200">{factionLabel(f)}</div>
              <div className="max-w-[140px] text-center text-[10px] text-neutral-500">
                {FACTION_ABILITIES[f].activeDescription}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  const rules  = configs.rules;
  const players = gameState.turnOrder.map((id) => gameState.players[id]!);
  const goalSlot = gameState.roundGoals.find((g) => g.forRound === gameState.round);
  const pcKey = String(gameState.turnOrder.length) as '2' | '3' | '4';
  const threshold = rules.threatTrackThresholdByPlayerCount?.[pcKey] ?? rules.threatTrackThreshold;

  return (
    <main className="relative min-h-screen animate-fade-in pb-52" style={{ background: 'var(--color-bg)' }}>

      {/* ── Game header ── */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-black/80 px-4 py-2.5 backdrop-blur-xl">
        {/* Threat bar */}
        <div data-tid="threat" className={`relative rounded-lg ${hl === 'threat' ? 'ring-2 ring-purple-400 ring-offset-1 ring-offset-black/80' : ''}`}>
          <ThreatBar track={gameState.threatTrack} threshold={threshold} />
        </div>

        <span className="text-sm font-bold text-white">
          Round <span className="text-purple-300">{gameState.round}</span>
          <span className="text-neutral-600">/{rules.totalRounds}</span>
        </span>
        <PhaseChip phase={gameState.phase} />
        {gameState.freeForAll && (
          <span className="rounded-md bg-amber-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Free-for-all</span>
        )}

        {/* Round goal */}
        {goalSlot && (
          <div data-tid="goal" className={`relative rounded-lg ${hl === 'goal' ? 'ring-2 ring-purple-400 ring-offset-1 ring-offset-black/80' : ''}`}>
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-neutral-400">
              Goal: <span className="text-neutral-200">{goalSlot.goalId.replace(/-/g, ' ')}</span>
            </span>
          </div>
        )}

        {/* Tutorial controls — top right */}
        <div className="ml-auto flex items-center gap-2">
          <button type="button"
            onClick={() => setAutoplay((p) => !p)}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${autoplay ? 'bg-amber-700/50 text-amber-200' : 'bg-neutral-800 text-neutral-400'}`}
          >
            {autoplay ? '⏸' : '▶'}
          </button>
          <button type="button" onClick={() => navigate('/play')}
            className="rounded-lg border border-neutral-700 px-3 py-1 text-[10px] text-neutral-400 hover:text-neutral-200 transition">
            Skip tutorial →
          </button>
        </div>
      </div>

      {/* ── Merc bar ── */}
      <div data-tid="merc-bar"
        className={`relative flex items-center gap-3 border-b border-neutral-800/60 bg-neutral-900/30 px-4 py-1.5 ${hl === 'merc-bar' ? 'ring-2 ring-purple-400' : ''}`}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Mercs</span>
        {(['low','high','specialist'] as const).map((slot) => {
          const die = gameState.mercs[slot];
          const label = slot === 'specialist' ? `Spec·${gameState.mercs.specialistValue}` : slot === 'low' ? 'Low' : 'High';
          const claimed = gameState.mercs.claimed[slot];
          return (
            <div key={slot} className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] ${claimed ? 'border-amber-700/60 bg-amber-950/30 text-amber-200' : die ? 'border-neutral-700 bg-neutral-900 text-neutral-300' : 'border-neutral-800 bg-neutral-950 text-neutral-600'}`}>
              <span className="font-medium">{label}</span>
              {die?.faceValue !== null && die?.faceValue !== undefined &&
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-800 text-xs font-bold">{die.faceValue}</span>}
              {claimed && <span className="text-amber-400/70">→ {gameState.players[claimed]?.factionId && factionLabel(gameState.players[claimed]!.factionId)}</span>}
              {!die && !claimed && <span>—</span>}
            </div>
          );
        })}
        {hl === 'merc-bar' && <HighlightRing />}
      </div>

      {/* ── Map ── */}
      <div data-tid="map" className={`relative px-4 pt-2 ${hl === 'map' ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-black rounded-2xl mx-2' : ''}`}>
        <MapView state={gameState} humanMoves={[]} selectedDieId={null} onRegionClick={() => {}} />
        {hl === 'map' && <HighlightRing />}
      </div>

      {/* ── Player strip ── */}
      <div data-tid="player-strip"
        className={`relative flex gap-2.5 overflow-x-auto px-4 py-3 ${hl === 'player-strip' ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-black rounded-2xl mx-2' : ''}`}>
        {hl === 'player-strip' && <HighlightRing />}
        {players.map((player, idx) => {
          const barracksDice = player.dice.filter((d) => d.location.kind === 'barracks' && d.faceValue !== null);
          const isActive = player.id === gameState.activePlayerId && gameState.phase === 'action';
          const ab = FACTION_ABILITIES[player.factionId];
          return (
            <div key={player.id}
              className={`w-56 shrink-0 rounded-2xl p-3 text-xs transition-all glass ${isActive ? 'border border-purple-500/50 bg-purple-950/15' : 'border-transparent'}`}
              style={{ boxShadow: isActive ? '0 0 15px 2px rgba(139,92,246,0.12)' : 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
              <div className="mb-2.5 flex items-center gap-2">
                <div className="group relative shrink-0">
                  <FactionEmblem factionId={player.factionId} size={34} className="rounded-xl" />
                  {isActive && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-purple-400 ring-2 ring-neutral-950 animate-pulse" />
                  )}
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-52 rounded-2xl p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ background: 'rgba(12,8,22,0.97)', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                    <div className="mb-1 text-[10px] font-black text-purple-300 uppercase tracking-wide">{ab?.activeLabel}</div>
                    <div className="text-[10px] leading-relaxed text-neutral-400">{ab?.activeDescription}</div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-[11px] font-bold text-neutral-100">{factionLabel(player.factionId)}</div>
                  <div className="text-[9px] text-neutral-600">p{idx + 1} · {barracksDice.length} ready</div>
                </div>
                <VPMedallion vp={player.vp} isLeader={false} size="md" />
              </div>
              <div className="mb-2.5 flex items-center gap-1.5">
                <ResourceCount resource="iron"    value={player.resources.iron}    size={13} />
                <ResourceCount resource="gold"    value={player.resources.gold}    size={13} />
                <ResourceCount resource="essence" value={player.resources.essence} size={13} />
              </div>
              {barracksDice.length > 0 && (
                <div>
                  <div className="mb-1 text-[9px] uppercase tracking-widest text-neutral-700">Barracks</div>
                  <div className="flex flex-wrap gap-1.5">
                    {barracksDice.slice(0, 6).map((d) => (
                      <Die key={d.id} value={d.faceValue} range={d.range} size={28} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Tutorial panel (fixed bottom) ── */}
      <TutorialPanel
        step={step}
        total={STEPS.length}
        title={currentStep.title}
        body={currentStep.body}
        isLast={step === STEPS.length - 1}
        onBack={() => setStep((p) => Math.max(p - 1, 0))}
        onNext={() => {
          if (step === STEPS.length - 1) navigate('/play');
          else setStep((p) => p + 1);
        }}
        onSkip={() => navigate('/play')}
      />
    </main>
  );
}

// ─── Tutorial panel ───────────────────────────────────────────────────────────

function TutorialPanel({
  step, total, title, body, isLast, onBack, onNext, onSkip,
}: {
  step: number; total: number; title: string; body: string;
  isLast: boolean; onBack: () => void; onNext: () => void; onSkip: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:left-52 animate-fade-in"
      style={{
        background: 'linear-gradient(180deg, transparent 0%, rgba(9,9,11,0.92) 20%)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
      }}>
      <div className="mx-auto max-w-3xl px-4 pb-3 pt-6">
        {/* Progress dots */}
        <div className="mb-3 flex items-center gap-1.5 justify-center">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i}
              className="rounded-full transition-all"
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                background: i === step ? '#7c3aed' : i < step ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)',
              }} />
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl p-4" style={{
          background: 'rgba(18,12,30,0.97)',
          border: '1px solid rgba(124,58,237,0.25)',
          boxShadow: '0 -8px 48px rgba(0,0,0,0.5), 0 0 60px rgba(124,58,237,0.08)',
        }}>
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
                  Step {step + 1} of {total}
                </span>
              </div>
              <div className="mb-1.5 text-base font-black text-white">{title}</div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>{body}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={onBack} disabled={step === 0}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-400 transition hover:bg-neutral-800 disabled:opacity-30">
              ← Back
            </button>
            <button type="button" onClick={onNext}
              className="flex-1 rounded-xl py-2 text-sm font-bold text-white transition-all hover:brightness-110"
              style={{ background: isLast ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'rgba(124,58,237,0.8)' }}>
              {isLast ? '▶ Start Playing' : 'Next →'}
            </button>
            {!isLast && (
              <button type="button" onClick={onSkip}
                className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-800">
                Skip all
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ThreatBar({ track, threshold }: { track: number; threshold: number }) {
  const pct = Math.min(100, Math.round((track / threshold) * 100));
  const col = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#10b981';
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-neutral-600 uppercase tracking-widest">Threat</span>
      <div className="h-1.5 w-20 rounded-full bg-neutral-800 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: col }} />
      </div>
      <span className="text-[9px] tabular-nums text-neutral-500">{track}/{threshold}</span>
    </div>
  );
}

function PhaseChip({ phase }: { phase: string }) {
  const map: Record<string, string> = {
    roll: 'bg-blue-800/50 text-blue-200', action: 'bg-purple-800/50 text-purple-200',
    'end-of-round': 'bg-amber-800/50 text-amber-200', finished: 'bg-neutral-800 text-neutral-400',
  };
  return (
    <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${map[phase] ?? 'bg-neutral-800 text-neutral-500'}`}>
      {phase}
    </span>
  );
}
