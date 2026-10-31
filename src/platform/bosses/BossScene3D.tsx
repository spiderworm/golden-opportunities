import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, type CSSProperties, type RefObject } from "react";
import {
  AdditiveBlending,
  AnimationMixer,
  Box3,
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
import type { BossSceneProps } from "./BossScene2D";
import { SpeechBubble } from "./SpeechBubble";
import styles from "./BossScene3D.module.css";

// The bosses standing together in 3D: each one a generated Tripo robot
// (public/models/bosses/provenance.json), under its speech bubble. The
// bubbles are the same as in the 2D scene, laid out the same way, so the
// keyboard, screen readers and the focus model don't change; each robot
// stands under its bubble's column and follows it as the open column widens.
// The open boss steps forward and talks; the rest idle. Loaded only on
// Decide, and only once the browser has shown it can draw WebGL 2.

export interface BossScene3DProps extends BossSceneProps {
  /** Still poses: no stepping, idling or bobbing. */
  reducedMotion: boolean;
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

/** How far the open boss steps toward the player, and how fast. */
const FORWARD = 0.35;
const STEP_SPEED = 0.9;
/** How far each boss turns toward the middle of the line-up, per place from it. */
const TURN = 0.2;
/** The Commerce Office is seven of the same unit: six faint copies stand behind the front one. */
const COPIES: [number, number][] = [
  [-0.2, -0.35],
  [0.2, -0.35],
  [-0.32, -0.7],
  [0, -0.7],
  [0.32, -0.7],
  [0, -1.05],
];

export default function BossScene3D({ bubbles, open, onSelect, reducedMotion }: BossScene3DProps) {
  const id = useId();
  const columns = useRef<(HTMLLIElement | null)[]>([]);
  // The same list while the bubbles are, so the robots are made once.
  const bosses = useMemo(() => bubbles.map((b) => b.boss), [bubbles]);
  return (
    <div className={styles.scene}>
      <ul className={styles.bubbles}>
        {bubbles.map((b, i) => (
          <li
            key={b.boss}
            ref={(el) => {
              columns.current[i] = el;
            }}
            className={styles.member}
            data-open={i === open || undefined}
            style={{ "--tint": BOSSES[b.boss].tint, "--order": i } as CSSProperties}
          >
            <SpeechBubble bubble={b} open={i === open} id={`${id}-${i}`} onSelect={(how) => onSelect(i, how)} />
          </li>
        ))}
      </ul>
      {/* Decoration: the bubbles above say who each boss is and what they say. */}
      <div className={styles.stage} aria-hidden="true">
        <Canvas dpr={[1, 1.75]} camera={{ fov: 30, near: 0.1, far: 20, position: [0, 0.8, 2.7] }} gl={{ antialias: true, alpha: true }}>
          <CameraAim />
          <hemisphereLight args={["#c9d0ff", "#2a2140", 1.1]} />
          <directionalLight position={[1.5, 3, 4]} intensity={1.6} color="#fff3e2" />
          {/* The models load here, inside the canvas: the bubbles are up already, and the page keeps
              one set of them rather than the 2D scene's too while the robots arrive. */}
          <Suspense fallback={null}>
            <Bosses bosses={bosses} open={open} onSelect={onSelect} columns={columns} reducedMotion={reducedMotion} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

function CameraAim() {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => camera.lookAt(0, 0.5, 0), [camera]);
  return null;
}

interface Figure {
  root: Group;
  mixers: AnimationMixer[];
  /** The front unit's motions, if it's rigged. */
  actions: { idle: AnimationAction; talk: AnimationAction; walk: AnimationAction } | null;
  playing: AnimationAction | null;
}

function Bosses({
  bosses,
  open,
  onSelect,
  columns,
  reducedMotion,
}: {
  bosses: BossId[];
  open: number;
  onSelect: BossSceneProps["onSelect"];
  columns: RefObject<(HTMLLIElement | null)[]>;
  reducedMotion: boolean;
}) {
  const models = useGLTF(bosses.map(modelUrl), false);
  const figures = useMemo(
    () => bosses.map((boss, i) => makeFigure(boss, models[i]!, (bosses.length - 1) / 2 - i)),
    [bosses, models],
  );
  const { gl } = useThree();
  const work = useMemo(() => ({ ray: new Raycaster(), ndc: new Vector2(), plane: new Plane(new Vector3(0, 0, 1), 0), at: new Vector3() }), []);
  const glow = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const ring = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }), []);
  const ringGeometry = useMemo(() => new RingGeometry(0.2, 0.34, 48).rotateX(-Math.PI / 2), []);
  useEffect(
    () => () => {
      ring.dispose();
      ringGeometry.dispose();
    },
    [ring, ringGeometry],
  );

  useFrame(({ camera, clock }, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1);
    const t = clock.elapsedTime;
    const box = gl.domElement.getBoundingClientRect();
    figures.forEach((f, i) => {
      const focused = i === open;
      const root = f.root;
      // Step toward the player when its bubble is open, back when it closes.
      const target = focused ? FORWARD : 0;
      const step = reducedMotion ? Infinity : STEP_SPEED * delta;
      const moving = Math.abs(target - root.position.z) > 1e-3;
      root.position.z += Math.max(-step, Math.min(step, target - root.position.z));
      // Under the middle of its bubble's column, wherever that is now.
      const column = columns.current?.[i]?.getBoundingClientRect();
      if (column && box.width > 0) {
        work.ndc.set(((column.left + column.width / 2 - box.left) / box.width) * 2 - 1, -0.85);
        work.ray.setFromCamera(work.ndc, camera);
        work.plane.constant = -root.position.z;
        if (work.ray.ray.intersectPlane(work.plane, work.at)) root.position.x = work.at.x;
      }
      if (f.actions) {
        play(f, moving && !reducedMotion ? f.actions.walk : focused ? f.actions.talk : f.actions.idle, reducedMotion);
      } else if (!reducedMotion) {
        // The Administrator and the drone aren't rigged: they bob, and lean in to talk.
        const hover = MODELS[bosses[i]!].hover ?? 0;
        const speed = focused ? 3.2 : 1.6;
        root.position.y = hover ? 0.03 * Math.sin(t * speed + i) : 0.008 * Math.sin(t * speed + i);
        root.rotation.x = focused ? 0.08 + 0.04 * Math.sin(t * 3.2) : 0;
      }
      if (!reducedMotion) for (const m of f.mixers) m.update(delta);
    });
    // The open boss's tint pools on the floor at its feet.
    const lit = figures[open];
    if (lit && glow.current && light.current) {
      glow.current.position.set(lit.root.position.x, 0.005, lit.root.position.z);
      const tint = BOSSES[bosses[open]!].tint;
      ring.color.set(tint);
      light.current.color.set(tint);
      light.current.intensity = reducedMotion ? 2.2 : 2 + 0.4 * Math.sin(t * 2.4);
    }
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
          onPointerOver={() => (gl.domElement.style.cursor = "pointer")}
          onPointerOut={() => (gl.domElement.style.cursor = "")}
        />
      ))}
      <group ref={glow}>
        <mesh geometry={ringGeometry} material={ring} />
        <pointLight ref={light} position={[0, 0.9, 0.35]} distance={2.2} decay={1.4} />
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
  root.rotation.y = fromMiddle * TURN;
  const clip = (name: string) => model.animations.find((a) => a.name === name);
  const mixers: AnimationMixer[] = [];
  let actions: Figure["actions"] = null;
  const idle = clip("idle");
  if (idle) {
    const mixer = new AnimationMixer(front);
    mixers.push(mixer);
    actions = {
      idle: mixer.clipAction(idle),
      talk: mixer.clipAction(clip("agree") ?? idle),
      walk: mixer.clipAction(clip("walk") ?? idle),
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
      faint(copy);
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
  return { root, mixers, actions, playing: actions?.idle ?? null };
}

/** Fades a copy back, as the portrait does with the Commerce Office's other six units. */
function faint(object: Object3D) {
  const dim = new Color("#3a3f66");
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = (mesh.material as Material & { color?: Color }).clone() as Material & { color?: Color };
    material.transparent = true;
    material.opacity = 0.3;
    material.depthWrite = false;
    material.color?.lerp(dim, 0.4);
    mesh.material = material;
  });
}

for (const boss of Object.keys(MODELS) as BossId[]) useGLTF.preload(modelUrl(boss), false);
