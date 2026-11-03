import { describe, expect, it } from "vitest";
import { loadBookshop } from "../bookshop/loader.server";
import { simulateTurn } from "../simulation/turn";
import type { Plan } from "../simulation/types";
import { waterfall, type PeriodRows, type Split } from "./decompose";
import { runQuery } from "./run-query.server";
import { rollUpSales } from "./sale-cells";
import type { Dimension, QueryView } from "./types";

const quiet = () => {};
const { lines } = simulateTurn(
  { quarter: "2194-Q1", seed: 3, plan: { levers: ["repick", "events"] } as Plan, event: null },
  loadBookshop(),
);
const view: QueryView = {
  periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"],
  includeUndated: false,
  simulatedCells: rollUpSales(lines),
  version: "00000000000000d1",
};
const rowsOf = (by: Dimension, quarter: string): PeriodRows => {
  const run = (measure: "revenue" | "units") =>
    runQuery({ measure, by: [by], filter: { quarter: [quarter] } }, view, quiet);
  return { revenue: run("revenue"), units: run("units") };
};
const sum = (s: Split) => s.price + s.volume + s.mix;

describe("revenue's change on the real ledgers, by every grouping it offers", () => {
  for (const [then, now] of [
    ["2193-Q1", "2193-Q2"],
    ["2193-Q4", "2194-Q1"],
    ["2193-Q1", "2194-Q1"],
  ])
    for (const by of ["genre", "title", "edition"] as const)
      it(`${then} to ${now} by ${by}: the bars sum to the change, and each split to its bar`, () => {
        const a = rowsOf(by, then);
        const b = rowsOf(by, now);
        const w = waterfall(by, a, b, { split: true });
        // The totals are the plain queries' totals.
        expect(w.then).toBe(a.revenue.total);
        expect(w.now).toBe(b.revenue.total);
        const bars = [...w.groups, ...(w.rest ? [w.rest] : [])];
        expect(Math.abs(bars.reduce((t, g) => t + g.change, 0) - (w.now - w.then))).toBeLessThan(
          1e-6,
        );
        for (const g of bars) expect(Math.abs(sum(g.split!) - g.change)).toBeLessThan(1e-6);
        const whole = w.split as Split;
        expect(Math.abs(sum(whole) - (w.now - w.then))).toBeLessThan(1e-6);
        // Price is worked out as what's left; hold it to its formula, Σ U1·(p1 − p0) over groups sold both times.
        const u0 = new Map(a.units!.rows.map((r) => [r[by] ?? null, r.units!]));
        const r0 = new Map(a.revenue.rows.map((r) => [r[by] ?? null, r.revenue!]));
        const r1 = new Map(b.revenue.rows.map((r) => [r[by] ?? null, r.revenue!]));
        let price = 0;
        for (const row of b.units!.rows) {
          const key = row[by] ?? null;
          const sold0 = u0.get(key) ?? 0;
          if (!row.units || !sold0) continue;
          price += row.units * (r1.get(key)! / row.units - r0.get(key)! / sold0);
        }
        expect(Math.abs(whole.price - price)).toBeLessThan(1e-6);
      });
});
