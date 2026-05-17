// TutorialPage — scripted, deterministic walkthrough of Iron & Ash.
//
// 14 steps that teach the rules in order, highlight what to click, and narrate
// every AI move. The user plays Warriors against a Mage AI on a fixed seed
// ('tutorial-interactive') so the experience is consistent across runs.
//
// Step kinds:
//   info       — text panel + Next button (optionally highlights a UI element)
//   place      — user must place a die or perform any action; Next unlocks after
//   ai-turn    — autoplay one AI move, narrate what they did, then Next
//   finish     — final step with Play/Replay buttons
//
// Exit Tutorial button is always visible in the top-right header.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { produce } from 'immer';
import { Rng } from '@engine/rng';
import { createGame } from '@engine/setup';
import { apply, enumerate } from '@engine/moves';
import { endOfRound, isRoundOver, rollPhase } from '@engine/rounds';
import { pickMove } from '@ai/decide';
import { FACTION_ABILITIES } from '@engine/factions/abilities';
import { nextDieRange } from '@engine/types';
import type { AIReasoning, GameState, Move, PlayerId } from '@engine/types';
import { loadConfigs } from '@ui/configLoader';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';
import { MapView } from '@ui/components/MapView';
import { Die, DIE_NAMES } from '@ui/components/Die';
import { ResourceCount } from '@ui/components/ResourceGem';
import { VPMedallion } from '@ui/components/VPMedallion';
import { GoalStandingsBar, FortressStrip } from '@ui/pages/PlayPage';

// ─── Tutorial step definitions ────────────────────────────────────────────────

type StepKind = 'info' | 'place' | 'ai-turn' | 'end-of-round' | 'new-round' | 'finish';

/**
 * Describes the one move the player is allowed to make on a 'place' step.
 * The action menu and map are filtered to this move only — nothing else is
 * clickable. This locks the tutorial so the player can't deviate by accident.
 */
type PrescribedMove =
  | { kind: 'place';    regionId: string; dieRange?: string }
  | { kind: 'combine';  regionId: string }
  | { kind: 'hire-merc'; mercSlot: 'low' | 'high' | 'specialist' }
  | { kind: 'use-active' }
  | { kind: 'pass' };

interface Step {
  kind: StepKind;
  title: string;
  body: string;
  anchor?: string;
  /** for 'place' steps — body to show after the user completes the action */
  doneBody?: string;
  /**
   * The one move the player may make on this step. The action menu and map are
   * filtered to only show/respond to this move. Required on all 'place' steps.
   */
  prescribed?: PrescribedMove;
  /**
   * If true, this 'place' step auto-completes when the round is already over.
   * Safety net — with prescribed moves this shouldn't normally fire.
   */
  skipIfRoundOver?: boolean;
}

