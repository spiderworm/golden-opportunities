import { describe, expect, it } from "vitest";
import { outcomeOption } from "./outcome-chart";
import type { MeasureId, MeasureScore, ReportCard } from "~/simulation/types";
import { EVENT_TYPES } from "~/alma/events";
import {
  continueTo,
  dayAfter,
  REMOVAL_COPY,
  eventTitle,
  laterSeasonNote,
  q2SeasonNote,
  QUARTER_COPY,
  quarterCopy,
  administratorLine,
  bossLine,
  certificateText,
  fractionWords,
  heldCourseText,
  lowestMeasureLines,
  lowestMeasureSpeakers,
  measureTexts,
  scoreText,
  shownAgainstGoal,
} from "./copy";

const measure = (id: MeasureScore["id"], result: number, lastYear: number, goal: number): MeasureScore => ({
  id,
  result,
  lastYear,
  goal,
  // As the engine scores: only a result at or past the goal earns 100.
  score: result >= goal ? 100 : 99,
  grade: "F",
  met: result >= goal,
  exceeds: result > goal,
});

/** A card with these scores, and the engine's flags as given: the words never work them out. */
function card(scores: Record<MeasureId, number>, overall: Partial<ReportCard["overall"]>): ReportCard {
  const ids = Object.keys(scores) as MeasureId[];
  const low = Math.min(...Object.values(scores));
  return {
    measures: ids.map((id) => ({ ...measure(id, scores[id], 0, 100), score: scores[id] })),
    overall: { score: low, grade: "D", binding: [], closeBehind: [], closeMargin: 3, allMet: false, sacrifice: false, ...overall },
    certificates: [],
  };
}

