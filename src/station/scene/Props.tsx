import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { Box3, Vector3, type Object3D } from "three";

// The studio's Tripo models (public/models/, provenance.json beside them),
// each scaled to a real-world height and stood on the floor.

interface Placement {
  model: "armchair" | "globe" | "hourglass" | "rocket";
  /** Meters tall. */
  height: number;
  position: [number, number, number];
  /** Radians about Y, after the model's own facing (item.json) is undone. */
  turn: number;
}

/** item.json's "facing": degrees the model is turned from facing +z. */
const FACING: Record<Placement["model"], number> = { armchair: 90, globe: 0, hourglass: 0, rocket: 0 };

const PLACEMENTS: Placement[] = [
  { model: "armchair", height: 1.05, position: [-6.3, 0, 4.1], turn: 2.4 },
  { model: "armchair", height: 1.05, position: [-5.0, 0, 2.3], turn: 0.4 },
  // Along the counter, clear of its register terminal (the +z end) and the console.
  { model: "globe", height: 0.5, position: [4.05, 1.06, 0.55], turn: -0.6 },
  { model: "hourglass", height: 0.32, position: [4.0, 1.06, 0.0], turn: 0 },
  { model: "rocket", height: 1.3, position: [4.6, 0.7, 4.4], turn: -0.5 },
];

const url = (model: Placement["model"]) => `/models/${model}.glb`;

function Placed({ placement, source }: { placement: Placement; source: Object3D }) {
  const object = useMemo(() => {
    const copy = source.clone(true);
    const size = new Box3().setFromObject(copy).getSize(new Vector3());
    copy.scale.setScalar(placement.height / size.y);
    const bounds = new Box3().setFromObject(copy);
    const center = bounds.getCenter(new Vector3());
    copy.position.set(-center.x, -bounds.min.y, -center.z);
    return copy;
  }, [placement.height, source]);
  const turn = placement.turn - (FACING[placement.model] * Math.PI) / 180;
  return (
    <group position={placement.position} rotation={[0, turn, 0]}>
      <primitive object={object} />
    </group>
  );
}

export function Props() {
  const loaded = {
    armchair: useGLTF(url("armchair"), false).scene,
    globe: useGLTF(url("globe"), false).scene,
    hourglass: useGLTF(url("hourglass"), false).scene,
    rocket: useGLTF(url("rocket"), false).scene,
  };
  return (
    <>
      {PLACEMENTS.map((p, i) => (
        <Placed key={i} placement={p} source={loaded[p.model]} />
      ))}
    </>
  );
}
