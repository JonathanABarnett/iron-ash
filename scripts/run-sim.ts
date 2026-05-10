// Phase 2 sim runner: random AI, full scoring, end-game winners.
// Validates that engine + config + RNG wire up end-to-end. Replaced in Phase 4
// by src/simulation/runner.ts (proper batch runner with stats).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGame } from '../src/engine/setup';
import { Rng } from '../src/engine/rng';
import { apply } from '../src/engine/moves';
import { endOfRound, isRoundOver, rollPhase } from '../src/engine/rounds';
import { pickMove } from '../src/ai/decide';
import type { Difficulty } from '../src/ai/types';
import {
  parseCards,
  parseFactions,
  parseRegions,
  parseRoundGoals,
  parseRules,
  parseSecretGoals,
} from '../src/engine/config-loader';
import type { FactionId, GameState } from '../src/engine/types';

interface CliFlags {
  games: number;
  debug: boolean;
  seed: string;
  difficulty: Difficulty;
}

function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = {
    games: 1,
    debug: false,
    seed: 'sim-default',
    difficulty: 'medium',
  };
  for (const arg of argv) {
    const [key, val] = arg.split('=');
    if (key === '--games' && val) flags.games = Number(val);
    else if (key === '--seed' && val) flags.seed = val;
    else if (arg === '--debug') flags.debug = true;
    else if (key === '--difficulty' && val) {
      if (val === 'easy' || val === 'medium' || val === 'hard') flags.difficulty = val;
      else throw new Error(`--difficulty must be easy|medium|hard (got ${val})`);
    }
  }
  return flags;
}

function loadConfigs() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '..');
  const factions = parseFactions(
    JSON.parse(readFileSync(resolve(root, 'config/factions.json'), 'utf8')),
  );
  const regions = parseRegions(
    JSON.parse(readFileSync(resolve(root, 'config/regions.json'), 'utf8')),
  );
  const rules = parseRules(
    JSON.parse(readFileSync(resolve(root, 'config/rules.json'), 'utf8')),
  );
  const roundGoals = parseRoundGoals(
    JSON.parse(readFileSync(resolve(root, 'config/round-goals.json'), 'utf8')),
  );
  const secretGoals = parseSecretGoals(
    JSON.parse(readFileSync(resolve(root, 'config/secret-goals.json'), 'utf8')),
  );
  const cards = parseCards(
    JSON.parse(readFileSync(resolve(root, 'config/cards.json'), 'utf8')),
  );
  return { factions, regions, rules, roundGoals, secretGoals, cards };
}

function chooseLineup(allFactionIds: FactionId[], rng: Rng): FactionId[] {
  const shuffled = rng.shuffle(allFactionIds);
  const count = rng.nextInt(2, 4);
  return shuffled.slice(0, count);
}

function runGame(
  seed: string,
  configs: ReturnType<typeof loadConfigs>,
  difficulty: Difficulty,
): GameState {
  const { factions, regions, rules, roundGoals, secretGoals, cards } = configs;
  const setupRng = new Rng(`${seed}-lineup`);
  const lineup = chooseLineup(
    factions.map((f) => f.id),
    setupRng,
  );
  let state = createGame({
    seed,
    players: lineup.map((factionId, i) => ({
      id: `p${i + 1}`,
      factionId,
      isAI: true,
    })),
    regions,
    factions,
    rules,
    roundGoals,
    secretGoals,
  });

  const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
  let totalTurns = 0;
  const TURN_BUDGET = 20000;

  while (state.phase !== 'finished' && totalTurns < TURN_BUDGET) {
    if (state.phase === 'roll') {
      state = rollPhase(state, { rng, cards });
      continue;
    }
    if (isRoundOver(state)) {
      state = endOfRound(state, { rules, roundGoals, secretGoals });
      continue;
    }
    const { move } = pickMove(state, {
      rules,
      cards,
      roundGoals,
      secretGoals,
      rng,
      difficulty,
    });
    state = apply(state, move, { rules, cards, rng });
    totalTurns += 1;
  }
  if (state.phase !== 'finished') {
    throw new Error(`Game did not finish within ${TURN_BUDGET} turns (seed=${seed})`);
  }
  return state;
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const configs = loadConfigs();
  const { games, seed, debug, difficulty } = flags;

  console.log(
    `[iron-ash] Running ${games} game${games === 1 ? '' : 's'} (difficulty=${difficulty}) with seed prefix "${seed}"`,
  );

  const startedAt = Date.now();
  const factionAppearances = new Map<FactionId, number>();
  const factionWins = new Map<FactionId, number>();
  let totalRoundsPlayed = 0;
  let placeMoves = 0;
  let combineMoves = 0;
  let passMoves = 0;
  let hireMoves = 0;
  let draftMoves = 0;
  let playMoves = 0;
  let battleMoves = 0;
  let totalVp = 0;

  for (let i = 0; i < games; i++) {
    const gameSeed = `${seed}-${i.toString(16)}`;
    const final = runGame(gameSeed, configs, difficulty);
    totalRoundsPlayed += final.round;
    for (const p of Object.values(final.players)) {
      factionAppearances.set(
        p.factionId,
        (factionAppearances.get(p.factionId) ?? 0) + 1,
      );
      totalVp += p.vp;
    }
    if (final.winnerId) {
      const winnerFaction = final.players[final.winnerId]!.factionId;
      factionWins.set(winnerFaction, (factionWins.get(winnerFaction) ?? 0) + 1);
    }
    for (const entry of final.log) {
      if (entry.event.kind === 'move') {
        if (entry.event.move.kind === 'place') placeMoves += 1;
        else if (entry.event.move.kind === 'combine') combineMoves += 1;
        else if (entry.event.move.kind === 'pass') passMoves += 1;
        else if (entry.event.move.kind === 'hire-merc') hireMoves += 1;
        else if (entry.event.move.kind === 'draft-card') draftMoves += 1;
        else if (entry.event.move.kind === 'play-card') playMoves += 1;
        else if (entry.event.move.kind === 'battle') battleMoves += 1;
      }
    }
    if (debug && i === 0) {
      console.log(`\n--- Game 0 log (truncated to last 20 entries) ---`);
      for (const entry of final.log.slice(-20)) {
        console.log(JSON.stringify(entry));
      }
      console.log(`--- end log; total entries: ${final.log.length} ---`);
      console.log(
        `Winner: ${final.winnerId} — VP totals: ${Object.values(final.players)
          .map((p) => `${p.id}(${p.factionId})=${p.vp}`)
          .join('  ')}\n`,
      );
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[iron-ash] Done. ${games} games in ${elapsedMs}ms (${(games / Math.max(1, elapsedMs / 1000)).toFixed(1)} games/sec)`,
  );
  console.log(`  rounds total:   ${totalRoundsPlayed}`);
  console.log(
    `  moves:          place=${placeMoves}  combine=${combineMoves}  pass=${passMoves}  hire=${hireMoves}  draft=${draftMoves}  play=${playMoves}  battle=${battleMoves}`,
  );
  console.log(`  avg VP/player:  ${(totalVp / Math.max(1, [...factionAppearances.values()].reduce((a, b) => a + b, 0))).toFixed(1)}`);
  console.log(
    `  faction picks:  ${[...factionAppearances.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`,
  );
  console.log(
    `  faction wins:   ${[...factionWins.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`,
  );
}

main();