const STEPS: Step[] = [
  // ── Intro ──────────────────────────────────────────────────────────────────
  {
    kind: 'info',
    title: 'Welcome',
    body: 'Two rounds, fixed dice, one opponent — the Mages. Every step tells you exactly what to click. Finish the two rounds and you can keep playing the same game from where you left off.',
  },
  {
    kind: 'info',
    title: 'The Map',
    body: 'Sixteen regions, each with a VP value and a die requirement. ≥4 means your die needs to show 4 or higher. ≤2 means 2 or lower. =3 means exactly 3. Σ≥7 means two dice combined. Castle icons are fortresses — they score every round you hold them.',
    anchor: 'map',
  },
  {
    kind: 'info',
    title: 'Your Faction — Warriors',
    body: 'Check your card on the right. You\'ve got 3 iron, 1 gold, 0 essence, and three dice: a 6, a 3, and a 2. You start with 2 iron but Warriors earn +1 at the top of every round automatically — so you already have 3. Your active ability, Iron Discipline, adds another +2 iron when you use it once per round. Mercs also cost you 1 less gold.',
    anchor: 'player-cards',
  },
  {
    kind: 'info',
    title: 'Round Goal',
    body: 'See the bar at the top? Each round has a goal — whoever leads it at the end gets +2 VP. The standings update live as you place dice. It\'s worth playing toward it, but don\'t sacrifice good positions just to chase the bonus.',
    anchor: 'goal-bar',
  },
  {
    kind: 'info',
    title: 'Fortresses',
    body: 'The orange strip shows all three fortresses: Black Citadel, Stormwall Keep, and Highspire. Right now they\'re all free. Holding a fortress earns +1 VP every round — but someone can usurp it if they beat your garrison value.',
    anchor: 'fortress-strip',
  },
  {
    kind: 'info',
    title: 'Threat Track',
    body: 'Top left — that\'s the threat track, currently at 0. It goes up every round, every battle, and every usurp. If it hits 7, Round 7 becomes a free-for-all: mercs are free, cards are half price, chaos ensues.',
    anchor: 'threat-bar',
  },

  // ── Round 1 ─────────────────────────────────────────────────────────────────
  {
    kind: 'place',
    title: 'Place your 2 in Marshlands',
    body: 'Marshlands needs a die showing 2 or lower — your 2 is a perfect fit. Click it in the action menu or tap the region on the map. Low-value regions are easy points early; save your big dice for where they matter.',
    anchor: 'action-menu',
    doneBody: 'Marshlands is yours. The Mages are up.',
    prescribed: { kind: 'place', regionId: 'marshlands' },
  },
  {
    kind: 'ai-turn',
    title: 'Mages move',
    body: 'They\'ve got a 5 and a 3, plus some gold and essence. Watch — they\'ll probably combine both dice to garrison Black Citadel. A combine stacks two dice into one placement, letting them hit high-requirement regions.',
  },
  {
    kind: 'place',
    title: 'Grab the Specialist merc',
    body: 'That Spec·6 in the merc bar is a hired die worth 6 — and it\'s yours for just 1 gold (Warriors get a discount). The Mages want it too. Hit "Hire specialist" before they get a turn.',
    anchor: 'merc-bar',
    doneBody: 'Got it. You now have two 6s to work with this round.',
    prescribed: { kind: 'hire-merc', mercSlot: 'specialist' },
  },
  {
    kind: 'ai-turn',
    title: 'Mages respond',
    body: 'They spent both barracks dice on Black Citadel and you took the Specialist, so they\'re limited. They might use an ability, draft a card, or just pass.',
  },
  {
    kind: 'place',
    title: 'Place your 6 in Goldhaven',
    body: 'Goldhaven needs ≥3 and pays 2 VP. Your 6 clears that easily. We\'re saving the combine (6+3=9) for Round 2 when it can lock down Stormwall Keep safely.',
    anchor: 'map',
    doneBody: 'Goldhaven secured — that\'s 2 VP.',
    prescribed: { kind: 'place', regionId: 'goldhaven', dieRange: '1-6' },
  },
  {
    kind: 'ai-turn',
    title: 'Mages\' last move',
    body: 'No dice left, no Specialist — they\'ll likely pass or play a card. Click Run to see what they do.',
  },
  {
    kind: 'place',
    title: 'Pass to end your turn',
    body: 'You\'ve placed two dice and hired a merc. Click Pass to signal you\'re done. Once both sides pass, the round ends and scoring fires.',
    anchor: 'action-menu',
    doneBody: 'Round 1 over. Time to score.',
    prescribed: { kind: 'pass' },
    skipIfRoundOver: true,
  },
  {
    kind: 'ai-turn',
    title: 'Round wraps up',
    body: 'Both players have passed. Click Run — the engine will confirm the round is over so we can move on to scoring.',
  },

  // ── End of Round 1 → Round 2 ────────────────────────────────────────────────
  {
    kind: 'end-of-round',
    title: 'Round 1 scoring',
    body: 'Scoring runs automatically: the round-goal leader gets +2 VP, fortress holders get +1 VP each, unused merc dice refund their cost. Watch the VP numbers tick up on the right.',
  },
  {
    kind: 'new-round',
    title: 'Round 2',
    body: 'Dice re-roll, a new goal drops in, and the Specialist countdown ticks down by 1. The threat track also nudged up — keep an eye on it as the game goes on.',
    anchor: 'threat-bar',
  },

  // ── Round 2 ─────────────────────────────────────────────────────────────────
  {
    kind: 'place',
    title: 'Garrison Stormwall Keep',
    body: 'Stormwall Keep needs a combined sum ≥7. Your 6+3=9 clears it and — crucially — the Mages can\'t top it. Their best combine this round maxes out at 8, so your garrison is safe. Click Stormwall Keep on the map.',
    anchor: 'fortress-strip',
    doneBody: 'Stormwall Keep is yours with a 9. Mages can\'t touch it.',
    prescribed: { kind: 'combine', regionId: 'stormwall-keep' },
  },
  {
    kind: 'ai-turn',
    title: 'Mages\' turn',
    body: 'No barracks dice but plenty of gold and essence. They\'ll probably hire the Specialist (now worth 5) and try to take Highspire. Click Run and watch.',
  },
  {
    kind: 'place',
    title: 'Use Iron Discipline',
    body: 'Active abilities refresh each round. Iron Discipline gives you +2 iron for free — no cost, no drawback. Click it. Iron fuels upgrades and structures later.',
    anchor: 'action-menu',
    doneBody: '+2 iron banked. Iron Discipline resets again next round.',
    prescribed: { kind: 'use-active' },
  },
  {
    kind: 'ai-turn',
    title: 'Mages place their merc',
    body: 'They\'ll put that hired die to work — probably Highspire. Worth noting: merc dice vanish at end of round, so whatever they garrison now they\'ll lose. Click Run.',
  },
  {
    kind: 'place',
    title: 'Pass to end Round 2',
    body: 'You\'re done — garrison\'s set, ability used. Pass, let the Mages finish, and we\'ll score.',
    anchor: 'action-menu',
    doneBody: 'Round 2 done.',
    prescribed: { kind: 'pass' },
    skipIfRoundOver: true,
  },
  {
    kind: 'ai-turn',
    title: 'Round 2 wraps up',
    body: 'Click Run to close the round. Any merc dice the Mages garrisoned will disappear — they don\'t carry over.',
  },
  {
    kind: 'end-of-round',
    title: 'Round 2 scoring',
    body: 'Same deal — round goal, fortress VP, threat tick. After this the game opens up: 5 more rounds, a potential free-for-all, and all your upgrades and cards to play with.',
  },

  // ── Finish ───────────────────────────────────────────────────────────────────
  {
    kind: 'finish',
    title: 'That\'s the game',
    body: 'You\'ve seen placements, combines, fortresses, mercs, an active ability, and how rounds score. Keep going with this game, start fresh with any faction, or run it again.',
  },
];

// ─── AI move narration ────────────────────────────────────────────────────────

