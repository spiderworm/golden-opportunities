// TEMPORARY stand-in for Frank's game state and simulation (src/game/,
// src/simulation/). It follows the interface agreed with him, so the Decide and
// Result screens can be built now. Delete this folder when his lands.
//
// Holding course replays Q1 2193 from the real data. The other options use the
// illustrative effect sizes from the M1 design (docs/design/m1-slice.md,
// section 3): they are placeholders, not a model. The sentences and rules are
// Plot's copy (docs/design/m1-copy.md), filled with these placeholder numbers.
import { runQuery } from "~/query/run-query.server";
import { BASELINE_VIEW } from "~/query/view.server";
import { LAST_YEAR, reportCard } from "./report-card";
import type { Assumption, HappenedFacts, MeasureId, Metrics, MonthOutcome, OptionId, Outcome, Plan } from "./types";

// 2193 is the history every playthrough replays.
const VIEW = BASELINE_VIEW;
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

/**
 * The placeholder effect of each option on holding course, from the design's
 * illustrative table. Readers, happiness and culture are invented to give each
 * option the card's intended shape (docs/design/scoring.md, "What this means
 * for M1"): the sale lifts readers, the quiet picks culture, the author nights both.
 */
function effect(option: OptionId, hold: Metrics) {
  switch (option) {
    case "A":
      return { revenue: 1, units: 1, profit: 0, eventCosts: 0, orders: 0, happiness: 0, culture: 1 };
    case "B":
      return { revenue: 1.02, units: 1.2, profit: -0.22 * hold.grossProfit, eventCosts: 0, orders: 1365, happiness: 1.6, culture: 1.03 };
    case "C":
      return { revenue: 1 + 2600 / hold.revenue, units: 1 + 130 / hold.units, profit: 1500, eventCosts: 0, orders: 120, happiness: 0.4, culture: 1.07 };
    case "D":
      return { revenue: 1 + 8300 / hold.revenue, units: 1 + 680 / hold.units, profit: 900, eventCosts: EVENTS * EVENT_COST, orders: 600, happiness: 0.3, culture: 1.09 };
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
  const hold: Metrics = {
    revenue: holdRevenue,
    units: sum(base.monthly, "units"),
    grossProfit: grossProfit(holdRevenue, base.avgDiscount),
    orders: runQuery({ measure: "orders", by: [], filter: { quarter: ["2193-Q1"] } }, VIEW).total ?? 0,
  };
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
    orders: hold.orders! + e.orders,
    eventCosts: e.eventCosts,
  };
  const holdResults: Record<MeasureId, number> = {
    profit: hold.grossProfit,
    readers: hold.orders!,
    happiness: LAST_YEAR.happiness,
    culture: LAST_YEAR.culture,
  };
  const planResults: Record<MeasureId, number> = {
    profit: planTotals.grossProfit,
    readers: planTotals.orders!,
    happiness: holdResults.happiness + e.happiness,
    culture: holdResults.culture * e.culture,
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

  const facts = happenedFacts(plan.option, planTotals, hold);
  return {
    plan,
    quarter: "2194-Q1",
    monthly,
    totals: { plan: planTotals, holdCourse: hold },
    reportCard: { plan: reportCard(planResults), holdCourse: reportCard(holdResults) },
    assumptions,
    happened: happened(facts),
    facts,
    discoveries: [],
  };
}

/** The numbers behind Plot's "What happened" sentences, from the stub's totals. */
function happenedFacts(option: OptionId, plan: Metrics, hold: Metrics): HappenedFacts {
  const amount = plan.grossProfit - hold.grossProfit;
  switch (option) {
    case "A":
      return { option, extra: 150, baseCopies: 1200, discountCost: 1450, profit: plan.grossProfit };
    case "B":
      return {
        option,
        unitsPct: plan.units / hold.units - 1,
        perBook: hold.grossProfit / hold.units - plan.grossProfit / plan.units,
        revPct: plan.revenue / hold.revenue - 1,
        profitPct: plan.grossProfit / hold.grossProfit - 1,
      };
    case "C":
      return { option, extra: 130, baseCopies: 140, discountCost: 210, amount };
    case "D": {
      const eventCosts = EVENTS * EVENT_COST;
      return { option, events: EVENTS, orders: 600, perNight: 50, gross: amount + eventCosts, eventCosts, amount };
    }
  }
}

/** Plot's "What happened" sentences (docs/design/m1-copy.md, section 4), filled from the facts. */
function happened(f: HappenedFacts): string[] {
  switch (f.option) {
    case "A":
      return [
        "You kept the schedule.",
        `The three Books of the Month sold about ${f.extra} extra copies between them.`,
        `Because they were already bestsellers, the 15% discount also went on ${f.baseCopies.toLocaleString("en-US")} copies that would have sold anyway, and that cost ${money(f.discountCost)}. Gross profit for the quarter was ${money(f.profit)}.`,
      ];
    case "B":
      return [
        `The sale sold about ${pct(f.unitsPct)}% more books than holding course would have.`,
        `Each one earned about $${f.perBook.toFixed(2)} less.`,
        `Revenue rose ${pct(f.revPct)}% and gross profit fell ${pct(f.profitPct)}%.`,
      ];
    case "C":
      return [
        `The three new picks sold about ${f.extra} extra copies between them.`,
        `Few copies would have sold anyway, so the discount cost only ${money(f.discountCost)}.`,
        `Gross profit was ${signedMoney(f.amount)} compared with holding course.`,
      ];
    case "D":
      return [
        `The ${f.events} author nights brought in about ${f.orders} extra orders, roughly ${f.perNight} a night.`,
        f.amount >= 0
          ? `They earned ${money(f.gross)} in gross profit against ${money(f.eventCosts)} in costs.`
          : `That earned ${money(f.gross)} in gross profit, short of the ${money(f.eventCosts)} they cost.`,
        `Gross profit was ${money(f.amount)} ${f.amount >= 0 ? "higher" : "lower"} than holding course.`,
      ];
  }
}
