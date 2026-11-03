import { describe, expect, it } from "vitest";
import {
  isAvailable,
  resolveQuarter,
  resolveQuarters,
  resolveQuery,
  shiftQuarter,
} from "./relative";

const y2193 = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];
const played = [...y2193, "2194-Q1", "2194-Q2"];

describe("relative quarters", () => {
  it("count quarters across years", () => {
    expect(shiftQuarter("2194-Q1", -1)).toBe("2193-Q4");
    expect(shiftQuarter("2194-Q1", -4)).toBe("2193-Q1");
    expect(shiftQuarter("2193-Q4", 1)).toBe("2194-Q1");
    expect(shiftQuarter("2195-Q3", -9)).toBe("2193-Q2");
  });

  it("start from the newest quarter the player can see, never one being planned", () => {
    // Planning Q1 2194: the ledgers end at Q4 2193.
    expect(resolveQuarter("latest", y2193)).toBe("2193-Q4");
    expect(resolveQuarter("latest-1", y2193)).toBe("2193-Q3");
    expect(resolveQuarter("latest-4", y2193)).toBe("2192-Q4");
    // Two quarters played, in any order.
    expect(resolveQuarter("latest", [...played].reverse())).toBe("2194-Q2");
    expect(resolveQuarter("latest-4", played)).toBe("2193-Q2");
    expect(resolveQuarter("latest", [])).toBeNull();
  });

  it("say when a resolved quarter is out of sight", () => {
    expect(isAvailable(resolveQuarter("latest-4", y2193), y2193)).toBe(false);
    expect(isAvailable(resolveQuarter("latest-1", y2193), y2193)).toBe(true);
    expect(isAvailable(null, y2193)).toBe(false);
  });

  it("resolve a filter in order, without repeats, saying what each token became", () => {
    expect(resolveQuarters(["latest-1", "2194-Q2", "latest"], played)).toEqual({
      values: ["2194-Q1", "2194-Q2"],
      resolved: { "latest-1": "2194-Q1", latest: "2194-Q2" },
    });
    expect(resolveQuarters(["2193-Q1"], played)).toEqual({ values: ["2193-Q1"], resolved: {} });
  });

  it("leave a query without tokens as it is, and resolve one with them", () => {
    const dated = {
      measure: "revenue" as const,
      by: ["genre" as const],
      filter: { quarter: ["2193-Q4"] },
    };
    expect(resolveQuery(dated, played)).toEqual({ query: dated, resolved: null });
    expect(resolveQuery({ ...dated, filter: { quarter: ["latest"] } }, played)).toEqual({
      query: { ...dated, filter: { quarter: ["2194-Q2"] } },
      resolved: { latest: "2194-Q2" },
    });
    // No periods at all: it matches nothing rather than every quarter.
    expect(
      resolveQuery({ ...dated, filter: { quarter: ["latest"] } }, []).query.filter?.quarter,
    ).toEqual(["none"]);
  });
});
