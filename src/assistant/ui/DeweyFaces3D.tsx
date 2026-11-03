import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  type Object3D,
} from "three";
import { failedLoad, softFailFor, type Failed } from "~/platform/bosses/soft-load";

// Dewey's faces in 3D (David, 2 Nov: "2D static portrats and speech bubbles, but 3D animated in browsers that
// support it"): one canvas over the conversation, and Dewey's model drawn into it once for each of his faces
// in view, each in its own square, where the panel's portrait sits. Every face but one keeps a slow, almost
// invisible idle; one talks, the face beside the turn that has focus or the pointer, or else his last
// ("all of Dewey's chat avatars should have a simple, almost invisible idle animation, except for one"). The
// model is public/dewey/dewey.glb (provenance.json there). Loaded only once the browser has shown it can draw
// WebGL 2, and not for reduced motion, where the portraits stay.

export const MODEL = "/dewey/dewey.glb";
const softFail = softFailFor([MODEL]);

export interface DeweyFacesProps {
  /** Where each face goes: the portraits' boxes, by turn (the greeting is turn 0 when there are no replies). */
  slots: RefObject<Map<number, HTMLElement>>;
  /** The turn whose face talks. */
  talking: RefObject<number>;
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

function Faces({ slots, talking, onDrawn, onFailed }: DeweyFacesProps) {
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
    dewey.add(loaded.scene.clone());
    scene.add(dewey);
    const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 10);
    camera.position.set(...CAMERA.at);
    camera.lookAt(...CAMERA.look);
    return { scene, camera, dewey };
  }, [loaded]);
  const { gl } = useThree();
  /** How far into talking each face is, 0 to 1, by turn. */
  const talk = useRef(new Map<number, number>());
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
      const want = turn === talking.current ? 1 : 0;
      const was = talk.current.get(turn) ?? want;
      const k = was + (want - was) * Math.min(1, delta * EASE);
      talk.current.set(turn, k);
      pose(view.dewey, t, turn, k);
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

/**
 * Dewey's pose at time `t` (seconds) for turn `turn`, `talking` of the way from idle (0) to talking (1). Idle: a
 * slow sway and rise, a degree or two and a few millimetres, each face out of step with the others. Talking: he
 * turns from side to side, tilts his head and bobs as he speaks.
 */
export function pose(dewey: Object3D, t: number, turn: number, talking: number) {
  const phase = turn * 1.7;
  const idle = 1 - talking;
  dewey.rotation.set(
    talking * 0.05 * Math.sin(t * 2.3),
    idle * 0.03 * Math.sin(t * 0.6 + phase) + talking * 0.2 * Math.sin(t * 1.1),
    idle * 0.012 * Math.sin(t * 0.45 + phase) + talking * 0.06 * Math.sin(t * 1.7),
  );
  dewey.position.y =
    idle * 0.006 * Math.sin(t * 1.1 + phase) + talking * 0.02 * Math.abs(Math.sin(t * 3.2));
}
