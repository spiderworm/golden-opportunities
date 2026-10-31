import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import type { DirectionalLight, Group } from "three";

import { track } from "~/platform/analytics/analytics.client";
import { holdFrame } from "../held-frame";
import { sceneLevels } from "../scene-params";
import { CameraRig, SUN_INTENSITY } from "./CameraRig";
import { DustMotes } from "./DustMotes";
import { Exterior, Shuttles } from "./Exterior";
import { summarizeFrames } from "./frame-stats";
import { Interior } from "./Interior";
import { BERTH_ORIGIN, OUTSIDE_EYE, STATION_SPIN, STATION_START_ANGLE, SUN_DIRECTION } from "./layout";
import { Props } from "./Props";
import { Robots } from "./Robots";
import { Shoppers } from "./Shoppers";
import { Sky } from "./Sky";
import { keepElapsed, stationElapsed, stationShop } from "./world";

// The 3D station. Loaded only by the Station screen, and only once the
// browser has shown it can draw WebGL 2, so no other screen pays for three.js.

export type StationViewpoint = "outside" | "inside";

export interface StationSceneProps {
  view: StationViewpoint;
  /** 0 to 1: how busy the shop is (shoppers, shuttles, lights). */
  busyness: number;
  featuredTitle: string;
  /** Whether the Commerce Office has an unread alert (the counter's console pulses). */
  alert: boolean;
  reducedMotion: boolean;
  onReady: (gl: WebGL2RenderingContext) => void;
  onSettled: (view: StationViewpoint) => void;
  /** Called once the scene, models and all, has drawn its first frame. */
  onDrawn: () => void;
  /** Set to a function that keeps a picture of the scene (see held-frame.ts). */
  hold: RefObject<(() => void) | null>;
  /** A line of live figures (fps, draw calls) for the ?stats overlay. */
  statsLine?: RefObject<HTMLElement | null>;
}

export default function StationScene(props: StationSceneProps) {
  const station = useRef<Group>(null);
  const sun = useRef<DirectionalLight>(null);
  // The view the camera has come to rest in; null while it glides.
  const settled = useRef<StationViewpoint | null>(null);
  useEffect(() => {
    if (settled.current !== props.view) settled.current = null;
  }, [props.view]);
  const levels = sceneLevels(props.busyness);
  // Where the books are outlives the canvas (see world.ts).
  const shop = stationShop();
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 55, near: 0.5, far: 12000, position: OUTSIDE_EYE.toArray() }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl, clock }) => {
        // Pick up the scene's time where the last visit left it, so everything
        // clock-driven resumes (SceneClock sets it again once the models are in).
        clock.elapsedTime = stationElapsed();
        props.onReady(gl.getContext() as WebGL2RenderingContext);
      }}
      aria-hidden="true"
    >
      <color attach="background" args={["#03050d"]} />
      <ambientLight intensity={0.6} color="#8c93c8" />
      <directionalLight ref={sun} position={SUN_DIRECTION.clone().multiplyScalar(300).toArray()} intensity={SUN_INTENSITY} color="#fff3e2" />
      <Suspense fallback={null}>
        <Sky />
      </Suspense>
      <Spinner station={station} />
      <group ref={station} rotation={[0, STATION_START_ANGLE, 0]}>
        {/* The generated models load as the scene starts; everything waits for them together. */}
        <Suspense fallback={null}>
          <Exterior glow={levels.glow} />
          <group position={BERTH_ORIGIN}>
            <Interior title={props.featuredTitle} glow={levels.glow} alert={props.alert} shop={shop} />
            <Shoppers count={levels.shoppers} shop={shop} />
            <Robots shop={shop} />
            <DustMotes />
            <Props />
          </group>
          <SceneClock />
          <FirstFrame onDrawn={props.onDrawn} hold={props.hold} />
        </Suspense>
      </group>
      <Suspense fallback={null}>
        <Shuttles count={levels.shuttles} />
      </Suspense>
      <CameraRig station={station} sun={sun} view={props.view} instant={props.reducedMotion} onSettled={(view) => {
          settled.current = view;
          props.onSettled(view);
        }}
      />
      <FrameSampler settled={settled} statsLine={props.statsLine} />
    </Canvas>
  );
}

