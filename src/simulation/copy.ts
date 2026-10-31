// Plot's result copy (docs/design/m1-copy.md, sections 4 and 5), filled from the model.
import { has } from "./plan";
import type { Assumption, HappenedFacts, LeverId, Plan, Q2Facts, Q2Plan } from "./types";
import { EVENT_HAPPINESS } from "./measures";
import { OBSERVED_EXTRAS } from "./model";
import { RELEASE_RATE } from "./release";

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

/** Every Q1 plan opens with the new volume (m1-new-volume.md, "The result screen"). */
function releaseSentences(release: HappenedFacts["release"]): string[] {
  if (!release) return [];
  const sentences = [`The third Inspector Ryeslton mystery came out on February 4 and sold ${about(release.copies)} copies by March 31.`];
  if (release.saleCopies !== undefined) sentences.push(`${about(release.saleCopies)} of them were 15% off in the sale.`);
  return sentences;
}

/** The new volume first; then one move's sentences in full, or two moves without their own comparisons, then the total. */
export function happened(facts: HappenedFacts): string[] {
  const release = releaseSentences(facts.release);
  const moves = moveSentences(facts);
  if (moves.length < 2) return [...release, ...moves.flat()];
  return [
    ...release,
    ...moves.flatMap((sentences) => sentences.slice(0, -1)),
    `Together, your two moves changed gross profit by ${signedMoney(facts.amount)} compared with holding course.`,
  ];
}

export interface AssumptionValues {
  /** The quarter of 2193's average order value. */
  averageOrderValue: number;
  /** The change in gross profit the sale makes to the plan's other moves, had it sold 10% or 30% more. */
  saleAt10: number;
  saleAt30: number;
}

const median = (values: readonly number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

type Rule = Omit<Assumption, "usedByPlan"> & { usedBy: LeverId | "picks" | null };

/** Every rule, filled for a quarter. null: every plan uses the rule. "picks": a plan with a Book of the Month does. */
function rules(v: AssumptionValues, quarter: number): Rule[] {
  const q = `Q${quarter}`;
  // In Q1 the Books of the Month run in every plan, scheduled or re-picked; from Q2 the calendar starts empty.
  const picks = quarter === 1 ? null : "picks";
  return [
    {
      id: "replay",
      source: "setup",
      usedBy: null,
      text: `${q} 2194 repeats ${q} 2193: the same titles, months and weekday pattern, with small random day-to-day changes. Holding course uses the same random draws, so the comparison is fair.`,
    },
    {
      id: "new-volume",
      source: "assumed",
      usedBy: null,
      text:
        quarter === 1
          ? `The third Inspector Ryeslton mystery sells ${RELEASE_RATE.toFixed(1)} copies a day at full price: 85% of volume 2's first-quarter rate in 2193, the series' own drop from volume 1 to volume 2. It sells three times that in its first week and twice that in its second.`
          : `The third Inspector Ryeslton mystery keeps selling ${RELEASE_RATE.toFixed(1)} copies a day at full price through Q2, its rate after the launch weeks.`,
    },
    {
      id: "new-volume-goals",
      source: "assumed",
      usedBy: null,
      text: `The goals count the new volume: each starts from what ${q} 2193 plus the new volume would give if you held course.`,
    },
    { id: "botm-price", source: "data", usedBy: picks, text: "A Book of the Month is 15% off for the whole month. In 2193, one title was featured each month." },
    {
      id: "botm-extra",
      source: "data",
      usedBy: picks,
      text: `Each Book of the Month sells extra copies equal to one of the 12 picks from 2193, drawn at random. Those picks sold between ${Math.min(...OBSERVED_EXTRAS)} and ${Math.max(...OBSERVED_EXTRAS)} extra copies; the middle value was ${Math.round(median(OBSERVED_EXTRAS))}.`,
    },
    { id: "no-cannibalization", source: "assumed", usedBy: picks, text: "The extra copies are new sales. They don't take sales from other books." },
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
      text: `Each author night adds between 30 and 70 orders that day, at ${q}'s average order value of ${cents(v.averageOrderValue)}.`,
    },
    { id: "event-cost", source: "assumed", usedBy: "events", text: "Each author night costs $200." },
    {
      id: "event-happiness",
      source: "assumed",
      usedBy: "events",
      text: `Readers at an author night enjoy the night out: those visits get ${EVENT_HAPPINESS} extra happiness points.`,
    },
  ];
}

/** Every rule, for every plan; the ones the player's plan used are marked. */
export function assumptions(plan: Plan, v: AssumptionValues): Assumption[] {
  return rules(v, 1).map(({ usedBy, ...rule }) => ({ ...rule, usedByPlan: usedBy === null || (usedBy !== "picks" && has(plan, usedBy)) }));
}

/** Q2's rules: the Book of the Month rules count only for a plan with a pick. */
export function q2Assumptions(plan: Q2Plan, v: AssumptionValues): Assumption[] {
  const used = (usedBy: Rule["usedBy"]) =>
    usedBy === null || (usedBy === "picks" ? plan.picks.some((p) => p !== null) : usedBy !== "repick" && plan.levers.includes(usedBy));
  return rules(v, 2).map(({ usedBy, ...rule }) => ({ ...rule, usedByPlan: used(usedBy) }));
}

const Q2_MONTHS = ["April", "May", "June"];

/** Q2's "What happened": the picks as one move, then the other move; two moves end with their total. */
export function q2Happened(facts: Q2Facts): string[] {
  const picks = facts.picks.flatMap((f, m) =>
    f
      ? [`In ${Q2_MONTHS[m]}, ${f.title} sold about ${about(f.extra)} extra copies; the discount on ${about(f.baseCopies)} copies that would have sold anyway cost ${money(f.discountCost)}.`]
      : [],
  );
  const others = moveSentences({ events: facts.events, sale: facts.sale, amount: facts.amount });
  const moves = picks.length ? [[...picks, `Gross profit was ${signedMoney(facts.amount)} compared with holding course.`], ...others] : others;
  if (moves.length === 0) return ["You left the calendar empty: no Book of the Month in April, May or June."];
  if (moves.length < 2) return moves.flat();
  return [
    ...moves.flatMap((sentences) => sentences.slice(0, -1)),
    `Together, your two moves changed gross profit by ${signedMoney(facts.amount)} compared with holding course.`,
  ];
}
