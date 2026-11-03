import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { flushSync } from "react-dom";
import { track } from "~/platform/analytics/analytics.client";
import { PHONE_EVENT } from "~/platform/phone";
import { BossBubble } from "~/platform/bosses/BossBubble";
import { canRenderWebGL2 } from "~/platform/webgl";
import { LOAD_CAP_MS, LoadingLine, useCommitment } from "~/platform/ui/commitment";
import { PHONE_COPY } from "./copy";
import { sizeBucket } from "./phone";
import styles from "./PhoneScreen.module.css";

// What a phone gets instead of the game (m1-copy section 8): the Throughput
// Subcommittee walks up, takes the phone in one open hand at the bottom, and
// says what it thinks of it: the same Tripo robot as on Decide. It's always in the page, and its stylesheet
// shows it only on a phone, so a phone never sees the game's pages flash up
// before the scripts run. The 3D scene loads only once the browser has said
// this is a phone that can draw it; otherwise the boss stands still.
const PhoneScene = lazy(() => import("./PhoneScene"));
/** The room kept for the robot's palm above the fact line: a share of the screen's height, upright and turned. */
const HAND_ROOM = { upright: 0.3, turned: 0.12 };

export function PhoneScreen({
  active,
}: {
  /** This is a phone: draw the scene and say so to analytics. */ active: boolean;
}) {
  // Deciding until the browser has said what it can draw; then the still boss at once, or the 3D scene once it has
  // drawn (David, 3 Nov, AGENTS.md "Commit before you show": no still-then-3D swap). Until then, nothing but the fact
  // line, and past 500 ms a quiet Loading….
  const [scene, setScene] = useState<"deciding" | "still" | "3d">("deciding");
  const [reducedMotion, setReducedMotion] = useState(false);
  // Whether the 3D scene has drawn: until then the still picture is what's there, and its name is right.
  const [drawn, setDrawn] = useState(false);
  // The boss speaks at once over the still picture; in 3D, when the hand closes or 2.5 s after it's shown,
  // whichever is first. Once it has spoken, it stays spoken (m1-copy section 8).
  const [speaking, setSpeaking] = useState(false);
  const speak = useCallback(() => setSpeaking(true), []);

  useEffect(() => {
    if (!active) return;
    track(PHONE_EVENT, { size: sizeBucket(innerWidth, innerHeight) });
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    setScene(canRenderWebGL2() ? "3d" : "still");
  }, [active]);
  // Shown in 3D: it speaks when the hand closes, or 2.5 s on; held already (reduced motion), at once.
  const shown3d = scene === "3d" && drawn;
  useEffect(() => {
    if (!shown3d) return;
    if (reducedMotion) return speak();
    const soon = setTimeout(speak, 2500);
    return () => clearTimeout(soon);
  }, [shown3d, reducedMotion, speak]);
  const { loading } = useCommitment(scene === "still" || shown3d);
  // The 3D scene failed, or stalled (neither failing nor drawing): the still boss instead, for good (Audit, #361).
  const fallBack = useCallback((cause: "error" | "timeout") => {
    setScene("still");
    track("phone_scene_failed", { cause });
  }, []);
  useEffect(() => {
    if (scene !== "3d" || drawn) return;
    const timer = setTimeout(() => fallBack("timeout"), LOAD_CAP_MS);
    return () => clearTimeout(timer);
  }, [scene, drawn, fallBack]);

  // Where the robot's head is kept: between the bubble at the top and the hand's room above the fact line at
  // the bottom (shares of the height); and where the hand holds the phone, just above the fact line.
  const fact = useRef<HTMLParagraphElement>(null);
  const sceneBox = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const zone = useRef({ top: 0.3, bottom: 0.82 - HAND_ROOM.upright, hold: 0.82 });
  useEffect(() => {
    if (!active) return;
    const measure = () => {
      const high = innerHeight || 1;
      const hold = (fact.current?.getBoundingClientRect().top ?? high * 0.82) / high;
      // Turned, the screen is short: the hand keeps less room, and covers the robot's chest rather than shrink its head.
      const room = innerWidth > high ? HAND_ROOM.turned : HAND_ROOM.upright;
      zone.current = {
        top: (bubble.current?.getBoundingClientRect().bottom ?? high * 0.3) / high,
        bottom: hold - room,
        hold,
      };
    };
    measure();
    const resized = new ResizeObserver(measure);
    for (const el of [bubble.current, fact.current]) if (el) resized.observe(el);
    addEventListener("resize", measure);
    return () => {
      resized.disconnect();
      removeEventListener("resize", measure);
    };
  }, [active]);

  const still = <Still onShown={speak} />;
  return (
    // Once the 3D scene has drawn, its own room is behind the robot: the screen's picture of it goes.
    <main className={styles.phone} data-room={(scene === "3d" && drawn) || undefined}>
      <div
        ref={sceneBox}
        className={styles.scene}
        // A picture once there's one to name: the 3D scene once shown, or the still boss.
        role={shown3d || scene === "still" ? "img" : undefined}
        aria-label={shown3d ? PHONE_COPY.scene : scene === "still" ? PHONE_COPY.still : undefined}
      >
        {active && scene === "3d" ? (
          <SceneBoundary fallback={still} onError={() => fallBack("error")}>
            <Suspense fallback={null}>
              {/* Out of sight until it has drawn, then shown once. */}
              <div className={styles.scene} data-hidden={!drawn || undefined}>
                <PhoneScene
                  reducedMotion={reducedMotion}
                  onDrawn={() => {
                    performance.mark("phone:drawn");
                    // At once, from the scene's frame loop (as Dewey's faces and the station).
                    flushSync(() => setDrawn(true));
                  }}
                  // The hand closes only after the scene has drawn (it's out of sight until then).
                  onGrabbed={speak}
                  zone={zone}
                  head={sceneBox}
                />
              </div>
            </Suspense>
          </SceneBoundary>
        ) : scene === "still" ? (
          still
        ) : null}
        {active && scene !== "still" && !drawn && (
          <LoadingLine loading={loading} className={styles.loading} />
        )}
      </div>
      <div ref={bubble} className={styles.speech} data-speaking={speaking || undefined}>
        <BossBubble boss="readers">{PHONE_COPY.line}</BossBubble>
      </div>
      <p ref={fact} className={styles.fact}>
        {PHONE_COPY.fact}
      </p>
    </main>
  );
}

/**
 * The Subcommittee standing there, already saying it. Lazily loaded, like every picture here: on a
 * desktop the phone screen is hidden, and a hidden lazy image is never fetched.
 */
function Still({ onShown }: { onShown: () => void }) {
  useEffect(() => {
    performance.mark("phone:still");
    onShown();
  }, [onShown]);
  return (
    <div className={styles.still}>
      <img src="/bosses/full/readers.webp" alt="" loading="lazy" />
    </div>
  );
}

/** Falls back to the still boss if the scene throws (a lost GPU, say). */
class SceneBoundary extends Component<
  { fallback: ReactNode; onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
