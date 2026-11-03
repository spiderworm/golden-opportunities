import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AnimationMixer,
  Bone,
  Box3,
  Group,
  MathUtils,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  type AnimationAction,
  type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { BOSSES } from "~/platform/bosses/bosses";

// The phone scene: the Throughput Subcommittee, the Decide robot made again
// with real hands for this (public/models/phone/subcommittee.glb), walks up to
// the glass and takes the phone in both hands, one on each side of the actual
// screen, its fingers wrapping round the edges, then tugs at it. The camera is the phone: it frames the robot to the screen's shape,
// and keeps the robot's head in the band between the words above and below,
// so nothing covers its face. Reduced motion: it's already holding the phone.

export interface PhoneSceneProps {
  reducedMotion: boolean;
  /** Called once the hands have closed on the phone. */
  onGrabbed: () => void;
  /** Called once the scene has drawn. */
  onDrawn?: () => void;
  /** The band the head must stay in: from the bubble's bottom to the fact line's top, as shares of the screen's height. */
  zone: RefObject<{ top: number; bottom: number }>;
  /** Where the head is drawn, published on this element as data-head="x,y,width,height" (CSS px), for the tests. */
  head?: RefObject<HTMLElement | null>;
}

const MODEL = "/models/phone/subcommittee.glb";
const HEIGHT = 1.75;
/** When things happen, in seconds from the scene's start. */
const WALK = [0.2, 1.9] as const;
const REACH = [1.5, 2.3] as const;
const SHAKE = 0.5;
/** Where the robot starts. */
/** The most the arms grow to reach the glass. */
const MAX_GROW = 1.8;
const START = 4.2;
const FOV = 50;
/** The head's height (with its antenna) in metres, for keeping it within the band. */
const HEAD_SIZE = 0.42;

export default function PhoneScene(props: PhoneSceneProps) {
  return (
    <Canvas
      aria-hidden="true"
      dpr={[1, 2]}
      frameloop={props.reducedMotion ? "demand" : "always"}
      camera={{ fov: FOV, near: 0.05, far: 40, position: [0, 1.4, 0] }}
      gl={{ antialias: true, alpha: true }}
    >
      <hemisphereLight args={["#c9d0ff", "#2a2140", 1.3]} />
      <directionalLight position={[1.5, 3, 2]} intensity={1.8} color="#fff3e2" />
      <pointLight
        position={[0, 1.4, -0.3]}
        intensity={1.2}
        distance={3}
        color={BOSSES.readers.tint}
      />
      <Grab {...props} />
    </Canvas>
  );
}

useGLTF.preload(MODEL, false);

interface Arm {
  /** Shoulder to elbow: the joints the solve turns, and the hand it places. */
  joints: [Bone, Bone];
  hand: Bone;
  /** Its finger joints, which curl as it takes hold. */
  fingers: Bone[];
  /** Which side of the screen it takes: the robot faces the player, so its left hand is on the player's right. */
  side: -1 | 1;
}

