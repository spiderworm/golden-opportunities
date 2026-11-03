// Q2 2194: "Pick the books" (docs/design/q2.md, section 8). The calendar starts
// empty, the player picks an edition or none for each month, plus at most one
// other move. Same model as M1, run on Q2; pure and deterministic.
import type { BookshopData, DeepReadonly } from "~/bookshop/types";
import { applyConditions, type Conditions } from "./conditions";
import { MONTH_NAMES, q2Assumptions, q2Happened, type QuarterCopy } from "./copy";
import { ledger } from "./measures";
import {
  baseline,
  PICK_DISCOUNT,
  run,
  SALE_RESPONSE,
  withRelease,
  YEAR,
  type Levers,
  type QuarterNumber,
  type Run,
} from "./model";
import { linesOf } from "./orders";
import { isQ2Plan } from "./plan";
import { RELEASE } from "./release";
import {
  cardFor,
  eventFacts,
  historyFor,
  metricsOf,
  monthlyOf,
  prepare,
  saleFacts,
} from "./simulate";
import type {
  MeasureId,
  PickCandidate,
  PickFacts,
  Q2Facts,
  Q2Plan,
  Q2SimulationResult,
} from "./types";

const QUARTER = 2;
const candidatesOf = new WeakMap<DeepReadonly<BookshopData>, PickCandidate[]>();

/** Every edition sold in 2193 and the new volume, by title and then format: the editions a Book of the Month can be. */
export function q2Candidates(data: DeepReadonly<BookshopData>): readonly PickCandidate[] {
  const cached = candidatesOf.get(data);
  if (cached) return cached;
  const byIsbn = new Map<string, PickCandidate>();
  for (const l of data.saleLines)
    if (!byIsbn.has(l.isbn))
      byIsbn.set(l.isbn, {
        isbn: l.isbn,
        bookId: l.book.id,
        title: l.title,
        format: l.format,
        listPrice: l.listPrice,
      });
  const { book, edition } = RELEASE;
  byIsbn.set(edition.isbn, {
    isbn: edition.isbn,
    bookId: book.id,
    title: book.title,
    format: edition.format,
    listPrice: edition.listPrice,
  });
  const list = [...byIsbn.values()].sort(
    (a, b) => a.title.localeCompare(b.title, "en-US") || a.format.localeCompare(b.format, "en-US"),
  );
  candidatesOf.set(data, list);
  return list;
}

function leversOf(plan: Q2Plan, saleResponse = SALE_RESPONSE): Levers {
  return {
    picks: plan.picks,
    sale: plan.levers.includes("sale") ? saleResponse : null,
    events: plan.levers.includes("events"),
  };
}

/** Each month's pick: the extra copies, and the copies that would have sold anyway with what their discount cost. */
function pickFacts(
  r: Run,
  months: readonly string[],
  candidates: ReadonlyMap<string, PickCandidate>,
): (PickFacts | null)[] {
  return months.map((month, m) => {
    const isbn = r.picks[m];
    if (isbn === null) return null;
    const { title, format } = candidates.get(isbn)!;
    const facts: PickFacts = { isbn, title, format, extra: 0, baseCopies: 0, discountCost: 0 };
    for (const order of r.orders) {
      // The sale's clones are the sale's doing, not the pick's.
      if (order.saleClone || order.day.slice(5, 7) !== month) continue;
      for (const item of order.items) {
        if (item.isbn !== isbn) continue;
        if (item.extra) facts.extra += 1;
        else {
          facts.baseCopies += 1;
          facts.discountCost += PICK_DISCOUNT * item.listPrice;
        }
      }
    }
    return facts;
  });
}

/** Why a plan can't be played: its shape, an edition that can't be picked, or one title picked twice. */
export type Q2PlanProblem = "shape" | "unknown-edition" | "same-title";

const PROBLEMS: Record<Q2PlanProblem, string> = {
  shape: "three months of an ISBN or null, and at most one of events or sale",
  "unknown-edition": "a pick isn't an edition sold in 2193 or the new volume",
  "same-title": "the same title picked twice",
};

/** The player's mistake, if any, so the game can refuse the plan (a 400) before simulating; null for a playable plan. */
export function q2PlanProblem(
  plan: unknown,
  data: DeepReadonly<BookshopData>,
): Q2PlanProblem | null {
  if (!isQ2Plan(plan)) return "shape";
  const candidates = new Map(q2Candidates(data).map((c) => [c.isbn, c]));
  const chosen = plan.picks.filter((isbn): isbn is string => isbn !== null);
  if (!chosen.every((isbn) => candidates.has(isbn))) return "unknown-edition";
  if (new Set(chosen.map((isbn) => candidates.get(isbn)!.bookId)).size !== chosen.length)
    return "same-title";
  return null;
}

/**
 * A quarter played with Q2's form (endless.md section 4): any quarter from Q2 2194, with its year, its
 * anchor and goals, and its event's conditions. Q2 2194's own, with no event, by default.
 */
