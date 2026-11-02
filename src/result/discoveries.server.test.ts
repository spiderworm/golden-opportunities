import { describe, expect, it } from "vitest";
import { earnedDiscoveries, laterDiscoveries, type LaterOffer } from "./discoveries.server";

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

describe("a later quarter's discoveries (endless.md section 5; endless-copy.md section 4)", () => {
  const offers: LaterOffer[] = [
    { id: "event", params: { type: "genre_slump", yearBefore: "2193-Q4", genre: "SciFi/Fantasy" } },
    { id: "record", params: { last: "2194-Q4", yearBefore: "2193-Q4" } },
    { id: "weakest", params: { measure: "readers", last: "2194-Q4" } },
  ];

  it("say what was found, or where to look, for each one the quarter offered", () => {
    expect(laterDiscoveries(["record"], offers)).toEqual([
      { id: "event", found: false, text: "Break science fiction and fantasy down by title for Q4 2193." },
      { id: "record", found: true, text: "You compared Q4 2194 with Q4 2193." },
      { id: "weakest", found: false, text: "Look into Readers served for Q4 2194, by month or by title." },
    ]);
    expect(laterDiscoveries(["event", "weakest"], offers).filter((d) => d.found).map((d) => d.text)).toEqual([
      "You looked inside science fiction and fantasy, title by title.",
      "You looked into Readers served, last quarter's lowest.",
    ]);
  });

  it("word quiet days and format costs, and offer none when the quarter offered none", () => {
    expect(laterDiscoveries(["event"], [{ id: "event", params: { type: "quiet_days", yearBefore: "2193-Q3", weekday: "Tuesday" } }])[0]!.text).toBe(
      "You found the Tuesday pattern in last year's orders.",
    );
    expect(laterDiscoveries([], [{ id: "event", params: { type: "format_costs", yearBefore: "2193-Q3", format: "Graphic" } }])[0]!.text).toBe("Break Q3 2193 down by format.");
    expect(laterDiscoveries(["event"], [{ id: "event", params: { type: "format_costs", yearBefore: "2193-Q3", format: "Graphic" } }])[0]!.text).toBe(
      "You checked how much of the shop is graphic novel.",
    );
    expect(laterDiscoveries([], [])).toEqual([]);
  });
});
