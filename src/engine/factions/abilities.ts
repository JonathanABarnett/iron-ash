// Faction ability registry. Phase 2E implements two common hooks:
//   - passiveStartOfRound: a per-round resource gain (tied to faction identity)
//   - mercDiscount: gold reduction when this player hires a mercenary
//
// Richer abilities (Assassins first refusal, Mages merc reroll, Necromancers
// rehire-returned, Merchants free-garrison merc, faction actives, faction-
// specific hidden objectives) layer on by extending this registry.

import { produce } from 'immer';
import type { FactionId, GameState, PlayerId, Resource } from '../types';

export interface PassiveTickResult {
  /** Resource gain applied at start of round. */
  gain?: Partial<Record<Resource, number>>;
}

export interface FactionAbilities {
  /** Effect applied to the player at start of each round. */
  passiveStartOfRound?: PassiveTickResult;
  /** Gold discount when this faction's player hires a mercenary (>= 0). */
  mercDiscount?: number;
}

export const FACTION_ABILITIES: Record<FactionId, FactionAbilities> = {
  warriors: {
    passiveStartOfRound: { gain: { iron: 1 } },
    mercDiscount: 1,
  },
  assassins: {
    // Active "first refusal" not yet implemented; identity tilt instead.
    passiveStartOfRound: { gain: { gold: 1 } },
  },
  mages: {
    passiveStartOfRound: { gain: { essence: 1 } },
  },
  necromancers: {
    passiveStartOfRound: { gain: { essence: 1 } },
  },
  merchants: {
    passiveStartOfRound: { gain: { gold: 2 } },
  },
  rangers: {
    passiveStartOfRound: { gain: { iron: 1 } },
  },
  paladins: {
    passiveStartOfRound: { gain: { iron: 1 } },
  },
  beastmasters: {
    passiveStartOfRound: { gain: { essence: 1 } },
  },
};

/** Apply every player's start-of-round passive to a draft state. */
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
  void playerId; // reserved for future per-player abilities
  return FACTION_ABILITIES[factionId]?.mercDiscount ?? 0;
}
