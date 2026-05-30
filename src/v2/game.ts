// ─── Iron & Ash v2 — lean game model ─────────────────────────────────────────
//
// The renewable-dice / single-comparison / ~6-round loop. Pure rules; no UI,
// no AI (the sim/UI drive it). Target weight: 45 min (2p) → 90 min (4p).
//
// ROUND
//   1. roll — every player rolls their hand (pool → known values)
//   2. deploy — players commit rolled dice onto reachable territories
//   3. resolve — each contested territory resolves in ONE comparison
//   4. score — VP for territories held (home doesn't score → you must push out)
//   dice return to the pool; repeat for ROUNDS rounds, then most VP wins.

import { Rng } from '../engine/rng';
import { generateBoard, type BoardV2 } from './board';
import { makeUnits, poolFromRanges, rollPool, type RolledDie, type Unit } from './units';
import { resolveContest } from './combat';
import { assignObjectives } from './objectives';
import { FACTIONS, valueOf, combatBonus, defenseBonusFor, attackBonus, type FactionId, type Spoil } from './factions';

export const ROUNDS = 6;

// Diagnostic / balance-tuning switch. When off, every faction signature ability
// is neutralised (combat bonuses → 0, Coffers/Soul-Harvest/Arcane-Focus inert)
// so a sim can measure how much of the win-rate spread is ability-driven vs
// pool/board-driven. Production play always leaves this ON; only the balance
// scripts flip it. Module-level (not per-game) — the scripts run sequentially.
let ABILITIES_ENABLED = true;
export function setAbilitiesEnabled(on: boolean): void { ABILITIES_ENABLED = on; }
export function abilitiesEnabled(): boolean { return ABILITIES_ENABLED; }

export interface PlayerStats {
  /** Contested territories this player won (won a fight, not a walk-in). */
  contestsWon: number;
  /** Fortresses/passes/throne captured FROM a rival. */
  strongpointsCaptured: number;
}

export interface PlayerV2 {
  id: number;
  faction: FactionId;     // determines which spoils score for this player
  pool: Unit[];           // persistent dice types (renewed each round)
  vp: number;             // visible accrued VP (the main engine)
  objectiveId: string;    // hidden endgame objective
  objectiveVp: number;    // resolved at game end
  stats: PlayerStats;
}

export interface GameV2 {
  board: BoardV2;
  players: PlayerV2[];
  /** territoryId → owning playerId (absent = neutral). */
  owner: Record<string, number>;
  round: number;
  /** War-exhaustion clock — ticks on every control change; flavour + future endgame. */
  clock: number;
  /**
   * Times the CURRENT owner has already scored each tile — drives DEPLETION:
   * a tile's yield drops by 1 per consecutive scoring (floor 1), and resets to
   * 0 when the tile changes hands. So camping gives diminishing returns and
   * fresh ground pays full — pushing players to keep moving (→ conflict, and
   * anti-snowball). Reset on capture, incremented at scoring.
   */
  heldStreak: Record<string, number>;
  /** Necromancers' Soul Harvest: bonus dice owed to a player next round
   *  (1 per contest they lost). playerId → count. Consumed at rollHand. */
  pendingBonusDice: Record<number, number>;
}

/** Per-round yield of a tile after depletion: full value minus how many times
 *  its current owner has already scored it, floored at 1. */
export function depletedYield(baseValue: number, streak: number): number {
  return Math.max(1, baseValue - streak);
}

export function createGameV2(factionIds: FactionId[], seed: string): GameV2 {
  const board = generateBoard(factionIds, seed);
  const players: PlayerV2[] = factionIds.map((fid, i) => ({
    id: i, faction: fid, pool: poolFromRanges(FACTIONS[fid].pool, `p${i}`), vp: 0,
    objectiveId: '', objectiveVp: 0,
    stats: { contestsWon: 0, strongpointsCaptured: 0 },
  }));
  // Each player starts owning their home.
  const owner: Record<string, number> = {};
  board.homeIds.forEach((h, i) => { owner[h] = i; });
  const game: GameV2 = { board, players, owner, round: 0, clock: 0, heldStreak: {}, pendingBonusDice: {} };
  // Deal hidden objectives from a seeded, board-independent stream.
  assignObjectives(game, new Rng(`v2-obj-${seed}-${factionIds.join('-')}`));
  return game;
}

