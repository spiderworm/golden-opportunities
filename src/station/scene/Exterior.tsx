import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SpriteMaterial,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Mesh,
  type Sprite,
} from "three";

import { box, merged } from "./geometry";
import { BERTH_ORIGIN, RING_RADIUS, RING_TUBE, ROOM, WINDOW } from "./layout";
import { selfLit, useModelParts } from "./models";
import { glowTexture, signTexture } from "./textures";
import { MAX_SHUTTLES } from "../scene-params";

// The station from outside: the generated station model (hub, spokes and a
// ring of modules), and the bookstore's berth on the rim, built here so its
// window opens onto the real shop inside.

/**
 * Fitting the station model (a unit across, standing on y = 0) to the scene:
 * its ring's outer edge at the ring's radius, the ring's middle at y = 0, and
 * turned so a gap between its pods faces the berth.
 */
const STATION_MODEL = { scale: (RING_RADIUS + RING_TUBE) / 0.49, ringHeight: 0.31, turn: 0 };

const HALF_W = ROOM.width / 2;
const HALF_D = ROOM.depth / 2;
const WALL = 0.3;
function berthGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  // The berth's shell, with an opening for the window.
  const berth: BufferGeometry[] = [
    box(0, -WALL / 2, 0, ROOM.width + 2 * WALL, WALL, ROOM.depth + 2 * WALL),
    box(0, ROOM.height + WALL / 2, 0, ROOM.width + 2 * WALL, WALL, ROOM.depth + 2 * WALL),
    box(-HALF_W - WALL / 2, ROOM.height / 2, 0, WALL, ROOM.height, ROOM.depth + 2 * WALL),
    box(HALF_W + WALL / 2, ROOM.height / 2, 0, WALL, ROOM.height, ROOM.depth + 2 * WALL),
    box(0, ROOM.height / 2, -HALF_D - WALL / 2, ROOM.width, ROOM.height, WALL),
    box(0, WINDOW.bottom / 2, HALF_D + WALL / 2, ROOM.width, WINDOW.bottom, WALL),
    box(0, (ROOM.height + WINDOW.top) / 2, HALF_D + WALL / 2, ROOM.width, ROOM.height - WINDOW.top, WALL),
    box(-(HALF_W + WINDOW.halfWidth) / 2, ROOM.height / 2, HALF_D + WALL / 2, HALF_W - WINDOW.halfWidth, ROOM.height, WALL),
    box((HALF_W + WINDOW.halfWidth) / 2, ROOM.height / 2, HALF_D + WALL / 2, HALF_W - WINDOW.halfWidth, ROOM.height, WALL),
    // Mullions, a collar into the ring, roof plant and the sign's posts.
    box(-2.2, ROOM.height / 2, HALF_D + WALL / 2, 0.14, WINDOW.top - WINDOW.bottom, 0.22),
    box(2.2, ROOM.height / 2, HALF_D + WALL / 2, 0.14, WINDOW.top - WINDOW.bottom, 0.22),
    box(0, ROOM.height / 2, -HALF_D - 1, 7, 3.4, 1.6),
    box(-5, ROOM.height + 0.6, -2, 3, 0.9, 3),
    box(5.5, ROOM.height + 0.4, -3, 2, 0.5, 2),
    box(-3.8, ROOM.height + 0.7, HALF_D - 0.4, 0.2, 1.4, 0.2),
    box(3.8, ROOM.height + 0.7, HALF_D - 0.4, 0.2, 1.4, 0.2),
  ];
  for (const piece of berth) pieces.push(piece.translate(BERTH_ORIGIN.x, BERTH_ORIGIN.y, BERTH_ORIGIN.z));
  return merged(pieces);
}

