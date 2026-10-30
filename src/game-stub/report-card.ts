// TEMPORARY, like the rest of this folder: Sim's engine computes the real card.
// This follows the scoring rules (docs/design/scoring.md) closely enough that
// the Result screen shows realistic cards; the measure values it scores are the
// stub's placeholders.
import { MEASURE_IDS, type Grade, type MeasureId, type MeasureScore, type ReportCard } from "./types";

/** Q1 2193 and the 2193 quarterly average, from docs/design/scoring.md. */
export const LAST_YEAR: Record<MeasureId, number> = { profit: 37_642, readers: 6_825, happiness: 65.07, culture: 17_368 };
const AVERAGE: Record<MeasureId, number> = { profit: 68_828, readers: 12_379, happiness: 64.84, culture: 22_154 };
const STRETCH = 0.05;

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
  return GRADES.find(([floor]) => score >= floor)?.[1] ?? "F";
}

export function goalFor(id: MeasureId): number {
  const last = LAST_YEAR[id];
  return last + Math.max(STRETCH * Math.abs(last), AVERAGE[id] / 100);
}

/** Unrounded, so the combined score can average the exact values. */
function rawScore(id: MeasureId, result: number, goal: number): number {
  const last = LAST_YEAR[id];
  if (result >= goal) return 100;
  if (result >= last) return 65 + (35 * (result - last)) / (goal - last);
  return Math.max(0, 65 - (250 * (last - result)) / Math.max(Math.abs(last), AVERAGE[id]));
}

export function reportCard(results: Record<MeasureId, number>): ReportCard {
  const raw = MEASURE_IDS.map((id) => {
    const goal = goalFor(id);
    return { id, result: results[id], goal, raw: rawScore(id, results[id], goal) };
  });
  const measures: MeasureScore[] = raw.map(({ id, result, goal, raw }) => {
    // Only meeting the goal earns an A+.
    const score = result >= goal ? 100 : Math.min(99, Math.floor(raw + 0.5));
    return { id, result, lastYear: LAST_YEAR[id], goal, score, grade: gradeFor(score), exceeds: result > goal };
  });
  const wellRounded = measures.every((m) => m.score >= 80);
  const mean = raw.reduce((t, m) => t + m.raw, 0) / raw.length;
  const combined = Math.floor(Math.min(100, mean + (wellRounded ? 3 : 0)) + 0.5);
  return { measures, combined: { score: combined, grade: gradeFor(combined) }, wellRounded };
}
