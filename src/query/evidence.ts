// How much evidence is behind a number (David, 3 Nov 2026: "Show n next to averages, add error bars on average
// rating, and flag a comparison when the difference is "within noise""): each figure's count of what it's over and
// its standard error, beside the rows (docs/design/chart-features-copy.md, section 4). Shared by the server, which
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

/**
 * How many items a figure is over, and its standard error in the figure's own units: null where it has none (an
 * average over fewer than two). For sums and counts, n is their orders, lines, ratings or checkouts.
 */
export interface Evidence {
  n: number;
  se: number | null;
}

const Z = 1.959963984540054;
/** Exact two-sided 95% points of t for 1 to 4 degrees of freedom, where the expansion below is weakest. */
const SMALL_T = [12.706204736174705, 4.302652729749464, 3.182446305284263, 2.7764451051977987];
/**
 * The two-sided 95% point of Student's t with `df` degrees of freedom: exact for 1 to 4, otherwise the
 * Cornish-Fisher expansion, within 0.011% from 5 on (measured; it reads 0.12% narrow at 3). Infinity gives 1.96.
 */
export function t95(df: number): number {
  if (df < 5 && Number.isInteger(df)) return SMALL_T[df - 1]!;
  if (!Number.isFinite(df)) return Z;
  const z3 = Z ** 3;
  const z5 = Z ** 5;
  const z7 = Z ** 7;
  const z9 = Z ** 9;
  return (
    Z +
    (z3 + Z) / (4 * df) +
    (5 * z5 + 16 * z3 + 3 * Z) / (96 * df ** 2) +
    (3 * z7 + 19 * z5 + 17 * z3 - 15 * Z) / (384 * df ** 3) +
    (79 * z9 + 776 * z7 + 1482 * z5 - 1920 * z3 - 945 * Z) / (92160 * df ** 4)
  );
}

/**
 * An average rating's likely range (95%): its mean, give or take t with n - 1 degrees of freedom times its
 * standard error, clipped to 1 to 5 stars (Plot, #297). Goldy's default was 1.96; t is the honest width for the
 * few ratings a title can have (12.7 at two). Null below two ratings ("Too few ratings for a likely range"), and
 * when every rating is the same, which has no spread to estimate from.
 */
export function ratingRange(
  mean: number | null,
  evidence: Evidence,
): { low: number; high: number } | null {
  if (mean === null || evidence.n < 2 || evidence.se === null) return null;
  // Every rating the same: no spread to estimate from, and a range of 5 to 5 would claim more than a few agreeing
  // readers show. Null, as for too few; the chart says why in words (Plot, after #340).
  if (evidence.se === 0) return null;
  const half = t95(evidence.n - 1) * evidence.se;
  return { low: Math.max(1, mean - half), high: Math.min(5, mean + half) };
}

/**
 * Whether two figures of one measure differ by no more than chance would often give: within 95% of their
 * difference's spread. Averages by Welch's test, its degrees of freedom from each side's n; counts as Poisson and
 * revenue as compound Poisson, normally, so a count's flag is |a - b| <= 1.96 * sqrt(a + b). Null when either side
 * can't be judged (no figure, or an average over fewer than two): no flag, and a missing flag makes no claim.
 */
export function withinNoise(
  unit: EvidenceUnit | null,
  a: { value: number | null; evidence: Evidence | null },
  b: { value: number | null; evidence: Evidence | null },
): boolean | null {
  const sa = a.evidence?.se;
  const sb = b.evidence?.se;
  if (a.value === null || b.value === null || sa == null || sb == null) return null;
  const variance = sa * sa + sb * sb;
  let df = Infinity;
  if (unit !== null && unit !== "days") {
    const parts = sa ** 4 / (a.evidence!.n - 1) + sb ** 4 / (b.evidence!.n - 1);
    if (parts > 0) df = variance ** 2 / parts;
  }
  // Welch's degrees of freedom needn't be whole; under 5, rounding down keeps to the wider side of the exact points.
  const t = t95(df < 5 ? Math.max(1, Math.floor(df)) : df);
  return Math.abs(a.value - b.value) <= t * Math.sqrt(variance);
}

/**
 * Below this many, an average is shown faded: it could easily move with a few more. Days never fade: an average
 * per day rests on its orders, and a month's Mondays are only four or five days (Plot, #296).
 */
export const LOW_EVIDENCE = 30;
export const lowEvidence = (unit: EvidenceUnit, n: number) => unit !== "days" && n < LOW_EVIDENCE;
