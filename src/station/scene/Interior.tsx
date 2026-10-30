import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
} from "three";

import { box, merged } from "./geometry";
import { ROOM, WINDOW } from "./layout";
import { coverTexture } from "./textures";

// The shop, in the berth's frame: floor at y = 0, the window wall at +z.
// Shelves line the back and left walls; the counter stands to the right;
// the featured book turns slowly on its plinth in front of the window.
// The counter faces the camera's corner, so the keeper greets the player.

const HALF_W = ROOM.width / 2;
const HALF_D = ROOM.depth / 2;
const INSET = 0.02;

/** A shelf unit: its center on the floor, its width, and which way its front faces (radians about Y). */
interface ShelfUnit {
  x: number;
  z: number;
  width: number;
  facing: number;
}

const SHELF_DEPTH = 0.62;
const SHELF_HEIGHT = 4.2;
const BOARDS = [0.12, 0.95, 1.78, 2.61, 3.44];

export const SHELF_UNITS: ShelfUnit[] = [
  { x: -4.9, z: -HALF_D + SHELF_DEPTH / 2 + INSET, width: 4.4, facing: 0 },
  { x: -0.3, z: -HALF_D + SHELF_DEPTH / 2 + INSET, width: 4.4, facing: 0 },
  { x: 4.3, z: -HALF_D + SHELF_DEPTH / 2 + INSET, width: 4.4, facing: 0 },
  { x: -HALF_W + SHELF_DEPTH / 2 + INSET, z: -2.9, width: 4.4, facing: Math.PI / 2 },
  { x: -HALF_W + SHELF_DEPTH / 2 + INSET, z: 1.6, width: 4.4, facing: Math.PI / 2 },
];

const placeUnit = (unit: ShelfUnit, piece: BufferGeometry) => piece.rotateY(unit.facing).translate(unit.x, 0, unit.z);

function liningGeometry() {
  const plane = (w: number, h: number) => new PlaneGeometry(w, h);
  const walls = merged([
    plane(ROOM.depth, ROOM.height).rotateY(Math.PI / 2).translate(-HALF_W + INSET, ROOM.height / 2, 0),
    plane(ROOM.depth, ROOM.height).rotateY(-Math.PI / 2).translate(HALF_W - INSET, ROOM.height / 2, 0),
    plane(ROOM.width, ROOM.height).translate(0, ROOM.height / 2, -HALF_D + INSET),
    // The front wall's inside, around the window.
    plane(ROOM.width, WINDOW.bottom).rotateY(Math.PI).translate(0, WINDOW.bottom / 2, HALF_D - INSET),
    plane(ROOM.width, ROOM.height - WINDOW.top).rotateY(Math.PI).translate(0, (ROOM.height + WINDOW.top) / 2, HALF_D - INSET),
    plane(HALF_W - WINDOW.halfWidth, ROOM.height).rotateY(Math.PI).translate(-(HALF_W + WINDOW.halfWidth) / 2, ROOM.height / 2, HALF_D - INSET),
    plane(HALF_W - WINDOW.halfWidth, ROOM.height).rotateY(Math.PI).translate((HALF_W + WINDOW.halfWidth) / 2, ROOM.height / 2, HALF_D - INSET),
    // A baseboard and a dado rail all round.
    box(0, 0.06, -HALF_D + 0.05, ROOM.width, 0.12, 0.06),
    box(-HALF_W + 0.05, 0.06, 0, 0.06, 0.12, ROOM.depth),
    box(HALF_W - 0.05, 0.06, 0, 0.06, 0.12, ROOM.depth),
  ]);
  const floor = plane(ROOM.width, ROOM.depth).rotateX(-Math.PI / 2).translate(0, INSET, 0);
  const ceiling = plane(ROOM.width, ROOM.depth).rotateX(Math.PI / 2).translate(0, ROOM.height - INSET, 0);
  const panels = merged(
    [-4.5, 0, 4.5].flatMap((x) => [-2.6, 1.6].map((z) => plane(3.2, 1.2).rotateX(Math.PI / 2).translate(x, ROOM.height - 0.05, z))),
  );
  const rug = new CircleGeometry(2.2, 48).rotateX(-Math.PI / 2).translate(-1.5, 0.03, 2.4);
  return { walls, floor, ceiling, panels, rug };
}

