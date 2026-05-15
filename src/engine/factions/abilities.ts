// Faction ability registry.
//
// passiveStartOfRound — resource gain every round (Phase 2E, wired)
// mercDiscount        — gold off per merc hire (Phase 2E, wired)
// applyActive         — once-per-round special action (Phase 6, wired)
//
// Active ability design goals: immediate, deterministic, faction-flavoured.
//   Warriors      Iron Discipline — gain 2 iron (economy fuel for fortresses)
//   Assassins     Shadow Step     — set a barracks die face to any value ≤ its max (low mastery)
//   Mages         Arcane Precision — set a barracks die face to ANY value in its range (exact values)
//   Necromancers  Soul Recall     — return one placed die from a region back to barracks
//   Merchants     Trade Deal      — gain 3 gold (pure economy)
//   Rangers       Pathfinder      — gain 1 of every resource (versatility)
//   Paladins      Sacred Seal     — gain 1 iron + 1 essence (hybrid synergy)
//   Beastmasters  Wild Surge      — add a temporary 1-6 die to barracks for this round

import { produce } from 'immer';
import type { FactionId, GameState, PlayerId, Resource } from '../types';

export interface PassiveTickResult {
  gain?: Partial<Record<Resource, number>>;
}

export interface FactionAbilities {
  passiveStartOfRound?: PassiveTickResult;
  mercDiscount?: number;
  /** Human-readable description of what this faction's active ability does. */
  activeDescription: string;
  /** Short action label shown on the button. */
  activeLabel: string;
  /**
   * Whether the active requires a specific die target.
   * 'die+value' → player picks a barracks die and a target value.
   * 'region'    → player picks one of their occupied regions.
   * 'none'      → no targeting needed.
   */
  activeTargeting: 'die+value' | 'region' | 'none';
}

export const FACTION_ABILITIES: Record<FactionId, FactionAbilities> = {
  warriors: {
    passiveStartOfRound: { gain: { iron: 1 } },
    mercDiscount: 1,
    activeLabel: 'Iron Discipline',
    activeDescription: 'Gain 2 iron immediately.',
    activeTargeting: 'none',
  },
  assassins: {
    passiveStartOfRound: { gain: { gold: 1 } },
    activeLabel: 'Shadow Step',
    activeDescription: 'Set one barracks die to a low face value (≤3) — perfect for restricted regions.',
    activeTargeting: 'die+value',
  },
  mages: {
    passiveStartOfRound: { gain: { essence: 1 } },
    activeLabel: 'Arcane Precision',
    activeDescription: 'Set one barracks die to any face value within its range.',
    activeTargeting: 'die+value',
  },
  necromancers: {
    passiveStartOfRound: { gain: { essence: 1 } },
    activeLabel: 'Soul Recall',
    activeDescription: 'Return one of your placed dice from any region back to barracks.',
    activeTargeting: 'region',
  },
  merchants: {
    passiveStartOfRound: { gain: { gold: 2 } },
    activeLabel: 'Trade Deal',
    activeDescription: 'Gain 3 gold immediately.',
    activeTargeting: 'none',
  },
  rangers: {
    passiveStartOfRound: { gain: { iron: 1 } },
    activeLabel: 'Pathfinder',
    activeDescription: 'Gain 2 iron, 2 gold, and 2 essence.',
    activeTargeting: 'none',
  },
  paladins: {
    passiveStartOfRound: { gain: { iron: 1 } },
    activeLabel: 'Sacred Seal',
    activeDescription: 'Gain 1 iron and 1 essence.',
    activeTargeting: 'none',
  },
  beastmasters: {
    passiveStartOfRound: { gain: { essence: 1 } },
    activeLabel: 'Wild Surge',
    activeDescription: 'Add a temporary wild 1-6 die to your barracks for this round.',
    activeTargeting: 'none',
  },
};

/** Apply every player's start-of-round passive. */
export function applyPassivesStartOfRound(state: GameState): GameState {
  return produce(state, (draft) => {
    for (const player of Object.values(draft.players)) {
      const ab = FACTION_ABILITIES[player.factionId];
      if (!ab?.passiveStartOfRound?.gain) continue;
      for (const [k, v] of Object.entries(ab.passiveStartOfRound.gain)) {
        const key = k as Resource;
        if (typeof v === 'number') player.resources[key] += v;
      }
    }
  });
}

export function getMercDiscount(factionId: FactionId, playerId?: PlayerId): number {
  void playerId;
  return FACTION_ABILITIES[factionId]?.mercDiscount ?? 0;
}

