import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type FocusEvent,
  type ReactNode,
} from "react";

import { track } from "../analytics/analytics.client";
import { pageLeaving } from "../lazy/cut-off";
import { retryImport } from "../lazy/retry";
import { canRenderWebGL2 } from "../webgl";
import type { BossId } from "./bosses";
import { BossLayout } from "./BossLayout";
import { BossFigures } from "./BossScene2D";
import type { BossScene3DProps } from "./BossScene3D";
import { useBossFocus, type FocusHow, type SceneBubble, type SceneMode } from "./useBossFocus";
import styles from "./BossBriefing.module.css";

// three.js and the bosses' models load only here, once the browser has shown
// it can draw them and the briefing is wide enough for its full bubbles (the
// width at which BossLayout keeps them, 620 px). Until then, narrower than
// that, or if the 3D scene fails, the 2D scene shows, with the same bubbles
// and the same focus. Only the floor swaps: the layout, and whatever the page
// hangs in its banner (a form being filled in, its focus), stays mounted.
// The 3D scene's code is fetched before it swaps in, so the 2D scene is
// replaced once, not twice; a failed fetch is tried once more, and again on
// the next visit (not on every resize of this one).
const WIDE = 620;
let loading: Promise<ComponentType<BossScene3DProps>> | undefined;
const loadScene3D = () =>
  (loading ??= retryImport(() => import("./BossScene3D")).then(
    (m) => m.default,
    (error: unknown) => {
      track("boss_scene_failed", { cause: "import" });
      loading = undefined;
      throw error;
    },
  ));

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
  const [Scene3D, setScene3D] = useState<ComponentType<BossScene3DProps> | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Whether the 3D models have drawn: until then the 2D figures stay over the empty canvas (David, 3 Nov 2026).
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (mode !== "3d") setDrawn(false);
  }, [mode]);
  const shownModels = useCallback(() => setDrawn(true), []);
  const failed = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    setReducedMotion(matchMedia("(prefers-reduced-motion: reduce)").matches);
    const webgl = canRenderWebGL2();
    let current = true;
    const decide = () => {
      if (!webgl || failed.current || element.clientWidth <= WIDE) return setMode("2d");
      loadScene3D().then(
        (scene) => {
          if (!current) return;
          setScene3D(() => scene);
          setMode(failed.current || element.clientWidth <= WIDE ? "2d" : "3d");
        },
        () => {
          failed.current = true;
          if (current) setMode("2d");
        },
      );
    };
    decide();
    // The briefing's own width: the window, the menu collapsing, the music dock.
    const resized = new ResizeObserver(decide);
    resized.observe(element);
    return () => {
      current = false;
      resized.disconnect();
    };
  }, []);

  const { open, select } = useBossFocus(bubbles, { initial, mode, onFocus });

  // One scene swapping in for the other remounts the bubbles; whoever had a bubble focused keeps it.
  const focused = useRef<number | null>(null);
  const bubbleButtons = () => [
    ...(box.current?.querySelectorAll<HTMLButtonElement>("button[aria-controls]") ?? []),
  ];
  const noteFocus = (event: FocusEvent) => {
    const i = bubbleButtons().indexOf(event.target as HTMLButtonElement);
    focused.current = i >= 0 ? i : null;
  };
  const restoreFocus = useCallback(() => {
    if (
      focused.current === null ||
      (document.activeElement && document.activeElement !== document.body)
    )
      return;
    bubbleButtons()[focused.current]?.focus();
  }, []);
  useLayoutEffect(restoreFocus, [mode, restoreFocus]);

  // The columns the 3D bosses stand under, from the one layout both floors share.
  const columns = useRef<(HTMLLIElement | null)[]>([]);
  const flat = <BossFigures bubbles={bubbles} open={open} onSelect={select} />;
  // The 3D scene broke, or its models didn't arrive: the 2D scene for the rest of this visit. A page that's
  // going away cut the models off itself, so that's nobody's failure.
  const failed3D = useCallback((cause: "scene" | "models") => {
    if (!pageLeaving()) track("boss_scene_failed", { cause });
    failed.current = true;
    setMode("2d");
  }, []);
  // One function for the whole visit: Bosses re-runs its failure effect when this changes, and would record
  // boss_scene_failed again.
  const modelsFailed = useCallback(() => failed3D("models"), [failed3D]);
  return (
    <div
      ref={box}
      className={styles.briefing}
      onFocus={noteFocus}
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget as Node | null)) focused.current = null;
      }}
    >
      <BossLayout
        bubbles={bubbles}
        open={open}
        onSelect={select}
        columnRef={(i) => (el) => {
          columns.current[i] = el;
        }}
        // The 2D figures first, always in the same place, so they never remount: over the canvas until its models
        // have drawn, then gone. Swapping as the canvas mounted left the floor empty while the models loaded.
        floor={
          <>
            {!(mode === "3d" && Scene3D && drawn) && flat}
            {mode === "3d" && Scene3D && (
              <SceneBoundary fallback={null} onError={() => failed3D("scene")}>
                <Scene3D
                  bubbles={bubbles}
                  open={open}
                  onSelect={select}
                  columns={columns}
                  reducedMotion={reducedMotion}
                  onShown={restoreFocus}
                  onDrawn={shownModels}
                  onFailed={modelsFailed}
                />
              </SceneBoundary>
            )}
          </>
        }
      />
    </div>
  );
}

/** Falls back to the 2D scene if the 3D one throws (a lost GPU, a model that won't load). */
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
