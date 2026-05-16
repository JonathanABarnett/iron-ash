// TutorialPage — interactive full-game tutorial with contextual, dismissable hints.
//
// The user plays as Warriors against a Mage AI (medium difficulty).
// As the game progresses, hint cards appear in the top-right corner explaining
// each mechanic as it becomes relevant. Every hint can be dismissed immediately;
// the game always continues normally regardless of whether hints are read.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Rng } from '@engine/rng';
import { createGame } from '@engine/setup';
import { apply, enumerate } from '@engine/moves';
import { endOfRound, isRoundOver, rollPhase } from '@engine/rounds';
import { pickMove } from '@ai/decide';
import { FACTION_ABILITIES } from '@engine/factions/abilities';
import { nextDieRange } from '@engine/types';
import type { GameState, Move, PlayerId } from '@engine/types';
import { loadConfigs } from '@ui/configLoader';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';
import { MapView } from '@ui/components/MapView';
import { GoalStandingsBar, FortressStrip } from '@ui/pages/PlayPage';
import { Die } from '@ui/components/Die';
import { ResourceCount } from '@ui/components/ResourceGem';
import { VPMedallion } from '@ui/components/VPMedallion';

// ─── Hint definitions ─────────────────────────────────────────────────────────

interface HintDef {
  id: string;
  icon: string;
  title: string;
  body: string;
  /** data-tour attribute value to spotlight (the element will get a pulsing ring). */
  anchor?: string;
  /** Returns true when this hint should appear (checked once; won't re-fire after dismiss). */
  trigger: (s: GameState, humanPid: string, prevRound: number) => boolean;
}

