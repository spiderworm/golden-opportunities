import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AnimationMixer,
  Bone,
  Box3,
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  NoColorSpace,
  TextureLoader,
  Matrix4,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { BOSSES } from "~/platform/bosses/bosses";
import { makeRoom, PHOTO } from "./room";
import {
  closeGrip,
  fitGrip,
  gripFrame,
  gripRotation,
  phoneSize,
  type Hand,
  type PhoneSize,
} from "./grip";

// The phone scene: the Throughput Subcommittee, the Decide robot made again
// with real hands for this (public/models/phone/subcommittee.glb), walks up to
// the glass and takes the phone in one open hand, as a person holds one: palm
// to the glass, fingers round one side and thumb round the other.
//
// The phone is in the scene (David's design): a box the device's shape and
// size (in CSS pixels, at grip.ts's PHONE_SCALE), with the camera as its
// child, at the middle of its face toward the robot, looking straight out of
// it. The robot walks up until the phone is within its reach, and the lens
// fits its head in the band between the words. The grip is solved once for
// the phone's size (grip.ts, tested on the robot's own skeleton): where the
// wrist goes, and how each finger and the thumb bend round the phone's sides.
// The arm reaches there (inverse kinematics on the shoulder and elbow) as the
// hand turns to the grip and closes. At the grab the hand becomes the
// phone's parent: from then on it carries the phone, and the camera with it,
// so the robot's sway and tug move the view and the hand never leaves its
// arm. Its outline can be drawn for debugging, and window.phoneCamera moves the
// camera on it. Reduced motion: it's already holding it.

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
/** Where the robot starts. */
const START = 4.2;
/** How much of the arm's length the robot reaches to hold the phone (it walks up until the phone is that far). */
const REACH_FRACTION = 0.8;
/** How far the wrist is out past the shoulder (to the robot's left), so the arm holds the phone at its side. */
const WRIST_OUT = 0.04;
/** How much of the way the phone is turned toward the head before the grab; the robot turns it the rest. */
const PRE_AIM = 0.6;
/** How long the robot takes to turn the phone to face its head, once it has it, in seconds. */
const TURN_TIME = 0.6;
/** The robot looks at the phone from its first step (David, 2 Nov), turning its head this far at most, in radians. */
const LOOK_MAX = 1.0;
/** How long its head takes to come round to the phone, in seconds. */
const LOOK_TIME = 0.5;
const IDENTITY = new Quaternion();
/**
 * Once it has the phone, it's curious about it (David, 2 Nov): it pulls the phone in toward its face, gives it a
 * little shake, then holds it back out a little. In seconds from the grab.
 */
const CURIOUS = { pull: [0, 0.9], shake: [0.9, 1.7], back: [1.7, 2.5] } as const;
/** How near its face it brings the phone (the phone's middle, in metres from its face): much closer (David, 2 Nov). */
const NEAR = 0.24;
/** Its face, above its head bone (which is at the base of its head), in metres. */
const FACE_UP = 0.15;
/**
 * As it brings the phone in, it turns it nearly a quarter turn, to nearly landscape (David, 2 Nov), the way a left
 * hand turns easily: fingers, which point out to its left, swing up, so the phone's top goes toward its middle (a
 * turn about the world's +z, which points from the robot to the phone). The other way would twist its forearm.
 */
const LANDSCAPE = 1.4;
/** Where it holds the phone after: this share of the way in from where it took it. */
const REST = 0.7;
/** The widest and narrowest the camera's lens goes to fit the robot's head in the band between the words. */
const FOV_RANGE = [45, 100] as const;
/** Where the camera sits in the phone's frame, in metres: on its middle, a little way behind it (David, 2 Nov). */
const CAMERA_AT = new Vector3(0, 0, 0.35);
/** The head's height (with its antenna) in metres, for keeping it within the band. */
const HEAD_SIZE = 0.42;

