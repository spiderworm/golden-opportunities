// TEMPORARY stand-in for Frank's game state and simulation (src/game/,
// src/simulation/). It follows the interface agreed with him, so the Decide and
// Result screens can be built now. Delete this folder when his lands.
//
// Holding course replays Q1 2193 from the real data. The other options use the
// illustrative effect sizes from the M1 design (docs/design/m1-slice.md,
// section 3): they are placeholders, not a model. The sentences and rules are
// Plot's copy (docs/design/m1-copy.md), filled with these placeholder numbers.
import { runQuery } from "~/investigate/query-stub.server";
import type { QueryView } from "~/query/types";
import type { Assumption, Metrics, MonthOutcome, OptionId, Outcome, Plan } from "./types";

const VIEW: QueryView = { periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"], includeUndated: true };
const COST_OF_GOODS = 0.6;
const EVENT_COST = 200;
const EVENTS = 12;

// One local player, one quarter: the plan lives in memory until the server restarts.
let submitted: Plan | null = null;

export function submitPlan(_request: Request, plan: Plan): { outcomeId: string } {
  submitted = { option: plan.option };
  return { outcomeId: `stub-${plan.option}` };
}

export function getPlan(_request: Request): Plan | null {
  return submitted;
}

/** For tests and replays of the stub. */
export function resetStub(): void {
  submitted = null;
}

/** Gross profit at 60% cost of list price, for revenue sold at an average discount. */
function grossProfit(revenue: number, avgDiscount: number): number {
  return revenue - COST_OF_GOODS * (revenue / (1 - avgDiscount));
}

function holdCourse(): { monthly: Pick<Metrics, "revenue" | "units">[]; avgDiscount: number } {
  const filter = { quarter: ["2193-Q1"] };
  const revenue = runQuery({ measure: "revenue", by: ["month"], filter }, VIEW).rows;
  const units = runQuery({ measure: "units", by: ["month"], filter }, VIEW).rows;
  const avgDiscount = runQuery({ measure: "avg_discount", by: [], filter }, VIEW).total ?? 0;
  return {
    monthly: revenue.map((row, i) => ({ revenue: row.revenue ?? 0, units: units[i]?.units ?? 0 })),
    avgDiscount,
  };
}

const sum = (rows: Pick<Metrics, "revenue" | "units">[], key: "revenue" | "units") => rows.reduce((t, r) => t + r[key], 0);
const money = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}`;
const signedMoney = (v: number) => `${v < 0 ? "-" : "+"}${money(v)}`;

/** The placeholder effect of each option on holding course, from the design's illustrative table. */
function effect(option: OptionId, hold: Metrics) {
  switch (option) {
    case "A":
      return { revenue: 1, units: 1, profit: 0, eventCosts: 0 };
    case "B":
      return { revenue: 1.02, units: 1.2, profit: -0.22 * hold.grossProfit, eventCosts: 0 };
    case "C":
      return { revenue: 1 + 2600 / hold.revenue, units: 1 + 130 / hold.units, profit: 1500, eventCosts: 0 };
    case "D":
      return { revenue: 1 + 8300 / hold.revenue, units: 1 + 680 / hold.units, profit: 900, eventCosts: EVENTS * EVENT_COST };
  }
}

const RULES: (Omit<Assumption, "usedByPlan"> & { usedBy: OptionId[] })[] = [
  {
    id: "replay",
    source: "setup",
    usedBy: ["A", "B", "C", "D"],
    text: "Q1 2194 repeats Q1 2193: the same titles, months and weekday pattern, with small random day-to-day changes. Holding course uses the same random draws, so the comparison is fair.",
  },
  { id: "botm-price", source: "data", usedBy: ["A", "B", "C"], text: "A Book of the Month is 15% off for the whole month. In 2193, one title was featured each month." },
  {
    id: "botm-extra",
    source: "data",
    usedBy: ["A", "C"],
    text: "Each Book of the Month sells extra copies equal to one of the 12 picks from 2193, drawn at random. Those picks sold between 19 and 173 extra copies; the middle value was 50.",
  },
  { id: "no-cannibalization", source: "assumed", usedBy: ["A", "C"], text: "The extra copies are new sales. They don't take sales from other books." },
  { id: "cost-of-goods", source: "assumed", usedBy: ["A", "B", "C", "D"], text: "Books cost the store 60% of their list price." },
  { id: "sale-response", source: "assumed", usedBy: ["B"], text: "" },
  { id: "event-orders", source: "assumed", usedBy: ["D"], text: "Each author night adds between 30 and 70 orders that day, at Q1's average order value of $13.96." },
  { id: "event-cost", source: "assumed", usedBy: ["D"], text: "Each author night costs $200." },
];

export function getOutcome(request: Request): Outcome | null {
  const plan = getPlan(request);
  if (!plan) return null;

  const base = holdCourse();
  const holdRevenue = sum(base.monthly, "revenue");
  const hold: Metrics = { revenue: holdRevenue, units: sum(base.monthly, "units"), grossProfit: grossProfit(holdRevenue, base.avgDiscount) };
  const e = effect(plan.option, hold);
  const monthly: MonthOutcome[] = base.monthly.map((m, i) => ({
    month: `2194-0${i + 1}`,
    holdCourse: m,
    plan: { revenue: m.revenue * e.revenue, units: Math.round(m.units * e.units) },
  }));
  const planTotals: Metrics = {
    revenue: sum(monthly.map((m) => m.plan), "revenue"),
    units: sum(monthly.map((m) => m.plan), "units"),
    grossProfit: hold.grossProfit + e.profit,
    eventCosts: e.eventCosts,
  };

  // The sale's gross profit at other responses: (1 + response) x (85% of revenue - 60% of list).
  const saleProfit = (response: number) => (1 + response) * (0.85 * hold.revenue - COST_OF_GOODS * (hold.revenue / (1 - base.avgDiscount))) - hold.grossProfit;
  const assumptions: Assumption[] = RULES.map(({ usedBy, ...rule }) => ({
    ...rule,
    text:
      rule.id === "sale-response"
        ? `A station-wide 15% sale sells 20% more of every book. With 10%, gross profit would have changed by ${signedMoney(saleProfit(0.1))}; with 30%, by ${signedMoney(saleProfit(0.3))}.`
        : rule.text,
    usedByPlan: usedBy.includes(plan.option),
  }));

  return {
    plan,
    quarter: "2194-Q1",
    monthly,
    totals: { plan: planTotals, holdCourse: hold },
    score: { value: planTotals.grossProfit - hold.grossProfit, label: "gross profit" },
    assumptions,
    happened: happened(plan.option, planTotals, hold),
    discoveries: [],
  };
}

/** Plot's "What happened" sentences, filled with the stub's numbers. */
function happened(option: OptionId, plan: Metrics, hold: Metrics): string[] {
  const diff = plan.grossProfit - hold.grossProfit;
  switch (option) {
    case "A":
      return [
        "You kept the schedule.",
        "The three Books of the Month sold about 150 extra copies between them.",
        `Because they were already bestsellers, the 15% discount also went on 1,200 copies that would have sold anyway, and that cost $1,450. Gross profit for the quarter was ${money(plan.grossProfit)}.`,
      ];
    case "B":
      return [
        `The sale sold about ${pct(plan.units / hold.units - 1)}% more books than holding course would have.`,
        `Each one earned about $${((hold.grossProfit / hold.units) - (plan.grossProfit / plan.units)).toFixed(2)} less.`,
        `Revenue rose ${pct(plan.revenue / hold.revenue - 1)}% and gross profit fell ${pct(plan.grossProfit / hold.grossProfit - 1)}%.`,
      ];
    case "C":
      return [
        "The three new picks sold about 130 extra copies between them.",
        "Few copies would have sold anyway, so the discount cost only $210.",
        `Gross profit was ${signedMoney(diff)} compared with holding course.`,
      ];
    case "D":
      return [
        "The 12 author nights brought in about 600 extra orders, roughly 50 a night.",
        diff >= 0
          ? `They earned ${money(diff + EVENTS * EVENT_COST)} in gross profit against $2,400 in costs.`
          : `That earned ${money(diff + EVENTS * EVENT_COST)} in gross profit, short of the $2,400 they cost.`,
        `Gross profit was ${money(diff)} ${diff >= 0 ? "higher" : "lower"} than holding course.`,
      ];
  }
}
