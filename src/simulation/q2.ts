// Q2 2194: "Pick the books" (docs/design/q2.md, section 8). The calendar starts
// empty, the player picks an edition or none for each month, plus at most one
// other move. Same model as M1, run on Q2; pure and deterministic.
import type { BookshopData, DeepReadonly } from "~/bookshop/types";
import { q2Assumptions, q2Happened } from "./copy";
import { ledger } from "./measures";
import { baseline, PICK_DISCOUNT, run, SALE_RESPONSE, YEAR, type Levers, type Run } from "./model";
import { linesOf } from "./orders";
import { isQ2Plan } from "./plan";
import { cardFor, eventFacts, metricsOf, monthlyOf, prepare, saleFacts } from "./simulate";
import type { PickCandidate, PickFacts, Q2Facts, Q2Plan, Q2SimulationResult } from "./types";

const QUARTER = 2;
const candidatesOf = new WeakMap<DeepReadonly<BookshopData>, PickCandidate[]>();

/** Every edition sold in 2193, by title and then format: the editions a Book of the Month can be. */
export function q2Candidates(data: DeepReadonly<BookshopData>): readonly PickCandidate[] {
  const cached = candidatesOf.get(data);
  if (cached) return cached;
  const byIsbn = new Map<string, PickCandidate>();
  for (const l of data.saleLines)
    if (!byIsbn.has(l.isbn)) byIsbn.set(l.isbn, { isbn: l.isbn, bookId: l.book.id, title: l.title, format: l.format, listPrice: l.listPrice });
  const list = [...byIsbn.values()].sort((a, b) => a.title.localeCompare(b.title, "en-US") || a.format.localeCompare(b.format, "en-US"));
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
function pickFacts(r: Run, months: readonly string[], candidates: ReadonlyMap<string, PickCandidate>): (PickFacts | null)[] {
  return months.map((month, m) => {
    const isbn = r.picks[m];
    if (isbn === null) return null;
    const { title, format } = candidates.get(isbn)!;
    const facts: PickFacts = { isbn, title, format, extra: 0, baseCopies: 0, discountCost: 0 };
    for (const order of r.orders) {
      // The sale's clones are the sale's doing, not the pick's.
      if (order.saleClone || order.day.slice(5, 7) !== month) continue;
      if (order.kind === "pick-extra") {
        if (order.items[0].isbn === isbn) facts.extra += 1;
        continue;
      }
      for (const item of order.items)
        if (item.isbn === isbn) {
          facts.baseCopies += 1;
          facts.discountCost += PICK_DISCOUNT * item.listPrice;
        }
    }
    return facts;
  });
}

/** Plays Q2 2194 under the plan, and under holding course (the empty calendar) from the same seed. */
export function simulateQ2(plan: Q2Plan, seed: number, data: DeepReadonly<BookshopData>): Q2SimulationResult {
  if (!isQ2Plan(plan)) throw new Error("Invalid Q2 plan: three months of an ISBN or null, and at most one of events or sale");
  const candidates = new Map(q2Candidates(data).map((c) => [c.isbn, c]));
  const chosen = plan.picks.filter((isbn): isbn is string => isbn !== null);
  if (!chosen.every((isbn) => candidates.has(isbn))) throw new Error("Invalid Q2 plan: a pick isn't an edition sold in 2193");
  if (new Set(chosen.map((isbn) => candidates.get(isbn)!.bookId)).size !== chosen.length)
    throw new Error("Invalid Q2 plan: the same title picked twice");

  const p = prepare(data, QUARTER);
  const base = baseline(p.history, seed);
  const hold: Q2Plan = { picks: [null, null, null], levers: [] };
  const runOf = (q: Q2Plan, response?: number) => run(p.history, base, seed, leversOf(q, response));
  const holdRun = runOf(hold);
  const planRun = chosen.length === 0 && plan.levers.length === 0 ? holdRun : runOf(plan);
  const holdLedger = ledger(holdRun.orders);
  const mine = ledger(planRun.orders, planRun.nights.length);

  // What the sale adds to the plan's other moves (for a plan without the sale, what adding it would have done).
  const others = plan.levers.filter((l) => l !== "sale");
  const profitOf = (q: Q2Plan, response?: number) => {
    const r = runOf(q, response);
    return ledger(r.orders, r.nights.length).grossProfit;
  };
  const withoutSale = profitOf({ picks: plan.picks, levers: others });
  const saleChange = (response: number) => profitOf({ picks: plan.picks, levers: [...others, "sale"] }, response) - withoutSale;

  const facts: Q2Facts = { picks: pickFacts(planRun, p.history.months, candidates), amount: mine.grossProfit - holdLedger.grossProfit };
  if (plan.levers.includes("events")) facts.events = eventFacts(planRun, mine);
  if (plan.levers.includes("sale")) facts.sale = saleFacts(mine, holdLedger);

  return {
    lines: linesOf(planRun.orders, YEAR, QUARTER),
    doNothingLines: linesOf(holdRun.orders, YEAR, QUARTER),
    outcome: {
      plan: { picks: [...plan.picks], levers: [...plan.levers] },
      quarter: `${YEAR}-Q${QUARTER}`,
      monthly: monthlyOf(p.history.months, planRun, holdRun),
      totals: { plan: metricsOf(mine), holdCourse: metricsOf(holdLedger) },
      reportCard: { plan: cardFor(p, planRun), holdCourse: cardFor(p, holdRun) },
      assumptions: q2Assumptions(plan, { averageOrderValue: p.averageOrderValue, saleAt10: saleChange(0.1), saleAt30: saleChange(0.3) }),
      happened: q2Happened(facts),
      facts,
    },
  };
}
