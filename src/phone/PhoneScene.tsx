import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  QuadraticBezierCurve3,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from "three";

import { BOSSES } from "~/platform/bosses/bosses";

// The phone scene: the Throughput Subcommittee (its boxy head, square eyes and
// counter screen) leans in from the back of the room and reaches out with one
// of its corrugated turnstile arms until the claw fills the screen, then
// clamps it, as if grabbing the phone in the player's hand. A shake on the
// grab, then it keeps tugging. Low-poly and built here, no model to load.
// With reduced motion it's already holding the phone, and nothing moves.

export interface PhoneSceneProps {
  reducedMotion: boolean;
  /** Called once the claw has closed on the phone. */
  onGrabbed: () => void;
}

/** When things happen, in seconds from the scene's start. */
const REACH = [0.7, 1.7] as const;
const CLOSE = [1.7, 1.95] as const;
const SHAKE = 0.6;
/** The robot, at the back of the room; its arm leaves from its right shoulder. */
const ROBOT = new Vector3(0.25, 0.55, -9);
const SHOULDER = new Vector3(0.95, -0.35, -8.6);
const FINGERS = 3;
const RINGS = 34;

interface Finger {
  finger: Group;
  base: Group;
  tip: Group;
}

export default function PhoneScene({ reducedMotion, onGrabbed }: PhoneSceneProps) {
  return (
    <Canvas
      aria-hidden="true"
      dpr={[1, 2]}
      frameloop={reducedMotion ? "demand" : "always"}
      camera={{ fov: 55, near: 0.05, far: 40, position: [0, 0, 0] }}
      gl={{ antialias: true, alpha: true }}
    >
      <hemisphereLight args={["#c9d0ff", "#1c1630", 1.2]} />
      <directionalLight position={[2, 3, 2]} intensity={1.8} color="#fff3e2" />
      <pointLight position={[0, 0, -1.2]} intensity={1.4} distance={4} color={BOSSES.readers.tint} />
      <Grab reducedMotion={reducedMotion} onGrabbed={onGrabbed} />
    </Canvas>
  );
}

