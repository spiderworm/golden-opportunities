import { describe, expect, it } from "vitest";
import type { MeasureScore } from "~/game-stub/types";
import { administratorLine, bossLine, fractionWords, heldCourseText, measureTexts, scoreText } from "./copy";

const measure = (id: MeasureScore["id"], result: number, lastYear: number, goal: number): MeasureScore => ({
  id,
  result,
  lastYear,
  goal,
  // As the engine scores: only a result at or past the goal earns 100.
  score: result >= goal ? 100 : 99,
  grade: "F",
  exceeds: false,
});

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

  it("gives the Administrator a whole shop, a fraction of one, or a chair", () => {
    expect(administratorLine(100)).toBe("COMBINED SCORE: 100. THIS IS A WHOLE SHOP.");
    expect(administratorLine(75)).toBe("COMBINED SCORE: 75. THIS IS THREE-QUARTERS OF A SHOP. PLEASE ACQUIRE THE REMAINDER.");
    expect(administratorLine(59)).toBe("COMBINED SCORE: 59. THE ADMINISTRATOR WILL NEED TO SIT DOWN.");
    expect(fractionWords(78)).toBe("ABOUT FOUR-FIFTHS");
    expect(fractionWords(65)).toBe("ABOUT TWO-THIRDS");
  });
});
