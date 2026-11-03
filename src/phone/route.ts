import { CELL, type Corridors } from "./corridors";

// The robot's walk out (David, 2 Nov): it turns round to the bosses' room's
// door, walks to it and through it, and on down the corridors (corridors.ts)
// for ever. It steers as a person walks, toward a point a little way ahead on
// its way (pure pursuit), so it rounds the corners rather than turning on the
// spot, and at a steady pace: the walk clip's, so its feet don't slide.
// Positions are on the floor, in the world's metres (x, z); a heading is the way
// it faces, 0 along +z (the robot's own forward, toward the phone it took) and
// turning toward +x.

/** The walk clip's pace, measured from its planted foot: 1.0 m/s at its own speed. */
export const PACE = 1.0;
/** How far ahead on its way it steers for, in metres. */
const STEER_AHEAD = 1.4;
/** How fast it can turn, walking (radians a second), and turning round where it stands. */
const TURN_RATE = 1.6;
const TURN_ROUND_RATE = 1.4;
/** It walks on once it faces within this of the way to go (radians). */
const FACING = 0.25;

export interface Place {
  x: number;
  z: number;
}

/** Where the corridors start in the world: the middle of the door in the room's back wall, on the floor. */
export type Door = Place;

/** The middle of a corridor cell, in the world: cell (0, 0) is just through the door, and the grid's -z is the world's. */
export function cellMiddle(door: Door, cell: { x: number; z: number }): Place {
  return { x: door.x + cell.x * CELL, z: door.z - CELL / 2 + cell.z * CELL };
}

export const headingOf = (dx: number, dz: number) => Math.atan2(dx, dz);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Route {
  x: number;
  z: number;
  heading: number;
  /** Whether it has turned round and is walking (false while it turns where it stands). */
  walking = false;
  /** How far it has walked, in metres. */
  walked = 0;
  /** The points it walks through: two in the room (in front of the door, then the doorway), then the way's cells. */
  private readonly points: Place[];
  /** The leg it's on: from points[leg] to points[leg + 1]. */
  private leg = 0;

  private readonly door: Door;
  private readonly corridors: Corridors;

  constructor(from: Place, heading: number, door: Door, corridors: Corridors) {
    this.door = door;
    this.corridors = corridors;
    this.x = from.x;
    this.z = from.z;
    this.heading = heading;
    this.points = [{ ...from }, { x: door.x, z: door.z + 1.6 }, { x: door.x, z: door.z }];
  }

  /** The way's cell it's in or coming to (0 until it's through the door). */
  get cell(): number {
    return Math.max(0, this.leg - 2);
  }

  /** Whether it's through the door. */
  get through(): boolean {
    return this.z < this.door.z;
  }

  private point(i: number): Place {
    while (this.points.length <= i)
      this.points.push(cellMiddle(this.door, this.corridors.wayCell(this.points.length - 3)));
    return this.points[i]!;
  }

  /** The point `ahead` metres on along its way from where it is now (projected onto its leg). */
  ahead(ahead: number): Place {
    let a = this.point(this.leg);
    let b = this.point(this.leg + 1);
    const along = (x: number, z: number) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz) || 1e-9;
      return Math.min(length, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / length));
    };
    let at = along(this.x, this.z);
    let left = ahead;
    for (let i = this.leg; ; i++) {
      a = this.point(i);
      b = this.point(i + 1);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (at + left <= length) {
        const k = (at + left) / length;
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
      }
      left -= length - at;
      at = 0;
    }
  }

  /** Walks on `dt` seconds: turns round toward the door first, where it stands, then steers along its way. */
  step(dt: number) {
    // On to the next leg once it's past this one's end.
    for (;;) {
      const a = this.point(this.leg);
      const b = this.point(this.leg + 1);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      if (length > 1e-6 && ((this.x - a.x) * dx + (this.z - a.z) * dz) / length < length) break;
      this.leg += 1;
    }
    const target = this.ahead(STEER_AHEAD);
    const want = headingOf(target.x - this.x, target.z - this.z);
    const off = wrap(want - this.heading);
    if (!this.walking) {
      this.heading = wrap(
        this.heading + Math.sign(off) * Math.min(Math.abs(off), TURN_ROUND_RATE * dt),
      );
      if (Math.abs(off) < FACING) this.walking = true;
      return;
    }
    // Pure pursuit: the arc through the point ahead; turned no faster than a walk turns.
    const turn = (2 * Math.sin(off) * PACE) / STEER_AHEAD;
    this.heading = wrap(this.heading + Math.max(-TURN_RATE, Math.min(TURN_RATE, turn)) * dt);
    this.x += Math.sin(this.heading) * PACE * dt;
    this.z += Math.cos(this.heading) * PACE * dt;
    this.walked += PACE * dt;
  }
}
