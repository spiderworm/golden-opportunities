// The M1 simulation: one plan, one seeded quarter, and the same quarter had the
// player held course. Pure and deterministic: no I/O, no clock, no Math.random.
import type { BookshopData, DeepReadonly } from "~/bookshop/types";
import { assumptions, happened } from "./copy";
import { reportCard } from "./grading";
import { ledger, measures, ratingsOf, type Ledger, type Ratings } from "./measures";
import { baseline, historyOf, leversFor, PICK_DISCOUNT, run, SALE_DISCOUNT, withRelease, YEAR, type History, type Levers, type QuarterNumber, type Run } from "./model";
import { linesOf, ordersOf, type Order } from "./orders";
import { has, isPlan } from "./plan";
import { RELEASE } from "./release";
import type { HappenedFacts, MeasureId, Metrics, MonthOutcome, Plan, ReportCard, SimulationResult } from "./types";
import { MEASURE_IDS } from "./types";

export interface Prepared {
  history: History;
  ratings: Ratings;
  /** The quarter of 2193, measured as it was sold. */
  lastYear: Record<MeasureId, number>;
  /** What scores 70: the quarter of 2193 plus the new volume's expected effect on holding course. */
  anchor: Record<MeasureId, number>;
  quarterlyAverage: Record<MeasureId, number>;
  averageOrderValue: number;
}

/** Holding course's levers: M1's scheduled picks in Q1; from Q2 the calendar starts empty. */
export const holdLevers = (quarter: QuarterNumber): Levers =>
  quarter === 1 ? leversFor({ levers: [] }) : { picks: [null, null, null], sale: null, events: false };

/** The seeds the new volume's expected effect is averaged over, independent of the player's seed (m1-new-volume.md). */
export const EFFECT_SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i);

/**
 * The new volume's expected effect on a quarter of holding course: the mean,
 * over EFFECT_SEEDS, of holding course with the release minus without it.
 */
export function releaseEffect(history: History, ratings: Ratings): Record<MeasureId, number> {
  const effect = Object.fromEntries(MEASURE_IDS.map((id) => [id, 0])) as Record<MeasureId, number>;
  for (const seed of EFFECT_SEEDS) {
    const base = baseline(history, seed);
    const of = (b: readonly Order[]) => measures(run(history, b, seed, holdLevers(history.quarter)).orders, ratings);
    const [withIt, without] = [of(withRelease(history, base, seed)), of(base)];
    for (const id of MEASURE_IDS) effect[id] += (withIt[id] - without[id]) / EFFECT_SEEDS.length;
  }
  return effect;
}

// The history never changes for a loaded dataset, so its derived values are worked out once per quarter.
const prepared = new WeakMap<DeepReadonly<BookshopData>, Map<QuarterNumber, Prepared>>();

export function prepare(data: DeepReadonly<BookshopData>, quarter: QuarterNumber = 1): Prepared {
  let byQuarter = prepared.get(data);
  if (!byQuarter) prepared.set(data, (byQuarter = new Map()));
  const cached = byQuarter.get(quarter);
  if (cached) return cached;
  const history = historyOf(data, quarter);
  const ratings = ratingsOf(data);
  const quarters = [1, 2, 3, 4].map((q) => measures(ordersOf(data.saleLines.filter((l) => l.quarter === q)), ratings));
  const quarterlyAverage = Object.fromEntries(
    MEASURE_IDS.map((id) => [id, quarters.reduce((t, q) => t + q[id], 0) / quarters.length]),
  ) as Record<MeasureId, number>;
  const lastYearOrders = ordersOf(history.lastYear);
  const lastYear = measures(lastYearOrders, ratings);
  // About a quarter of a second, once per quarter.
  const effect = releaseEffect(history, ratings);
  const result: Prepared = {
    history,
    ratings,
    lastYear,
    anchor: Object.fromEntries(MEASURE_IDS.map((id) => [id, lastYear[id] + effect[id]])) as Record<MeasureId, number>,
    quarterlyAverage,
    averageOrderValue: ledger(lastYearOrders).revenue / lastYearOrders.length,
  };
  byQuarter.set(quarter, result);
  return result;
}

const HOLD_COURSE: Plan = { levers: [] };

export const metricsOf = (l: Ledger): Metrics => ({ ...l });

export function cardFor(p: Prepared, r: Run): ReportCard {
  const results = measures(r.orders, p.ratings, r.nights.length, r.nights.reduce((t, n) => t + n.orders, 0));
  return reportCard(
    Object.fromEntries(
      MEASURE_IDS.map((id) => [id, { result: results[id], lastYear: p.anchor[id], quarterlyAverage: p.quarterlyAverage[id] }]),
    ) as Record<MeasureId, { result: number; lastYear: number; quarterlyAverage: number }>,
  );
}