function shelvesGeometry() {
  const wood: BufferGeometry[] = [];
  const strips: BufferGeometry[] = [];
  for (const unit of SHELF_UNITS) {
    const w = unit.width;
    const pieces = [
      box(-w / 2 + 0.03, SHELF_HEIGHT / 2, 0, 0.06, SHELF_HEIGHT, SHELF_DEPTH),
      box(w / 2 - 0.03, SHELF_HEIGHT / 2, 0, 0.06, SHELF_HEIGHT, SHELF_DEPTH),
      box(0, SHELF_HEIGHT / 2, -SHELF_DEPTH / 2 + 0.02, w, SHELF_HEIGHT, 0.04),
      box(0, SHELF_HEIGHT, 0, w + 0.1, 0.08, SHELF_DEPTH + 0.06),
      ...BOARDS.map((y) => box(0, y - 0.025, 0, w - 0.12, 0.05, SHELF_DEPTH - 0.04)),
    ];
    for (const p of pieces) wood.push(placeUnit(unit, p));
    for (const y of BOARDS.slice(1)) strips.push(placeUnit(unit, box(0, y - 0.07, SHELF_DEPTH / 2 - 0.06, w - 0.2, 0.025, 0.025)));
    strips.push(placeUnit(unit, box(0, SHELF_HEIGHT - 0.07, SHELF_DEPTH / 2 - 0.06, w - 0.2, 0.025, 0.025)));
  }
  // A light strip along the counter's front.
  strips.push(box(4.42, 0.92, 0, 0.03, 0.04, 3.1));
  return { wood: merged(wood), strips: merged(strips) };
}

const Z_AXIS = new Vector3(0, 0, 1);
const BOOK_COLORS = ["#7a2e3b", "#2f4f7a", "#2e6b5a", "#c08a3e", "#5b3d7a", "#d9cfb8", "#3d3a52", "#a3462f", "#4f7d8f", "#8c7a4a"];

