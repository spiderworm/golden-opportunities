import { ROOM } from "./layout";

// Where the shop's shelves stand, in the berth's frame. Shared by the
// shelves (Interior) and the books on them (bookshop).
//
// Each unit is two of the generated shelf models side by side. The model is
// 0.779 wide, 0.98 tall and 0.299 deep; its boards' tops are at 0.08, 0.25,
// 0.43, 0.60 and 0.77 of that height, they span x = ±0.299, and they start
// 0.094 behind its center (measured from the model's geometry).

/** A shelf unit: its center on the floor, its width, and which way its front faces (radians about Y). */
export interface ShelfUnit {
  x: number;
  z: number;
  width: number;
  facing: number;
}

export const SHELF_DEPTH = 0.62;
export const SHELF_HEIGHT = 4.2;
/** How each shelf model is stretched to fill half a unit. */
export const SHELF_SCALE = { x: 2.2 / 0.779, y: SHELF_HEIGHT / 0.98, z: SHELF_DEPTH / 0.299 } as const;
/** The two models' centers across a unit. */
export const SHELF_HALVES = [-1.1, 1.1];
/** The heights of the boards books stand on, bottom to top. */
export const BOARDS = [0.08, 0.25, 0.43, 0.6, 0.77].map((y) => +(y * SHELF_SCALE.y).toFixed(3));
/** The stretches of board between the models' frames, across a unit, where books can stand. */
export const BAYS: [from: number, to: number][] = SHELF_HALVES.map((x) => [x - 0.299 * SHELF_SCALE.x + 0.04, x + 0.299 * SHELF_SCALE.x - 0.04]);
/** The back of the boards, from the unit's center line. */
export const SHELF_BACK = -0.094 * SHELF_SCALE.z;

const HALF_W = ROOM.width / 2;
const HALF_D = ROOM.depth / 2;
const INSET = 0.02;

export const SHELF_UNITS: ShelfUnit[] = [
  { x: -4.9, z: -HALF_D + SHELF_DEPTH / 2 + INSET, width: 4.4, facing: 0 },
  { x: -0.3, z: -HALF_D + SHELF_DEPTH / 2 + INSET, width: 4.4, facing: 0 },
  { x: 4.3, z: -HALF_D + SHELF_DEPTH / 2 + INSET, width: 4.4, facing: 0 },
  { x: -HALF_W + SHELF_DEPTH / 2 + INSET, z: -2.9, width: 4.4, facing: Math.PI / 2 },
  { x: -HALF_W + SHELF_DEPTH / 2 + INSET, z: 1.6, width: 4.4, facing: Math.PI / 2 },
];
