import { describe, expect, it } from "vitest";
import { earnedDiscoveries } from "./discoveries.server";

describe("earnedDiscoveries", () => {
  it("gives the answer only for what was found, and a hint for the rest", () => {
    const earned = earnedDiscoveries(["B"]);
    expect(earned.map((d) => [d.id, d.found])).toEqual([["A", false], ["B", true], ["C", false]]);
    expect(earned[1]!.text).toBe("Weekdays emptied; weekends held.");
    expect(earned[2]!.text).not.toContain("Book of the Month");
  });
});

describe("Q2's discoveries (q2.md, section 6)", () => {
  it("are D to F, with Q1's left on Q1's screen", () => {
    const earned = earnedDiscoveries(["E"], "2194-Q2");
    expect(earned.map((d) => [d.id, d.found])).toEqual([["D", false], ["E", true], ["F", false]]);
    expect(earned[1]!.text).toBe("Ratings differ a lot from title to title, and they aren't the same as sales.");
    expect(earned[2]!.text).toBe("Put Q1 2193 and Q1 2194 side by side.");
    // A Q1 id found in Q2's list means nothing here.
    expect(earnedDiscoveries(["A"], "2194-Q2").every((d) => !d.found)).toBe(true);
  });
});
