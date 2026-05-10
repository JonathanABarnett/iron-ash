// Loads and validates JSON config files. Validation failures throw with a readable error.

import {
  FactionsConfigSchema,
  RegionsConfigSchema,
  RulesConfigSchema,
  type ParsedFactions,
  type ParsedRegions,
  type ParsedRules,
} from '../shared/schemas';
import type { ZodError } from 'zod';
import type { FactionDefinition, Region, RulesConfig } from './types';

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

function formatZodError(err: ZodError): string {
  return err.issues
    .map((i) => `  ${i.path.map(String).join('.') || '<root>'}: ${i.message}`)
    .join('\n');
}
