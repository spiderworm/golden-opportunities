import { describe, expect, it } from "vitest";
import tables from "~/bookshop/data.json";
import { joinBookshop } from "~/bookshop/joins";
import type { BookshopTables } from "~/bookshop/types";
import { runQuery } from "~/query/run-query.server";
import { baseline, eventWeeks, historyOf, OBSERVED_EXTRAS, quarterDays, replayedDay, unpromoted } from "./model";
import { simulateQuarter } from "./simulate";
import type { LeverId, Plan } from "./types";

const data = joinBookshop(tables as BookshopTables);
const history = historyOf(data);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const plan = (...levers: LeverId[]): Plan => ({ levers });
const HOLD = plan();
const PLANS: Plan[] = [HOLD, plan("repick"), plan("events"), plan("sale"), plan("repick", "events"), plan("repick", "sale"), plan("events", "sale")];
const profitChange = (p: Plan, seed: number) => {
  const { plan, holdCourse } = simulateQuarter(p, seed, data).outcome.totals;
  return plan.grossProfit - holdCourse.grossProfit;
};
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

describe("determinism", () => {
  it("gives the same output for the same seed", () => {
    for (const p of PLANS) expect(simulateQuarter(p, 42, data)).toEqual(simulateQuarter(p, 42, data));
  });

  it("varies with the seed", () => {
    expect(simulateQuarter(HOLD, 1, data).lines).not.toEqual(simulateQuarter(HOLD, 2, data).lines);
  });

  it("gives every plan the same holding-course line for a seed", () => {
    const hold = simulateQuarter(HOLD, 7, data);
    expect(hold.doNothingLines).toEqual(hold.lines);
    for (const p of PLANS.slice(1)) {
      const result = simulateQuarter(p, 7, data);
      expect(result.doNothingLines).toEqual(hold.doNothingLines);
      expect(result.outcome.totals.holdCourse).toEqual(hold.outcome.totals.plan);
      expect(result.outcome.reportCard.holdCourse).toEqual(hold.outcome.reportCard.plan);
    }
  });

  it("refuses an invalid plan", () => {
    for (const levers of [["sale", "repick"], ["repick", "repick"], ["repick", "events", "sale"], ["option"]])
      expect(() => simulateQuarter({ levers } as Plan, 1, data)).toThrow(/Invalid plan/);
  });

  it("accepts the full unsigned 32-bit range", () => {
    expect(simulateQuarter(HOLD, 0xffffffff, data).lines.length).toBeGreaterThan(7000);
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
    const { lines, outcome } = simulateQuarter(plan("repick"), 5, data);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    expect(lines.every((l) => l.date >= "2194-01-01" && l.date <= "2194-03-31" && l.quarter === 1)).toBe(true);
    const view = { periods: ["2194-Q1" as const], includeUndated: false, simulatedSales: lines };
    const query = (measure: "revenue" | "orders") => runQuery({ measure, by: [] }, view, () => {}).total;
    expect(query("revenue")).toBeCloseTo(outcome.totals.plan.revenue, 6);
    expect(query("orders")).toBe(outcome.totals.plan.orders);
  });
});