/** Is the active ability legal to use right now? */
export function canUseActive(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  if (player.activeUsedThisRound) return false;
  if (state.phase !== 'action') return false;
  if (state.activePlayerId !== playerId) return false;

  const ab = FACTION_ABILITIES[player.factionId];
  // Necromancer active needs at least one placed die.
  if (ab.activeTargeting === 'region') {
    return player.dice.some((d) => d.location.kind === 'region');
  }
  return true;
}

/** Apply the active ability effect. Returns new state. */
export function applyActive(
  state: GameState,
  playerId: PlayerId,
  dieId?: string,
  targetValue?: number,
  targetRegionId?: string,
): GameState {
  const player = state.players[playerId];
  if (!player) throw new Error(`Unknown player ${playerId}`);
  const factionId = player.factionId;

  return produce(state, (draft) => {
    const dp = draft.players[playerId]!;
    dp.activeUsedThisRound = true;

    switch (factionId) {
      case 'warriors':
        dp.resources.iron += 2;
        break;

      case 'merchants':
        dp.resources.gold += 3;
        break;

      case 'rangers':
        // Pathfinder: +2 of each resource (buffed from +1 each after balance pass).
        dp.resources.iron += 2;
        dp.resources.gold += 2;
        dp.resources.essence += 2;
        break;

      case 'paladins':
        dp.resources.iron += 1;
        dp.resources.essence += 1;
        break;

      case 'assassins': {
        // Shadow Step: set a die to a LOW face value (≤3).
        // AI fallback: set the highest-range barracks die to 2 (ideal for ≤2 regions).
        if (!dieId || targetValue === undefined) {
          const die = dp.dice.find((d) => d.location.kind === 'barracks' && d.faceValue !== null);
          if (die) die.faceValue = 2;
          break;
        }
        const die = dp.dice.find((d) => d.id === dieId);
        if (die && die.location.kind === 'barracks') {
          die.faceValue = Math.min(targetValue, 3);
        }
        break;
      }

      case 'mages': {
        // Arcane Precision: set a die to any legal value within its range.
        if (!dieId || targetValue === undefined) {
          // AI fallback: boost the first barracks die to its maximum face.
          const die = dp.dice.find((d) => d.location.kind === 'barracks' && d.faceValue !== null);
          if (die) {
            const faces = FACES[die.range] ?? [1];
            const maxFace = faces.reduce((a, b) => (b > a ? b : a), 0);
            die.faceValue = maxFace;
          }
          break;
        }
        const die = dp.dice.find((d) => d.id === dieId);
        if (die && die.location.kind === 'barracks') {
          die.faceValue = targetValue;
        }
        break;
      }

      case 'necromancers': {
        // Return one placed die from a region to barracks.
        if (!targetRegionId) {
          // AI fallback: retrieve a random placed die.
          const placed = dp.dice.filter((d) => d.location.kind === 'region');
          if (placed.length > 0) {
            const first = placed[0]!;
            const rt = draft.regions[first.location.kind === 'region' ? first.location.regionId : ''];
            if (rt) {
              rt.placedDieIds = rt.placedDieIds.filter((id) => id !== first.id);
            }
            first.location = { kind: 'barracks' };
          }
          break;
        }
        // Retrieve the first of the player's placed dice in the target region.
        const rt = draft.regions[targetRegionId];
        if (rt) {
          const dieInRegion = dp.dice.find(
            (d) => d.location.kind === 'region' && d.location.regionId === targetRegionId,
          );
          if (dieInRegion) {
            rt.placedDieIds = rt.placedDieIds.filter((id) => id !== dieInRegion.id);
            dieInRegion.location = { kind: 'barracks' };
          }
        }
        break;
      }

      case 'beastmasters': {
        // Add a temporary 1-6 die to barracks.
        const tempId = `beast-surge-r${state.round}-${playerId}`;
        dp.dice.push({
          id: tempId,
          range: '1-6',
          faceValue: null, // will roll next round; give max immediately for this round
          ownerId: playerId,
          location: { kind: 'barracks' },
          mercSource: 'specialist' as const, // reuse mercSource flag so it clears at end-of-round
          mercCost: 0,
        });
        // Give it face 4 — more useful than 3, can reach most non-fortress regions.
        dp.dice[dp.dice.length - 1]!.faceValue = 4;
        break;
      }
    }
  });
}

// Shared die face tables (avoids circular import from dice.ts).
const FACES: Record<string, readonly number[]> = {
  '1-3': [1, 1, 2, 2, 3, 3],
  '2-5': [2, 2, 3, 3, 4, 5],
  '3-6': [3, 3, 4, 5, 6, 6],
  '1-6': [1, 2, 3, 4, 5, 6],
};
