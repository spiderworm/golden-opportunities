import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AnimationMixer,
  Bone,
  Box3,
  Group,
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  Vector3,
  type AnimationAction,
  type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { BOSSES } from "~/platform/bosses/bosses";

// The phone scene: the Throughput Subcommittee, the Decide robot made again
// with real hands for this (public/models/phone/subcommittee.glb), walks up to
// the glass, reaches up with one hand and grabs the phone by its bottom edge,
// like the first version's claw (David: "grab at the bottom of the phone with
// a single hand"), its fingers spread as wide as the phone is, then tugs at
// it. The camera is the phone: it frames the robot to the screen's shape, and
// keeps the robot's head in the band between the words above and below, so
// nothing covers its face. Reduced motion: it's already holding the phone.

export interface PhoneSceneProps {
  reducedMotion: boolean;
  /** Called once the hand has closed on the phone. */
  onGrabbed: () => void;
  /** Called once the scene has drawn. */
  onDrawn?: () => void;
  /**
   * The space the words leave the robot, as shares of the screen's height (top, bottom) and width (left, right):
   * its head stays in it, and its hand takes the phone under it. Below the words on a phone held upright; beside
   * them on one turned.
   */
  zone: RefObject<{ top: number; bottom: number; left: number; right: number }>;
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
/** The hand's span, index knuckle to pinky knuckle, and a finger's length, in the rig's units at scale 1. */
const SPAN = 0.084;
const FINGER = 0.09;
/** How much of the screen's width the grip spans, and the most the hand grows to make it. */
const GRIP = 0.55;
const MAX_HAND = 2.2;
/** The most a finger stands on screen, as a share of its height, and the most the fingers fan out (radians). */
const FINGERS_TALL = 0.2;
const MAX_FAN = 0.5;
/** The hand's palm, wrist to knuckles, in the rig's units at scale 1; and how far in front of the head it takes hold. */
const PALM = 0.1;
/** Where the knuckles take hold: this far below the screen's middle, as a share of half its height (a little above its bottom edge). */
const EDGE = 0.86;
const REACH_OUT = 0.7;
/** The nearest the hand comes to the glass. */
const NEAREST = 0.32;
/** Which way the finger joints curl toward the glass, about their Z (the rig's right hand, measured), and how far
    each joint, knuckle to tip, hooks over the edge once it has hold. */
const CURL = -1;
const HOOK = [0.85, 0.75, 0.55];
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
  /** Each finger's joints from the knuckle out (the thumb last), which curl round the phone's edge as it takes hold. */
  fingers: Bone[][];
}