const HINTS: HintDef[] = [
  {
    id: 'roll-phase',
    icon: '🎲',
    title: 'Roll Phase',
    body: 'Look at your Barracks — each die just got a fresh face value. Higher-range dice (gold, purple) unlock more powerful regions. Hover a die to see its tier name.',
    anchor: 'player-cards',
    trigger: (s) => s.phase === 'action' && s.round === 1,
  },
  {
    id: 'first-turn',
    icon: '👆',
    title: 'Your Turn — Place a Die',
    body: 'On the map, teal-glowing regions accept your dice. Click a die in your Barracks (highlighted on the left), then click a glowing region to place it. Each region scores +1 VP when you occupy it.',
    anchor: 'map',
    trigger: (s, pid) => s.phase === 'action' && s.activePlayerId === pid && s.round === 1,
  },
  {
    id: 'resources',
    icon: '⚙',
    title: 'Three Resources',
    body: 'The gem chips below your faction crest show Iron ⚙ (upgrades/structures), Gold 🪙 (mercs/cards), and Essence 💎 (Arcane Spires/cards). Hover any gem to see its uses. All cap at 8.',
    anchor: 'player-cards',
    trigger: (s, pid, prevRound) => s.round === 1 && prevRound === 0 && (() => {
      const p = s.players[pid];
      return (p?.progress.battlesWonThisGame ?? 0) >= 0 && (p?.vp ?? 0) >= 1;
    })(),
  },
  {
    id: 'round-goal',
    icon: '🎯',
    title: 'Round Goal',
    body: 'Every round has a shared bonus goal — highlighted in the purple bar above the map. The leader at round-end earns +2 VP. The progress bars show who is currently winning the goal.',
    anchor: 'goal-bar',
    trigger: (s) => s.round === 1 && s.phase === 'action',
  },
  {
    id: 'fortress',
    icon: '🏰',
    title: 'Uncontested Fortress',
    body: 'The fortress strip above the map shows which fortresses are held. A "● free" tag means it\'s yours for the taking — garrison it by placing a die that meets its requirement. You\'ll earn +1 VP every round you hold it.',
    anchor: 'fortress-strip',
    trigger: (s, pid) => {
      const openFortress = Object.values(s.regions).find(
        (rt) => {
          const def = s.regionDefs[rt.regionId];
          return def?.isFortress && !rt.garrisonOwnerId;
        },
      );
      return !!openFortress && s.round <= 3 && s.activePlayerId === pid;
    },
  },
  {
    id: 'specialist',
    icon: '⭐',
    title: 'Hire the Specialist',
    body: 'The Specialist row in the merc panel shows a countdown of purple dots — each round one dot disappears, lowering its face value. Hire it now (only 2 gold in rounds 1–2!) for a max-power die.',
    anchor: 'merc-bar',
    trigger: (s) => s.round <= 2 && s.mercs.specialist !== null && !s.mercs.claimed['specialist'],
  },
  {
    id: 'battle',
    icon: '⚔',
    title: 'Battle Available',
    body: 'See the "⚔ Battle" button in your action menu? You can attack an enemy-occupied region! Win condition: your die value > (their total dice + 1). Victory: evict them, +1 VP, +1 iron.',
    anchor: 'action-menu',
    trigger: (s, pid) => {
      const p = s.players[pid];
      if (!p || s.activePlayerId !== pid) return false;
      return p.dice.some((die) => {
        if (die.location.kind !== 'barracks' || die.faceValue === null) return false;
        return Object.values(s.regions).some((rt) => {
          const def = s.regionDefs[rt.regionId];
          return !def?.isFortress && rt.placedDieIds.some((id) =>
            Object.values(s.players).find((pl) => pl.id !== pid && pl.dice.some((d) => d.id === id)),
          );
        });
      });
    },
  },
  {
    id: 'active-ability',
    icon: '✦',
    title: 'Use Your Active Ability',
    body: 'Tap the "✦ Active" button in your action menu — Warriors\' Iron Discipline gives +2 iron instantly, once per round. Free to use! Hover the Warriors emblem on your card to see the full description.',
    anchor: 'action-menu',
    trigger: (s, pid) => s.round >= 2 && s.activePlayerId === pid && !(s.players[pid]?.activeUsedThisRound),
  },
  {
    id: 'combine',
    icon: '🔗',
    title: 'Combine Dice for Big Targets',
    body: 'Look for "Combine →" buttons in your action menu. They merge two of your dice and place them in one region using their summed value. Essential for fortresses with Σ≥8 requirements.',
    anchor: 'action-menu',
    trigger: (s) => s.round === 2 && s.phase === 'action',
  },
  {
    id: 'upgrade',
    icon: '↑',
    title: 'Upgrade a Die',
    body: 'Tap "↑ Upgrade" in your action menu to promote a Recruit (1-3) → Soldier (2-5), or Soldier → Veteran (3-6). Costs iron + gold. Higher-range dice reach more regions — invest early!',
    anchor: 'action-menu',
    trigger: (s, pid) => {
      const p = s.players[pid];
      if (!p) return false;
      const cost = { iron: 2, gold: 1, essence: 0 };
      return s.round >= 2 && p.resources.iron >= cost.iron && p.resources.gold >= cost.gold
        && p.dice.some((d) => d.range === '1-3' && d.location.kind === 'barracks');
    },
  },
  {
    id: 'threat',
    icon: '🌡',
    title: 'Threat Track Building',
    body: 'Check the threat bar at the top — it has crossed halfway. Every round adds +1, battles add +1, fortress usurps add +1. When it maxes, the Free-For-All round begins — all mercs free!',
    anchor: 'threat-bar',
    trigger: (s, _pid, _prev) => {
      const pcKey = String(s.turnOrder.length) as '2' | '3' | '4';
      const threshold = (s as GameState & { rules?: { threatTrackThresholdByPlayerCount?: Record<string, number>; threatTrackThreshold: number } }).rules?.threatTrackThresholdByPlayerCount?.[pcKey] ?? 8;
      return s.threatTrack >= Math.ceil(threshold * 0.5);
    },
  },
  {
    id: 'end-of-round',
    icon: '📊',
    title: 'End of Round',
    body: 'After all players pass, the round ends and VP is scored: fortresses you garrison, round goal winner, and any other bonuses. Unused merc dice refund their gold.',
    trigger: (_s, _pid, prevRound) => prevRound >= 1,
  },
];

// ─── Hint card ────────────────────────────────────────────────────────────────

function HintCard({ hint, onDismiss }: { hint: HintDef; onDismiss: () => void }) {
  return (
    <div className="animate-fade-in w-72 rounded-2xl p-4 shadow-xl"
      style={{
        background: 'rgba(14,9,26,0.97)',
        border: '1px solid rgba(124,58,237,0.3)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 40px rgba(124,58,237,0.08)',
      }}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{hint.icon}</span>
          <span className="text-xs font-bold text-purple-300">{hint.title}</span>
        </div>
        <button type="button" onClick={onDismiss}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition">
          ✕
        </button>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-muted)' }}>
        {hint.body}
      </p>
    </div>
  );
}