export interface PicksQuarter {
  year: number;
  quarter: QuarterNumber;
  /** What scores 70: Prepared.anchor by default; a later quarter's adds its event's expected effect. */
  anchor?: Record<MeasureId, number>;
  /** Goals other than the usual stretch: Alma's extra stretch or a recovery goal. */
  goals?: Partial<Record<MeasureId, number>>;
  conditions?: Conditions;
  copy?: QuarterCopy;
}

const Q2_2194: PicksQuarter = { year: YEAR, quarter: QUARTER };
const HOLD: Q2Plan = { picks: [null, null, null], levers: [] };

/** The plan's and holding course's runs from the same seed, under the quarter's conditions. */
function runsOf(plan: Q2Plan, seed: number, data: DeepReadonly<BookshopData>, setup: PicksQuarter) {
  const problem = q2PlanProblem(plan, data);
  if (problem) throw new Error(`Invalid Q2 plan: ${PROBLEMS[problem]}`);
  const history = historyFor(data, setup.quarter, setup.year);
  const conditions = setup.conditions ?? { costs: {} };
  const base = applyConditions(
    history,
    withRelease(history, baseline(history, seed), seed),
    seed,
    conditions,
  );
  const runOf = (q: Q2Plan, response?: number) => run(history, base, seed, leversOf(q, response));
  const holdRun = runOf(HOLD);
  const planRun =
    plan.picks.every((isbn) => isbn === null) && plan.levers.length === 0 ? holdRun : runOf(plan);
  return { conditions, runOf, holdRun, planRun };
}

/** The quarter's sale lines under the plan and under holding course, without the report card: for a save's replay. */
export function picksLines(
  plan: Q2Plan,
  seed: number,
  data: DeepReadonly<BookshopData>,
  setup: PicksQuarter = Q2_2194,
) {
  const { holdRun, planRun } = runsOf(plan, seed, data, setup);
  return {
    lines: linesOf(planRun.orders, setup.year, setup.quarter),
    doNothingLines: linesOf(holdRun.orders, setup.year, setup.quarter),
  };
}

/** Plays a quarter under the plan, and under holding course (the empty calendar) from the same seed. Throws for a plan with a problem. */
export function simulatePicks(
  plan: Q2Plan,
  seed: number,
  data: DeepReadonly<BookshopData>,
  setup: PicksQuarter = Q2_2194,
): Q2SimulationResult {
  const candidates = new Map(q2Candidates(data).map((c) => [c.isbn, c]));
  const { conditions, runOf, holdRun, planRun } = runsOf(plan, seed, data, setup);
  const p = prepare(data, setup.quarter, setup.year);
  const { costs } = conditions;
  const anchor = setup.anchor ?? p.anchor;
  const holdLedger = ledger(holdRun.orders, 0, costs);
  const mine = ledger(planRun.orders, planRun.nights.length, costs);

  // What the sale adds to the plan's other moves (for a plan without the sale, what adding it would have done).
  const others = plan.levers.filter((l) => l !== "sale");
  const profitOf = (q: Q2Plan, response?: number) => {
    const r = runOf(q, response);
    return ledger(r.orders, r.nights.length, costs).grossProfit;
  };
  const withoutSale = profitOf({ picks: plan.picks, levers: others });
  const saleChange = (response: number) =>
    profitOf({ picks: plan.picks, levers: [...others, "sale"] }, response) - withoutSale;

  const facts: Q2Facts = {
    picks: pickFacts(planRun, p.history.months, candidates),
    amount: mine.grossProfit - holdLedger.grossProfit,
  };
  if (plan.levers.includes("events")) facts.events = eventFacts(planRun, mine);
  if (plan.levers.includes("sale")) facts.sale = saleFacts(mine, holdLedger);
  const months = p.history.months.map((m) => MONTH_NAMES[Number(m) - 1]);

  return {
    lines: linesOf(planRun.orders, setup.year, setup.quarter),
    doNothingLines: linesOf(holdRun.orders, setup.year, setup.quarter),
    outcome: {
      plan: { picks: [...plan.picks], levers: [...plan.levers] },
      quarter: `${setup.year}-Q${setup.quarter}`,
      monthly: monthlyOf(p.history.months, planRun, holdRun, setup.year),
      totals: { plan: metricsOf(mine), holdCourse: metricsOf(holdLedger) },
      reportCard: {
        plan: cardFor(p, planRun, anchor, setup.goals, costs),
        holdCourse: cardFor(p, holdRun, anchor, setup.goals, costs),
      },
      assumptions: q2Assumptions(
        plan,
        {
          averageOrderValue: p.averageOrderValue,
          saleAt10: saleChange(0.1),
          saleAt30: saleChange(0.3),
        },
        setup.quarter,
        setup.copy,
      ),
      happened: q2Happened(facts, months),
      facts,
    },
  };
}

/** Plays Q2 2194 under the plan, and under holding course (the empty calendar) from the same seed. Throws for a plan with a problem. */
export function simulateQ2(
  plan: Q2Plan,
  seed: number,
  data: DeepReadonly<BookshopData>,
): Q2SimulationResult {
  return simulatePicks(plan, seed, data);
}
