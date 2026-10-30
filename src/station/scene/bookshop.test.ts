import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import { Bookshop, MAX_STRAYS, SURFACES } from "./bookshop";

// A shopper's spot in front of the left wall's shelves, and one by the back wall.
const LEFT = [-6.6, 1.0] as const;
const BACK = [1.2, -4.3] as const;

describe("Bookshop", () => {
  it("takes a book off the shelf in reach and leaves a gap", () => {
    const shop = new Bookshop(() => 0.5);
    const slot = shop.take(...LEFT);
    expect(slot).toBeGreaterThanOrEqual(0);
    const stray = shop.strays[slot]!;
    expect(stray.state).toBe("carried");
    expect(shop.onShelf(stray.book)).toBe(false);
    expect(shop.shelfCenter(stray.book).distanceTo(new Vector3(LEFT[0], 0, LEFT[1]).setY(shop.shelfCenter(stray.book).y))).toBeLessThan(1.3);
  });

  it("sets a book down on a surface in reach, and on the floor when none is", () => {
    const shop = new Bookshop(() => 0.5);
    const onTable = shop.take(...LEFT);
    shop.setDown(onTable, -6.6, 2.8, 0);
    expect(shop.strays[onTable]).toMatchObject({ state: "down", surface: 0 });
    const onFloor = shop.take(...BACK);
    shop.setDown(onFloor, ...BACK, Math.PI);
    expect(shop.strays[onFloor]).toMatchObject({ state: "down", surface: -1 });
    expect(new Vector3().setFromMatrixPosition(shop.strays[onFloor]!.matrix).y).toBeLessThan(0.2);
  });

  it("never sets two books on one surface", () => {
    const shop = new Bookshop(() => 0.5);
    const [a, b] = [shop.take(...LEFT), shop.take(...LEFT)];
    const [x, , z] = SURFACES[0]!;
    shop.setDown(a, x, z, 0);
    shop.setDown(b, x, z, 0);
    expect(shop.strays[a]!.surface).toBe(0);
    expect(shop.strays[b]!.surface).not.toBe(0);
  });

  it("lets one robot fetch each book, and shelves it back in its gap", () => {
    const shop = new Bookshop(() => 0.5);
    const slot = shop.take(...LEFT);
    expect(shop.claimStray(0, new Vector3())).toBe(-1); // still in the shopper's hands
    shop.setDown(slot, ...LEFT, 0);
    expect(shop.claimStray(0, new Vector3())).toBe(slot);
    expect(shop.claimStray(1, new Vector3())).toBe(-1);
    const book = shop.strays[slot]!.book;
    shop.lift(slot);
    shop.shelve(slot);
    expect(shop.strays[slot]).toBeNull();
    expect(shop.onShelf(book)).toBe(true);
  });

  it("holds at most MAX_STRAYS books out of place", () => {
    const shop = new Bookshop(() => 0.5);
    const slots = Array.from({ length: MAX_STRAYS + 2 }, (_, i) => (i % 2 ? shop.take(...LEFT) : shop.take(...BACK)));
    expect(slots.filter((s) => s >= 0)).toHaveLength(MAX_STRAYS);
  });

  it("has robots straighten leaning books, one robot each", () => {
    const shop = new Bookshop(() => 0.5);
    const before = shop.leaningCount;
    shop.lean(...LEFT);
    expect(shop.leaningCount).toBe(before + 1);
    const claimed = new Set<number>();
    for (let robot = 0; robot < before + 1; robot++) claimed.add(shop.claimLean(robot, new Vector3(...LEFT, 0)));
    expect(claimed.size).toBe(before + 1);
    expect(shop.claimLean(9, new Vector3())).toBe(-1);
    for (const book of claimed) shop.straightened(book);
    expect(shop.leaningCount).toBe(0);
  });
});