/** Territories a player may deploy into: ones they own, or adjacent to them. */
export function reachable(game: GameV2, playerId: number): Set<string> {
  const out = new Set<string>();
  for (const [tid, o] of Object.entries(game.owner)) {
    if (o !== playerId) continue;
    out.add(tid);
    for (const adj of game.board.territories[tid]!.adjacency) out.add(adj);
  }
  return out;
}

// ── Catch-up ("underdog reinforcements") ──
// A trailing player rolls extra dice this round — scaled to how far behind the
// leader they are. This counters the centre-snowball WITHOUT gutting accrual:
// it grants FORCE to contest with, not free VP. 2p has no third party to
// police a leader, so this is its main self-correction; 4p table politics
// already curbs runaways, and the gap thresholds mean close games are untouched.
export const CATCHUP = { gap1: 4, gap2: 10 } as const;

export function catchUpDiceCount(game: GameV2, playerId: number): number {
  const leadVp = Math.max(...game.players.map((p) => p.vp));
  const deficit = leadVp - game.players[playerId]!.vp;
  if (deficit >= CATCHUP.gap2) return 2;
  if (deficit >= CATCHUP.gap1) return 1;
  return 0;
}

export function rollHand(game: GameV2, playerId: number, rng: Rng): RolledDie[] {
  const faction = FACTIONS[game.players[playerId]!.faction];
  const hand = rollPool(game.players[playerId]!.pool, rng);

  // Mages — Arcane Focus: Champion dice (1-6) never roll below 4.
  if (ABILITIES_ENABLED && faction.id === 'mages') {
    for (const d of hand) if (d.unit.range === '1-6' && d.value < 4) d.value = 4;
  }

  // Catch-up reinforcements (underdog).
  const catchup = catchUpDiceCount(game, playerId);
  if (catchup > 0) {
    hand.push(...rollPool(makeUnits('2-5', catchup, `catchup-p${playerId}-r${game.round}`), rng));
  }

  // Necromancers — Soul Harvest: bonus dice owed from contests lost last round.
  const owed = ABILITIES_ENABLED ? (game.pendingBonusDice[playerId] ?? 0) : 0;
  if (owed > 0) {
    hand.push(...rollPool(makeUnits('2-5', owed, `harvest-p${playerId}-r${game.round}`), rng));
    game.pendingBonusDice[playerId] = 0;
  }

  return hand;
}

/** A deployment: which player put how much total value onto a territory this round. */
export type Deployments = Record<string, Record<number, number>>; // territoryId → playerId → summed value

/**
 * Resolve all contested territories for the round, mutating ownership.
 * Returns per-territory results for logging / animation.
 */
export function resolveRound(game: GameV2, deployments: Deployments): {
  territoryId: string; changed: boolean; contested: boolean; newOwner: number | null;
}[] {
  const results: { territoryId: string; changed: boolean; contested: boolean; newOwner: number | null }[] = [];
  for (const [tid, committed] of Object.entries(deployments)) {
    const terr = game.board.territories[tid]!;

    const prevOwner = game.owner[tid] ?? null;
    // Combat abilities: Warriors' Warlord (+1 always) and Rangers' Ambush
    // (+2 when attacking a tile they don't own) fold into committed totals.
    const effectiveCommitted: Record<number, number> = {};
    for (const k of Object.keys(committed)) {
      const pid = Number(k);
      const fac = game.players[pid]!.faction;
      const ambush = ABILITIES_ENABLED && pid !== prevOwner ? attackBonus(fac) : 0;
      const warlord = ABILITIES_ENABLED ? combatBonus(fac) : 0;
      effectiveCommitted[pid] = committed[pid]! + warlord + ambush;
    }

    // Paladins — Consecrate: +2 defense on tiles they own.
    const ownerDefBonus = ABILITIES_ENABLED && prevOwner !== null ? defenseBonusFor(game.players[prevOwner]!.faction) : 0;
    const r = resolveContest({
      committed: effectiveCommitted,
      owner: prevOwner,
      terrainBonus: terr.defenseBonus + ownerDefBonus,
    });
    if (r.newOwner !== null) game.owner[tid] = r.newOwner;
    if (r.changed) { game.clock += 1; game.heldStreak[tid] = 0; } // fresh capture → full yield

    if (r.newOwner !== null && r.newOwner !== prevOwner) {
      // Stats for hidden objectives.
      if (r.contested) game.players[r.newOwner]!.stats.contestsWon += 1;
      const captured = prevOwner !== null;
      if (captured && (terr.role === 'choke' || terr.role === 'center')) {
        game.players[r.newOwner]!.stats.strongpointsCaptured += 1;
      }
    }

    // Necromancers — Soul Harvest: each contest a Necromancer LOST (committed
    // here but didn't end up owning the contested tile) earns a bonus die next
    // round.
    if (ABILITIES_ENABLED && r.contested) {
      for (const k of Object.keys(committed)) {
        const pid = Number(k);
        if (pid !== r.newOwner && game.players[pid]!.faction === 'necromancers') {
          game.pendingBonusDice[pid] = (game.pendingBonusDice[pid] ?? 0) + 1;
        }
      }
    }

    results.push({ territoryId: tid, changed: r.changed, contested: r.contested, newOwner: r.newOwner });
  }
  return results;
}

