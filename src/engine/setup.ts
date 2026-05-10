// createGame: build initial GameState from configs and a list of player choices.

import type {
  Die,
  FactionDefinition,
  GameState,
  Player,
  PlayerId,
  Region,
  RegionRuntime,
  RoundGoalDefinition,
  RoundGoalSlot,
  RulesConfig,
  SecretGoalDefinition,
  SecretGoalId,
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
  roundGoals?: RoundGoalDefinition[];
  secretGoals?: SecretGoalDefinition[];
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
      progress: {
        maxFortressesSimultaneous: 0,
        combinesThisGame: 0,
        battlesWonThisGame: 0,
        mercsHiredThisGame: 0,
        cardsKeptThisGame: 0,
        terrainsPlacedOn: [],
        maxDicePlacedAtRoundEnd: 0,
      },
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

  // Round goals: one slot per round, drawn from pool. Round 7 (free-for-all) has no goal.
  const roundGoalSlots: RoundGoalSlot[] = [];
  if (args.roundGoals && args.roundGoals.length > 0) {
    const shuffled = rng.shuffle(args.roundGoals);
    const goalsToAssign = Math.min(rules.totalRounds - 1, shuffled.length);
    for (let r = 1; r <= goalsToAssign; r++) {
      roundGoalSlots.push({
        goalId: shuffled[r - 1]!.id,
        forRound: r,
        resolved: false,
      });
    }
  }

  // Secret goals: each player drafts 2 of 4 random goals.
  const secretGoalsByPlayer: Record<PlayerId, SecretGoalId[]> = {};
  if (args.secretGoals && args.secretGoals.length >= 4) {
    for (const s of setups) {
      const draftPool = rng.shuffle(args.secretGoals).slice(0, 4);
      // Random AI: just keep the first 2. Phase 3 AI will draft preferentially.
      secretGoalsByPlayer[s.id] = draftPool.slice(0, 2).map((g) => g.id);
      players[s.id]!.secretGoals = secretGoalsByPlayer[s.id]!;
    }
  } else {
    for (const s of setups) secretGoalsByPlayer[s.id] = [];
  }

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
      specialist: null,
      specialistValue: rules.specialistSequence[0] ?? 6,
      claimed: {},
    },
    threatTrack: 0,
    roundGoals: roundGoalSlots,
    secretGoalsByPlayer,
    rngSeed: seed,
    rngState: JSON.stringify(rng.snapshot()),
    log: [],
    freeForAll: false,
  };
}