// ─── Tutorial splash ──────────────────────────────────────────────────────────

function TutorialSplash({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 animate-fade-in">
      <div className="mb-4 text-5xl">🎓</div>
      <h1 className="mb-2 text-3xl font-black text-white">Interactive Tutorial</h1>
      <p className="mb-2 max-w-md text-center text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
        Play as <strong className="text-white">Warriors</strong> against a Mage AI opponent.
        Hint cards appear in the corner and a <strong className="text-purple-300">pulsing purple ring</strong> highlights
        the UI element each hint is describing — so you always know where to look.
      </p>
      <p className="mb-8 text-center text-xs" style={{ color: 'var(--color-subtle)' }}>
        You control every Warriors action. The AI plays Mages automatically.
      </p>
      <div className="mb-10 flex items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <FactionEmblem factionId="warriors" size={60} className="rounded-2xl" />
          <div className="text-sm font-bold text-teal-300">You — Warriors</div>
          <div className="max-w-[140px] text-center text-[10px] text-neutral-500">
            Iron & fortresses. Active: Iron Discipline (+2 iron).
          </div>
        </div>
        <div className="text-2xl font-black text-neutral-600">vs</div>
        <div className="flex flex-col items-center gap-2">
          <FactionEmblem factionId="mages" size={60} className="rounded-2xl" />
          <div className="text-sm font-bold text-neutral-300">AI — Mages</div>
          <div className="max-w-[140px] text-center text-[10px] text-neutral-500">
            Essence & precision. Arcane Precision (set die to any value).
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onStart}
          className="rounded-xl px-8 py-3 text-sm font-bold text-white transition-all hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
          ▶ Start Tutorial Game
        </button>
        <button type="button" onClick={onSkip}
          className="rounded-xl border px-6 py-3 text-sm font-semibold transition hover:bg-white/5"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
          Skip — go to Play
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TutorialPage() {
  const navigate = useNavigate();
  const configs  = useMemo(() => loadConfigs(), []);

  const [started, setStarted]               = useState(false);
  const [gameState, setGameState]           = useState<GameState | null>(null);
  const [rngSnapshot, setRngSnapshot]       = useState('');
  const [waitingForHuman, setWaitingForHuman] = useState(false);
  const [pendingMoves, setPendingMoves]     = useState<Move[]>([]);
  const [selectedDieId, setSelectedDieId]   = useState<string | null>(null);
  const [autoplay, setAutoplay]             = useState(false);
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set());
  const [activeHints, setActiveHints]       = useState<string[]>([]);
  const [prevRound, setPrevRound]           = useState(0);
  const [roundSummary, setRoundSummary]     = useState<{ round: number; vpDeltas: Record<string, number> } | null>(null);
  const [justRolled, setJustRolled]         = useState(false);
  const [vpGains, setVpGains]               = useState<Record<string, number>>({});
  useEffect(() => { if (!justRolled) return; const t = setTimeout(() => setJustRolled(false), 650); return () => clearTimeout(t); }, [justRolled]);
  useEffect(() => { if (!Object.keys(vpGains).length) return; const t = setTimeout(() => setVpGains({}), 1400); return () => clearTimeout(t); }, [vpGains]);

  const humanPid: PlayerId = 'p1';
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

  const structuresCtx = configs.structures.length ? { structures: configs.structures } : {};

  function startGame() {
    const state = createGame({
      seed: 'tutorial-interactive',
      players: [
        { id: humanPid, factionId: 'warriors', isAI: false },
        { id: 'p2',     factionId: 'mages',    isAI: true  },
      ],
      regions: configs.regions, factions: configs.factions, rules: configs.rules,
      roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
    });
    setGameState(state);
    setRngSnapshot(state.rngState);
    setStarted(true);
    setAutoplay(true);
  }

  // ── Game step ──────────────────────────────────────────────────────────────
  function stepGame(prev: GameState, snap: string): { state: GameState; snap: string; endedRound: boolean } {
    const rng = Rng.fromSnapshot(JSON.parse(snap));
    let state = prev;
    let endedRound = false;
    if (state.phase === 'roll') {
      state = rollPhase(state, { rng, cards: configs.cards });
    } else if (isRoundOver(state)) {
      const prevVPs: Record<string, number> = {};
      for (const [pid, p] of Object.entries(state.players)) prevVPs[pid] = p.vp;
      state = endOfRound(state, { rules: configs.rules, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals, cardKeepCost: configs.costs.cardKeep, ...structuresCtx });
      const vpDeltas: Record<string, number> = {};
      for (const [pid, p] of Object.entries(state.players)) vpDeltas[pid] = p.vp - (prevVPs[pid] ?? 0);
      setRoundSummary({ round: prev.round, vpDeltas });
      endedRound = true;
    } else {
      if (state.activePlayerId === humanPid) {
        const pending = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
        setWaitingForHuman(true);
        setPendingMoves(pending);
        setSelectedDieId(null);
        return { state, snap: JSON.stringify(rng.snapshot()), endedRound: false };
      }
      const { move } = pickMove(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals, rng, difficulty: 'medium' });
      state = apply(state, move, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
    }
    return { state, snap: JSON.stringify(rng.snapshot()), endedRound };
  }

  function applyHumanMove(move: Move) {
    setWaitingForHuman(false);
    setPendingMoves([]);
    setSelectedDieId(null);
    setGameState((prev) => {
      if (!prev) return prev;
      const rng = Rng.fromSnapshot(JSON.parse(rngSnapshot));
      const state = apply(prev, move, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
      setRngSnapshot(JSON.stringify(rng.snapshot()));
      return state;
    });
    setAutoplay(true);
  }

  // ── Autoplay loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoplay || !gameState || gameState.phase === 'finished' || waitingForHuman) return;
    const delay = gameState.phase === 'roll' ? 400 : 500;
    const id = window.setTimeout(() => {
      if (!autoplayRef.current) return;
      const { state, snap, endedRound } = stepGame(gameState, rngSnapshot);
      setRngSnapshot(snap);
      setGameState(state);
      if (endedRound) { setAutoplay(false); setPrevRound(gameState.round); }
      if (state.activePlayerId === humanPid && state.phase === 'action') setAutoplay(false);
      // Animation triggers
      if (gameState.phase === 'roll' && state.phase === 'action') setJustRolled(true);
      const gains: Record<string, number> = {};
      for (const [pid, np] of Object.entries(state.players)) {
        const pv = gameState.players[pid]?.vp ?? 0;
        if (np.vp > pv) gains[pid] = np.vp - pv;
      }
      if (Object.keys(gains).length) setVpGains(gains);
    }, delay);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, autoplay, waitingForHuman]);

  // ── Hint firing ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameState) return;
    const newHints: string[] = [];
    for (const hint of HINTS) {
      if (dismissedHints.has(hint.id)) continue;
      if (activeHints.includes(hint.id)) continue;
      try {
        if (hint.trigger(gameState, humanPid, prevRound)) {
          newHints.push(hint.id);
        }
      } catch { /* ignore trigger errors */ }
    }
    if (newHints.length > 0) {
      setActiveHints((prev) => [...prev, ...newHints]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.phase, gameState?.round, gameState?.activePlayerId]);

  function dismissHint(id: string) {
    setDismissedHints((prev) => new Set([...prev, id]));
    setActiveHints((prev) => prev.filter((h) => h !== id));
  }

  function dismissAll() {
    setDismissedHints(new Set(HINTS.map((h) => h.id)));
    setActiveHints([]);
  }

  if (!started) {
    return <TutorialSplash onStart={startGame} onSkip={() => navigate('/play')} />;
  }
  if (!gameState) return null;

  const rules   = configs.rules;
  const pcKey   = String(gameState.turnOrder.length) as '2' | '3' | '4';
  const threshold = rules.threatTrackThresholdByPlayerCount?.[pcKey] ?? rules.threatTrackThreshold;
  const goalSlot  = gameState.roundGoals.find((g) => g.forRound === gameState.round);
  const maxVP     = Math.max(...Object.values(gameState.players).map((p) => p?.vp ?? 0));
  const visibleActiveHints = activeHints
    .map((id) => HINTS.find((h) => h.id === id))
    .filter(Boolean)
    .slice(0, 3) as HintDef[]; // show at most 3 hints at once

  // Spotlight the first active hint with an anchor
  const firstAnchor = visibleActiveHints.find((h) => h.anchor)?.anchor ?? null;

  // Apply pulsing spotlight class to the element matching the current anchor
  useEffect(() => {
    if (!firstAnchor) return;
    const el = document.querySelector(`[data-tour="${firstAnchor}"]`);
    if (!el) return;
    el.classList.add('tutorial-spotlight');
    // Scroll into view if not already visible
    const rect = el.getBoundingClientRect();
    if (rect.top < 60 || rect.bottom > window.innerHeight - 60) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return () => { el.classList.remove('tutorial-spotlight'); };
  }, [firstAnchor]);

  return (
    <main className="relative min-h-screen animate-fade-in" style={{ background: 'var(--color-bg)' }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-black/80 px-4 py-2.5 backdrop-blur-xl"
        style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.04)' }}>
        <div data-tour="threat-bar" className="rounded-lg p-1 -m-1">
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
        {goalSlot && (
          <span className="text-[10px] text-neutral-500">Goal: <span className="text-neutral-300">{goalSlot.goalId.replace(/-/g, ' ')}</span></span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Tutorial label */}
          <span className="rounded-md bg-purple-900/50 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-800/50">Tutorial</span>

          {/* Hint count button */}
          {activeHints.length > 0 && (
            <button type="button" onClick={() => {}}
              className="flex items-center gap-1 rounded-lg bg-amber-900/40 border border-amber-700/40 px-2.5 py-1 text-[10px] font-bold text-amber-300 transition hover:bg-amber-800/40">
              💡 {activeHints.length} hint{activeHints.length > 1 ? 's' : ''}
            </button>
          )}

          {activeHints.length > 0 && (
            <button type="button" onClick={dismissAll}
              className="rounded-lg border border-neutral-700 px-2.5 py-1 text-[10px] text-neutral-500 hover:text-neutral-300 transition">
              Dismiss all
            </button>
          )}

          {/* Auto/step controls */}
          {!waitingForHuman && gameState.phase !== 'finished' && (
            <button type="button" onClick={() => setAutoplay((p) => !p)}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${autoplay ? 'bg-amber-700/50 text-amber-200' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}>
              {autoplay ? '⏸ Pause' : '▶ Resume'}
            </button>
          )}

          <button type="button" onClick={() => navigate('/play')}
            className="rounded-lg border border-neutral-700 px-3 py-1 text-[10px] text-neutral-400 hover:text-neutral-200 transition">
            Exit Tutorial
          </button>
        </div>
      </div>

      {/* ── Human action banner ── */}
      {waitingForHuman && (
        <div data-tour="action-menu" className="mx-4 mt-3 rounded-2xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(20,184,166,0.08), rgba(6,182,212,0.04))',
            border: '1px solid rgba(20,184,166,0.3)',
            boxShadow: '0 0 30px 6px rgba(20,184,166,0.08)',
          }}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-black text-teal-300 uppercase tracking-wide">⚔ Your Turn — Warriors</span>
            {selectedDieId && (
              <button type="button" onClick={() => setSelectedDieId(null)}
                className="rounded-lg border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-800 transition">
                ✕ clear filter
              </button>
            )}
          </div>
          <HumanActionMenu
            moves={pendingMoves}
            state={gameState}
            selectedDieId={selectedDieId}
            onChoose={applyHumanMove}
          />
        </div>
      )}

      {/* ── Merc bar ── */}
      <div data-tour="merc-bar" className="flex items-center gap-3 border-b border-neutral-800/60 bg-neutral-900/30 px-4 py-1.5 mt-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Mercs</span>
        {(['low','high','specialist'] as const).map((slot) => {
          const die = gameState.mercs[slot];
          const claimed = gameState.mercs.claimed[slot];
          const label = slot === 'specialist' ? `Spec·${gameState.mercs.specialistValue}` : slot === 'low' ? 'Low' : 'High';
          return (
            <div key={slot} className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] ${claimed ? 'border-amber-700/60 bg-amber-950/30 text-amber-200' : die ? 'border-neutral-700 bg-neutral-900 text-neutral-300' : 'border-neutral-800 bg-neutral-950 text-neutral-600'}`}>
              <span className="font-medium">{label}</span>
              {die?.faceValue != null && <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-800 text-xs font-bold">{die.faceValue}</span>}
              {claimed && <span className="text-amber-400/70">→ {gameState.players[claimed]?.factionId && factionLabel(gameState.players[claimed]!.factionId)}</span>}
              {!die && !claimed && <span>—</span>}
            </div>
          );
        })}
        {/* Hire buttons when it's human's turn */}
        {waitingForHuman && pendingMoves.some((m) => m.kind === 'hire-merc') && (
          <span className="text-[10px] text-teal-400/60 ml-1">← hireable</span>
        )}
      </div>

      {/* ── Goal standings ── */}
      <GoalStandingsBar state={gameState} roundGoals={configs.roundGoals} />

      {/* ── Fortress strip ── */}
      <FortressStrip state={gameState} />

      {/* ── Map ── */}
      <div data-tour="map" className="px-4 pt-2 pb-4">
        <MapView
          state={gameState}
          humanMoves={waitingForHuman ? pendingMoves : []}
          selectedDieId={selectedDieId}
          onRegionClick={(_id, moves) => { if (moves.length === 1) applyHumanMove(moves[0]!); }}
        />
      </div>

      {/* ── Round summary ── */}
      {roundSummary && (
        <div className="mx-4 mt-3 rounded-2xl p-4 animate-fade-in"
          style={{ background: 'rgba(18,12,30,0.95)', border: '1px solid rgba(124,58,237,0.25)' }}>
          <div className="mb-2 text-sm font-black text-white">Round {roundSummary.round} Complete</div>
          {Object.entries(roundSummary.vpDeltas).map(([pid, delta]) => {
            const p = gameState.players[pid];
            if (!p) return null;
            return (
              <div key={pid} className="flex items-center gap-2 text-xs text-neutral-300">
                <FactionEmblem factionId={p.factionId} size={16} />
                {factionLabel(p.factionId)} — <span className={delta > 0 ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>+{delta} VP this round</span>
              </div>
            );
          })}
          <button type="button"
            onClick={() => { setRoundSummary(null); setAutoplay(true); }}
            className="mt-3 w-full rounded-xl py-2 text-sm font-bold text-white transition hover:brightness-110"
            style={{ background: 'rgba(124,58,237,0.7)' }}>
            Continue →
          </button>
        </div>
      )}

      {/* ── End game ── */}
      {gameState.phase === 'finished' && (
        <div className="mx-4 mt-4 animate-fade-in rounded-2xl p-6 text-center"
          style={{ background: 'rgba(18,12,30,0.97)', border: '1px solid rgba(124,58,237,0.4)' }}>
          <div className="mb-2 text-4xl">🏆</div>
          <div className="mb-1 text-2xl font-black text-white">
            {gameState.winnerId === humanPid ? 'Victory!' : 'Defeat'}
          </div>
          <div className="mb-4 text-sm text-neutral-400">
            {gameState.winnerId === humanPid
              ? 'You defeated the Mages. Now try a full match with your choice of faction!'
              : 'The Mages got the better of you this time. Try again — or head straight to Play!'}
          </div>
          <div className="mb-5 flex justify-center gap-6">
            {gameState.turnOrder.map((pid) => {
              const p = gameState.players[pid]!;
              return (
                <div key={pid} className="flex flex-col items-center gap-1.5">
                  <FactionEmblem factionId={p.factionId} size={40} className="rounded-xl" />
                  <div className="text-xs font-bold text-neutral-300">{factionLabel(p.factionId)}</div>
                  <div className="text-lg font-black text-white">{p.vp} VP</div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 justify-center">
            <button type="button" onClick={() => navigate('/play')}
              className="rounded-xl px-8 py-2.5 text-sm font-bold text-white transition hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
              ▶ Play a Full Game
            </button>
            <button type="button" onClick={() => { setStarted(false); setGameState(null); setDismissedHints(new Set()); setActiveHints([]); }}
              className="rounded-xl border border-neutral-700 px-6 py-2.5 text-sm font-semibold text-neutral-300 transition hover:bg-neutral-800">
              Replay Tutorial
            </button>
          </div>
        </div>
      )}

      {/* ── Player strip ── */}
      <div data-tour="player-cards" className="flex gap-2.5 overflow-x-auto px-4 py-3">
        {gameState.turnOrder.map((pid) => {
          const player = gameState.players[pid]!;
          const isHuman = pid === humanPid;
          const isActive = pid === gameState.activePlayerId && gameState.phase === 'action';
          const barracksDice = player.dice.filter((d) => d.location.kind === 'barracks' && d.faceValue !== null);
          const ab = FACTION_ABILITIES[player.factionId];
          return (
            <div key={pid}
              className={`w-56 shrink-0 rounded-2xl p-3 text-xs transition-all ${
                isHuman && waitingForHuman
                  ? 'glow-teal border border-teal-500/60 bg-teal-950/20'
                  : isActive ? 'border border-purple-500/50 bg-purple-950/15 glass'
                  : 'glass border-transparent'}`}
              style={isHuman && waitingForHuman ? { boxShadow: '0 0 20px 4px rgba(20,184,166,0.15)' } : {}}>
              <div className="mb-2.5 flex items-center gap-2">
                <div className="group relative shrink-0">
                  <FactionEmblem factionId={player.factionId} size={34} className="rounded-xl" />
                  {isActive && !waitingForHuman && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-purple-400 ring-2 ring-neutral-950 animate-pulse" />
                  )}
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-52 rounded-2xl p-3 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: 'rgba(12,8,22,0.97)', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                    <div className="mb-1 text-[10px] font-black text-purple-300 uppercase tracking-wide">{ab?.activeLabel}</div>
                    <div className="text-[10px] leading-relaxed text-neutral-400">{ab?.activeDescription}</div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1">
                    <span className="text-[11px] font-bold text-neutral-100 truncate">{factionLabel(player.factionId)}</span>
                    {isHuman && <span className="shrink-0 rounded-md bg-teal-600 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide">YOU</span>}
                  </div>
                  <div className="text-[9px] text-neutral-600">
                    {barracksDice.length}d ready · {player.dice.filter(d => d.location.kind === 'region').length}p
                    {player.passedThisRound && <span className="ml-1 text-amber-500">passed</span>}
                  </div>
                </div>
                <div className="relative shrink-0">
                  <VPMedallion vp={player.vp} isLeader={maxVP > 0 && player.vp === maxVP} size="md" />
                  {(vpGains[pid] ?? 0) > 0 && (
                    <div key={player.vp} className="vp-float absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-black text-emerald-400 whitespace-nowrap" style={{ textShadow: '0 0 8px rgba(52,211,153,0.6)' }}>
                      +{vpGains[pid]} VP
                    </div>
                  )}
                </div>
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
                    {barracksDice.slice(0, 6).map((d, idx) => (
                      <Die key={d.id} value={d.faceValue} range={d.range} size={28}
                        isSelected={d.id === selectedDieId}
                        isRolling={justRolled}
                        rollDelay={idx * 55}
                        onClick={waitingForHuman && isHuman ? () => setSelectedDieId((prev) => prev === d.id ? null : d.id) : undefined}
                      />
                    ))}
                  </div>
                  {isHuman && waitingForHuman && <p className="mt-1 text-[9px] text-teal-400/60">Click die to filter · click glowing region</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Hint stack (top-right, non-blocking) ── */}
      {visibleActiveHints.length > 0 && (
        <div className="fixed right-4 top-16 z-40 flex flex-col gap-2 md:right-6 md:top-20">
          {visibleActiveHints.map((hint) => (
            <HintCard key={hint.id} hint={hint} onDismiss={() => dismissHint(hint.id)} />
          ))}
          {activeHints.length > 3 && (
            <div className="text-right text-[10px] text-neutral-600 pr-1">
              +{activeHints.length - 3} more hint{activeHints.length - 3 > 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

// ─── Inline human action menu (simplified from PlayPage) ──────────────────────

function HumanActionMenu({ moves, state, selectedDieId, onChoose }: {
  moves: Move[]; state: GameState; selectedDieId?: string | null; onChoose: (m: Move) => void;
}) {
  const player = state.players[state.activePlayerId];
  if (!player) return null;

  const visible = selectedDieId
    ? moves.filter((m) =>
        (m.kind === 'place' && m.dieId === selectedDieId) ||
        (m.kind === 'combine' && (m.dieIds[0] === selectedDieId || m.dieIds[1] === selectedDieId)) ||
        (m.kind === 'battle' && m.attackerDieId === selectedDieId) ||
        m.kind === 'pass')
    : moves;

  const vpScore = (m: Move) =>
    (m.kind === 'place' || m.kind === 'combine')
      ? (state.regionDefs[m.regionId]?.vp ?? 0) + (state.regionDefs[m.regionId]?.isFortress ? 2 : 0)
      : 0;

  const placements = visible.filter((m) => m.kind === 'place' || m.kind === 'combine');
  const topMoves   = [...placements].sort((a, b) => vpScore(b) - vpScore(a)).slice(0, 5);

  const others: { label: string; color: string; moves: Move[] }[] = [
    { label: '⚔ Battle',   color: 'border-red-800 bg-red-950/30',       moves: visible.filter((m) => m.kind === 'battle') },
    { label: '⚡ Merc',    color: 'border-blue-800 bg-blue-950/20',     moves: visible.filter((m) => m.kind === 'hire-merc') },
    { label: '🃏 Cards',   color: 'border-teal-800 bg-teal-950/20',     moves: visible.filter((m) => m.kind === 'draft-card' || m.kind === 'play-card') },
    { label: '✦ Active',   color: 'border-violet-800 bg-violet-950/30', moves: visible.filter((m) => m.kind === 'use-active') },
    { label: '↑ Upgrade',  color: 'border-amber-800 bg-amber-950/20',   moves: visible.filter((m) => m.kind === 'upgrade-die' || m.kind === 'expand-barracks') },
    { label: '🏗 Build',   color: 'border-yellow-800 bg-yellow-950/20', moves: visible.filter((m) => m.kind === 'build-structure') },
  ].filter((g) => g.moves.length > 0);

  return (
    <div className="space-y-2.5">
      {topMoves.length > 0 && (
        <div>
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-emerald-500/80">★ Best by VP</div>
          <div className="flex flex-wrap gap-1.5">
            {topMoves.map((m, i) => (
              <button key={i} type="button" onClick={() => onChoose(m)}
                className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/40 transition">
                <ActionLabel move={m} state={state} player={player} />
              </button>
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.flatMap((g) => g.moves.map((m, i) => (
            <button key={`${g.label}-${i}`} type="button" onClick={() => onChoose(m)}
              className={`rounded border px-2.5 py-1 text-xs transition hover:brightness-125 ${g.color}`}>
              <ActionLabel move={m} state={state} player={player} />
            </button>
          )))}
        </div>
      )}
      <button type="button" onClick={() => onChoose({ kind: 'pass' })}
        className="rounded-lg border border-neutral-700 bg-neutral-900/50 px-4 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition">
        ⏸ Pass (end turn)
      </button>
    </div>
  );
}

function ActionLabel({ move, state, player }: {
  move: Move; state: GameState; player: NonNullable<GameState['players'][string]>;
}) {
  switch (move.kind) {
    case 'place':    { const d = player.dice.find((x) => x.id === move.dieId); const r = state.regionDefs[move.regionId]; return <span>[{d?.range}:<strong>{d?.faceValue}</strong>] → <span className="text-neutral-200">{r?.name}</span> <span className="text-neutral-500">({r?.vp}VP)</span></span>; }
    case 'combine':  { const a = player.dice.find((x) => x.id === move.dieIds[0]); const b = player.dice.find((x) => x.id === move.dieIds[1]); const r = state.regionDefs[move.regionId]; return <span>{a?.faceValue}+{b?.faceValue}={(a?.faceValue??0)+(b?.faceValue??0)} → <span className="text-neutral-200">{r?.name}</span> <span className="text-neutral-500">({r?.vp}VP)</span></span>; }
    case 'battle':   { const r = state.regionDefs[move.targetRegionId]; return <span>Attack <span className="text-red-300">{r?.name}</span></span>; }
    case 'hire-merc': return <span>Hire <span className="text-blue-200">{move.mercSlot}</span></span>;
    case 'draft-card': return <span>Draft {move.cardId.replace('card-','')}</span>;
    case 'play-card':  return <span>Play {move.cardId.replace('card-','')}</span>;
    case 'use-active': return <span className="text-violet-300">✦ {FACTION_ABILITIES[player.factionId]?.activeLabel}</span>;
    case 'upgrade-die': { const d = player.dice.find((x) => x.id === move.dieId); return <span>↑ {d?.range}→{nextDieRange(d?.range ?? '1-3')}</span>; }
    case 'expand-barracks': return <span>+ Barracks ({player.dice.length}/{player.barracksMax})</span>;
    case 'build-structure': { const r = state.regionDefs[move.regionId]; return <span>🏗 {move.structureId.replace(/-/g,' ')} @ {r?.name}</span>; }
    case 'pass': return <span>Pass</span>;
  }
}

// ─── Header helpers ───────────────────────────────────────────────────────────

function ThreatBar({ track, threshold }: { track: number; threshold: number }) {
  const pct = Math.min(100, Math.round((track / threshold) * 100));
  const col  = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#10b981';
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
