import { Vector3 } from "three";

import type { Bookshop } from "./bookshop";
import { SHELF_DEPTH, SHELF_HEIGHT, SHELF_UNITS, type ShelfUnit } from "./shelves";

// Where the shop's flying robots go, kept apart from how they're drawn
// (Robots.tsx), so it can be checked against the shelves without a scene.

/** The model is a unit tall; a robot is a little under half a meter, so it reads from the camera's corner. */
export const SIZE = 0.46;
/** How far a robot reaches from its center, across (any way it's turned) and up and down (with its bob):
    the model is 0.754 by 0.742 across and 0.98 tall, at SIZE. */
export const REACH = { across: Math.hypot(0.377, 0.371) * SIZE, up: 0.49 * SIZE + 0.03 };
/** The air a robot keeps between itself and a shelf's front face while it works there. */
export const STANDOFF = 0.06;
/** Each robot crosses the room at its own height, so they never meet. */
export const CRUISE = [3.1, 3.5, 3.9];
export const HOMES = [new Vector3(6.6, 4.3, 4.6), new Vector3(-7.1, 4.3, -0.6), new Vector3(1.5, 4.4, -4.3)];

/** A stretch of flight: from one point straight to another. */
export type Hop = [from: Vector3, to: Vector3];

/** Up to cruising height, across, and down to `to`: the points it passes through, after `from`. */
export function routePoints(from: Vector3, to: Vector3, cruise: number): Vector3[] {
  return [new Vector3(from.x, cruise, from.z), new Vector3(to.x, cruise, to.z), to.clone()];
}

/**
 * Where a robot hovers to work on a book: in front of the book's shelf, clear of its face by the robot's own
 * reach and a little air (whichever way it's turned as it comes down), `above` over the book's top.
 */
export function inFrontOf(shop: Bookshop, book: number, above: number, out = new Vector3()): Vector3 {
  const b = shop.books[book]!;
  const center = shop.shelfCenter(book, out);
  // The book's center is b.local.z in front of its unit's center line; the face is half the shelf's depth.
  const toFace = SHELF_DEPTH / 2 - b.local.z;
  center.addScaledVector(shop.front(book), toFace + STANDOFF + REACH.across);
  center.y += b.size.y / 2 + above;
  return clear(center);
}

/**
 * Moves a point a robot will work at out of any shelf unit it would reach into, straight out of that unit's
 * front, so it keeps STANDOFF of air: in a corner, a book at the end of one shelf is behind the face of the
 * shelf beside it, and the robot slides along to where it can hover in front of both. Robots come down to
 * their work and go back up straight, so this keeps the whole column under the point clear, even above the shelves.
 */
export function clear(p: Vector3): Vector3 {
  const floor = new Vector3();
  for (const unit of SHELF_UNITS) {
    if (intoShelf(floor.set(p.x, 0, p.z), unit) <= -STANDOFF) continue;
    const front = unitFront(unit);
    const out = front.x * (p.x - unit.x) + front.z * (p.z - unit.z);
    p.addScaledVector(front, SHELF_DEPTH / 2 + REACH.across + STANDOFF - out);
  }
  return p;
}

/** A unit's front, the way out toward the room. */
export const unitFront = (unit: ShelfUnit) => new Vector3(Math.sin(unit.facing), 0, Math.cos(unit.facing));

/**
 * How far a robot centered at `p` reaches into a shelf unit (positive: into it), or a negative clearance:
 * its box, grown by the robot's reach, against the point.
 */
export function intoShelf(p: Vector3, unit: ShelfUnit): number {
  const front = unitFront(unit);
  const along = new Vector3(front.z, 0, -front.x);
  const d = new Vector3(p.x - unit.x, 0, p.z - unit.z);
  const across = REACH.across;
  const out = [
    Math.abs(d.dot(front)) - (SHELF_DEPTH / 2 + across),
    Math.abs(d.dot(along)) - (unit.width / 2 + across),
    p.y - REACH.up - SHELF_HEIGHT,
  ];
  // Inside on every side: the least of how deep it is; outside on any: the most of how far.
  return -Math.max(...out);
}
