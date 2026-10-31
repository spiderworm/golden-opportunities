import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { track } from "~/platform/analytics/analytics.client";
import type { StationViewpoint } from "./scene/StationScene";
import { heldFrame, watchHeldFrame } from "./held-frame";
import { StationPoster } from "./StationPoster";
import { FIRST_VIEW, rememberedView, rememberView } from "./view-memory";
import { canRenderWebGL2 } from "./webgl";
import styles from "./StationView.module.css";

// three.js and the scene load only here, after the page is up and the
// browser has shown it can draw them. Without WebGL 2 (or if the scene
// fails) the player sees a still picture instead. The camera stays where it
// is until the player moves it: inside on a first visit, then wherever they
// left it last time. Coming back to the screen, the last frame of the
// previous visit stays up until the new scene has drawn.
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
  const [view, setView] = useState<StationViewpoint>(FIRST_VIEW);
  const [ready, setReady] = useState(false);
  const held = useSyncExternalStore(watchHeldFrame, heldFrame, () => undefined);
  const [drawn, setDrawn] = useState(false);
  const hold = useRef<(() => void) | null>(null);
  const moving = useRef<{ to: StationViewpoint; trigger: string; started: number } | null>(null);
  const statsLine = useRef<HTMLParagraphElement>(null);
  const [params] = useSearchParams();
  const showStats = params.has("stats");

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mode = canRenderWebGL2() ? "3d" : "static";
    // Set before the scene first renders, so the camera starts there rather than gliding.
    const opening = rememberedView(() => localStorage);
    setReducedMotion(reduced);
    setView(opening);
    setSupport(mode);
    track("station_viewed", { mode, reducedMotion: reduced, view: opening });
  }, []);

  // Keep a picture of the station as the player leaves. A layout effect's
  // cleanup runs before the canvas's own unmount takes the scene apart.
  useLayoutEffect(
    () => () => {
      try {
        hold.current?.();
      } catch {
        // A lost context has nothing worth keeping.
      }
    },
    [],
  );

  const move = useCallback((to: StationViewpoint) => {
    moving.current = { to, trigger: "button", started: performance.now() };
    setView(to);
    rememberView(() => localStorage, to);
  }, []);

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
    <section className={styles.view} aria-label="The station" data-drawn={drawn || undefined}>
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
              onDrawn={() => setDrawn(true)}
              hold={hold}
              statsLine={showStats ? statsLine : undefined}
            />
          </Suspense>
        </SceneBoundary>
      ) : (
        <StationPoster note={support === "static" ? "This device can't show the station in 3D, so here it is from the shuttle." : undefined} />
      )}
      {held && !drawn && support !== "static" && <img className={styles.held} src={held} alt="" />}
      <p className={styles.place}>Orbital Books, Ring C, Berth 14</p>
      {support === "3d" && ready && (
        <button
          type="button"
          className={styles.move}
          onClick={() => move(next)}
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
