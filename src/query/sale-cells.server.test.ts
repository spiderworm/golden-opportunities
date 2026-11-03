import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { rmSync } from 'node:fs';
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/sale-cells-');
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { loadBookshop } from '../bookshop/loader.server';
import type { DeepReadonly, SaleLine } from '../bookshop/types';
import { submitPlan, submitQ2Plan, getQ2Candidates } from '../game/game.server';
import { eventOf, queryViewForSave, saves } from '../game/session.server';
import { joinSales, replayLines } from '../game/replay.server';
import { readHistoryAsLines, runQuery } from './run-query.server';
import { rollUpSales } from './sale-cells';
import { DIMENSIONS, FILTER_ONLY_DIMENSIONS, type Dimension, type Query, type QueryView } from './types';

afterAll(() => rmSync(directory, { recursive: true, force: true }));
const quiet = () => {};
const request = (id: string) => new Request('http://localhost/decide', { method: 'POST', headers: { origin: 'http://localhost', cookie: 'orbital_save=' + id } });
const SALES = ['revenue', 'units', 'orders', 'avg_discount', 'avg_order_value', 'orders_per_day'] as const;
const GROUPS = DIMENSIONS.filter(d => !(FILTER_ONLY_DIMENSIONS as readonly string[]).includes(d) && d !== 'stars');
/** The same query over lines and over their cells: the whole result, provenance included, must match. */
function same(query: Query, lines: QueryView, cells: QueryView) {
  expect(runQuery(query, cells, quiet), JSON.stringify(query)).toEqual(runQuery(query, lines, quiet));
}
const views = (view: QueryView): [QueryView, QueryView] => {
  const { simulatedSales, ...rest } = view;
  return [view, { ...rest, simulatedCells: rollUpSales(simulatedSales!) }];
};

describe('sale cells (docs/design/rollups.md)', () => {
  it('count an order spanning cells once in every group, against brute force', { timeout: 60_000 }, () => {
    const template = loadBookshop().saleLines;
    const isbns = [...new Set(template.map(s => s.isbn))].slice(0, 3);
    const of = (isbn: string) => template.find(s => s.isbn === isbn)!;
    const lines: DeepReadonly<SaleLine>[] = [];
    let id = 0;
    const order = (date: string, items: [number, number][]) => { const orderId = `sim-order:${lines.length}`; for (const [book, discount] of items) lines.push({ ...of(isbns[book]!), id: `sim:${id++}`, orderId, date, discount }); };
    // One edition twice at one price; two editions; one edition at two discounts; three cells; and plain orders.
    order('2194-01-05', [[0, 0], [0, 0]]);
    order('2194-01-05', [[0, 0], [1, 0]]);
    order('2194-01-06', [[1, 0], [1, 0.15]]);
    order('2194-02-10', [[0, 0.15], [1, 0.15], [2, 0]]);
    order('2194-02-10', [[2, 0]]);
    order('2194-03-01', [[0, 0], [2, 0.15], [2, 0.15]]);
    const [byLines, byCells] = views({ periods: ['2194-Q1'], includeUndated: false, simulatedSales: lines });
    expect(byCells.simulatedCells!.cells.length).toBeLessThan(lines.length);
    expect(byCells.simulatedCells!.spanning.length).toBe(4);
    for (const measure of SALES) {
      same({ measure, by: [] }, byLines, byCells);
      for (const by of GROUPS) same({ measure, by: [by] }, byLines, byCells);
      for (const by of ['edition', 'discounted', 'format', 'title'] as const) same({ measure, by: ['month', by] }, byLines, byCells);
      same({ measure, by: ['weekday'], filter: { edition: [byLines.simulatedSales![0]!.title + ` (${byLines.simulatedSales![0]!.format})`] } }, byLines, byCells);
    }
  });

  it("give the line path's answers on a real save: every sales measure, by every dimension, pairs and filters", { timeout: 120_000 }, () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: ['repick', 'events'] });
    submitQ2Plan(req, { picks: [getQ2Candidates()[0]!.isbn, null, null], levers: ['events'] });
    // The save's own view is cells now; its lines, replayed and joined, are the old path to compare against.
    const played = saves.read(save.id);
    const lines = played.played.flatMap(q => joinSales(replayLines(q, played.seed, loadBookshop(), eventOf(played, q.period)), loadBookshop()));
    const byCells = queryViewForSave(played);
    const { simulatedCells: _, version: __, ...rest } = byCells;
    const byLines: QueryView = { ...rest, simulatedSales: lines };
    expect(byCells.simulatedCells!.lines).toBe(lines.length);
    expect(byCells.simulatedCells!.cells.length * 3).toBeLessThan(lines.length);
    for (const measure of SALES) {
      same({ measure, by: [] }, byLines, byCells);
      for (const by of GROUPS) same({ measure, by: [by] }, byLines, byCells);
    }
    // Pairs, where an order spans cells most: two editions or two discounts on one date.
    for (const by of GROUPS.filter(d => d !== 'weekday')) same({ measure: 'orders', by: ['weekday', by] as Dimension[] }, byLines, byCells);
    // Filters on every dimension, to a value it has.
    for (const dimension of GROUPS) {
      const first = runQuery({ measure: 'units', by: [dimension] }, byLines, quiet).rows.find(row => row[dimension] != null)?.[dimension];
      if (typeof first !== 'string') continue;
      for (const measure of ['revenue', 'orders'] as const) same({ measure, by: ['month'], filter: { [dimension]: [first] } }, byLines, byCells);
    }
  });

  it("give 2193's answers as its lines did: every sales measure, by every dimension, pairs and filters", { timeout: 120_000 }, () => {
    const view = { periods: ['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4'], includeUndated: true } as QueryView;
    const asLines = (query: Query) => { readHistoryAsLines(true); try { return runQuery(query, view, quiet); } finally { readHistoryAsLines(false); } };
    const check = (query: Query) => expect(runQuery(query, view, quiet), JSON.stringify(query)).toEqual(asLines(query));
    for (const measure of SALES) {
      check({ measure, by: [] });
      for (const by of GROUPS) check({ measure, by: [by] });
    }
    for (const by of GROUPS.filter(d => d !== 'weekday')) check({ measure: 'orders', by: ['weekday', by] as Dimension[] });
    for (const dimension of GROUPS) {
      const first = asLines({ measure: 'units', by: [dimension] }).rows.find(row => row[dimension] != null)?.[dimension];
      if (typeof first === 'string') check({ measure: 'orders', by: ['month'], filter: { [dimension]: [first] } });
    }
  });
});
