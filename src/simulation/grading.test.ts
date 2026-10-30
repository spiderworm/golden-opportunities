import { describe, expect, it } from "vitest";
import { goalFor, gradeFor, rawScore, reportCard, scoreMeasure } from "./grading";

// Profit's 2193 quarterly average, at full precision (scoring.md's edge-case table uses it).
const PROFIT_AVERAGE = 68828.08080000432;
const profit = (lastYear: number, result: number) => scoreMeasure("profit", { result, lastYear, quarterlyAverage: PROFIT_AVERAGE });

describe("goals", () => {
  it("stretch last year by 5%, or by 1% of the quarterly average when that's larger", () => {
    expect(goalFor(37641.5838, PROFIT_AVERAGE)).toBeCloseTo(39523.663, 3);
    expect(goalFor(6825, 12378.5)).toBe(7166.25);
    expect(goalFor(0, PROFIT_AVERAGE)).toBeCloseTo(688.2808, 4);
    expect(goalFor(-100, PROFIT_AVERAGE)).toBeCloseTo(588.2808, 4);
  });
});

describe("scores, from scoring.md's edge cases", () => {
  // The table's $344 is half its rounded $688 step; at the full-precision step it's 82.49, so this uses just over half the exact step.
  it.each([
    [0, 0, 65, "D"],
    [0, 344.15, 83, "B"],
    [-100, -103, 65, "D"],
    [-100, 600, 100, "A+"],
    [37642, 37642, 65, "D"],
    [37642, 28802, 33, "F"],
  ])("last year %d, result %d scores %d (%s)", (lastYear, result, score, grade) => {
    expect(profit(lastYear, result)).toMatchObject({ score, grade });
  });

  it("gives 100 only at or past the goal, and the award only past it", () => {
    const goal = goalFor(1000, PROFIT_AVERAGE);
    expect(profit(1000, goal)).toMatchObject({ score: 100, exceeds: false });
    expect(profit(1000, goal + 1)).toMatchObject({ score: 100, exceeds: true });
    expect(profit(1000, goal - 0.01).score).toBe(99);
  });

  it("caps a result just under the goal at 99: 7,166 orders against a goal of 7,166.25", () => {
    expect(scoreMeasure("readers", { result: 7166, lastYear: 6825, quarterlyAverage: 12378.5 })).toMatchObject({ score: 99, exceeds: false });
  });

  it("takes 2.5 points per 1% of scale below last year, down to 0", () => {
    expect(rawScore(0.9 * 100_000, 100_000, 105_000, PROFIT_AVERAGE)).toBeCloseTo(40, 10);
    expect(profit(100_000, 0).score).toBe(0);
  });

  it("rounds half up", () => {
    // 65 + 35 x 0.5 = 82.5
    expect(profit(0, goalFor(0, PROFIT_AVERAGE) / 2).score).toBe(83);
  });
});

describe("grades", () => {
  it.each([
    [100, "A+"], [99, "A"], [93, "A"], [92, "A-"], [90, "A-"], [89, "B+"], [87, "B+"], [86, "B"], [83, "B"],
    [82, "B-"], [80, "B-"], [79, "C+"], [77, "C+"], [76, "C"], [73, "C"], [72, "C-"], [70, "C-"], [69, "D"], [60, "D"], [59, "F"], [0, "F"],
  ])("%d is %s", (score, grade) => expect(gradeFor(score)).toBe(grade));
});

describe("the combined score", () => {
  const input = (result: number) => ({ result, lastYear: 100, quarterlyAverage: 100 });
  // 100 to 105: a result of 100 + 5x scores 65 + 35x.
  const at = (score: number) => input(100 + (5 * (score - 65)) / 35);

  it("is the plain average of the unrounded scores", () => {
    const card = reportCard({ profit: at(70), readers: at(70.4), happiness: at(70.4), culture: at(70.4) });
    expect(card.measures.map((m) => m.score)).toEqual([70, 70, 70, 70]);
    expect(card.combined).toEqual({ score: 70, grade: "C-" });
    expect(card.wellRounded).toBe(false);
  });

  it("adds 3 for Well-Rounded Shop before rounding, capped at 100", () => {
    const card = reportCard({ profit: at(80), readers: at(81), happiness: at(82), culture: at(83) });
    expect(card.wellRounded).toBe(true);
    expect(card.combined.score).toBe(85); // 81.5 + 3 = 84.5, rounded half up
    expect(reportCard({ profit: input(200), readers: input(200), happiness: input(200), culture: input(200) }).combined).toEqual({ score: 100, grade: "A+" });
  });

  it("isn't Well-Rounded when a measure shows 79", () => {
    expect(reportCard({ profit: at(79.4), readers: at(99), happiness: at(99), culture: at(99) }).wellRounded).toBe(false);
  });
});