export default function PhoneScene(props: PhoneSceneProps) {
  return (
    <Canvas
      aria-hidden="true"
      dpr={[1, 2]}
      frameloop={props.reducedMotion ? "demand" : "always"}
      camera={{ fov: 60, near: 0.02, far: 40, position: [0, 1.4, 0] }}
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
useLoader.preload(TextureLoader, PHOTO.url);
/** Where the room stands: the picture's camera just behind the phone's, so from the phone it's the picture it was. */
const ROOM_AT = new Vector3(0, 0, 0.4);

interface Arm extends Hand {
  /** Shoulder to elbow: the joints the arm's solve turns, to put the hand where the grip wants it. */
  joints: [Bone, Bone];
}

/** The grip solved for one size of phone, relative to its grip frame: kept, since solving it takes a while. */
interface Fit {
  key: string;
  wrist: Vector3;
  turn: Quaternion;
  digits: Quaternion[][];
}

function Grab({ reducedMotion, onGrabbed, onDrawn, zone, head }: PhoneSceneProps) {
  const model = useGLTF(MODEL, false);
  const { camera, size, invalidate, scene, gl } = useThree();
  const rig = useMemo(() => {
    const body = cloneSkinned(model.scene);
    const bounds = new Box3().setFromObject(body);
    const scale = HEIGHT / (bounds.max.y - bounds.min.y);
    body.scale.setScalar(scale);
    body.position.y = -bounds.min.y * scale;
    body.traverse((o) => (o.frustumCulled = false));
    const root = new Group();
    root.add(body);
    body.traverse((o) => void ((o as SkinnedMesh).isSkinnedMesh && freeLeftArm(o as SkinnedMesh)));
    const bone = (name: string) => body.getObjectByName(name) as Bone;
    // Its left hand: it faces the player, so that's on the right of the screen, the side its fingers go round
    // (grip.ts).
    const digits = ["Index", "Middle", "Ring", "Pinky", "Thumb"].map((f) =>
      [1, 2, 3, 4].map((n) => bone(`mixamorigLeftHand${f}${n}`)),
    );
    const arm: Arm = {
      joints: [bone("mixamorigLeftArm"), bone("mixamorigLeftForeArm")],
      hand: bone("mixamorigLeftHand"),
      digits,
      rest: digits.map((joints) => joints.map((j) => j.quaternion.clone())),
    };
    const mixer = new AnimationMixer(body);
    const clip = (name: string) =>
      model.animations.find((a) => a.name === name) ?? model.animations[0]!;
    const actions = { idle: mixer.clipAction(clip("idle")), walk: mixer.clipAction(clip("walk")) };
    actions.walk.play();
    return {
      root,
      arm,
      headBone: bone("mixamorigHead"),
      mixer,
      actions,
      playing: actions.walk as AnimationAction,
    };
  }, [model]);
  useEffect(() => () => void rig.mixer.stopAllAction(), [rig]);
  // The room, in 3D (room.ts), so the phone's moves show against it.
  const picture = useLoader(TextureLoader, PHOTO.url);
  const room = useMemo(() => {
    picture.colorSpace = NoColorSpace;
    const mesh = makeRoom(picture);
    mesh.position.copy(ROOM_AT);
    return mesh;
  }, [picture]);
  useEffect(
    () => () => {
      room.geometry.dispose();
      [room.material].flat().forEach((m) => m.dispose());
    },
    [room],
  );
  useEffect(() => {
    // Still: draw the one frame once the robot's in.
    if (reducedMotion) invalidate();
  }, [reducedMotion, invalidate]);

  // The phone, with the camera as its child; its outline drawn over everything, for debugging (phoneCamera.outline).
  const phone = useMemo(() => {
    const group = new Group();
    const box = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: "#ff3fa4", depthTest: false, transparent: true }),
    );
    box.renderOrder = 999;
    box.visible = false;
    group.add(box);
    return { group, box, frame: new Group() };
  }, []);
  // For debugging from the browser's console: where the camera sits on the phone, in the phone's frame (metres; the
  // phone's face toward the robot is at z = -its depth / 2, and the camera looks along -z).
  //   phoneCamera.set(x, y, z)  places it, from the next frame on;  phoneCamera.reset()  puts it back;
  //   phoneCamera.get()  says where it is, and the phone's size;      phoneCamera.fov(degrees)  widens or narrows it.
  //   phoneCamera.toggleOrbit()  frees the camera from the phone to orbit the middle of the palm (drag, wheel), or
  //     puts it back on the phone, and says which it is now (true: orbiting); phoneCamera.orbit(on) sets it outright;
  //   phoneCamera.orbitFrom(x, y, z)  puts the orbiting camera there from the palm, in the world (metres).
  // Orbiting starts off.
  const override = useRef<Vector3 | null>(null);
  const fovOverride = useRef<number | null>(null);
  const orbit = useRef<OrbitControls | null>(null);
  const orbitFrom = useRef<Vector3 | null>(null);
  /** phoneCamera.record's frames, while it records. */
  const recording = useRef<{
    until: number;
    frames: unknown[];
    done: (frames: unknown[]) => void;
  } | null>(null);
  /** The lens fitted to the head before the grab, kept for the hold (and for coming back from orbiting). */
  const fitted = useRef(60);
  /** How far the head was asked to turn to the phone, last frame (radians), for phoneCamera.get(). */
  const looked = useRef({ wanted: 0, lookIn: 0 });
  const palm = useMemo(() => new Vector3(), []);
  const setOrbit = (on: boolean) => {
    if (on === !!orbit.current) return;
    if (on) {
      const controls = new OrbitControls(camera, gl.domElement);
      controls.addEventListener("change", () => invalidate());
      orbit.current = controls;
    } else {
      orbit.current!.dispose();
      orbit.current = null;
      phone.group.add(camera);
    }
    invalidate();
  };
  useEffect(() => () => setOrbit(false), [camera, gl]);
  useEffect(() => {
    const control = {
      orbit: (on = true) => setOrbit(on),
      // phoneCamera.record(seconds)  records the phone camera's place and turn in the world every frame for that
      // long, and resolves with them: for finding jumps.
      record: (seconds: number) =>
        new Promise<unknown[]>((done) => {
          recording.current = { until: performance.now() + seconds * 1000, frames: [], done };
        }),
      toggleOrbit: () => {
        setOrbit(!orbit.current);
        return !!orbit.current;
      },
      orbitFrom: (x: number, y: number, z: number) => {
        setOrbit(true);
        orbitFrom.current = new Vector3(x, y, z);
      },
      set: (x: number, y: number, z: number) => void (override.current = new Vector3(x, y, z)),
      reset: () => {
        override.current = null;
        fovOverride.current = null;
      },
      get: () => ({
        camera: camera.position.toArray(),
        phone: phone.box.scale.toArray(),
        fov: (camera as PerspectiveCamera).fov,
        look: looked.current,
        // Which way the fingers point (the hand's +Y), and how far the phone's middle is from the face, in the world.
        fingers: new Vector3(0, 1, 0)
          .transformDirection(rig.arm.hand.matrixWorld)
          .toArray()
          .map((n) => +n.toFixed(2)),
        phoneToFace: +phone.group
          .getWorldPosition(new Vector3())
          .distanceTo(
            rig.headBone
              .getWorldPosition(new Vector3())
              .setY(rig.headBone.getWorldPosition(new Vector3()).y + FACE_UP),
          )
          .toFixed(3),
        // The arm's joints and the head, in the world, for checking the arm is at the robot's side.
        arm: Object.fromEntries(
          [
            ["shoulder", rig.arm.joints[0]],
            ["elbow", rig.arm.joints[1]],
            ["wrist", rig.arm.hand],
            ["head", rig.headBone],
            ["robot", rig.root],
          ].map(([name, o]) => [
            name,
            (o as Object3D)
              .getWorldPosition(new Vector3())
              .toArray()
              .map((n) => +n.toFixed(3)),
          ]),
        ),
      }),
      fov: (degrees: number) => void (fovOverride.current = degrees),
      // phoneCamera.outline(on)  draws the phone's outline over everything, or not (it starts off).
      outline: (on = true) => {
        phone.box.visible = on;
        invalidate();
      },
      // phoneCamera.onScreen()  where the thumb's and fingers' tips and the wrist are on screen, as shares across and down.
      onScreen: () =>
        Object.fromEntries(
          [
            ["thumbTip", rig.arm.digits[4]![3]!],
            ["thumbBase", rig.arm.digits[4]![0]!],
            ["indexTip", rig.arm.digits[0]![3]!],
            ["pinkyTip", rig.arm.digits[3]![3]!],
            ["wrist", rig.arm.hand],
            ["elbow", rig.arm.joints[1]],
          ].map(([name, b]) => {
            const v = (b as Object3D).getWorldPosition(new Vector3()).project(camera);
            return [name, [+((v.x + 1) / 2).toFixed(2), +((1 - v.y) / 2).toFixed(2)]];
          }),
        ),
      // phoneCamera.stretch()  the mesh's triangles stretched most from their bind shape, and the bones their corners follow.
      stretch: () => {
        let mesh: SkinnedMesh | undefined;
        rig.root.traverse(
          (o) => void ((o as SkinnedMesh).isSkinnedMesh && (mesh = o as SkinnedMesh)),
        );
        const m = mesh!;
        const pos = m.geometry.getAttribute("position");
        const index = m.geometry.getIndex()!;
        const skinIndex = m.geometry.getAttribute("skinIndex");
        const skinWeight = m.geometry.getAttribute("skinWeight");
        const posed = (i: number) =>
          m.applyBoneTransform(i, new Vector3().fromBufferAttribute(pos, i));
        const bind = (i: number) => new Vector3().fromBufferAttribute(pos, i);
        const bones = (i: number) =>
          [0, 1, 2, 3]
            .map((k) => [
              m.skeleton.bones[skinIndex.getComponent(i, k)]!.name.replace("mixamorig", ""),
              +skinWeight.getComponent(i, k).toFixed(2),
            ])
            .filter(([, w]) => (w as number) > 0.05);
        const worst: { ratio: number; tri: number[] }[] = [];
        for (let t = 0; t < index.count; t += 3) {
          const v = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
          let ratio = 0;
          for (let e = 0; e < 3; e++) {
            const a = v[e]!,
              b = v[(e + 1) % 3]!;
            const before = bind(a).distanceTo(bind(b));
            if (before > 1e-6) ratio = Math.max(ratio, posed(a).distanceTo(posed(b)) / before);
          }
          worst.push({ ratio, tri: v });
        }
        worst.sort((a, b) => b.ratio - a.ratio);
        return worst
          .slice(0, 8)
          .map((w) => ({ ratio: +w.ratio.toFixed(1), corners: w.tri.map(bones) }));
      },
    };
    (window as unknown as { phoneCamera?: typeof control }).phoneCamera = control;
    return () => void delete (window as unknown as { phoneCamera?: typeof control }).phoneCamera;
  }, [camera, phone, rig]);
  useEffect(() => {
    scene.add(phone.group);
    phone.group.add(camera);
    return () => {
      phone.group.parent?.remove(phone.group);
      phone.group.remove(camera);
      phone.box.geometry.dispose();
      (phone.box.material as LineBasicMaterial).dispose();
    };
  }, [scene, camera, phone]);

  const handLight = useRef<PointLight>(null);
  const started = useRef<number | null>(null);
  /** The grip, solved for this phone's size. */
  const fit = useRef<Fit | null>(null);
  /** Once the hand has the phone: the arm's and hand's pose then, held from there on. */
  const held = useRef<Quaternion[] | null>(null);
  /** Where the hand took the phone (its wrist) and how it was turned then, in the world. */
  const heldAt = useRef<{
    phone: Vector3;
    turn: Quaternion;
    reach: Vector3;
    inHand: Quaternion;
  } | null>(null);
  const work = useMemo(
    () => ({
      v: new Vector3(),
      w: new Vector3(),
      target: new Vector3(),
      q: new Quaternion(),
      parent: new Quaternion(),
      headAt: new Vector3(),
      top: new Vector3(),
      elbow: { angle: 0 },
    }),
    [],
  );

  useFrame(({ clock }, frameDelta) => {
    if (started.current === null) onDrawn?.();
    started.current ??= clock.elapsedTime;
    const t = reducedMotion ? REACH[1] + 1 : clock.elapsedTime - started.current;
    const delta = Math.min(frameDelta, 0.1);
    const cam = camera as PerspectiveCamera;
    const arm = rig.arm;
    const [shoulder] = arm.joints;
    const holding = t - REACH[1];

    // The phone: the device's shape, and the camera on its middle, CAMERA_AT behind it (David placed it there with
    // phoneCamera.set), looking straight out of its face toward the robot (its -z).
    const screen = phoneSize(size.width, size.height);
    phone.box.scale.set(screen.wide, screen.tall, screen.deep);
    const grip = gripFrame(phone.group, screen, phone.frame);
    if (!orbit.current) {
      if (override.current) cam.position.copy(override.current);
      else cam.position.copy(CAMERA_AT);
      cam.rotation.set(0, 0, 0);
    }

    // Walk, or stand; the animation first, then the arm and hand over it.
    const walked = ease(clamp01((t - WALK[0]) / (WALK[1] - WALK[0])));
    const next = walked < 1 && !reducedMotion ? rig.actions.walk : rig.actions.idle;
    if (rig.playing !== next) {
      next.reset().play();
      rig.playing.crossFadeTo(next, 0.3, false);
      rig.playing = next;
    }
    rig.mixer.update(reducedMotion ? 0 : delta);

    if (!held.current) {
      // The phone held up at the robot's left side, at world x = 0, turned partway toward its head; the robot
      // stands where the phone is a comfortable reach for its left hand with the wrist just out past its shoulder
      // (so the arm is at its side), and the camera at the height that puts its head in the band.
      const band = Math.max(0.12, zone.current.bottom - zone.current.top);
      const middle = 1 - (zone.current.top + zone.current.bottom); // the band's middle, in NDC y
      let distance = 0.8;
      let across = 0;
      let fov = 60;
      for (let pass = 0; pass < 5; pass++) {
        rig.root.position.set(across, 0, -distance);
        rig.root.updateMatrixWorld(true);
        rig.headBone.getWorldPosition(work.headAt);
        const tan = Math.tan(MathUtils.degToRad(fov / 2));
        // How far the camera (CAMERA_AT behind the phone) is from the head, across the floor.
        const away = Math.hypot(work.headAt.x, work.headAt.z - screen.deep / 2) + CAMERA_AT.z;
        phone.group.position.set(
          0,
          (work.headAt.y + HEIGHT) / 2 - middle * away * tan,
          screen.deep / 2,
        );
        phone.group.rotation.set(0, PRE_AIM * aimAt(work.headAt, phone.group.position), 0);
        phone.group.updateMatrixWorld(true);
        // The lens that fits the head into the band at this distance.
        fov = MathUtils.clamp(
          MathUtils.radToDeg(2 * Math.atan(HEAD_SIZE / (band * 0.8 * 2 * away))),
          FOV_RANGE[0],
          FOV_RANGE[1],
        );
        // The grip, solved for this phone once, and where its wrist is now.
        fit.current = solveFit(fit.current, arm, grip, phone.frame);
        const wrist = phone.frame.localToWorld(work.target.copy(fit.current.wrist));
        // The distance where the shoulder is REACH_FRACTION of the arm from that wrist.
        const reach =
          REACH_FRACTION *
          (arm.joints[0]
            .getWorldPosition(work.v)
            .distanceTo(arm.joints[1].getWorldPosition(work.w)) +
            work.w.distanceTo(arm.hand.getWorldPosition(new Vector3())));
        // The wrist from the shoulder, with the robot at `distance`; stepping the robot back by s adds s to its z.
        const off = wrist.sub(arm.joints[0].getWorldPosition(work.v));
        const ahead = Math.sqrt(Math.max(0, reach * reach - off.x * off.x - off.y * off.y));
        distance = Math.max(0.3, distance + ahead - off.z);
        across += off.x - WRIST_OUT;
      }
      fitted.current = fov;
      if (!orbit.current && fovOverride.current === null && Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      // The robot walks up from START to there.
      rig.root.position.set(across, 0, -(START + (distance - START) * walked));
      rig.root.updateMatrixWorld(true);

      // The reach: the arm to the grip's wrist, the hand turned to it, the fingers and thumb closing round the sides.
      const reach = reducedMotion ? 1 : ease(clamp01((t - REACH[0]) / (REACH[1] - REACH[0])));
      const close = reducedMotion ? 1 : ease(clamp01((t - REACH[1] + 0.3) / 0.3));
      const solved = fit.current!;
      if (reach > 0) {
        const turn = phone.frame.getWorldQuaternion(new Quaternion()).multiply(solved.turn);
        reachFor(
          arm,
          rig.root,
          phone.frame.localToWorld(work.target.copy(solved.wrist)),
          reach,
          work,
          new Vector3(0, 1, 0).applyQuaternion(turn),
        );
        (arm.hand.parent as Object3D).getWorldQuaternion(work.parent);
        arm.hand.quaternion.slerp(work.parent.invert().multiply(turn), reach);
        arm.hand.updateMatrixWorld(true);
        arm.digits.forEach((joints, d) =>
          joints
            .slice(0, 3)
            .forEach((j, n) =>
              j.quaternion.slerpQuaternions(
                arm.rest[d]![n]!,
                solved.digits[d]![n]!,
                0.2 * reach + 0.8 * close,
              ),
            ),
        );
        arm.hand.updateMatrixWorld(true);
      }
      if (handLight.current)
        arm.hand.getWorldPosition(handLight.current.position).add(work.v.set(0, 0.1, 0.4));

      // The grab: the hand takes the phone, and the camera with it.
      if (reach >= 1 && close >= 1) {
        arm.hand.attach(phone.group);
        held.current = [...arm.joints, arm.hand, ...arm.digits.flat()].map((b) =>
          b.quaternion.clone(),
        );
        const wrist = arm.hand.getWorldPosition(new Vector3());
        const turn = arm.hand.getWorldQuaternion(new Quaternion());
        const at = phone.group.getWorldPosition(new Vector3());
        // The phone's middle from the wrist, in the hand's own turn: where the phone goes when the hand turns.
        heldAt.current = {
          phone: at,
          turn,
          reach: at.clone().sub(wrist).applyQuaternion(turn.clone().invert()),
          inHand: phone.group.quaternion.clone(),
        };
        onGrabbed();
      }
    } else {
      // Held: the arm keeps its grip over the idle animation, and brings the phone in to look at it, shakes it a
      // little, then holds it back out a bit (CURIOUS); then, now and then, a small tug.
      const bones = [...arm.joints, arm.hand, ...arm.digits.flat()];
      bones.forEach((b, i) => b.quaternion.copy(held.current![i]!));
      rig.root.updateMatrixWorld(true);
      const { pull, shake, back } = CURIOUS;
      const s = reducedMotion ? back[1] : holding;
      const near =
        s < back[0]
          ? ease(clamp01((s - pull[0]) / (pull[1] - pull[0])))
          : 1 - (1 - REST) * ease(clamp01((s - back[0]) / (back[1] - back[0])));
      const took = heldAt.current!;
      rig.headBone.getWorldPosition(work.headAt).y += FACE_UP;
      // The shake: quick, small, side to side, fading in and out within its time.
      const shaking =
        !reducedMotion && s > shake[0] && s < shake[1]
          ? Math.sin(((s - shake[0]) / (shake[1] - shake[0])) * Math.PI)
          : 0;
      const wobble = shaking * Math.sin((s - shake[0]) * 2 * Math.PI * 5);
      // The hand keeps the turn it took the phone with, turned nearly to landscape as it comes in (and kept so), and
      // rolls with the shake.
      const landscape = s < back[0] ? near : 1;
      // Its own quaternion: reachFor uses work's as scratch, which once carried the hand off in one frame at the grab.
      const handTurn = new Quaternion()
        .copy(took.turn)
        .premultiply(
          work.parent.setFromAxisAngle(work.w.set(0, 0, 1), LANDSCAPE * landscape + 0.18 * wobble),
        );
      // Where the phone's middle goes: on the line from its face to where it took the phone, NEAR from its face at
      // the closest; and the wrist that puts it there, with the hand so turned.
      const closest = work.v.subVectors(took.phone, work.headAt).setLength(NEAR).add(work.headAt);
      const wrist = work.target.lerpVectors(took.phone, closest, near);
      // And it turns the phone the rest of the way to face its head (about the vertical), before the wrist is found,
      // so the turn doesn't carry the phone off its place.
      const turnIn = reducedMotion ? 1 : ease(clamp01(holding / TURN_TIME));
      const facing = work.w.set(0, 0, 1).applyQuaternion(took.inHand).applyQuaternion(handTurn); // the phone's +z, the way it faces
      const turnBy = aimAt(work.headAt, wrist) - Math.atan2(facing.x, facing.z);
      handTurn.premultiply(work.parent.setFromAxisAngle(work.w.set(0, 1, 0), turnIn * turnBy));
      wrist.x += 0.025 * wobble;
      wrist.sub(work.w.copy(took.reach).applyQuaternion(handTurn));
      reachFor(arm, rig.root, wrist, 1, work, new Vector3(0, 1, 0).applyQuaternion(handTurn));
      // Half the hand's twist about the forearm's length goes to the forearm, so the wrist doesn't wring: a skinned
      // wrist turned nearly a quarter turn alone pinches. The rig's bones lie along their +Y.
      const fore = arm.joints[1];
      const local = fore.getWorldQuaternion(new Quaternion()).invert().multiply(handTurn);
      const twist = new Quaternion(0, local.y, 0, local.w).normalize();
      fore.quaternion.multiply(new Quaternion().slerpQuaternions(IDENTITY, twist, 0.5));
      fore.updateMatrixWorld(true);
      arm.hand.quaternion.copy(
        fore.getWorldQuaternion(new Quaternion()).invert().multiply(handTurn),
      );
      if (!reducedMotion) {
        const tug =
          clamp01(s - back[1]) *
          (Math.max(0, Math.sin((s - back[1]) * 2.1)) ** 3 * 0.12 +
            Math.sin((s - back[1]) * 1.3) * 0.03);
        arm.joints[1].rotateX(-tug);
      }
      rig.root.updateMatrixWorld(true);
      if (fovOverride.current !== null && cam.fov !== fovOverride.current) {
        cam.fov = fovOverride.current;
        cam.updateProjectionMatrix();
      }
      if (handLight.current)
        arm.hand.getWorldPosition(handLight.current.position).add(work.v.set(0, 0.1, 0.4));
    }
    // It looks into the phone's camera, walking up, reaching and holding: its head turned (over the animation's)
    // from where the robot faces to the camera's place on the phone, as far as LOOK_MAX.
    const lookIn = reducedMotion ? 1 : ease(clamp01((t - WALK[0]) / LOOK_TIME));
    rig.headBone.getWorldPosition(work.headAt);
    const toPhone = phone.group
      .localToWorld(work.w.copy(override.current ?? CAMERA_AT))
      .sub(work.headAt)
      .normalize();
    work.q.setFromUnitVectors(
      work.v.set(0, 0, 1).transformDirection(rig.root.matrixWorld),
      toPhone,
    );
    const angle = 2 * Math.acos(Math.min(1, Math.abs(work.q.w)));
    looked.current = { wanted: angle, lookIn };
    // From the identity toward the full turn (slerpQuaternions copies its first argument into the result first, so
    // the full turn can't be both the target and the result).
    const turn = new Quaternion().slerpQuaternions(
      IDENTITY,
      work.q,
      lookIn * Math.min(1, LOOK_MAX / Math.max(angle, 1e-6)),
    );
    const headTurn = rig.headBone.getWorldQuaternion(new Quaternion()).premultiply(turn);
    rig.headBone.quaternion.copy(
      (rig.headBone.parent as Object3D).getWorldQuaternion(work.parent).invert().multiply(headTurn),
    );
    rig.headBone.updateMatrixWorld(true);

    if (recording.current) {
      const r = recording.current;
      // Where the phone camera is, whether or not the view is orbiting: its place on the phone.
      phone.group.updateMatrixWorld(true);
      const at = phone.group.localToWorld(new Vector3().copy(override.current ?? CAMERA_AT));
      const turn = phone.group.getWorldQuaternion(new Quaternion());
      // For phoneCamera.record: how near the thumb comes to the forearm's line (elbow to wrist), and how the wrist bends and twists.
      const elbow = arm.joints[1].getWorldPosition(new Vector3());
      const wristAt = arm.hand.getWorldPosition(new Vector3());
      const thumb = [arm.hand, ...arm.digits[4]!].map((b) => b.getWorldPosition(new Vector3()));
      let thumbToFore = Infinity;
      const seg = (p: Vector3) => {
        const d = wristAt.clone().sub(elbow);
        const k = clamp01(p.clone().sub(elbow).dot(d) / d.lengthSq());
        return { dist: p.distanceTo(elbow.clone().addScaledVector(d, k)), k };
      };
      let thumbK = 0;
      for (let i = 1; i < thumb.length; i++)
        for (let j = 0; j <= 8; j++) {
          const m = seg(thumb[i - 1]!.clone().lerp(thumb[i]!, j / 8));
          if (m.k < 1 && m.dist < thumbToFore) [thumbToFore, thumbK] = [m.dist, m.k];
        }
      const foreY = new Vector3(0, 1, 0).transformDirection(arm.joints[1].matrixWorld);
      const handY = new Vector3(0, 1, 0).transformDirection(arm.hand.matrixWorld);
      const rel = arm.joints[1]
        .getWorldQuaternion(new Quaternion())
        .invert()
        .multiply(arm.hand.getWorldQuaternion(new Quaternion()));
      const twistAt = 2 * Math.atan2(rel.y, rel.w);
      r.frames.push({
        t: +t.toFixed(3),
        held: !!held.current,
        at: at.toArray().map((n) => +n.toFixed(6)),
        turn: turn.toArray().map((n) => +n.toFixed(7)),
        thumbToFore: +thumbToFore.toFixed(3),
        thumbK: +thumbK.toFixed(2),
        bend: +((foreY.angleTo(handY) * 180) / Math.PI).toFixed(1),
        twist: +((twistAt * 180) / Math.PI).toFixed(1),
        thumb: thumb.map((v) =>
          arm.hand
            .worldToLocal(v.clone())
            .toArray()
            .map((n) => +n.toFixed(3)),
        ),
        elbowInHand: arm.hand
          .worldToLocal(elbow.clone())
          .toArray()
          .map((n) => +n.toFixed(3)),
      });
      if (performance.now() > r.until) {
        recording.current = null;
        r.done(r.frames);
      }
    }

    const lens = fovOverride.current ?? (orbit.current ? cam.fov : fitted.current);
    if (cam.fov !== lens) {
      cam.fov = lens;
      cam.updateProjectionMatrix();
    }
    rig.headBone.getWorldPosition(work.headAt);

    // Orbiting: the camera in the world, round the middle of the palm (between the wrist and the middle finger's
    // knuckle), following it as the robot moves.
    if (orbit.current) {
      const controls = orbit.current;
      arm.hand
        .getWorldPosition(work.v)
        .add(arm.digits[1]![0]!.getWorldPosition(work.w))
        .multiplyScalar(0.5);
      if (cam.parent !== scene) {
        scene.attach(cam);
        cam.position.copy(work.v).add(work.w.set(0.45, 0.15, 0.25));
        cam.fov = 50;
        cam.updateProjectionMatrix();
      } else cam.position.add(work.w.copy(work.v).sub(palm));
      if (orbitFrom.current) {
        cam.position.copy(work.v).add(orbitFrom.current);
        orbitFrom.current = null;
      }
      palm.copy(work.v);
      controls.target.copy(palm);
      controls.update();
    }

    // Where the head is drawn, for anyone checking that the words never cover it.
    if (head?.current) {
      // From the head's base to the top of the robot (its antenna): the rig's own head-top bone sits above the model.
      rig.root
        .localToWorld(work.top.set(0, HEIGHT, 0))
        .setX(work.headAt.x)
        .setZ(work.headAt.z);
      const a = work.headAt.clone().project(cam);
      const b = work.top.clone().project(cam);
      const tallPx = Math.abs(b.y - a.y) * (size.height / 2);
      const x = ((a.x + 1) / 2) * size.width;
      const y = ((1 - (a.y + b.y) / 2) / 2) * size.height;
      head.current.dataset.head = [x - tallPx / 2, y - tallPx / 2, tallPx, tallPx]
        .map(Math.round)
        .join(",");
    }
  });

  return (
    <>
      <primitive object={room} />
      <primitive object={rig.root} />
      {/* A light at the glass, by the hand, so it stands out from the robot's own navy behind it. */}
      <pointLight ref={handLight} intensity={2.2} distance={1.6} decay={1.2} color="#dfe6ff" />
    </>
  );
}

