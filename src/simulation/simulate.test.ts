import { describe, expect, it } from "vitest";
import tables from "~/bookshop/data.json";
import { joinBookshop } from "~/bookshop/joins";
import type { BookshopTables } from "~/bookshop/types";
import { runQuery } from "~/query/run-query.server";
import { baseline, eventWeeks, historyOf, OBSERVED_EXTRAS, quarterDays, replayedDay, unpromoted } from "./model";
import { simulateQuarter } from "./simulate";
import type { OptionId } from "./types";

const data = joinBookshop(tables as BookshopTables);
const history = historyOf(data);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const profitChange = (option: OptionId, seed: number) => {
  const { plan, holdCourse } = simulateQuarter({ option }, seed, data).outcome.totals;
  return plan.grossProfit - holdCourse.grossProfit;
};

describe("determinism", () => {
  it("gives the same output for the same seed", () => {
    for (const option of ["A", "B", "C", "D"] as const) expect(simulateQuarter({ option }, 42, data)).toEqual(simulateQuarter({ option }, 42, data));
  });

  it("varies with the seed", () => {
    expect(simulateQuarter({ option: "A" }, 1, data).lines).not.toEqual(simulateQuarter({ option: "A" }, 2, data).lines);
  });

  it("gives every plan the same holding-course line for a seed", () => {
    const hold = simulateQuarter({ option: "A" }, 7, data);
    expect(hold.doNothingLines).toEqual(hold.lines);
    for (const option of ["B", "C", "D"] as const) {
      const result = simulateQuarter({ option }, 7, data);
      expect(result.doNothingLines).toEqual(hold.doNothingLines);
      expect(result.outcome.totals.holdCourse).toEqual(hold.outcome.totals.plan);
      expect(result.outcome.reportCard.holdCourse).toEqual(hold.outcome.reportCard.plan);
    }
  });

  it("accepts the full unsigned 32-bit range", () => {
    expect(simulateQuarter({ option: "A" }, 0xffffffff, data).lines.length).toBeGreaterThan(7000);
  });
});

describe("the replay", () => {
  it("replays the same weekday, a week further back when 364 days leaves the month", () => {
    expect(replayedDay("2194-01-01")).toBe("2193-01-02");
    expect(replayedDay("2194-03-30")).toBe("2193-03-31");
    expect(replayedDay("2194-03-31")).toBe("2193-03-25");
    for (const day of quarterDays(2194)) {
      expect(weekday(replayedDay(day))).toBe(weekday(day));
      expect(replayedDay(day).slice(4, 7)).toBe(day.slice(4, 7));
    }
  });

  it("removes 2193's Books of the Month: the extra copies go, the rest return to full price", () => {
    const orders = unpromoted(history, 1);
    ["01", "02", "03"].forEach((month, m) => {
      const isbn = history.observedPick(month);
      const before = history.lastYear.filter((l) => l.isbn === isbn && l.date.slice(5, 7) === month);
      const after = orders.filter((o) => o.day.slice(5, 7) === month).flatMap((o) => o.items).filter((i) => i.isbn === isbn);
      expect(after.length).toBe(before.length - OBSERVED_EXTRAS[m]);
      expect(after.some((i) => i.discount === 0.15)).toBe(false);
    });
    expect(orders.every((o) => o.items.length > 0)).toBe(true);
  });

  it("keeps each day's orders within the noise", () => {
    const source = unpromoted(history, 3);
    const base = baseline(history, 3);
    for (const day of quarterDays(2194)) {
      const was = source.filter((o) => o.day === replayedDay(day)).length;
      const now = base.filter((o) => o.day === day).length;
      expect(now).toBeGreaterThanOrEqual(Math.floor(was * 0.97));
      expect(now).toBeLessThanOrEqual(Math.ceil(was * 1.03));
    }
  });

  it("serves its lines through the query layer as Q1 2194", () => {
    const { lines, outcome } = simulateQuarter({ option: "C" }, 5, data);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    expect(lines.every((l) => l.date >= "2194-01-01" && l.date <= "2194-03-31" && l.quarter === 1)).toBe(true);
    const view = { periods: ["2194-Q1" as const], includeUndated: false, simulatedSales: lines };
    const query = (measure: "revenue" | "orders") => runQuery({ measure, by: [] }, view, () => {}).total;
    expect(query("revenue")).toBeCloseTo(outcome.totals.plan.revenue, 6);
    expect(query("orders")).toBe(outcome.totals.plan.orders);
  });
});