export function Exterior({ glow }: { glow: number }) {
  const parts = useMemo(
    () => ({ berth: berthGeometry() }),
    [],
  );
  const station = useModelParts("station-exterior");
  const materials = useMemo(() => {
    return {
      hull: new MeshStandardMaterial({ color: "#c9cedd", metalness: 0.25, roughness: 0.5 }),
      station: selfLit(station.material, 0.12),
      sign: new MeshBasicMaterial({ map: signTexture(), toneMapped: false, side: DoubleSide }),
      beacon: new SpriteMaterial({ map: glowTexture(), color: "#a99fff", blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      glass: new MeshStandardMaterial({ color: "#9fc4ff", transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    };
  }, [station]);

  useEffect(
    () => () => {
      for (const g of Object.values(parts)) g.dispose();
      for (const m of Object.values(materials)) {
        if ("map" in m && m.map) m.map.dispose();
        m.dispose();
      }
    },
    [parts, materials],
  );

  // The sign follows the shop's busyness.
  useEffect(() => {
    materials.sign.color.setScalar(0.6 + 0.9 * glow);
  }, [glow, materials]);
  const beacon = useRef<Sprite>(null);
  const hull = useRef<Mesh>(null);
  const eye = useMemo(() => new Vector3(), []);
  useFrame(({ clock, camera }) => {
    // From inside the shop the station's hull is all behind the walls (the
    // window looks away from the ring), and drawing it there tripled frame
    // times on software rendering; it's hidden while the camera is in the shop.
    const station = hull.current;
    if (station?.parent) {
      station.parent.worldToLocal(eye.copy(camera.position)).sub(BERTH_ORIGIN);
      station.visible = !(Math.abs(eye.x) < HALF_W && eye.y > 0 && eye.y < ROOM.height && Math.abs(eye.z) < HALF_D);
    }
    // The berth's beacon pulses slowly, so the shop can be found from anywhere outside.
    beacon.current?.scale.setScalar(12 + 4 * Math.sin(clock.elapsedTime * 1.6));
  });

  const front = ROOM.depth / 2 + WALL / 2;
  return (
    <>
      <mesh
        ref={hull}
        geometry={station.geometry}
        material={materials.station}
        position={[0, -STATION_MODEL.ringHeight * STATION_MODEL.scale, 0]}
        rotation={[0, STATION_MODEL.turn, 0]}
        scale={STATION_MODEL.scale}
      />
      <mesh geometry={parts.berth} material={materials.hull} />
      <group position={BERTH_ORIGIN}>
        <mesh position={[0, ROOM.height + 1.2, ROOM.depth / 2 - 0.3]} material={materials.sign}>
          <planeGeometry args={[8.4, 1.3]} />
        </mesh>
        <sprite ref={beacon} position={[0, ROOM.height + 2.6, 0]} material={materials.beacon} />
        <mesh position={[0, (WINDOW.bottom + WINDOW.top) / 2, front]} material={materials.glass}>
          <planeGeometry args={[WINDOW.halfWidth * 2, WINDOW.top - WINDOW.bottom]} />
        </mesh>
      </group>
    </>
  );
}

const SHUTTLE_SCALE = 7;

/** Shuttles circling the station, more of them when the shop is busy. They fly in world space. */
export function Shuttles({ count }: { count: number }) {
  const ref = useRef<InstancedMesh>(null);
  const model = useModelParts("shuttle");
  const { geometry, material } = useMemo(
    () => ({
      // About six and a half meters nose to tail, centered on its flight path.
      geometry: model.geometry.clone().translate(0, -0.21, 0).scale(SHUTTLE_SCALE, SHUTTLE_SCALE, SHUTTLE_SCALE),
      material: selfLit(model.material, 0.25),
    }),
    [model],
  );
  const orbits = useMemo(
    () =>
      Array.from({ length: MAX_SHUTTLES }, (_, i) => ({
        radius: 130 + i * 28,
        height: (i % 2 ? 1 : -1) * (8 + i * 6),
        speed: (0.05 + i * 0.012) * (i % 2 ? 1 : -1),
        phase: i * 1.9,
        tilt: 0.08 + i * 0.05,
      })),
    [],
  );
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.count = count;
    for (let i = 0; i < count; i++) {
      const o = orbits[i]!;
      const a = o.phase + clock.elapsedTime * o.speed;
      const at = (t: number) => [Math.cos(t) * o.radius, o.height + Math.sin(t * 2) * o.radius * o.tilt * 0.2, Math.sin(t) * o.radius] as const;
      dummy.position.set(...at(a));
      dummy.lookAt(...at(a + Math.sign(o.speed) * 0.02));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, MAX_SHUTTLES]} frustumCulled={false} />;
}