function describeAIMove(move: Move, reasoning: AIReasoning, state: GameState, factionName: string): string {
  const top = reasoning.candidates[0];
  const reasonHint = (() => {
    if (!top) return '';
    const b = top.breakdown;
    const factors: string[] = [];
    if ((b.vpGain ?? 0) >= 1)              factors.push('VP-rich region');
    if ((b.roundGoalAlignment ?? 0) >= 0.6) factors.push('progresses the round goal');
    if ((b.denial ?? 0) >= 0.6)             factors.push('denies you territory');
    if ((b.factionTilt ?? 0) >= 1.4)        factors.push('strong faction synergy');
    if ((b.secretGoalAlignment ?? 0) >= 0.5) factors.push('matches a secret objective');
    return factors.length ? ` Why: ${factors.join(', ')}.` : '';
  })();

  switch (move.kind) {
    case 'place': {
      const region = state.regionDefs[move.regionId];
      const die = findDieById(state, move.dieId);
      const dieName = die ? DIE_NAMES[die.range] : 'a die';
      const face = die?.faceValue ?? '?';
      return `${factionName} placed their ${dieName} (face ${face}) at ${region?.name ?? move.regionId}.${reasonHint}`;
    }
    case 'combine': {
      const region = state.regionDefs[move.regionId];
      const a = findDieById(state, move.dieIds[0]);
      const b = findDieById(state, move.dieIds[1]);
      const sum = (a?.faceValue ?? 0) + (b?.faceValue ?? 0);
      return `${factionName} combined two dice (${a?.faceValue}+${b?.faceValue}=${sum}) into ${region?.name ?? move.regionId} — a big swing for a high-requirement region.${reasonHint}`;
    }
    case 'battle': {
      const region = state.regionDefs[move.targetRegionId];
      return `${factionName} launched an attack on ${region?.name ?? move.targetRegionId}! Watch for the result in the banner above.${reasonHint}`;
    }
    case 'hire-merc': {
      const slot = move.mercSlot;
      const slotName = slot === 'specialist' ? `Specialist (value ${state.mercs.specialistValue})` : slot === 'low' ? 'Low merc (1-3)' : 'High merc (3-6)';
      return `${factionName} hired the ${slotName}. Mercs are temporary dice they can deploy this round.${reasonHint}`;
    }
    case 'use-active': {
      const ab = FACTION_ABILITIES[state.players[state.activePlayerId]!.factionId];
      return `${factionName} used their active ability: ${ab?.activeLabel}. ${ab?.activeDescription}`;
    }
    case 'upgrade-die': {
      const die = findDieById(state, move.dieId);
      const next = die ? nextDieRange(die.range) : '?';
      return `${factionName} upgraded a die from ${die ? DIE_NAMES[die.range] : '?'} → ${next && next !== '?' ? DIE_NAMES[next as keyof typeof DIE_NAMES] : '?'}. Better range = more region options.${reasonHint}`;
    }
    case 'expand-barracks':
      return `${factionName} expanded their barracks (more dice next round).${reasonHint}`;
    case 'draft-card':
      return `${factionName} drafted a card from the market. They might play it later for a tactical edge.${reasonHint}`;
    case 'play-card':
      return `${factionName} played a card to manipulate the board.${reasonHint}`;
    case 'build-structure': {
      const region = state.regionDefs[move.regionId];
      return `${factionName} built a structure at ${region?.name ?? move.regionId} for permanent VP.${reasonHint}`;
    }
    case 'pass':
      return `${factionName} passed. They're saving resources or out of good moves.${reasonHint}`;
  }
}

// ─── Forced tutorial dice (per round, per player) ────────────────────────────

/** Force specific dice values for both players each round, so step instructions
 *  can reference concrete values AND the AI's moves are reproducible (given the
 *  fixed seed, deterministic AI scoring produces the same result every run). */
const TUTORIAL_DICE: Record<number, Record<string, number[]>> = {
  // Round 1
  1: {
    p1: [6, 3, 2],  // Warriors: 1-6→6, 1-3→3, 1-3→2
    p2: [5, 3],     // Mages:    1-6→5, 1-3→3
  },
  // Round 2 — Warriors placed (didn't garrison) in R1, so all 3 dice are back
  2: {
    p1: [6, 3, 2],  // Warriors: 1-6→6, 1-3→3, 1-3→2 (re-rolled fresh)
    p2: [4, 2],     // Mages:    1-6→4, 1-3→2 (Mages dice depend on R1 outcome)
  },
};

function applyForcedTutorialDice(state: GameState): GameState {
  const roundMap = TUTORIAL_DICE[state.round];
  if (!roundMap) return state;
  return produce(state, (draft) => {
    const tierOrder: Record<string, number> = { '1-6': 0, '3-6': 1, '2-5': 2, '1-3': 3 };
    for (const [pid, forced] of Object.entries(roundMap)) {
      const player = draft.players[pid];
      if (!player) continue;
      const barracksDice = player.dice
        .filter((d) => d.location.kind === 'barracks' && d.faceValue !== null && !d.mercSource)
        .sort((a, b) => (tierOrder[a.range] ?? 9) - (tierOrder[b.range] ?? 9));
      barracksDice.forEach((d, i) => {
        const v = forced[i];
        if (v != null) d.faceValue = v;
      });
    }
  });
}

function findDieById(state: GameState, id: string) {
  for (const p of Object.values(state.players)) {
    const d = p.dice.find((x) => x.id === id);
    if (d) return d;
  }
  return undefined;
}

