import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";

import { BAYS, BOARDS, SHELF_BACK, SHELF_UNITS } from "./shelves";

// The books in the shop, and the ones out of place. Shoppers take books off
// the shelves and set them down wherever they happen to be; the shop's
// robots carry them back to their gaps and straighten the ones left
// leaning. Both write here, and the two instanced meshes (Books) show it.

/** A book's place on its shelf. */
export interface ShelfBook {
  /** The shelf unit's frame. */
  unit: Matrix4;
  /** The book's center and size in its unit's frame. */
  local: Vector3;
  size: Vector3;
  /** Which way the shelf faces (radians about Y); the book's front is that way. */
  facing: number;
  /** Tilt about the shelf's front axis; 0 is upright. */
  lean: number;
  color: Color;
  /** The board it stands on (0 is the bottom). */
  board: number;
}

/** A book off its shelf: held by a shopper, set down somewhere, or with a robot. */
export interface Stray {
  book: number;
  state: "carried" | "down" | "lifted" | "shelving";
  /** Its pose in the berth's frame. */
  matrix: Matrix4;
  /** The robot coming for it, or -1. */
  robot: number;
  /** The surface it was set down on, or -1 for the floor. */
  surface: number;
}

export const MAX_STRAYS = 6;
/** A lean a robot will come and straighten (the bottom boards' leaners are left be: too low to reach over shoppers). */
const TIDY_BOARD = 2;
const LEAN = 0.18;
const Z_AXIS = new Vector3(0, 0, 1);
const Y_AXIS = new Vector3(0, 1, 0);
const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const BOOK_COLORS = ["#7a2e3b", "#2f4f7a", "#2e6b5a", "#c08a3e", "#5b3d7a", "#d9cfb8", "#3d3a52", "#a3462f", "#4f7d8f", "#8c7a4a"];

/** Where shoppers set books down besides the floor: x, top y, z in the berth's frame. */
export const SURFACES: [x: number, y: number, z: number][] = [
  [-6.4, 0.64, 3.0], // the reading nook's side table
  [-2.05, 0.9, 2.0], // the featured book's plinth
  [3.75, 1.06, -1.45], // the counter, either side of the console
  [4.2, 1.06, -0.35],
];
/** How far a shopper will go out of their way to set a book on a surface instead of the floor. */
const SURFACE_REACH = 2.2;
/** The floor's usable extent, kept off the walls and shelves. */
const FLOOR = { minX: -6.9, maxX: 6.9, minZ: -4.4, maxZ: 4.9 };