/** Seeded, so the shelves look the same on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function bookInstances(): { matrices: Matrix4[]; colors: Color[] } {
  const random = seeded(2194);
  const matrices: Matrix4[] = [];
  const colors: Color[] = [];
  const unitMatrix = new Matrix4();
  const book = new Matrix4();
  for (const unit of SHELF_UNITS) {
    unitMatrix.makeRotationY(unit.facing).setPosition(unit.x, 0, unit.z);
    for (const y of BOARDS.slice(0, 4)) {
      let x = -unit.width / 2 + 0.12;
      const end = unit.width / 2 - 0.12;
      while (x < end) {
        const width = 0.06 + random() * 0.08;
        if (x + width > end) break;
        if (random() < 0.05) {
          x += 0.25; // a gap where something sold
          continue;
        }
        const height = 0.46 + random() * 0.3;
        const depth = 0.34 + random() * 0.14;
        const lean = random() < 0.06 ? 0.18 : 0;
        book.compose(
          new Vector3(x + width / 2, y + height / 2, -SHELF_DEPTH / 2 + 0.06 + depth / 2),
          new Quaternion().setFromAxisAngle(Z_AXIS, lean),
          new Vector3(width, height, depth),
        );
        matrices.push(unitMatrix.clone().multiply(book));
        const c = new Color(BOOK_COLORS[Math.floor(random() * BOOK_COLORS.length)]!);
        colors.push(c.offsetHSL(0, 0, (random() - 0.5) * 0.12));
        x += width + 0.004;
      }
    }
  }
  return { matrices, colors };
}

function Books() {
  const ref = useRef<InstancedMesh>(null);
  const { matrices, colors } = useMemo(bookInstances, []);
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), []);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colors[i]!);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, colors]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <instancedMesh ref={ref} args={[undefined, material, matrices.length]}>
      <boxGeometry />
    </instancedMesh>
  );
}

function counterGeometry() {
  return merged([
    box(4.0, 0.5, 0, 0.8, 1.0, 3.2),
    box(4.0, 1.03, 0, 1.0, 0.06, 3.4),
    box(4.0, 0.03, 0, 0.7, 0.06, 3.1),
    // The plinth and easel for the featured book, and the reading nook's side table.
    new CylinderGeometry(0.75, 0.85, 0.9, 32).translate(-1.5, 0.45, 2.4),
    new CylinderGeometry(0.32, 0.32, 0.04, 20).translate(-6.4, 0.62, 3.0),
    new CylinderGeometry(0.04, 0.04, 0.6, 8).translate(-6.4, 0.31, 3.0),
    // The window display's pedestal.
    new CylinderGeometry(0.5, 0.55, 0.7, 24).translate(4.6, 0.35, 4.4),
  ]);
}

/** The featured title on a slowly swiveling stand, under a soft beam of light. */
function FeaturedDisplay({ title, glow }: { title: string; glow: number }) {
  const stand = useRef<Group>(null);
  const cover = useMemo(() => coverTexture(title), [title]);
  const materials = useMemo(
    () => ({
      cover: new MeshStandardMaterial({ map: cover, roughness: 0.5, emissive: "#ffffff", emissiveMap: cover, emissiveIntensity: 0.25 }),
      pages: new MeshStandardMaterial({ color: "#efe6d2", roughness: 0.9 }),
      back: new MeshStandardMaterial({ color: "#1a1f4a", roughness: 0.6 }),
      brass: new MeshStandardMaterial({ color: "#c9a25a", metalness: 0.8, roughness: 0.3 }),
      copies: new MeshStandardMaterial({ color: "#22306e", roughness: 0.6 }),
      beam: new MeshBasicMaterial({ color: "#a99fff", transparent: true, opacity: 0.07, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    }),
    [cover],
  );
  const stack = useMemo(
    () => merged([0, 1, 2, 3].map((i) => box(0.42, 0.93 + i * 0.1, 0.25, 0.5, 0.09, 0.72).rotateY(i * 0.12))),
    [],
  );
  useEffect(
    () => () => {
      cover.dispose();
      for (const m of Object.values(materials)) m.dispose();
    },
    [cover, materials],
  );
  useEffect(() => {
    materials.beam.opacity = 0.04 + 0.05 * glow;
  }, [glow, materials]);
  useFrame(({ clock }) => {
    if (stand.current) stand.current.rotation.y = 1.15 + Math.sin(clock.elapsedTime * 0.25) * 0.9;
  });

  return (
    <group position={[-1.5, 0, 2.4]}>
      <group ref={stand}>
        <mesh position={[0, 1.55, 0]} rotation={[-0.12, 0, 0]} material={[materials.pages, materials.pages, materials.pages, materials.pages, materials.cover, materials.back]}>
          <boxGeometry args={[0.9, 1.26, 0.12]} />
        </mesh>
        <mesh position={[0, 1.02, 0.12]} material={materials.brass}>
          <boxGeometry args={[0.8, 0.06, 0.16]} />
        </mesh>
        <mesh position={[0, 1.4, -0.16]} rotation={[0.3, 0, 0]} material={materials.brass}>
          <boxGeometry args={[0.05, 0.9, 0.05]} />
        </mesh>
      </group>
      <mesh geometry={stack} material={materials.copies} />
      <mesh position={[0, 3.2, 0]} material={materials.beam}>
        <coneGeometry args={[1.1, 3.6, 32, 1, true]} />
      </mesh>
    </group>
  );
}

/** The console on the counter; it pulses while the Commerce Office has an unread alert. */
function Console({ alert }: { alert: boolean }) {
  const material = useMemo(() => new MeshBasicMaterial({ color: "#6b5cff", toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    const level = alert ? 0.9 + 0.8 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4)) : 0.6;
    material.color.setRGB(0.42 * level, 0.36 * level, 1 * level);
  });
  return (
    <group position={[4.0, 1.06, -0.9]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 0.28, 0]} rotation={[-0.25, 0, 0]} material={material}>
        <planeGeometry args={[0.7, 0.42]} />
      </mesh>
      <mesh position={[0, 0.28, -0.03]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[0.78, 0.5, 0.04]} />
        <meshStandardMaterial color="#20253f" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** A floor lamp by the armchairs. */
function lampGeometry() {
  return {
    pole: merged([new CylinderGeometry(0.03, 0.03, 1.7, 8).translate(-7.1, 0.85, 4.2), new CylinderGeometry(0.25, 0.25, 0.04, 16).translate(-7.1, 0.02, 4.2)]),
    shade: new ConeGeometry(0.32, 0.36, 24, 1, true).translate(-7.1, 1.8, 4.2),
    bulb: new SphereGeometry(0.1, 12, 8).translate(-7.1, 1.7, 4.2),
  };
}

export function Interior({ title, glow, alert }: { title: string; glow: number; alert: boolean }) {
  const lining = useMemo(liningGeometry, []);
  const shelves = useMemo(shelvesGeometry, []);
  const counter = useMemo(counterGeometry, []);
  const lamp = useMemo(lampGeometry, []);
  const materials = useMemo(
    () => ({
      walls: new MeshStandardMaterial({ color: "#2b2f5c", roughness: 0.85 }),
      floor: new MeshStandardMaterial({ color: "#4a362c", roughness: 0.65 }),
      ceiling: new MeshStandardMaterial({ color: "#1c2142", roughness: 0.9 }),
      panels: new MeshBasicMaterial({ color: "#fff1dc", toneMapped: false }),
      rug: new MeshStandardMaterial({ color: "#4b3f9e", roughness: 1 }),
      wood: new MeshStandardMaterial({ color: "#6b4a35", roughness: 0.6 }),
      strips: new MeshBasicMaterial({ color: "#ffd9a8", toneMapped: false }),
      counter: new MeshStandardMaterial({ color: "#555b9c", roughness: 0.5, metalness: 0.05 }),
      lampMetal: new MeshStandardMaterial({ color: "#c9a25a", metalness: 0.8, roughness: 0.3 }),
      bulb: new MeshBasicMaterial({ color: "#ffe2b0", toneMapped: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const g of [...Object.values(lining), ...Object.values(shelves), counter, ...Object.values(lamp)]) g.dispose();
      for (const m of Object.values(materials)) m.dispose();
    },
    [lining, shelves, counter, lamp, materials],
  );
  // Shelf lights breathe gently, brighter when the shop is busy.
  useFrame(({ clock }) => {
    const breathe = 0.92 + 0.08 * Math.sin(clock.elapsedTime * 1.3);
    materials.strips.color.setRGB(1, 0.85, 0.66).multiplyScalar(glow * breathe * 1.4);
    materials.panels.color.setRGB(1, 0.95, 0.86).multiplyScalar(0.35 + 0.45 * glow);
  });

  const light = 9 * glow;
  return (
    <>
      <mesh geometry={lining.walls} material={materials.walls} />
      <mesh geometry={lining.floor} material={materials.floor} />
      <mesh geometry={lining.ceiling} material={materials.ceiling} />
      <mesh geometry={lining.panels} material={materials.panels} />
      <mesh geometry={lining.rug} material={materials.rug} />
      <mesh geometry={shelves.wood} material={materials.wood} />
      <mesh geometry={shelves.strips} material={materials.strips} />
      <Books />
      <mesh geometry={counter} material={materials.counter} />
      <mesh geometry={lamp.pole} material={materials.lampMetal} />
      <mesh geometry={lamp.shade} material={materials.lampMetal} />
      <mesh geometry={lamp.bulb} material={materials.bulb} />
      <FeaturedDisplay title={title} glow={glow} />
      <Console alert={alert} />
      <pointLight position={[-3.5, 4.2, -1.5]} intensity={light} distance={13} decay={1.5} color="#ffd6a6" />
      <pointLight position={[5.6, 4.2, -0.5]} intensity={light} distance={13} decay={1.5} color="#ffd6a6" />
      <pointLight position={[-1.5, 4.2, 3]} intensity={light * 0.9} distance={11} decay={1.5} color="#c8bfff" />
    </>
  );
}
