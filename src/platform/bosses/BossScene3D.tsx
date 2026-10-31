import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  MathUtils,
  AnimationMixer,
  Box3,
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Plane,
  PointLight,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { BOSSES, type BossId } from "./bosses";
import { BossLayout } from "./BossLayout";
import type { BossSceneProps } from "./BossScene2D";
import styles from "./BossScene3D.module.css";

// The bosses standing together in 3D: each one a generated Tripo robot
// (public/models/bosses/provenance.json), on the floor of the same fixed
// layout as the 2D scene (BossLayout), so the bubbles, keyboard, screen
// readers and focus model don't change. Each robot stands under its column;
// opening a bubble moves nobody (David: "without the robots changing
// position"): the open boss leans in, glows and talks where it stands. The
// robots move only if the columns do, when the scene is resized. Clicking a
// robot opens its bubble, as in 2D. The canvas is see-through, so the room
// behind it is the 2D scene's. Loaded only on Decide, once the browser has
// shown it can draw WebGL 2.

export interface BossScene3DProps extends BossSceneProps {
  /** Still poses: no idling, leaning or bobbing. */
  reducedMotion: boolean;
  /** Called once its bubbles are up. */
  onShown?: () => void;
}

/**
 * Each boss's model, its height in the scene (the Administrator, the
 * tallest, is 1), and, for the drone, how far it hovers off the floor. The
 * same shares as the 2D cutouts (research/station-assets/boss-figures.py).
 */
const MODELS: Record<BossId, { height: number; hover?: number }> = {
  overall: { height: 1 },
  profit: { height: 0.74 },
  culture: { height: 0.9 },
  happiness: { height: 0.34, hover: 0.36 },
  readers: { height: 0.86 },
};
const modelUrl = (boss: BossId) => `/models/bosses/${boss}.glb`;

/** How far the open boss leans in and grows, where it stands. */
const LEAN = 0.14;
const GROW = 0.03;
/** How far each boss turns toward the middle of the line-up, per place from it. */
const TURN = 0.12;
/** The Commerce Office is seven of the same unit: six faint copies stand behind the front one. */
const COPIES: [number, number][] = [
  [-0.2, -0.35],
  [0.2, -0.35],
  [-0.32, -0.7],
  [0, -0.7],
  [0.32, -0.7],
  [0, -1.05],
];

export default function BossScene3D({ bubbles, open, onSelect, reducedMotion, onShown }: BossScene3DProps) {
  const columns = useRef<(HTMLLIElement | null)[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => onShown?.(), [onShown]);
  // The same list while the bubbles are, so the robots are made once.
  const bosses = useMemo(() => bubbles.map((b) => b.boss), [bubbles]);
  const floor = (
    <div ref={stage} className={styles.stage} aria-hidden="true">
      <Canvas dpr={[1, 1.75]} camera={{ fov: FOV, near: 0.1, far: 30, position: [0, 0.6, 2.35] }} gl={{ antialias: true, alpha: true }}>
        <CameraFit stage={stage} />
        <hemisphereLight args={["#c9d0ff", "#2a2140", 1.1]} />
        <directionalLight position={[1.5, 3, 4]} intensity={1.6} color="#fff3e2" />
        {/* The models load here, inside the canvas: the bubbles are up already. */}
        <Suspense fallback={null}>
          <Bosses bosses={bosses} open={open} onSelect={onSelect} columns={columns} stage={stage} reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
  return (
    <BossLayout
      bubbles={bubbles}
      open={open}
      onSelect={onSelect}
      floor={floor}
      columnRef={(i) => (el) => {
        columns.current[i] = el;
      }}
    />
  );
}

/**
 * Frames the robots to the floor they stand on, whatever its size: feet on its bottom edge, and the top
 * of the tallest (the open boss grows a little) `--robot-headroom` below its top (CSS, on the stage or
 * the floor; 12 px unless set), so the layout can keep room for name chips over their heads.
 */
function CameraFit({ stage }: { stage: RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const headroom = parseFloat(stage.current ? getComputedStyle(stage.current).getPropertyValue("--robot-headroom") : "") || 12;
    const fit = fitCamera(size.height, headroom, size.width / COLUMNS);
    camera.position.set(0, fit.height, fit.distance);
    camera.rotation.set(-PITCH, 0, 0);
    camera.updateMatrixWorld(true);
  }, [camera, size.height, size.width, stage]);
  return null;
}

