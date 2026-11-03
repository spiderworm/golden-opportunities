import { describe, expect, it } from "vitest";
import { calibrate, calibrateMeasure, scoreEntry, type ForecastResult } from "./forecast";

describe("a forecast against what happened", () => {
  it("says which side of the range, and the error as a value and a share of the real figure", () => {
    const forecast = { point: 140000, low: 130000, high: 150000 };
    // Plot's example: "$162,300, above your range… off by $22,300 (14%)".
    expect(scoreEntry(forecast, 162300)).toEqual({
      forecast,
      actual: 162300,
      where: "above",
      error: -22300,
      errorPct: -22300 / 162300,
    });
    expect(scoreEntry(forecast, 120000)).toMatchObject({ where: "below", error: 20000 });
    expect(scoreEntry(forecast, 142300)).toMatchObject({ where: "inside", error: -2300 });
    // The ends are inside.
    expect(scoreEntry(forecast, 130000).where).toBe("inside");
    expect(scoreEntry(forecast, 150000).where).toBe("inside");
    expect(scoreEntry(forecast, 140000)).toMatchObject({ error: 0, errorPct: 0 });
    // No sales: no percent (Sim).
    expect(scoreEntry({ point: 5, low: 0, high: 10 }, 0)).toMatchObject({
      where: "inside",
      error: 5,
      errorPct: null,
    });
  });
});

const result = (
  quarter: string,
  revenue?: [number, number, number, number],
  units?: [number, number, number, number],
): ForecastResult => ({
  quarter: quarter as ForecastResult["quarter"],
  ...(revenue && {
    revenue: scoreEntry({ point: revenue[0], low: revenue[1], high: revenue[2] }, revenue[3]),
  }),
  ...(units && {
    units: scoreEntry({ point: units[0], low: units[1], high: units[2] }, units[3]),
  }),
});

describe("calibration", () => {
  it("counts hits, means the signed percent error and takes the median half-width", () => {
    const results = [
      // point, low, high, actual
      result("2194-Q1", [100, 90, 110, 100]), // inside, 0%, ±10%
      result("2194-Q2", [120, 100, 140, 100]), // inside at its low end, +20%, ±16.7%
      result("2194-Q3", [110, 105, 115, 100]), // below, +10%, ±4.5%
      result("2194-Q4", [90, 80, 100, 120]), // above, −25%, ±11.1%
    ];
    const revenue = calibrateMeasure("revenue", results);
    expect(revenue.n).toBe(4);
    expect(revenue.hits).toBe(2);
    expect(revenue.hitRate).toBe(0.5);
    expect(revenue.bias).toBeCloseTo((0 + 0.2 + 0.1 - 0.25) / 4, 12);
    // Half-widths over the point: 0.1, 1/6, 5/110, 10/90; the median of four is the mean of the middle two.
    expect(revenue.sharpness).toBeCloseTo((0.1 + 10 / 90) / 2, 12);
    expect(revenue.judged).toBe(true);
  });

  it("leaves a quarter with no sales out of bias, and an expected 0 out of sharpness (Sim)", () => {
    const results = [
      result("2194-Q1", undefined, [10, 0, 20, 0]),
      result("2194-Q2", undefined, [0, 0, 5, 4]),
      result("2194-Q3", undefined, [10, 5, 15, 8]),
    ];
    const units = calibrateMeasure("units", results);
    expect(units.n).toBe(3);
    expect(units.hits).toBe(3);
    expect(units.bias).toBeCloseTo((-1 + 0.25) / 2, 12);
    expect(units.sharpness).toBeCloseTo((1 + 0.5) / 2, 12);
  });

  it("is not judged under 3, and empty with none", () => {
    expect(calibrateMeasure("units", [result("2194-Q1", undefined, [1, 0, 2, 1])])).toEqual({
      measure: "units",
      n: 1,
      hits: 1,
      hitRate: 1,
      bias: 0,
      sharpness: 1,
      judged: false,
    });
    expect(calibrateMeasure("revenue", [])).toEqual({
      measure: "revenue",
      n: 0,
      hits: 0,
      hitRate: null,
      bias: null,
      sharpness: null,
      judged: false,
    });
  });

  it("counts each measure over the quarters that forecast it, out of the quarters played", () => {
    const results = [
      { ...result("2194-Q1", [100, 90, 110, 100]), note: "A hunch." },
      result("2194-Q3", undefined, [10, 5, 15, 8]),
    ];
    const calibration = calibrate(results, 5);
    expect(calibration.forecast).toBe(2);
    expect(calibration.played).toBe(5);
    expect(calibration.revenue.n).toBe(1);
    expect(calibration.units.n).toBe(1);
    // The chart's history keeps the figures, never the note.
    expect(calibration.history.map((h) => h.quarter)).toEqual(["2194-Q1", "2194-Q3"]);
    expect(JSON.stringify(calibration)).not.toContain("hunch");
  });
});