/** Returns true if `move` satisfies a prescribed-move descriptor. */
function matchesPrescribed(move: Move, p: PrescribedMove, state?: GameState): boolean {
  if (move.kind !== p.kind) return false;
  if (p.kind === 'place' && move.kind === 'place') {
    if (move.regionId !== p.regionId) return false;
    // Optional die-range filter — e.g. only allow the 1-6 die in a given region
    if (p.dieRange && state) {
      const die = findDieById(state, move.dieId);
      if (die && die.range !== p.dieRange) return false;
    }
    return true;
  }
  if (p.kind === 'combine'  && move.kind === 'combine')  return move.regionId === p.regionId;
  if (p.kind === 'hire-merc' && move.kind === 'hire-merc') return move.mercSlot === p.mercSlot;
  return true; // use-active, pass — any such move qualifies
}

// ─── Splash ───────────────────────────────────────────────────────────────────

function TutorialSplash({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 animate-fade-in">
      <div className="mb-4 text-5xl">🎓</div>
      <h1 className="mb-2 text-3xl font-black text-white">Iron &amp; Ash Tutorial</h1>
      <p className="mb-2 max-w-md text-center text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
        Play two full rounds as <strong className="text-white">Warriors</strong> against a Mage AI.
        The dice are fixed so every step tells you exactly what to click — no guessing.
        After round 2, the game is yours to finish.
      </p>
      <p className="mb-8 text-center text-xs" style={{ color: 'var(--color-subtle)' }}>
        Hit Exit Tutorial anytime to jump straight into a real game.
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
          ▶ Start Tutorial
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

  const [started, setStarted]                 = useState(false);
  const [gameState, setGameState]             = useState<GameState | null>(null);
  const [rngSnapshot, setRngSnapshot]         = useState('');
  const [waitingForHuman, setWaitingForHuman] = useState(false);
  const [pendingMoves, setPendingMoves]       = useState<Move[]>([]);
  const [selectedDieId, setSelectedDieId]     = useState<string | null>(null);
  const [stepIdx, setStepIdx]                 = useState(0);
  const [stepDone, setStepDone]               = useState(false); // for 'place' steps — true once user has acted
  const [aiNarration, setAiNarration]         = useState<string | null>(null); // for 'ai-turn' steps after the move
  const [justRolled, setJustRolled]           = useState(false);
  const [freePlayMode, setFreePlayMode]       = useState(false); // after tutorial ends; user keeps playing
  const [freePlayAutoplay, setFreePlayAutoplay] = useState(false);
  const freePlayAutoplayRef = useRef(freePlayAutoplay);
  freePlayAutoplayRef.current = freePlayAutoplay;
  const [vpGains, setVpGains]                 = useState<Record<string, number>>({});

  useEffect(() => { if (!justRolled) return; const t = setTimeout(() => setJustRolled(false), 650); return () => clearTimeout(t); }, [justRolled]);
  useEffect(() => { if (!Object.keys(vpGains).length) return; const t = setTimeout(() => setVpGains({}), 1400); return () => clearTimeout(t); }, [vpGains]);

  const humanPid: PlayerId = 'p1';
  const structuresCtx = configs.structures.length ? { structures: configs.structures } : {};
  const step = STEPS[stepIdx]!;

  // Spotlight — hoisted before any conditional return to satisfy rules of hooks
  const anchor = step?.anchor ?? null;
  useEffect(() => {
    if (!anchor || !started) return;
    const el = document.querySelector(`[data-tour="${anchor}"]`);
    if (!el) return;
    el.classList.add('tutorial-spotlight');
    const rect = el.getBoundingClientRect();
    if (rect.top < 60 || rect.bottom > window.innerHeight - 60) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return () => { el.classList.remove('tutorial-spotlight'); };
  }, [anchor, started, stepIdx]);

  // ── Game lifecycle ─────────────────────────────────────────────────────────

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
    // Skip the initial roll phase so the first step shows ready-to-play state
    const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
    const afterRoll = rollPhase(state, { rng, cards: configs.cards });
    // Force the human's dice to known values so step instructions can name them
    const forced = applyForcedTutorialDice(afterRoll);
    setGameState(forced);
    setRngSnapshot(JSON.stringify(rng.snapshot()));
    setStarted(true);
    setStepIdx(0);
    setStepDone(false);
    setAiNarration(null);
    setJustRolled(true);
    // Enumerate from the FORCED state so the move list matches the visible dice.
    // (afterRoll has different face values — using it here would show moves based
    // on the original random roll, not the tutorial's pre-set [6,3,2] values.)
    if (forced.activePlayerId === humanPid) {
      const moves = enumerate(forced, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
      setWaitingForHuman(true);
      setPendingMoves(moves);
    }
  }

  function exitTutorial() {
    setStarted(false);
    setGameState(null);
    setStepIdx(0);
    setStepDone(false);
    setAiNarration(null);
    navigate('/play');
  }

  function restartTutorial() {
    setStarted(false);
    setGameState(null);
    setStepIdx(0);
    setStepDone(false);
    setAiNarration(null);
  }

  // ── Apply human move ───────────────────────────────────────────────────────

  function applyHumanMove(move: Move) {
    if (!gameState) return;
    // Only accept moves on 'place' steps — info, ai-turn etc. are read-only.
    if (step?.kind !== 'place') return;
    // If this step prescribes a specific move, silently reject anything else.
    // This prevents accidental clicks on the map or stale button state from
    // applying an off-script action.
    const prescribed = step?.prescribed;
    if (prescribed && !matchesPrescribed(move, prescribed, gameState)) return;
    const rng = Rng.fromSnapshot(JSON.parse(rngSnapshot));
    let state = apply(gameState, move, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });

    // Capture VP gain animation
    const gains: Record<string, number> = {};
    for (const [pid, np] of Object.entries(state.players)) {
      const pv = gameState.players[pid]?.vp ?? 0;
      if (np.vp > pv) gains[pid] = np.vp - pv;
    }
    if (Object.keys(gains).length) setVpGains(gains);

    setGameState(state);
    setRngSnapshot(JSON.stringify(rng.snapshot()));
    setWaitingForHuman(false);
    setPendingMoves([]);
    setSelectedDieId(null);

    // Mark 'place' step as done
    if (step?.kind === 'place') setStepDone(true);

    // If next active is still human and not round-over, queue moves
    if (state.activePlayerId === humanPid && state.phase === 'action' && !isRoundOver(state)) {
      const moves = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
      setWaitingForHuman(true);
      setPendingMoves(moves);
    }
  }

  // ── Run AI moves until human's turn OR round-over (for ai-turn steps) ──────

  function runOneAIStep() {
    if (!gameState) return;
    let state = gameState;
    const rng = Rng.fromSnapshot(JSON.parse(rngSnapshot));
    const narrations: string[] = [];

    // Loop through AI moves. Stops when:
    //  - It's the human's turn AND they haven't passed yet (waiting for human)
    //  - Round is over (everyone passed)
    //  - Game phase is finished or roll
    let safety = 30;
    while (state.phase === 'action' && !isRoundOver(state) && safety-- > 0) {
      // If it's the human's active turn AND they haven't passed, stop and wait
      if (state.activePlayerId === humanPid && !state.players[humanPid]?.passedThisRound) break;
      // Otherwise an AI is up (or human is auto-passed); pick and apply a move
      const result = pickMove(state, {
        rules: configs.rules, cards: configs.cards, costs: configs.costs,
        ...structuresCtx, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
        rng, difficulty: 'medium',
      });
      const factionName = factionLabel(state.players[state.activePlayerId]!.factionId);
      const before = state;
      state = apply(state, result.move, {
        rules: configs.rules, cards: configs.cards, costs: configs.costs,
        ...structuresCtx, rng,
      });
      // Only narrate AI moves (not auto-passes from already-passed players)
      if (before.activePlayerId !== humanPid) {
        narrations.push(describeAIMove(result.move, result.reasoning, state, factionName));
      }
    }

    // VP-gain animation
    const gains: Record<string, number> = {};
    for (const [pid, np] of Object.entries(state.players)) {
      const pv = gameState.players[pid]?.vp ?? 0;
      if (np.vp > pv) gains[pid] = np.vp - pv;
    }
    if (Object.keys(gains).length) setVpGains(gains);

    // Final narration block — every AI move strung together
    if (narrations.length > 0) setAiNarration(narrations.join('\n\n'));
    else if (isRoundOver(state)) setAiNarration('Everyone has passed — the round is over. Click Next →');
    else setAiNarration('The Mages had no moves to take.');

    setGameState(state);
    setRngSnapshot(JSON.stringify(rng.snapshot()));

    // If it's the human's turn next, set up their pending moves
    if (state.activePlayerId === humanPid && state.phase === 'action' && !isRoundOver(state) && !state.players[humanPid]?.passedThisRound) {
      const moves = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng: Rng.fromSnapshot(JSON.parse(JSON.stringify(rng.snapshot()))) });
      setWaitingForHuman(true);
      setPendingMoves(moves);
    }
  }

  // ── Run end-of-round transition (for 'end-of-round' steps) ─────────────────

  function runEndOfRound() {
    if (!gameState || !isRoundOver(gameState)) return;
    const rng = Rng.fromSnapshot(JSON.parse(rngSnapshot));
    const before = gameState;
    const state = endOfRound(gameState, {
      rules: configs.rules, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
      cardKeepCost: configs.costs.cardKeep, ...structuresCtx,
    });
    // VP-gain animation for round goal/fortress scoring
    const gains: Record<string, number> = {};
    for (const [pid, np] of Object.entries(state.players)) {
      const pv = before.players[pid]?.vp ?? 0;
      if (np.vp > pv) gains[pid] = np.vp - pv;
    }
    if (Object.keys(gains).length) setVpGains(gains);
    setGameState(state);
    setRngSnapshot(JSON.stringify(rng.snapshot()));
  }

  // ── Run roll phase (for 'new-round' steps) ─────────────────────────────────

  function runRollPhase() {
    if (!gameState || gameState.phase !== 'roll') return;
    const rng = Rng.fromSnapshot(JSON.parse(rngSnapshot));
    const rolled = rollPhase(gameState, { rng, cards: configs.cards });
    // Force tutorial dice for this round (if we have a forced set for it)
    const state = applyForcedTutorialDice(rolled);
    setGameState(state);
    setRngSnapshot(JSON.stringify(rng.snapshot()));
    setJustRolled(true);
    // Set up human turn if active
    if (state.activePlayerId === humanPid && state.phase === 'action') {
      const moves = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng: Rng.fromSnapshot(JSON.parse(JSON.stringify(rng.snapshot()))) });
      setWaitingForHuman(true);
      setPendingMoves(moves);
    }
  }

  function nextStep() {
    if (stepIdx >= STEPS.length - 1) return;
    setStepIdx((i) => i + 1);
    setStepDone(false);
    setAiNarration(null);
  }

  // Auto-trigger game transitions when entering end-of-round or new-round steps.
  // Also auto-completes 'place' steps flagged skipIfRoundOver when the round is
  // already over (prevents the "Pass your turn" step from getting stuck when the
  // player placed all dice naturally without an explicit pass).
  useEffect(() => {
    if (!started || !gameState) return;
    const s = STEPS[stepIdx];
    if (!s) return;
    // If a pass step is reached but the round already ended naturally, skip it.
    if (s.kind === 'place' && s.skipIfRoundOver && isRoundOver(gameState) && !stepDone) {
      setStepDone(true);
      return;
    }
    if (s.kind === 'end-of-round' && isRoundOver(gameState)) {
      runEndOfRound();
    }
    if (s.kind === 'new-round' && gameState.phase === 'roll') {
      runRollPhase();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, started]);

  // Free-play autoplay loop — runs after tutorial completes
  useEffect(() => {
    if (!freePlayMode || !freePlayAutoplay || !gameState) return;
    if (gameState.phase === 'finished') { setFreePlayAutoplay(false); return; }
    if (waitingForHuman) return;
    const id = window.setTimeout(() => {
      if (!freePlayAutoplayRef.current) return;
      // Step one game tick
      const rng = Rng.fromSnapshot(JSON.parse(rngSnapshot));
      let state = gameState;
      if (state.phase === 'roll') {
        state = rollPhase(state, { rng, cards: configs.cards });
        setJustRolled(true);
      } else if (isRoundOver(state)) {
        state = endOfRound(state, { rules: configs.rules, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals, cardKeepCost: configs.costs.cardKeep, ...structuresCtx });
      } else if (state.activePlayerId !== humanPid) {
        const result = pickMove(state, {
          rules: configs.rules, cards: configs.cards, costs: configs.costs,
          ...structuresCtx, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
          rng, difficulty: 'medium',
        });
        state = apply(state, result.move, {
          rules: configs.rules, cards: configs.cards, costs: configs.costs,
          ...structuresCtx, rng,
        });
      } else {
        // Human's turn — surface the action menu
        const moves = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, ...structuresCtx, rng });
        setWaitingForHuman(true);
        setPendingMoves(moves);
        return;
      }
      setGameState(state);
      setRngSnapshot(JSON.stringify(rng.snapshot()));
    }, 500);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, freePlayMode, freePlayAutoplay, waitingForHuman]);
  function prevStep() {
    if (stepIdx === 0) return;
    setStepIdx((i) => i - 1);
    setStepDone(false);
    setAiNarration(null);
  }

  if (!started) {
    return <TutorialSplash onStart={startGame} onSkip={exitTutorial} />;
  }
  if (!gameState) return null;

  const rules     = configs.rules;
  const pcKey     = String(gameState.turnOrder.length) as '2' | '3' | '4';
  const threshold = rules.threatTrackThresholdByPlayerCount?.[pcKey] ?? rules.threatTrackThreshold;
  const maxVP     = Math.max(...Object.values(gameState.players).map((p) => p?.vp ?? 0));

  // Whether the Next button should be enabled for the current step
  const canAdvance =
    step.kind === 'info'         ? true :
    step.kind === 'end-of-round' ? true :
    step.kind === 'new-round'    ? true :
    step.kind === 'finish'       ? false :
    step.kind === 'place'        ? stepDone :
    step.kind === 'ai-turn'      ? !!aiNarration :
    false;

  // Filter pending moves to only the prescribed move for this step.
  // Falls back to the full set if no prescription or nothing matches (safety).
  const visibleMoves = (() => {
    const p = step?.prescribed;
    if (!p || !waitingForHuman) return pendingMoves;
    const filtered = pendingMoves.filter((m) => matchesPrescribed(m, p, gameState));
    return filtered.length > 0 ? filtered : pendingMoves;
  })();

  return (
    <main className="relative min-h-screen animate-fade-in page-bg-dots pb-64" style={{ background: 'var(--color-bg)' }}>

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-black/80 px-4 py-2.5 backdrop-blur-xl">
        <div data-tour="threat-bar" className="rounded-lg p-1 -m-1">
          <ThreatBar track={gameState.threatTrack} threshold={threshold} />
        </div>
        <span className="text-sm font-bold text-white">
          Round <span className="text-purple-300">{gameState.round}</span>
          <span className="text-neutral-600">/{rules.totalRounds}</span>
        </span>
        <PhaseChip phase={gameState.phase} />

        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-md bg-purple-900/50 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-800/50">
            Tutorial · Step {stepIdx + 1}/{STEPS.length}
          </span>
          <button type="button" onClick={restartTutorial}
            className="rounded-lg border border-neutral-700 px-3 py-1 text-[10px] text-neutral-400 hover:text-neutral-200 transition">
            ⟳ Restart
          </button>
          <button type="button" onClick={exitTutorial}
            className="rounded-lg border border-red-700/50 bg-red-900/20 px-3 py-1 text-[10px] font-bold text-red-300 hover:bg-red-900/40 transition">
            ✕ Exit Tutorial
          </button>
        </div>
      </div>

      {/* ── Goal standings ── */}
      <GoalStandingsBar state={gameState} roundGoals={configs.roundGoals} />

      {/* ── Fortress strip ── */}
      <FortressStrip state={gameState} />

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
      </div>

      {/* ── Action banner — only visible on 'place' steps so info/ai-turn steps
           can't be skipped by accidentally making a move ── */}
      {waitingForHuman && step.kind === 'place' && !stepDone && (
        <div data-tour="action-menu" className="sticky top-[52px] z-10 mx-4 mt-3 rounded-2xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(20,184,166,0.12), rgba(6,182,212,0.08))',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(20,184,166,0.3)',
          }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black text-teal-300 uppercase tracking-wide">⚔ Your Turn — Warriors</span>
            {/* Lock badge — shown when the tutorial restricts available moves */}
            {step?.prescribed && (
              <span className="rounded-md bg-purple-900/60 px-2 py-0.5 text-[9px] font-bold text-purple-300 border border-purple-700/40">
                🔒 Tutorial locked
              </span>
            )}
          </div>
          {/* Pass visibleMoves (filtered to prescribed move) and suppress die selection
              so the player can't accidentally narrow to no valid moves */}
          <HumanActionMenu
            moves={visibleMoves}
            state={gameState}
            selectedDieId={step?.prescribed ? null : selectedDieId}
            onChoose={applyHumanMove}
            showPass={!step?.prescribed || step.prescribed.kind === 'pass'}
          />
        </div>
      )}

      {/* ── Map ── */}
      <div data-tour="map" className="px-4 pt-2 pb-4">
        <MapView
          state={gameState}
          humanMoves={waitingForHuman && step.kind === 'place' && !stepDone ? visibleMoves : []}
          selectedDieId={step?.prescribed ? null : selectedDieId}
          onRegionClick={(_id, moves) => {
            if (moves.length === 0) return;
            // In tutorial: moves is already filtered to the prescribed one by humanMoves.
            // In free-play: respect die selection as before.
            const filtered = (!step?.prescribed && selectedDieId)
              ? moves.filter((m) =>
                  (m.kind === 'place'   && m.dieId === selectedDieId) ||
                  (m.kind === 'combine' && (m.dieIds[0] === selectedDieId || m.dieIds[1] === selectedDieId)) ||
                  (m.kind === 'battle'  && m.attackerDieId === selectedDieId)
                )
              : moves;
            if (filtered.length >= 1) applyHumanMove(filtered[0]!);
          }}
        />
      </div>

      {/* ── End-game ── */}
      {gameState.phase === 'finished' && (
        <div className="mx-4 mt-4 rounded-2xl p-6 text-center" style={{ background: 'rgba(18,12,30,0.97)', border: '1px solid rgba(124,58,237,0.4)' }}>
          <div className="mb-2 text-3xl">🏁</div>
          <div className="text-xl font-black text-white">Tutorial Complete!</div>
          <div className="mt-1 text-sm text-neutral-400">{gameState.winnerId === humanPid ? 'You won! ' : ''}Ready to play a full game with any faction?</div>
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
          const isLeader = maxVP > 0 && player.vp === maxVP;
          const gain = vpGains[pid] ?? 0;
          return (
            <div key={pid}
              className={`relative w-56 shrink-0 rounded-2xl p-3 text-xs transition-all ${
                isHuman && waitingForHuman ? 'border border-teal-500/60 bg-teal-950/20'
                : isActive ? 'border border-purple-500/50 bg-purple-950/15'
                : 'glass border-transparent'}`}>
              <div className="mb-2.5 flex items-center gap-2">
                <div className="group relative shrink-0">
                  <FactionEmblem factionId={player.factionId} size={34} className="rounded-xl" />
                  {isActive && !waitingForHuman && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-purple-400 ring-2 ring-neutral-950 animate-pulse" />
                  )}
                  <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 w-52 rounded-2xl p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ background: 'rgba(12,8,22,0.97)', border: '1px solid rgba(124,58,237,0.3)' }}>
                    <div className="mb-1 text-[10px] font-black text-purple-300 uppercase tracking-wide">{ab?.activeLabel}</div>
                    <div className="text-[10px] leading-relaxed text-neutral-400">{ab?.activeDescription}</div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1">
                    <span className="text-[11px] font-bold text-neutral-100 truncate">{factionLabel(player.factionId)}</span>
                    {isHuman && <span className="shrink-0 rounded-md bg-teal-600 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide">YOU</span>}
                  </div>
                  <div className="text-[9px] text-neutral-600">{barracksDice.length}d ready · {player.dice.filter(d => d.location.kind === 'region').length}p</div>
                </div>
                <div className="relative shrink-0">
                  <VPMedallion vp={player.vp} isLeader={isLeader} size="md" />
                  {gain > 0 && (
                    <div key={player.vp} className="vp-float absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-black text-emerald-400 whitespace-nowrap" style={{ textShadow: '0 0 8px rgba(52,211,153,0.6)' }}>
                      +{gain} VP
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
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Free-play mode banner + autoplay controls (after tutorial ends) ── */}
      {freePlayMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:left-52" style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(9,9,11,0.92) 25%)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
        }}>
          <div className="mx-auto max-w-3xl px-4 pb-3 pt-6">
            <div className="rounded-2xl p-3 flex items-center gap-3"
              style={{ background: 'rgba(18,12,30,0.97)', border: '1px solid rgba(20,184,166,0.3)' }}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-teal-300">Free Play · Tutorial Ended</span>
              <span className="text-[11px] text-neutral-400 flex-1">Continue this game on your own. Round {gameState.round}/{rules.totalRounds}.</span>
              <button type="button" onClick={() => setFreePlayAutoplay((p) => !p)}
                disabled={gameState.phase === 'finished'}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition ${freePlayAutoplay ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-purple-600 text-white hover:bg-purple-500'} disabled:opacity-40`}>
                {freePlayAutoplay ? '⏸ Pause' : '▶ Auto'}
              </button>
              <button type="button" onClick={() => navigate('/play')}
                className="rounded-lg border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition">
                Start new game →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tutorial step panel (fixed bottom) ── */}
      {!freePlayMode && (
        <TutorialStepPanel
          step={step}
          stepIdx={stepIdx}
          totalSteps={STEPS.length}
          aiNarration={aiNarration}
          canAdvance={canAdvance}
          stepDone={stepDone}
          onNext={() => {
            if (step.kind === 'ai-turn' && !aiNarration) { runOneAIStep(); return; }
            nextStep();
          }}
          onBack={prevStep}
          onPlayGame={() => navigate('/play')}
          onReplay={restartTutorial}
          onContinueFreePlay={() => { setFreePlayMode(true); setFreePlayAutoplay(true); }}
        />
      )}
    </main>
  );
}