/** The camera's field of view, and how far it looks down at the robots. */
const FOV = 30;
const PITCH = 0.08;
/** Feet sit this many pixels above the floor's bottom edge, and no boss comes nearer its sides than EDGE. */
const FEET = 4;
const EDGE = 8;
/** The top of the tallest robot as the open boss reaches it (it grows a little), so no boss rises
    under the name chips the layout keeps in the headroom. */
const TALLEST = 1 + GROW;
/** How wide two neighbouring bosses are on average (in tallest-boss heights, measured from the models): at
    most one column apart without crowding, and the Administrator, at the end, narrower than that. */
const WIDEST = 0.45;
const COLUMNS = 5;

/**
 * Where the camera stands (height and distance from the robots' line, at a fixed pitch) so that, in a
 * floor `height` px tall, the floor line (y = 0) sits FEET px above the bottom and TALLEST sits
 * `headroom` px below the top, or lower if a `column` px wide couldn't hold the widest boss at that size. For a point at height y on the line, with Y = y - camera height and
 * the camera d away, looking down by p, its screen height is (Y cos p + d sin p) / ((d cos p - Y sin p) tan);
 * so each condition fixes Y / d, and the two together fix d.
 */
export function fitCamera(height: number, headroom: number, column = Infinity) {
  const t = Math.tan(MathUtils.degToRad(FOV / 2));
  const along = (ndc: number) => (ndc * t * Math.cos(PITCH) - Math.sin(PITCH)) / (Math.cos(PITCH) + ndc * t * Math.sin(PITCH));
  // As tall as the floor allows, unless the widest boss would then overflow its column (and the first
  // and last their edges of the scene): then a little smaller, keeping the feet where they are.
  const tall = Math.min(height - FEET - Math.min(headroom, height * 0.4), (column * TALLEST) / WIDEST);
  const bottom = along(-1 + (2 * FEET) / height);
  const top = along(1 - (2 * (height - FEET - tall)) / height);
  const distance = TALLEST / (top - bottom);
  return { distance, height: -distance * bottom };
}

interface Figure {
  root: Group;
  mixers: AnimationMixer[];
  /** The front unit's motions, if it's rigged. */
  actions: { idle: AnimationAction; talk: AnimationAction } | null;
  playing: AnimationAction | null;
  /** Materials and geometry made for this figure (its hit box, the faint copies'), to free when it goes. */
  owned: { dispose(): void }[];
  /** Half its width as it stands (turned a little), in scene units, so it can be kept inside the scene's edges. */
  halfWidth: number;
}

