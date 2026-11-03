// Sim's check for the rollups (docs/design/rollups.md, "Proof" 1): each quarter's cells, rolled up from the
// engine's own lines, give the outcome's totals. Units and orders match exactly. Revenue matches the engine's
// float total to a millionth of a dollar, the integer path's unit (the measured gap is at most 6.1e-8).
import { describe, expect, it } from 'vitest';
import { loadBookshop } from '../bookshop/loader.server';
import type { DeepReadonly, SaleLine } from '../bookshop/types';
import type { Metrics, Plan, Q2Plan } from '../simulation/types';
import { simulateTurn, type Turn, type TurnEvent } from '../simulation/turn';
import type { QuarterId } from '../simulation/quarters';
import { runQuery } from './run-query.server';
import { rollUpSales, type SaleCells } from './sale-cells';

const data = loadBookshop();
const quiet = () => {};
const NIGHTS: Q2Plan = { picks: [null, null, null], levers: ['events'] };
const SALE: Q2Plan = { picks: [null, null, null], levers: ['sale'] };
const event = (type: string, params: TurnEvent['params'] = {}): TurnEvent => ({ type, params, stretch: null });

/** The cells' totals for a quarter, through the query layer and straight from the cells. */
function totalsOf(quarter: QuarterId, cells: SaleCells) {
  const view = { periods: [quarter], includeUndated: false, simulatedCells: cells };
  const total = (measure: string) => runQuery({ measure, by: [] }, view, quiet).total as number;
  // Straight from the cells: every line's revenue is cents x (10,000 - basis points), in millionths of a dollar.
  const millionths = cells.cells.reduce((t, c) => t + Math.round(c.line.listPrice * 100) * (10_000 - Math.round(c.line.discount * 10_000)) * c.lines, 0);
  const orders = cells.cells.reduce((t, c) => t + c.orders, 0) - cells.spanning.reduce((t, touched) => t + touched.length - 1, 0);
  return { units: total('units'), revenue: total('revenue'), orders: total('orders'), direct: { units: cells.lines, revenue: millionths / 1e6, orders } };
}

function expectMatch(quarter: QuarterId, lines: readonly DeepReadonly<SaleLine>[], metrics: Metrics) {
  const got = totalsOf(quarter, rollUpSales(lines));
  for (const t of [got, got.direct]) {
    expect(t.units).toBe(metrics.units);
    expect(t.orders).toBe(metrics.orders);
    expect(Math.abs(t.revenue - metrics.revenue)).toBeLessThan(1e-6);
  }
}

describe("each quarter's cells give the engine's own totals (Sim, rollups proof 1)", () => {
  const turns: Turn[] = [
    { quarter: '2194-Q1', seed: 3, plan: { levers: ['repick', 'events'] } as Plan, event: null },
    { quarter: '2194-Q1', seed: 4, plan: { levers: ['sale'] } as Plan, event: null },
    { quarter: '2194-Q2', seed: 3, plan: NIGHTS, event: null },
    { quarter: '2194-Q3', seed: 3, plan: SALE, event: event('format_costs', { format: 'Hardcover', percent: 69 }) },
    { quarter: '2194-Q4', seed: 3, plan: NIGHTS, event: event('quiet_days', { weekday: 'Saturday', percent: 25 }) },
    { quarter: '2195-Q1', seed: 5, plan: NIGHTS, event: event('genre_slump', { genre: 'Fiction', month: 2, percent: 20 }) },
    { quarter: '2195-Q3', seed: 5, plan: SALE, event: event('author_fares', { cost: 300 }) },
  ];
  for (const turn of turns)
    it(`${turn.quarter} on seed ${turn.seed}, under the plan and holding course`, { timeout: 60_000 }, () => {
      const { lines, doNothingLines, outcome } = simulateTurn(turn, data);
      // The engine reports orders for both; a quarter's lines are all its own, so no other period leaks in.
      expect(outcome.totals.plan.orders).toBeDefined();
      expectMatch(turn.quarter, lines, outcome.totals.plan);
      expectMatch(turn.quarter, doNothingLines, outcome.totals.holdCourse);
    });
});
