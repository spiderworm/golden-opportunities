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
import { LoadingLine, useCommitment } from "../ui/commitment";
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
// width at which BossLayout keeps them, 620 px). Narrower than that, or if the
// 3D scene fails, the 2D scene shows, with the same bubbles and the same focus.
// Only the floor changes: the layout, and whatever the page hangs in its banner
// (a form being filled in, its focus), stays mounted.
//
// Commit before you show (David, 3 Nov 2026: "We should display nothing more than "loading" until we've committed
// to something. And "loading" shouldn't display unless we're taking more than 500ms"). The floor shows nothing
// until the scene chosen is wholly ready: for 3D, its models drawn; for 2D, its figures decoded. Past 500 ms it
// says "Loading…". Then the scene comes in once, never one scene and then the other. 3D that isn't ready within
// SCENE_CAP_MS commits to 2D instead. Once committed, a visit never goes back up to 3D: a briefing narrowed below
// WIDE drops to 2D, which fits, but widening again keeps it. A failed fetch is tried once more, and again on the
// next visit.
const WIDE = 620;
/** How long 3D may take to draw before the floor commits to 2D: past what a cold load takes here (measured). */
export const SCENE_CAP_MS = 4000;
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
  // Whether the chosen scene is ready to show: the 3D models drawn, or the 2D figures decoded.
  const [drawn, setDrawn] = useState(false);
  const [decoded, setDecoded] = useState(false);
  const shownModels = useCallback(() => setDrawn(true), []);
  const failed = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const committed = (mode === "3d" && drawn) || (mode === "2d" && decoded);
  // Committed once, for the visit: no going back up to 3D.
  const settled = useRef(false);
  useEffect(() => {
    if (committed) settled.current = true;
  }, [committed]);
  const { loading } = useCommitment(committed);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    setReducedMotion(matchMedia("(prefers-reduced-motion: reduce)").matches);
    const webgl = canRenderWebGL2();
    let current = true;
    const decide = () => {
      if (!webgl || failed.current || element.clientWidth <= WIDE) return setMode("2d");
      // Committed to a scene: wide again, it stays as it is.
      if (settled.current) return;
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

  // 2D: ready once every figure's image has decoded, so it comes in whole.
  useEffect(() => {
    if (mode !== "2d") return;
    let current = true;
    const images = [...(box.current?.querySelectorAll<HTMLImageElement>("[data-boss] img") ?? [])];
    Promise.all(images.map((img) => img.decode().catch(() => undefined))).then(() => {
      if (current) setDecoded(true);
    });
    return () => {
      current = false;
    };
  }, [mode]);

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
  const failed3D = useCallback((cause: "scene" | "models" | "slow") => {
    if (!pageLeaving()) track("boss_scene_failed", { cause });
    failed.current = true;
    setMode("2d");
  }, []);
  // One function for the whole visit: Bosses re-runs its failure effect when this changes, and would record
  // boss_scene_failed again.
  const modelsFailed = useCallback(() => failed3D("models"), [failed3D]);
  // 3D that hasn't drawn within the cap: 2D instead, before anything has shown.
  useEffect(() => {
    if (mode !== "3d" || drawn) return;
    const timer = setTimeout(() => failed3D("slow"), SCENE_CAP_MS);
    return () => clearTimeout(timer);
  }, [mode, drawn, failed3D]);
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
        // The chosen scene, hidden until it's ready, then shown once; until then, after 500 ms, "Loading…".
        floor={
          <>
            {!committed && <LoadingLine loading={loading} className={styles.loading} />}
            {mode === "2d" && (
              <div className={styles.scene} data-ready={decoded || undefined}>
                {flat}
              </div>
            )}
            {mode === "3d" && Scene3D && (
              <div className={styles.scene} data-ready={drawn || undefined}>
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
              </div>
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