describe("the report card's words", () => {
  it("writes scores as {score} ({grade}), with a true minus", () => {
    expect(scoreText(91, "A-")).toBe("91 (A−)");
    expect(heldCourseText(65, "D")).toBe("If you had held course: 65 (D)");
  });

  it("picks each boss line by where the result stands, with the card's numbers", () => {
    expect(bossLine(measure("profit", 40_000, 37_642, 39_524.1))).toBe(
      "PROFIT: $40,000. GOAL: $39,525. THE GOAL HAS BEEN MET. WE ARE PLEASED. WE HAVE VOTED TO BE PLEASED. WE ARE DOING BLUE STEEL.",
    );
    expect(bossLine(measure("readers", 7_000, 6_825, 7_166))).toBe("7,000 READERS. THE DOOR HAS CAPACITY FOR MORE. THE DOOR IS DISAPPOINTED.");
    expect(bossLine(measure("happiness", 66.04, 65.07, 68.32))).toBe("HAPPINESS: 66.0. PLEASE BE 68.4.");
    expect(bossLine(measure("culture", 17_889, 17_368, 18_236.4))).toBe("CULTURE INCREASED 3%. CULTURE TARGET: 5%. PLEASE CULTURE HARDER.");
    expect(bossLine(measure("culture", 17_000, 17_368, 18_236.4))).toBe("CULTURE HAS DECREASED. THE MINISTRY IS UNCULTURED BY THIS.");
  });

  it("never shows a goal below what meeting it takes (Audit's case on #44)", () => {
    // 7,166.25 readers: 7,166 falls short and scores 99, so the goal reads 7,167.
    const short = measure("readers", 7_166, 6_825, 7_166.25);
    expect(measureTexts(short)).toEqual({ result: "7,166", goal: "7,167", lastYear: "6,825" });
    expect(bossLine(short)).toBe("7,166 READERS. THE DOOR HAS CAPACITY FOR MORE. THE DOOR IS DISAPPOINTED.");
    expect(measureTexts(measure("readers", 7_167, 6_825, 7_166.25))).toMatchObject({ result: "7,167", goal: "7,167" });
    expect(measureTexts(measure("profit", 39_524, 37_642, 39_524.1))).toMatchObject({ result: "$39,524", goal: "$39,525" });
  });

  it("never rounds a result short of its goal up to the shown goal", () => {
    // 68.36 would round to 68.4, the shown goal, while scoring 99.
    expect(measureTexts(measure("happiness", 68.36, 65.07, 68.37))).toMatchObject({ result: "68.3", goal: "68.4" });
    expect(measureTexts(measure("happiness", 68.3, 65.07, 68.3))).toMatchObject({ result: "68.3", goal: "68.3" });
    // Culture up 4.6% against a 5% target reads 4%, not 5%.
    expect(bossLine(measure("culture", 17_368 * 1.046, 17_368, 17_368 * 1.05))).toBe("CULTURE INCREASED 4%. CULTURE TARGET: 5%. PLEASE CULTURE HARDER.");
  });

  it("never shows a met result below the shown goal (Audit's re-check of #44)", () => {
    expect(measureTexts(measure("profit", 39_524.2, 37_642, 39_524.1))).toMatchObject({ result: "$39,525", goal: "$39,525" });
    expect(measureTexts(measure("happiness", 68.325, 65.07, 68.3241))).toMatchObject({ result: "68.4", goal: "68.4" });
    expect(bossLine(measure("profit", 39_524.2, 37_642, 39_524.1))).toBe(
      "PROFIT: $39,525. GOAL: $39,525. THE GOAL HAS BEEN MET. WE ARE PLEASED. WE HAVE VOTED TO BE PLEASED. WE ARE DOING BLUE STEEL.",
    );
  });

  it("keeps every shown result on the engine's side of the shown goal", () => {
    for (const step of [1, 0.1]) {
      for (let i = 0; i < 2000; i++) {
        const goal = 50 + Math.random() * 100;
        const value = goal + (Math.random() - 0.5) * step * 4;
        const met = value >= goal;
        const shown = shownAgainstGoal(value, goal, met, step);
        expect(shown.value >= shown.goal).toBe(met);
      }
    }
  });

  it("names the measure that set the score, and every measure in a tie", () => {
    const one = card({ profit: 67, readers: 80, happiness: 75, culture: 90 }, { binding: ["profit"] });
    expect(lowestMeasureLines(one)).toEqual(["PROFIT HAS SET YOUR SCORE: 67. THE OTHER MEASURES WERE IRRELEVANT. WE ADMIRED THEM BRIEFLY."]);
    expect(lowestMeasureSpeakers(one)).toBe("The Commerce Office");
    const three = card({ profit: 72, readers: 72, happiness: 72, culture: 90 }, { binding: ["profit", "readers", "happiness"] });
    expect(lowestMeasureLines(three)[0]).toBe("PROFIT, READERS SERVED AND HAPPINESS HAVE JOINTLY SET YOUR SCORE: 72. WE ARE SUSPICIOUS OF TIES.");
    expect(lowestMeasureSpeakers(three)).toBe("The Commerce Office, the Throughput Subcommittee and the Readers' Guild survey drone");
  });

  it("adds the sacrifice line, then the closest close-behind measure from the engine's order", () => {
    const lines = lowestMeasureLines(
      card({ profit: 40, readers: 100, happiness: 41, culture: 43 }, { binding: ["profit"], sacrifice: true, closeBehind: ["happiness", "culture"] }),
    );
    expect(lines).toEqual([
      "PROFIT HAS SET YOUR SCORE: 40. THE OTHER MEASURES WERE IRRELEVANT. WE ADMIRED THEM BRIEFLY.",
      "YOU RAISED ONE MEASURE BY LOWERING ANOTHER. WE ONLY COUNT THE LOWER ONE. THIS IS POLICY.",
      "HAPPINESS WAS 1 POINT FROM SETTING YOUR SCORE. IT IS WATCHING.",
    ]);
    const three = lowestMeasureLines(card({ profit: 70, readers: 73, happiness: 90, culture: 90 }, { binding: ["profit"], closeBehind: ["readers"] }));
    expect(three.at(-1)).toBe("READERS SERVED WAS 3 POINTS FROM SETTING YOUR SCORE. IT IS WATCHING.");
  });

  it("shows the all-met line alone when the engine says every goal was met", () => {
    const all = card(
      { profit: 100, readers: 100, happiness: 100, culture: 100 },
      { allMet: true, binding: ["profit", "readers", "happiness", "culture"], sacrifice: true, closeBehind: ["readers"] },
    );
    expect(lowestMeasureLines(all)).toEqual(["ALL MEASURES MET REQUIREMENTS. YOUR SCORE IS 100. WE ARE RECALIBRATING OUR EXPECTATIONS UPWARD."]);
    expect(lowestMeasureSpeakers(all)).toBe("The Station Administrator");
  });

  it("writes the certificates", () => {
    expect(certificateText({ id: "exceeds", measure: "readers" })).toBe("Exceeds Requirements: Readers served beat its goal. Certificates don't change your score.");
    expect(certificateText({ id: "wellRounded" })).toBe("Well-Rounded Shop: every measure scored 80 or more.");
  });

  it("gives the Administrator a whole shop, a fraction of one, or a chair", () => {
    expect(administratorLine(100)).toBe("OVERALL SCORE: 100. THIS IS A WHOLE SHOP. IT IS REALLY, REALLY, RIDICULOUSLY GOOD-LOOKING.");
    expect(administratorLine(75)).toBe("OVERALL SCORE: 75. THIS IS THREE-QUARTERS OF A SHOP. PLEASE ACQUIRE THE REMAINDER.");
    expect(administratorLine(59)).toBe("OVERALL SCORE: 59. THE ADMINISTRATOR WILL NEED TO SIT DOWN.");
    expect(fractionWords(78)).toBe("ABOUT FOUR-FIFTHS");
    expect(fractionWords(65)).toBe("ABOUT TWO-THIRDS");
  });
});

