import { describe, expect, it } from "vitest";
import { goalFor, gradeFor, LAST_YEAR, reportCard } from "./report-card";

const atLastYear = { ...LAST_YEAR };

describe("the stub's report card", () => {
  it("grades on the design's inclusive ranges", () => {
    expect([100, 99, 93, 92, 90, 89, 80, 79, 70, 69, 60, 59, 0].map(gradeFor)).toEqual(["A+", "A", "A", "A-", "A-", "B+", "B-", "C+", "C-", "D", "D", "F", "F"]);
  });

  it("sets each goal at last year plus 5%", () => {
    expect(goalFor("profit")).toBeCloseTo(39_524.1, 1);
  });

  it("scores matching last year at 65 and Plot's worked shortfall at 33", () => {
    expect(reportCard(atLastYear).measures.map((m) => m.score)).toEqual([65, 65, 65, 65]);
    const short = reportCard({ ...atLastYear, profit: 28_802 }).measures[0]!;
    expect(short).toMatchObject({ score: 33, grade: "F", exceeds: false });
  });

  it("keeps A+ for meeting the goal, and the award for passing it", () => {
    const goal = goalFor("profit");
    const [under] = reportCard({ ...atLastYear, profit: goal - 0.01 }).measures;
    const [at] = reportCard({ ...atLastYear, profit: goal }).measures;
    const [past] = reportCard({ ...atLastYear, profit: goal + 1 }).measures;
    expect(under).toMatchObject({ score: 99, exceeds: false });
    expect(at).toMatchObject({ score: 100, grade: "A+", exceeds: false });
    expect(past).toMatchObject({ score: 100, exceeds: true });
  });

  it("adds 3 for a well-rounded shop, capped at 100", () => {
    const halfway = (id: keyof typeof LAST_YEAR, share: number) => LAST_YEAR[id] + share * (goalFor(id) - LAST_YEAR[id]);
    // 65 + 35 x 0.5 = 82.5 on every measure: B, and well rounded.
    const card = reportCard({ profit: halfway("profit", 0.5), readers: halfway("readers", 0.5), happiness: halfway("happiness", 0.5), culture: halfway("culture", 0.5) });
    expect(card.measures.map((m) => m.score)).toEqual([83, 83, 83, 83]);
    expect(card.wellRounded).toBe(true);
    expect(card.combined).toEqual({ score: 86, grade: "B" });
    const top = reportCard({ profit: goalFor("profit"), readers: goalFor("readers"), happiness: goalFor("happiness"), culture: goalFor("culture") });
    expect(top.combined).toEqual({ score: 100, grade: "A+" });
  });
});
