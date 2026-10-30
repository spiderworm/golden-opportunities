import { describe, expect, it } from "vitest";
import type { QueryView } from "~/query/types";
import { runQuery } from "./query-stub.server";

// Checked against the figures in Plot's M1 design (docs/design/m1-slice.md, section 2).
const view: QueryView = { periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"], includeUndated: true };
const WEEKEND = ["Saturday", "Sunday"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

describe("query stub", () => {
  it("computes average order value per quarter", () => {
    const rows = runQuery({ measure: "avg_order_value", by: ["quarter"] }, view).rows;
    expect(rows.find((r) => r.quarter === "2193-Q3")!.avg_order_value).toBeCloseTo(14.03, 2);
    expect(rows.find((r) => r.quarter === "2193-Q4")!.avg_order_value).toBeCloseTo(14.12, 2);
  });

  it("divides orders by every eligible calendar day, weekday against weekend", () => {
    const perDay = (quarter: string, weekday: string[]) =>
      runQuery({ measure: "orders_per_day", by: [], filter: { quarter: [quarter], weekday } }, view).total!;
    expect(Math.round(perDay("2193-Q3", WEEKEND))).toBe(245);
    expect(Math.round(perDay("2193-Q4", WEEKEND))).toBe(176);
    expect(Math.round(perDay("2193-Q3", WEEKDAYS))).toBe(199);
    // The design says 107: it divides by the 64 weekdays that had sales. The
    // contract counts all 66, zero-sale days included: 6,878 / 66 = 104.
    expect(Math.round(perDay("2193-Q4", WEEKDAYS))).toBe(104);
  });

  it("doesn't shrink the day count for non-calendar filters", () => {
    const all = runQuery({ measure: "orders_per_day", by: [] }, view).total!;
    const orders = runQuery({ measure: "orders", by: [] }, view).total!;
    expect(all).toBeCloseTo(orders / 365, 6);
    const fiction = runQuery({ measure: "orders_per_day", by: [], filter: { genre: ["Fiction"] } }, view).total!;
    const fictionOrders = runQuery({ measure: "orders", by: [], filter: { genre: ["Fiction"] } }, view).total!;
    expect(fiction).toBeCloseTo(fictionOrders / 365, 6);
  });

  it("labels discount rates as percents, in numeric order", () => {
    const rates = runQuery({ measure: "units", by: ["discount_rate"] }, view).rows.map((r) => r.discount_rate);
    expect(rates).toEqual(["0%", "5%", "10%", "13%", "15%", "20%"]);
  });
});
