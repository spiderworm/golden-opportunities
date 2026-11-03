import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
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
// "mouth moving excitedly", and then: "A 'chatting' robot screen will have an animated mouth, painted as white
// pixels on the screen". So his screen plays faces of glowing dots, made in Tripo (SCREEN_FACES): a spinner while he
// works out an answer, then a lightbulb as it arrives, and a mouth that chats; his desk lamp pulses as he thinks
// and flares when the answer comes, and he hops. Loaded only once the browser has shown it can draw WebGL 2, and
// not for reduced motion, where the portraits stay.

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
  // What faceParts made lives in this hand-built scene, outside R3F's tree, so it's freed here (Audit, #308).
  useEffect(() => () => view?.face.dispose(), [view]);
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
  /** Seconds since the answer arrived after thinking, while its lightbulb frames play; null otherwise. */
  idea: number | null;
  /** What it was doing last frame, to catch the moment thinking turns into an answer. */
  was: Activity["kind"] | null;
}

function newMood(talking: boolean, doing: Activity["kind"] | null): Mood {
  return {
    talk: talking ? 1 : 0,
    think: doing === "thinking" ? 1 : 0,
    flare: 0,
    idea: null,
    was: doing,
  };
}

/** Eases a face toward what it's doing; thinking outranks talking, and an answer arriving lights the lamp. */
function step(mood: Mood, talking: boolean, doing: Activity["kind"] | null, delta: number) {
  const ease = Math.min(1, delta * EASE);
  const thinking = doing === "thinking";
  mood.think += ((thinking ? 1 : 0) - mood.think) * ease;
  mood.talk += ((talking && !thinking ? 1 : 0) - mood.talk) * ease;
  if (mood.was === "thinking" && !thinking) {
    mood.flare = 1;
    mood.idea = 0;
  } else if (mood.idea !== null) {
    mood.idea += delta;
    if (mood.idea > IDEA_SECONDS) mood.idea = null;
  }
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

/**
 * His screen's faces (David chose them, 3 Nov: Tripo concept sheets, public/dewey/provenance.json): an atlas of 18
 * frames of glowing dots, six to a row. Thinking 1 to 6 spin a ring of dots while his eyes glance up; thinking 7 to
 * 9 are the idea arriving, a lightbulb lighting over a grin ("once his message pops in after thinking, display
 * those final frames 7-9 with it"); chatting 1 to 9 are his eyes with nine mouths.
 */
export const SCREEN_FACES = "/dewey/screen-faces.png";
const FRAME = {
  spin: [0, 1, 2, 3, 4, 5],
  idea: [6, 7, 8],
  rest: 9,
  /** Mouths by how open: a little (slightly open, small o), more (O, EE), wide (wide O, grin). */
  little: [10, 15],
  more: [13, 14],
  wide: [12, 16],
  /** Happy closed eyes, for a blink now and then. */
  blink: 17,
} as const;
/** How far the chatting frames are raised on his screen, as a share of a frame. */
const CHAT_LIFT = 0.07;
/** How long the lightbulb frames play when an answer arrives: two quick steps, then the full bulb held. */
const IDEA_SECONDS = 1.6;

/**
 * Which of the atlas's frames a face shows at time `t`. Thinking: the spinner, about eight steps a second. The idea:
 * the lightbulb lighting, then held. Talking: a mouth for each syllable, by how open it is, the shape varying from one
 * syllable to the next. Otherwise his resting smile, with a happy blink every few seconds.
 */
export function screenFrame(
  t: number,
  turn: number,
  mood: Pick<Mood, "talk" | "think" | "idea">,
  streaming: boolean,
): number {
  if (mood.think > 0.5) return FRAME.spin[Math.floor(t * 8) % FRAME.spin.length]!;
  if (mood.idea !== null) return FRAME.idea[mood.idea < 0.18 ? 0 : mood.idea < 0.4 ? 1 : 2];
  if (mood.talk > 0.5) {
    const open = mouthOpen(t, turn, streaming);
    if (open < 0.12) return FRAME.rest;
    const syllable = Math.floor(((t * 9.3 + turn * 1.7) / (Math.PI * 2)) * 2);
    const pick = (shapes: readonly number[]) => shapes[(syllable + turn) % shapes.length]!;
    return pick(open < 0.4 ? FRAME.little : open < 0.75 ? FRAME.more : FRAME.wide);
  }
  return (t + turn * 2.3) % 5.2 < 0.16 ? FRAME.blink : FRAME.rest;
}

/** Where his screen and lamp are on the model (measured in a front view of dewey.glb, 3 Nov). */
const SCREEN = { x: 0.015, y: 0.443, rx: 0.2, ry: 0.176 };
const LAMP = { x: -0.14, y: 0.725, z: 0.25 };

/**
 * What's drawn on and around his face: his screen, a disc shaped to its dome that covers the painted face and shows
 * the atlas's frames, under his glasses; and his desk lamp's glow, brighter as he thinks, flaring when the answer
 * comes. The disc's shape is found by casting rays at the model.
 */
function faceParts(dewey: Group, body: Object3D) {
  dewey.updateMatrixWorld(true);
  const ray = new Raycaster();
  const surface = (x: number, y: number) => {
    ray.set(new Vector3(x, y, 3), new Vector3(0, 0, -1));
    return ray.intersectObject(body, true)[0]?.point.z ?? 0.15;
  };

  // The disc: rings out from the screen's middle, each point a few millimetres off the glass.
  const disc = new RingGeometry(0, 1, 48, 10);
  const at = disc.attributes.position!;
  for (let i = 0; i < at.count; i++) {
    const x = SCREEN.x + SCREEN.rx * at.getX(i);
    const y = SCREEN.y + SCREEN.ry * at.getY(i);
    at.setXYZ(i, x, y, surface(x, y) + 0.003);
  }
  disc.computeBoundingSphere();

  // The glass behind the dots: his screen's amber, glowing a little toward the middle, fading out at its edge so it
  // meets the model's own screen without a seam.
  const glass = new Mesh(
    disc,
    new MeshBasicMaterial({ map: glassTexture(), transparent: true, depthWrite: false }),
  );
  const atlas = new TextureLoader().load(SCREEN_FACES, () => (glass.visible = dots.visible = true));
  atlas.repeat.set(1 / 6, 1 / 3);
  atlas.colorSpace = SRGBColorSpace;
  const dots = new Mesh(
    disc,
    new MeshBasicMaterial({
      map: atlas,
      color: "#fff6dc",
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  // Shown once the frames have loaded: until then, the painted face.
  glass.visible = dots.visible = false;
  glass.renderOrder = 1;
  dots.renderOrder = 2;
  dewey.add(glass, dots);

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
    /** Frees the geometry, materials and textures made here. */
    dispose() {
      disc.dispose();
      for (const part of [glass, dots, lamp, bulb]) {
        const material = part.material as MeshBasicMaterial | SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      }
    },
    /** Sets the parts for one face before it's drawn. */
    show(t: number, turn: number, mood: Mood, streaming: boolean) {
      const frame = screenFrame(t, turn, mood, streaming);
      // The chatting frames sit a little higher, so his eyes peek over his low glasses (their tops are empty).
      const lift = frame >= FRAME.rest ? CHAT_LIFT : 0;
      atlas.offset.set((frame % 6) / 6, 1 - (Math.floor(frame / 6) + 1 + lift) / 3);

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

/** His screen's glass: amber, a little brighter in the middle, opaque to near its edge and then gone. */
function glassTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const fill = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  fill.addColorStop(0, GLASS.middle);
  fill.addColorStop(0.78, GLASS.edge);
  fill.addColorStop(0.9, GLASS.edge);
  fill.addColorStop(1, GLASS.edge + "00");
  g.fillStyle = fill;
  g.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The glass's colours, matched by eye to the model's lit screen in the panel. */
const GLASS = { middle: "#e2801f", edge: "#c2620f" };

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
