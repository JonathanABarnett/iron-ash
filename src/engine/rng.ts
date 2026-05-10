// Seedable, serializable RNG used by every randomness path in the engine.
// No engine code may call Math.random() — go through Rng instead so games replay.

import seedrandom from 'seedrandom';

// seedrandom's default Arc4 algorithm has a state shape of { i, j, S[] }.
// We declare it locally to keep RngSnapshot serializable and avoid wrestling
// with seedrandom's CJS-style namespace export.
export interface Arc4State {
  i: number;
  j: number;
  S: number[];
}

interface StatefulPRNG {
  (): number;
  double(): number;
  int32(): number;
  quick(): number;
  state(): Arc4State;
}

export interface RngSnapshot {
  seed: string;
  state: Arc4State;
}

export class Rng {
  private generator: StatefulPRNG;
  private readonly seed: string;

  constructor(seed: string, state?: Arc4State) {
    this.seed = seed;
    if (state !== undefined) {
      this.generator = seedrandom(seed, { state }) as StatefulPRNG;
    } else {
      this.generator = seedrandom(seed, { state: true }) as StatefulPRNG;
    }
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.generator();
  }

  /** Integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.nextInt: max (${max}) < min (${min})`);
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    const idx = this.nextInt(0, arr.length - 1);
    const value = arr[idx];
    if (value === undefined) throw new Error('Rng.pick: undefined element');
    return value;
  }

  /** Fisher-Yates shuffle, returns new array, original untouched. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const a = out[i]!;
      const b = out[j]!;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  snapshot(): RngSnapshot {
    return { seed: this.seed, state: this.generator.state() };
  }

  static fromSnapshot(snapshot: RngSnapshot): Rng {
    return new Rng(snapshot.seed, snapshot.state);
  }
}

/** Deterministic-id generator backed by an Rng. */
export function makeIdFactory(rng: Rng, prefix: string): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    const tag = rng.nextInt(0, 0xffff).toString(16).padStart(4, '0');
    return `${prefix}-${counter.toString(16)}-${tag}`;
  };
}
