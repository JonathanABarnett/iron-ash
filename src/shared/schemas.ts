// Zod schemas for runtime validation of every config JSON.
// Engine config-loader composes these; UI config editor (Phase 6) will reuse them.

import { z } from 'zod';

export const TerrainSchema = z.enum([
  'fortress',
  'forest',
  'mountain',
  'swamp',
  'plains',
  'ruins',
]);

export const DieRangeSchema = z.enum(['1-3', '2-5', '3-6', '1-6']);

export const ResourceSchema = z.enum(['iron', 'gold', 'essence']);

export const FactionIdSchema = z.enum([
  'warriors',
  'assassins',
  'mages',
  'necromancers',
  'merchants',
  'rangers',
  'paladins',
  'beastmasters',
]);

export const ValueRequirementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('min'), value: z.number().int() }),
  z.object({ kind: z.literal('max'), value: z.number().int() }),
  z.object({ kind: z.literal('exact'), value: z.number().int() }),
  z.object({ kind: z.literal('minSum'), value: z.number().int() }),
]);

export const RegionSchema = z.object({
  id: z.string(),
  name: z.string(),
  terrain: TerrainSchema,
  isFortress: z.boolean(),
  valueRequirement: ValueRequirementSchema,
  vp: z.number().int(),
  unlocksRound: z.number().int().optional(),
  adjacency: z.array(z.string()),
});

export const RegionsConfigSchema = z.array(RegionSchema);

export const FactionDefinitionSchema = z.object({
  id: FactionIdSchema,
  name: z.string(),
  startDice: z.array(
    z.object({ range: DieRangeSchema, count: z.number().int().positive() }),
  ),
  startResources: z.object({
    iron: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    essence: z.number().int().nonnegative(),
  }),
  barracksMax: z.number().int().positive(),
  primaryResource: z.enum([
    'iron',
    'gold',
    'essence',
    'shadow',
    'souls',
    'wood',
    'faith',
    'wild',
  ]),
});

export const FactionsConfigSchema = z.array(FactionDefinitionSchema);

export const CardKindSchema = z.enum([
  'modifier',
  'reroll',
  'combine-bonus',
  'lock',
  'steal',
  'forced-march',
]);

export const CardEffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('gain-resource'),
    resource: ResourceSchema,
    amount: z.number().int(),
  }),
  z.object({ kind: z.literal('gain-vp'), amount: z.number().int() }),
  z.object({ kind: z.literal('reroll-die') }),
  z.object({ kind: z.literal('modify-die'), delta: z.number().int() }),
]);

export const CardDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: CardKindSchema,
  cost: z.object({
    iron: z.number().int().nonnegative().optional(),
    gold: z.number().int().nonnegative().optional(),
    essence: z.number().int().nonnegative().optional(),
  }),
  effect: CardEffectSchema,
  description: z.string().optional(),
});

export const CardsConfigSchema = z.array(CardDefinitionSchema);

export const RoundGoalDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  direction: z.enum(['highest', 'lowest']),
});

export const RoundGoalsConfigSchema = z.array(RoundGoalDefinitionSchema);

export const SecretGoalDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  vp: z.number().int().positive(),
});

export const SecretGoalsConfigSchema = z.array(SecretGoalDefinitionSchema);

export const RulesConfigSchema = z.object({
  totalRounds: z.number().int().positive(),
  resourceCap: z.number().int().positive(),
  specialistSequence: z.array(z.number().int()),
  freeForAllRound: z.number().int().positive(),
  freeForAllToggles: z.object({
    free: z.boolean(),
    allMercsFree: z.boolean(),
    halfPriceCards: z.boolean(),
    specialistChoosable: z.boolean(),
    waiveCardHandLimit: z.boolean(),
  }),
  threatTrackThreshold: z.number().int().positive(),
});

const ResourceCostSchema = z.object({
  iron: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  essence: z.number().int().nonnegative(),
  comment: z.string().optional(),
});

export const CostsConfigSchema = z.object({
  dieUpgrade: ResourceCostSchema,
  barracksExpand: ResourceCostSchema,
  cardKeep: ResourceCostSchema,
});

export type ParsedRegions = z.infer<typeof RegionsConfigSchema>;
export type ParsedFactions = z.infer<typeof FactionsConfigSchema>;
export type ParsedRules = z.infer<typeof RulesConfigSchema>;
export type ParsedRoundGoals = z.infer<typeof RoundGoalsConfigSchema>;
export type ParsedSecretGoals = z.infer<typeof SecretGoalsConfigSchema>;
export type ParsedCards = z.infer<typeof CardsConfigSchema>;
export type ParsedCosts = z.infer<typeof CostsConfigSchema>;
