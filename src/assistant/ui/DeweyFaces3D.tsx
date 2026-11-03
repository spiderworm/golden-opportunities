import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type Object3D,
} from "three";
import { failedLoad, softFailFor, type Failed } from "~/platform/bosses/soft-load";

// Dewey's faces in 3D (David, 2 Nov: "2D static portrats and speech bubbles, but 3D animated in browsers that
// support it"): one canvas over the conversation, and Dewey's model drawn into it once for each of his faces
// in view, each in its own square, where the panel's portrait sits. Every face but one keeps a slow, almost
// invisible idle; one talks, the face beside the turn that has focus or the pointer, or else his last
// ("all of Dewey's chat avatars should have a simple, almost invisible idle animation, except for one"). The
// model is public/dewey/dewey.glb (provenance.json there). David, 3 Nov: "a high quality 'thinking' animation...
// 'loading' or 'lightbulb' animation on Dewey's screen while coming up with an answer", and the active face's
// "mouth moving excitedly". So while he works out an answer, a ring of light chases round his screen and his desk
// lamp pulses; when the answer comes, the lamp flares (the lightbulb) and he hops; and the face that talks moves
// its mouth, without pause while his answer streams in, in phrases after. Loaded only once the browser has shown it can draw
// WebGL 2, and not for reduced motion, where the portraits stay.

export const MODEL = "/dewey/dewey.glb";
const softFail = softFailFor([MODEL]);

export interface Activity {
  turn: number;
  kind: "thinking" | "saying";
}

export interface DeweyFacesProps {
  /** Where each face goes: the portraits' boxes, by turn (the greeting is turn 0 when there are no replies). */
  slots: RefObject<Map<number, HTMLElement>>;
  /** The turn whose face talks. */
  talking: RefObject<number>;
  /** The turn Dewey is answering, if any: still thinking (no words yet), or saying it as it streams in. */
  activity: RefObject<Activity | null>;
  /** Called once a face has been drawn, so the portraits under the canvas can go. */
  onDrawn: () => void;
  /** Called if the model doesn't arrive: the portraits stay. */
  onFailed: () => void;
}

/** The canvas, filling its parent (positioned) and letting the pointer through to the conversation. */
export default function DeweyFaces3D(props: DeweyFacesProps) {
  const holder = useRef<HTMLDivElement>(null);
  // Drawn only while the conversation is on screen.
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(([entry]) => setShown(!!entry?.isIntersecting));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <div ref={holder} style={holderStyle} aria-hidden="true">
      <Canvas
        frameloop={shown ? "always" : "never"}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ pointerEvents: "none" }}
      >
        <Suspense fallback={null}>
          <Faces {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}

const holderStyle = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
} satisfies React.CSSProperties;

/**
 * The camera on each face: all of him, base to lamp (the model is 0.98 tall and 0.82 wide), with a little room
 * for his bob and sway (David, 3 Nov: he was "cut off at the bottom").
 */
const CAMERA = { fov: 23, at: [0, 0.5, 2.8] as const, look: [0, 0.48, 0] as const };

/** How quickly a face eases into talking or back to idle (per second). */
const EASE = 4;

function Faces({ slots, talking, activity, onDrawn, onFailed }: DeweyFacesProps) {
  const loaded = useGLTF(MODEL, false, undefined, softFail) as unknown as
    { scene: Object3D } | Failed;
  const failed = failedLoad(loaded);
  // Told once, whatever the panel passes as onFailed from one render to the next.
  const told = useRef(false);
  useEffect(() => {
    if (!failed || told.current) return;
    told.current = true;
    onFailed();
  }, [failed, onFailed]);
  // His own scene and camera, drawn by hand into each face's square, not R3F's.
  const view = useMemo(() => {
    if (failedLoad(loaded)) return null;
    const scene = new Scene();
    scene.add(new HemisphereLight("#fff4e0", "#2a2140", 1.4));
    const key = new DirectionalLight("#ffe7c2", 1.8);
    key.position.set(1.2, 2.5, 3);
    scene.add(key);
    const dewey = new Group();
    const body = loaded.scene.clone();
    dewey.add(body);
    scene.add(dewey);
    const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 10);
    camera.position.set(...CAMERA.at);
    camera.lookAt(...CAMERA.look);
    return { scene, camera, dewey, face: faceParts(dewey, body) };
  }, [loaded]);
  const { gl } = useThree();
  /** Each face's state, by turn: how far into talking and thinking (0 to 1), and the lightbulb's flare. */
  const moods = useRef(new Map<number, Mood>());
  const drawn = useRef(false);

  // Priority 1: R3F leaves the drawing to this.
  useFrame((state, delta) => {
    if (!view) return;
    const box = gl.domElement.getBoundingClientRect();
    gl.setScissorTest(false);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.setScissorTest(true);
    const t = state.clock.elapsedTime;
    let any = false;
    for (const [turn, slot] of slots.current) {
      const r = slot.getBoundingClientRect();
      const x = r.left - box.left;
      const y = box.bottom - r.bottom;
      // Out of the conversation's view: nothing to draw.
      if (x + r.width <= 0 || y + r.height <= 0 || x >= box.width || y >= box.height) continue;
      const doing = activity.current?.turn === turn ? activity.current.kind : null;
      const mood = moods.current.get(turn) ?? newMood(turn === talking.current, doing);
      moods.current.set(turn, mood);
      step(mood, turn === talking.current, doing, delta);
      pose(view.dewey, t, turn, mood.talk, mood.think, mood.flare);
      view.face.show(t, turn, mood, doing === "saying");
      gl.setViewport(x, y, r.width, r.height);
      gl.setScissor(x, y, r.width, r.height);
      gl.render(view.scene, view.camera);
      any = true;
    }
    gl.setScissorTest(false);
    if (any && !drawn.current) {
      drawn.current = true;
      onDrawn();
    }
  }, 1);
  return null;
}

