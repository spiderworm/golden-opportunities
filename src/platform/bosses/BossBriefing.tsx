import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";

import { canRenderWebGL2 } from "../webgl";
import type { BossId } from "./bosses";
import { BossScene2D } from "./BossScene2D";
import { useBossFocus, type FocusHow, type SceneBubble, type SceneMode } from "./useBossFocus";

// three.js and the bosses' models load only here, once the browser has shown
// it can draw them and the window is wide enough for the bosses to stand in a
// row. Otherwise, while they load, or if the 3D scene fails, the 2D scene
// shows instead, with the same bubbles and the same focus.
const BossScene3D = lazy(() => import("./BossScene3D"));
const WIDE = "(min-width: 900px)";

export interface BossBriefingProps {
  bubbles: readonly SceneBubble[];
  /** The bubble open when the scene comes up. */
  initial?: number;
  onFocus?: (boss: BossId, how: FocusHow, mode: SceneMode) => void;
}

/**
 * The bosses briefing the player in one scene. It owns the focus, so the open bubble carries over when
 * one scene swaps in for the other; the scenes only draw it.
 */
export function BossBriefing({ bubbles, initial, onFocus }: BossBriefingProps) {
  // Null until the browser has said whether it can draw the 3D scene; the server can't know.
  const [mode, setMode] = useState<SceneMode | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const failed = useRef(false);

  useEffect(() => {
    const wide = matchMedia(WIDE);
    const webgl = canRenderWebGL2();
    const decide = () => setMode(webgl && wide.matches && !failed.current ? "3d" : "2d");
    setReducedMotion(matchMedia("(prefers-reduced-motion: reduce)").matches);
    decide();
    wide.addEventListener("change", decide);
    return () => wide.removeEventListener("change", decide);
  }, []);

  const { open, select } = useBossFocus(bubbles, { initial, mode, onFocus });
  const flat = <BossScene2D bubbles={bubbles} open={open} onSelect={select} />;
  if (mode !== "3d") return flat;
  return (
    <SceneBoundary
      fallback={flat}
      onError={() => {
        failed.current = true;
        setMode("2d");
      }}
    >
      <Suspense fallback={flat}>
        <BossScene3D bubbles={bubbles} open={open} onSelect={select} reducedMotion={reducedMotion} />
      </Suspense>
    </SceneBoundary>
  );
}

/** Falls back to the 2D scene if the 3D one throws (a lost GPU, a model that won't load). */
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
