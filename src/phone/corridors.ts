// Where the robot goes once it has the phone (David, 2 Nov): out of the
// bosses' room and down endless white corridors, turning down a different
// hallway every so often, never arriving anywhere. Boring, white, sterile and
// repetitive.
//
// The corridors are square cells CELL metres across on a grid, laid out as the
// robot needs them: a run of RUN cells, then a turn left or right. The way never
// heads back toward the room (the grid's +z): a run away from it turns across,
// and a run across turns away again. So it can never cross itself, however long
// it goes on. Now and then a side passage leaves it and goes nowhere it takes;
// those only go across from a run away, or back toward the room, so the way
// never meets them either. Each cell knows which of its sides open into the
// next, and a wall is everywhere else. Kept apart from the scene so it can be
// tested.

/** A cell's sides: 0 the grid's -z (away from the bosses' room), 1 its +x, 2 its +z, 3 its -x. */
export type Side = 0 | 1 | 2 | 3;
export const STEP: Record<Side, readonly [number, number]> = {
  0: [0, -1],
  1: [1, 0],
  2: [0, 1],
  3: [-1, 0],
};
const opposite = (side: Side) => ((side + 2) % 4) as Side;

/** A cell's width, and its height to the ceiling, in metres. */
export const CELL = 2.4;
export const HEIGHT = 2.7;

export interface Cell {
  x: number;
  z: number;
  /** Which sides open into another cell. */
  open: Set<Side>;
  /** How far along the robot's way it was laid: its own index on the way, or that of the way's cell a side passage leaves. */
  at: number;
}

/** How long a run is, in cells. */
export const RUN = [5, 12] as const;
/** How long a side passage is, in cells: long enough to fade into the fog. */
export const SIDE_RUN = [4, 8] as const;
/** How likely a cell along a run is to have a side passage, and a turn across to have the way straight on too. */
const SIDE_CHANCE = 0.12;
const STRAIGHT_ON_CHANCE = 0.4;
/** Cells laid this far behind the newest are let go: they're never drawn again. */
export const FORGET = 80;

/** A small seeded random number generator (mulberry32), so a seed gives the same corridors. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (x: number, z: number) => `${x},${z}`;

export class Corridors {
  /** The robot's way, in order: it enters way[0] first, whose open side 2 is the doorway from the room. */
  readonly way: Cell[] = [];
  /** Every cell still kept, the way's and the side passages', by grid place. */
  readonly cells = new Map<string, Cell>();
  private readonly next: () => number;
  private heading: Side = 0;
  private left: number;

  constructor(seed: number) {
    this.next = random(seed);
    const first: Cell = { x: 0, z: 0, open: new Set<Side>([2]), at: 0 };
    this.way.push(first);
    this.cells.set(key(0, 0), first);
    this.left = this.length(RUN);
  }

  /** The way's cell `i` along it (laying the way that far if it isn't yet). */
  wayCell(i: number): Cell {
    while (this.way.length <= i) this.lay();
    return this.way[i]!;
  }

  /** The cells to draw while the robot is in the way's cell `i`: from `behind` cells back to `ahead` on, with their side passages. */
  near(i: number, behind: number, ahead: number): Cell[] {
    this.wayCell(i + ahead);
    const from = Math.max(0, i - behind);
    return [...this.cells.values()].filter((c) => c.at >= from && c.at <= i + ahead);
  }

  private length([lo, hi]: readonly [number, number]) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** Lays the way's next cell: on along the run, or round a turn at its end. */
  private lay() {
    const last = this.way[this.way.length - 1]!;
    if (this.left === 0) {
      const across = this.heading === 1 || this.heading === 3;
      // A run across turns away from the room; a run away turns across, either way.
      const heading: Side = across ? 0 : this.next() < 0.5 ? 1 : 3;
      // The way straight on, across, as a passage that goes nowhere it takes.
      if (across && this.next() < STRAIGHT_ON_CHANCE) this.passage(last, this.heading);
      this.heading = heading;
      this.left = this.length(RUN);
    } else if (this.left > 1 && this.way.length > 2 && this.next() < SIDE_CHANCE) {
      // Off a run away, across; off a run across, back toward the room: never where the way will go.
      this.passage(last, this.heading === 0 ? (this.next() < 0.5 ? 1 : 3) : 2);
    }
    const [dx, dz] = STEP[this.heading];
    const cell = this.place(last.x + dx, last.z + dz, this.way.length);
    last.open.add(this.heading);
    cell.open.add(opposite(this.heading));
    this.way.push(cell);
    this.left -= 1;
    this.letGo();
  }

  /** A side passage from `from`, toward `side`, if nothing's there: it opens off the way and ends in a wall. */
  private passage(from: Cell, side: Side) {
    const [dx, dz] = STEP[side];
    const length = this.length(SIDE_RUN);
    // And a cell's room past its end, so it doesn't end against another passage's side.
    for (let k = 1; k <= length + 1; k++)
      if (this.cells.has(key(from.x + dx * k, from.z + dz * k))) return;
    let prev = from;
    for (let k = 1; k <= length; k++) {
      const cell = this.place(from.x + dx * k, from.z + dz * k, from.at);
      prev.open.add(side);
      cell.open.add(opposite(side));
      prev = cell;
    }
  }

  private place(x: number, z: number, at: number): Cell {
    const cell: Cell = { x, z, open: new Set(), at };
    this.cells.set(key(x, z), cell);
    return cell;
  }

  private letGo() {
    const recent = this.way.length - 1 - FORGET;
    if (recent <= 0 || this.way.length % 16) return;
    for (const [k, c] of this.cells) if (c.at < recent) this.cells.delete(k);
  }
}