describe("last year, measured with the same recipe (scoring.md, Audit's full-precision values)", () => {
  const card = simulateQuarter({ option: "A" }, 1, data).outcome.reportCard.plan;
  const lastYear = Object.fromEntries(card.measures.map((m) => [m.id, m.lastYear]));
  const goal = Object.fromEntries(card.measures.map((m) => [m.id, m.goal]));

  it("matches Q1 2193", () => {
    expect(lastYear.profit).toBeCloseTo(37641.5838, 3);
    expect(lastYear.readers).toBe(6825);
    expect(lastYear.happiness).toBeCloseTo(65.0706157004866, 9);
    expect(lastYear.culture).toBeCloseTo(17367.71412700332, 6);
  });

  it("sets the M1 goals", () => {
    expect(goal.profit).toBeCloseTo(39523.663, 3);
    expect(goal.readers).toBe(7166.25);
    expect(goal.happiness).toBeCloseTo(68.3241, 4);
    expect(goal.culture).toBeCloseTo(18236.0998, 4);
  });
});

describe("the options against holding course (m1-slice section 3)", () => {
  it("B: revenue rises a little, gross profit falls about 22%, readers rise about 20%", () => {
    for (const seed of SEEDS) {
      const { plan, holdCourse } = simulateQuarter({ option: "B" }, seed, data).outcome.totals;
      expect(plan.revenue / holdCourse.revenue - 1).toBeGreaterThan(0);
      expect(plan.revenue / holdCourse.revenue - 1).toBeLessThan(0.06);
      expect(plan.grossProfit / holdCourse.grossProfit - 1).toBeGreaterThan(-0.25);
      expect(plan.grossProfit / holdCourse.grossProfit - 1).toBeLessThan(-0.18);
      expect(plan.orders! / holdCourse.orders! - 1).toBeCloseTo(0.2, 1);
    }
  });

  it("A is holding course", () => {
    expect(profitChange("A", 1)).toBe(0);
  });

  it("C: about +$1.5k", () => {
    const changes = SEEDS.map((seed) => profitChange("C", seed));
    const mean = changes.reduce((t, c) => t + c, 0) / changes.length;
    expect(mean).toBeGreaterThan(1000);
    expect(mean).toBeLessThan(2000);
  });

  it("D: within -$0.4k to +$2.3k, plus a margin for the noise in what each night's orders buy", () => {
    const changes = SEEDS.map((seed) => profitChange("D", seed));
    for (const change of changes) {
      expect(change).toBeGreaterThan(-800);
      expect(change).toBeLessThan(2700);
    }
    const mean = changes.reduce((t, c) => t + c, 0) / changes.length;
    expect(mean).toBeGreaterThan(500);
    expect(mean).toBeLessThan(1300);
  });

  it("D holds 12 nights on Tuesday to Thursday, in different weeks, each adding 30 to 70 orders", () => {
    expect(eventWeeks()).toHaveLength(13);
    for (const seed of SEEDS) {
      const { outcome } = simulateQuarter({ option: "D" }, seed, data);
      const facts = outcome.facts;
      if (facts.option !== "D") throw new Error("expected D's facts");
      expect(facts.events).toBe(12);
      expect(facts.eventCosts).toBe(2400);
      expect(facts.orders).toBeGreaterThanOrEqual(360);
      expect(facts.orders).toBeLessThanOrEqual(840);
      expect(outcome.totals.plan.orders! - outcome.totals.holdCourse.orders!).toBe(facts.orders);
    }
  });
});

describe("the result copy", () => {
  it("fills every option's sentences, with no unfilled values", () => {
    for (const option of ["A", "B", "C", "D"] as const) {
      const { happened, assumptions } = simulateQuarter({ option }, 1, data).outcome;
      expect(happened.length).toBeGreaterThanOrEqual(2);
      for (const text of [...happened, ...assumptions.map((a) => a.text)]) expect(text).not.toMatch(/[{}]|NaN|undefined/);
    }
  });

  it("marks the rules the plan used, and only those", () => {
    const used = (option: OptionId) => simulateQuarter({ option }, 1, data).outcome.assumptions.filter((a) => a.usedByPlan).map((a) => a.id);
    expect(used("D")).toEqual(["replay", "cost-of-goods", "event-orders", "event-cost"]);
    expect(used("B")).toEqual(["replay", "botm-price", "cost-of-goods", "sale-response"]);
  });

  it("fills the assumptions from the data", () => {
    const text = simulateQuarter({ option: "B" }, 1, data).outcome.assumptions.map((a) => a.text).join("\n");
    expect(text).toContain("between 19 and 173 extra copies; the middle value was 50");
    expect(text).toContain("average order value of $13.96");
  });
});
