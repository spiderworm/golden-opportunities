import { describe, expect, it } from "vitest";
import { isGameKey, isQuarter, timelineHeadings, timelineLabel } from "./timeline";

describe("Dewey's chat on a timeline (David, 3 Nov 2026; Plot's copy)", () => {
  it("labels this quarter Today, an earlier one by its first day, and an unrecorded one Earlier", () => {
    expect(timelineLabel({ quarter: "2194-Q2" }, { quarter: "2194-Q2" })).toBe("Today");
    expect(timelineLabel({ quarter: "2194-Q1" }, { quarter: "2194-Q2" })).toBe("2194 Jan 1");
    expect(timelineLabel({ quarter: "2194-Q2" }, { quarter: "2194-Q3" })).toBe("2194 Apr 1");
    expect(timelineLabel({ quarter: "2195-Q4" }, { quarter: "2196-Q1" })).toBe("2195 Oct 1");
    expect(timelineLabel({}, { quarter: "2194-Q2" })).toBe("Earlier");
    expect(timelineLabel({ quarter: "nonsense" }, { quarter: "2194-Q2" })).toBe("Earlier");
    // Without a current quarter (no game, status unread), nothing is Today.
    expect(timelineLabel({ quarter: "2194-Q2" }, {})).toBe("2194 Apr 1");
  });

  it("heads each run of a quarter once, oldest first, and moves Today along as the game advances", () => {
    const replies = [
      {},
      { quarter: "2194-Q1" },
      { quarter: "2194-Q1" },
      { quarter: "2194-Q2" },
      { quarter: "2194-Q2" },
    ];
    expect(timelineHeadings(replies, { quarter: "2194-Q2" })).toEqual([
      "Earlier",
      "2194 Jan 1",
      null,
      "Today",
      null,
    ]);
    // A quarter later, last quarter's Today is dated, with nothing to migrate.
    expect(timelineHeadings(replies, { quarter: "2194-Q3" })).toEqual([
      "Earlier",
      "2194 Jan 1",
      null,
      "2194 Apr 1",
      null,
    ]);
    expect(timelineHeadings([], { quarter: "2194-Q1" })).toEqual([]);
  });

  it("puts turns from a game before Play again under Earlier, not dated ahead of Today (Audit, #390)", () => {
    expect(timelineLabel({ quarter: "2194-Q3" }, { quarter: "2194-Q1" })).toBe("Earlier");
    const replies = [{ quarter: "2194-Q2" }, { quarter: "2194-Q3" }, { quarter: "2194-Q1" }];
    expect(timelineHeadings(replies, { quarter: "2194-Q1" })).toEqual(["Earlier", null, "Today"]);
  });

  it("puts another game's turns under Earlier, whatever their quarter (Chart, #390)", () => {
    const now = { quarter: "2194-Q2", game: "aaaaaaaaaaaaaaaa" };
    const replies = [
      { quarter: "2194-Q1", game: "bbbbbbbbbbbbbbbb" },
      { quarter: "2194-Q2", game: "bbbbbbbbbbbbbbbb" },
      { quarter: "2194-Q1", game: "aaaaaaaaaaaaaaaa" },
      { quarter: "2194-Q2", game: "aaaaaaaaaaaaaaaa" },
    ];
    expect(timelineHeadings(replies, now)).toEqual(["Earlier", null, "2194 Jan 1", "Today"]);
    // A turn from before games were recorded, or with the game unknown now, goes by its quarter as before.
    expect(timelineLabel({ quarter: "2194-Q2" }, now)).toBe("Today");
    expect(timelineLabel(replies[1]!, { quarter: "2194-Q2" })).toBe("Today");
  });

  it("knows a quarter when it sees one", () => {
    expect(isQuarter("2194-Q1")).toBe(true);
    expect(isQuarter("2194-Q5")).toBe(false);
    expect(isQuarter(2194)).toBe(false);
  });
  it("knows a game's key when it sees one", () => {
    expect(isGameKey("0123456789abcdef")).toBe(true);
    expect(isGameKey("0123456789ABCDEF")).toBe(false);
    expect(isGameKey("0123456789abcde")).toBe(false);
    expect(isGameKey(12)).toBe(false);
  });
});
