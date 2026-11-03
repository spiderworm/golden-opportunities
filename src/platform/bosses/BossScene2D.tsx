import type { CSSProperties } from "react";

import { BossAvatar } from "./BossBubble";
import { BOSSES } from "./bosses";
import { BossLayout } from "./BossLayout";
import type { FocusHow, SceneBubble } from "./useBossFocus";
import styles from "./BossScene2D.module.css";

export interface BossSceneProps {
  bubbles: readonly SceneBubble[];
  /** The open bubble's index (from useBossFocus). */
  open: number;
  onSelect: (index: number, how: Exclude<FocusHow, "auto">) => void;
}

/** The bosses in 2D, standing under their bubbles in BossLayout. */
export function BossScene2D({ bubbles, open, onSelect }: BossSceneProps) {
  return (
    <BossLayout
      bubbles={bubbles}
      open={open}
      onSelect={onSelect}
      floor={<BossFigures bubbles={bubbles} open={open} onSelect={onSelect} />}
    />
  );
}

/**
 * The 2D bosses on BossLayout's floor; the 3D scene's fallback. A boss is clickable like its bubble,
 * which stays the one control (the figure is decoration for screen readers and the keyboard). The open
 * boss steps forward by transform alone, so nothing around it moves.
 */
export function BossFigures({ bubbles, open, onSelect }: BossSceneProps) {
  return (
    <div className={styles.figures}>
      {bubbles.map((b, i) => {
        const { tint, portrait, figure } = BOSSES[b.boss];
        return (
          <div
            key={b.boss}
            className={styles.figure}
            data-boss={b.boss}
            data-open={i === open || undefined}
            aria-hidden="true"
            style={{ "--tint": tint } as CSSProperties}
            onClick={() => onSelect(i, "click")}
          >
            {figure ? (
              <img src={figure} alt="" draggable={false} />
            ) : (
              <BossAvatar portrait={portrait} />
            )}
          </div>
        );
      })}
    </div>
  );
}
