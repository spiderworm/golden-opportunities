import { Crowd, init, NavMeshQuery, type CrowdAgent, type NavMesh } from "@recast-navigation/core";
import { generateSoloNavMesh } from "@recast-navigation/generators";

import { ROOM } from "./layout";
import { SHELF_DEPTH, SHELF_UNITS } from "./shelves";

// Where people can walk in the shop, so they go round the counter, the
// shelves, the tables and each other rather than through them (David: "People
// in the 3D simulation walk through objects, the desk, each other"). A
// navigation mesh (Recast) is built once from the fixtures' footprints, and a
// crowd (Detour) steers every shopper along it and apart from the others.
// Both live as long as the page, like world.ts: coming back to the station
// finds everyone where they were. Built in WebAssembly, loaded with the
// station's own code.

/** A fixture's footprint on the floor, a box from (x0, z0) to (x1, z1); round things are their bounding square. */
export interface Footprint {
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  height: number;
}

const around = (name: string, x: number, z: number, r: number, height: number): Footprint => ({ name, x0: x - r, z0: z - r, x1: x + r, z1: z + r, height });

/** What stands on the shop floor: the shelves (shelves.ts), and the rest where Interior and Props put them. */
export const FIXTURES: Footprint[] = [
  ...SHELF_UNITS.map((u, i) => {
    const [w, d] = u.facing === 0 ? [u.width / 2, SHELF_DEPTH / 2] : [SHELF_DEPTH / 2, u.width / 2];
    return { name: `shelf ${i}`, x0: u.x - w, z0: u.z - d, x1: u.x + w, z1: u.z + d, height: 4.2 };
  }),
  // The counter model, 0.98 x 0.32 of its unit at Interior's COUNTER_SCALE, turned to run along z.
  { name: "counter", x0: 3.47, z0: -1.62, x1: 4.53, z1: 1.62, height: 1.06 },
  around("featured plinth", -1.5, 2.4, 0.85, 0.9),
  around("side table", -6.4, 3.0, 0.32, 0.62),
  around("window pedestal", 4.6, 4.4, 0.55, 0.7),
  around("armchair by the window", -6.3, 4.1, 0.5, 1.05),
  around("armchair by the shelves", -5.0, 2.3, 0.5, 1.05),
];

/** Where the keeper stands behind the counter (x, z, facing); nobody walks through them either. */
export const KEEPER: [number, number, number] = [3.1, 0.2, Math.PI / 2];

/** Where a shopper stands to browse, and which way they face (radians about Y, 0 = +z). */
export const SPOTS: [x: number, z: number, facing: number][] = [
  [-6.6, -3.6, -Math.PI / 2],
  [-6.6, -1.4, -Math.PI / 2],
  [-6.6, 1.0, -Math.PI / 2],
  // Clear of the reading nook's side table.
  [-6.6, 2.3, -Math.PI / 2],
  [-4.6, -4.3, Math.PI],
  [-1.6, -4.3, Math.PI],
  [1.2, -4.3, Math.PI],
  [-1.5, 1.2, 0],
  [-0.2, 3.4, -Math.PI / 2],
  [-3.6, 4.6, 0],
  [5.1, 1.0, -Math.PI / 2],
];

/** A shopper's size and pace, for the crowd. */
export const SHOPPER = { radius: 0.3, height: 1.7, speed: 0.8 } as const;

export interface Navigation {
  navMesh: NavMesh;
  query: NavMeshQuery;
  crowd: Crowd;
}

let built: Promise<Navigation> | undefined;

/** The shop's navigation, built once per page (and once per test file). */
export function navigation(): Promise<Navigation> {
  // In the browser, Recast's WebAssembly comes as its own file, fetched with the station's code and
  // compiled as it streams (its default build carries it inside its JavaScript, a third larger).
  built ??= (typeof window === "undefined" ? init() : import("@recast-navigation/wasm/wasm").then((wasm) => init(wasm.default))).then(build);
  return built;
}

function build(): Navigation {
  const { positions, indices } = floorPlan();
  const cell = 0.05;
  const { success, navMesh } = generateSoloNavMesh(positions, indices, {
    cs: cell,
    ch: cell,
    walkableRadius: Math.ceil(SHOPPER.radius / cell),
    walkableHeight: Math.ceil(SHOPPER.height / cell),
    walkableClimb: Math.ceil(0.2 / cell),
  });
  if (!success || !navMesh) throw new Error("The shop's navigation mesh couldn't be built");
  return { navMesh, query: new NavMeshQuery(navMesh), crowd: new Crowd(navMesh, { maxAgents: 16, maxAgentRadius: SHOPPER.radius }) };
}

/** The floor, and a box for every fixture (and the keeper), as triangles for Recast. */
export function floorPlan(): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;
  const floorBase = 0;
  positions.push(-halfW, 0, -halfD, halfW, 0, -halfD, halfW, 0, halfD, -halfW, 0, halfD);
  indices.push(floorBase, floorBase + 2, floorBase + 1, floorBase, floorBase + 3, floorBase + 2);
  for (const f of [...FIXTURES, around("keeper", KEEPER[0], KEEPER[1], 0.3, 1.7)]) {
    const b = positions.length / 3;
    for (const y of [0, f.height]) positions.push(f.x0, y, f.z0, f.x1, y, f.z0, f.x1, y, f.z1, f.x0, y, f.z1);
    // The top and four sides (the bottom sits on the floor).
    for (const t of [[4, 6, 5], [4, 7, 6], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]) indices.push(...t.map((i) => b + i));
  }
  return { positions, indices };
}

/** A shopper's next spot: any other spot nobody has claimed, or where they are if every other is taken. */
export function pickSpot(from: number, claimed: ReadonlySet<number>, random = Math.random): number {
  const free = SPOTS.map((_, i) => i).filter((i) => i !== from && !claimed.has(i));
  return free.length ? free[Math.floor(random() * free.length)]! : from;
}

/** How far a point on the floor is from a fixture's footprint (0 inside it). */
export function clearance(x: number, z: number, f: Footprint): number {
  const dx = Math.max(f.x0 - x, 0, x - f.x1);
  const dz = Math.max(f.z0 - z, 0, z - f.z1);
  return Math.hypot(dx, dz);
}

/** Adds a shopper to the crowd at a spot. */
export function addShopper(crowd: Crowd, spot: number): CrowdAgent {
  const [x, z] = SPOTS[spot]!;
  return crowd.addAgent(
    { x, y: 0, z },
    {
      radius: SHOPPER.radius,
      height: SHOPPER.height,
      maxSpeed: SHOPPER.speed,
      maxAcceleration: 3,
      collisionQueryRange: SHOPPER.radius * 8,
      pathOptimizationRange: SHOPPER.radius * 30,
      separationWeight: 2,
    },
  );
}
