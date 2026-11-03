import { Bone, Matrix4, Quaternion, Skeleton, Vector3, type SkinnedMesh } from "three";

// The turnstile across the phone robot's shoulders (public/models/phone,
// David, 2 Nov: its old waist turnstile read badly), made to turn: wherever
// the robot's arm passes through a bar, the bar gives, and the turnstile
// turns as one does when a person pushes through it (David: "It would be cool
// if it actually *spun* the turnstile a bit instead").
//
// Tripo's mesh has the hub and bars among its own pieces, skinned to the
// chest and shoulders. The bars are pieces wholly in front of the chest at
// shoulder height, where nothing else is; the hub is a cylinder standing on
// the chest, its sides joined to the chest's own piece, so it's every vertex
// within the hub's radius of its axis and in front of the chest's face (the
// chest stays). Measured in the model's own frame, about 1 tall: the chest's
// face is at z = 0.113 and the hub's at 0.166. All of it moves onto a bone of
// its own at the hub, which turns about the hub's axis, out of the chest.

/** The bars: pieces wholly in front of the chest (z above this) at shoulder height. */
const IN_FRONT = 0.085;
const HEIGHT = [0.6, 0.86] as const;
/** The hub: the pieces within this of the middle, across, give its middle; its radius; and the chest's face, behind it. */
const HUB_ACROSS = 0.06;
const HUB_RADIUS = 0.09;
const CHEST_FACE = 0.118;
/** A bar reaches out at least this far from the hub's axis (the model's units). */
const BAR_FROM = 0.1;

export interface Turnstile {
  bone: Bone;
  /** How far it has turned, in radians, about the hub's axis (out of the chest), from as it was made. */
  angle: number;
  /** Pushes it round, as needed, so no bar passes through any of these points (world), each a ball `radius` metres across. */
  push: (points: Vector3[], radius: number) => void;
  /** How many vertices it took over, for tests and debugging. */
  vertices: number;
}