function Grab({ reducedMotion, onGrabbed, onDrawn, zone, head }: PhoneSceneProps) {
  const model = useGLTF(MODEL, false);
  const { camera, size, invalidate } = useThree();
  const rig = useMemo(() => {
    const body = cloneSkinned(model.scene);
    const bounds = new Box3().setFromObject(body);
    const scale = HEIGHT / (bounds.max.y - bounds.min.y);
    body.scale.setScalar(scale);
    body.position.y = -bounds.min.y * scale;
    body.traverse((o) => (o.frustumCulled = false));
    const root = new Group();
    root.add(body);
    const bone = (name: string) => body.getObjectByName(name) as Bone;
    const arms: Arm[] = (["Left", "Right"] as const).map((side) => ({
      joints: [bone(`mixamorig${side}Arm`), bone(`mixamorig${side}ForeArm`)],
      hand: bone(`mixamorig${side}Hand`),
      fingers: ["Index", "Middle", "Ring", "Pinky", "Thumb"]
        .flatMap((f) => [1, 2, 3].map((n) => bone(`mixamorig${side}Hand${f}${n}`)))
        .filter(Boolean),
      side: side === "Left" ? 1 : -1,
    }));
    const mixer = new AnimationMixer(body);
    const clip = (name: string) =>
      model.animations.find((a) => a.name === name) ?? model.animations[0]!;
    const actions = { idle: mixer.clipAction(clip("idle")), walk: mixer.clipAction(clip("walk")) };
    actions.walk.play();
    return {
      root,
      arms,
      headBone: bone("mixamorigHead"),
      mixer,
      actions,
      playing: actions.walk as AnimationAction,
    };
  }, [model]);
  useEffect(() => () => void rig.mixer.stopAllAction(), [rig]);
  useEffect(() => {
    // Still: draw the one frame once the robot's in.
    if (reducedMotion) invalidate();
  }, [reducedMotion, invalidate]);

  const started = useRef<number | null>(null);
  const told = useRef(false);
  const work = useMemo(
    () => ({
      v: new Vector3(),
      w: new Vector3(),
      target: new Vector3(),
      q: new Quaternion(),
      parent: new Quaternion(),
      headAt: new Vector3(),
      top: new Vector3(),
    }),
    [],
  );

  useFrame(({ clock }, frameDelta) => {
    if (started.current === null) onDrawn?.();
    started.current ??= clock.elapsedTime;
    const t = reducedMotion ? REACH[1] + 1 : clock.elapsedTime - started.current;
    const delta = Math.min(frameDelta, 0.1);
    const cam = camera as PerspectiveCamera;
    const tan = Math.tan(MathUtils.degToRad(FOV / 2));
    const aspect = size.width / size.height;

    // How far away the head ends up: far enough that it fits the band between the words.
    const band = Math.max(0.12, zone.current.bottom - zone.current.top);
    const headDistance = Math.max(0.95, HEAD_SIZE / (band * 0.8 * 2 * tan));

    // Walk up to the glass, stop, and once it has the phone, tug at it.
    const walked = ease(clamp01((t - WALK[0]) / (WALK[1] - WALK[0])));
    const holding = t - REACH[1];
    const tug =
      holding > 0 && !reducedMotion ? Math.max(0, Math.sin(holding * 2.1)) ** 3 * 0.05 : 0;
    rig.root.position.set(0, 0, -(START + (headDistance - START) * walked) - tug);
    const next = walked < 1 && !reducedMotion ? rig.actions.walk : rig.actions.idle;
    if (rig.playing !== next) {
      next.reset().play();
      rig.playing.crossFadeTo(next, 0.3, false);
      rig.playing = next;
    }
    rig.mixer.update(reducedMotion ? 0 : delta);
    rig.root.updateMatrixWorld(true);

    // The camera is the phone, held so the head sits in the middle of the band; the grab shakes it.
    rig.headBone.getWorldPosition(work.headAt);
    const headMiddle = (work.headAt.y + HEIGHT) / 2;
    const middle = 1 - (zone.current.top + zone.current.bottom); // the band's middle, in NDC y
    const shake =
      holding > 0 && holding < SHAKE && !reducedMotion ? (1 - holding / SHAKE) * 0.012 : 0;
    cam.position.set(
      (Math.random() - 0.5) * shake,
      headMiddle + middle * work.headAt.z * tan + (Math.random() - 0.5) * shake,
      -tug * 0.6,
    );
    cam.rotation.set(
      0,
      0,
      holding > 0 && !reducedMotion ? 0.03 + Math.sin(holding * 1.3) * 0.02 : 0,
    );
    cam.updateMatrixWorld(true);

    // The hands take the phone by its sides: just inside the screen's edges, wherever they are for this
    // shape of screen, a little in front of the robot, beside its head, fingers toward the glass so they never cross its face.
    const reach = reducedMotion ? 1 : ease(clamp01((t - REACH[0]) / (REACH[1] - REACH[0])));
    const close = reducedMotion ? 1 : ease(clamp01((t - REACH[1] + 0.3) / 0.3));
    const handsAt = Math.max(0.35, -work.headAt.z - 0.3);
    // Below the chin on any screen: on a narrow one the edges are close to the head, and fingers there would cross its face.
    const chin = work.headAt.clone().project(cam).y;
    const gripAt = Math.min(middle - 0.2, chin - 0.12);
    for (const arm of rig.arms) {
      work.target.set(arm.side * handsAt * tan * aspect * 0.86, handsAt * tan * gripAt, -handsAt);
      cam.localToWorld(work.target);
      // The whole arm grows a little as it reaches, if it must, so the hands come up big rather than short of the glass.
      const [shoulder] = arm.joints;
      shoulder.scale.setScalar(1);
      shoulder.updateMatrixWorld(true);
      const length =
        shoulder.getWorldPosition(work.v).distanceTo(arm.joints[1].getWorldPosition(work.w)) +
        work.w.distanceTo(arm.hand.getWorldPosition(new Vector3()));
      const grow =
        1 + (Math.min(MAX_GROW, Math.max(1, work.target.distanceTo(work.v) / length)) - 1) * reach;
      shoulder.scale.setScalar(grow);
      shoulder.updateMatrixWorld(true);
      if (reach > 0) {
        reachFor(arm, work.target, reach, work);
        // The hand turns its fingers toward the glass, leaning in a little, and they close round the screen's edge.
        clasp(
          arm.hand,
          work.w
            .set(-arm.side * 0.4, 0.15, 1)
            .normalize()
            .applyQuaternion(cam.quaternion),
          reach,
          work,
        );
        // The rig's hands are mirror images, so the left's fingers curl the other way about their own axis.
        for (const finger of arm.fingers)
          finger.rotation.x = arm.side * (0.25 * reach + 0.85 * close);
      }
    }

    // Where the head is drawn, for anyone checking that the words never cover it.
    if (head?.current) {
      // From the head's base to the top of the robot (its antenna): the rig's own head-top bone sits above the model.
      work.top.set(work.headAt.x, rig.root.position.y + HEIGHT, work.headAt.z);
      const a = work.headAt.clone().project(cam);
      const b = work.top.clone().project(cam);
      const tall = Math.abs(b.y - a.y) * (size.height / 2);
      const x = ((a.x + 1) / 2) * size.width;
      const y = ((1 - (a.y + b.y) / 2) / 2) * size.height;
      head.current.dataset.head = [x - tall / 2, y - tall / 2, tall, tall]
        .map(Math.round)
        .join(",");
    }

    if (reach >= 1 && !told.current) {
      told.current = true;
      onGrabbed();
    }
  });

  return <primitive object={rig.root} />;
}

