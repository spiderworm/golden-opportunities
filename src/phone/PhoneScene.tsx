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
// the glass and takes the phone at its bottom in one open hand, as a person
// holds one: palm to the glass, fingers round one side and thumb round the
// other, as wide as the phone is, then tugs at it. The camera is the phone:
// it frames the robot to the screen's shape, and keeps the robot's head in the
// band between the words above and below, so nothing covers its face. Reduced motion: it's already holding the phone.

export interface PhoneSceneProps {
  reducedMotion: boolean;
  /** Called once the hand has closed on the phone. */
  onGrabbed: () => void;
  /** Called once the scene has drawn. */
  onDrawn?: () => void;
  /**
   * Shares of the screen's height: the band the head stays in (top, bottom: from the bubble to the hand's room
   * above the fact line), and where the hand holds the phone (hold: the fact line's top).
   */
  zone: RefObject<{ top: number; bottom: number; hold: number }>;
  /** Where the head is drawn, published on this element as data-head="x,y,width,height" (CSS px), for the tests. */
  head?: RefObject<HTMLElement | null>;
}

const MODEL = "/models/phone/subcommittee.glb";
const HEIGHT = 1.75;
/** When things happen, in seconds from the scene's start. */
const WALK = [0.2, 1.9] as const;
const REACH = [1.5, 2.3] as const;
const SHAKE = 0.5;
/** The most the arm grows to bring the hand near the glass. */
const MAX_GROW = 2.6;
/** Where the robot starts. */
const START = 4.2;
const FOV = 50;
/** How far from the camera the hand holds the phone; how far toward its sides the fingers and thumb bend round
    them; the knuckle row's height above the words (a share of the screen's height); and, on a turned phone, the
    most of its height the hand stands. */
const GRIP_DEPTH = 0.32;
const EDGE_IN = 0.97;
const KNUCKLES_UP = 0.06;
const HAND_TALL = 0.5;
/** The thumb's joints: it swings across the palm about its knuckle's X (measured), and curls about Z. */
const THUMB = 4;
const THUMB_ACROSS = 2.8;
const THUMB_CURL = [0.2, 0.5, 0.6];
/** Which way the finger joints curl toward the glass, about their Z (the rig's right hand, measured), and how far
    each joint, knuckle to tip, curls round the phone's side once it has hold. */
const CURL = -1;
const FINGER_CURL = [0.5, 0.9, 0.7];
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

    // One open hand takes the phone at the bottom of the picture, as a person holds one (David: "open up the
    // hand, face the palm towards the camera, and have the fingers grip one side of the phone, and the thumb the
    // other"): palm to the glass, fingers across to one side and curled round that edge, thumb across to the other
    // and round it. It's near the lens, big, its palm mostly cropped by the bottom of the picture ("bring the palm
    // of the hand closer to the camera. We don't need to see as much of the thumb or fingers"). The whole hand is
    // sized at once, never a finger or the thumb on its own ("Thumb badly stretched"), so that the fingers bend
    // round the phone's left side where the thumb bends round its right: the grip opens as wide as the phone is.
    const reach = reducedMotion ? 1 : ease(clamp01((t - REACH[0]) / (REACH[1] - REACH[0])));
    const close = reducedMotion ? 1 : ease(clamp01((t - REACH[1] + 0.3) / 0.3));
    const arm = rig.arm;
    const [shoulder] = arm.joints;
    shoulder.scale.setScalar(1);
    arm.hand.scale.setScalar(1);
    shoulder.updateMatrixWorld(true);
    // As near the lens as the arm reaches (grown to MAX_GROW, with some to spare for reaching across and down):
    // the hand is sized against the screen at whatever depth it's held, so this only sharpens its perspective.
    const armLength =
      shoulder.getWorldPosition(work.v).distanceTo(arm.joints[1].getWorldPosition(work.w)) +
      work.w.distanceTo(arm.hand.getWorldPosition(work.target));
    const shoulderAt = -shoulder.getWorldPosition(work.v).applyMatrix4(cam.matrixWorldInverse).z;
    const handsAt = Math.max(GRIP_DEPTH, shoulderAt - 0.75 * MAX_GROW * armLength);
    const halfWide = handsAt * tan * aspect;
    const halfTall = handsAt * tan;
    const turned = aspect > 1;

    // The hand, posed as it is now, measured from the camera: how far its fingers and thumb reach to each side,
    // and how tall it stands, at its own size.
    const pose = (curl: number) => {
      // Fingers to the left; on a short, turned phone tipped down, so they slide under the words.
      work.up
        .set(-1, turned ? -0.5 : 0.15, 0)
        .normalize()
        .transformDirection(cam.matrixWorld);
      work.palm.set(0, 0, 1).transformDirection(cam.matrixWorld);
      aim(arm.hand, work.up, work.palm, reach, work);
      arm.fingers.forEach((joints, f) => {
        joints.forEach((joint, n) => {
          joint.quaternion.copy(rig.rest[f]![n]!);
          joint.scale.setScalar(1);
          if (f === THUMB) {
            // Across the palm to the far side, then round that edge toward the glass.
            if (n === 0) joint.rotateX(THUMB_ACROSS * reach);
            joint.rotateZ(-THUMB_CURL[n]! * curl);
          } else {
            joint.rotateZ(CURL * FINGER_CURL[n]! * curl);
          }
        });
      });
      arm.hand.updateMatrixWorld(true);
    };
    const curl = 0.15 * reach + 0.85 * close;
    pose(curl);
    arm.hand.getWorldPosition(work.v);
    const toCam = work.q.copy(cam.quaternion).invert();
    // Measured from the wrist at the hand's own size: where the fingers bend round (the index's second joint), where
    // the thumb does (its second joint), the knuckle row's height, and how tall the hand stands.
    const off = (joint: Bone) =>
      joint.getWorldPosition(work.w).sub(work.v).applyQuaternion(toCam).clone();
    const fingersBend = off(arm.fingers[0]![1]!);
    const thumbBend = off(arm.fingers[THUMB]![1]!);
    const knuckles = off(arm.fingers[1]![0]!);
    let low = 0;
    let high = 0;
    for (const joints of arm.fingers) {
      for (const joint of joints) {
        const y = off(joint).y;
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
    }
    // Its size, the whole hand at once (no finger or thumb grows on its own): the fingers bend round the phone's
    // left side and the thumb round its right, so the grip opens exactly as wide as the phone is. On a turned
    // phone, no taller than HAND_TALL of the screen; there its thumb keeps the right side and the far side is implied.
    const across = Math.max(1e-3, thumbBend.x - fingersBend.x);
    const handSize = Math.min(
      (2 * EDGE_IN * halfWide) / across,
      (HAND_TALL * 2 * halfTall) / Math.max(1e-3, high - low),
    );
    // Where: the thumb's bend on the right side, and the knuckle row just above the words along the bottom.
    const words = halfTall * (1 - 2 * zone.current.hold);
    work.target.set(
      EDGE_IN * halfWide - thumbBend.x * handSize,
      words + KNUCKLES_UP * 2 * halfTall - knuckles.y * handSize,
      -handsAt,
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
        handLight.current.position.x,
        handLight.current.position.y + 0.1,
        handLight.current.position.z + 0.45,
      );
      cam.localToWorld(handLight.current.position);
    }
    if (reach > 0) {
      reachFor(arm, work.target, reach, work);
      pose(curl);
      // The arm has grown; the hand makes up the rest of its size.
      arm.hand.scale.setScalar(1 + (handSize / grow - 1) * reach);
      arm.hand.updateMatrixWorld(true);
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