describe("last year, measured with the same recipe (scoring.md, Audit's full-precision values)", () => {
  const card = simulateQuarter(HOLD, 1, data).outcome.reportCard.plan;
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

describe("the levers against holding course (m1-slice section 3)", () => {
  it("the sale: revenue rises a little, gross profit falls about 22%, readers rise about 20%", () => {
    for (const seed of SEEDS) {
      const { plan: mine, holdCourse } = simulateQuarter(plan("sale"), seed, data).outcome.totals;
      expect(mine.revenue / holdCourse.revenue - 1).toBeGreaterThan(0);
      expect(mine.revenue / holdCourse.revenue - 1).toBeLessThan(0.06);
      expect(mine.grossProfit / holdCourse.grossProfit - 1).toBeGreaterThan(-0.25);
      expect(mine.grossProfit / holdCourse.grossProfit - 1).toBeLessThan(-0.18);
      expect(mine.orders! / holdCourse.orders! - 1).toBeCloseTo(0.2, 1);
    }
  });

  it("holding course is no change", () => {
    expect(profitChange(HOLD, 1)).toBe(0);
  });

  it("the re-pick: about +$1.5k", () => {
    const mean = SEEDS.reduce((t, seed) => t + profitChange(plan("repick"), seed), 0) / SEEDS.length;
    expect(mean).toBeGreaterThan(1000);
    expect(mean).toBeLessThan(2000);
  });

  it("author nights: within -$0.4k to +$2.3k, plus a margin for the noise in what each night's orders buy", () => {
    const changes = SEEDS.map((seed) => profitChange(plan("events"), seed));
    for (const change of changes) {
      expect(change).toBeGreaterThan(-800);
      expect(change).toBeLessThan(2700);
    }
    const mean = changes.reduce((t, c) => t + c, 0) / changes.length;
    expect(mean).toBeGreaterThan(500);
    expect(mean).toBeLessThan(1300);
  });

  it("author nights: 12 nights on Tuesday to Thursday, in different weeks, each adding 30 to 70 orders", () => {
    expect(eventWeeks()).toHaveLength(13);
    for (const seed of SEEDS) {
      const { outcome } = simulateQuarter(plan("events"), seed, data);
      const events = outcome.facts.events!;
      expect(events.nights).toBe(12);
      expect(events.eventCosts).toBe(2400);
      expect(events.orders).toBeGreaterThanOrEqual(360);
      expect(events.orders).toBeLessThanOrEqual(840);
      expect(outcome.totals.plan.orders! - outcome.totals.holdCourse.orders!).toBe(events.orders);
      // Alone, the nights' own gross profit less their cost is the whole change.
      expect(events.gross - events.eventCosts).toBeCloseTo(outcome.facts.amount, 6);
    }
  });

  it("two levers: the sale's 15% replaces every discount, and it clones author-night orders too", () => {
    const { lines, outcome } = simulateQuarter(plan("events", "sale"), 3, data);
    expect(lines.every((l) => l.discount === 0.15)).toBe(true);
    const nightsOnly = simulateQuarter(plan("events"), 3, data).outcome.totals.plan.orders!;
    expect(outcome.totals.plan.orders! / nightsOnly - 1).toBeCloseTo(0.2, 1);
  });

  it("two levers: the re-pick and the author nights nearly add up", () => {
    // Not exactly: a night's orders that include a featured title are priced by that month's pick.
    for (const seed of [1, 2, 3]) {
      const both = profitChange(plan("repick", "events"), seed);
      expect(Math.abs(both - profitChange(plan("repick"), seed) - profitChange(plan("events"), seed))).toBeLessThan(200);
    }
  });
});

describe("the overall score, against Plot's calibration on seeds 1 to 20 (scoring.md)", () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  const overall = (p: Plan) => seeds.map((seed) => simulateQuarter(p, seed, data).outcome.reportCard.plan.overall);
  const scores = (p: Plan) => overall(p).map((o) => o.score);
  const within = (values: number[], min: number, max: number) => {
    expect(Math.min(...values)).toBeGreaterThanOrEqual(min);
    expect(Math.max(...values)).toBeLessThanOrEqual(max);
  };

  it("holding course: 67 to 70, median 67, bound by Profit", () => {
    const o = overall(HOLD);
    within(o.map((x) => x.score), 67, 70);
    expect(median(o.map((x) => x.score))).toBe(67);
    expect(o.filter((x) => x.binding.includes("profit")).length).toBeGreaterThanOrEqual(18);
  });

  it("the re-pick: 71 to 76, median 72", () => {
    within(scores(plan("repick")), 71, 76);
    expect(Math.abs(median(scores(plan("repick"))) - 72)).toBeLessThanOrEqual(1);
  });

  it("author nights: 69 to 89, median 72", () => {
    within(scores(plan("events")), 69, 89);
    expect(Math.abs(median(scores(plan("events"))) - 72)).toBeLessThanOrEqual(1);
  });

  it("the re-pick and author nights: 85 to 91, median 87, bound by Happiness", () => {
    const o = overall(plan("repick", "events"));
    within(o.map((x) => x.score), 85, 91);
    expect(median(o.map((x) => x.score))).toBe(87);
    expect(o.every((x) => x.binding.includes("happiness"))).toBe(true);
  });

  it("any plan with the sale: 38 to 45, an F, bound by Profit", () => {
    for (const p of [plan("sale"), plan("repick", "sale"), plan("events", "sale")]) {
      const o = overall(p);
      within(o.map((x) => x.score), 38, 45);
      expect(o.every((x) => x.grade === "F" && x.binding.includes("profit"))).toBe(true);
    }
  });

  it("gives author-night visits +20 Happiness, capped at 100", () => {
    const card = (p: Plan) => simulateQuarter(p, 4, data).outcome.reportCard.plan.measures.find((m) => m.id === "happiness")!;
    expect(card(plan("events")).result).toBeGreaterThan(card(HOLD).result + 1);
    expect(card(plan("events")).result).toBeLessThanOrEqual(100);
  });
});

describe("the result copy", () => {
  it("fills every option's sentences, with no unfilled values", () => {
    for (const p of PLANS) {
      const { happened, assumptions } = simulateQuarter(p, 1, data).outcome;
      expect(happened.length).toBeGreaterThanOrEqual(2);
      for (const text of [...happened, ...assumptions.map((a) => a.text)]) expect(text).not.toMatch(/[{}]|NaN|undefined/);
    }
  });

  it("marks the rules the plan used, and only those", () => {
    const used = (p: Plan) => simulateQuarter(p, 1, data).outcome.assumptions.filter((a) => a.usedByPlan).map((a) => a.id);
    const always = ["replay", "botm-price", "botm-extra", "no-cannibalization", "cost-of-goods"];
    expect(used(HOLD)).toEqual(always);
    expect(used(plan("events"))).toEqual([...always, "event-orders", "event-cost", "event-happiness"]);
    expect(used(plan("events", "sale"))).toEqual([...always, "sale-response", "event-orders", "event-cost", "event-happiness"]);
    expect(used(plan("repick", "sale"))).toEqual([...always, "sale-response"]);
    expect(simulateQuarter(HOLD, 1, data).outcome.assumptions.find((a) => a.id === "event-happiness")).toMatchObject({ source: "assumed", usedByPlan: false });
  });

  it("fills the assumptions from the data", () => {
    const text = simulateQuarter(plan("sale"), 1, data).outcome.assumptions.map((a) => a.text).join("\n");
    expect(text).toContain("between 19 and 173 extra copies; the middle value was 50");
    expect(text).toContain("average order value of $13.96");
    expect(text).toContain("Readers at an author night enjoy the night out: those visits get 20 extra happiness points.");
  });

  it("shows one move's sentences in full, and two moves' without their comparisons, then the total", () => {
    const one = simulateQuarter(plan("repick"), 1, data).outcome.happened;
    expect(one).toHaveLength(3);
    expect(one[2]).toMatch(/^Gross profit was [+-]\$[\d,]+ compared with holding course\.$/);
    const two = simulateQuarter(plan("repick", "events"), 1, data).outcome.happened;
    expect(two).toHaveLength(5);
    expect(two[0]).toMatch(/^The three new picks/);
    expect(two[2]).toMatch(/^The 12 author nights/);
    expect(two[4]).toMatch(/^Together, your two moves changed gross profit by \+\$[\d,]+ compared with holding course\.$/);
    expect(simulateQuarter(HOLD, 1, data).outcome.happened[0]).toBe("You kept the schedule.");
  });
});
