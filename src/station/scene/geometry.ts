import { BoxGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Static pieces that share a material are merged into one geometry, so each
// costs one draw call however many pieces it has.

/** A box from its center and size. */
export function box(x: number, y: number, z: number, w: number, h: number, d: number): BufferGeometry {
  return new BoxGeometry(w, h, d).translate(x, y, z);
}

/** Merges the pieces (three's built-in shapes, all indexed) and frees them. */
export function merged(pieces: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(pieces);
  for (const p of pieces) p.dispose();
  if (!geometry) throw new Error("station: pieces to merge have different attributes");
  return geometry;
}
