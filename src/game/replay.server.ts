// A played quarter's sale lines, kept as a hash and replayed (endless.md section 9, "How quarters are kept"). A
// quarter's lines are about 188 bytes each, so a year of stored lines is about 11 MB, and the save's 16 MiB cap
// would end an endless game at about Q3 2195. The engine is pure, so the save keeps the plan and outcome, and the
// lines are regenerated from them and the seed, cached in memory, and checked against the hash taken when the
// quarter was played. A replay that doesn't match (an engine change since) is refused loudly, never rescored.
// Saves from before keep their stored lines, which are used as they are.

import { createHash } from 'node:crypto';
import type { BookshopData, DeepReadonly, Sale } from '../bookshop/types';
import type { SimulatedLine } from '../simulation/types';
import { SaveError } from './store.server';
import { linesOfTurn, type TurnEvent } from '../simulation/turn';
import type { PlayedQuarter } from './types';

/** A replay that doesn't match: the engine changed since `quarter`, the first quarter that no longer replays. */
export class ReplayMismatch extends SaveError {
  readonly quarter: PlayedQuarter['period'];
  constructor(quarter: PlayedQuarter['period']) { super('REPLAY_MISMATCH'); this.quarter = quarter; }
}

/** The columns a save keeps of a simulated line: the source sales' shape. */
export const visible = (lines: readonly SimulatedLine[]): Sale[] => lines.map(({ id, sourceSheet, sourceRow, date, quarter, isbn, discount, itemId, orderId }) =>
  ({ id, sourceSheet, sourceRow, date, quarter, isbn, discount, itemId, orderId }));

/** SHA-256 over every line's identity, day, edition, discount and order, in order: what a replay must reproduce. */
export function linesHash(lines: readonly Sale[]): string {
  const hash = createHash('sha256');
  for (const l of lines) hash.update(`${l.id}\0${l.date}\0${l.isbn}\0${l.discount}\0${l.orderId}\n`);
  return hash.digest('hex');
}

/**
 * The lines a quarter's plan gives on this seed, under its Alma event from Q3 on: the engine's own replay path
 * (Sim's linesOfTurn), the same lines that played it, without the report card or the anchor.
 */
export function replayLines(quarter: PlayedQuarter, seed: number, data: DeepReadonly<BookshopData>, event: TurnEvent | null = null): Sale[] {
  return visible(linesOfTurn({ quarter: quarter.period, seed, plan: quarter.outcome.plan, event }, data).lines);
}

/**
 * Replayed lines, by save, least recently used save out once the cache holds more than `limit` lines in all, but
 * never the save being read: a save's quarters stay together, so a long endless game doesn't thrash (Audit, #233).
 * 1.5 million lines is about five five-year saves (some 290,000 lines each).
 */
let limit = 1_500_000;
interface SaveLines { quarters: Map<string, readonly Sale[]>; lines: number }
const cache = new Map<string, SaveLines>();
let total = 0;
/** By the quarter's hash and count too, so a cached replay is only ever returned for the lines it was checked against. */
const keyOf = (quarter: PlayedQuarter) => `${quarter.outcomeId}\0${quarter.lines?.hash}\0${quarter.lines?.count}`;
/** A save's entry, now the most recently used. */
function entry(saveId: string): SaveLines {
  const found = cache.get(saveId) ?? { quarters: new Map(), lines: 0 };
  cache.delete(saveId);
  cache.set(saveId, found);
  return found;
}
function remember(saveId: string, key: string, lines: readonly Sale[]) {
  const save = entry(saveId);
  const old = save.quarters.get(key);
  if (old) { save.lines -= old.length; total -= old.length; }
  save.quarters.set(key, lines);
  save.lines += lines.length; total += lines.length;
  for (const [id, other] of cache) {
    if (total <= limit) break;
    if (id === saveId) continue;
    cache.delete(id); total -= other.lines;
  }
}

/** Keeps the lines a quarter was just played with, so its first queries don't replay it. */
export function rememberLines(saveId: string, quarter: PlayedQuarter, lines: readonly Sale[]) { remember(saveId, keyOf(quarter), lines); }

/**
 * A played quarter's lines: stored ones as they are; otherwise the cached replay, or a fresh one checked against
 * the quarter's count and hash. A mismatch throws REPLAY_MISMATCH: the engine has changed since the quarter was
 * played, and the save can't be read by this version.
 */
export function quarterLines(saveId: string, seed: number, quarter: PlayedQuarter, data: () => DeepReadonly<BookshopData>, event: TurnEvent | null = null): readonly Sale[] {
  if (quarter.sales) return quarter.sales;
  const key = keyOf(quarter);
  const cached = cache.get(saveId)?.quarters.get(key);
  if (cached) { entry(saveId); return cached; }
  const lines = replayLines(quarter, seed, data(), event);
  if (lines.length !== quarter.lines.count || linesHash(lines) !== quarter.lines.hash) throw new ReplayMismatch(quarter.period);
  remember(saveId, key, lines);
  return lines;
}

/** For tests: forget every replay. */
export const forgetReplays = () => { cache.clear(); total = 0; };
/** For tests: the cache's size, and a smaller bound to exercise it. */
export const replayCacheSize = () => ({ saves: cache.size, lines: total });
export function setReplayCacheLimit(lines: number) { limit = lines; }
