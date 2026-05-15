// Loads and validates JSON config files. Validation failures throw with a readable error.

import {
  CardsConfigSchema,
  CostsConfigSchema,
  FactionsConfigSchema,
  RegionsConfigSchema,
  RoundGoalsConfigSchema,
  RulesConfigSchema,
  SecretGoalsConfigSchema,
  StructuresConfigSchema,
  type ParsedCards,
  type ParsedCosts,
  type ParsedFactions,
  type ParsedRegions,
  type ParsedRoundGoals,
  type ParsedRules,
  type ParsedSecretGoals,
  type ParsedStructures,
} from '../shared/schemas';
import type { ZodError } from 'zod';
import type {
  CardDefinition,
  CostsConfig,
  FactionDefinition,
  Region,
  RoundGoalDefinition,
  RulesConfig,
  SecretGoalDefinition,
  StructureDefinition,
} from './types';

export function parseRegions(raw: unknown): Region[] {
  const result = RegionsConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid regions config:\n${formatZodError(result.error)}`);
  }
  return result.data as ParsedRegions as Region[];
}

export function parseFactions(raw: unknown): FactionDefinition[] {
  const result = FactionsConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid factions config:\n${formatZodError(result.error)}`);
  }
  return result.data as ParsedFactions as FactionDefinition[];
}

export function parseRules(raw: unknown): RulesConfig {
  const result = RulesConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid rules config:\n${formatZodError(result.error)}`);
  }
  return result.data as ParsedRules as RulesConfig;
}

export function parseRoundGoals(raw: unknown): RoundGoalDefinition[] {
  const result = RoundGoalsConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid round-goals config:\n${formatZodError(result.error)}`);
  }
  return result.data as ParsedRoundGoals as RoundGoalDefinition[];
}

export function parseSecretGoals(raw: unknown): SecretGoalDefinition[] {
  const result = SecretGoalsConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid secret-goals config:\n${formatZodError(result.error)}`);
  }
  return result.data as ParsedSecretGoals as SecretGoalDefinition[];
}

export function parseCards(raw: unknown): CardDefinition[] {
  const result = CardsConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid cards config:\n${formatZodError(result.error)}`);
  }
  return result.data as ParsedCards as CardDefinition[];
}

export function parseCosts(raw: unknown): CostsConfig {
  const result = CostsConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid costs config:\n${formatZodError(result.error)}`);
  }
  return result.data as ParsedCosts as CostsConfig;
}

export function parseStructures(raw: unknown): StructureDefinition[] {
  const result = StructuresConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid structures config:\n${formatZodError(result.error)}`);
  }
  return result.data as ParsedStructures as StructureDefinition[];
}

function formatZodError(err: ZodError): string {
  return err.issues
    .map((i) => `  ${i.path.map(String).join('.') || '<root>'}: ${i.message}`)
    .join('\n');
}
