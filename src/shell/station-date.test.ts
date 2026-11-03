import { describe, expect, it } from "vitest";
import { formatStationDate } from "./station-date";

describe("formatStationDate", () => {
  it("formats an ISO date as year, short month and day (David, 3 Nov 2026)", () => {
    expect(formatStationDate("2194-01-04")).toBe("2194 Jan 4");
    expect(formatStationDate("2193-12-31")).toBe("2193 Dec 31");
  });

  it("rejects anything that isn't an ISO date", () => {
    expect(() => formatStationDate("2194-13-01")).toThrow();
    expect(() => formatStationDate("Jan 4")).toThrow();
  });
});
