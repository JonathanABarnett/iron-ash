// JSON output helpers for SimulationResult. The runner returns the result
// in-memory; this module only handles serialization.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SimulationResult } from './types';

export function toJSON(result: SimulationResult): string {
  return JSON.stringify(result, null, 2);
}

export function writeResultToFile(result: SimulationResult, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, toJSON(result), 'utf8');
}
