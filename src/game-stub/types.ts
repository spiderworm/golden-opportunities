// TEMPORARY: the game interface agreed with Frank (30 Oct 2026), copied here
// until his src/game/types.ts lands. Delete this folder and import his.

export type OptionId = "A" | "B" | "C" | "D";
export type DiscoveryId = "A" | "B" | "C";

export interface Plan {
  option: OptionId;
}

export interface Metrics {
  revenue: number;
  units: number;
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

export interface Outcome {
  plan: Plan;
  quarter: string;
  monthly: MonthOutcome[];
  totals: { plan: Metrics; holdCourse: Metrics };
  /** The plan's score against holding course, from the replaceable scorer: its label names what's measured. */
  score: { value: number; label: string };
  assumptions: Assumption[];
  /** "What happened": filled sentences. */
  happened: string[];
  /** Insights the player found while investigating, recorded by the server. */
  discoveries: DiscoveryId[];
}
