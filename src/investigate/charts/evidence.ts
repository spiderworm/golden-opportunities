// How much evidence is behind a number, in words (Plot's copy, docs/design/chart-features-copy.md section 4): an
// average's "Based on" count, the low-n note, average rating's likely range and the "within noise" flag. The
// numbers come from the query layer (src/query/evidence.ts); this only says them.
import type { QueryResult } from "~/query/types";
import {
  LOW_EVIDENCE,
  lowEvidence,
  ratingRange,
  withinNoise,
  type Evidence,
  type EvidenceUnit,
} from "~/query/evidence";

const SINGULAR: Record<EvidenceUnit, string> = {
  orders: "order",
  "sale lines": "sale line",
  ratings: "rating",
  days: "day",
};

/** The count with its unit: `212 ratings`, `1,240 orders`, `1 rating`. */
export const countOf = (unit: EvidenceUnit, n: number) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? SINGULAR[unit] : unit}`;

/** The table's column header after an average. */
export const BASED_ON = "Based on";

/** The tooltip's line after an average's value: `Based on 212 ratings`. */
export const basedOnLine = (unit: EvidenceUnit, n: number) => `Based on ${countOf(unit, n)}`;

/** Whether an average is faded: under 30 ratings, orders or sale lines, never days. */
export const faded = (unit: EvidenceUnit | null, evidence: Evidence | null | undefined) =>
  unit !== null && !!evidence && lowEvidence(unit, evidence.n);

/** The tooltip's low-n line, or null when there's enough: `Only 8 ratings: this average could easily change with a few more`. */
export const lowLine = (unit: EvidenceUnit, n: number) =>
  lowEvidence(unit, n)
    ? `Only ${countOf(unit, n)}: this average could easily change with a few more`
    : null;

/** The caption under a chart or table that fades some figures: `Faded where there are fewer than 30 ratings`. */
export const fadedCaption = (unit: EvidenceUnit) =>
  `Faded where there are fewer than ${LOW_EVIDENCE} ${unit}`;

export const RANGE_LEGEND = "Likely range (95%)";
export const RANGE_EXPLAINED =
  "Where the average would most likely land if as many readers rated again. Fewer ratings, wider range.";

/** The tooltip's range line: `Likely range: 3.9 to 4.3 stars`, or why there's none. */
export function rangeLine(
  mean: number | null,
  evidence: Evidence | null | undefined,
): string | null {
  if (mean === null || !evidence) return null;
  const range = ratingRange(mean, evidence);
  if (!range) return "Too few ratings for a likely range";
  // Stars to one decimal place, as the chart's ticks are; two where one would read as no range at all,
  // "4.18 to 4.24", not "4.2 to 4.2" (Plot, after #337).
  const places = range.low.toFixed(1) === range.high.toFixed(1) ? 2 : 1;
  return `Likely range: ${range.low.toFixed(places)} to ${range.high.toFixed(places)} stars`;
}

export const WITHIN_NOISE = "Within noise";
export const NOISE_EXPLAINED =
  "A difference this small often shows up by chance with this much data, so don't read much into it.";

/** Whether a comparison is flagged: only when it's judged within noise, never when it can't be judged. */
export const noisy = (
  unit: EvidenceUnit | null,
  a: { value: number | null; evidence: Evidence | null | undefined },
  b: { value: number | null; evidence: Evidence | null | undefined },
) =>
  withinNoise(
    unit,
    { value: a.value, evidence: a.evidence ?? null },
    { value: b.value, evidence: b.evidence ?? null },
  ) === true;

/** A change cell with its flag after it: `+2.1% · within noise`, or `New · within noise`. */
export const withNoise = (change: string, flagged: boolean) =>
  flagged && change ? `${change} · within noise` : change;

/** Whether a result's row is within noise of the same group last year (vs. same quarter last year). */
export function rowNoisy(result: QueryResult, i: number): boolean {
  const measure = result.columns.at(-1)!.key;
  const before = result.lastYear?.rows[i] ?? null;
  if (!before) return false;
  return noisy(
    result.evidence?.unit ?? null,
    {
      value: (result.rows[i]?.[measure] as number | null | undefined) ?? null,
      evidence: result.evidence?.rows[i],
    },
    { value: before.value, evidence: result.lastYear?.evidence.rows[i] },
  );
}

/** How many of a result's rows can be judged against last year, and how many of those are within noise. */
export function lastYearNoise(result: QueryResult): { compared: number; flagged: number } {
  let compared = 0;
  let flagged = 0;
  const measure = result.columns.at(-1)!.key;
  result.rows.forEach((row, i) => {
    const before = result.lastYear?.rows[i] ?? null;
    if (!before) return;
    const judged = withinNoise(
      result.evidence?.unit ?? null,
      {
        value: (row[measure] as number | null | undefined) ?? null,
        evidence: result.evidence?.rows[i] ?? null,
      },
      { value: before.value, evidence: result.lastYear?.evidence.rows[i] ?? null },
    );
    if (judged === null) return;
    compared++;
    if (judged) flagged++;
  });
  return { compared, flagged };
}

/**
 * An average's two counts vs. same quarter last year, in the columns' order (this year, then last), the unit once:
 * `1,240 and 980 orders`, singular only when both are one, `1 and 1 rating` (Plot, after #311). Without last
 * year's count, this year's alone.
 */
export function bothCounts(unit: EvidenceUnit, now: number, before: number | null): string {
  if (before === null) return countOf(unit, now);
  const word = now === 1 && before === 1 ? SINGULAR[unit] : unit;
  return `${now.toLocaleString("en-US")} and ${before.toLocaleString("en-US")} ${word}`;
}

/** The tooltip's line for the two: `Based on 1,240 orders (Q1 2194) and 980 (Q1 2193)`. */
export const bothLine = (
  unit: EvidenceUnit,
  now: number,
  before: number,
  labels: { now: string; then: string },
) =>
  `Based on ${countOf(unit, now)} (${labels.now}) and ${before.toLocaleString("en-US")} (${labels.then})`;
