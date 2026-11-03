import { describe, expect, it } from "vitest";

import { Corridors, FORGET, RUN, STEP, type Cell, type Side } from "./corridors";

// The corridors go on for ever without crossing themselves, turn every RUN cells, never head back toward the room,
// and every opening leads somewhere.

const SEEDS = [1, 2, 3, 42, 1234, 99999];
const LONG = 4000;

describe.each(SEEDS)("corridors from seed %i", (seed) => {
  const corridors = new Corridors(seed);
  corridors.wayCell(LONG);

  it("start at the doorway and step one cell at a time", () => {
    const way = corridors.way;
    expect(way[0]!.open.has(2)).toBe(true);
    for (let i = 1; i <= LONG; i++)
      expect(Math.abs(way[i]!.x - way[i - 1]!.x) + Math.abs(way[i]!.z - way[i - 1]!.z)).toBe(1);
  });

  it("never put two cells kept in one place, anywhere along the way", () => {
    const check = new Corridors(seed);
    for (let i = 0; i <= LONG; i += 7) {
      check.wayCell(i);
      const places = [...check.cells.values()].map((c) => `${c.x},${c.z}`);
      expect(new Set(places).size).toBe(places.length);
      // And every cell still kept is in the map under its own place, so none was overwritten.
      for (const [k, c] of check.cells) expect(k).toBe(`${c.x},${c.z}`);
    }
  });

  it("never cross the way, however long it goes on, and never head back toward the room", () => {
    const places = corridors.way.map((c) => `${c.x},${c.z}`);
    expect(new Set(places).size).toBe(places.length);
    for (let i = 1; i <= LONG; i++)
      expect(corridors.way[i]!.z).toBeLessThanOrEqual(corridors.way[i - 1]!.z);
  });

  it("turn now and then, and never run on longer than a run", () => {
    const way = corridors.way;
    let straight = 0;
    let turns = 0;
    for (let i = 2; i <= LONG; i++) {
      const a = [way[i - 1]!.x - way[i - 2]!.x, way[i - 1]!.z - way[i - 2]!.z];
      const b = [way[i]!.x - way[i - 1]!.x, way[i]!.z - way[i - 1]!.z];
      if (a[0] === b[0] && a[1] === b[1]) straight++;
      else {
        turns++;
        straight = 0;
      }
      expect(straight).toBeLessThanOrEqual(RUN[1]);
    }
    expect(turns).toBeGreaterThan(LONG / (RUN[1] + 2));
  });

  it("open each side only onto a cell that opens back", () => {
    const check = new Corridors(seed);
    check.wayCell(600);
    const at = (x: number, z: number) => check.cells.get(`${x},${z}`);
    for (const cell of check.cells.values()) {
      for (const side of cell.open) {
        if (cell === check.way[0] && side === 2) continue; // the doorway, into the room
        const [dx, dz] = STEP[side];
        const there = at(cell.x + dx, cell.z + dz) as Cell | undefined;
        // A cell at the edge of what's kept may open onto one already let go.
        if (!there) {
          expect(cell.at).toBeLessThan(check.way.length - FORGET + 2 * RUN[1]);
          continue;
        }
        expect(there.open.has(((side + 2) % 4) as Side)).toBe(true);
      }
    }
  });

  it("have side passages that go nowhere the way goes", () => {
    const check = new Corridors(seed);
    check.wayCell(400);
    const onWay = new Set(check.way.map((c) => c));
    const passages = [...check.cells.values()].filter((c) => !onWay.has(c));
    expect(passages.length).toBeGreaterThan(10);
  });
});

it("lays the same corridors for the same seed, and different ones for another", () => {
  const a = new Corridors(7);
  const b = new Corridors(7);
  const c = new Corridors(8);
  a.wayCell(200);
  b.wayCell(200);
  c.wayCell(200);
  const path = (k: Corridors) =>
    k.way
      .slice(0, 201)
      .map((cell) => `${cell.x},${cell.z}`)
      .join(" ");
  expect(path(a)).toBe(path(b));
  expect(path(a)).not.toBe(path(c));
});
