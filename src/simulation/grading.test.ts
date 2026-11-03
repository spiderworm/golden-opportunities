import { describe, expect, it } from "vitest";
import { goalFor, gradeFor, rawScore, reportCard, scoreMeasure } from "./grading";

// Profit's 2193 quarterly average, at full precision (scoring.md's edge-case table uses it).
const PROFIT_AVERAGE = 68828.08080000432;
const profit = (lastYear: number, result: number) =>
  scoreMeasure("profit", { result, lastYear, quarterlyAverage: PROFIT_AVERAGE });

describe("goals", () => {
  it("stretch last year by 5%, or by 1% of the quarterly average when that's larger", () => {
    expect(goalFor(37641.5838, PROFIT_AVERAGE)).toBeCloseTo(39523.663, 3);
    expect(goalFor(6825, 12378.5)).toBe(7166.25);
    expect(goalFor(0, PROFIT_AVERAGE)).toBeCloseTo(688.2808, 4);
    expect(goalFor(-100, PROFIT_AVERAGE)).toBeCloseTo(588.2808, 4);
  });
});

describe("scores, from scoring.md's edge cases", () => {
  it.each([
    [0, 0, 70, "C-"],
    [0, 344, 85, "B"],
    [-100, -103, 70, "C-"],
    [-100, 600, 100, "A+"],
    [37642, 37642, 70, "C-"],
    [37642, 28802, 38, "F"],
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
    expect(
      scoreMeasure("readers", { result: 7166, lastYear: 6825, quarterlyAverage: 12378.5 }),
    ).toMatchObject({ score: 99, exceeds: false });
  });

  it("takes 2.5 points per 1% of scale below last year, down to 0", () => {
    expect(rawScore(0.9 * 100_000, 100_000, 105_000, PROFIT_AVERAGE)).toBeCloseTo(45, 10);
    expect(profit(100_000, 0).score).toBe(0);
  });

  it("rounds half up", () => {
    // 70 + 30 x 0.25 = 77.5
    expect(profit(0, goalFor(0, PROFIT_AVERAGE) / 4).score).toBe(78);
  });
});

describe("grades", () => {
  it.each([
    [100, "A+"],
    [99, "A"],
    [93, "A"],
    [92, "A-"],
    [90, "A-"],
    [89, "B+"],
    [87, "B+"],
    [86, "B"],
    [83, "B"],
    [82, "B-"],
    [80, "B-"],
    [79, "C+"],
    [77, "C+"],
    [76, "C"],
    [73, "C"],
    [72, "C-"],
    [70, "C-"],
    [69, "D"],
    [60, "D"],
    [59, "F"],
    [0, "F"],
  ])("%d is %s", (score, grade) => expect(gradeFor(score)).toBe(grade));
});

describe("the overall score", () => {
  const input = (result: number) => ({ result, lastYear: 100, quarterlyAverage: 100 });
  // 100 to 105: a result of 100 + 5x/30 scores 70 + x.
  const at = (score: number) => input(100 + (5 * (score - 70)) / 30);
  const card = (profit: number, readers: number, happiness: number, culture: number) =>
    reportCard({
      profit: at(profit),
      readers: at(readers),
      happiness: at(happiness),
      culture: at(culture),
    });

  it("is the lowest measure's score, with no averaging", () => {
    const { overall, measures } = card(90, 75, 99, 80);
    expect(measures.map((m) => m.score)).toEqual([90, 75, 99, 80]);
    expect(overall).toMatchObject({
      score: 75,
      grade: "C",
      binding: ["readers"],
      closeBehind: [],
      closeMargin: 3,
    });
  });

  it("names every measure tied at the lowest", () => {
    expect(card(72, 90, 72, 95).overall).toMatchObject({
      score: 72,
      binding: ["profit", "happiness"],
      closeBehind: [],
    });
  });

  it("warns about measures within 3 points, inclusive, closest first and then in card order", () => {
    expect(card(70, 73, 74, 72).overall).toMatchObject({
      score: 70,
      binding: ["profit"],
      closeBehind: ["culture", "readers"],
    });
    expect(card(73, 70, 72, 72).overall).toMatchObject({
      binding: ["readers"],
      closeBehind: ["happiness", "culture", "profit"],
    });
  });

  it("flags all met only when every measure reaches its goal", () => {
    expect(
      reportCard({
        profit: input(105),
        readers: input(105),
        happiness: input(105),
        culture: input(110),
      }).overall,
    ).toMatchObject({ score: 100, allMet: true, sacrifice: false });
    expect(card(99, 100, 100, 100).overall.allMet).toBe(false);
  });

  it("flags a sacrifice: one measure below last year while a different one is past its goal", () => {
    expect(
      reportCard({ profit: input(90), readers: input(110), happiness: at(80), culture: at(80) })
        .overall.sacrifice,
    ).toBe(true);
    // Exactly at the goal isn't past it.
    expect(
      reportCard({ profit: input(90), readers: input(105), happiness: at(80), culture: at(80) })
        .overall.sacrifice,
    ).toBe(false);
    expect(card(70, 80, 90, 99).overall.sacrifice).toBe(false);
  });

  it("gives Well-Rounded Shop at 80 and above, as a certificate only", () => {
    expect(card(80, 85, 90, 95)).toMatchObject({
      overall: { score: 80 },
      certificates: [{ id: "wellRounded" }],
    });
    expect(card(79, 85, 90, 95).certificates).toEqual([]);
  });

  it("gives Exceeds Requirements only strictly past the goal, in measure order, before Well-Rounded", () => {
    const c = reportCard({
      profit: input(105),
      readers: input(200),
      happiness: at(85),
      culture: input(106),
    });
    expect(c.measures.map((m) => [m.met, m.exceeds])).toEqual([
      [true, false],
      [true, true],
      [false, false],
      [true, true],
    ]);
    expect(c.certificates).toEqual([
      { id: "exceeds", measure: "readers" },
      { id: "exceeds", measure: "culture" },
      { id: "wellRounded" },
    ]);
    expect(c.overall).toMatchObject({ score: 85, binding: ["happiness"] });
  });
});