/**
 * The model's skinning ties some of its left forearm to its body: where the arm touches its hip in the model's rest
 * pose the mesh is joined, and those vertices follow the spine, hips and left thigh as well (by up to 43%). With the
 * elbow up, as the hold has it, they stretch into a long sliver from the arm to the hip. So the arm is cut from the
 * body there: a vertex mostly the left arm's follows the arm alone, the rest of those the body alone, and the
 * triangles that would join the two are dropped. Done on a copy of the geometry, since clones of the model share it.
 */
function freeLeftArm(mesh: SkinnedMesh) {
  const geometry = mesh.geometry.clone();
  const names = mesh.skeleton.bones.map((b) => b.name);
  const arm = names.map((n) => /^mixamorig:?Left(Arm|ForeArm|Hand)/.test(n));
  const body = names.map((n) => /^mixamorig:?(Hips|Spine\d*|(Left|Right)(UpLeg|Leg))$/.test(n));
  const index = geometry.getAttribute("skinIndex");
  const weight = geometry.getAttribute("skinWeight");
  /** 1: the arm's, -1: the body's, cut from the arm; 0: neither touched. */
  const side = new Int8Array(index.count);
  for (let i = 0; i < index.count; i++) {
    const bones = [0, 1, 2, 3].map((k) => index.getComponent(i, k));
    const weights = [0, 1, 2, 3].map((k) => weight.getComponent(i, k));
    const share = (of: boolean[]) =>
      weights.reduce((sum, w, k) => sum + (of[bones[k]!] ? w : 0), 0);
    const onArm = share(arm);
    if (onArm < 0.001 || share(body) < 0.001) continue;
    side[i] = onArm >= ARM_SHARE ? 1 : -1;
    const drop = side[i] > 0 ? body : arm;
    const kept = weights.map((w, k) => (drop[bones[k]!] ? 0 : w));
    const total = kept.reduce((a, b) => a + b, 0);
    kept.forEach((w, k) => weight.setComponent(i, k, total > 0 ? w / total : k === 0 ? 1 : 0));
  }
  const isArm = (i: number) =>
    side[i] > 0 ||
    (side[i] === 0 &&
      [0, 1, 2, 3].some((k) => arm[index.getComponent(i, k)]! && weight.getComponent(i, k) > 0.5));
  const triangles = geometry.getIndex()!;
  const kept: number[] = [];
  for (let t = 0; t < triangles.count; t += 3) {
    const corners = [triangles.getX(t), triangles.getX(t + 1), triangles.getX(t + 2)];
    const cut = corners.some((c) => side[c] !== 0);
    if (cut && new Set(corners.map(isArm)).size > 1) continue;
    kept.push(...corners);
  }
  geometry.setIndex(kept);
  weight.needsUpdate = true;
  mesh.geometry = geometry;
}
/** A vertex this much the arm's is the arm's. */
const ARM_SHARE = 0.5;

