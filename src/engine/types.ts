// Iron & Ash — engine type definitions.
// This file is the schema other engine modules pivot off of.
// Pure types only; no runtime imports.

export type DieRange = '1-3' | '2-5' | '3-6' | '1-6';
export type Resource = 'iron' | 'gold' | 'essence';
export type FactionId =
  | 'warriors'
  | 'assassins'
  | 'mages'
  | 'necromancers'
  | 'merchants'
  | 'rangers'
  | 'paladins'
  | 'beastmasters';
export type Terrain = 'fortress' | 'forest' | 'mountain' | 'swamp' | 'plains' | 'ruins';

export type PlayerId = string;
export type DieId = string;
export type RegionId = string;
export type CardId = string;
export type RoundGoalId = string;
export type SecretGoalId = string;

export type Phase = 'roll' | 'action' | 'end-of-round' | 'finished';

export type DieLocation =
  | { kind: 'barracks' }
  | { kind: 'region'; regionId: RegionId }
  | { kind: 'garrison'; regionId: RegionId };

export type MercSource = 'low' | 'high' | 'specialist';

export interface Die {
  id: DieId;
  range: DieRange;
  /** null = unrolled / in barracks awaiting roll */
  faceValue: number | null;
  ownerId: PlayerId;
  location: DieLocation;
  /**
   * If set, this die came from the mercenary pool. Merc dice leave the game
   * at end of round (used or not). Unused merc dice refund their cost.
   */
  mercSource?: MercSource | undefined;
  /** Gold paid when hiring; refunded if the merc isn't used this round. */
  mercCost?: number | undefined;
}

export type ValueRequirement =
  | { kind: 'min'; value: number }
  | { kind: 'max'; value: number }
  | { kind: 'exact'; value: number }
  | { kind: 'minSum'; value: number };

export interface Region {
  id: RegionId;
  name: string;
  terrain: Terrain;
  isFortress: boolean;
  valueRequirement: ValueRequirement;
  vp: number;
  unlocksRound?: number;
  adjacency: RegionId[];
}

/** Mutable per-game region state layered on top of static Region definition. */
export interface RegionRuntime {
  regionId: RegionId;
  /** dice currently placed on this region (not in fortress garrison) */
  placedDieIds: DieId[];
  /** dice garrisoned (fortress only) — held across rounds until usurped */
  garrisonedDieIds: DieId[];
  /** owner of the current garrison, derived from garrisonedDieIds */
  garrisonOwnerId?: PlayerId | undefined;
  /** how many rounds the current garrison has held — for VP accrual */
  heldRounds: number;
  /** Built structure, if any. One structure per region; owner keeps VP at end-game. */
  structure?: { structureId: string; ownerId: PlayerId } | undefined;
}

/** Static definition of a buildable structure (from config/structures.json). */
export interface StructureDefinition {
  id: string;
  name: string;
  description: string;
  cost: Partial<Record<Resource, number>>;
  /** VP awarded to the builder at end of game. */
  vp: number;
  /** Terrain types this structure can be built on. */
  allowedTerrains: Terrain[];
}

export interface FactionDefinition {
  id: FactionId;
  name: string;
  startDice: { range: DieRange; count: number }[];
  startResources: Record<Resource, number>;
  barracksMax: number;
  primaryResource: Resource | 'shadow' | 'souls' | 'wood' | 'faith' | 'wild';
}

export interface Player {
  id: PlayerId;
  factionId: FactionId;
  isAI: boolean;
  resources: Record<Resource, number>;
  dice: Die[];
  barracksMax: number;
  hand: CardId[];
  vp: number;
  secretGoals: SecretGoalId[];
  /** Set when the player has explicitly passed for the rest of this round. */
  passedThisRound: boolean;
  /** True once the player has used their once-per-round active ability this round. */
  activeUsedThisRound: boolean;
  /** Combine Bonus card effect: next combine this round adds +1 and ignores terrain requirement. */
  hasCombineBonus: boolean;
  /** Counters fed by the round/turn loop and queried by goal predicates. */
  progress: GoalProgress;
  /** arbitrary per-faction extras populated in Phase 2 */
  factionState: Record<string, unknown>;
}