// ─── Tutorial step panel ──────────────────────────────────────────────────────

function TutorialStepPanel({
  step, stepIdx, totalSteps, aiNarration, canAdvance, stepDone,
  onNext, onBack, onPlayGame, onReplay, onContinueFreePlay,
}: {
  step: Step;
  stepIdx: number;
  totalSteps: number;
  aiNarration: string | null;
  canAdvance: boolean;
  stepDone: boolean;
  onNext: () => void;
  onBack: () => void;
  onPlayGame: () => void;
  onReplay: () => void;
  onContinueFreePlay: () => void;
}) {
  // Body to show: doneBody for completed 'place' steps, aiNarration for ai-turn after move
  let displayBody = step.body;
  if (step.kind === 'place' && stepDone && step.doneBody) displayBody = step.doneBody;
  if (step.kind === 'ai-turn' && aiNarration) displayBody = aiNarration;

  // Button label
  let nextLabel = 'Next →';
  if (step.kind === 'ai-turn' && !aiNarration) nextLabel = '▶ Run AI Turn';
  if (step.kind === 'place' && !stepDone) nextLabel = 'Waiting for your move…';
  if (step.kind === 'finish') nextLabel = '';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:left-52" style={{
      background: 'linear-gradient(180deg, transparent 0%, rgba(9,9,11,0.92) 25%)',
      paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
    }}>
      <div className="mx-auto max-w-3xl px-4 pb-3 pt-6">
        {/* Progress dots */}
        <div className="mb-3 flex items-center gap-1.5 justify-center">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="rounded-full transition-all" style={{
              width: i === stepIdx ? 20 : 6,
              height: 6,
              background: i === stepIdx ? '#7c3aed' : i < stepIdx ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)',
            }} />
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl p-4" style={{
          background: 'rgba(18,12,30,0.97)',
          border: '1px solid rgba(124,58,237,0.25)',
          boxShadow: '0 -8px 48px rgba(0,0,0,0.5), 0 0 60px rgba(124,58,237,0.08)',
        }}>
          <div className="mb-1.5 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
              Step {stepIdx + 1} of {totalSteps}
            </div>
            {step.kind === 'place' && stepDone && (
              <div className="text-[10px] font-bold text-emerald-400">✓ Move accepted</div>
            )}
            {step.kind === 'ai-turn' && aiNarration && (
              <div className="text-[10px] font-bold text-purple-300">AI moved</div>
            )}
          </div>
          <div className="mb-2 text-base font-black text-white">{step.title}</div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>{displayBody}</p>

          {step.kind === 'finish' ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button type="button" onClick={onContinueFreePlay}
                className="rounded-xl py-2.5 text-xs font-bold text-white transition hover:brightness-110"
                style={{ background: 'linear-gradient(135deg,#0d9488,#06b6d4)', boxShadow: '0 0 16px rgba(20,184,166,0.25)' }}>
                ▶ Continue This Game
              </button>
              <button type="button" onClick={onPlayGame}
                className="rounded-xl py-2.5 text-xs font-bold text-white transition hover:brightness-110"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                New Game
              </button>
              <button type="button" onClick={onReplay}
                className="rounded-xl border border-neutral-700 py-2.5 text-xs font-semibold text-neutral-300 transition hover:bg-neutral-800">
                ⟳ Replay Tutorial
              </button>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <button type="button" onClick={onBack} disabled={stepIdx === 0}
                className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-400 transition hover:bg-neutral-800 disabled:opacity-30">
                ← Back
              </button>
              <button type="button" onClick={onNext} disabled={!canAdvance && step.kind !== 'ai-turn'}
                className="flex-1 rounded-xl py-2 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: step.kind === 'ai-turn' && !aiNarration ? 'linear-gradient(135deg,#7c3aed,#06b6d4)' : 'rgba(124,58,237,0.8)' }}>
                {nextLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inline human action menu (simplified from PlayPage) ──────────────────────

function HumanActionMenu({ moves, state, selectedDieId, onChoose, showPass = true }: {
  moves: Move[]; state: GameState; selectedDieId?: string | null;
  onChoose: (m: Move) => void;
  /** Hide the pass button when the tutorial prescribes a non-pass action. */
  showPass?: boolean;
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
      {showPass && (
        <button type="button" onClick={() => onChoose({ kind: 'pass' })}
          className="rounded-lg border border-neutral-700 bg-neutral-900/50 px-4 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition">
          ⏸ Pass (end turn)
        </button>
      )}
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
    case 'upgrade-die': { const d = player.dice.find((x) => x.id === move.dieId); const r = d?.range ?? '1-3'; const nr = nextDieRange(r); return <span>↑ {DIE_NAMES[r]} → {nr ? DIE_NAMES[nr] : nr}</span>; }
    case 'expand-barracks': return <span>+ Barracks ({player.dice.length}/{player.barracksMax})</span>;
    case 'build-structure': { const r = state.regionDefs[move.regionId]; return <span>🏗 {move.structureId.replace(/-/g,' ')} @ {r?.name}</span>; }
    case 'pass': return <span>Pass</span>;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