/**
 * Turns an arm's two joints so its hand reaches `target` (cyclic coordinate descent, in world space),
 * blended from the animated pose by `weight`.
 */
function reachFor(
  arm: Arm,
  target: Vector3,
  weight: number,
  work: { v: Vector3; w: Vector3; q: Quaternion; parent: Quaternion },
) {
  const saved = arm.joints.map((j) => j.quaternion.clone());
  const at = new Vector3();
  const hand = new Vector3();
  for (let pass = 0; pass < 8; pass++) {
    for (const joint of [arm.joints[1], arm.joints[0]]) {
      joint.getWorldPosition(at);
      arm.hand.getWorldPosition(hand);
      work.v.subVectors(hand, at).normalize();
      work.w.subVectors(target, at).normalize();
      work.q.setFromUnitVectors(work.v, work.w);
      // Into the joint's parent's space: local' = parent⁻¹ · q · parent · local.
      (joint.parent as Object3D).getWorldQuaternion(work.parent);
      const turn = work.parent.clone().invert().multiply(work.q).multiply(work.parent);
      joint.quaternion.premultiply(turn);
      joint.updateMatrixWorld(true);
    }
  }
  arm.joints.forEach((j, i) => {
    j.quaternion.slerpQuaternions(saved[i]!, j.quaternion.clone(), weight);
    j.updateMatrixWorld(true);
  });
}

/** Turns a hand so its fingers (the bone's +Y) point along `direction` (world space), blended in by `weight`. */
function clasp(
  hand: Bone,
  direction: Vector3,
  weight: number,
  work: { v: Vector3; q: Quaternion; parent: Quaternion },
) {
  hand.getWorldQuaternion(work.q);
  work.v.set(0, 1, 0).applyQuaternion(work.q);
  const turn = new Quaternion().setFromUnitVectors(work.v, direction);
  (hand.parent as Object3D).getWorldQuaternion(work.parent);
  const aimed = hand.quaternion
    .clone()
    .premultiply(work.parent.clone().invert().multiply(turn).multiply(work.parent));
  hand.quaternion.slerp(aimed, weight);
  hand.updateMatrixWorld(true);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