/**
 * The grip for this phone's size, solved on the hand itself and kept (in the grip frame) until the size changes:
 * the hand is turned and put where the grip wants it, its digits closed round the phone's sides, and the result
 * read off; then the hand's own pose is put back (the arm reaches for it frame by frame).
 */
function solveFit(kept: Fit | null, arm: Arm, size: PhoneSize, frame: Object3D): Fit {
  const key = [size.wide, size.tall, size.deep].map((n) => n.toFixed(4)).join(",");
  if (kept?.key === key) return kept;
  const parent = arm.hand.parent!;
  parent.updateMatrixWorld(true);
  const saved = {
    at: arm.hand.position.clone(),
    turn: arm.hand.quaternion.clone(),
    digits: arm.digits.map((j) => j.map((b) => b.quaternion.clone())),
  };
  const turn = gripRotation(frame);
  arm.hand.quaternion.copy(parent.getWorldQuaternion(new Quaternion()).invert().multiply(turn));
  arm.hand.updateMatrixWorld(true);
  const wrist = fitGrip(arm, frame, size);
  arm.hand.position.copy(parent.worldToLocal(wrist.clone()));
  arm.hand.updateMatrixWorld(true);
  closeGrip(arm, frame, size, 1);
  const fit: Fit = {
    key,
    wrist: frame.worldToLocal(wrist.clone()),
    turn: frame.getWorldQuaternion(new Quaternion()).invert().multiply(turn),
    digits: arm.digits.map((j) => j.map((b) => b.quaternion.clone())),
  };
  arm.hand.position.copy(saved.at);
  arm.hand.quaternion.copy(saved.turn);
  arm.digits.forEach((j, d) => j.forEach((b, n) => b.quaternion.copy(saved.digits[d]![n]!)));
  arm.hand.updateMatrixWorld(true);
  return fit;
}

