import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
} from "three";

import type { Bookshop } from "./bookshop";
import { Books } from "./Books";
import { box, merged } from "./geometry";
import { ROOM, WINDOW } from "./layout";
import { selfLit, useModelParts } from "./models";
import {
  BAYS,
  BOARDS,
  SHELF_BACK,
  SHELF_HALVES,
  SHELF_HEIGHT,
  SHELF_SCALE,
  SHELF_UNITS,
  type ShelfUnit,
} from "./shelves";
import { coverTexture } from "./textures";

// The shop, in the berth's frame: floor at y = 0, the window wall at +z.
// Shelves line the back and left walls; the counter stands to the right;
// the featured book turns slowly on its plinth in front of the window.
// The counter faces the camera's corner, so the keeper greets the player.

const HALF_W = ROOM.width / 2;
const HALF_D = ROOM.depth / 2;
const INSET = 0.02;

const placeUnit = (unit: ShelfUnit, piece: BufferGeometry) =>
  piece.rotateY(unit.facing).translate(unit.x, 0, unit.z);

function liningGeometry() {
  const plane = (w: number, h: number) => new PlaneGeometry(w, h);
  const walls = merged([
    plane(ROOM.depth, ROOM.height)
      .rotateY(Math.PI / 2)
      .translate(-HALF_W + INSET, ROOM.height / 2, 0),
    plane(ROOM.depth, ROOM.height)
      .rotateY(-Math.PI / 2)
      .translate(HALF_W - INSET, ROOM.height / 2, 0),
    plane(ROOM.width, ROOM.height).translate(0, ROOM.height / 2, -HALF_D + INSET),
    // The front wall's inside, around the window.
    plane(ROOM.width, WINDOW.bottom)
      .rotateY(Math.PI)
      .translate(0, WINDOW.bottom / 2, HALF_D - INSET),
    plane(ROOM.width, ROOM.height - WINDOW.top)
      .rotateY(Math.PI)
      .translate(0, (ROOM.height + WINDOW.top) / 2, HALF_D - INSET),
    plane(HALF_W - WINDOW.halfWidth, ROOM.height)
      .rotateY(Math.PI)
      .translate(-(HALF_W + WINDOW.halfWidth) / 2, ROOM.height / 2, HALF_D - INSET),
    plane(HALF_W - WINDOW.halfWidth, ROOM.height)
      .rotateY(Math.PI)
      .translate((HALF_W + WINDOW.halfWidth) / 2, ROOM.height / 2, HALF_D - INSET),
    // A baseboard and a dado rail all round.
    box(0, 0.06, -HALF_D + 0.05, ROOM.width, 0.12, 0.06),
    box(-HALF_W + 0.05, 0.06, 0, 0.06, 0.12, ROOM.depth),
    box(HALF_W - 0.05, 0.06, 0, 0.06, 0.12, ROOM.depth),
  ]);
  const floor = plane(ROOM.width, ROOM.depth)
    .rotateX(-Math.PI / 2)
    .translate(0, INSET, 0);
  const ceiling = plane(ROOM.width, ROOM.depth)
    .rotateX(Math.PI / 2)
    .translate(0, ROOM.height - INSET, 0);
  const panels = merged(
    [-4.5, 0, 4.5].flatMap((x) =>
      [-2.6, 1.6].map((z) =>
        plane(3.2, 1.2)
          .rotateX(Math.PI / 2)
          .translate(x, ROOM.height - 0.05, z),
      ),
    ),
  );
  const rug = new CircleGeometry(2.2, 48).rotateX(-Math.PI / 2).translate(-1.5, 0.03, 2.4);
  return { walls, floor, ceiling, panels, rug };
}

/** Light strips under each board, lighting the books below, and one along the counter's front. */
function stripsGeometry() {
  const strips: BufferGeometry[] = [];
  const under = [...BOARDS.slice(1), SHELF_HEIGHT - 0.02];
  for (const unit of SHELF_UNITS) {
    for (const [from, to] of BAYS) {
      for (const y of under)
        strips.push(
          placeUnit(
            unit,
            box((from + to) / 2, y - 0.1, SHELF_BACK + 0.36, to - from, 0.025, 0.025),
          ),
        );
    }
  }
  strips.push(box(4.42, 0.92, 0, 0.03, 0.04, 3.1));
  return merged(strips);
}

