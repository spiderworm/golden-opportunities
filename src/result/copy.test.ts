import { describe, expect, it } from "vitest";
import type { MeasureId, MeasureScore, ReportCard } from "~/simulation/types";
import {
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
      "PROFIT: $40,000. GOAL: $39,525. THE GOAL HAS BEEN MET. WE ARE PLEASED. WE HAVE VOTED TO BE PLEASED.",
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
      "PROFIT: $39,525. GOAL: $39,525. THE GOAL HAS BEEN MET. WE ARE PLEASED. WE HAVE VOTED TO BE PLEASED.",
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
    expect(lowestMeasureSpeakers(three)).toBe("The Commerce Office, The Throughput Subcommittee and The Readers' Guild survey drone");
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
    expect(administratorLine(100)).toBe("OVERALL SCORE: 100. THIS IS A WHOLE SHOP.");
    expect(administratorLine(75)).toBe("OVERALL SCORE: 75. THIS IS THREE-QUARTERS OF A SHOP. PLEASE ACQUIRE THE REMAINDER.");
    expect(administratorLine(59)).toBe("OVERALL SCORE: 59. THE ADMINISTRATOR WILL NEED TO SIT DOWN.");
    expect(fractionWords(78)).toBe("ABOUT FOUR-FIFTHS");
    expect(fractionWords(65)).toBe("ABOUT TWO-THIRDS");
  });
});