/** One face's state, eased frame to frame. */
interface Mood {
  talk: number;
  think: number;
  /** The lightbulb: 1 as an answer arrives, fading. */
  flare: number;
  /** What it was doing last frame, to catch the moment thinking turns into an answer. */
  was: Activity["kind"] | null;
}

function newMood(talking: boolean, doing: Activity["kind"] | null): Mood {
  return { talk: talking ? 1 : 0, think: doing === "thinking" ? 1 : 0, flare: 0, was: doing };
}

/** Eases a face toward what it's doing; thinking outranks talking, and an answer arriving lights the lamp. */
function step(mood: Mood, talking: boolean, doing: Activity["kind"] | null, delta: number) {
  const ease = Math.min(1, delta * EASE);
  const thinking = doing === "thinking";
  mood.think += ((thinking ? 1 : 0) - mood.think) * ease;
  mood.talk += ((talking && !thinking ? 1 : 0) - mood.talk) * ease;
  if (mood.was === "thinking" && !thinking) mood.flare = 1;
  mood.flare *= Math.exp(-delta * 2.2);
  mood.was = doing;
}

/**
 * Dewey's pose at time `t` (seconds) for turn `turn`: `talking` and `thinking` of the way from idle (0), and the
 * lightbulb's `flare`. Idle: a slow sway and rise, a degree or two and a few millimetres, each face out of step with
 * the others. Talking: he turns from side to side, tilts his head and bobs with his words. Thinking: he leans back
 * and looks up, turning slowly as he ponders. The flare: a hop as the answer comes to him.
 */
export function pose(
  dewey: Object3D,
  t: number,
  turn: number,
  talking: number,
  thinking = 0,
  flare = 0,
) {
  const phase = turn * 1.7;
  const idle = Math.max(0, 1 - talking - thinking);
  const words = mouthOpen(t, turn, false);
  dewey.rotation.set(
    talking * 0.05 * Math.sin(t * 2.3) - thinking * (0.045 + 0.015 * Math.sin(t * 0.8)),
    idle * 0.03 * Math.sin(t * 0.6 + phase) +
      talking * 0.2 * Math.sin(t * 1.1) +
      thinking * 0.16 * Math.sin(t * 0.5),
    idle * 0.012 * Math.sin(t * 0.45 + phase) +
      talking * 0.06 * Math.sin(t * 1.7) +
      thinking * (0.07 + 0.02 * Math.sin(t * 0.9)),
  );
  dewey.position.y =
    idle * 0.006 * Math.sin(t * 1.1 + phase) +
    talking * (0.01 * Math.abs(Math.sin(t * 3.2)) + 0.014 * words) +
    flare * 0.05 * Math.abs(Math.sin(flare * Math.PI));
}