function Spinner({ station }: { station: RefObject<Group | null> }) {
  useFrame(({ clock }) => {
    if (station.current) station.current.rotation.y = STATION_START_ANGLE + STATION_SPIN * clock.elapsedTime;
  });
  return null;
}

/** The most the scene moves on in one frame, in seconds. */
const MAX_STEP = 0.1;

/**
 * Keeps the scene's time (see world.ts), from the frames that draw the
 * models. Time doesn't jump: a stalled frame (the first, compiling shaders,
 * or one after the tab was hidden) moves the scene on by MAX_STEP at most.
 */
function SceneClock() {
  const started = useRef(false);
  // Before every other frame callback (a negative priority still lets R3F draw the frame).
  useFrame(({ clock }, delta) => {
    // The clock ran on while the models loaded: pick up where the last visit left off.
    if (!started.current) clock.elapsedTime = stationElapsed();
    else if (delta > MAX_STEP) clock.elapsedTime -= delta - MAX_STEP;
    started.current = true;
    keepElapsed(clock.elapsedTime);
  }, -1);
  return null;
}

/**
 * Tells the Station screen when the scene has drawn (its picture of the last
 * visit can go), and gives it a way to keep a picture of this one.
 */
function FirstFrame({ onDrawn, hold }: Pick<StationSceneProps, "onDrawn" | "hold">) {
  const { gl, scene, camera } = useThree();
  const frames = useRef(0);
  // Frame callbacks run before the frame draws, so the second one follows the first drawn frame.
  useFrame(() => {
    if (++frames.current === 2) onDrawn();
  });
  useEffect(() => {
    hold.current = () => {
      gl.render(scene, camera);
      holdFrame(gl.domElement);
    };
    return () => {
      hold.current = null;
    };
  }, [gl, scene, camera, hold]);
  return null;
}

const WARMUP_FRAMES = 30;
const SAMPLE_FRAMES = 300;

/**
 * Times frames once the camera has settled in each view, and records one
 * station_frame_sample per view per visit. Draw calls and triangles come
 * from the renderer's own count for the last frame.
 */
function FrameSampler({
  settled,
  statsLine,
}: {
  settled: RefObject<StationViewpoint | null>;
  statsLine?: RefObject<HTMLElement | null>;
}) {
  const state = useRef({ view: null as StationViewpoint | null, tick: 0, seen: 0, frames: [] as number[], recent: [] as number[], sent: new Set<StationViewpoint>() });

  useFrame(({ gl, size }, delta) => {
    const s = state.current;
    const info = gl.info.render;
    s.recent.push(delta * 1000);
    if (s.recent.length > 120) s.recent.shift();
    if (statsLine?.current && ++s.tick % 30 === 0) {
      const recent = summarizeFrames(s.recent);
      statsLine.current.textContent = `${recent.fps} fps, p95 ${recent.p95Ms} ms, ${info.calls} draw calls, ${info.triangles.toLocaleString("en-US")} triangles, dpr ${gl.getPixelRatio()}`;
    }
    const view = settled.current;
    if (view !== s.view) {
      s.view = view;
      s.seen = 0;
      s.frames = [];
    }
    if (!view || s.sent.has(view) || ++s.seen <= WARMUP_FRAMES) return;
    s.frames.push(delta * 1000);
    if (s.frames.length === SAMPLE_FRAMES) {
      s.sent.add(view);
      track("station_frame_sample", {
        view,
        ...summarizeFrames(s.frames),
        drawCalls: info.calls,
        triangles: info.triangles,
        dpr: gl.getPixelRatio(),
        width: size.width,
        height: size.height,
      });
    }
  });
  return null;
}
