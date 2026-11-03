import { describe, expect, it } from "vitest";
import {
  basedOnLine,
  bothCounts,
  bothLine,
  countOf,
  faded,
  fadedCaption,
  lowLine,
  noisy,
  rangeLine,
  withNoise,
} from "./evidence";

describe("how much evidence, in words (Plot, #296 and #297)", () => {
  it("names the count's unit, singular for one", () => {
    expect(countOf("ratings", 212)).toBe("212 ratings");
    expect(countOf("orders", 1240)).toBe("1,240 orders");
    expect(countOf("sale lines", 3410)).toBe("3,410 sale lines");
    expect(countOf("days", 90)).toBe("90 days");
    expect(countOf("ratings", 1)).toBe("1 rating");
    expect(countOf("sale lines", 1)).toBe("1 sale line");
    expect(basedOnLine("ratings", 212)).toBe("Based on 212 ratings");
  });

  it("fades and warns under 30, never for days", () => {
    expect(lowLine("ratings", 8)).toBe(
      "Only 8 ratings: this average could easily change with a few more",
    );
    expect(lowLine("ratings", 30)).toBeNull();
    expect(lowLine("days", 4)).toBeNull();
    expect(faded("orders", { n: 29, se: 1 })).toBe(true);
    expect(faded("days", { n: 4, se: 1 })).toBe(false);
    expect(faded(null, { n: 4, se: 1 })).toBe(false);
    expect(fadedCaption("ratings")).toBe("Faded where there are fewer than 30 ratings");
  });

  it("gives average rating's likely range to one decimal, clipped, or says there's none", () => {
    expect(rangeLine(4.1, { n: 100, se: 0.1 })).toBe("Likely range: 3.9 to 4.3 stars");
    expect(rangeLine(4.95, { n: 40, se: 0.1 })).toBe("Likely range: 4.7 to 5.0 stars");
    expect(rangeLine(5, { n: 1, se: null })).toBe("Too few ratings for a likely range");
    // Every rating the same: the fact, and why there's no range (Plot, after #340).
    expect(rangeLine(5, { n: 3, se: 0 })).toBe(
      "All 3 ratings are 5 stars, so there's no likely range to give.",
    );
    expect(rangeLine(4, { n: 2, se: 0 })).toBe(
      "Both ratings are 4 stars, so there's no likely range to give.",
    );
    expect(rangeLine(1, { n: 1240, se: 0 })).toBe(
      "All 1,240 ratings are 1 star, so there's no likely range to give.",
    );
    // A narrow range would read "4.2 to 4.2" at one decimal: two, then (Plot, after #337).
    expect(rangeLine(4.21, { n: 4000, se: 0.015 })).toBe("Likely range: 4.18 to 4.24 stars");
    expect(rangeLine(null, { n: 0, se: null })).toBeNull();
  });

  it("flags a change within noise, and never one that can't be judged", () => {
    const count = (value: number) => ({ value, evidence: { n: value, se: Math.sqrt(value) } });
    expect(noisy(null, count(110), count(100))).toBe(true);
    expect(noisy(null, count(140), count(100))).toBe(false);
    expect(noisy("ratings", { value: 4, evidence: { n: 1, se: null } }, count(4))).toBe(false);
    expect(withNoise("+2.1%", true)).toBe("+2.1% · within noise");
    expect(withNoise("New", true)).toBe("New · within noise");
    expect(withNoise("+2.1%", false)).toBe("+2.1%");
    expect(withNoise("", true)).toBe("");
  });

  it("gives last year's average both counts, the unit once, singular only when both are one (Plot)", () => {
    expect(bothCounts("orders", 1240, 980)).toBe("1,240 and 980 orders");
    expect(bothCounts("ratings", 1, 980)).toBe("1 and 980 ratings");
    expect(bothCounts("ratings", 1, 1)).toBe("1 and 1 rating");
    expect(bothCounts("orders", 1240, null)).toBe("1,240 orders");
    expect(bothLine("orders", 1240, 980, { now: "Q1 2194", then: "Q1 2193" })).toBe(
      "Based on 1,240 orders (Q1 2194) and 980 (Q1 2193)",
    );
  });
});
