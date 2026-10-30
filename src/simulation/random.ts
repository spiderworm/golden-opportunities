// Seeded randomness. Every lever draws from its own named stream, so a draw in
// one lever never shifts another's: the plan and holding course share every
// stream they both use, and differ only by the decision.

export type Random = () => number;

/** FNV-1a over the seed and the stream's name. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: uniform in [0, 1). */
export function stream(seed: number, name: string): Random {
  let state = hash(`${seed >>> 0}:${name}`);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer from min to max inclusive. */
export const integer = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));

export const pick = <T>(random: Random, items: readonly T[]): T => items[Math.floor(random() * items.length)];

/** Rounds up with probability equal to the fraction, so small counts aren't biased. */
export const roundRandomly = (random: Random, value: number) => Math.floor(value) + (random() < value - Math.floor(value) ? 1 : 0);

/** k distinct indexes from 0..n-1, in ascending order. */
export function sampleIndexes(random: Random, n: number, k: number): number[] {
  const indexes = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < Math.min(k, n); i++) {
    const j = i + Math.floor(random() * (n - i));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes.slice(0, Math.min(k, n)).sort((a, b) => a - b);
}

/** An index drawn with probability proportional to its weight. */
export function weightedIndex(random: Random, weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let target = random() * total;
  for (let i = 0; i < weights.length; i++) {
    target -= weights[i];
    if (target < 0) return i;
  }
  return weights.length - 1;
}
