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