function Grab({ reducedMotion, onGrabbed }: PhoneSceneProps) {
  const { camera, size, invalidate } = useThree();
  const parts = useMemo(makeRobot, []);
  const started = useRef<number | null>(null);
  const told = useRef(false);
  const work = useMemo(() => ({ curve: new QuadraticBezierCurve3(new Vector3(), new Vector3(), new Vector3()), at: new Vector3(), next: new Vector3(), dummy: new Object3D() }), []);
  useEffect(() => () => parts.dispose(), [parts]);
  useEffect(() => {
    // Still: already holding it. Draw the one frame.
    if (reducedMotion) invalidate();
  }, [reducedMotion, invalidate]);

  useFrame(({ clock }) => {
    started.current ??= clock.elapsedTime;
    const t = reducedMotion ? CLOSE[1] + 0.5 : clock.elapsedTime - started.current;
    const cam = camera as PerspectiveCamera;

    // Where the claw ends up: close enough that its splayed fingers reach past the screen's sides.
    const halfWide = Math.tan(MathUtils.degToRad(cam.fov / 2)) * (size.width / size.height);
    const grabAt = new Vector3(0, -0.08, -0.72 / halfWide);
    const reach = ease(clamp01((t - REACH[0]) / (REACH[1] - REACH[0])));
    const close = ease(clamp01((t - CLOSE[0]) / (CLOSE[1] - CLOSE[0])));
    const holding = t - CLOSE[1];
    // Once it has the phone, it keeps tugging at it.
    const tug = holding > 0 && !reducedMotion ? Math.max(0, Math.sin(holding * 2.1)) ** 3 * 0.12 : 0;

    // The claw: from just in front of the shoulder to the grab, with the tug pulling it back.
    const start = SHOULDER.clone().add(new Vector3(-0.3, 0.6, 0.8));
    parts.claw.position.lerpVectors(start, grabAt, reach);
    parts.claw.position.z -= tug;
    parts.claw.rotation.z = (1 - reach) * 0.9 + (holding > 0 && !reducedMotion ? Math.sin(holding * 1.3) * 0.04 : 0);
    // The fingers splay as it reaches, stay wide to span the phone, and their tips curl round its edges.
    parts.fingers.forEach(({ finger, base, tip }, i) => {
      base.rotation.x = -0.45 - 0.7 * reach;
      tip.rotation.x = 0.35 - 0.2 * reach + 1.25 * close;
      finger.rotation.z = (i / FINGERS) * Math.PI * 2 + Math.PI / 2;
    });

    // The arm: a corrugated hose from the shoulder, sagging, to the back of the claw.
    work.curve.v0.copy(SHOULDER);
    work.curve.v2.copy(parts.claw.position).add(new Vector3(0, 0, -0.35));
    work.curve.v1.lerpVectors(work.curve.v0, work.curve.v2, 0.5).add(new Vector3(0.6, -0.9, 0));
    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1);
      work.curve.getPoint(u, work.at);
      work.curve.getPoint(Math.min(1, u + 0.01), work.next);
      work.dummy.position.copy(work.at);
      work.dummy.lookAt(work.next);
      work.dummy.rotateX(Math.PI / 2);
      work.dummy.scale.setScalar(0.85 + 0.35 * u);
      work.dummy.updateMatrix();
      parts.hose.setMatrixAt(i, work.dummy.matrix);
    }
    parts.hose.instanceMatrix.needsUpdate = true;

    // The robot leans toward its prize; its eyes narrow as it grabs.
    parts.robot.rotation.x = -0.12 * reach + (reducedMotion ? 0 : Math.sin(t * 1.4) * 0.02);
    parts.robot.position.y = ROBOT.y + (reducedMotion ? 0 : Math.sin(t * 1.4) * 0.04);
    const squint = 1 - 0.55 * close + (t > 4 && !reducedMotion && (t % 3.7) < 0.12 ? -0.4 : 0);
    for (const eye of parts.eyes) eye.scale.y = Math.max(0.1, squint);

    // The grab shakes the phone, then it sways in the robot's grip.
    const shake = holding > 0 && holding < SHAKE && !reducedMotion ? (1 - holding / SHAKE) * 0.035 : 0;
    camera.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, -tug * 0.4);
    camera.rotation.set(0, 0, close * 0.07 + (holding > 0 && !reducedMotion ? Math.sin(holding * 1.3) * 0.02 : 0));

    if (close >= 1 && !told.current) {
      told.current = true;
      onGrabbed();
    }
  });

  return (
    <>
      <primitive object={parts.robot} />
      <primitive object={parts.hose} />
      <primitive object={parts.claw} />
    </>
  );
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** The robot, its arm and its claw, in the Throughput Subcommittee's navy, violet and blue. */
function makeRobot() {
  const navy = new MeshStandardMaterial({ color: "#2b3163", metalness: 0.35, roughness: 0.5 });
  const violet = new MeshStandardMaterial({ color: "#4b4290", metalness: 0.4, roughness: 0.45 });
  const steel = new MeshStandardMaterial({ color: "#8e95b8", metalness: 0.7, roughness: 0.35 });
  const glow = new MeshStandardMaterial({ color: "#0b1530", emissive: BOSSES.readers.tint, emissiveIntensity: 2.2 });
  const screen = new MeshStandardMaterial({ map: counterTexture(), emissive: "#ffffff", emissiveIntensity: 0.9, emissiveMap: null });
  screen.emissiveMap = screen.map;
  const geometries: { dispose(): void }[] = [];
  const box = (w: number, h: number, d: number) => {
    const g = new BoxGeometry(w, h, d);
    geometries.push(g);
    return g;
  };
  const mesh = (geometry: BufferGeometry, material: MeshStandardMaterial, at: [number, number, number] = [0, 0, 0]) => {
    const m = new Mesh(geometry, material);
    m.position.set(...at);
    return m;
  };

  // The robot: a boxy head with two square eyes and an antenna, over a counter screen.
  const robot = new Group();
  robot.position.copy(ROBOT);
  const head = mesh(box(1.1, 0.9, 0.8), navy, [0, 0.55, 0]);
  const eyes = [-0.24, 0.24].map((x) => mesh(box(0.2, 0.2, 0.05), glow, [x, 0.6, 0.41]));
  const antenna = mesh(box(0.06, 0.4, 0.06), steel, [0.3, 1.2, 0]);
  const torso = mesh(box(1.5, 1.1, 0.9), violet, [0, -0.55, 0]);
  const counter = mesh(box(1.0, 0.42, 0.05), screen, [0, -0.45, 0.46]);
  robot.add(head, ...eyes, antenna, torso, counter);

  // The arm: rings of a corrugated hose, placed along a curve each frame.
  const ring = new TorusGeometry(0.16, 0.06, 8, 18);
  geometries.push(ring);
  const hose = new InstancedMesh(ring, navy, RINGS);
  hose.frustumCulled = false;

  // The claw: a wrist with a glowing band, and fingers round it, pointing at the player.
  // Each finger turns about the wrist; its base bends out from it and its tip curls back in.
  const claw = new Group();
  const wrist = new CylinderGeometry(0.2, 0.24, 0.32, 20).rotateX(Math.PI / 2);
  const band = new TorusGeometry(0.22, 0.035, 8, 24);
  geometries.push(wrist, band);
  claw.add(mesh(wrist, violet), mesh(band, glow));
  const fingers: Finger[] = [];
  for (let i = 0; i < FINGERS; i++) {
    const finger = new Group();
    const base = new Group();
    base.position.set(0, 0.18, 0.12);
    const tip = new Group();
    tip.position.set(0, 0, 0.55);
    tip.add(mesh(box(0.11, 0.11, 0.42), navy, [0, 0, 0.2]), mesh(box(0.12, 0.05, 0.1), glow, [0, -0.06, 0.4]));
    base.add(mesh(box(0.13, 0.13, 0.55), steel, [0, 0, 0.27]), tip);
    finger.add(base);
    claw.add(finger);
    fingers.push({ finger, base, tip });
  }

  return {
    robot,
    hose,
    claw,
    eyes,
    fingers,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of [navy, violet, steel, glow, screen]) m.dispose();
      screen.map?.dispose();
    },
  };
}

/** The Subcommittee's chest counter, its number in blue on black. */
function counterTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 108;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#050a18";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = BOSSES.readers.tint;
  g.font = "bold 76px ui-monospace, monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("1437", 128, 58);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