/** Seeded, so the shelves look the same on every visit. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function shelfBooks(): ShelfBook[] {
  const random = seeded(2194);
  const books: ShelfBook[] = [];
  for (const unit of SHELF_UNITS) {
    const frame = new Matrix4().makeRotationY(unit.facing).setPosition(unit.x, 0, unit.z);
    BOARDS.slice(0, 4).forEach((y, board) => {
      for (const [from, end] of BAYS) {
        let x = from;
        while (x < end) {
          const width = 0.06 + random() * 0.08;
          if (x + width > end) break;
          if (random() < 0.05) {
            x += 0.25; // a gap where something sold
            continue;
          }
          // Short enough to clear the board above.
          const height = 0.4 + random() * 0.22;
          const depth = 0.3 + random() * 0.08;
          const lean = random() < 0.06 ? LEAN : 0;
          const color = new Color(BOOK_COLORS[Math.floor(random() * BOOK_COLORS.length)]!).offsetHSL(0, 0, (random() - 0.5) * 0.12);
          books.push({
            unit: frame,
            local: new Vector3(x + width / 2, y + height / 2, SHELF_BACK + 0.02 + depth / 2),
            size: new Vector3(width, height, depth),
            facing: unit.facing,
            lean,
            color,
            board,
          });
          x += width + 0.004;
        }
      }
    });
  }
  return books;
}

const scratch = { q: new Quaternion(), m: new Matrix4(), v: new Vector3() };

export class Bookshop {
  readonly books = shelfBooks();
  readonly strays: (Stray | null)[] = Array.from({ length: MAX_STRAYS }, () => null);
  shelfMesh: InstancedMesh | null = null;
  strayMesh: InstancedMesh | null = null;
  /** Books off their shelf, which show as a gap there. */
  private readonly away = new Set<number>();
  /** Leaning books a robot will straighten, and the robot on each (or -1). */
  private readonly leaning = new Map<number, number>();

  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.books.forEach((b, i) => {
      if (b.lean && b.board >= TIDY_BOARD) this.leaning.set(i, -1);
    });
  }

  /** Shows the shelves and strays on these meshes, and keeps them up to date. */
  attach(shelfMesh: InstancedMesh, strayMesh: InstancedMesh) {
    this.shelfMesh = shelfMesh;
    this.strayMesh = strayMesh;
    this.books.forEach((b, i) => {
      shelfMesh.setColorAt(i, b.color);
      this.writeShelf(i);
    });
    this.strays.forEach((_, slot) => {
      strayMesh.setColorAt(slot, this.books[0]!.color);
      this.writeStray(slot);
    });
    if (shelfMesh.instanceColor) shelfMesh.instanceColor.needsUpdate = true;
    shelfMesh.computeBoundingSphere();
  }

  /** A book's pose on its shelf, in the berth's frame. */
  shelfPose(i: number, out = new Matrix4()): Matrix4 {
    const b = this.books[i]!;
    return out.copy(b.unit).multiply(scratch.m.compose(b.local, scratch.q.setFromAxisAngle(Z_AXIS, b.lean), b.size));
  }

  /** Where a book stands on its shelf (its center), in the berth's frame. */
  shelfCenter(i: number, out = new Vector3()): Vector3 {
    const b = this.books[i]!;
    return out.copy(b.local).applyMatrix4(b.unit);
  }

  /** The way out of a book's shelf, toward the room. */
  front(i: number, out = new Vector3()): Vector3 {
    const f = this.books[i]!.facing;
    return out.set(Math.sin(f), 0, Math.cos(f));
  }

  onShelf(i: number): boolean {
    return !this.away.has(i);
  }

  /**
   * A shopper browsing at (x, z) takes a book at eye height off the shelf in
   * front of them. Returns the stray's slot, or -1 if there's no free slot or
   * no book in reach.
   */
  take(x: number, z: number): number {
    const slot = this.strays.indexOf(null);
    if (slot < 0) return -1;
    const reach: number[] = [];
    this.books.forEach((b, i) => {
      if (b.board !== TIDY_BOARD || this.away.has(i) || this.leaning.has(i)) return;
      const c = this.shelfCenter(i, scratch.v);
      if (Math.hypot(c.x - x, c.z - z) < 1.3) reach.push(i);
    });
    if (!reach.length) return -1;
    const book = reach[Math.floor(this.random() * reach.length)]!;
    this.away.add(book);
    this.writeShelf(book);
    this.strays[slot] = { book, state: "carried", matrix: this.shelfPose(book), robot: -1, surface: -1 };
    this.writeStray(slot);
    return slot;
  }

  /** Moves a stray (held by a shopper or a robot) to this position and turn, at its own size. */
  hold(slot: number, position: Vector3, rotation: Quaternion) {
    const stray = this.strays[slot];
    if (!stray) return;
    stray.matrix.compose(position, rotation, this.books[stray.book]!.size);
    this.writeStray(slot);
  }

  /** The turn of a book lying on its cover, spine toward `heading`. */
  static flat(heading: number, out = new Quaternion()): Quaternion {
    return out.setFromAxisAngle(Y_AXIS, heading).multiply(scratch.q.setFromAxisAngle(Z_AXIS, Math.PI / 2));
  }

  /**
   * A shopper at (x, z), facing `heading`, sets a stray down: on the nearest
   * free surface in reach, or on the floor in front of them.
   */
  setDown(slot: number, x: number, z: number, heading: number) {
    const stray = this.strays[slot];
    if (!stray) return;
    const taken = new Set(this.strays.map((s) => s?.surface ?? -1));
    let surface = -1;
    let best = SURFACE_REACH;
    SURFACES.forEach(([sx, , sz], i) => {
      const d = Math.hypot(sx - x, sz - z);
      if (!taken.has(i) && d < best) {
        best = d;
        surface = i;
      }
    });
    const size = this.books[stray.book]!.size;
    const at =
      surface >= 0
        ? scratch.v.set(SURFACES[surface]![0], SURFACES[surface]![1], SURFACES[surface]![2])
        : scratch.v.set(
            Math.min(FLOOR.maxX, Math.max(FLOOR.minX, x + Math.sin(heading) * 0.45)),
            0.02,
            Math.min(FLOOR.maxZ, Math.max(FLOOR.minZ, z + Math.cos(heading) * 0.45)),
          );
    at.y += size.x / 2;
    stray.matrix.compose(at, Bookshop.flat(heading + (this.random() - 0.5) * 1.2), size);
    stray.state = "down";
    stray.surface = surface;
    this.writeStray(slot);
  }

  /** Puts a stray down straight away (for the shop's opening state). */
  misplace(x: number, z: number) {
    const slot = this.take(x, z);
    if (slot >= 0) this.setDown(slot, x, z, this.random() * Math.PI * 2);
  }

  /** The nearest book set down that no robot is fetching; claims it for `robot`. Returns its slot or -1. */
  claimStray(robot: number, from: Vector3): number {
    let slot = -1;
    let best = Infinity;
    this.strays.forEach((s, i) => {
      if (s?.state !== "down" || s.robot >= 0) return;
      const d = from.distanceToSquared(scratch.v.setFromMatrixPosition(s.matrix));
      if (d < best) {
        best = d;
        slot = i;
      }
    });
    if (slot >= 0) this.strays[slot]!.robot = robot;
    return slot;
  }

  /** A robot picks a stray up; from here the robot moves it with `hold`. */
  lift(slot: number) {
    const stray = this.strays[slot];
    if (!stray) return;
    stray.state = "lifted";
    stray.surface = -1;
  }

  /** A robot slides a stray back into its gap: it's a shelf book again. */
  shelve(slot: number) {
    const stray = this.strays[slot];
    if (!stray) return;
    this.strays[slot] = null;
    this.writeStray(slot);
    this.away.delete(stray.book);
    this.writeShelf(stray.book);
  }

  /** A shopper browsing at (x, z) leaves a book in reach leaning. */
  lean(x: number, z: number) {
    const reach: number[] = [];
    this.books.forEach((b, i) => {
      if (b.board < TIDY_BOARD || b.lean || this.away.has(i)) return;
      const c = this.shelfCenter(i, scratch.v);
      if (Math.hypot(c.x - x, c.z - z) < 1.6) reach.push(i);
    });
    if (!reach.length) return;
    const book = reach[Math.floor(this.random() * reach.length)]!;
    this.setLean(book, LEAN);
    this.leaning.set(book, -1);
  }

  /** The nearest leaning book no robot is straightening; claims it for `robot`. Returns the book or -1. */
  claimLean(robot: number, from: Vector3): number {
    let book = -1;
    let best = Infinity;
    for (const [i, owner] of this.leaning) {
      if (owner >= 0 || this.away.has(i)) continue;
      const d = from.distanceToSquared(this.shelfCenter(i, scratch.v));
      if (d < best) {
        best = d;
        book = i;
      }
    }
    if (book >= 0) this.leaning.set(book, robot);
    return book;
  }

  setLean(i: number, lean: number) {
    this.books[i]!.lean = lean;
    this.writeShelf(i);
  }

  /** A robot has finished straightening a book. */
  straightened(i: number) {
    this.setLean(i, 0);
    this.leaning.delete(i);
  }

  get leaningCount(): number {
    return this.leaning.size;
  }

  private writeShelf(i: number) {
    const mesh = this.shelfMesh;
    if (!mesh) return;
    mesh.setMatrixAt(i, this.away.has(i) ? HIDDEN : this.shelfPose(i, scratch.m.clone()));
    mesh.instanceMatrix.needsUpdate = true;
  }

  private writeStray(slot: number) {
    const mesh = this.strayMesh;
    if (!mesh) return;
    const stray = this.strays[slot];
    mesh.setMatrixAt(slot, stray ? stray.matrix : HIDDEN);
    if (stray) mesh.setColorAt(slot, this.books[stray.book]!.color);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