describe("Q2's season note", () => {
  it("compares Q2 with the player's own Q1, either way, then last year's two", () => {
    expect(q2SeasonNote(175_000, 100_000)).toBe("Q2 revenue was 75% above Q1 2194. Last year, Q2 was the busier quarter: $164,437, 73% above Q1. To judge your plan, compare it with holding course, not with Q1.");
    expect(q2SeasonNote(90_000, 100_000)).toMatch(/^Q2 revenue was 10% below Q1 2194\. Last year, Q2 was the busier quarter/);
  });
});

describe("the outcome chart after Q2", () => {
  it("labels the reference line Q1 2194 and names its months with their own year", () => {
    const option = outcomeOption({
      months: ["2194-04", "2194-05", "2194-06"],
      plan: [1, 2, 3],
      holdCourse: [1, 2, 3],
      reference: [{ month: "01", revenue: 1 }, { month: "02", revenue: 2 }, { month: "03", revenue: 3 }],
      referenceLabel: "Q1 2194 (for reference)",
      referenceYear: "2194",
    }) as { series: { name: string }[]; tooltip: { formatter: (p: unknown[]) => string } };
    expect(option.series[0]!.name).toBe("Q1 2194 (for reference)");
    const tip = option.tooltip.formatter([{ dataIndex: 1, seriesName: "Q1 2194 (for reference)", value: 2, color: "#000" }]);
    expect(tip).toContain("Feb 2194");
    expect(tip).toContain("May 2194");
  });
});

