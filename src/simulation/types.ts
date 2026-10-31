// The simulation's output, which the game (src/game) stores and the Result
// screen reads. The game imports these type-only. Metrics, MonthOutcome and
// Assumption are unchanged from the interface agreed with Frank and Chart
// (src/game-stub/types.ts).
import type { DeepReadonly, SaleLine } from "~/bookshop/types";

/** The plan's levers (docs/design/scoring.md, "The plan: up to two levers"), in the order they're shown and described. */
export type LeverId = "repick" | "events" | "sale";
export const LEVER_IDS: readonly LeverId[] = ["repick", "events", "sale"];
export const MAX_LEVERS = 2;
export type DiscoveryId = "A" | "B" | "C";

export interface Plan {
  /** 0 to 2 distinct levers, in LEVER_IDS order. None is holding course. */
  levers: LeverId[];
}

/** Q2's one move beside the picks (docs/design/q2.md section 5), in the order they're shown. */
export type Q2LeverId = "events" | "sale";
export const Q2_LEVER_IDS: readonly Q2LeverId[] = ["events", "sale"];
export const Q2_MAX_LEVERS = 1;

export interface Q2Plan {
  /** April, May and June: each month's Book of the Month, by ISBN, or null for none. No title twice. */
  picks: (string | null)[];
  /** At most one, in Q2_LEVER_IDS order. No picks and no lever is holding course. */
  levers: Q2LeverId[];
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
  /** At or above the goal, so the score is 100. */
  met: boolean;
  /** Strictly above the goal: the Exceeds Requirements certificate. */
  exceeds: boolean;
}

/** Certificates are honors; they never change the score. Comeback and Weathered the Storm can't happen in M1. */
export type CertificateId = "exceeds" | "comeback" | "weathered" | "wellRounded";

export interface Certificate {
  id: CertificateId;
  /** The measure it's for: Exceeds Requirements and Comeback. */
  measure?: MeasureId;
}

export interface ReportCard {
  /** In MEASURE_IDS order. */
  measures: MeasureScore[];
  /** The lowest of the four measures' scores. No averaging, no bonus. */
  overall: {
    score: number;
    grade: Grade;
    /** Every measure whose score equals the overall score, in MEASURE_IDS order. */
    binding: MeasureId[];
    /** The other measures within closeMargin points of it, inclusive: closest first, ties in MEASURE_IDS order. */
    closeBehind: MeasureId[];
    closeMargin: number;
    /** Every measure at or above its goal: the "all met" line shows alone. */
    allMet: boolean;
    /** Not all met, some measure is below last year, and a different one is strictly past its goal. */
    sacrifice: boolean;
  };
  /** In display order: Exceeds Requirements by measure, then Comeback, Weathered the Storm and Well-Rounded Shop. */
  certificates: Certificate[];
}

/** The numbers behind the "What happened" sentences (docs/design/m1-copy.md, section 4), one entry per move. */
export interface HappenedFacts {
  /** Holding course only: the scheduled picks. */
  holdCourse?: { extra: number; baseCopies: number; discountCost: number; profit: number };
  repick?: { extra: number; baseCopies: number; discountCost: number };
  events?: { nights: number; orders: number; perNight: number; gross: number; eventCosts: number };
  /** Against holding course. */
  sale?: { unitsPct: number; perBook: number; revPct: number; profitPct: number };
  /** The plan's gross profit minus holding course's. */
  amount: number;
}

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

export type SimulatedOutcome = Omit<Outcome, "discoveries">;

/** A simulated sale line. It shares the joined catalog objects of the history it was built from. */
export type SimulatedLine = DeepReadonly<SaleLine>;

export interface SimulationResult {
  /** Q1 2194 under the plan: what the player's ledgers show. */
  lines: SimulatedLine[];
  /** Q1 2194 had the player held course, from the same seed. */
  doNothingLines: SimulatedLine[];
  outcome: SimulatedOutcome;
}

/** One month's Book of the Month in Q2. The sale's clones are the sale's doing, not the pick's. */
export interface PickFacts {
  isbn: string;
  title: string;
  format: string;
  extra: number;
  /** The edition's copies that would have sold anyway, and what the 15% off cost on them. */
  baseCopies: number;
  discountCost: number;
}

/** The numbers behind Q2's "What happened" sentences. */
export interface Q2Facts {
  /** April, May and June; null for a month left empty. */
  picks: (PickFacts | null)[];
  events?: HappenedFacts["events"];
  sale?: HappenedFacts["sale"];
  /** The plan's gross profit minus holding course's. */
  amount: number;
}

/** Q2's outcome, before the game adds its discoveries. */
export interface Q2Outcome extends Omit<SimulatedOutcome, "plan" | "facts"> {
  plan: Q2Plan;
  facts: Q2Facts;
}

export interface Q2SimulationResult {
  /** Q2 2194 under the plan. */
  lines: SimulatedLine[];
  /** Q2 2194 had the player held course (the empty calendar), from the same seed. */
  doNothingLines: SimulatedLine[];
  outcome: Q2Outcome;
}

/** An edition the player can pick: every edition sold in 2193. */
export interface PickCandidate {
  isbn: string;
  bookId: string;
  title: string;
  format: string;
  listPrice: number;
}
