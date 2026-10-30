// From a result to a score (docs/design/scoring.md, "From a result to a score").
import type { Grade, MeasureId, MeasureScore, ReportCard } from "./types";
import { MEASURE_IDS } from "./types";

/** The stretch on last year, and the smallest step as a share of the 2193 quarterly average (both *tune*). */
export const STRETCH = 0.05;
export const STEP = 0.01;
/** Points lost per whole share of scale below last year: 2.5 per 1%. */
export const BELOW_PENALTY = 250;
export const WELL_ROUNDED_BONUS = 3;

export const roundHalfUp = (value: number) => Math.floor(value + 0.5);

/** Always above last year, even when last year was zero or negative. */
export function goalFor(lastYear: number, quarterlyAverage: number): number {
  return lastYear + Math.max(STRETCH * Math.abs(lastYear), STEP * Math.abs(quarterlyAverage));
}

/** The unrounded score, 0 to 100. */
export function rawScore(result: number, lastYear: number, goal: number, quarterlyAverage: number): number {
  if (result >= goal) return 100;
  if (result >= lastYear) return 65 + (35 * (result - lastYear)) / (goal - lastYear);
  const scale = Math.max(Math.abs(lastYear), Math.abs(quarterlyAverage));
  return Math.max(0, 65 - (BELOW_PENALTY * (lastYear - result)) / scale);
}

/** Rounded half up; only a result at or past the goal shows 100. */
export function shownScore(raw: number, atGoal: boolean): number {
  return atGoal ? 100 : Math.min(99, roundHalfUp(raw));
}

const GRADES: [number, Grade][] = [
  [100, "A+"], [93, "A"], [90, "A-"], [87, "B+"], [83, "B"], [80, "B-"], [77, "C+"], [73, "C"], [70, "C-"], [60, "D"],
];

export function gradeFor(score: number): Grade {
  return GRADES.find(([min]) => score >= min)?.[1] ?? "F";
}

export interface MeasureInput {
  result: number;
  lastYear: number;
  /** The measure's 2193 quarterly average: sets the smallest goal step and the scale below last year. */
  quarterlyAverage: number;
}

export function scoreMeasure(id: MeasureId, { result, lastYear, quarterlyAverage }: MeasureInput): MeasureScore & { raw: number } {
  const goal = goalFor(lastYear, quarterlyAverage);
  const raw = rawScore(result, lastYear, goal, quarterlyAverage);
  const score = shownScore(raw, result >= goal);
  return { id, result, lastYear, goal, score, grade: gradeFor(score), exceeds: result > goal, raw };
}

export function reportCard(inputs: Record<MeasureId, MeasureInput>): ReportCard {
  const scored = MEASURE_IDS.map((id) => scoreMeasure(id, inputs[id]));
  const wellRounded = scored.every((m) => m.score >= 80);
  const mean = scored.reduce((sum, m) => sum + m.raw, 0) / scored.length;
  const combined = Math.min(100, roundHalfUp(mean + (wellRounded ? WELL_ROUNDED_BONUS : 0)));
  return {
    measures: scored.map(({ raw: _raw, ...measure }) => measure),
    combined: { score: combined, grade: gradeFor(combined) },
    wellRounded,
  };
}
