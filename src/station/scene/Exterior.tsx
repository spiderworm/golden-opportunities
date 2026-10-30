import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SphereGeometry,
  SpriteMaterial,
  TorusGeometry,
  type BufferGeometry,
  type InstancedMesh,
  type Sprite,
} from "three";

import { box, merged } from "./geometry";
import { BERTH_ORIGIN, RING_RADIUS, RING_TUBE, ROOM, WINDOW } from "./layout";
import { glowTexture, signTexture, solarTexture } from "./textures";
import { MAX_SHUTTLES } from "../scene-params";

// The station from outside: a hub, four spokes, a ring of modules and the
// bookstore's berth on the rim. Static pieces that share a material are
// merged, so the whole hull is a handful of draw calls.

const HALF_W = ROOM.width / 2;
const HALF_D = ROOM.depth / 2;
const WALL = 0.3;
/** Angles (around the ring) of the other modules, leaving the berth's own spot (0) clear. */
const MODULE_ANGLES = Array.from({ length: 16 }, (_, i) => (i + 0.5) * ((2 * Math.PI) / 16)).filter(
  (a) => Math.min(a, 2 * Math.PI - a) > 0.25,
);
const SPOKE_ANGLES = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];

/** Places a piece at an angle round the ring, `out` beyond its center line. */
function onRing(piece: BufferGeometry, angle: number, out: number): BufferGeometry {
  return piece.translate(0, 0, RING_RADIUS + out).rotateY(angle);
}

function hullGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  // Hub, its end caps and a docking collar.
  pieces.push(new CylinderGeometry(10, 10, 26, 40));
  pieces.push(new ConeGeometry(10, 8, 40).translate(0, 17, 0));
  pieces.push(new ConeGeometry(10, 8, 40).rotateX(Math.PI).translate(0, -17, 0));
  pieces.push(new CylinderGeometry(3, 3, 14, 20).translate(0, 26, 0));
  pieces.push(new TorusGeometry(5.5, 1, 12, 32).rotateX(Math.PI / 2).translate(0, 31, 0));
  pieces.push(new CylinderGeometry(0.4, 0.4, 20, 8).translate(0, -28, 0));
  // The ring, its rails, and the spokes out to it.
  pieces.push(new TorusGeometry(RING_RADIUS, RING_TUBE, 20, 180).rotateX(Math.PI / 2));
  pieces.push(new TorusGeometry(RING_RADIUS, 0.6, 6, 180).rotateX(Math.PI / 2).translate(0, 4.6, 0));
  pieces.push(new TorusGeometry(RING_RADIUS, 0.6, 6, 180).rotateX(Math.PI / 2).translate(0, -4.6, 0));
  for (const a of SPOKE_ANGLES) {
    pieces.push(new CylinderGeometry(1.6, 1.6, RING_RADIUS - 10, 12).rotateX(Math.PI / 2).translate(0, 0, (RING_RADIUS + 10) / 2).rotateY(a));
    pieces.push(new CylinderGeometry(0.5, 0.5, RING_RADIUS - 10, 6).rotateX(Math.PI / 2).translate(0, 5, (RING_RADIUS + 10) / 2).rotateY(a));
  }
  // The other modules on the rim, each a pod with a roof fin.
  MODULE_ANGLES.forEach((a, i) => {
    const w = i % 3 === 0 ? 14 : 10;
    pieces.push(onRing(box(0, 0, 0, w, 6, 7), a, RING_TUBE + 2.5));
    pieces.push(onRing(box(0, 3.6, -1, w * 0.6, 1.2, 3), a, RING_TUBE + 2.5));
  });
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

/** Lit windows: strips on every module and portholes along the ring. */
function windowsGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  MODULE_ANGLES.forEach((a, i) => {
    const w = i % 3 === 0 ? 14 : 10;
    pieces.push(onRing(box(0, 0.6, 3.52, w * 0.8, 1.1, 0.1), a, RING_TUBE + 2.5));
  });
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * 2 * Math.PI;
    if (Math.min(a, 2 * Math.PI - a) < 0.12) continue;
    pieces.push(onRing(box(0, 1.2, 0, 1.2, 0.8, 0.4), a, RING_TUBE - 0.9));
  }
  for (let i = 0; i < 10; i++) pieces.push(box(0, -8 + i * 2.2, 0, 1.2, 0.7, 20.4).rotateY((i * Math.PI) / 5));
  return merged(pieces);
}

function solarGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    pieces.push(box(side * 32, 24, 0, 40, 0.3, 12));
    pieces.push(box(side * 32, -24, 0, 40, 0.3, 12));
  }
  return merged(pieces);
}

function trussGeometry(): BufferGeometry {
  return merged([box(0, 24, 0, 104, 0.8, 0.8), box(0, -24, 0, 104, 0.8, 0.8)]);
}

/** Red and green lights on the ring's rim and the hub's mast. */
function navLightsGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) pieces.push(onRing(new SphereGeometry(0.7, 8, 6).translate(0, 5.2, 0), (i / 8) * 2 * Math.PI + 0.2, 0));
  pieces.push(new SphereGeometry(0.8, 8, 6).translate(0, 38, 0));
  pieces.push(new SphereGeometry(0.8, 8, 6).translate(0, -38, 0));
  return merged(pieces);
}

export function Exterior({ glow }: { glow: number }) {
  const parts = useMemo(
    () => ({
      hull: hullGeometry(),
      windows: windowsGeometry(),
      solar: solarGeometry(),
      truss: trussGeometry(),
      nav: navLightsGeometry(),
    }),
    [],
  );
  const materials = useMemo(() => {
    const solar = solarTexture();
    solar.repeat.set(6, 2);
    solar.wrapS = solar.wrapT = RepeatWrapping;
    return {
      hull: new MeshStandardMaterial({ color: "#c9cedd", metalness: 0.25, roughness: 0.5 }),
      windows: new MeshBasicMaterial({ color: new Color("#ffd59a").multiplyScalar(1.6), toneMapped: false }),
      solar: new MeshStandardMaterial({ map: solar, color: "#9fb4ff", metalness: 0.7, roughness: 0.25, emissive: "#0c1a45" }),
      truss: new MeshStandardMaterial({ color: "#7d8398", metalness: 0.6, roughness: 0.5 }),
      nav: new MeshBasicMaterial({ color: "#ff4d6a", toneMapped: false }),
      sign: new MeshBasicMaterial({ map: signTexture(), toneMapped: false, side: DoubleSide }),
      beacon: new SpriteMaterial({ map: glowTexture(), color: "#a99fff", blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      glass: new MeshStandardMaterial({ color: "#9fc4ff", transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    };
  }, []);

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

  // The sign follows the shop's busyness; the nav lights blink.
  useEffect(() => {
    materials.sign.color.setScalar(0.6 + 0.9 * glow);
  }, [glow, materials]);
  const beacon = useRef<Sprite>(null);
  useFrame(({ clock }) => {
    // The berth's beacon pulses slowly, so the shop can be found from anywhere outside.
    beacon.current?.scale.setScalar(12 + 4 * Math.sin(clock.elapsedTime * 1.6));
    const blink = Math.sin(clock.elapsedTime * 3) > 0.6 ? 1.8 : 0.15;
    materials.nav.color.setRGB(blink, blink * 0.3, blink * 0.42);
  });

  const front = ROOM.depth / 2 + WALL / 2;
  return (
    <>
      <mesh geometry={parts.hull} material={materials.hull} />
      <mesh geometry={parts.windows} material={materials.windows} />
      <mesh geometry={parts.solar} material={materials.solar} />
      <mesh geometry={parts.truss} material={materials.truss} />
      <mesh geometry={parts.nav} material={materials.nav} />
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

/** Shuttles circling the station, more of them when the shop is busy. They fly in world space. */
export function Shuttles({ count }: { count: number }) {
  const ref = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(() => {
    const body = new CapsuleGeometry(1.1, 4, 4, 10).rotateX(Math.PI / 2);
    const wings = box(0, 0, 0.8, 5, 0.25, 1.6);
    return {
      geometry: merged([body, wings]),
      material: new MeshStandardMaterial({ color: "#e8ebf5", metalness: 0.4, roughness: 0.35, emissive: "#3a2f8f", emissiveIntensity: 0.4 }),
    };
  }, []);
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