/** The shelf units: two generated shelf models side by side in each. */
function Shelves({ material }: { material: MeshStandardMaterial }) {
  const ref = useRef<InstancedMesh>(null);
  const { geometry } = useModelParts("shelf-unit");
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const unitFrame = new Matrix4();
    const half = new Matrix4();
    let i = 0;
    for (const unit of SHELF_UNITS) {
      unitFrame.makeRotationY(unit.facing).setPosition(unit.x, 0, unit.z);
      for (const x of SHELF_HALVES) {
        half.makeScale(SHELF_SCALE.x, SHELF_SCALE.y, SHELF_SCALE.z).setPosition(x, 0, 0);
        mesh.setMatrixAt(i++, unitFrame.clone().multiply(half));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, SHELF_UNITS.length * SHELF_HALVES.length]}
    />
  );
}

/**
 * The counter model's top is at 0.32 of its unit length (measured), so this
 * puts the top at the old counter's 1.06 m; it faces +x, toward the camera's
 * corner, with the keeper behind it.
 */
const COUNTER_SCALE = 1.06 / 0.32;

/** Plinths, pedestals and the side table: the furniture with no model of its own. */
function counterGeometry() {
  return merged([
    // The plinth and easel for the featured book, and the reading nook's side table.
    new CylinderGeometry(0.75, 0.85, 0.9, 32).translate(-1.5, 0.45, 2.4),
    new CylinderGeometry(0.32, 0.32, 0.04, 20).translate(-6.4, 0.62, 3.0),
    new CylinderGeometry(0.04, 0.04, 0.6, 8).translate(-6.4, 0.31, 3.0),
    // The window display's pedestal.
    new CylinderGeometry(0.5, 0.55, 0.7, 24).translate(4.6, 0.35, 4.4),
  ]);
}

/** The featured title on a slowly swiveling stand, under a soft beam of light. */
/**
 * The featured stand model, a unit tall, stands on the plinth (0.9 m); its
 * ledge is at 0.38 of its height and 0.17 in front of its center (measured).
 */
const EASEL = { scale: 1.17, base: 0.9, ledge: 0.38, front: 0.17 };
const FEATURED_BOOK = { width: 0.62, height: 0.86, depth: 0.08 };

