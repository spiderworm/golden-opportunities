import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { BossId } from "./bosses";

/** One boss's part in a briefing scene, whichever way the scene is drawn. */
export interface SceneBubble {
  boss: BossId;
  /** Shown while the bubble is closed. */
  teaser: string;
  /** The boss's full line, shown once the bubble is open. */
  line: string;
  /** The plain facts behind the line, under it in the open bubble. */
  facts: ReactNode;
}

/** How the scene is drawn: the 3D bosses, or the 2D picture when WebGL 2 isn't there. */
export type SceneMode = "2d" | "3d";
/**
 * What opened a bubble: the scene coming up, a pointer, or "key" for any activation without one
 * (Enter or Space, and a screen reader's or switch control's press).
 */
export type FocusHow = "auto" | "click" | "key";

export interface BossFocusOptions {
  /** The bubble open when the scene comes up. */
  initial?: number;
  /** How the scene is drawn, or null until the browser has said whether it can draw it in 3D. */
  mode: SceneMode | null;
  onFocus?: (boss: BossId, how: FocusHow, mode: SceneMode) => void;
}

/**
 * The boss whose bubble the scene opened by itself, to report once the scene's mode is known
 * (null until then, or once reported). Rendering on the server can't tell 3D from 2D, so the
 * first report waits for the browser rather than saying "2d" on every device.
 */
export function autoFocus(
  bubbles: readonly SceneBubble[],
  initial: number,
  mode: SceneMode | null,
  reported: boolean,
): BossId | null {
  if (reported || mode === null) return null;
  return bubbles[initial]?.boss ?? null;
}

/**
 * The scene's one focus model: exactly one bubble open at a time, `initial` first. The 2D and 3D
 * scenes both draw from it, so a bubble or a boss selected in either opens the same bubble.
 */
export function useBossFocus(
  bubbles: readonly SceneBubble[],
  { initial = 0, mode, onFocus }: BossFocusOptions,
) {
  const [open, setOpen] = useState(initial);
  const reported = useRef(false);

  useEffect(() => {
    const boss = autoFocus(bubbles, initial, mode, reported.current);
    if (!boss || mode === null) return;
    reported.current = true;
    onFocus?.(boss, "auto", mode);
  }, [bubbles, initial, mode, onFocus]);

  const select = useCallback(
    (i: number, how: Exclude<FocusHow, "auto">) => {
      if (i === open || !bubbles[i]) return;
      setOpen(i);
      // Until the mode is decided, the 2D scene is the one on screen.
      onFocus?.(bubbles[i].boss, how, mode ?? "2d");
    },
    [bubbles, open, mode, onFocus],
  );

  return { open, select };
}
