import { describe, expect, it } from "vitest";

import { autoFocus, type SceneBubble } from "./useBossFocus";

const bubbles: SceneBubble[] = [
  { boss: "overall", teaser: "A.", line: "A.", facts: null },
  { boss: "profit", teaser: "B.", line: "B.", facts: null },
];

describe("the scene's own opening focus", () => {
  it("isn't reported while the scene's mode is still undecided", () => {
    expect(autoFocus(bubbles, 0, null, false)).toBeNull();
  });

  it("is reported once the mode is known, for the bubble the scene opened", () => {
    expect(autoFocus(bubbles, 0, "3d", false)).toBe("overall");
    expect(autoFocus(bubbles, 1, "2d", false)).toBe("profit");
  });

  it("is reported only once", () => {
    expect(autoFocus(bubbles, 0, "3d", true)).toBeNull();
  });

  it("isn't reported for a bubble that isn't there", () => {
    expect(autoFocus(bubbles, 5, "2d", false)).toBeNull();
  });
});
