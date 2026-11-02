import { readFileSync } from "node:fs";
import path from "node:path";
import { Bone, Group, Object3D } from "three";

/**
 * The phone robot's skeleton, built from its model's nodes (no meshes or textures), standing as PhoneScene
 * stands it: scaled to `height` metres, its feet on y = 0. For tests of how its hand holds the phone.
 */
export function robotSkeleton(height: number): { root: Group; bone: (name: string) => Bone } {
  const file = readFileSync(path.join(__dirname, "../../public/models/phone/subcommittee.glb"));
  const json = JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)).toString("utf8")) as {
    scenes: { nodes: number[] }[];
    nodes: {
      name?: string;
      translation?: number[];
      rotation?: number[];
      scale?: number[];
      children?: number[];
      mesh?: number;
    }[];
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min?: number[]; max?: number[] }[];
    skins: { joints: number[] }[];
  };
  const joints = new Set(json.skins[0]!.joints);
  const build = (i: number): Object3D => {
    const node = json.nodes[i]!;
    const o = joints.has(i) ? new Bone() : new Object3D();
    o.name = (node.name ?? "").replace(":", "");
    if (node.translation) o.position.fromArray(node.translation);
    if (node.rotation) o.quaternion.fromArray(node.rotation);
    if (node.scale) o.scale.fromArray(node.scale);
    for (const c of node.children ?? []) o.add(build(c));
    return o;
  };
  const body = new Group();
  for (const i of json.scenes[0]!.nodes) body.add(build(i));
  // The model's height, from its meshes' bounds in their bind pose (as PhoneScene measures the skinned model).
  let low = Infinity;
  let high = -Infinity;
  for (const mesh of json.meshes) {
    for (const p of mesh.primitives) {
      const a = json.accessors[p.attributes.POSITION]!;
      low = Math.min(low, a.min![1]!);
      high = Math.max(high, a.max![1]!);
    }
  }
  const scale = height / (high - low);
  body.scale.setScalar(scale);
  body.position.y = -low * scale;
  const root = new Group();
  root.add(body);
  root.updateMatrixWorld(true);
  return { root, bone: (name) => root.getObjectByName(name) as Bone };
}
