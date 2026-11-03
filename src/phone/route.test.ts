import { describe, expect, it } from "vitest";

import { CELL, Corridors } from "./corridors";
import { cellMiddle, PACE, Route } from "./route";

// The robot's walk out: it turns round where it stands, goes through the door, and walks the corridors for ever
// without touching a wall, at the walk clip's pace.

const DOOR = { x: -0.02, z: -9.05 };
const DT = 1 / 60;
/** Half the robot's width at the shoulders, and the door's half width (2.09 m across, in the picture). */
const HALF_WIDTH = 0.3;
const DOOR_HALF = 2.09 / 2;

describe.each([1, 7, 42])("walking out, corridors from seed %i", (seed) => {
  const corridors = new Corridors(seed);
  const route = new Route({ x: -0.3, z: -0.35 }, 0, DOOR, corridors);
  const track: { x: number; z: number; heading: number; walking: boolean; cell: number }[] = [];
  for (let i = 0; i < 60 * 60 * 10; i++) {
    route.step(DT);
    track.push({
      x: route.x,
      z: route.z,
      heading: route.heading,
      walking: route.walking,
      cell: route.cell,
    });
  }

  it("turns round where it stands before it walks", () => {
    const first = track.findIndex((p) => p.walking);
    expect(first).toBeGreaterThan(30);
    for (const p of track.slice(0, first))
      expect(Math.hypot(p.x + 0.3, p.z + 0.35)).toBeLessThan(1e-9);
    expect(Math.abs(Math.cos(track[first]!.heading) + 1)).toBeLessThan(0.05);
  });

  it("goes through the doorway, clear of its sides", () => {
    const at = track.findIndex((p) => p.z < DOOR.z);
    expect(at).toBeGreaterThan(0);
    expect(Math.abs(track[at]!.x - DOOR.x)).toBeLessThan(DOOR_HALF - HALF_WIDTH);
  });

  it("never comes within its half width of a corridor's wall", () => {
    for (const p of track.filter((p) => p.z < DOOR.z - 0.3)) {
      // In some cell that's open to where it is: its distance from the middle of the nearest of the way's cells
      // (or the line between two of them) leaves room to the walls.
      let clear = -Infinity;
      for (let i = Math.max(0, p.cell - 2); i <= p.cell + 2; i++) {
        const a = cellMiddle(DOOR, corridors.wayCell(i));
        const b = cellMiddle(DOOR, corridors.wayCell(i + 1));
        // Inside the corridor from a to b (a box CELL wide round the line between their middles).
        const along = Math.abs(a.x - b.x) > 0.5 ? "x" : "z";
        const across = along === "x" ? "z" : "x";
        const lo = Math.min(a[along], b[along]) - CELL / 2;
        const hi = Math.max(a[along], b[along]) + CELL / 2;
        const room = Math.min(
          p[along] - lo,
          hi - p[along],
          CELL / 2 - Math.abs(p[across] - a[across]),
        );
        clear = Math.max(clear, room);
      }
      expect(clear).toBeGreaterThan(HALF_WIDTH);
    }
  });

  it("walks at the walk clip's pace and never stops", () => {
    const walking = track.filter((p) => p.walking);
    for (let i = 1; i < walking.length; i++) {
      const step = Math.hypot(walking[i]!.x - walking[i - 1]!.x, walking[i]!.z - walking[i - 1]!.z);
      expect(step).toBeCloseTo(PACE * DT, 6);
    }
    expect(route.cell).toBeGreaterThan(200);
  });

  it("turns smoothly, never faster than a walk turns", () => {
    for (let i = 1; i < track.length; i++) {
      const turn = Math.abs(
        Math.atan2(
          Math.sin(track[i]!.heading - track[i - 1]!.heading),
          Math.cos(track[i]!.heading - track[i - 1]!.heading),
        ),
      );
      expect(turn).toBeLessThanOrEqual(1.6 * DT + 1e-9);
    }
  });
});
