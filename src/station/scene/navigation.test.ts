import { Crowd } from "@recast-navigation/core";
import { describe, expect, it } from "vitest";

import { addShopper, clearance, FIXTURES, navigation, pickSpot, SHOPPER, SPOTS } from "./navigation";

/** Points every 5 cm along a path's straight legs. */
function along(path: { x: number; z: number }[]) {
  const points: [number, number][] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05));
    for (let s = 0; s <= steps; s++) points.push([a.x + ((b.x - a.x) * s) / steps, a.z + ((b.z - a.z) * s) / steps]);
  }
  return points;
}

const nearest = (x: number, z: number) => Math.min(...FIXTURES.map((f) => clearance(x, z, f)));
// The navmesh is cut 0.3 m (a shopper's radius) back from every fixture, to within a 5 cm cell.
const CLEAR = SHOPPER.radius - 0.05;

describe("the shop's navigation", () => {
  it("can stand a shopper at every browsing spot, clear of the fixtures", async () => {
    const { query } = await navigation();
    for (const [x, z] of SPOTS) {
      const { point } = query.findClosestPoint({ x, y: 0, z });
      expect(Math.hypot(point.x - x, point.z - z)).toBeLessThan(0.01);
      expect(nearest(x, z)).toBeGreaterThanOrEqual(CLEAR);
    }
  });

  it("finds a way between every pair of spots that keeps clear of every fixture", async () => {
    const { query } = await navigation();
    for (let i = 0; i < SPOTS.length; i++) {
      for (let j = 0; j < SPOTS.length; j++) {
        if (i === j) continue;
        const [ax, az] = SPOTS[i]!;
        const [bx, bz] = SPOTS[j]!;
        const { success, path } = query.computePath({ x: ax, y: 0, z: az }, { x: bx, y: 0, z: bz });
        expect(success).toBe(true);
        const end = path.at(-1)!;
        expect(Math.hypot(end.x - bx, end.z - bz)).toBeLessThan(0.01);
        for (const [x, z] of along(path)) expect(nearest(x, z), `${i} to ${j} at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBeGreaterThanOrEqual(CLEAR);
      }
    }
  });

  it("sends a shopper only to a spot nobody has claimed", () => {
    const claimed = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let r = 0; r < 1; r += 0.05) expect(pickSpot(0, claimed, () => r)).toBe(10);
    // With every other spot taken, a shopper stays put.
    expect(pickSpot(10, claimed, () => 0.5)).toBe(10);
  });

  it("walks a full shop of shoppers round each other: never through a fixture, never two on one spot", async () => {
    const { navMesh } = await navigation();
    // A crowd of its own, so the scene's isn't disturbed.
    const crowd = new Crowd(navMesh, { maxAgents: 16, maxAgentRadius: SHOPPER.radius });
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const claimed = new Set<number>();
    const shoppers = Array.from({ length: 8 }, (_, i) => {
      claimed.add(i);
      return { agent: addShopper(crowd, i), spot: i, browseUntil: random() * 6 };
    });
    let closest = Infinity;
    for (let t = 0; t < 180; t += 0.1) {
      for (const s of shoppers) {
        const p = s.agent.position();
        const [tx, tz] = SPOTS[s.spot]!;
        const arrived = Math.hypot(p.x - tx, p.z - tz) < 0.15;
        if (arrived && t > s.browseUntil) {
          claimed.delete(s.spot);
          s.spot = pickSpot(s.spot, claimed, random);
          claimed.add(s.spot);
          s.agent.requestMoveTarget({ x: SPOTS[s.spot]![0], y: 0, z: SPOTS[s.spot]![1] });
          s.browseUntil = t + 3 + random() * 6;
        }
      }
      crowd.update(0.1);
      // Never two claims on one spot.
      expect(new Set(shoppers.map((s) => s.spot)).size).toBe(shoppers.length);
      for (const s of shoppers) {
        const p = s.agent.position();
        closest = Math.min(closest, nearest(p.x, p.z));
      }
    }
    expect(closest).toBeGreaterThanOrEqual(CLEAR);
    crowd.destroy();
  });
});
