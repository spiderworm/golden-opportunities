import { afterEach, describe, expect, it } from "vitest";

import { forgetStation, keepElapsed, kept, stationElapsed, stationShop } from "./world";

afterEach(forgetStation);

describe("the station's world", () => {
  it("is the same shop, state and time on every visit", () => {
    const shop = stationShop();
    const walkers = kept("walkers", () => [{ at: 1 }]);
    walkers[0]!.at = 2;
    keepElapsed(42.5);

    // A new canvas, as when the player comes back to the Station screen.
    expect(stationShop()).toBe(shop);
    expect(kept("walkers", () => [{ at: 1 }])).toEqual([{ at: 2 }]);
    expect(stationElapsed()).toBe(42.5);
  });

  it("opens with a couple of books out of place, so the robots have work", () => {
    expect(stationShop().strays.filter((s) => s !== null)).toHaveLength(2);
  });

  it("starts afresh after a reload", () => {
    const shop = stationShop();
    keepElapsed(10);
    forgetStation();
    expect(stationShop()).not.toBe(shop);
    expect(stationElapsed()).toBe(0);
  });
});
