import { describe, expect, it } from "vitest";

import { clampBusyness, MAX_SHOPPERS, MAX_SHUTTLES, sceneLevels } from "./scene-params";

describe("sceneLevels", () => {
  it("empties the shop at 0 but keeps one shuttle and dim lights", () => {
    expect(sceneLevels(0)).toEqual({ shoppers: 0, shuttles: 1, glow: 0.55 });
  });

  it("fills the shop at 1", () => {
    expect(sceneLevels(1)).toEqual({ shoppers: MAX_SHOPPERS, shuttles: MAX_SHUTTLES, glow: 1 });
  });

  it("grows with busyness", () => {
    const quiet = sceneLevels(0.3);
    const busy = sceneLevels(0.8);
    expect(busy.shoppers).toBeGreaterThan(quiet.shoppers);
    expect(busy.glow).toBeGreaterThan(quiet.glow);
  });

  it("clamps out-of-range and non-numbers", () => {
    expect(clampBusyness(-2)).toBe(0);
    expect(clampBusyness(7)).toBe(1);
    expect(clampBusyness(Number.NaN)).toBe(0);
  });
});
