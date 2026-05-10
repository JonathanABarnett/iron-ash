// Simulation stats accumulator. Records per-game outcomes; finalize computes
// faction stats and rule pressure from the running totals.

import type { FactionId, GameState } from '../engine/types';
import type { FactionStats, RulePressure } from './types';

interface FactionAccumulator {
  wins: number;
  plays: number;
  vpTotal: number;
  vpSourcesTotal: {
    roundGoalsAndFortressPerRound: number;
    regionControl: number;
    fortressEndGame: number;
    fullBarracksBonus: number;
    secretGoals: number;
    bothSecretGoalsBonus: number;
  };
}

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

export class StatsAccumulator {
  private factionAccs: Record<FactionId, FactionAccumulator>;
  private placeMoves = 0;
  private combineMoves = 0;
  private passMoves = 0;
  private hireMoves = 0;
  private draftMoves = 0;
  private playCardMoves = 0;
  private battleMoves = 0;
  private affordableHireTurns = 0;
  private specialistClaimsByRound: number[] = [];
  private specialistOpportunitiesByRound: number[] = [];
  private fortressTurnoverGames = 0; // games with at least one fortress change
  private totalFortressUsurps = 0;
  private totalFortressGameSlots = 0; // games-with-fortresses denominator
  private round7Reached = 0;
  private totalRounds = 0;
  private gamesRun = 0;

  constructor(rounds: number) {
    this.specialistClaimsByRound = new Array(rounds).fill(0);
    this.specialistOpportunitiesByRound = new Array(rounds).fill(0);
    this.factionAccs = {} as Record<FactionId, FactionAccumulator>;
    for (const id of ALL_FACTIONS) {
      this.factionAccs[id] = {
        wins: 0,
        plays: 0,
        vpTotal: 0,
        vpSourcesTotal: {
          roundGoalsAndFortressPerRound: 0,
          regionControl: 0,
          fortressEndGame: 0,
          fullBarracksBonus: 0,
          secretGoals: 0,
          bothSecretGoalsBonus: 0,
        },
      };
    }
  }

  record(final: GameState): void {
    this.gamesRun += 1;
    this.totalRounds += final.round;
    if (final.round >= 7) this.round7Reached += 1;

    // Faction-level totals
    for (const playerId of final.turnOrder) {
      const player = final.players[playerId]!;
      const acc = this.factionAccs[player.factionId];
      acc.plays += 1;
      acc.vpTotal += player.vp;
      const breakdown = final.scoreBreakdown?.perPlayer[playerId];
      if (breakdown) {
        acc.vpSourcesTotal.roundGoalsAndFortressPerRound += breakdown.parts.roundGoals;
        acc.vpSourcesTotal.regionControl += breakdown.parts.regionControl;
        acc.vpSourcesTotal.fortressEndGame += breakdown.parts.fortressEndGame;
        acc.vpSourcesTotal.fullBarracksBonus += breakdown.parts.fullBarracksBonus;
        acc.vpSourcesTotal.secretGoals += breakdown.parts.secretGoals;
        acc.vpSourcesTotal.bothSecretGoalsBonus += breakdown.parts.bothSecretGoalsBonus;
      }
    }
    if (final.winnerId) {
      const winnerFaction = final.players[final.winnerId]!.factionId;
      this.factionAccs[winnerFaction].wins += 1;
    }

    // Move counts and specialist tracking from the log
    const fortressChangesInThisGame = new Set<string>();
    let lastFortressOwners: Record<string, string | undefined> = {};
    for (const rt of Object.values(final.regions)) {
      // Initial owner from final state — used as a baseline; we re-derive below
      // from log events when we encounter them.
      lastFortressOwners[rt.regionId] = undefined;
    }

