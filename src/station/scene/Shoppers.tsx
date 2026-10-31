import type { CrowdAgent } from "@recast-navigation/core";
import { useFrame } from "@react-three/fiber";
import { use, useMemo } from "react";
import { AnimationMixer, Box3, Group, Quaternion, Vector3, type AnimationClip, type Mesh, type MeshStandardMaterial } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { Bookshop } from "./bookshop";
import { setWalking, startIdling, type Figure } from "./figures";
import { useStationModels } from "./loading";
import { modelUrl } from "./models";
import { addShopper, KEEPER, navigation, pickSpot, SPOTS } from "./navigation";
import { kept } from "./world";
import { MAX_SHOPPERS } from "../scene-params";

// Browsing customers: four generated, rigged residents with walk and idle
// motions, shared out among the shoppers. Each walks between browsing spots
// and stops at each for a while: round the counter, shelves and tables, and
// round each other, steered by the shop's navigation crowd (navigation.ts);
// a spot is one shopper's at a time. Figure 0 is the keeper behind the counter;
// the rest come and go with the shop's busyness. Now and then a shopper walks off with a book and sets
// it down wherever they stop next, or leaves one leaning; the robots tidy up.

/** The chance a shopper leaving a spot takes a book with them, and that they leave one leaning. */
const TAKE_CHANCE = 0.35;
const LEAN_CHANCE = 0.25;
const Y_AXIS = new Vector3(0, 1, 0);

const VARIANTS = ["shopper-teal", "shopper-coral", "shopper-lavender", "shopper-cardigan"] as const;
/** The keeper wears the cardigan. */
const KEEPER_VARIANT = 3;
const HEIGHT = 1.7;


/** A shopper: the spot they're at or heading for (theirs alone), and their place in the crowd. */
interface Walker {
  spot: number;
  /** Their agent in the navigation crowd, while they're in the shop. */
  agent: CrowdAgent | null;
  /** When they'll move on, once they're browsing (scene seconds); null while walking. */
  browseUntil: number | null;
  /** The stray book they're holding (a bookshop slot), or -1. */
  carrying: number;
  /** Which way they face, turning smoothly. */
  heading: number;
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
  const variants = useStationModels(VARIANTS.map(modelUrl));
  // The residents and where they're headed outlive the canvas (see world.ts).
  const figures = useMemo(() => kept("shoppers", () => makeFigures(variants)), [variants]);
  // Everyone walks the shop's navigation mesh, in one crowd, round the fixtures and each other.
  const { crowd } = use(navigation());
  const walkers = useMemo(
    () =>
      kept("walkers", () =>
        Array.from({ length: MAX_SHOPPERS }, (_, i): Walker => ({
          spot: i % SPOTS.length,
          agent: null,
          // Start partway through browsing, so they don't all move at once.
          browseUntil: Math.random() * 6,
          carrying: -1,
          heading: SPOTS[i % SPOTS.length]![2],
        })),
      ),
    [],
  );
  // Each spot is one shopper's at a time: whoever's at it or on the way.
  const claimed = useMemo(() => kept("claimed spots", () => new Set<number>()), []);
  const hand = useMemo(() => ({ at: new Vector3(), turn: new Quaternion() }), []);

  useFrame(({ clock }, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1);
    const now = clock.elapsedTime;
    const keeper = figures[0]!;
    keeper.root.position.set(KEEPER[0], 0, KEEPER[1]);
    keeper.root.rotation.set(0, KEEPER[2] + Math.sin(now * 0.4) * 0.3, 0);
    keeper.mixer.update(delta);
    for (let i = 0; i < count; i++) {
      const w = walkers[i]!;
      if (!w.agent) {
        // Coming in: at their own spot, or a free one if someone else has it.
        if (claimed.has(w.spot)) w.spot = pickSpot(w.spot, claimed);
        claimed.add(w.spot);
        w.agent = addShopper(crowd, w.spot);
      }
      const at = w.agent.position();
      const [sx, sz, facing] = SPOTS[w.spot]!;
      const there = Math.hypot(at.x - sx, at.z - sz) < 0.2;
      if (there && w.browseUntil === null) {
        // Arrived: put down whatever they brought, and browse a while.
        w.browseUntil = now + 3 + Math.random() * 6;
        if (w.carrying >= 0) shop.setDown(w.carrying, sx, sz, w.heading);
        w.carrying = -1;
      } else if (there && w.browseUntil !== null && now > w.browseUntil) {
        // Moving on, to a spot nobody else has, perhaps with a book, perhaps leaving one leaning.
        if (Math.random() < TAKE_CHANCE) w.carrying = shop.take(sx, sz);
        if (Math.random() < LEAN_CHANCE) shop.lean(sx, sz);
        claimed.delete(w.spot);
        w.spot = pickSpot(w.spot, claimed);
        claimed.add(w.spot);
        const [tx, tz] = SPOTS[w.spot]!;
        w.agent.requestMoveTarget({ x: tx, y: 0, z: tz });
        w.browseUntil = null;
      }
      const velocity = w.agent.velocity();
      const walking = Math.hypot(velocity.x, velocity.z) > 0.15;
      const want = walking ? Math.atan2(velocity.x, velocity.z) : facing;
      w.heading += Math.atan2(Math.sin(want - w.heading), Math.cos(want - w.heading)) * Math.min(1, delta * 6);
      const f = figures[i + 1]!;
      f.root.visible = true;
      f.root.position.set(at.x, 0, at.z);
      f.root.rotation.set(0, w.heading, 0);
      setWalking(f, walking);
      f.mixer.update(delta);
      if (w.carrying >= 0) {
        hand.at.set(at.x + Math.sin(w.heading) * 0.3, 0.95, at.z + Math.cos(w.heading) * 0.3);
        shop.hold(w.carrying, hand.at, hand.turn.setFromAxisAngle(Y_AXIS, w.heading));
      }
    }
    // Anyone who has left the shop puts down what they were holding, and gives up their spot.
    for (let i = count; i < MAX_SHOPPERS; i++) {
      figures[i + 1]!.root.visible = false;
      const w = walkers[i]!;
      if (!w.agent) continue;
      const at = w.agent.position();
      if (w.carrying >= 0) shop.setDown(w.carrying, at.x, at.z, w.heading);
      w.carrying = -1;
      crowd.removeAgent(w.agent);
      w.agent = null;
      claimed.delete(w.spot);
    }
    // The crowd steps no further than the frame does (the scene's 0.1 s cap).
    crowd.update(delta);
  });

  return (
    <>
      {figures.map((f, i) => (
        <primitive key={i} object={f.root} />
      ))}
    </>
  );
}
