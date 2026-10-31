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
/** What opened a bubble: the scene coming up, a pointer, or the keyboard. */
export type FocusHow = "auto" | "click" | "key";

export interface BossFocusOptions {
  /** The bubble open when the scene comes up. */
  initial?: number;
  mode: SceneMode;
  onFocus?: (boss: BossId, how: FocusHow, mode: SceneMode) => void;
}

/**
 * The scene's one focus model: exactly one bubble open at a time, `initial` first. The 2D and 3D
 * scenes both draw from it, so a bubble or a boss selected in either opens the same bubble.
 */
export function useBossFocus(bubbles: readonly SceneBubble[], { initial = 0, mode, onFocus }: BossFocusOptions) {
  const [open, setOpen] = useState(initial);
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current || !bubbles[initial]) return;
    reported.current = true;
    onFocus?.(bubbles[initial].boss, "auto", mode);
  }, [bubbles, initial, mode, onFocus]);

  const select = useCallback(
    (i: number, how: Exclude<FocusHow, "auto">) => {
      if (i === open || !bubbles[i]) return;
      setOpen(i);
      onFocus?.(bubbles[i].boss, how, mode);
    },
    [bubbles, open, mode, onFocus],
  );

  return { open, select };
}