export interface RoundGoalSlot {
  goalId: RoundGoalId;
  forRound: number;
  /** populated at end-of-round when scored */
  resolved: boolean;
}

export interface RoundGoalDefinition {
  id: RoundGoalId;
  name: string;
  description: string;
  /**
   * 'highest' = winner has the largest measured value,
   * 'lowest'  = winner has the smallest measured value.
   */
  direction: 'highest' | 'lowest';
}

export interface SecretGoalDefinition {
  id: SecretGoalId;
  name: string;
  description: string;
  vp: number;
}

/** Per-player counters used by goal predicates and end-game scoring. */
export interface GoalProgress {
  /** max number of fortresses held simultaneously over the game */
  maxFortressesSimultaneous: number;
  /** lifetime combine actions */
  combinesThisGame: number;
  /** lifetime battles initiated and won (Phase 2D wires this) */
  battlesWonThisGame: number;
  /** lifetime mercenaries hired (Phase 2B wires this) */
  mercsHiredThisGame: number;
  /** lifetime times the player paid to keep a card (Phase 2C wires this) */
  cardsKeptThisGame: number;
  /** distinct terrains the player has placed on at any point */
  terrainsPlacedOn: Terrain[];
  /** max dice placed at any round-end */
  maxDicePlacedAtRoundEnd: number;
}

export interface MercPool {
  /** Low merc — 1-3 die, rerolled fresh each round */
  low: Die | null;
  /** High merc — 3-6 die, rerolled fresh each round */
  high: Die | null;
  /** Specialist die at the round's current value (pre-minted at refresh time). */
  specialist: Die | null;
  /** Specialist nominal value for the round, follows specialistSequence. */
  specialistValue: number;
  /** which mercs have been claimed this round, by player id */
  claimed: Partial<Record<MercSource, PlayerId>>;
}

export type CardKind =
  | 'modifier'
  | 'reroll'
  | 'combine-bonus'
  | 'lock'
  | 'steal'
  | 'forced-march';

export type CardEffect =
  | { kind: 'gain-resource'; resource: Resource; amount: number }
  | { kind: 'gain-vp'; amount: number }
  | { kind: 'reroll-die' }
  | { kind: 'modify-die'; delta: number }
  /** Move one of your placed dice to an adjacent region; ignore that region's value requirement. */
  | { kind: 'forced-march' }
  /** Lock a region — opponents cannot place there this round; gain 1 VP if uncontested at end of round. */
  | { kind: 'lock-region' }
  /** Steal 1 of a resource from a random opponent; draw a card from the market for free. */
  | { kind: 'steal-resource'; resource?: Resource }
  /** Your next combine action this round adds +1 to the sum and ignores terrain restrictions. */
  | { kind: 'combine-bonus' };

export interface CardDefinition {
  id: CardId;
  name: string;
  kind: CardKind;
  cost: Partial<Record<Resource, number>>;
  effect: CardEffect;
  description?: string;
}

export type Move =
  | { kind: 'place'; dieId: DieId; regionId: RegionId }
  | { kind: 'combine'; dieIds: [DieId, DieId]; regionId: RegionId }
  | { kind: 'draft-card'; cardId: CardId }
  /** Play a card from hand. Targeting fields required by Forced March and Lock. */
  | { kind: 'play-card'; cardId: CardId; targetDieId?: DieId; targetRegionId?: RegionId }
  | { kind: 'hire-merc'; mercSlot: 'low' | 'high' | 'specialist' }
  | { kind: 'battle'; attackerDieId: DieId; targetRegionId: RegionId }
  /** Spend Iron + Gold to advance this die's range one tier (1-3→2-5→3-6). */
  | { kind: 'upgrade-die'; dieId: DieId }
  /** Spend resources to unlock one additional barracks slot (new 1-3 die). */
  | { kind: 'expand-barracks' }
  /**
   * Use this faction's once-per-round active ability.
   * Optional targeting params for abilities that need a die/value/region.
   */
  | { kind: 'use-active'; dieId?: DieId; targetValue?: number; targetRegionId?: RegionId }
  /** Spend resources to construct a structure on a region you currently occupy. */
  | { kind: 'build-structure'; structureId: string; regionId: RegionId }
  | { kind: 'pass' };

