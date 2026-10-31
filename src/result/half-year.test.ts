import { describe, expect, it } from "vitest";
import { halfYearAdministratorLine, halfYearScoreText } from "./copy";

// The half-year score itself comes from the game (Frank): the mean of the two overall scores, rounded half up.
describe("the half-year review's words", () => {
  it("gives the Administrator's line by band", () => {
    expect(halfYearAdministratorLine(100)).toBe("HALF-YEAR SCORE: 100. TWO GOOD QUARTERS IN A ROW. WE DID NOT KNOW THIS WAS PERMITTED. WE ARE DOING MAGNUM.");
    expect(halfYearAdministratorLine(80)).toBe("HALF-YEAR SCORE: 80. TWO GOOD QUARTERS IN A ROW. WE DID NOT KNOW THIS WAS PERMITTED. WE ARE DOING MAGNUM.");
    expect(halfYearAdministratorLine(79)).toBe("HALF-YEAR SCORE: 79. THE SHOP CONTINUES. THIS IS ALSO A LOOK.");
    expect(halfYearAdministratorLine(70)).toBe("HALF-YEAR SCORE: 70. THE SHOP CONTINUES. THIS IS ALSO A LOOK.");
    expect(halfYearAdministratorLine(69)).toBe("HALF-YEAR SCORE: 69. THE ADMINISTRATOR WILL NEED TO SIT DOWN AGAIN.");
  });

  it("writes the score line with a true minus sign", () => {
    expect(halfYearScoreText(84, "B-")).toBe("Half-year score: 84 (B−)");
  });
});
