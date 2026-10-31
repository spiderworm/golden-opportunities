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

import { track } from "~/platform/analytics/analytics.client";
import { PHONE_EVENT } from "~/platform/phone";
import { BossBubble } from "~/platform/bosses/BossBubble";
import { canRenderWebGL2 } from "~/platform/webgl";
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
  const [scene, setScene] = useState<"still" | "3d">("still");
  const [reducedMotion, setReducedMotion] = useState(false);
  // Whether the 3D scene has drawn: until then the still picture is what's there, and its name is right.
  const [drawn, setDrawn] = useState(false);
  // The boss speaks at once over the still picture; in 3D, when the hand closes or after 2.5 s,
  // whichever is first. Once it has spoken, it stays spoken (m1-copy section 8).
  const [speaking, setSpeaking] = useState(true);
  const speak = useCallback(() => setSpeaking(true), []);

  useEffect(() => {
    if (!active) return;
    track(PHONE_EVENT, { size: sizeBucket(innerWidth, innerHeight) });
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    if (!canRenderWebGL2()) return;
    setScene("3d");
    if (reduced) return;
    setSpeaking(false);
    const soon = setTimeout(speak, 2500);
    return () => clearTimeout(soon);
  }, [active, speak]);

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
    <main className={styles.phone}>
      <div
        ref={sceneBox}
        className={styles.scene}
        role="img"
        aria-label={scene === "3d" && drawn ? PHONE_COPY.scene : PHONE_COPY.still}
      >
        {active && scene === "3d" ? (
          <SceneBoundary fallback={still} onError={() => setScene("still")}>
            <Suspense fallback={still}>
              <PhoneScene
                reducedMotion={reducedMotion}
                onDrawn={() => setDrawn(true)}
                onGrabbed={speak}
                zone={zone}
                head={sceneBox}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          still
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
  useEffect(onShown, [onShown]);
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
