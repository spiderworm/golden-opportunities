// A played quarter's sale lines, kept as a hash and replayed (endless.md section 9, "How quarters are kept"). A
// quarter's lines are about 188 bytes each, so a year of stored lines is about 11 MB, and the save's 16 MiB cap
// would end an endless game at about Q3 2195. The engine is pure, so the save keeps the plan and outcome, and the
// lines are regenerated from them and the seed, cached in memory, and checked against the hash taken when the
// quarter was played. A replay that doesn't match (an engine change since) is refused loudly, never rescored.
// Saves from before keep their stored lines, which are used as they are.

import { createHash } from 'node:crypto';
import type { BookshopData, DeepReadonly, JoinedBook, Sale, SaleLine } from '../bookshop/types';
import { rollUpSales, type SaleCells } from '../query/sale-cells';
import { RELEASE, releaseBook } from '../simulation/release';
import type { SimulatedLine } from '../simulation/types';
import { SaveError } from './store.server';
import { linesOfTurn, type TurnEvent } from '../simulation/turn';
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

/**
 * The lines a quarter's plan gives on this seed, under its Alma event from Q3 on: the engine's own replay path
 * (Sim's linesOfTurn), the same lines that played it, without the report card or the anchor.
 */
export function replayLines(quarter: PlayedQuarter, seed: number, data: DeepReadonly<BookshopData>, event: TurnEvent | null = null): Sale[] {
  return visible(linesOfTurn({ quarter: quarter.period, seed, plan: quarter.outcome.plan, event }, data).lines);
}

/**
 * A quarter's lines joined to their editions, books and publishers, as the query layer reads sales. The new volume
 * is generated, not in the data: the engine's records join it (src/simulation/release.ts).
 */
export function joinSales(sales: readonly Sale[], data: DeepReadonly<BookshopData>): DeepReadonly<SaleLine>[] {
  const editions = new Map([...data.editions, RELEASE.edition].map(e => [e.isbn, e]));
  const books = new Map([...data.joinedBooks, releaseBook(data) as DeepReadonly<JoinedBook>].map(b => [b.id, b]));
  const publishers = new Map(data.publishers.map(p => [p.id, p]));
  return sales.map(sale => {
    const edition = editions.get(sale.isbn); const book = edition && books.get(edition.bookId); const publisher = edition && publishers.get(edition.publisherId);
    if (!edition || !book || !publisher) throw new SaveError('INVALID_SAVE');
    return { ...sale, book, title: book.title, author: book.author, genre: book.info?.genre ?? null, format: edition.format, publisher,
      listPrice: edition.listPrice, revenue: edition.listPrice * (1 - sale.discount) } as DeepReadonly<SaleLine>;
  });
}

/** A quarter's lines as the query layer keeps them: rolled up into cells (docs/design/rollups.md). */
const cellsOf = (sales: readonly Sale[], data: DeepReadonly<BookshopData>) => rollUpSales(joinSales(sales, data));

/**
 * Replayed quarters' cells, by save, least recently used save out once the cache holds more than `limit` cells in
 * all, but never the save being read: a save's quarters stay together, so a long endless game doesn't thrash
 * (Audit, #233). A five-year save is about 30,000 cells (302,517 lines), so 600,000 is about a hundred years.
 */
let limit = 600_000;
interface SaveCells { quarters: Map<string, SaleCells>; cells: number }
const cache = new Map<string, SaveCells>();
let total = 0;
/** By the quarter's hash and count too, so a cached replay is only ever returned for the lines it was checked against. */
const keyOf = (quarter: PlayedQuarter) => `${quarter.outcomeId}\0${quarter.lines?.hash}\0${quarter.lines?.count}`;
/** A save's entry, now the most recently used. */
function entry(saveId: string): SaveCells {
  const found = cache.get(saveId) ?? { quarters: new Map(), cells: 0 };
  cache.delete(saveId);
  cache.set(saveId, found);
  return found;
}
function remember(saveId: string, key: string, cells: SaleCells) {
  const save = entry(saveId);
  const old = save.quarters.get(key);
  if (old) { save.cells -= old.cells.length; total -= old.cells.length; }
  save.quarters.set(key, cells);
  save.cells += cells.cells.length; total += cells.cells.length;
  for (const [id, other] of cache) {
    if (total <= limit) break;
    if (id === saveId) continue;
    cache.delete(id); total -= other.cells;
  }
}

/** Keeps the cells of the lines a quarter was just played with, so its first queries don't replay it. */
export function rememberLines(saveId: string, quarter: PlayedQuarter, lines: readonly Sale[], data: DeepReadonly<BookshopData>) {
  remember(saveId, keyOf(quarter), cellsOf(lines, data));
}

/**
 * A played quarter's sales, as cells: an older save's stored lines as they are; otherwise the cached replay, or a
 * fresh one checked against the quarter's count and hash before it's rolled up. A mismatch throws REPLAY_MISMATCH:
 * the engine has changed since the quarter was played, and the save can't be read by this version.
 */
export function quarterCells(saveId: string, seed: number, quarter: PlayedQuarter, data: () => DeepReadonly<BookshopData>, event: TurnEvent | null = null): SaleCells {
  const key = keyOf(quarter);
  const cached = cache.get(saveId)?.quarters.get(key);
  if (cached) { entry(saveId); return cached; }
  let lines: readonly Sale[];
  if (quarter.sales) lines = quarter.sales;
  else {
    lines = replayLines(quarter, seed, data(), event);
    if (lines.length !== quarter.lines.count || linesHash(lines) !== quarter.lines.hash) throw new SaveError('REPLAY_MISMATCH');
  }
  const cells = cellsOf(lines, data());
  remember(saveId, key, cells);
  return cells;
}

/** For tests: forget every replay. */
export const forgetReplays = () => { cache.clear(); total = 0; };
/** For tests: the cache's size, and a smaller bound to exercise it. */
export const replayCacheSize = () => ({ saves: cache.size, cells: total });
export function setReplayCacheLimit(cells: number) { limit = cells; }
