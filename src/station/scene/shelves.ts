import { ROOM } from "./layout";

// Where the shop's shelves stand, in the berth's frame. Shared by the
// shelves' geometry (Interior) and the books on them (bookshop).

/** A shelf unit: its center on the floor, its width, and which way its front faces (radians about Y). */
export interface ShelfUnit {
  x: number;
  z: number;
  width: number;
  facing: number;
}

export const SHELF_DEPTH = 0.62;
export const SHELF_HEIGHT = 4.2;
/** The heights of the boards books stand on, bottom to top. */
export const BOARDS = [0.12, 0.95, 1.78, 2.61, 3.44];

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