/** Finds the turnstile on the robot's mesh and gives it a bone at its hub, a child of `chest`; null if it isn't there. */
export function makeTurnstile(mesh: SkinnedMesh, chest: Bone): Turnstile | null {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!index) return null;
  // The mesh's pieces: vertices joined by triangles.
  const parent = new Int32Array(position.count).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]!]!;
    return x;
  };
  for (let t = 0; t < index.count; t += 3) {
    for (const k of [1, 2]) {
      const a = find(index.getX(t));
      const b = find(index.getX(t + k));
      if (a !== b) parent[a] = b;
    }
  }
  const outside = new Set<number>();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (position.getZ(i) <= IN_FRONT || y < HEIGHT[0] || y > HEIGHT[1]) outside.add(find(i));
  }
  const bars = new Set<number>();
  for (let i = 0; i < position.count; i++) if (!outside.has(find(i))) bars.add(i);
  // The hub's middle: of the bars' pieces, those in the middle, across.
  const hub = new Vector3();
  let n = 0;
  for (const i of bars) {
    if (Math.abs(position.getX(i)) > HUB_ACROSS) continue;
    hub.add(new Vector3().fromBufferAttribute(position, i));
    n++;
  }
  if (bars.size < 50 || !n) return null;
  hub.divideScalar(n);
  // The hub's cylinder, sides and all: within its radius of the axis (the model's z), in front of the chest's face.
  const mine = new Set(bars);
  for (let i = 0; i < position.count; i++) {
    if (
      position.getZ(i) > CHEST_FACE &&
      Math.hypot(position.getX(i) - hub.x, position.getY(i) - hub.y) < HUB_RADIUS
    )
      mine.add(i);
  }
  // Which ways the bars point, about the hub, in the model's x-y plane: the far ends of the bar pieces, by angle.
  const ways: number[] = [];
  for (const i of bars) {
    const dx = position.getX(i) - hub.x;
    const dy = position.getY(i) - hub.y;
    if (Math.hypot(dx, dy) > BAR_FROM) ways.push(Math.atan2(dy, dx));
  }
  const barAngles = clusterAngles(ways);
  let reach = 0;
  for (const i of bars)
    reach = Math.max(reach, Math.hypot(position.getX(i) - hub.x, position.getY(i) - hub.y));

  // A bone at the hub, as the chest's child, placed where the hub is in the pose the mesh was bound in.
  const skeleton = mesh.skeleton;
  const chestIndex = skeleton.bones.indexOf(chest);
  const chestBind = skeleton.boneInverses[chestIndex]!.clone().invert();
  const toChest = chestBind.clone().invert().multiply(mesh.bindMatrix);
  const bone = new Bone();
  bone.name = "turnstile";
  bone.position.copy(hub.clone().applyMatrix4(toChest));
  chest.add(bone);
  // The hub's axis and the bars' plane, in the chest's frame: the model's z, and its x and y.
  const axis = new Vector3(0, 0, 1).transformDirection(toChest);
  const across = new Vector3(1, 0, 0).transformDirection(toChest);
  const up = new Vector3(0, 1, 0).transformDirection(toChest);
  // The model's units in the chest's frame's units.
  const unit = new Vector3(1, 0, 0)
    .applyMatrix4(toChest)
    .sub(new Vector3().applyMatrix4(toChest))
    .length();
  const boneBind = chestBind.clone().multiply(new Matrix4().makeTranslation(bone.position));
  const bones = [...skeleton.bones, bone];
  mesh.bind(new Skeleton(bones, [...skeleton.boneInverses, boneBind.invert()]), mesh.bindMatrix);
  // Its vertices follow it alone (on a copy of the geometry: clones of the model share it).
  const own = geometry.clone();
  const skinIndex = own.getAttribute("skinIndex");
  const skinWeight = own.getAttribute("skinWeight");
  for (const i of mine) {
    skinIndex.setXYZW(i, bones.length - 1, 0, 0, 0);
    skinWeight.setXYZW(i, 1, 0, 0, 0);
  }
  skinIndex.needsUpdate = skinWeight.needsUpdate = true;
  mesh.geometry = own;

  const turn = new Quaternion();
  const local = new Vector3();
  const self: Turnstile = {
    bone,
    angle: 0,
    vertices: mine.size,
    push: (points, radius) => {
      chest.updateMatrixWorld(true);
      const scale = chest.getWorldScale(local).x;
      for (const point of points) {
        // The point in the bars' plane: how far out from the hub, at what angle, and how far off the plane.
        chest.worldToLocal(local.copy(point)).sub(bone.position);
        const off = Math.abs(local.dot(axis)) * scale;
        const x = local.dot(across);
        const y = local.dot(up);
        const out = Math.hypot(x, y);
        const r = radius / scale;
        if (off > radius + BAR_THICK || out < HUB_RADIUS * unit || out > reach * unit + r) continue;
        // Each bar it touches gives way, turning the turnstile until the bar's edge just meets the point.
        const at = Math.atan2(y, x);
        const half = Math.asin(Math.min(1, r / out));
        for (const bar of barAngles) {
          const d = wrap(at - (bar + self.angle));
          if (Math.abs(d) < half) self.angle += d - Math.sign(d || 1) * half;
        }
      }
      bone.quaternion.copy(turn.setFromAxisAngle(axis, self.angle));
      bone.updateMatrixWorld(true);
    },
  };
  return self;
}
/** A bar's half thickness, in metres, as the arm meets it. */
const BAR_THICK = 0.03;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The directions among `angles` (radians), grouped where they're within 25 degrees of each other: each group's middle. */
export function clusterAngles(angles: number[]): number[] {
  const bins = new Array<number>(72).fill(0);
  for (const a of angles) bins[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 72) % 72]!++;
  // Start just after an empty bin, so a run across the seam at +-pi (a bar along -x) is gathered once, whole.
  const empty = bins.indexOf(0);
  if (empty < 0) return [];
  const groups: number[] = [];
  const seen = new Array<boolean>(72).fill(false);
  for (let s = 1; s <= 72; s++) {
    const b = (empty + s) % 72;
    if (!bins[b] || seen[b]) continue;
    // Gather this run of filled bins, on round.
    let sum = 0;
    let weight = 0;
    for (let k = b, step = 0; bins[k] && !seen[k] && step < 72; k = (k + 1) % 72, step++) {
      seen[k] = true;
      const a = ((k + 0.5) / 72) * 2 * Math.PI - Math.PI;
      const ref = ((b + 0.5) / 72) * 2 * Math.PI - Math.PI;
      sum += (ref + wrap(a - ref)) * bins[k]!;
      weight += bins[k]!;
    }
    groups.push(wrap(sum / weight));
  }
  return groups;
}
