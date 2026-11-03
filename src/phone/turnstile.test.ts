import {
  Bone,
  BoxGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { describe, expect, it } from "vitest";

import { clusterAngles, makeTurnstile } from "./turnstile";

// A turnstile laid out as the phone robot's is, in the model's own units (about 1 tall): a chest, and in front of it
// a hub standing out along z with three bars about it, each its own piece of the mesh.

const HUB = new Vector3(0, 0.72, 0.145);
/** One out sideways, as the robot's shoulder, and two either side of it, up and down. */
const BARS = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
/** As the real one: a hub 0.08 across, bars out to 0.13. */
const HUB_SIZE = 0.08;
const REACH = 0.13;

function robot(bars = BARS) {
  const pieces: BufferGeometry[] = [new BoxGeometry(0.4, 0.4, 0.2).translate(0, 0.7, 0)];
  if (bars.length)
    pieces.push(
      new CylinderGeometry(HUB_SIZE, HUB_SIZE, 0.05, 24)
        .rotateX(Math.PI / 2)
        .translate(HUB.x, HUB.y, HUB.z),
    );
  for (const a of bars) {
    // From the hub's edge out to REACH, along angle a in the x-y plane; with vertices across its width, as a real
    // bar's mesh has, so its far end spans its directions without gaps.
    pieces.push(
      new BoxGeometry(REACH - HUB_SIZE, 0.03, 0.03, 1, 6)
        .translate((REACH + HUB_SIZE) / 2, 0, 0)
        .rotateZ(a)
        .translate(HUB.x, HUB.y, HUB.z),
    );
  }
  const geometry = mergeGeometries(
    pieces.map((p) => p.deleteAttribute("normal").deleteAttribute("uv")),
  )!;
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(
      new Float32Array(count * 4).map((_, i) => (i % 4 ? 0 : 1)),
      4,
    ),
  );
  const chest = new Bone();
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  const root = new Group();
  root.add(chest, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton([chest]));
  return { chest, mesh };
}

/** How near, in radians, the nearest bar comes to pointing at `angle` about the hub. */
function nearestBar(angle: number, turned: number) {
  return Math.min(
    ...BARS.map((b) =>
      Math.abs(Math.atan2(Math.sin(angle - b - turned), Math.cos(angle - b - turned))),
    ),
  );
}

describe("the phone robot's turnstile", () => {
  it("finds the hub and bars and puts them on a bone of their own at the hub", () => {
    const { chest, mesh } = robot();
    const turnstile = makeTurnstile(mesh, chest)!;
    expect(turnstile).not.toBeNull();
    expect(turnstile.bone.parent).toBe(chest);
    // The hub's middle, give or take the bars' pull on the average.
    expect(turnstile.bone.position.distanceTo(HUB)).toBeLessThan(0.02);
    // Its own vertices follow it alone; the chest's stay on the chest.
    const skinIndex = mesh.geometry.getAttribute("skinIndex");
    const position = mesh.geometry.getAttribute("position");
    let moved = 0;
    for (let i = 0; i < position.count; i++) {
      if (skinIndex.getX(i) !== 1) continue;
      moved++;
      expect(position.getZ(i)).toBeGreaterThan(0.1);
    }
    expect(moved).toBe(turnstile.vertices);
  });

  it("turns just enough for an arm to pass through a bar, and no more", () => {
    const { chest, mesh } = robot();
    const turnstile = makeTurnstile(mesh, chest)!;
    // A point on the sideways bar, a little above its middle: the bar gives way, turning down, away from it.
    const at = 0.05;
    const point = new Vector3(Math.cos(at), Math.sin(at), 0).multiplyScalar(0.11).add(HUB);
    turnstile.push([point], 0.01);
    expect(turnstile.angle, `hub at ${turnstile.bone.position.toArray()}`).toBeLessThan(0);
    expect(turnstile.angle).toBeGreaterThan(-0.3);
    // Now clear of it by the point's own size, seen from the hub: just, give or take how well the hub's middle and the
    // bar's direction are found from the mesh (within 0.015 radians here).
    expect(Math.abs(nearestBar(at, turnstile.angle) - Math.asin(0.01 / 0.11))).toBeLessThan(0.015);
    // Pushed again from the same place, it stays.
    const after = turnstile.angle;
    turnstile.push([point], 0.01);
    expect(turnstile.angle).toBeCloseTo(after, 6);
  });

  it("isn't pushed by what passes well in front of it or inside its hub", () => {
    const { chest, mesh } = robot();
    const turnstile = makeTurnstile(mesh, chest)!;
    turnstile.push(
      [HUB.clone().add(new Vector3(0, 0.1, 0.3)), HUB.clone().add(new Vector3(0.01, 0.01, 0))],
      0.01,
    );
    expect(turnstile.angle).toBe(0);
  });

  it("is null on a robot without one", () => {
    const { chest, mesh } = robot([]);
    expect(makeTurnstile(mesh, chest)).toBeNull();
  });
});

describe("the bars' directions", () => {
  it("finds each bar once, a bar along -x included, across the seam at +-pi", () => {
    const along = (a: number) => [a - 0.04, a - 0.01, a + 0.02, a + 0.05];
    const groups = clusterAngles([
      ...along(Math.PI),
      ...along(Math.PI / 3),
      ...along(-Math.PI / 3),
    ]);
    expect(groups).toHaveLength(3);
    const near = (a: number) =>
      groups.some((g) => Math.abs(Math.atan2(Math.sin(g - a), Math.cos(g - a))) < 0.05);
    expect(near(Math.PI) && near(Math.PI / 3) && near(-Math.PI / 3)).toBe(true);
  });
});
