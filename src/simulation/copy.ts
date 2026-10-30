// Plot's result copy (docs/design/m1-copy.md, sections 4 and 5), filled from the model.
import { has } from "./plan";
import type { Assumption, HappenedFacts, LeverId, Plan } from "./types";
import { OBSERVED_EXTRAS } from "./model";

const money = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
const cents = (v: number) => `$${Math.abs(v).toFixed(2)}`;
const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}`;
const signedMoney = (v: number) => `${v < 0 ? "-" : "+"}${money(v)}`;
const about = (n: number) => Math.round(n).toLocaleString("en-US");

/** Each move's sentences, its comparison with holding course last. */
function moveSentences(facts: HappenedFacts): string[][] {
  const moves: string[][] = [];
  if (facts.holdCourse) {
    const f = facts.holdCourse;
    moves.push([
      "You kept the schedule.",
      `The three Books of the Month sold about ${about(f.extra)} extra copies between them.`,
      `Because they were already bestsellers, the 15% discount also went on ${about(f.baseCopies)} copies that would have sold anyway, and that cost ${money(f.discountCost)}. Gross profit for the quarter was ${money(f.profit)}.`,
    ]);
  }
  if (facts.repick) {
    const f = facts.repick;
    moves.push([
      `The three new picks sold about ${about(f.extra)} extra copies between them.`,
      `Few copies would have sold anyway, so the discount cost only ${money(f.discountCost)}.`,
      `Gross profit was ${signedMoney(facts.amount)} compared with holding course.`,
    ]);
  }
  if (facts.events) {
    const f = facts.events;
    // The nights' own gross profit against their cost; alone, that's the change against holding course.
    const paid = f.gross >= f.eventCosts;
    moves.push([
      `The ${f.nights} author nights brought in about ${about(f.orders)} extra orders, roughly ${about(f.perNight)} a night.`,
      paid
        ? `They earned ${money(f.gross)} in gross profit against ${money(f.eventCosts)} in costs.`
        : `That earned ${money(f.gross)} in gross profit, short of the ${money(f.eventCosts)} they cost.`,
      `Gross profit was ${money(facts.amount)} ${facts.amount >= 0 ? "higher" : "lower"} than holding course.`,
    ]);
  }
  if (facts.sale) {
    const f = facts.sale;
    moves.push(
      f.revPct >= 0
        ? [
            `The sale sold about ${pct(f.unitsPct)}% more books than holding course would have.`,
            `Each one earned about ${cents(f.perBook)} less.`,
            `Revenue rose ${pct(f.revPct)}% and gross profit fell ${pct(f.profitPct)}%.`,
          ]
        : [
            `The sale sold about ${pct(f.unitsPct)}% more books than holding course would have, but each one earned about ${cents(f.perBook)} less.`,
            "Revenue and gross profit both fell.",
          ],
    );
  }
  return moves;
}

/** One move's sentences in full; two moves without their own comparisons, then the total. */
export function happened(facts: HappenedFacts): string[] {
  const moves = moveSentences(facts);
  if (moves.length < 2) return moves.flat();
  return [
    ...moves.flatMap((sentences) => sentences.slice(0, -1)),
    `Together, your two moves changed gross profit by ${signedMoney(facts.amount)} compared with holding course.`,
  ];
}

export interface AssumptionValues {
  /** Q1 2193's average order value. */
  averageOrderValue: number;
  /** The change in gross profit the sale makes to the plan's other moves, had it sold 10% or 30% more. */
  saleAt10: number;
  saleAt30: number;
}

const median = (values: readonly number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Every rule, for every plan; the ones the player's plan used are marked. */
export function assumptions(plan: Plan, v: AssumptionValues): Assumption[] {
  // null: every plan uses the rule. The Books of the Month run in every plan, scheduled or re-picked.
  const rules: (Omit<Assumption, "usedByPlan"> & { usedBy: LeverId | null })[] = [
    {
      id: "replay",
      source: "setup",
      usedBy: null,
      text: "Q1 2194 repeats Q1 2193: the same titles, months and weekday pattern, with small random day-to-day changes. Holding course uses the same random draws, so the comparison is fair.",
    },
    { id: "botm-price", source: "data", usedBy: null, text: "A Book of the Month is 15% off for the whole month. In 2193, one title was featured each month." },
    {
      id: "botm-extra",
      source: "data",
      usedBy: null,
      text: `Each Book of the Month sells extra copies equal to one of the 12 picks from 2193, drawn at random. Those picks sold between ${Math.min(...OBSERVED_EXTRAS)} and ${Math.max(...OBSERVED_EXTRAS)} extra copies; the middle value was ${Math.round(median(OBSERVED_EXTRAS))}.`,
    },
    { id: "no-cannibalization", source: "assumed", usedBy: null, text: "The extra copies are new sales. They don't take sales from other books." },
    { id: "cost-of-goods", source: "assumed", usedBy: null, text: "Books cost the store 60% of their list price." },
    {
      id: "sale-response",
      source: "assumed",
      usedBy: "sale",
      text: `A station-wide 15% sale sells 20% more of every book. With 10%, gross profit would have changed by ${signedMoney(v.saleAt10)}; with 30%, by ${signedMoney(v.saleAt30)}.`,
    },
    {
      id: "event-orders",
      source: "assumed",
      usedBy: "events",
      text: `Each author night adds between 30 and 70 orders that day, at Q1's average order value of ${cents(v.averageOrderValue)}.`,
    },
    { id: "event-cost", source: "assumed", usedBy: "events", text: "Each author night costs $200." },
  ];
  return rules.map(({ usedBy, ...rule }) => ({ ...rule, usedByPlan: usedBy === null || has(plan, usedBy) }));
}
