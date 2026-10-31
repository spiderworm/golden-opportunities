import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { AnimationMixer, Bone, Box3, BoxGeometry, Group, MathUtils, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3, type AnimationAction, type Object3D } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { BOSSES } from "~/platform/bosses/bosses";

// The phone scene: the Throughput Subcommittee, the same Tripo robot as on
// Decide (public/models/bosses/readers.glb), walks up to the glass and grabs
// the phone in both hands, one on each side of the actual screen, then tugs
// at it. The camera is the phone: it frames the robot to the screen's shape,
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

const MODEL = "/models/bosses/readers.glb";
const HEIGHT = 1.75;
/** When things happen, in seconds from the scene's start. */
const WALK = [0.2, 1.9] as const;
const REACH = [1.5, 2.3] as const;
const SHAKE = 0.5;
/** How far from the glass the hands take hold of the phone, and where the robot starts. */
const HANDS_AT = 0.42;
/** How far from the camera the claws close on the screen's sides. */
const CLAMP_AT = 0.2;
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
      <pointLight position={[0, 1.4, -0.3]} intensity={1.2} distance={3} color={BOSSES.readers.tint} />
      <Grab {...props} />
    </Canvas>
  );
}

useGLTF.preload(MODEL, false);

interface Arm {
  /** Shoulder to elbow: the joints the solve turns, and the hand it places. */
  joints: [Bone, Bone];
  hand: Bone;
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
      side: side === "Left" ? 1 : -1,
    }));
    const mixer = new AnimationMixer(body);
    const clip = (name: string) => model.animations.find((a) => a.name === name) ?? model.animations[0]!;
    const actions = { idle: mixer.clipAction(clip("idle")), walk: mixer.clipAction(clip("walk")) };
    actions.walk.play();
    const clamps = arms.map((arm) => makeClamp(arm.side));
    return { root, arms, clamps, headBone: bone("mixamorigHead"), mixer, actions, playing: actions.walk as AnimationAction };
  }, [model]);
  useEffect(
    () => () => {
      rig.mixer.stopAllAction();
      rig.clamps.forEach((c) => c.dispose());
    },
    [rig],
  );
  useEffect(() => {
    // Still: draw the one frame once the robot's in.
    if (reducedMotion) invalidate();
  }, [reducedMotion, invalidate]);

  const started = useRef<number | null>(null);
  const told = useRef(false);
  const work = useMemo(
    () => ({ v: new Vector3(), w: new Vector3(), target: new Vector3(), q: new Quaternion(), parent: new Quaternion(), headAt: new Vector3(), top: new Vector3() }),
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
    const tug = holding > 0 && !reducedMotion ? Math.max(0, Math.sin(holding * 2.1)) ** 3 * 0.05 : 0;
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
    const shake = holding > 0 && holding < SHAKE && !reducedMotion ? (1 - holding / SHAKE) * 0.012 : 0;
    cam.position.set((Math.random() - 0.5) * shake, headMiddle + middle * work.headAt.z * tan + (Math.random() - 0.5) * shake, -tug * 0.6);
    cam.rotation.set(0, 0, holding > 0 && !reducedMotion ? 0.03 + Math.sin(holding * 1.3) * 0.02 : 0);
    cam.updateMatrixWorld(true);

    // The hands take the phone by its sides: on the screen's edges, wherever they are for this shape of screen.
    const reach = reducedMotion ? 1 : ease(clamp01((t - REACH[0]) / (REACH[1] - REACH[0])));
    for (const arm of rig.arms) {
      work.target.set(arm.side * HANDS_AT * tan * aspect, HANDS_AT * tan * middle, -HANDS_AT);
      cam.localToWorld(work.target);
      // Its turnstile arms telescope: long enough to reach the glass from where it stands, as it reaches.
      const [shoulder] = arm.joints;
      shoulder.scale.y = 1;
      arm.hand.scale.y = 1;
      shoulder.updateMatrixWorld(true);
      const length = shoulder.getWorldPosition(work.v).distanceTo(arm.joints[1].getWorldPosition(work.w)) + work.w.distanceTo(arm.hand.getWorldPosition(new Vector3()));
      const stretch = 1 + (Math.max(1, work.target.distanceTo(work.v) / length) - 1) * reach;
      shoulder.scale.y = stretch;
      // The claw keeps its own size.
      arm.hand.scale.y = 1 / stretch;
      shoulder.updateMatrixWorld(true);
      if (reach > 0) reachFor(arm, work.target, reach, work);
    }
    // The claws, where the arms meet the screen's sides: they swing in over the glass and close on it.
    const close = reducedMotion ? 1 : ease(clamp01((t - REACH[1] + 0.35) / 0.35));
    rig.clamps.forEach((clamp, i) => {
      const side = rig.arms[i]!.side;
      clamp.group.visible = reach > 0.6;
      clamp.group.position.set(side * CLAMP_AT * tan * aspect, CLAMP_AT * tan * middle, -CLAMP_AT);
      cam.localToWorld(clamp.group.position);
      clamp.group.quaternion.copy(cam.quaternion);
      // Sized to the screen: the fingers reach about a third of the way in on its narrower side.
      clamp.group.scale.setScalar((CLAMP_AT * tan * Math.min(aspect, 1)) / 0.15);
      clamp.pose(close);
    });

    // Where the head is drawn, for anyone checking that the words never cover it.
    if (head?.current) {
      // From the head's base to the top of the robot (its antenna): the rig's own head-top bone sits above the model.
      work.top.set(work.headAt.x, rig.root.position.y + HEIGHT, work.headAt.z);
      const a = work.headAt.clone().project(cam);
      const b = work.top.clone().project(cam);
      const tall = Math.abs(b.y - a.y) * (size.height / 2);
      const x = ((a.x + 1) / 2) * size.width;
      const y = ((1 - (a.y + b.y) / 2) / 2) * size.height;
      head.current.dataset.head = [x - tall / 2, y - tall / 2, tall, tall].map(Math.round).join(",");
    }

    if (reach >= 1 && !told.current) {
      told.current = true;
      onGrabbed();
    }
  });

  return (
    <>
      <primitive object={rig.root} />
      {rig.clamps.map((c, i) => (
        <primitive key={i} object={c.group} />
      ))}
    </>
  );
}

