import { useMemo } from "react";
import type { BufferGeometry, Mesh, MeshStandardMaterial } from "three";

import { useStationModel } from "./loading";

// The station's generated models (public/models/station/, made in Tripo from
// concept pictures: provenance.json says how). Each static model is one mesh,
// centered, resting on y = 0 and facing +z, about a unit tall or long;
// research/station-assets/process.mjs makes them so.

export type StationModel =
  | "counter"
  | "featured-stand"
  | "robot"
  | "shelf-unit"
  | "shopper-cardigan"
  | "shopper-coral"
  | "shopper-lavender"
  | "shopper-teal"
  | "shuttle"
  | "station-exterior";

export const modelUrl = (name: StationModel) => `/models/station/${name}.glb`;

/** The geometry and material of a static model, for instancing or placing as a plain mesh. */
export function useModelParts(name: StationModel): {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
} {
  const { scene } = useStationModel(modelUrl(name));
  return useMemo(() => {
    let mesh: Mesh | undefined;
    scene.traverse((o) => {
      if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh;
    });
    if (!mesh) throw new Error(`station: ${name} has no mesh`);
    return { geometry: mesh.geometry, material: mesh.material as MeshStandardMaterial };
  }, [scene, name]);
}

/**
 * Lets a model's own colors read in the shop's low light: it glows faintly
 * with its own texture, as the procedural pieces glow with their colors.
 */
export function selfLit(material: MeshStandardMaterial, amount: number): MeshStandardMaterial {
  const lit = material.clone();
  lit.emissive.set("#ffffff");
  lit.emissiveMap = lit.map;
  lit.emissiveIntensity = amount;
  return lit;
}
