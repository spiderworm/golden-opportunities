import { Vector3 } from "three";

// Where everything is. One unit is about a meter.
//
// The station turns about world Y. In its own frame the ring lies flat
// (XZ), and the bookstore's berth sits on the ring's rim facing +Z, so its
// window looks straight out into space. The shop's floor is "down" (-Y),
// which ignores spin gravity in favor of a view out of the window.

export const RING_RADIUS = 90;
export const RING_TUBE = 4;

/** The berth's room, in its own frame: floor at y = 0, window wall at z = +ROOM.depth / 2. */
export const ROOM = { width: 16, height: 5, depth: 11 } as const;
/** The berth's floor center, in the station's frame. */
export const BERTH_ORIGIN = new Vector3(0, -2.5, RING_RADIUS + RING_TUBE + 6);
/** The window's opening in the front wall, in the berth's frame. */
export const WINDOW = { halfWidth: 6.5, bottom: 0.6, top: 4.4 } as const;

/** One turn every six minutes: slow enough that the planet drifts past the window. */
export const STATION_SPIN = (2 * Math.PI) / 360;

export const PLANET_RADIUS = 1000;
export const PLANET_POSITION = new Vector3(-700, -620, 2250);
/** Toward the sun, from anywhere in the scene. */
export const SUN_DIRECTION = new Vector3(-0.85, 0.32, 0.42).normalize();

/**
 * The station's angle at the start, chosen so that the planet sits in the
 * window's left half, as seen from the camera's corner of the shop.
 */
export const STATION_START_ANGLE = Math.atan2(PLANET_POSITION.x, PLANET_POSITION.z) + 0.45;

/** Berth frame to station frame (the berth isn't rotated, only moved). */
export const berthToStation = (x: number, y: number, z: number) =>
  new Vector3(x, y, z).add(BERTH_ORIGIN);

const frontZ = ROOM.depth / 2;

/** The camera's home outside, in world space: the station against the planet. */
export const OUTSIDE_EYE = new Vector3(128, 62, -182);
export const OUTSIDE_LOOK = new Vector3(0, -6, 0);

/**
 * The glide from outside to the shop, in the station's frame (it turns with
 * the station), after the outside eye. It rises over the ring, drops in front
 * of the window, passes through it and settles in the shop's back corner.
 */
export const GLIDE_STATION_POINTS = [
  new Vector3(120, 70, 190),
  berthToStation(0, 3, frontZ + 38),
  berthToStation(0, 2.6, frontZ + 3),
  berthToStation(0.4, 2.4, frontZ - 2),
  berthToStation(7.3, 2.6, -4.9),
];

export const INSIDE_LOOK = berthToStation(-2.2, 1.3, 2.6);
export const WINDOW_CENTER = berthToStation(0, (WINDOW.bottom + WINDOW.top) / 2, frontZ);

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** 0 below edge0, 1 above edge1, smooth between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
