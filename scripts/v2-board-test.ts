// ─── v2 prototype validation ─────────────────────────────────────────────────
// Answers the core design questions BEFORE we build any UI:
//   1. Does the player-count-scaled board have sane topology?
//   2. Do armies actually COLLIDE? (v1's fatal flaw was that they didn't.)
//   3. Does combat produce dramatic, non-deterministic outcomes?
//
// Run:  npx tsx scripts/v2-board-test.ts

import { generateBoard, territoryList, graphDistance, type BoardV2 } from '../src/v2/board';
import { resolveBattle, describeBattle } from '../src/v2/combat';
import { Rng } from '../src/engine/rng';

function hr(label: string) {
  console.log('\n' + '─'.repeat(74));
  console.log('  ' + label);
  console.log('─'.repeat(74));
}

// ─── 1. Topology report ───────────────────────────────────────────────────────

hr('1. BOARD TOPOLOGY (3N + 1 scaling)');

for (const N of [2, 3, 4]) {
  const board = generateBoard(N, 'demo');
  const list = territoryList(board);
  const byRole = (role: string) => list.filter((t) => t.role === role).length;
  const avgDegree = (list.reduce((s, t) => s + t.adjacency.length, 0) / list.length).toFixed(1);

  // distance from each home to the centre, and between adjacent homes
  const homeToCenter = board.homeIds.map((h) => graphDistance(board, h, board.centerId));
  const homeToHome: number[] = [];
  for (let i = 0; i < board.homeIds.length; i++) {
    for (let j = i + 1; j < board.homeIds.length; j++) {
      homeToHome.push(graphDistance(board, board.homeIds[i]!, board.homeIds[j]!));
    }
  }

  console.log(`\n  ${N} players → ${list.length} territories (expected ${3 * N + 1})`);
  console.log(`    roles: ${byRole('home')} home · ${byRole('choke')} choke · ${byRole('border')} border · ${byRole('center')} center`);
  console.log(`    avg connections/territory: ${avgDegree}`);
  console.log(`    home→center distance: ${homeToCenter.join(', ')} edges`);
  console.log(`    home→home distance:   min ${Math.min(...homeToHome)}, max ${Math.max(...homeToHome)} edges`);
}

// ─── 2. Collision simulation ──────────────────────────────────────────────────
// Greedy AI: each round every player marches a force from one held territory
// into an adjacent one, preferring moves that (a) attack an enemy or (b) step
// closer to the centre. We count how many BATTLES occur per game.

interface Occupancy { owner: number; dice: number[] }

function rollForce(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.nextInt(1, 6));
}

function simulateGame(board: BoardV2, seed: string): { battles: number; centerFlips: number } {
  const rng = new Rng(seed);
  const occ: Record<string, Occupancy> = {};
  // Each player starts holding their home with a 3-die garrison.
  board.homeIds.forEach((h, i) => { occ[h] = { owner: i, dice: rollForce(rng, 3) }; });

  let battles = 0;
  let centerFlips = 0;
  let lastCenterOwner = -1;
  const ROUNDS = 7;

  for (let round = 0; round < ROUNDS; round++) {
    for (let p = 0; p < board.playerCount; p++) {
      // Territories this player holds with ≥2 dice (keep 1 behind to hold).
      const sources = Object.entries(occ).filter(([, o]) => o.owner === p && o.dice.length >= 2);
      if (sources.length === 0) continue;

      // Pick the source + adjacent target that best advances toward the centre
      // or lands on an enemy.
      let best: { from: string; to: string; score: number } | null = null;
      for (const [fromId] of sources) {
        for (const toId of board.territories[fromId]!.adjacency) {
          const target = occ[toId];
          const enemy = target && target.owner !== p;
          const closer = graphDistance(board, toId, board.centerId) < graphDistance(board, fromId, board.centerId);
          const score = (enemy ? 3 : 0) + (closer ? 1 : 0) + (toId === board.centerId ? 2 : 0);
          if (score > 0 && (!best || score > best.score)) best = { from: fromId, to: toId, score };
        }
      }
      if (!best) continue;

      // March half the force (at least 1, leave at least 1 behind).
      const src = occ[best.from]!;
      const moveCount = Math.max(1, Math.floor(src.dice.length / 2));
      const moving = src.dice.slice(0, moveCount);
      src.dice = src.dice.slice(moveCount);
      if (src.dice.length === 0) delete occ[best.from];

      const target = occ[best.to];
      if (!target) {
        // Unoccupied — walk in.
        occ[best.to] = { owner: p, dice: moving };
      } else if (target.owner === p) {
        // Reinforce.
        target.dice.push(...moving);
      } else {
        // BATTLE.
        battles++;
        const r = resolveBattle({ dice: moving }, { dice: target.dice }, board.territories[best.to]!.defenseBonus);
        if (r.territoryCaptured) {
          occ[best.to] = { owner: p, dice: r.attackerSurviving };
          if (occ[best.to]!.dice.length === 0) delete occ[best.to];
        } else {
          target.dice = r.defenderSurviving;
          if (target.dice.length === 0) delete occ[best.to];
        }
      }

      // Track centre ownership changes.
      const centerOwner = occ[board.centerId]?.owner ?? -1;
      if (centerOwner !== lastCenterOwner && centerOwner !== -1) { centerFlips++; lastCenterOwner = centerOwner; }
    }

    // End of round: each held territory's garrison gets fresh dice (income).
    for (const [id, o] of Object.entries(occ)) {
      const inc = board.territories[id]!.income;
      o.dice.push(...rollForce(rng, Math.max(1, Math.floor(inc))));
    }
  }

  return { battles, centerFlips };
}

hr('2. COLLISION SIM (200 games each · do armies actually meet?)');

for (const N of [2, 3, 4]) {
  const board = generateBoard(N, 'demo');
  let totalBattles = 0, totalFlips = 0, zeroBattleGames = 0;
  const GAMES = 200;
  for (let g = 0; g < GAMES; g++) {
    const r = simulateGame(board, `collide-${N}-${g}`);
    totalBattles += r.battles;
    totalFlips += r.centerFlips;
    if (r.battles === 0) zeroBattleGames++;
  }
  console.log(`\n  ${N} players:`);
  console.log(`    avg battles/game:        ${(totalBattles / GAMES).toFixed(1)}`);
  console.log(`    avg centre flips/game:   ${(totalFlips / GAMES).toFixed(1)}`);
  console.log(`    games with ZERO battles: ${zeroBattleGames}/${GAMES}  ${zeroBattleGames === 0 ? '✓' : zeroBattleGames < GAMES * 0.1 ? '~' : '✗ (armies not meeting!)'}`);
}

// ─── 3. Combat drama samples ───────────────────────────────────────────────────

hr('3. COMBAT SAMPLES (does rolling for territory feel dramatic?)');

const rng = new Rng('combat-samples');
console.log();
for (let i = 0; i < 6; i++) {
  const atkCount = rng.nextInt(2, 4);
  const defCount = rng.nextInt(1, 3);
  const atk = { dice: Array.from({ length: atkCount }, () => rng.nextInt(1, 6)) };
  const def = { dice: Array.from({ length: defCount }, () => rng.nextInt(1, 6)) };
  const defBonus = rng.pick([0, 1, 2, 3] as const);
  const r = resolveBattle(atk, def, defBonus);
  console.log(`  atk[${atk.dice.join(',')}] vs def[${def.dice.join(',')}] +${defBonus}`);
  console.log(`    → ${describeBattle(r, 'Warriors', 'Mages', 'Stormwall Pass')}\n`);
}

console.log('─'.repeat(74));
console.log('  v2 prototype validation complete.\n');