describe("the result's words for any quarter (endless-copy.md sections 1 and 4)", () => {
  it("keep Q1's and Q2's exactly, and build later quarters' from the quarter", () => {
    expect(quarterCopy("2194-Q1", "Q4 2193")).toBe(QUARTER_COPY["2194-Q1"]);
    expect(quarterCopy("2194-Q2", "Q1 2194")).toBe(QUARTER_COPY["2194-Q2"]);
    expect(quarterCopy("2195-Q1", "Q4 2194")).toMatchObject({ title: "Q1 2195: the results", reference: "Q4 2194 (for reference)", lastYear: "Q1 2193, adjusted" });
    expect(continueTo("2194-Q2")).toBe("Continue to Q2");
    expect(continueTo("2194-Q4")).toBe("Continue to Q4 2194");
  });

  it("title every event Alma can choose, with its genre and format words opening in a capital", () => {
    for (const type of EVENT_TYPES) expect(eventTitle("2194-Q3", { type: type.id, params: {} })).not.toBe("None");
    expect(eventTitle("2194-Q3", { type: "genre_surge", params: { genre: "SciFi/Fantasy", month: 2, percent: 20 } })).toBe("Science fiction and fantasy orders rising in August");
    expect(eventTitle("2194-Q4", { type: "genre_slump", params: { genre: "Romance", month: 2, percent: 15 } })).toBe("Romance orders falling in November");
    expect(eventTitle("2194-Q3", { type: "quiet_days", params: { weekday: "Tuesday", percent: 15 } })).toBe("Quiet Tuesdays");
    expect(eventTitle("2194-Q3", { type: "author_fares", params: { cost: 350 } })).toBe("Author nights at $350");
    expect(eventTitle("2194-Q3", { type: "format_costs", params: { format: "Mass market paperback", percent: 66 } })).toBe("Mass market paperback costs at 66%");
    expect(eventTitle("2194-Q3", { type: "format_costs", params: { format: "Graphic", percent: 68 } })).toBe("Graphic novel costs at 68%");
    expect(eventTitle("2194-Q3", { type: "quiet_quarter", params: {} })).toBe("A quiet quarter");
    expect(eventTitle("2194-Q1", null)).toBe("None");
    expect(eventTitle("2194-Q2", null)).toBe("The new Inspector Ryeslton volume");
  });

  it("compare a later quarter's revenue with the one before, and with 2193's when the server sends it", () => {
    expect(laterSeasonNote("2194-Q3", 120_000, 150_000, "Q2 2194")).toBe("Q3 2194 revenue was 20% below Q2 2194. To judge your plan, compare it with holding course, not with Q2 2194.");
    expect(laterSeasonNote("2195-Q1", 120_000, 100_000, "Q4 2194", { quarter: 95_246, before: 161_525, beforeLabel: "Q4 2193" })).toBe(
      "Q1 2195 revenue was 20% above Q4 2194. In 2193, Q1 brought in $95,246, and Q4 2193 $161,525. To judge your plan, compare it with holding course, not with Q4 2194.",
    );
  });
});

describe("the result's later-quarter notes and certificates (endless-copy.md section 4)", () => {
  it("end the goals note's first sentence with the stretch, or the recovery goal", () => {
    expect(quarterCopy("2194-Q3", "Q2 2194", { measure: "culture", percent: 0.15, recoveryFrom: null }).goalsNote).toBe(
      "Each goal is Q3 2193, adjusted for what the Council expected this quarter, plus 5%, and Culture's goal was raised 15% instead. Matching the adjusted Q3 2193 scores 70 (C−). Meeting the goal scores 100 (A+).",
    );
    expect(quarterCopy("2194-Q4", "Q3 2194", { measure: "happiness", percent: 0.14, recoveryFrom: "2194-Q3" }).goalsNote).toContain(
      "plus 5%, and Happiness's goal was 14% above it, to restore its fall in Q3 2194. Matching",
    );
    expect(quarterCopy("2194-Q3", "Q2 2194", null).goalsNote).toContain("plus 5%. Matching the adjusted Q3 2193");
  });

  it("word Comeback and Weathered the Storm from the engine's certificate", () => {
    expect(certificateText({ id: "comeback", measure: "readers", previous: "2194-Q3" }, "2194-Q4")).toBe(
      "Comeback: Readers served fell in Q3 2194, and you restored it. Certificates don't change your score.",
    );
    expect(certificateText({ id: "weathered", measures: ["profit"], event: { type: "author_fares", params: { cost: 350 } } }, "2194-Q3")).toBe(
      "Weathered the Storm: Profit met its goal despite author nights at $350. Certificates don't change your score.",
    );
    expect(
      certificateText({ id: "weathered", measures: ["profit", "readers", "culture"], event: { type: "quiet_days", params: { weekday: "Tuesday", percent: 15 } } }, "2194-Q3"),
    ).toBe("Weathered the Storm: Profit, Readers served and Culture met their goals despite quiet Tuesdays. Certificates don't change your score.");
  });
});

describe("the removal screen's words (endless.md section 7)", () => {
  it("date the removal the day after its quarter, and list the strikes", () => {
    expect(dayAfter("2194-Q3")).toBe("October 1, 2194");
    expect(dayAfter("2194-Q4")).toBe("January 1, 2195");
    expect(REMOVAL_COPY.finalRow("2195-Q2")).toBe("Removed by the panel, July 1, 2195.");
    expect(REMOVAL_COPY.lines.map((l) => l.boss)).toEqual(["overall", "profit", "readers", "happiness", "culture"]);
  });
});