/** One scored tile in a player's round breakdown (for UI legibility). */
export interface RoundScoreLine {
  tid: string;
  name: string;
  spoil: Spoil | 'universal';
  value: number;     // VP this tile actually paid this round (after depletion)
  base: number;      // its full (undepleted) value
  depleted: boolean; // value < base (this tile is fading from being camped)
}
export interface RoundScore {
  playerId: number;
  lines: RoundScoreLine[]; // one per held, scoring tile
  coffers: number;         // Merchants' Coffers bonus this round (0 otherwise)
  total: number;           // lines + coffers = VP gained this round
}

/**
 * Score the round by ASYMMETRIC SPOIL VALUATION × DEPLETION: each controlled
 * territory is worth its spoil to that faction (primary 3 / secondary 2 / other
 * 1; centre universal 5), MINUS how many times the owner has already scored it
 * (floor 1). So a freshly-taken tile pays full and a long-camped one dwindles —
 * pushing players off their corners onto fresh, contested ground.
 *
 * Returns a per-player breakdown so the UI can show WHERE each point came from.
 */
export function scoreRound(game: GameV2): RoundScore[] {
  const scores: Record<number, RoundScore> = {};
  for (const p of game.players) scores[p.id] = { playerId: p.id, lines: [], coffers: 0, total: 0 };

  const tilesHeld: Record<number, number> = {};
  for (const [tid, ownerId] of Object.entries(game.owner)) {
    const terr = game.board.territories[tid]!;
    const faction = FACTIONS[game.players[ownerId]!.faction];
    tilesHeld[ownerId] = (tilesHeld[ownerId] ?? 0) + 1;
    const streak = game.heldStreak[tid] ?? 0;
    const base = valueOf(faction, terr.spoil);
    const gain = depletedYield(base, streak);
    game.players[ownerId]!.vp += gain;
    game.heldStreak[tid] = streak + 1;
    const sc = scores[ownerId]!;
    sc.lines.push({ tid, name: terr.name, spoil: terr.spoil, value: gain, base, depleted: gain < base });
    sc.total += gain;
  }

  // Merchants — Coffers: +1 bonus VP per 2 territories held this round.
  if (ABILITIES_ENABLED) {
    for (const p of game.players) {
      if (p.faction === 'merchants') {
        const c = Math.floor((tilesHeld[p.id] ?? 0) / 2);
        p.vp += c;
        scores[p.id]!.coffers = c;
        scores[p.id]!.total += c;
      }
    }
  }

  // Sort each player's lines high→low so the biggest contributors read first.
  for (const s of Object.values(scores)) s.lines.sort((a, b) => b.value - a.value);
  return Object.values(scores);
}

export function isGameOver(game: GameV2): boolean {
  return game.round >= ROUNDS;
}

export function leader(game: GameV2): PlayerV2 {
  return [...game.players].sort((a, b) => b.vp - a.vp)[0]!;
}
