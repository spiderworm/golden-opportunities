// TEMPORARY: the game interface agreed with Frank (30 Oct 2026), with the report
// card exactly as Sim's src/simulation/types.ts has it, copied here until theirs
// land. Delete this folder and import theirs.

export type OptionId = "A" | "B" | "C" | "D";
export type DiscoveryId = "A" | "B" | "C";

export interface Plan {
  option: OptionId;
}

export interface Metrics {
  revenue: number;
  units: number;
  /** Revenue minus cost of goods minus event costs. */
  grossProfit: number;
  orders?: number;
  costOfGoods?: number;
  eventCosts?: number;
}

export interface MonthOutcome {
  /** YYYY-MM */
  month: string;
  plan: Pick<Metrics, "revenue" | "units">;
  holdCourse: Pick<Metrics, "revenue" | "units">;
}

export interface Assumption {
  id: string;
  /** The rule, filled with its values, as the player reads it. */
  text: string;
  source: "data" | "assumed" | "setup";
  /** Whether the player's option relied on this rule. */
  usedByPlan: boolean;
}

/** The report card's measures, in the order the card shows them. */
export type MeasureId = "profit" | "readers" | "happiness" | "culture";
export const MEASURE_IDS: readonly MeasureId[] = ["profit", "readers", "happiness", "culture"];

export type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D" | "F";

export interface MeasureScore {
  id: MeasureId;
  /** This quarter's value: dollars, orders, mean happiness (0 to 100) or culture points. */
  result: number;
  /** The same quarter last year (Q1 2193). */
  lastYear: number;
  goal: number;
  /** 0 to 100, an integer. */
  score: number;
  grade: Grade;
  /** At or past the goal: the Exceeds Requirements award. */
  exceeds: boolean;
}

export interface ReportCard {
  measures: MeasureScore[];
  /** The plain average of the four scores, plus 3 for Well-Rounded Shop, capped at 100. */
  combined: { score: number; grade: Grade };
  /** All four measures at 80 or above. */
  wellRounded: boolean;
}

/** The numbers behind each option's "What happened" sentences (docs/design/m1-copy.md, section 4). */
export type HappenedFacts =
  | { option: "A"; extra: number; baseCopies: number; discountCost: number; profit: number }
  | { option: "B"; unitsPct: number; perBook: number; revPct: number; profitPct: number }
  | { option: "C"; extra: number; baseCopies: number; discountCost: number; amount: number }
  | { option: "D"; events: number; orders: number; perNight: number; gross: number; eventCosts: number; amount: number };

/** The game's outcome: the simulation's, plus the discoveries the game records. */
export interface Outcome {
  plan: Plan;
  quarter: string;
  monthly: MonthOutcome[];
  totals: { plan: Metrics; holdCourse: Metrics };
  reportCard: { plan: ReportCard; holdCourse: ReportCard };
  assumptions: Assumption[];
  /** "What happened": filled sentences. */
  happened: string[];
  facts: HappenedFacts;
  /** Insights the player found while investigating, recorded by the server. */
  discoveries: DiscoveryId[];
}