/**
 * Turns an arm's two joints so its hand reaches `target` (cyclic coordinate descent, in world space),
 * blended from the animated pose by `weight`.
 */
function reachFor(arm: Arm, target: Vector3, weight: number, work: { v: Vector3; w: Vector3; q: Quaternion; parent: Quaternion }) {
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
 * A claw for one side of the screen, in the camera's frame: a knuckle just outside the edge and three
 * two-jointed fingers that swing in over the glass and curl onto it as it closes (0 open, 1 shut).
 */
function makeClamp(side: -1 | 1) {
  const metal = new MeshStandardMaterial({ color: "#2b3163", metalness: 0.45, roughness: 0.45 });
  const tipColor = new MeshStandardMaterial({ color: "#0b1530", emissive: BOSSES.readers.tint, emissiveIntensity: 1.6 });
  const knuckleGeometry = new BoxGeometry(0.03, 0.09, 0.03);
  const boneGeometry = new BoxGeometry(0.03, 0.016, 0.014).translate(0.015, 0, 0);
  const tipGeometry = new BoxGeometry(0.022, 0.014, 0.012).translate(0.011, 0, 0);
  const group = new Group();
  // Mirrored for the left edge, so the fingers always reach in toward the middle.
  const hand = new Group();
  hand.scale.x = -side;
  group.add(hand);
  hand.add(new Mesh(knuckleGeometry, metal));
  const fingers = [-1, 0, 1].map((row) => {
    const base = new Group();
    base.position.set(0.005, row * 0.03, 0);
    const tip = new Group();
    tip.position.x = 0.03;
    tip.add(new Mesh(tipGeometry, tipColor));
    base.add(new Mesh(boneGeometry, metal), tip);
    hand.add(base);
    return { base, tip };
  });
  return {
    group,
    pose(close: number) {
      for (const { base, tip } of fingers) {
        // Open, they point back past the edge; shut, they lie over the glass and the tips bite.
        base.rotation.y = (1 - close) * 1.9;
        tip.rotation.y = -0.2 - 0.5 * close;
      }
    },
    dispose() {
      for (const g of [knuckleGeometry, boneGeometry, tipGeometry]) g.dispose();
      metal.dispose();
      tipColor.dispose();
    },
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
