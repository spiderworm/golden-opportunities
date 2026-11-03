import { describe, expect, it } from "vitest";
import { ratingRange, t95, withinNoise } from "./evidence";

describe("the 95% point of t", () => {
  it("matches the tables", () => {
    // Two-sided 95% points, from the standard tables.
    const table: [number, number][] = [
      [1, 12.7062],
      [2, 4.3027],
      [3, 3.1824],
      [4, 2.7764],
      [5, 2.5706],
      [10, 2.2281],
      [30, 2.0423],
      [100, 1.984],
      [Infinity, 1.96],
    ];
    for (const [df, t] of table) expect(Math.abs(t95(df) - t) / t).toBeLessThan(2e-4);
  });
});

describe("an average rating's likely range", () => {
  it("is the mean give or take t times its standard error", () => {
    const range = ratingRange(4, { n: 11, se: 0.1 })!;
    expect(range.low).toBeCloseTo(4 - t95(10) * 0.1, 12);
    expect(range.high).toBeCloseTo(4 + t95(10) * 0.1, 12);
  });

  it("is clipped to 1 to 5 stars, and absent below two ratings", () => {
    expect(ratingRange(4.9, { n: 15, se: 0.1 })!.high).toBe(5);
    expect(ratingRange(1.1, { n: 15, se: 0.1 })!.low).toBe(1);
    expect(ratingRange(5, { n: 1, se: null })).toBeNull();
    // Every rating the same has no spread to estimate a range from.
    expect(ratingRange(5, { n: 40, se: 0 })).toBeNull();
    expect(ratingRange(null, { n: 0, se: null })).toBeNull();
  });
});

describe("a difference within noise", () => {
  const count = (value: number) => ({ value, evidence: { n: value, se: Math.sqrt(value) } });

  it("takes counts as Poisson: within 1.96 times the root of their sum", () => {
    expect(withinNoise(null, count(110), count(100))).toBe(true); // 10 <= 1.96 * sqrt(210) = 28.4
    expect(withinNoise(null, count(140), count(100))).toBe(false); // 40 > 30.4
    expect(withinNoise(null, count(3), count(0))).toBe(true); // "New · within noise" (Plot, #297)
  });

  it("tests averages by Welch, with fewer items widening the test", () => {
    const side = (value: number, n: number, sd: number) => ({
      value,
      evidence: { n, se: sd / Math.sqrt(n) },
    });
    // Difference 0.5, spread 0.3: clear with 50 a side, not with 3 (t on 4 degrees of freedom is 2.78).
    expect(withinNoise("ratings", side(4.5, 50, 1.06), side(4, 50, 1.06))).toBe(false);
    expect(withinNoise("ratings", side(4.5, 3, 0.26), side(4, 3, 0.26))).toBe(true);
    // The same figures as counts of days would use 1.96, and call it clear.
    expect(withinNoise("days", side(4.5, 3, 0.26), side(4, 3, 0.26))).toBe(false);
  });

  it("makes no claim when either side can't be judged", () => {
    expect(withinNoise("ratings", { value: 4, evidence: { n: 1, se: null } }, count(4))).toBeNull();
    expect(withinNoise(null, { value: null, evidence: null }, count(4))).toBeNull();
    expect(withinNoise(null, count(4), { value: 4, evidence: null })).toBeNull();
  });
});
