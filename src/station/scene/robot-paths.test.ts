import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { Bookshop } from "./bookshop";
import {
  clear,
  CRUISE,
  HOMES,
  inFrontOf,
  intoShelf,
  routePoints,
  unitFront,
  type Hop,
} from "./robot-paths";
import { SHELF_HEIGHT, SHELF_UNITS } from "./shelves";

// No robot passes into a shelf (David: they "clip through the shelves" as they tidy): every stretch of every
// chore, at every book on every shelf, from and to every robot's corner, sampled every few centimeters,
// stays out of every shelf unit's box, grown by the robot's reach.

const shop = new Bookshop(() => 0.5);

/** The flight from `from`, by cruising height, to `to`, as hops. */
const flight = (from: Vector3, to: Vector3, cruise: number): Hop[] => {
  const points = [from, ...routePoints(from, to, cruise)];
  return points.slice(1).map((p, i) => [points[i]!, p]);
};

/** How deep the deepest point of these hops goes into any shelf (negative: the least clearance). */
function deepest(hops: Hop[]): number {
  let worst = -Infinity;
  const p = new Vector3();
  for (const [a, b] of hops) {
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.03));
    for (let s = 0; s <= steps; s++) {
      p.lerpVectors(a, b, s / steps);
      for (const unit of SHELF_UNITS) worst = Math.max(worst, intoShelf(p, unit));
    }
  }
  return worst;
}

describe("the robots keep out of the shelves", () => {
  it("hovers in front of every book on every shelf, to reshelve it or straighten it, with air to spare", () => {
    for (const above of [0.32, 0.3]) {
      shop.books.forEach((_, book) => {
        const hover = inFrontOf(shop, book, above);
        expect(deepest([[hover, hover]]), `book ${book}`).toBeLessThan(-0.05);
      });
    }
  });

  it("flies there and back from every corner without passing through a shelf", () => {
    const hops: Hop[] = [];
    shop.books.forEach((_, book) => {
      const hover = inFrontOf(shop, book, 0.32);
      HOMES.forEach((home, i) =>
        hops.push(...flight(home, hover, CRUISE[i]!), ...flight(hover, home, CRUISE[i]!)),
      );
      // And on to a book on another shelf.
      const other = inFrontOf(shop, (book + 211) % shop.books.length, 0.3);
      hops.push(...flight(hover, other, CRUISE[book % 3]!));
    });
    expect(deepest(hops)).toBeLessThan(0);
  });

  it("dusts the top of every shelf unit from above it, coming and going in front of it", () => {
    for (const unit of SHELF_UNITS) {
      const front = unitFront(unit);
      const along = new Vector3(Math.cos(unit.facing), 0, -Math.sin(unit.facing)).multiplyScalar(
        unit.width / 2 - 0.35,
      );
      const top = new Vector3(unit.x, SHELF_HEIGHT + 0.32, unit.z).addScaledVector(front, 0.05);
      const [a, b] = [top.clone().add(along), top.clone().sub(along)];
      const [outA, outB] = [
        clear(a.clone().addScaledVector(front, 0.6)),
        clear(b.clone().addScaledVector(front, 0.6)),
      ];
      HOMES.forEach((home, i) => {
        expect(
          deepest([...flight(home, outA, CRUISE[i]!), [outA, a], [a, b], [b, outB]]),
        ).toBeLessThan(0);
      });
    }
  });

  it("rests in its corner clear of the shelves", () => {
    for (const home of HOMES) expect(deepest([[home, home]])).toBeLessThan(0);
  });
});