/** The range tier above the given range, or null if already at max. */
export function nextDieRange(range: DieRange): DieRange | null {
  if (range === '1-3') return '2-5';
  if (range === '2-5') return '3-6';
  return null; // '3-6' and '1-6' cannot be upgraded
}

/**
 * Terrain requirement for upgrading a die to the given target range.
 * Returns null when there is no terrain requirement (upgrade is always legal).
 *
 * Design: 2-5 → 3-6 ("elite" tier) requires the player to hold a mountain
 * or fortress — elite forces are tempered in hard terrain.
 */
export function upgradeTerrainRequirement(targetRange: DieRange): Terrain[] | null {
  if (targetRange === '3-6') return ['mountain', 'fortress'];
  return null;
}

export interface CostsConfig {
  dieUpgrade: { iron: number; gold: number; essence: number };
  barracksExpand: { iron: number; gold: number; essence: number };
  cardKeep: { iron: number; gold: number; essence: number };
}

export interface GameLogEntry {
  round: number;
  turn: number;
  playerId: PlayerId;
  /** Move that was applied, or 'roll' / 'end-of-round' marker */
  event: { kind: 'move'; move: Move } | { kind: 'roll' } | { kind: 'end-of-round' };
  /** AI scoring breakdown when applicable; populated in Phase 3 */
  aiReasoning?: AIReasoning;
}

export interface AIReasoning {
  /** Top-N candidate moves ranked by score, populated by ai/decide.ts */
  candidates: { move: Move; score: number; breakdown: Record<string, number> }[];
  noiseApplied: number;
}

export interface GameState {
  round: number; // 1-indexed
  turn: number; // 1-indexed within round
  phase: Phase;
  activePlayerId: PlayerId;
  turnOrder: PlayerId[];
  players: Record<PlayerId, Player>;
  regions: Record<RegionId, RegionRuntime>;
  /** static region defs loaded from config */
  regionDefs: Record<RegionId, Region>;
  /** card market (Phase 2) */
  market: CardId[];
  /** mercenary pool (Phase 2) */
  mercs: MercPool;
  /** current threat track value */
  threatTrack: number;
  /** Round goals selected at game start (one per round in slots[round-1]). */
  roundGoals: RoundGoalSlot[];
  /** Per-player secret goal selections (chose 2 of 4 at start). */
  secretGoalsByPlayer: Record<PlayerId, SecretGoalId[]>;
  /** End-of-game scoring breakdown, populated when phase=finished. */
  scoreBreakdown?: ScoreBreakdown | undefined;
  /** seed used to start the game — for replay */
  rngSeed: string;
  /** serialized RNG cursor; written when state is persisted */
  rngState: string;
  log: GameLogEntry[];
  /** whether the current round is the round-7 free-for-all */
  freeForAll: boolean;
  /**
   * Regions locked by a Lock card this round. Key = regionId, value = locking playerId.
   * Opponents cannot place/combine/garrison there; cleared at end of round.
   * Locking player gains 1 VP if no opponent dice land there.
   */
  lockedRegions: Partial<Record<RegionId, PlayerId>>;
  winnerId?: PlayerId | undefined;
}

export interface RulesConfig {
  totalRounds: number;
  resourceCap: number;
  specialistSequence: number[];
  freeForAllRound: number;
  freeForAllToggles: {
    free: boolean;
    allMercsFree: boolean;
    halfPriceCards: boolean;
    specialistChoosable: boolean;
    waiveCardHandLimit: boolean;
  };
  threatTrackThreshold: number;
}

export interface ScoreBreakdown {
  perPlayer: Record<PlayerId, PlayerScore>;
  winnerId: PlayerId;
}

export interface PlayerScore {
  playerId: PlayerId;
  total: number;
  parts: {
    roundGoals: number;
    fortressesPerRound: number;
    regionControl: number;
    fortressEndGame: number;
    fullBarracksBonus: number;
    secretGoals: number;
    bothSecretGoalsBonus: number;
    structures: number;
  };
}
