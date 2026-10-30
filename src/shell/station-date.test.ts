import { describe, expect, it } from "vitest";
import { formatStationDate } from "./station-date";

describe("formatStationDate", () => {
  it("formats an ISO date as day, short month and year", () => {
    expect(formatStationDate("2194-01-04")).toBe("4 Jan 2194");
    expect(formatStationDate("2193-12-31")).toBe("31 Dec 2193");
  });

  it("rejects anything that isn't an ISO date", () => {
    expect(() => formatStationDate("2194-13-01")).toThrow();
    expect(() => formatStationDate("Jan 4")).toThrow();
  });
});
