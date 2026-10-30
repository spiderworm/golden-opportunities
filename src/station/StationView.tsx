import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { track } from "~/platform/analytics/analytics.client";
import { OPENING_HOLD } from "./scene-params";
import type { StationViewpoint } from "./scene/StationScene";
import { StationPoster } from "./StationPoster";
import { canRenderWebGL2 } from "./webgl";
import styles from "./StationView.module.css";

// three.js and the scene load only here, after the page is up and the
// browser has shown it can draw them. Without WebGL 2 (or if the scene
// fails) the player sees a still picture instead.
const StationScene = lazy(() => import("./scene/StationScene"));

type Support = "checking" | "3d" | "static";

export interface StationViewProps {
  /** 0 to 1: how busy the shop is. A played quarter sets it. */
  busyness: number;
  /** The title on the featured display. */
  featuredTitle: string;
  /** The Commerce Office has an unread alert (the shell's bell shows it; the shop's console pulses). */
  alert: boolean;
}

export function StationView({ busyness, featuredTitle, alert }: StationViewProps) {
  const [support, setSupport] = useState<Support>("checking");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [view, setView] = useState<StationViewpoint>("outside");
  const [ready, setReady] = useState(false);
  const moving = useRef<{ to: StationViewpoint; trigger: string; started: number } | null>(null);
  const touched = useRef(false);
  const statsLine = useRef<HTMLParagraphElement>(null);
  const [params] = useSearchParams();
  const showStats = params.has("stats");

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mode = canRenderWebGL2() ? "3d" : "static";
    setReducedMotion(reduced);
    if (reduced) setView("inside");
    setSupport(mode);
    track("station_viewed", { mode, reducedMotion: reduced });
  }, []);

  const move = useCallback((to: StationViewpoint, trigger: "opening" | "button") => {
    moving.current = { to, trigger, started: performance.now() };
    setView(to);
  }, []);

  // The opening: hold outside a moment, then glide into the shop.
  useEffect(() => {
    if (!ready || reducedMotion) return;
    const timer = setTimeout(() => touched.current || move("inside", "opening"), OPENING_HOLD * 1000);
    return () => clearTimeout(timer);
  }, [ready, reducedMotion, move]);

  const onSettled = useCallback((settled: StationViewpoint) => {
    const m = moving.current;
    if (!m || m.to !== settled) return;
    moving.current = null;
    track("camera_moved", { to: settled, trigger: m.trigger, durationMs: Math.round(performance.now() - m.started) });
  }, []);

  const onFailed = useCallback(() => {
    setSupport("static");
    track("station_failed", { stage: ready ? "running" : "loading" });
  }, [ready]);

  const next: StationViewpoint = view === "inside" ? "outside" : "inside";
  return (
    <section className={styles.view} aria-label="The station">
      {support === "3d" ? (
        <SceneBoundary onError={onFailed}>
          <Suspense fallback={<StationPoster />}>
            <StationScene
              view={view}
              busyness={busyness}
              featuredTitle={featuredTitle}
              alert={alert}
              reducedMotion={reducedMotion}
              onReady={() => setReady(true)}
              onSettled={onSettled}
              statsLine={showStats ? statsLine : undefined}
            />
          </Suspense>
        </SceneBoundary>
      ) : (
        <StationPoster note={support === "static" ? "This device can't show the station in 3D, so here it is from the shuttle." : undefined} />
      )}
      <p className={styles.place}>Orbital Books, Ring C, Berth 14</p>
      {support === "3d" && ready && (
        <button
          type="button"
          className={styles.move}
          onClick={() => {
            touched.current = true;
            move(next, "button");
          }}
        >
          {next === "inside" ? "Go inside" : "Step outside"}
        </button>
      )}
      {showStats && <p ref={statsLine} className={styles.stats} />}
    </section>
  );
}

/** Falls back to the still picture if the scene throws (a lost GPU, a model that won't load). */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
