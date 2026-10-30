import { describe, expect, it } from "vitest";
import type { MeasureScore } from "~/game-stub/types";
import { administratorLine, bossLine, fractionWords, heldCourseText, scoreText } from "./copy";

const measure = (id: MeasureScore["id"], result: number, lastYear: number, goal: number): MeasureScore => ({
  id,
  result,
  lastYear,
  goal,
  score: 0,
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
      "PROFIT: $40,000. GOAL: $39,524. THE GOAL HAS BEEN MET. WE ARE PLEASED. WE HAVE VOTED TO BE PLEASED.",
    );
    expect(bossLine(measure("readers", 7_000, 6_825, 7_166))).toBe("7,000 READERS. THE DOOR HAS CAPACITY FOR MORE. THE DOOR IS DISAPPOINTED.");
    expect(bossLine(measure("happiness", 66.04, 65.07, 68.32))).toBe("HAPPINESS: 66.0. PLEASE BE 68.3.");
    expect(bossLine(measure("culture", 17_889, 17_368, 18_236.4))).toBe("CULTURE INCREASED 3%. CULTURE TARGET: 5%. PLEASE CULTURE HARDER.");
    expect(bossLine(measure("culture", 17_000, 17_368, 18_236.4))).toBe("CULTURE HAS DECREASED. THE MINISTRY IS UNCULTURED BY THIS.");
  });

  it("gives the Administrator a whole shop, a fraction of one, or a chair", () => {
    expect(administratorLine(100)).toBe("COMBINED SCORE: 100. THIS IS A WHOLE SHOP.");
    expect(administratorLine(75)).toBe("COMBINED SCORE: 75. THIS IS THREE-QUARTERS OF A SHOP. PLEASE ACQUIRE THE REMAINDER.");
    expect(administratorLine(59)).toBe("COMBINED SCORE: 59. THE ADMINISTRATOR WILL NEED TO SIT DOWN.");
    expect(fractionWords(78)).toBe("ABOUT FOUR-FIFTHS");
    expect(fractionWords(65)).toBe("ABOUT TWO-THIRDS");
  });
});