const smooth = (x: number, a: number, b: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * How open his mouth is at time `t`, 0 to 1: syllables, quick and uneven. Without pause while an answer streams
 * in (`streaming`); otherwise in phrases, about two and a half seconds of words and a second's breath.
 */
export function mouthOpen(t: number, turn: number, streaming: boolean): number {
  const phase = turn * 1.7;
  const syllables = Math.max(
    0,
    0.55 * Math.sin(t * 9.3 + phase) + 0.35 * Math.sin(t * 14.1 + 2 * phase) + 0.25,
  );
  const at = (t + phase * 2) % 3.6;
  const phrase = streaming ? 1 : smooth(at, 0, 0.2) * (1 - smooth(at, 2.3, 2.55));
  return Math.min(1, syllables * phrase * 1.2);
}

/** Where his screen's features are on the model (measured in a front view of dewey.glb, 3 Nov). */
const SCREEN = { x: 0.015, y: 0.445, rx: 0.165, ry: 0.15 };
const MOUTH = { x: 0.015, y: 0.392, w: 0.05, h: 0.034 };
const LAMP = { x: -0.14, y: 0.725, z: 0.25 };

/**
 * What's drawn on and around his face: a mouth over his painted smile, a ring of lights round his screen, and his
 * desk lamp's glow. Each sits a few millimetres off the model's surface, found by casting rays at it.
 */
function faceParts(dewey: Group, body: Object3D) {
  dewey.updateMatrixWorld(true);
  const ray = new Raycaster();
  const surface = (x: number, y: number) => {
    ray.set(new Vector3(x, y, 3), new Vector3(0, 0, -1));
    return ray.intersectObject(body, true)[0]?.point.z ?? 0.15;
  };
  const glow = (color: string) =>
    new MeshBasicMaterial({
      color,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });

  // The mouth: a dark opening with a bright rim, as his eyes glow, over the painted smile.
  const disc = new CircleGeometry(1, 32);
  const mouthZ = surface(MOUTH.x, MOUTH.y) + 0.006;
  const rim = new Mesh(disc, new MeshBasicMaterial({ color: "#ffd84a" }));
  const inside = new Mesh(disc, new MeshBasicMaterial({ color: "#3d1503" }));
  rim.position.set(MOUTH.x, MOUTH.y, mouthZ);
  inside.position.set(MOUTH.x, MOUTH.y, mouthZ + 0.002);
  dewey.add(rim, inside);

  // The spinner: a comet of light sweeping round his screen's edge while he thinks, over a faint track. Flat, a
  // touch in front of the screen's dome, like a reflection on its glass.
  const ring = new Group();
  const edge = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
  const ringZ =
    Math.max(
      ...edge.map((a) =>
        surface(SCREEN.x + SCREEN.rx * Math.cos(a), SCREEN.y + SCREEN.ry * Math.sin(a)),
      ),
    ) + 0.008;
  ring.position.set(SCREEN.x, SCREEN.y, ringZ);
  ring.scale.set(SCREEN.rx, SCREEN.ry, 1);
  const arc = (length: number, opacity: number) => {
    const mesh = new Mesh(new TorusGeometry(1, 0.08, 6, 64, length), glow("#ffe9a8"));
    (mesh.material as MeshBasicMaterial).userData.opacity = opacity;
    ring.add(mesh);
    return { mesh, length };
  };
  // The track, then the tail, brighter toward the head.
  const arcs = [
    arc(Math.PI * 2, 0.14),
    arc(Math.PI * 0.75, 0.3),
    arc(Math.PI * 0.4, 0.55),
    arc(Math.PI * 0.16, 1),
  ];
  const spark = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: "#fff6d8",
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  dewey.add(ring, spark);

  // The lamp: a soft glow under its shade, brighter as he thinks, flaring when the answer comes.
  const lamp = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: "#ffd98a",
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      // The bulb's light, not a solid: it shows round the shade when he leans back.
      depthTest: false,
    }),
  );
  lamp.position.set(LAMP.x, LAMP.y, LAMP.z);
  // The bulb itself: a small bright core in the halo.
  const bulb = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: "#fffbe8",
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  );
  bulb.position.set(LAMP.x, LAMP.y, LAMP.z + 0.01);
  dewey.add(lamp, bulb);

  return {
    /** Sets the parts for one face before it's drawn. */
    show(t: number, turn: number, mood: Mood, streaming: boolean) {
      const open = mood.talk * mouthOpen(t, turn, streaming);
      rim.visible = inside.visible = open > 0.06;
      rim.scale.set(MOUTH.w + 0.008, MOUTH.h * open + 0.008, 1);
      inside.scale.set(MOUTH.w, MOUTH.h * open, 1);

      // Round about once a second, clockwise, easing a little on each turn as a loader does.
      const turnOf = t * 1.05;
      const head =
        -(Math.floor(turnOf) + smooth(turnOf % 1, 0, 1) * 0.7 + (turnOf % 1) * 0.3) * Math.PI * 2;
      const seen = mood.think > 0.02;
      ring.visible = spark.visible = seen;
      for (const { mesh, length } of arcs) {
        // Each arc ends at the head: it runs from head to head + length, behind it as it goes clockwise.
        mesh.rotation.z = Math.PI / 2 + head;
        if (length >= Math.PI * 2) mesh.rotation.z = 0;
        const material = mesh.material as MeshBasicMaterial;
        material.opacity = mood.think * (material.userData.opacity as number);
      }
      const a = Math.PI / 2 + head;
      spark.position.set(
        SCREEN.x + SCREEN.rx * Math.cos(a),
        SCREEN.y + SCREEN.ry * Math.sin(a),
        ringZ + 0.004,
      );
      spark.scale.setScalar(0.075);
      (spark.material as SpriteMaterial).opacity = mood.think;

      const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
      (lamp.material as SpriteMaterial).opacity = Math.min(
        1,
        0.2 + mood.think * (0.45 + 0.35 * pulse) + mood.flare,
      );
      lamp.scale.setScalar(0.17 + mood.think * (0.06 + 0.05 * pulse) + mood.flare * 0.3);
      (bulb.material as SpriteMaterial).opacity = Math.min(
        1,
        mood.think * (0.6 + 0.4 * pulse) + mood.flare,
      );
      bulb.scale.setScalar(0.06 + mood.flare * 0.08);
    },
  };
}

/** A soft round glow, white at the middle and gone at the edge. */
function glowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const fill = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  fill.addColorStop(0, "rgba(255,255,255,1)");
  fill.addColorStop(0.25, "rgba(255,255,255,0.55)");
  fill.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = fill;
  g.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}