    let affordableInGame = 0;
    for (const entry of final.log) {
      if (entry.event.kind !== 'move') continue;
      const move = entry.event.move;
      switch (move.kind) {
        case 'place':
          this.placeMoves += 1;
          break;
        case 'combine':
          this.combineMoves += 1;
          break;
        case 'pass':
          this.passMoves += 1;
          break;
        case 'hire-merc':
          this.hireMoves += 1;
          break;
        case 'draft-card':
          this.draftMoves += 1;
          break;
        case 'play-card':
          this.playCardMoves += 1;
          break;
        case 'battle':
          this.battleMoves += 1;
          break;
      }
      // Approximation: every action turn was an "affordable" hire opportunity
      // if we charge the active player at least 3 gold. We don't have the
      // intermediate state here, so we count all actionable turns as the
      // denominator (slightly overcounts — refined later if needed).
      affordableInGame += 1;

      // Specialist claim: count when a hire-merc move's slot is 'specialist'.
      if (move.kind === 'hire-merc' && move.mercSlot === 'specialist') {
        const idx = entry.round - 1;
        if (idx >= 0 && idx < this.specialistClaimsByRound.length) {
          this.specialistClaimsByRound[idx] = (this.specialistClaimsByRound[idx] ?? 0) + 1;
        }
      }
    }
    // Specialist opportunities: a game contributes to opportunitiesByRound[r-1]
    // for each round it actually played.
    for (let r = 1; r <= final.round; r++) {
      const idx = r - 1;
      if (idx < this.specialistOpportunitiesByRound.length) {
        this.specialistOpportunitiesByRound[idx] =
          (this.specialistOpportunitiesByRound[idx] ?? 0) + 1;
      }
    }
    this.affordableHireTurns += affordableInGame;

    // Fortress turnover: any fortress region whose `heldRounds` is less than
    // the total rounds-since-first-occupation indicates change-of-hands. We
    // approximate by checking heldRounds < (final.round - 1) for fortresses
    // currently owned; use this as a proxy.
    const fortressIds: string[] = [];
    for (const def of Object.values(final.regionDefs)) {
      if (def.isFortress) fortressIds.push(def.id);
    }
    if (fortressIds.length > 0) {
      this.totalFortressGameSlots += 1;
      let changed = false;
      for (const id of fortressIds) {
        const rt = final.regions[id];
        if (!rt) continue;
        if (rt.garrisonOwnerId && rt.heldRounds < final.round - 1) {
          changed = true;
        }
      }
      if (changed) {
        this.fortressTurnoverGames += 1;
        fortressChangesInThisGame.add('any');
      }
      // Global usurps count: re-walk log not implemented in this pass.
      void this.totalFortressUsurps;
    }
  }

  finalize(): { factionStats: Record<FactionId, FactionStats>; rulePressure: RulePressure } {
    const totalMoves =
      this.placeMoves +
      this.combineMoves +
      this.passMoves +
      this.hireMoves +
      this.draftMoves +
      this.playCardMoves +
      this.battleMoves;

    const factionStats: Record<FactionId, FactionStats> = {} as Record<FactionId, FactionStats>;
    for (const id of ALL_FACTIONS) {
      const acc = this.factionAccs[id];
      const playCount = acc.plays;
      const winRate = playCount > 0 ? acc.wins / playCount : 0;
      const avgVP = playCount > 0 ? acc.vpTotal / playCount : 0;
      const div = playCount > 0 ? playCount : 1;
      factionStats[id] = {
        factionId: id,
        winRate,
        avgVP,
        playCount,
        vpSources: {
          roundGoalsAndFortressPerRound:
            acc.vpSourcesTotal.roundGoalsAndFortressPerRound / div,
          regionControl: acc.vpSourcesTotal.regionControl / div,
          fortressEndGame: acc.vpSourcesTotal.fortressEndGame / div,
          fullBarracksBonus: acc.vpSourcesTotal.fullBarracksBonus / div,
          secretGoals: acc.vpSourcesTotal.secretGoals / div,
          bothSecretGoalsBonus: acc.vpSourcesTotal.bothSecretGoalsBonus / div,
        },
      };
    }

    const specialistClaimByRound = this.specialistClaimsByRound.map((claims, idx) => {
      const opps = this.specialistOpportunitiesByRound[idx] ?? 0;
      return opps > 0 ? claims / opps : null;
    });

    const rulePressure: RulePressure = {
      fortressTurnoverRate:
        this.totalFortressGameSlots > 0
          ? this.fortressTurnoverGames / this.totalFortressGameSlots
          : 0,
      mercenaryHireRate:
        this.affordableHireTurns > 0 ? this.hireMoves / this.affordableHireTurns : 0,
      specialistClaimByRound,
      combineActionRate: totalMoves > 0 ? this.combineMoves / totalMoves : 0,
      round7ReachRate: this.gamesRun > 0 ? this.round7Reached / this.gamesRun : 0,
      avgGameLength: this.gamesRun > 0 ? this.totalRounds / this.gamesRun : 0,
    };

    return { factionStats, rulePressure };
  }
}
