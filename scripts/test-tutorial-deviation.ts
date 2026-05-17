// Verify the tutorial is RESILIENT to user deviation.
// If the user does something different than suggested at each step, do all
// remaining steps still complete (engine state stays valid, AI keeps playing,
// round transitions still fire)?

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { produce } from 'immer';
import {
  parseCards, parseCosts, parseFactions, parseRegions,
  parseRoundGoals, parseRules, parseSecretGoals, parseStructures,
} from '../src/engine/config-loader';
import { createGame } from '../src/engine/setup';
import { Rng } from '../src/engine/rng';
import { rollPhase, endOfRound, isRoundOver } from '../src/engine/rounds';
import { apply, enumerate } from '../src/engine/moves';
import { pickMove } from '../src/ai/decide';
import type { GameState, Move, PlayerId } from '../src/engine/types';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const r = (f: string) => JSON.parse(readFileSync(resolve(root, f), 'utf8'));
const configs = {
  factions: parseFactions(r('config/factions.json')),
  regions:  parseRegions(r('config/regions.json')),
  rules:    parseRules(r('config/rules.json')),
  roundGoals: parseRoundGoals(r('config/round-goals.json')),
  secretGoals: parseSecretGoals(r('config/secret-goals.json')),
  cards:    parseCards(r('config/cards.json')),
  costs:    parseCosts(r('config/costs.json')),
  structures: parseStructures(r('config/structures.json')),
};

const TUTORIAL_DICE: Record<number, Record<string, number[]>> = {
  1: { p1: [6, 3, 2], p2: [5, 3] },
  2: { p1: [6, 3, 2], p2: [4, 2] },
};

function applyForcedDice(state: GameState): GameState {
  const map = TUTORIAL_DICE[state.round];
  if (!map) return state;
  return produce(state, (draft) => {
    const tierOrder: Record<string, number> = { '1-6': 0, '3-6': 1, '2-5': 2, '1-3': 3 };
    for (const [pid, forced] of Object.entries(map)) {
      const p = draft.players[pid]; if (!p) continue;
      const dice = p.dice
        .filter((d) => d.location.kind === 'barracks' && d.faceValue !== null && !d.mercSource)
        .sort((a, b) => (tierOrder[a.range] ?? 9) - (tierOrder[b.range] ?? 9));
      dice.forEach((d, i) => { const v = forced[i]; if (v != null) d.faceValue = v; });
    }
  });
}

const HUMAN: PlayerId = 'p1';

function applyUserMove(state: GameState, rng: Rng, move: Move): GameState {
  return apply(state, move, {
    rules: configs.rules, cards: configs.cards, costs: configs.costs,
    structures: configs.structures, rng,
  });
}

function runAIUntilHumanOrRoundEnd(state: GameState, rng: Rng): GameState {
  let safety = 30;
  while (state.phase === 'action' && !isRoundOver(state) && safety-- > 0) {
    if (state.activePlayerId === HUMAN && !state.players[HUMAN]?.passedThisRound) break;
    const result = pickMove(state, {
      rules: configs.rules, cards: configs.cards, costs: configs.costs,
      structures: configs.structures, roundGoals: configs.roundGoals,
      secretGoals: configs.secretGoals, rng, difficulty: 'medium',
    });
    state = apply(state, result.move, {
      rules: configs.rules, cards: configs.cards, costs: configs.costs,
      structures: configs.structures, rng,
    });
  }
  return state;
}

function nextRound(state: GameState, rng: Rng): GameState {
  if (isRoundOver(state)) {
    state = endOfRound(state, {
      rules: configs.rules, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
      cardKeepCost: configs.costs.cardKeep, structures: configs.structures,
    });
  }
  if (state.phase === 'roll') {
    state = rollPhase(state, { rng, cards: configs.cards });
    state = applyForcedDice(state);
  }
  return state;
}

function start(): { state: GameState; rng: Rng } {
  const init = createGame({
    seed: 'tutorial-interactive',
    players: [
      { id: 'p1', factionId: 'warriors', isAI: false },
      { id: 'p2', factionId: 'mages',    isAI: true  },
    ],
    regions: configs.regions, factions: configs.factions, rules: configs.rules,
    roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
  });
  const rng = Rng.fromSnapshot(JSON.parse(init.rngState));
  const rolled = rollPhase(init, { rng, cards: configs.cards });
  return { state: applyForcedDice(rolled), rng };
}

/** Pick any legal action that isn't pass (to actively deviate). Falls back to pass. */
function pickAnyAction(state: GameState, rng: Rng): Move {
  const moves = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, structures: configs.structures, rng });
  const nonPass = moves.filter((m) => m.kind !== 'pass');
  return nonPass.length > 0 ? nonPass[0]! : { kind: 'pass' };
}

// ─── Run the tutorial but the user always picks the FIRST non-pass action ─

console.log('\n  TUTORIAL DEVIATION TEST — user picks any non-pass action');
console.log('  (Verifies any-action failsafe keeps tutorial progressing)\n');

let { state, rng } = start();
let stepsCompleted = 0;
let errors: string[] = [];

const userSteps = [
  { name: 'R1 Place 1', shouldPass: false },
  { name: 'R1 Action 2', shouldPass: false },
  { name: 'R1 Action 3', shouldPass: false },
  { name: 'R1 Final', shouldPass: true },  // step 13 — pass
];
const r2UserSteps = [
  { name: 'R2 Action 1', shouldPass: false },
  { name: 'R2 Action 2', shouldPass: false },
  { name: 'R2 Final', shouldPass: true },  // step 21 — pass
];

function safelyAttempt(label: string, fn: () => void) {
  try { fn(); stepsCompleted++; console.log(`  ✓ ${label}`); }
  catch (e) { errors.push(`${label}: ${(e as Error).message}`); console.log(`  ✗ ${label}: ${(e as Error).message}`); }
}

// Round 1
for (const step of userSteps) {
  safelyAttempt(`User ${step.name}`, () => {
    const move = step.shouldPass ? { kind: 'pass' as const } : pickAnyAction(state, rng);
    state = applyUserMove(state, rng, move);
  });
  safelyAttempt(`AI auto-loop after ${step.name}`, () => {
    state = runAIUntilHumanOrRoundEnd(state, rng);
  });
}

safelyAttempt('End of Round 1 transition', () => {
  state = nextRound(state, rng);
  if (state.round !== 2) throw new Error(`expected round 2, got ${state.round}`);
});

// Round 2
for (const step of r2UserSteps) {
  safelyAttempt(`User ${step.name}`, () => {
    const move = step.shouldPass ? { kind: 'pass' as const } : pickAnyAction(state, rng);
    state = applyUserMove(state, rng, move);
  });
  safelyAttempt(`AI auto-loop after ${step.name}`, () => {
    state = runAIUntilHumanOrRoundEnd(state, rng);
  });
}

safelyAttempt('End of Round 2 transition', () => {
  state = nextRound(state, rng);
  if (state.round !== 3) throw new Error(`expected round 3, got ${state.round}`);
});

console.log(`\n  Completed: ${stepsCompleted}/15 steps`);
console.log(`  Final: round ${state.round}, p1=${state.players.p1?.vp}VP p2=${state.players.p2?.vp}VP`);
if (errors.length === 0) {
  console.log(`  ✓ DEVIATION RESILIENT — every user action advanced; tutorial reached free-play\n`);
} else {
  console.log(`  ✗ ${errors.length} FAILURE(S):`);
  errors.forEach((e) => console.log(`    - ${e}`));
  process.exit(1);
}
