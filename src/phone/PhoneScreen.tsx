import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import { track } from "~/platform/analytics/analytics.client";
import { BossBubble } from "~/platform/bosses/BossBubble";
import { canRenderWebGL2 } from "~/platform/webgl";
import { PHONE_COPY } from "./copy";
import { sizeBucket } from "./phone";
import styles from "./PhoneScreen.module.css";

// What a phone gets instead of the game (m1-copy section 8): the Throughput
// Subcommittee reaches out of the screen, grabs the phone in its claw, and
// says what it thinks of it. It's always in the page, and its stylesheet
// shows it only on a phone, so a phone never sees the game's pages flash up
// before the scripts run. The 3D scene loads only once the browser has said
// this is a phone that can draw it; otherwise the boss stands still.
const PhoneScene = lazy(() => import("./PhoneScene"));

export function PhoneScreen({ active }: { /** This is a phone: draw the scene and say so to analytics. */ active: boolean }) {
  const [scene, setScene] = useState<"still" | "3d">("still");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [grabbed, setGrabbed] = useState(false);

  useEffect(() => {
    if (!active) return;
    track("phone_blocked", { size: sizeBucket(innerWidth, innerHeight) });
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduced);
    setGrabbed(reduced);
    if (canRenderWebGL2()) setScene("3d");
  }, [active]);

  const still = (
    <div className={styles.still}>
      <img src="/bosses/full/readers.webp" alt="" />
    </div>
  );
  // The bubble waits for the claw to close; standing still, the boss speaks at once.
  const speaking = scene === "still" || grabbed;
  return (
    <main className={styles.phone}>
      <div className={styles.scene} role="img" aria-label={PHONE_COPY.scene}>
        {active && scene === "3d" ? (
          <SceneBoundary fallback={still} onError={() => setScene("still")}>
            <Suspense fallback={null}>
              <PhoneScene reducedMotion={reducedMotion} onGrabbed={() => setGrabbed(true)} />
            </Suspense>
          </SceneBoundary>
        ) : (
          still
        )}
      </div>
      <div className={styles.speech} data-speaking={speaking || undefined}>
        <BossBubble boss="readers">{PHONE_COPY.line}</BossBubble>
      </div>
      <p className={styles.fact}>{PHONE_COPY.fact}</p>
    </main>
  );
}

/** Falls back to the still boss if the scene throws (a lost GPU, say). */
class SceneBoundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
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
