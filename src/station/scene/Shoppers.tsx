import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CapsuleGeometry, Color, MeshStandardMaterial, Object3D, SphereGeometry, type InstancedMesh } from "three";

import { merged } from "./geometry";
import { MAX_SHOPPERS } from "../scene-params";

// Browsing customers, drawn as simple figures until real character models
// arrive. Each walks between browsing spots and stops at each for a while.
// Instance 0 is the keeper behind the counter; the rest come and go with
// the shop's busyness.

/** Where a shopper stands to browse, and which way they face (radians about Y, 0 = +z). */
const SPOTS: [x: number, z: number, facing: number][] = [
  [-6.6, -3.6, -Math.PI / 2],
  [-6.6, -1.4, -Math.PI / 2],
  [-6.6, 1.0, -Math.PI / 2],
  [-6.6, 2.8, -Math.PI / 2],
  [-4.6, -4.3, Math.PI],
  [-1.6, -4.3, Math.PI],
  [1.2, -4.3, Math.PI],
  [-1.5, 1.2, 0],
  [-0.2, 3.4, -Math.PI / 2],
  [-3.6, 4.6, 0],
  [5.1, 1.0, -Math.PI / 2],
];
const KEEPER: [number, number, number] = [3.1, 0.2, Math.PI / 2];
const SPEED = 0.8;

const COATS = ["#d0705a", "#5a8fd0", "#e0b45a", "#6fbf8f", "#b27ad6", "#e6e1d3", "#5ac2c2", "#d65a8f"];

interface Walker {
  from: number;
  to: number;
  /** Seconds spent walking to `to`, then browsing there. */
  walk: number;
  browse: number;
  started: number;
}

const randomSpot = (not: number) => {
  let next = not;
  while (next === not) next = Math.floor(Math.random() * SPOTS.length);
  return next;
};

function plan(from: number, to: number, now: number): Walker {
  const [ax, az] = SPOTS[from]!;
  const [bx, bz] = SPOTS[to]!;
  return { from, to, walk: Math.hypot(bx - ax, bz - az) / SPEED, browse: 3 + Math.random() * 6, started: now };
}

export function Shoppers({ count }: { count: number }) {
  const ref = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({
      geometry: merged([new CapsuleGeometry(0.26, 0.85, 4, 12).translate(0, 0.7, 0), new SphereGeometry(0.2, 14, 10).translate(0, 1.55, 0)]),
      material: new MeshStandardMaterial({ roughness: 0.7 }),
    }),
    [],
  );
  const walkers = useMemo(
    () =>
      Array.from({ length: MAX_SHOPPERS }, (_, i) => {
        const from = i % SPOTS.length;
        // Start partway through browsing, so they don't all move at once.
        return { ...plan(from, from, 0), browse: Math.random() * 6 };
      }),
    [],
  );
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i <= MAX_SHOPPERS; i++) mesh.setColorAt(i, new Color(i === 0 ? "#6b5cff" : COATS[(i - 1) % COATS.length]!));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const now = clock.elapsedTime;
    dummy.position.set(KEEPER[0], 0, KEEPER[1]);
    dummy.rotation.set(0, KEEPER[2] + Math.sin(now * 0.4) * 0.3, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(0, dummy.matrix);
    for (let i = 0; i < count; i++) {
      let w = walkers[i]!;
      if (now - w.started > w.walk + w.browse) w = walkers[i] = plan(w.to, randomSpot(w.to), now);
      const t = Math.min(1, (now - w.started) / Math.max(w.walk, 0.001));
      const [ax, az] = SPOTS[w.from]!;
      const [bx, bz, facing] = SPOTS[w.to]!;
      const walking = t < 1;
      dummy.position.set(ax + (bx - ax) * t, walking ? Math.abs(Math.sin(now * 7 + i)) * 0.05 : 0, az + (bz - az) * t);
      dummy.rotation.set(0, walking ? Math.atan2(bx - ax, bz - az) : facing, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i + 1, dummy.matrix);
    }
    mesh.count = count + 1;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, MAX_SHOPPERS + 1]} frustumCulled={false} />;
}
