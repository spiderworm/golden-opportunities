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
  type Camera,
  type Material,
  type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { BOSSES, type BossId } from "./bosses";
import { failedLoad, softFailFor, type Failed } from "./soft-load";
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
  /** BossLayout's columns, which each boss stands under (BossBriefing keeps the layout, this scene its floor). */
  columns: RefObject<(HTMLLIElement | null)[]>;
  /** Still poses: no idling, leaning or bobbing. */
  reducedMotion: boolean;
  /** Called once its bubbles are up. */
  onShown?: () => void;
  /** A model didn't arrive: the scene draws nothing, and BossBriefing shows the 2D one. */
  onFailed?: () => void;
}

type Loaded = { scene: Group; animations: AnimationClip[] } | Failed;

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
// Its loads, and only its, fail quietly (soft-load.ts).
const softFail = softFailFor((Object.keys(MODELS) as BossId[]).map(modelUrl));

/** How far the open boss leans in and grows, where it stands. */
const LEAN = 0.14;
const GROW = 0.03;
/** The Commerce Office is seven of the same unit: six faint copies queue close behind the front one,
    peeking out a little on either side, so it keeps nearly its own width in its column. */
const COPIES: [number, number][] = [
  [-0.04, -0.3],
  [0.04, -0.3],
  [-0.06, -0.6],
  [0, -0.6],
  [0.06, -0.6],
  [0, -0.9],
];

