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

export type ParsedRegions = z.infer<typeof RegionsConfigSchema>;
export type ParsedFactions = z.infer<typeof FactionsConfigSchema>;
export type ParsedRules = z.infer<typeof RulesConfigSchema>;