function FeaturedDisplay({ title, glow }: { title: string; glow: number }) {
  const stand = useRef<Group>(null);
  const easel = useModelParts("featured-stand");
  const cover = useMemo(() => coverTexture(title), [title]);
  const materials = useMemo(
    () => ({
      cover: new MeshStandardMaterial({
        map: cover,
        roughness: 0.5,
        emissive: "#ffffff",
        emissiveMap: cover,
        emissiveIntensity: 0.25,
      }),
      pages: new MeshStandardMaterial({ color: "#efe6d2", roughness: 0.9 }),
      back: new MeshStandardMaterial({ color: "#1a1f4a", roughness: 0.6 }),
      easel: selfLit(easel.material, 0.2),
      copies: new MeshStandardMaterial({ color: "#22306e", roughness: 0.6 }),
      beam: new MeshBasicMaterial({
        color: "#a99fff",
        transparent: true,
        opacity: 0.07,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    }),
    [cover, easel],
  );
  const stack = useMemo(
    () =>
      merged(
        [0, 1, 2, 3].map((i) => box(0.42, 0.93 + i * 0.1, 0.25, 0.5, 0.09, 0.72).rotateY(i * 0.12)),
      ),
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
        <mesh
          position={[
            0,
            EASEL.base + EASEL.ledge * EASEL.scale + FEATURED_BOOK.height / 2,
            EASEL.front * EASEL.scale - 0.06,
          ]}
          rotation={[-0.12, 0, 0]}
          material={[
            materials.pages,
            materials.pages,
            materials.pages,
            materials.pages,
            materials.cover,
            materials.back,
          ]}
        >
          <boxGeometry args={[FEATURED_BOOK.width, FEATURED_BOOK.height, FEATURED_BOOK.depth]} />
        </mesh>
        <mesh
          geometry={easel.geometry}
          material={materials.easel}
          position={[0, EASEL.base, 0]}
          scale={EASEL.scale}
        />
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
  const material = useMemo(
    () => new MeshBasicMaterial({ color: "#6b5cff", toneMapped: false }),
    [],
  );
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
    pole: merged([
      new CylinderGeometry(0.03, 0.03, 1.7, 8).translate(-7.1, 0.85, 4.2),
      new CylinderGeometry(0.25, 0.25, 0.04, 16).translate(-7.1, 0.02, 4.2),
    ]),
    shade: new ConeGeometry(0.32, 0.36, 24, 1, true).translate(-7.1, 1.8, 4.2),
    bulb: new SphereGeometry(0.1, 12, 8).translate(-7.1, 1.7, 4.2),
  };
}

export function Interior({
  title,
  glow,
  alert,
  shop,
}: {
  title: string;
  glow: number;
  alert: boolean;
  shop: Bookshop;
}) {
  const lining = useMemo(liningGeometry, []);
  const strips = useMemo(stripsGeometry, []);
  const shelfModel = useModelParts("shelf-unit");
  const counterModel = useModelParts("counter");
  const counter = useMemo(counterGeometry, []);
  const lamp = useMemo(lampGeometry, []);
  const materials = useMemo(
    () => ({
      walls: new MeshStandardMaterial({ color: "#2b2f5c", roughness: 0.85 }),
      floor: new MeshStandardMaterial({ color: "#4a362c", roughness: 0.65 }),
      ceiling: new MeshStandardMaterial({ color: "#1c2142", roughness: 0.9 }),
      panels: new MeshBasicMaterial({ color: "#fff1dc", toneMapped: false }),
      rug: new MeshStandardMaterial({ color: "#4b3f9e", roughness: 1 }),
      shelves: selfLit(shelfModel.material, 0.15),
      counterModel: selfLit(counterModel.material, 0.15),
      strips: new MeshBasicMaterial({ color: "#ffd9a8", toneMapped: false }),
      counter: new MeshStandardMaterial({ color: "#555b9c", roughness: 0.5, metalness: 0.05 }),
      lampMetal: new MeshStandardMaterial({ color: "#c9a25a", metalness: 0.8, roughness: 0.3 }),
      bulb: new MeshBasicMaterial({ color: "#ffe2b0", toneMapped: false }),
    }),
    [shelfModel, counterModel],
  );
  useEffect(
    () => () => {
      for (const g of [...Object.values(lining), strips, counter, ...Object.values(lamp)])
        g.dispose();
      for (const m of Object.values(materials)) m.dispose();
    },
    [lining, strips, counter, lamp, materials],
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
      <Shelves material={materials.shelves} />
      <mesh geometry={strips} material={materials.strips} />
      <Books shop={shop} />
      <mesh geometry={counter} material={materials.counter} />
      <mesh
        geometry={counterModel.geometry}
        material={materials.counterModel}
        position={[4.0, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={COUNTER_SCALE}
      />
      <mesh geometry={lamp.pole} material={materials.lampMetal} />
      <mesh geometry={lamp.shade} material={materials.lampMetal} />
      <mesh geometry={lamp.bulb} material={materials.bulb} />
      <FeaturedDisplay title={title} glow={glow} />
      <Console alert={alert} />
      <pointLight
        position={[-3.5, 4.2, -1.5]}
        intensity={light}
        distance={13}
        decay={1.5}
        color="#ffd6a6"
      />
      <pointLight
        position={[5.6, 4.2, -0.5]}
        intensity={light}
        distance={13}
        decay={1.5}
        color="#ffd6a6"
      />
      <pointLight
        position={[-1.5, 4.2, 3]}
        intensity={light * 0.9}
        distance={11}
        decay={1.5}
        color="#c8bfff"
      />
    </>
  );
}