/** The 3D bosses on BossLayout's floor, under the columns it gives them. */
export default function BossScene3D({ bubbles, open, onSelect, columns, reducedMotion, onShown, onFailed }: BossScene3DProps) {
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => onShown?.(), [onShown]);
  // The same list while the bubbles are, so the robots are made once.
  const bosses = useMemo(() => bubbles.map((b) => b.boss), [bubbles]);
  return (
    <div ref={stage} className={styles.stage} aria-hidden="true">
      <Canvas dpr={[1, 1.75]} camera={{ fov: FOV, near: 0.1, far: 30, position: [0, 0.6, 2.35] }} gl={{ antialias: true, alpha: true }}>
        <CameraFit stage={stage} />
        <hemisphereLight args={["#c9d0ff", "#2a2140", 1.1]} />
        <directionalLight position={[1.5, 3, 4]} intensity={1.6} color="#fff3e2" />
        {/* The models load here, inside the canvas: the bubbles are up already. */}
        <Suspense fallback={null}>
          <Bosses bosses={bosses} open={open} onSelect={onSelect} columns={columns} stage={stage} reducedMotion={reducedMotion} onFailed={onFailed} />
        </Suspense>
      </Canvas>
    </div>
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
    const fit = fitCamera(size.height, headroom);
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
/** The top of the tallest robot at rest: the 2D cutouts' rule, so both scenes stand them the same size.
    The open boss grows a little into the headroom, as its 2D cutout does. */
const TALLEST = 1;


/**
 * Where the camera stands (height and distance from the robots' line, at a fixed pitch) so that, in a
 * floor `height` px tall, the floor line (y = 0) sits FEET px above the bottom and TALLEST sits
 * `headroom` px below the top. For a point at height y on the line, with Y = y - camera height and
 * the camera d away, looking down by p, its screen height is (Y cos p + d sin p) / ((d cos p - Y sin p) tan);
 * so each condition fixes Y / d, and the two together fix d.
 */
export function fitCamera(height: number, headroom: number) {
  const t = Math.tan(MathUtils.degToRad(FOV / 2));
  const along = (ndc: number) => (ndc * t * Math.cos(PITCH) - Math.sin(PITCH)) / (Math.cos(PITCH) + ndc * t * Math.sin(PITCH));
  const tall = height - FEET - Math.min(headroom, height * 0.4);
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
  /** Points on the front unit's surface at scale 1, standing at x = 0, to keep it within its column. */
  points: Vector3[];
  /** The Commerce Office's faint copies, where they stand in the queue behind it, and points on each. */
  copies: { unit: Object3D; x: number; z: number; points: Vector3[] }[];
  /** Its scale at rest and open (1 and 1 + GROW, or less if that would be wider than its column), its span on
      the page at each ([left, right], px), and the layout they were sized for. */
  rest: number;
  open: number;
  spans: { rest: [number, number]; open: [number, number] };
  sizedFor: string;
}

function Bosses({
  bosses,
  open,
  onSelect,
  columns,
  stage,
  reducedMotion,
  onFailed,
}: {
  bosses: BossId[];
  open: number;
  onSelect: BossSceneProps["onSelect"];
  columns: RefObject<(HTMLLIElement | null)[]>;
  stage: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
  onFailed?: () => void;
}) {
  const urls = useMemo(() => bosses.map(modelUrl), [bosses]);
  const models = useGLTF(urls, false, undefined, softFail) as unknown as Loaded[];
  const failed = models.some(failedLoad);
  const figures = useMemo(
    () => (failed ? [] : bosses.map((boss, i) => makeFigure(boss, models[i] as Exclude<Loaded, Failed>))),
    [bosses, models, failed],
  );
  // Forgotten, so the next visit to Decide loads them afresh rather than failing again from the cache.
  useEffect(() => {
    if (!failed) return;
    useGLTF.clear(urls);
    onFailed?.();
  }, [failed, urls, onFailed]);
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
    const spans: number[] = [];
    let opened = "";
    figures.forEach((f, i) => {
      const focused = i === open;
      const root = f.root;
      const column = columns.current?.[i]?.getBoundingClientRect();
      if (column && box.width > 0) {
        // Its column, kept EDGE px inside the scene at the ends.
        const left = Math.max(column.left, box.left + EDGE);
        const right = Math.min(column.right, box.right - EDGE);
        const atFeet = (px: number) => {
          work.ndc.set(((px - box.left) / box.width) * 2 - 1, -1 + (2 * FEET) / box.height);
          work.ray.setFromCamera(work.ndc, camera);
          return work.ray.ray.intersectPlane(work.plane, work.at) ? work.at.x : 0;
        };
        // Under the middle of it, and no wider than it (Goldy's no-overlap ruling, as in 2D). Its width is
        // measured on the page from points on the robot itself, since perspective spreads a boss far from the
        // middle more than its size: a boss that would be wider stands smaller, and the open one steps forward
        // only as far as its column allows, as its 2D cutout does. Only a resize changes this.
        const x = atFeet((left + right) / 2);
        root.position.x = x;
        const layout = `${left},${right},${box.left},${box.width},${box.height}`;
        if (f.sizedFor !== layout) {
          f.sizedFor = layout;
          const middle = (left + right) / 2 - box.left;
          const room = (right - left) / 2;
          // Perspective draws the Commerce Office's copies, further back, toward the middle of the scene: each
          // steps out just enough to stand straight behind the front unit on the page, its queue in its column.
          const near = camera.position.z;
          const place = (scale: number) => {
            for (const c of f.copies) c.unit.position.x = c.x + ((x + scale * c.x) * -c.z) / near;
          };
          const span = (scale: number): [number, number] => {
            place(scale);
            let [from, to] = extent(f.points, x, scale, camera, box.width, work);
            for (const c of f.copies) {
              const [l, r] = extent(c.points, x + (c.unit.position.x - c.x) * scale, scale, camera, box.width, work);
              from = Math.min(from, l);
              to = Math.max(to, r);
            }
            return [from, to];
          };
          const reach = (scale: number) => {
            const [from, to] = span(scale);
            return Math.max(middle - from, to - middle);
          };
          const size = (cap: number) => {
            let scale = Math.min(cap, room / reach(1));
            // Scaling it nearer the camera widens it a little more than in proportion: a few more steps.
            for (let step = 0; step < 4; step++) scale *= Math.min(1, room / reach(scale));
            return scale;
          };
          // Sized standing up: its lean only tips it a little toward the camera.
          f.rest = size(1);
          f.open = size(1 + GROW);
          f.spans = { rest: span(f.rest), open: span(f.open) };
          // The copies stand placed for the scale it's at most of the time.
          place(f.rest);
        }
        // Its span on the page as it stands (at rest), and the open one's, for anyone checking that no boss
        // reaches into a neighbour's column.
        spans.push(...f.spans.rest.map(Math.round));
        if (focused) opened = f.spans.open.map(Math.round).join(",");
      }
      // Where it stands on the page, for anyone checking that nobody moved.
      work.screen.set(root.position.x, 0, 0).project(camera);
      placed.push(Math.round(((work.screen.x + 1) / 2) * box.width), Math.round(((1 - work.screen.y) / 2) * box.height));
      // The open boss leans in, a little bigger, where it stands; the rest stand easy.
      const lean = focused ? LEAN : 0;
      const ease = reducedMotion ? 1 : Math.min(1, delta * 6);
      root.rotation.x += (lean - root.rotation.x) * ease;
      const scale = focused ? f.open : f.rest;
      root.scale.setScalar(root.scale.x + (scale - root.scale.x) * ease);
      if (f.actions) play(f, focused ? f.actions.talk : f.actions.idle, reducedMotion);
      else if (!reducedMotion) {
        // The Administrator and the drone aren't rigged: they bob, faster while they talk.
        const hover = MODELS[bosses[i]!].hover ?? 0;
        root.position.y = (hover ? 0.03 : 0.008) * Math.sin(t * (focused ? 3.2 : 1.6) + i);
      }
      if (!reducedMotion) for (const m of f.mixers) m.update(delta);
    });
    const where = placed.join(",");
    const across = spans.join(",");
    if (stage.current && stage.current.dataset.spans !== across) stage.current.dataset.spans = across;
    if (stage.current && stage.current.dataset.openSpan !== opened) stage.current.dataset.openSpan = opened;
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

  if (failed) return null;
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

/** Where a boss, standing at `x` at `scale`, reaches on the page: [left, right], px. */
function extent(points: Vector3[], x: number, scale: number, camera: Camera, width: number, work: { screen: Vector3 }): [number, number] {
  let from = Infinity;
  let to = -Infinity;
  for (const p of points) {
    work.screen.set(x + p.x * scale, p.y * scale, p.z * scale).project(camera);
    const px = ((work.screen.x + 1) / 2) * width;
    from = Math.min(from, px);
    to = Math.max(to, px);
  }
  return [from, to];
}

/** A boss's robot, scaled to its share of the line-up, facing the player. */
function makeFigure(boss: BossId, model: { scene: Group; animations: AnimationClip[] }): Figure {
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
  // As wide as the robot, so, with every boss within its column, a click reaches the boss whose column it is.
  const hitGeometry = new BoxGeometry(size.x, size.y, Math.max(size.z, 0.3));
  const hitMaterial = new MeshBasicMaterial({ visible: false });
  const hit = new Mesh(hitGeometry, hitMaterial);
  bounds.getCenter(hit.position);
  root.add(hit);
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
  const copies: Figure["copies"] = [];
  if (boss === "profit") {
    for (const [x, z] of COPIES) {
      const copy = unit();
      copy.position.x += x;
      copy.position.z += z;
      owned.push(...faint(copy));
      root.add(copy);
      copies.push({ unit: copy, x: copy.position.x, z, points: surface(copy) });
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
  return { root, mixers, actions, playing: actions?.idle ?? null, owned, points: surface(front), copies, rest: 1, open: 1, spans: { rest: [0, 0], open: [0, 0] }, sizedFor: "" };
}

/** Up to a few hundred points from each of a unit's meshes, as it stands at rest, in its figure's space. */
function surface(unit: Object3D): Vector3[] {
  unit.updateMatrixWorld(true);
  const points: Vector3[] = [];
  unit.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const position = o.geometry.getAttribute("position");
    if (!position) return;
    const every = Math.max(1, Math.ceil(position.count / 400));
    for (let i = 0; i < position.count; i += every) points.push(new Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld));
  });
  return points;
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

for (const boss of Object.keys(MODELS) as BossId[]) useGLTF.preload(modelUrl(boss), false, undefined, softFail);
