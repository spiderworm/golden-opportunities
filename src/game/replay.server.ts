// A played quarter's sale lines, kept as a hash and replayed (endless.md section 9, "How quarters are kept"). A
// quarter's lines are about 188 bytes each, so a year of stored lines is about 11 MB, and the save's 16 MiB cap
// would end an endless game at about Q3 2195. The engine is pure, so the save keeps the plan and outcome, and the
// lines are regenerated from them and the seed, cached in memory, and checked against the hash taken when the
// quarter was played. A replay that doesn't match (an engine change since) is refused loudly, never rescored.
// Saves from before keep their stored lines, which are used as they are.

import { createHash } from 'node:crypto';
import type { BookshopData, DeepReadonly, Sale } from '../bookshop/types';
import { simulateQ2 } from '../simulation/q2';
import { simulateQuarter } from '../simulation/simulate';
import type { SimulatedLine } from '../simulation/types';
import { SaveError } from './store.server';
import type { PlayedQuarter } from './types';

/** The columns a save keeps of a simulated line: the source sales' shape. */
export const visible = (lines: readonly SimulatedLine[]): Sale[] => lines.map(({ id, sourceSheet, sourceRow, date, quarter, isbn, discount, itemId, orderId }) =>
  ({ id, sourceSheet, sourceRow, date, quarter, isbn, discount, itemId, orderId }));

/** SHA-256 over every line's identity, day, edition, discount and order, in order: what a replay must reproduce. */
export function linesHash(lines: readonly Sale[]): string {
  const hash = createHash('sha256');
  for (const l of lines) hash.update(`${l.id}\0${l.date}\0${l.isbn}\0${l.discount}\0${l.orderId}\n`);
  return hash.digest('hex');
}

/** The lines a quarter's plan gives on this seed: the same call that played it. */
export function replayLines(quarter: PlayedQuarter, seed: number, data: DeepReadonly<BookshopData>): Sale[] {
  if (quarter.period === '2194-Q1') return visible(simulateQuarter(quarter.outcome.plan, seed, data).lines);
  return visible(simulateQ2(quarter.outcome.plan, seed, data).lines);
}

/** Replayed lines by save and quarter, least recently used out: a few dozen quarters of 8,000 to 22,000 lines. */
const MAX_CACHED = 48;
const cache = new Map<string, readonly Sale[]>();
/** By the quarter's hash and count too, so a cached replay is only ever returned for the lines it was checked against. */
const keyOf = (saveId: string, quarter: PlayedQuarter) => `${saveId}\0${quarter.outcomeId}\0${quarter.lines?.hash}\0${quarter.lines?.count}`;
function remember(key: string, lines: readonly Sale[]) {
  cache.delete(key);
  cache.set(key, lines);
  for (const oldest of cache.keys()) { if (cache.size <= MAX_CACHED) break; cache.delete(oldest); }
}

/** Keeps the lines a quarter was just played with, so its first queries don't replay it. */
export function rememberLines(saveId: string, quarter: PlayedQuarter, lines: readonly Sale[]) { remember(keyOf(saveId, quarter), lines); }

/**
 * A played quarter's lines: stored ones as they are; otherwise the cached replay, or a fresh one checked against
 * the quarter's count and hash. A mismatch throws REPLAY_MISMATCH: the engine has changed since the quarter was
 * played, and the save can't be read by this version.
 */
export function quarterLines(saveId: string, seed: number, quarter: PlayedQuarter, data: () => DeepReadonly<BookshopData>): readonly Sale[] {
  if (quarter.sales) return quarter.sales;
  const key = keyOf(saveId, quarter);
  const cached = cache.get(key);
  if (cached) { remember(key, cached); return cached; }
  const lines = replayLines(quarter, seed, data());
  if (lines.length !== quarter.lines.count || linesHash(lines) !== quarter.lines.hash) throw new SaveError('REPLAY_MISMATCH');
  remember(key, lines);
  return lines;
}

/** For tests: forget every replay. */
export const forgetReplays = () => cache.clear();
