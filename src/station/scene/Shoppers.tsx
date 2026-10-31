import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { AnimationMixer, Box3, Group, Quaternion, Vector3, type AnimationClip, type Mesh, type MeshStandardMaterial } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { Bookshop } from "./bookshop";
import { setWalking, startIdling, type Figure } from "./figures";
import { modelUrl } from "./models";
import { kept } from "./world";
import { MAX_SHOPPERS } from "../scene-params";

// Browsing customers: four generated, rigged residents with walk and idle
// motions, shared out among the shoppers. Each walks between browsing spots
// and stops at each for a while. Figure 0 is the keeper behind the counter;
// the rest come and go with the shop's busyness. Now and then a shopper walks off with a book and sets
// it down wherever they stop next, or leaves one leaning; the robots tidy up.

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
/** The chance a shopper leaving a spot takes a book with them, and that they leave one leaning. */
const TAKE_CHANCE = 0.35;
const LEAN_CHANCE = 0.25;
const Y_AXIS = new Vector3(0, 1, 0);

const VARIANTS = ["shopper-teal", "shopper-coral", "shopper-lavender", "shopper-cardigan"] as const;
/** The keeper wears the cardigan. */
const KEEPER_VARIANT = 3;
const HEIGHT = 1.7;


interface Walker {
  from: number;
  to: number;
  /** Seconds spent walking to `to`, then browsing there. */
  walk: number;
  browse: number;
  started: number;
  /** The stray book they're holding (a bookshop slot), or -1. */
  carrying: number;
}

const randomSpot = (not: number) => {
  let next = not;
  while (next === not) next = Math.floor(Math.random() * SPOTS.length);
  return next;
};

function plan(from: number, to: number, now: number): Walker {
  const [ax, az] = SPOTS[from]!;
  const [bx, bz] = SPOTS[to]!;
  return { from, to, walk: Math.hypot(bx - ax, bz - az) / SPEED, browse: 3 + Math.random() * 6, started: now, carrying: -1 };
}

/** The keeper and the shoppers, each a clone of a variant's rigged model with its own motions. */
function makeFigures(variants: { scene: Group; animations: AnimationClip[] }[]): Figure[] {
  // Their textures glow faintly, so they read in the shop's low light.
  for (const v of variants) {
    v.scene.traverse((o) => {
      const material = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (!material?.isMeshStandardMaterial) return;
      material.emissive.set("#ffffff");
      material.emissiveMap = material.map;
      material.emissiveIntensity = 0.18;
    });
  }
  const figures = Array.from({ length: MAX_SHOPPERS + 1 }, (_, i) => {
    const source = variants[i === 0 ? KEEPER_VARIANT : (i - 1) % VARIANTS.length]!;
    const body = cloneSkinned(source.scene);
    const bounds = new Box3().setFromObject(body);
    const scale = HEIGHT / (bounds.max.y - bounds.min.y);
    body.scale.setScalar(scale);
    body.position.y = -bounds.min.y * scale;
    body.traverse((o) => (o.frustumCulled = false));
    const root = new Group();
    root.add(body);
    const mixer = new AnimationMixer(body);
    const clip = (name: string) => source.animations.find((a) => a.name.toLowerCase().includes(name)) ?? source.animations[0]!;
    const walk = mixer.clipAction(clip("walk"));
    const idle = mixer.clipAction(clip("idle"));
    return { root, mixer, walk, idle, walking: false };
  });
  startIdling(figures);
  return figures;
}

export function Shoppers({ count, shop }: { count: number; shop: Bookshop }) {
  const variants = useGLTF(VARIANTS.map(modelUrl), false);
  // The residents and where they're headed outlive the canvas (see world.ts).
  const figures = useMemo(() => kept("shoppers", () => makeFigures(variants)), [variants]);
  const walkers = useMemo(
    () =>
      kept("walkers", () =>
        Array.from({ length: MAX_SHOPPERS }, (_, i) => {
          const from = i % SPOTS.length;
          // Start partway through browsing, so they don't all move at once.
          return { ...plan(from, from, 0), browse: Math.random() * 6 };
        }),
      ),
    [],
  );
  const hand = useMemo(() => ({ at: new Vector3(), turn: new Quaternion() }), []);

  useFrame(({ clock }, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1);
    const now = clock.elapsedTime;
    const keeper = figures[0]!;
    keeper.root.position.set(KEEPER[0], 0, KEEPER[1]);
    keeper.root.rotation.set(0, KEEPER[2] + Math.sin(now * 0.4) * 0.3, 0);
    keeper.mixer.update(delta);
    for (let i = 0; i < count; i++) {
      let w = walkers[i]!;
      if (now - w.started > w.walk + w.browse) {
        const [sx, sz] = SPOTS[w.to]!;
        const next = plan(w.to, randomSpot(w.to), now);
        if (Math.random() < TAKE_CHANCE) next.carrying = shop.take(sx, sz);
        if (Math.random() < LEAN_CHANCE) shop.lean(sx, sz);
        w = walkers[i] = next;
      }
      const t = Math.min(1, (now - w.started) / Math.max(w.walk, 0.001));
      const [ax, az] = SPOTS[w.from]!;
      const [bx, bz, facing] = SPOTS[w.to]!;
      const walking = t < 1;
      const heading = Math.atan2(bx - ax, bz - az);
      const f = figures[i + 1]!;
      f.root.visible = true;
      f.root.position.set(ax + (bx - ax) * t, 0, az + (bz - az) * t);
      f.root.rotation.set(0, walking ? heading : facing, 0);
      setWalking(f, walking);
      f.mixer.update(delta);
      if (w.carrying >= 0) {
        if (walking) {
          hand.at.set(f.root.position.x + Math.sin(heading) * 0.3, 0.95, f.root.position.z + Math.cos(heading) * 0.3);
          shop.hold(w.carrying, hand.at, hand.turn.setFromAxisAngle(Y_AXIS, heading));
        } else {
          shop.setDown(w.carrying, bx, bz, heading);
          w.carrying = -1;
        }
      }
    }
    // Anyone who has left the shop puts down what they were holding.
    for (let i = count; i < MAX_SHOPPERS; i++) {
      figures[i + 1]!.root.visible = false;
      const w = walkers[i]!;
      if (w.carrying < 0) continue;
      const [bx, bz, facing] = SPOTS[w.to]!;
      shop.setDown(w.carrying, bx, bz, facing);
      w.carrying = -1;
    }
  });

  return (
    <>
      {figures.map((f, i) => (
        <primitive key={i} object={f.root} />
      ))}
    </>
  );
}