function Bosses({
  bosses,
  open,
  onSelect,
  columns,
  stage,
  reducedMotion,
}: {
  bosses: BossId[];
  open: number;
  onSelect: BossSceneProps["onSelect"];
  columns: RefObject<(HTMLLIElement | null)[]>;
  stage: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
}) {
  const models = useGLTF(bosses.map(modelUrl), false);
  const figures = useMemo(
    () => bosses.map((boss, i) => makeFigure(boss, models[i]!, (bosses.length - 1) / 2 - i)),
    [bosses, models],
  );
  useEffect(() => () => figures.forEach((f) => f.owned.forEach((m) => m.dispose())), [figures]);
  const { gl } = useThree();
  const hovered = useRef(-1);
  const work = useMemo(
    () => ({ ray: new Raycaster(), ndc: new Vector2(), plane: new Plane(new Vector3(0, 0, 1), 0), at: new Vector3(), screen: new Vector3(), placed: "" }),
    [],
  );
  const glow = useRef<Group>(null);
  const hover = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const ringGeometry = useMemo(() => new RingGeometry(0.2, 0.34, 48).rotateX(-Math.PI / 2), []);
  const rings = useMemo(
    () => [0.55, 0.22].map((opacity) => new MeshBasicMaterial({ transparent: true, opacity, blending: AdditiveBlending, depthWrite: false })),
    [],
  );
  useEffect(
    () => () => {
      rings.forEach((m) => m.dispose());
      ringGeometry.dispose();
    },
    [rings, ringGeometry],
  );

  useFrame(({ camera, clock }, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1);
    const t = clock.elapsedTime;
    const box = gl.domElement.getBoundingClientRect();
    const placed: number[] = [];
    figures.forEach((f, i) => {
      const focused = i === open;
      const root = f.root;
      // Under the middle of its column. The columns are fixed, so this changes only on a resize.
      const column = columns.current?.[i]?.getBoundingClientRect();
      if (column && box.width > 0) {
        work.ndc.set(((column.left + column.width / 2 - box.left) / box.width) * 2 - 1, -1 + (2 * FEET) / box.height);
        work.ray.setFromCamera(work.ndc, camera);
        if (work.ray.ray.intersectPlane(work.plane, work.at)) root.position.x = work.at.x;
        // The bosses at the ends step in just enough to stand wholly inside the scene.
        for (const edge of [-1, 1]) {
          work.ndc.set(edge * (1 - (2 * EDGE) / box.width), work.ndc.y);
          work.ray.setFromCamera(work.ndc, camera);
          if (!work.ray.ray.intersectPlane(work.plane, work.at)) continue;
          // By its size at rest, so the open boss growing never moves anyone (it stays inside the EDGE margin).
          const limit = work.at.x - edge * f.halfWidth;
          root.position.x = edge < 0 ? Math.max(root.position.x, limit) : Math.min(root.position.x, limit);
        }
      }
      // Where it stands on the page, for anyone checking that nobody moved.
      work.screen.set(root.position.x, 0, 0).project(camera);
      placed.push(Math.round(((work.screen.x + 1) / 2) * box.width), Math.round(((1 - work.screen.y) / 2) * box.height));
      // The open boss leans in, a little bigger, where it stands; the rest stand easy.
      const lean = focused ? LEAN : 0;
      const grow = 1 + (focused ? GROW : 0);
      const ease = reducedMotion ? 1 : Math.min(1, delta * 6);
      root.rotation.x += (lean - root.rotation.x) * ease;
      root.scale.setScalar(root.scale.x + (grow - root.scale.x) * ease);
      if (f.actions) play(f, focused ? f.actions.talk : f.actions.idle, reducedMotion);
      else if (!reducedMotion) {
        // The Administrator and the drone aren't rigged: they bob, faster while they talk.
        const hover = MODELS[bosses[i]!].hover ?? 0;
        root.position.y = (hover ? 0.03 : 0.008) * Math.sin(t * (focused ? 3.2 : 1.6) + i);
      }
      if (!reducedMotion) for (const m of f.mixers) m.update(delta);
    });
    const where = placed.join(",");
    // And how high the tallest stands (px from the stage's top), for the layout and the tests.
    work.screen.set(0, TALLEST, 0).project(camera);
    const tallest = String(Math.round(((1 - work.screen.y) / 2) * box.height));
    if (stage.current && stage.current.dataset.tallest !== tallest) stage.current.dataset.tallest = tallest;
    if (where !== work.placed && stage.current) {
      work.placed = where;
      stage.current.dataset.robots = where;
    }
    // The open boss's tint pools at its feet; a hovered one gets a fainter pool of its own.
    const place = (ring: Group | null, i: number) => {
      const f = figures[i];
      if (!ring) return;
      ring.visible = Boolean(f);
      if (!f) return;
      ring.position.set(f.root.position.x, 0.005, 0);
    };
    place(glow.current, open);
    place(hover.current, hovered.current === open ? -1 : hovered.current);
    const tint = BOSSES[bosses[open]!]?.tint;
    if (tint && light.current) {
      rings[0]!.color.set(tint);
      light.current.color.set(tint);
      light.current.intensity = reducedMotion ? 2.2 : 2 + 0.4 * Math.sin(t * 2.4);
    }
    const hoverTint = BOSSES[bosses[hovered.current]!]?.tint;
    if (hoverTint) rings[1]!.color.set(hoverTint);
  });

  return (
    <>
      {figures.map((f, i) => (
        <primitive
          key={bosses[i]}
          object={f.root}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation();
            onSelect(i, "click");
          }}
          onPointerOver={(event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation();
            hovered.current = i;
            gl.domElement.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            if (hovered.current === i) hovered.current = -1;
            gl.domElement.style.cursor = "";
          }}
        />
      ))}
      <group ref={glow}>
        <mesh geometry={ringGeometry} material={rings[0]} />
        <pointLight ref={light} position={[0, 0.9, 0.35]} distance={2.2} decay={1.4} />
      </group>
      <group ref={hover}>
        <mesh geometry={ringGeometry} material={rings[1]} />
      </group>
    </>
  );
}

