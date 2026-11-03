// From a result to a score, and the overall score (docs/design/scoring.md,
// "The report card" and "From a result to a score"). The flags for the
// lowest-measure lines follow docs/design/m1-copy.md, so the UI never works out
// scoring itself.
import type { Certificate, Grade, MeasureId, MeasureScore, ReportCard } from "./types";
import { MEASURE_IDS } from "./types";

/** The stretch on last year, and the smallest step as a share of the 2193 quarterly average (both *tune*). */
export const STRETCH = 0.05;
export const STEP = 0.01;
/** Matching last year scores this. */
export const ANCHOR = 70;
/** Points lost per whole share of scale below last year: 2.5 per 1%. */
export const BELOW_PENALTY = 250;
/** A measure this close to the overall score, or closer, gets a warning. */
export const CLOSE_MARGIN = 3;
export const WELL_ROUNDED = 80;

export const roundHalfUp = (value: number) => Math.floor(value + 0.5);

/** Always above last year, even when last year was zero or negative. */
export function goalFor(lastYear: number, quarterlyAverage: number): number {
  return lastYear + Math.max(STRETCH * Math.abs(lastYear), STEP * Math.abs(quarterlyAverage));
}

/** The unrounded score, 0 to 100. */
export function rawScore(
  result: number,
  lastYear: number,
  goal: number,
  quarterlyAverage: number,
): number {
  if (result >= goal) return 100;
  if (result >= lastYear)
    return ANCHOR + ((100 - ANCHOR) * (result - lastYear)) / (goal - lastYear);
  const scale = Math.max(Math.abs(lastYear), Math.abs(quarterlyAverage));
  return Math.max(0, ANCHOR - (BELOW_PENALTY * (lastYear - result)) / scale);
}

/** Rounded half up; only a result at or past the goal shows 100. */
export function shownScore(raw: number, atGoal: boolean): number {
  return atGoal ? 100 : Math.min(99, roundHalfUp(raw));
}

const GRADES: [number, Grade][] = [
  [100, "A+"],
  [93, "A"],
  [90, "A-"],
  [87, "B+"],
  [83, "B"],
  [80, "B-"],
  [77, "C+"],
  [73, "C"],
  [70, "C-"],
  [60, "D"],
];

export function gradeFor(score: number): Grade {
  return GRADES.find(([min]) => score >= min)?.[1] ?? "F";
}

export interface MeasureInput {
  result: number;
  lastYear: number;
  /** The measure's 2193 quarterly average: sets the smallest goal step and the scale below last year. */
  quarterlyAverage: number;
  /** A goal other than the usual stretch: Alma's extra stretch or a recovery goal (endless.md section 2). */
  goal?: number;
}

export function scoreMeasure(
  id: MeasureId,
  { result, lastYear, quarterlyAverage, goal: set }: MeasureInput,
): MeasureScore {
  const goal = set ?? goalFor(lastYear, quarterlyAverage);
  const met = result >= goal;
  const score = shownScore(rawScore(result, lastYear, goal, quarterlyAverage), met);
  return { id, result, lastYear, goal, score, grade: gradeFor(score), met, exceeds: result > goal };
}

/** The overall score is the lowest measure's: no averaging, no bonus. Certificates never change it. */
export function reportCard(inputs: Record<MeasureId, MeasureInput>): ReportCard {
  const measures = MEASURE_IDS.map((id) => scoreMeasure(id, inputs[id]));
  const score = Math.min(...measures.map((m) => m.score));
  const allMet = measures.every((m) => m.met);
  const below = measures.filter((m) => m.result < m.lastYear);
  const sacrifice =
    !allMet && below.some((low) => measures.some((m) => m.id !== low.id && m.exceeds));
  const certificates: Certificate[] = measures
    .filter((m) => m.exceeds)
    .map((m) => ({ id: "exceeds", measure: m.id }));
  if (score >= WELL_ROUNDED) certificates.push({ id: "wellRounded" });
  return {
    measures,
    overall: {
      score,
      grade: gradeFor(score),
      binding: measures.filter((m) => m.score === score).map((m) => m.id),
      // Array sort is stable, so equally close measures keep card order.
      closeBehind: measures
        .filter((m) => m.score > score && m.score <= score + CLOSE_MARGIN)
        .sort((a, b) => a.score - b.score)
        .map((m) => m.id),
      closeMargin: CLOSE_MARGIN,
      allMet,
      sacrifice,
    },
    certificates,
  };
}