/**
 * Turns an arm's two joints so its hand reaches `target` (cyclic coordinate descent, in world space),
 * blended from the animated pose by `weight`.
 */
function reachFor(
  arm: Arm,
  body: Object3D,
  target: Vector3,
  weight: number,
  work: { v: Vector3; w: Vector3; q: Quaternion; parent: Quaternion; elbow: { angle: number } },
  fingers?: Vector3,
) {
  // Two bones, solved outright: the elbow where both reach, bent out to the robot's left and down (ELBOW), so the
  // arm stays at its side and never folds in through its body. Given which way the hand's fingers point (world), the
  // elbow goes instead where the forearm lines up with the hand best, of the places on its circle that are out at
  // the robot's side: so the wrist bends least, and the forearm turns the hand rather than the wrist wringing it.
  const [upper, fore] = arm.joints;
  const saved = arm.joints.map((j) => j.quaternion.clone());
  const s = upper.getWorldPosition(new Vector3());
  const e = fore.getWorldPosition(new Vector3());
  const w = arm.hand.getWorldPosition(new Vector3());
  const a = s.distanceTo(e);
  const b = e.distanceTo(w);
  const toTarget = target.clone().sub(s);
  const d = MathUtils.clamp(toTarget.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const along = toTarget.normalize();
  const pole = ELBOW.clone().transformDirection(body.matrixWorld);
  const out = pole.sub(along.clone().multiplyScalar(pole.dot(along))).normalize();
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const centre = s.clone().add(along.clone().multiplyScalar(a * cos));
  const radius = a * Math.sqrt(Math.max(0, 1 - cos * cos));
  let elbow = centre.clone().add(out.clone().multiplyScalar(radius));
  if (fingers) {
    const side = along.clone().cross(out);
    const inBody = body.matrixWorld.clone().invert();
    const shoulderX = s.clone().applyMatrix4(inBody).x;
    // Near where it was last frame, so it never jumps round its circle from one frame to the next.
    let best = -Infinity;
    const from = work.elbow.angle;
    let chosen = from;
    for (let k = -ELBOW_TRIES; k <= ELBOW_TRIES; k++) {
      const angle = from + (k / ELBOW_TRIES) * ELBOW_STEP;
      const at = centre
        .clone()
        .addScaledVector(out, radius * Math.cos(angle))
        .addScaledVector(side, radius * Math.sin(angle));
      // Out at its side: kept from going in toward its middle past the shoulder.
      const lined =
        target.clone().sub(at).normalize().dot(fingers) -
        10 * Math.max(0, shoulderX - at.clone().applyMatrix4(inBody).x);
      if (lined > best) [best, elbow, chosen] = [lined, at, angle];
    }
    work.elbow.angle = chosen;
  }
  const aim = (joint: Bone, from: Vector3, now: Vector3, want: Vector3) => {
    work.q.setFromUnitVectors(
      work.v.subVectors(now, from).normalize(),
      work.w.subVectors(want, from).normalize(),
    );
    (joint.parent as Object3D).getWorldQuaternion(work.parent);
    joint.quaternion.premultiply(
      work.parent.clone().invert().multiply(work.q).multiply(work.parent),
    );
    joint.updateMatrixWorld(true);
  };
  aim(upper, s, e, elbow);
  aim(fore, fore.getWorldPosition(e), arm.hand.getWorldPosition(w), target);
  arm.joints.forEach((j, i) => {
    j.quaternion.slerpQuaternions(saved[i]!, j.quaternion.clone(), weight);
    j.updateMatrixWorld(true);
  });
}
/** Which way the elbow bends, in the robot's own frame: out to its left (+x), down, and a little back. */
const ELBOW = new Vector3(1, -1, -0.3).normalize();
/** How far round its circle the elbow may move in a frame (radians), tried at this many places each way. */
const ELBOW_STEP = 0.08;
const ELBOW_TRIES = 8;

/** The turn about the vertical that points a camera at `from`, looking along its -z, at `head`. */
function aimAt(head: Vector3, from: Vector3): number {
  return Math.atan2(-(head.x - from.x), -(head.z - from.z));
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