/** The fingers fan out across the hand's Z, most for the outer ones: index, middle, ring, pinky, thumb. */
const FAN = [1, 0.35, -0.35, -1, 1.6];

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
    // Its right hand (on the player's left, a little nearer the middle of the screen than its shoulder).
    const arm: Arm = {
      joints: [bone("mixamorigRightArm"), bone("mixamorigRightForeArm")],
      hand: bone("mixamorigRightHand"),
      fingers: ["Index", "Middle", "Ring", "Pinky", "Thumb"].map((f) =>
        [1, 2, 3].map((n) => bone(`mixamorigRightHand${f}${n}`)),
      ),
    };
    const rest = arm.fingers.map((joints) => joints.map((j) => j.quaternion.clone()));
    const mixer = new AnimationMixer(body);
    const clip = (name: string) =>
      model.animations.find((a) => a.name === name) ?? model.animations[0]!;
    const actions = { idle: mixer.clipAction(clip("idle")), walk: mixer.clipAction(clip("walk")) };
    actions.walk.play();
    return {
      root,
      arm,
      rest,
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

  const handLight = useRef<PointLight>(null);
  const started = useRef<number | null>(null);
  const told = useRef(false);
  const work = useMemo(
    () => ({
      v: new Vector3(),
      w: new Vector3(),
      target: new Vector3(),
      up: new Vector3(),
      palm: new Vector3(),
      q: new Quaternion(),
      parent: new Quaternion(),
      basis: new Matrix4(),
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
    const across = zone.current.left + zone.current.right - 1; // and across, in NDC x
    const shake =
      holding > 0 && holding < SHAKE && !reducedMotion ? (1 - holding / SHAKE) * 0.012 : 0;
    cam.position.set(
      across * work.headAt.z * tan * aspect + (Math.random() - 0.5) * shake,
      headMiddle + middle * work.headAt.z * tan + (Math.random() - 0.5) * shake,
      -tug * 0.6,
    );
    cam.rotation.set(
      0,
      0,
      holding > 0 && !reducedMotion ? 0.03 + Math.sin(holding * 1.3) * 0.02 : 0,
    );
    cam.updateMatrixWorld(true);

    // One hand takes the phone by its bottom edge: it comes up from below, a little in front of the robot,
    // under the middle of the screen, and its fingers reach up over the edge toward the glass and curl round it.
    // The grip is as wide as the phone: the hand grows and its fingers fan until they span most of the screen's
    // width at that distance, wider on a wide phone, narrower on a narrow one.
    const reach = reducedMotion ? 1 : ease(clamp01((t - REACH[0]) / (REACH[1] - REACH[0])));
    const close = reducedMotion ? 1 : ease(clamp01((t - REACH[1] + 0.3) / 0.3));
    const handsAt = Math.max(NEAREST, -work.headAt.z - REACH_OUT);
    // The width it has to take hold of: the phone's, less the words' column beside it on a turned phone.
    const wide = 2 * handsAt * tan * aspect * (zone.current.right - zone.current.left);
    const arm = rig.arm;
    // As wide as the phone: the hand's own span (index to pinky) grows toward GRIP of the screen's width, up to a
    // point (its fingers grow with it), and the fingers fan out the rest of the way.
    const [shoulder] = arm.joints;
    shoulder.scale.setScalar(1);
    arm.hand.scale.setScalar(1);
    shoulder.updateMatrixWorld(true);
    arm.hand.getWorldScale(work.v);
    const unit = work.v.x;
    const tall = 2 * handsAt * tan;
    // Its fingers no longer than a share of the screen's height, so they never climb to the face...
    const big = MathUtils.clamp(
      Math.min((GRIP * wide) / (SPAN * unit), (FINGERS_TALL * tall) / (FINGER * unit)),
      1,
      MAX_HAND,
    );
    // ...and fanned out as far as the rest of the phone's width asks, within what a hand can do.
    const want = GRIP * wide;
    const fan =
      MathUtils.clamp(
        Math.atan(Math.max(0, want - SPAN * unit * big) / (2 * FINGER * unit * big)),
        0.06,
        MAX_FAN,
      ) * reach;
    // The knuckles on the screen's bottom edge, at the glass, and the wrist a palm's length behind them, a little
    // lower, so the back of the hand comes up into view and the fingers hook down over the edge toward the player.
    work.target.set(
      across * handsAt * tan * aspect,
      -handsAt * tan * EDGE - 0.3 * PALM * unit * big,
      -handsAt - PALM * unit * big,
    );
    cam.localToWorld(work.target);
    const length =
      shoulder.getWorldPosition(work.v).distanceTo(arm.joints[1].getWorldPosition(work.w)) +
      work.w.distanceTo(arm.hand.getWorldPosition(new Vector3()));
    const grow =
      1 + (Math.min(MAX_GROW, Math.max(1, work.target.distanceTo(work.v) / length)) - 1) * reach;
    shoulder.scale.setScalar(grow);
    shoulder.updateMatrixWorld(true);
    if (handLight.current) {
      handLight.current.position.copy(work.target);
      cam.worldToLocal(handLight.current.position);
      handLight.current.position.set(
        0,
        handLight.current.position.y + 0.25,
        handLight.current.position.z + 0.45,
      );
      cam.localToWorld(handLight.current.position);
    }
    if (reach > 0) {
      reachFor(arm, work.target, reach, work);
      // Fingers out toward the glass, palm down on the phone's edge, so the fingers hook down over it toward the player.
      work.up.set(0, 0.25, 1).normalize().transformDirection(cam.matrixWorld);
      work.palm.set(0, -1, 0).transformDirection(cam.matrixWorld);
      aim(arm.hand, work.up, work.palm, reach, work);
      arm.hand.scale.setScalar(1 + (big - 1) * reach);
      arm.fingers.forEach((joints, f) => {
        joints.forEach((joint, n) => {
          joint.quaternion.copy(rig.rest[f]![n]!);
          // The knuckle fans the finger out across the hand; every joint curls it round the edge, the tips most.
          if (n === 0) joint.rotateX(FAN[f]! * fan);
          joint.rotateZ(CURL * (0.25 * reach + HOOK[n]! * close));
        });
      });
      arm.hand.updateMatrixWorld(true);
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

  return (
    <>
      <primitive object={rig.root} />
      {/* A light at the glass, by the hand, so it stands out from the robot's own navy behind it. */}
      <pointLight ref={handLight} intensity={2.2} distance={1.6} decay={1.2} color="#dfe6ff" />
    </>
  );
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

/**
 * Turns a hand so its fingers (the bone's +Y) point along `fingers` and its palm (its +X) faces `palm`
 * (world space, made square to the fingers), blended in by `weight`.
 */
function aim(
  hand: Bone,
  fingers: Vector3,
  palm: Vector3,
  weight: number,
  work: { v: Vector3; w: Vector3; q: Quaternion; parent: Quaternion; basis: Matrix4 },
) {
  const y = work.v.copy(fingers).normalize();
  const x = work.w.copy(palm).addScaledVector(y, -palm.dot(y)).normalize();
  work.basis.makeBasis(x, y, new Vector3().crossVectors(x, y));
  work.q.setFromRotationMatrix(work.basis);
  (hand.parent as Object3D).getWorldQuaternion(work.parent);
  const aimed = work.parent.clone().invert().multiply(work.q);
  hand.quaternion.slerp(aimed, weight);
  hand.updateMatrixWorld(true);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
