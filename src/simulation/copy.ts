// Plot's result copy (docs/design/m1-copy.md, sections 4 and 5), filled from the model.
import type { Assumption, HappenedFacts, OptionId } from "./types";
import { OBSERVED_EXTRAS } from "./model";

const money = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
const cents = (v: number) => `$${Math.abs(v).toFixed(2)}`;
const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}`;
const signedMoney = (v: number) => `${v < 0 ? "-" : "+"}${money(v)}`;
const about = (n: number) => Math.round(n).toLocaleString("en-US");

export function happened(facts: HappenedFacts): string[] {
  switch (facts.option) {
    case "A":
      return [
        "You kept the schedule.",
        `The three Books of the Month sold about ${about(facts.extra)} extra copies between them.`,
        `Because they were already bestsellers, the 15% discount also went on ${about(facts.baseCopies)} copies that would have sold anyway, and that cost ${money(facts.discountCost)}. Gross profit for the quarter was ${money(facts.profit)}.`,
      ];
    case "B":
      return facts.revPct >= 0
        ? [
            `The sale sold about ${pct(facts.unitsPct)}% more books than holding course would have.`,
            `Each one earned about ${cents(facts.perBook)} less.`,
            `Revenue rose ${pct(facts.revPct)}% and gross profit fell ${pct(facts.profitPct)}%.`,
          ]
        : [
            `The sale sold about ${pct(facts.unitsPct)}% more books than holding course would have, but each one earned about ${cents(facts.perBook)} less.`,
            "Revenue and gross profit both fell.",
          ];
    case "C":
      return [
        `The three new picks sold about ${about(facts.extra)} extra copies between them.`,
        `Few copies would have sold anyway, so the discount cost only ${money(facts.discountCost)}.`,
        `Gross profit was ${signedMoney(facts.amount)} compared with holding course.`,
      ];
    case "D":
      return [
        `The ${facts.events} author nights brought in about ${about(facts.orders)} extra orders, roughly ${about(facts.perNight)} a night.`,
        facts.amount >= 0
          ? `They earned ${money(facts.gross)} in gross profit against ${money(facts.eventCosts)} in costs.`
          : `That earned ${money(facts.gross)} in gross profit, short of the ${money(facts.eventCosts)} they cost.`,
        `Gross profit was ${money(facts.amount)} ${facts.amount >= 0 ? "higher" : "lower"} than holding course.`,
      ];
  }
}

export interface AssumptionValues {
  /** Q1 2193's average order value. */
  averageOrderValue: number;
  /** The change in gross profit against holding course had the sale sold 10% or 30% more. */
  saleAt10: number;
  saleAt30: number;
}

const median = (values: readonly number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Every rule, for every option; the ones the player's option used are marked. */
export function assumptions(option: OptionId, v: AssumptionValues): Assumption[] {
  const rules: (Omit<Assumption, "usedByPlan"> & { usedBy: OptionId[] })[] = [
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
      text: `Each Book of the Month sells extra copies equal to one of the 12 picks from 2193, drawn at random. Those picks sold between ${Math.min(...OBSERVED_EXTRAS)} and ${Math.max(...OBSERVED_EXTRAS)} extra copies; the middle value was ${Math.round(median(OBSERVED_EXTRAS))}.`,
    },
    { id: "no-cannibalization", source: "assumed", usedBy: ["A", "C"], text: "The extra copies are new sales. They don't take sales from other books." },
    { id: "cost-of-goods", source: "assumed", usedBy: ["A", "B", "C", "D"], text: "Books cost the store 60% of their list price." },
    {
      id: "sale-response",
      source: "assumed",
      usedBy: ["B"],
      text: `A station-wide 15% sale sells 20% more of every book. With 10%, gross profit would have changed by ${signedMoney(v.saleAt10)}; with 30%, by ${signedMoney(v.saleAt30)}.`,
    },
    {
      id: "event-orders",
      source: "assumed",
      usedBy: ["D"],
      text: `Each author night adds between 30 and 70 orders that day, at Q1's average order value of ${cents(v.averageOrderValue)}.`,
    },
    { id: "event-cost", source: "assumed", usedBy: ["D"], text: "Each author night costs $200." },
  ];
  return rules.map(({ usedBy, ...rule }) => ({ ...rule, usedByPlan: usedBy.includes(option) }));
}