/** Crossfades a rigged boss into `to`, or poses it there at once with reduced motion. */
function play(f: Figure, to: AnimationAction, still: boolean) {
  if (f.playing === to) return;
  const from = f.playing;
  f.playing = to;
  to.reset().play();
  if (from && !still) from.crossFadeTo(to, 0.25, false);
  else from?.stop();
  if (still) f.mixers[0]!.update(0);
}

/** A boss's robot, scaled to its share of the line-up, turned a little toward the middle. */
function makeFigure(boss: BossId, model: { scene: Group; animations: AnimationClip[] }, fromMiddle: number): Figure {
  const { height, hover = 0 } = MODELS[boss];
  const unit = () => {
    const body = cloneSkinned(model.scene);
    const bounds = new Box3().setFromObject(body);
    const scale = height / (bounds.max.y - bounds.min.y);
    body.scale.setScalar(scale);
    body.position.set(-((bounds.min.x + bounds.max.x) / 2) * scale, hover - bounds.min.y * scale, -((bounds.min.z + bounds.max.z) / 2) * scale);
    body.traverse((o) => (o.frustumCulled = false));
    return body;
  };
  const root = new Group();
  const front = unit();
  root.add(front);
  // An unseen box round the robot takes clicks and hovers for it, as the 2D figure's whole box does:
  // a slender robot is otherwise all gaps.
  const bounds = new Box3().setFromObject(front);
  const size = bounds.getSize(new Vector3());
  const hitGeometry = new BoxGeometry(Math.max(size.x, 0.3), size.y, Math.max(size.z, 0.3));
  const hitMaterial = new MeshBasicMaterial({ visible: false });
  const hit = new Mesh(hitGeometry, hitMaterial);
  bounds.getCenter(hit.position);
  root.add(hit);
  root.rotation.y = fromMiddle * TURN;
  const clip = (name: string) => model.animations.find((a) => a.name === name);
  const mixers: AnimationMixer[] = [];
  const owned: { dispose(): void }[] = [hitMaterial];
  let actions: Figure["actions"] = null;
  const idle = clip("idle");
  if (idle) {
    const mixer = new AnimationMixer(front);
    mixers.push(mixer);
    actions = {
      idle: mixer.clipAction(idle),
      talk: mixer.clipAction(clip("agree") ?? idle),
    };
    actions.idle.play();
    actions.idle.time = Math.random() * idle.duration;
    mixer.update(0);
  }
  if (boss === "profit") {
    for (const [x, z] of COPIES) {
      const copy = unit();
      copy.position.x += x;
      copy.position.z += z;
      owned.push(...faint(copy));
      root.add(copy);
      if (idle) {
        const mixer = new AnimationMixer(copy);
        const action = mixer.clipAction(idle);
        action.play();
        action.time = Math.random() * idle.duration;
        mixer.update(0);
        mixers.push(mixer);
      }
    }
  }
  owned.push(hitGeometry);
  const turned = new Box3().setFromObject(root);
  return { root, mixers, actions, playing: actions?.idle ?? null, owned, halfWidth: Math.max(-turned.min.x, turned.max.x) };
}

/** Fades a copy back, as the portrait does with the Commerce Office's other six units; returns its new materials. */
function faint(object: Object3D): Material[] {
  const dim = new Color("#3a3f66");
  const made: Material[] = [];
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = (mesh.material as Material & { color?: Color }).clone() as Material & { color?: Color };
    material.transparent = true;
    material.opacity = 0.3;
    material.depthWrite = false;
    material.color?.lerp(dim, 0.4);
    mesh.material = material;
    made.push(material);
  });
  return made;
}

for (const boss of Object.keys(MODELS) as BossId[]) useGLTF.preload(modelUrl(boss), false);
