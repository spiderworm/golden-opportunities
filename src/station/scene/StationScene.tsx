import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef, type RefObject } from "react";
import type { DirectionalLight, Group } from "three";

import { track } from "~/platform/analytics/analytics.client";
import { sceneLevels } from "../scene-params";
import { CameraRig, SUN_INTENSITY } from "./CameraRig";
import { DustMotes } from "./DustMotes";
import { Exterior, Shuttles } from "./Exterior";
import { summarizeFrames } from "./frame-stats";
import { Interior } from "./Interior";
import { BERTH_ORIGIN, OUTSIDE_EYE, STATION_SPIN, STATION_START_ANGLE, SUN_DIRECTION } from "./layout";
import { Props } from "./Props";
import { Shoppers } from "./Shoppers";
import { Sky } from "./Sky";

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
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 55, near: 0.5, far: 12000, position: OUTSIDE_EYE.toArray() }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => props.onReady(gl.getContext() as WebGL2RenderingContext)}
      aria-hidden="true"
    >
      <color attach="background" args={["#03050d"]} />
      <ambientLight intensity={0.6} color="#8c93c8" />
      <directionalLight ref={sun} position={SUN_DIRECTION.clone().multiplyScalar(300).toArray()} intensity={SUN_INTENSITY} color="#fff3e2" />
      <Sky />
      <Spinner station={station} />
      <group ref={station} rotation={[0, STATION_START_ANGLE, 0]}>
        <Exterior glow={levels.glow} />
        <group position={BERTH_ORIGIN}>
          <Interior title={props.featuredTitle} glow={levels.glow} alert={props.alert} />
          <Shoppers count={levels.shoppers} />
          <DustMotes />
          <Suspense fallback={null}>
            <Props />
          </Suspense>
        </group>
      </group>
      <Shuttles count={levels.shuttles} />
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
