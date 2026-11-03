// How much evidence is behind a number (David, 3 Nov 2026: "Show n next to averages"): each average's count of
// what it's over, beside the rows (docs/design/chart-features-copy.md, section 4). Shared by the server, which
// counts, and the browser, which shows it, so it imports nothing but types.
import type { Measure } from "./types";

/** What each average is over: its n counts these. */
export const EVIDENCE_UNITS = {
  avg_order_value: "orders",
  avg_discount: "sale lines",
  avg_rating: "ratings",
  orders_per_day: "days",
} as const satisfies Partial<Record<Measure, string>>;
export type EvidenceUnit = (typeof EVIDENCE_UNITS)[keyof typeof EVIDENCE_UNITS];

/** The unit an average's n counts, or null for a measure that isn't an average. */
export const evidenceUnit = (measure: Measure): EvidenceUnit | null =>
  (EVIDENCE_UNITS as Partial<Record<Measure, EvidenceUnit>>)[measure] ?? null;

/** How many items a figure is over. */
export interface Evidence {
  n: number;
}

/**
 * Below this many, an average is shown faded: it could easily move with a few more. Days never fade: an average
 * per day rests on its orders, and a month's Mondays are only four or five days (Plot, #296).
 */
export const LOW_EVIDENCE = 30;
export const lowEvidence = (unit: EvidenceUnit, n: number) => unit !== "days" && n < LOW_EVIDENCE;
