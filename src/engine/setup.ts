// createGame: build initial GameState from configs and a list of player choices.

import type {
  Die,
  FactionDefinition,
  GameState,
  Player,
  PlayerId,
  Region,
  RegionRuntime,
  RulesConfig,
} from './types';
import { Rng, makeIdFactory } from './rng';

export interface PlayerSetup {
  id: PlayerId;
  factionId: FactionDefinition['id'];
  isAI: boolean;
}

export interface CreateGameArgs {
  seed: string;
  players: PlayerSetup[];
  regions: Region[];
  factions: FactionDefinition[];
  rules: RulesConfig;
}

export function createGame(args: CreateGameArgs): GameState {
  const { seed, players: setups, regions, factions, rules } = args;
  if (setups.length < 2 || setups.length > 4) {
    throw new Error(`Iron & Ash supports 2-4 players (got ${setups.length})`);
  }
  const rng = new Rng(seed);
  const dieId = makeIdFactory(rng, 'd');

  const factionById = new Map(factions.map((f) => [f.id, f]));

  const players: Record<PlayerId, Player> = {};
  for (const s of setups) {
    const def = factionById.get(s.factionId);
    if (!def) throw new Error(`Unknown faction: ${s.factionId}`);
    const dice: Die[] = [];
    for (const spec of def.startDice) {
      for (let i = 0; i < spec.count; i++) {
        dice.push({
          id: dieId(),
          range: spec.range,
          faceValue: null,
          ownerId: s.id,
          location: { kind: 'barracks' },
        });
      }
    }
    players[s.id] = {
      id: s.id,
      factionId: s.factionId,
      isAI: s.isAI,
      resources: { ...def.startResources },
      dice,
      barracksMax: def.barracksMax,
      hand: [],
      vp: 0,
      secretGoals: [],
      passedThisRound: false,
      factionState: {},
    };
  }

  const regionDefs: Record<string, Region> = {};
  const regionRuntimes: Record<string, RegionRuntime> = {};
  for (const r of regions) {
    regionDefs[r.id] = r;
    regionRuntimes[r.id] = {
      regionId: r.id,
      placedDieIds: [],
      garrisonedDieIds: [],
      heldRounds: 0,
    };
  }

  const turnOrder = setups.map((s) => s.id);
  const firstId = turnOrder[0];
  if (!firstId) throw new Error('No players');

  return {
    round: 1,
    turn: 0,
    phase: 'roll',
    activePlayerId: firstId,
    turnOrder,
    players,
    regions: regionRuntimes,
    regionDefs,
    market: [],
    mercs: {
      low: null,
      high: null,
      specialistValue: rules.specialistSequence[0] ?? 6,
      claimed: {},
    },
    threatTrack: 0,
    roundGoals: [],
    rngSeed: seed,
    rngState: JSON.stringify(rng.snapshot()),
    log: [],
    freeForAll: false,
  };
}
