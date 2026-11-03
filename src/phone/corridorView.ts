import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  type BufferGeometry,
  type Material,
  Mesh,
} from "three";

import { CELL, HEIGHT, STEP, type Cell, type Side } from "./corridors";

// The corridors drawn (corridors.ts lays them out): white walls, a pale floor
// and ceiling, a bright light panel in every cell's ceiling, a skirting board
// along every wall, and now and then a shut door, all the same (David, 2 Nov:
// boring, white, sterile and repetitive). Only the cells near the robot are
// drawn, each piece one instanced mesh, so a corridor is a handful of draws.
// Its group sits with cell (0, 0) at its origin, just through the bosses'
// room's door, and the grid's x and z the world's.

/** The most cells drawn at once: the way near the robot and its side passages. */
const MOST = 96;
const WHITE = new Color("#eef0f2");

export const CORRIDOR_COLOURS = {
  wall: WHITE,
  floor: new Color("#d6d9dd"),
  ceiling: new Color("#f4f5f6"),
  light: new Color("#ffffff"),
  skirting: new Color("#c5c9ce"),
  door: new Color("#e2e5e8"),
};

/** The doorway from the bosses' room, in the first cell's side toward it: its width and height (room.ts's DOOR). */
export interface Doorway {
  wide: number;
  high: number;
}

export class CorridorView {
  readonly group = new Group();
  private readonly pieces: Record<
    "floor" | "ceiling" | "light" | "wall" | "skirting" | "door",
    InstancedMesh
  >;
  /** The wall round the doorway, at the first cell's side toward the room: drawn while the first cell is. */
  private readonly doorwayWall: Group;
  private readonly owned: (BufferGeometry | Material)[] = [];

  constructor(doorway: Doorway) {
    const lambert = (colour: Color) => this.own(new MeshLambertMaterial({ color: colour }));
    const piece = (geometry: BufferGeometry, material: Material, count = MOST) => {
      const mesh = new InstancedMesh(this.own(geometry), material, count);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    const flat = (wide: number, high: number) => new PlaneGeometry(wide, high);
    this.pieces = {
      floor: piece(flat(CELL, CELL).rotateX(-Math.PI / 2), lambert(CORRIDOR_COLOURS.floor)),
      ceiling: piece(
        flat(CELL, CELL)
          .rotateX(Math.PI / 2)
          .translate(0, HEIGHT, 0),
        lambert(CORRIDOR_COLOURS.ceiling),
      ),
      // Bright: drawn as they are, not lit.
      light: piece(
        flat(0.5, 1.5)
          .rotateX(Math.PI / 2)
          .translate(0, HEIGHT - 0.005, 0),
        this.own(new MeshBasicMaterial({ color: CORRIDOR_COLOURS.light, toneMapped: false })),
      ),
      wall: piece(
        flat(CELL, HEIGHT).translate(0, HEIGHT / 2, -CELL / 2),
        lambert(CORRIDOR_COLOURS.wall),
        MOST * 3,
      ),
      skirting: piece(
        new BoxGeometry(CELL, 0.12, 0.02).translate(0, 0.06, -CELL / 2 + 0.01),
        lambert(CORRIDOR_COLOURS.skirting),
        MOST * 3,
      ),
      door: piece(
        flat(1.0, 2.1).translate(0, 1.05, -CELL / 2 + 0.006),
        lambert(CORRIDOR_COLOURS.door),
        MOST,
      ),
    };
    // Round the doorway: a strip either side of it and one above, facing into the corridor.
    this.doorwayWall = new Group();
    const wallMaterial = this.pieces.wall.material as Material;
    const side = (CELL - doorway.wide) / 2;
    for (const [wide, high, x, y] of [
      [side, HEIGHT, -(doorway.wide + side) / 2, HEIGHT / 2],
      [side, HEIGHT, (doorway.wide + side) / 2, HEIGHT / 2],
      [doorway.wide, HEIGHT - doorway.high, 0, (HEIGHT + doorway.high) / 2],
    ] as const) {
      const strip = new Mesh(this.own(flat(wide, high)), wallMaterial);
      strip.position.set(x, y, CELL / 2);
      strip.rotation.y = Math.PI;
      this.doorwayWall.add(strip);
    }
    this.group.add(this.doorwayWall);
  }

  private own<T extends BufferGeometry | Material>(thing: T): T {
    this.owned.push(thing);
    return thing;
  }

  /** Draws these cells, and only these. */
  show(cells: Cell[]) {
    const place = new Object3D();
    const counts = { floor: 0, ceiling: 0, light: 0, wall: 0, skirting: 0, door: 0 };
    const put = (name: keyof typeof counts, x: number, z: number, turn: number) => {
      const mesh = this.pieces[name];
      if (counts[name] >= mesh.instanceMatrix.count) return;
      place.position.set(x, 0, z);
      place.rotation.set(0, turn, 0);
      place.updateMatrix();
      mesh.setMatrixAt(counts[name]++, place.matrix);
    };
    let first = false;
    for (const cell of cells.slice(0, MOST)) {
      const x = cell.x * CELL;
      const z = cell.z * CELL;
      if (cell.x === 0 && cell.z === 0) first = true;
      put("floor", x, z, 0);
      put("ceiling", x, z, 0);
      // The light along the corridor: across the grid's x if the cell opens that way.
      put(
        "light",
        x,
        z,
        cell.open.has(1) || cell.open.has(3)
          ? cell.open.has(0) || cell.open.has(2)
            ? 0
            : Math.PI / 2
          : 0,
      );
      for (const side of [0, 1, 2, 3] as Side[]) {
        if (cell.open.has(side)) continue;
        // The wall pieces are made at the cell's -z side; each side is that turned.
        const turn = TURN[side];
        put("wall", x, z, turn);
        put("skirting", x, z, turn);
        // A shut door now and then, always in the same places for the same corridors.
        if (doorHere(cell, side)) put("door", x, z, turn);
      }
    }
    for (const [name, mesh] of Object.entries(this.pieces) as [
      keyof typeof counts,
      InstancedMesh,
    ][]) {
      mesh.count = counts[name];
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.doorwayWall.visible = first;
  }

  dispose() {
    this.owned.forEach((thing) => thing.dispose());
    Object.values(this.pieces).forEach((mesh) => mesh.dispose());
  }
}

/** The turn about the vertical that takes a piece made at a cell's -z side (side 0) to `side`. */
const TURN: Record<Side, number> = { 0: 0, 1: -Math.PI / 2, 2: Math.PI, 3: Math.PI / 2 };

/** Whether a wall has a shut door in it: one wall in five or so, chosen by its place. */
function doorHere(cell: Cell, side: Side) {
  const [dx, dz] = STEP[side];
  const h =
    Math.imul(cell.x * 2 + dx + 1000, 73856093) ^ Math.imul(cell.z * 2 + dz + 1000, 19349663);
  return (h >>> 0) % 5 === 0;
}