/** The featured editions' copies that would have sold without the promotion, and what their discount cost. */
function pickedCopies(r: Run, months: readonly string[]) {
  let baseCopies = 0;
  let discountCost = 0;
  let extra = 0;
  for (const order of r.orders) {
    // The sale's clones are the sale's doing, not the picks'.
    if (order.saleClone) continue;
    if (order.kind === "pick-extra") {
      extra += 1;
      continue;
    }
    const isbn = r.picks[months.indexOf(order.day.slice(5, 7))];
    for (const item of order.items)
      if (item.isbn === isbn) {
        baseCopies += 1;
        discountCost += PICK_DISCOUNT * item.listPrice;
      }
  }
  return { extra, baseCopies, discountCost };
}

/** The new volume's copies under the plan, and with the sale, how many were 15% off. */
export function releaseFacts(r: Run, sale: boolean): NonNullable<HappenedFacts["release"]> {
  let copies = 0;
  let saleCopies = 0;
  for (const order of r.orders)
    for (const item of order.items)
      if (item.isbn === RELEASE.edition.isbn) {
        copies += 1;
        if (item.discount === SALE_DISCOUNT) saleCopies += 1;
      }
  return sale ? { copies, saleCopies } : { copies };
}

/** The author nights' facts: their own orders, before the sale clones any of them. */
export function eventFacts(r: Run, mine: Ledger): NonNullable<HappenedFacts["events"]> {
  const nights = ledger(r.orders.filter((o) => o.kind === "event" && !o.saleClone));
  const orders = r.nights.reduce((t, n) => t + n.orders, 0);
  return { nights: r.nights.length, orders, perNight: orders / r.nights.length, gross: nights.grossProfit, eventCosts: mine.eventCosts };
}

/** The sale's facts, against holding course. */
export const saleFacts = (mine: Ledger, hold: Ledger): NonNullable<HappenedFacts["sale"]> => ({
  unitsPct: mine.units / hold.units - 1,
  perBook: hold.grossProfit / hold.units - mine.grossProfit / mine.units,
  revPct: mine.revenue / hold.revenue - 1,
  profitPct: mine.grossProfit / hold.grossProfit - 1,
});

function factsFor(plan: Plan, r: Run, months: readonly string[], mine: Ledger, hold: Ledger): HappenedFacts {
  const facts: HappenedFacts = { release: releaseFacts(r, has(plan, "sale")), amount: mine.grossProfit - hold.grossProfit };
  if (plan.levers.length === 0) facts.holdCourse = { ...pickedCopies(r, months), profit: mine.grossProfit };
  if (has(plan, "repick")) facts.repick = pickedCopies(r, months);
  if (has(plan, "events")) facts.events = eventFacts(r, mine);
  if (has(plan, "sale")) facts.sale = saleFacts(mine, hold);
  return facts;
}

/** Revenue and units by month, under the plan and holding course. */
export function monthlyOf(months: readonly string[], planRun: Run, holdRun: Run): MonthOutcome[] {
  const monthOf = (orders: readonly Order[], month: string) => {
    const l = ledger(orders.filter((o) => o.day.slice(5, 7) === month));
    return { revenue: l.revenue, units: l.units };
  };
  return months.map((month) => ({ month: `${YEAR}-${month}`, plan: monthOf(planRun.orders, month), holdCourse: monthOf(holdRun.orders, month) }));
}

/** Plays Q1 2194 under the plan, and under holding course from the same seed (a 32-bit unsigned integer). */
export function simulateQuarter(plan: Plan, seed: number, data: DeepReadonly<BookshopData>): SimulationResult {
  if (!isPlan(plan)) throw new Error("Invalid plan: 0 to 2 distinct levers, in LEVER_IDS order");
  const p = prepare(data);
  const base = withRelease(p.history, baseline(p.history, seed), seed);
  const holdRun = run(p.history, base, seed, leversFor(HOLD_COURSE));
  const planRun = plan.levers.length === 0 ? holdRun : run(p.history, base, seed, leversFor(plan));
  const hold = ledger(holdRun.orders);
  const mine = ledger(planRun.orders, planRun.nights.length);

  // What the sale adds to the plan's other moves (for a plan without the sale, what adding it would have done).
  const others: Plan = { levers: plan.levers.filter((l) => l !== "sale") };
  const profitOf = (levers: Plan, response?: number) => {
    const r = run(p.history, base, seed, leversFor(levers, response));
    return ledger(r.orders, r.nights.length).grossProfit;
  };
  const withoutSale = profitOf(others);
  const saleChange = (response: number) => profitOf({ levers: [...others.levers, "sale"] }, response) - withoutSale;
  const facts = factsFor(plan, planRun, p.history.months, mine, hold);

  return {
    lines: linesOf(planRun.orders, YEAR),
    doNothingLines: linesOf(holdRun.orders, YEAR),
    outcome: {
      plan: { levers: [...plan.levers] },
      quarter: `${YEAR}-Q1`,
      monthly: monthlyOf(p.history.months, planRun, holdRun),
      totals: { plan: metricsOf(mine), holdCourse: metricsOf(hold) },
      reportCard: { plan: cardFor(p, planRun), holdCourse: cardFor(p, holdRun) },
      assumptions: assumptions(plan, { averageOrderValue: p.averageOrderValue, saleAt10: saleChange(0.1), saleAt30: saleChange(0.3) }),
      happened: happened(facts),
      facts,
    },
  };
}
