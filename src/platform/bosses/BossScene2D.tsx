import { useId, type CSSProperties } from "react";

import { BossAvatar } from "./BossBubble";
import { BOSSES } from "./bosses";
import { SpeechBubble } from "./SpeechBubble";
import type { FocusHow, SceneBubble } from "./useBossFocus";
import styles from "./BossScene2D.module.css";

export interface BossSceneProps {
  bubbles: readonly SceneBubble[];
  /** The open bubble's index (from useBossFocus). */
  open: number;
  onSelect: (index: number, how: Exclude<FocusHow, "auto">) => void;
}

/**
 * The bosses standing together in 2D, each under its speech bubble; the open one's column widens and
 * its boss steps forward. The fallback for the 3D scene, which takes the same props.
 */
export function BossScene2D({ bubbles, open, onSelect }: BossSceneProps) {
  const id = useId();
  return (
    <ul className={styles.scene}>
      {bubbles.map((b, i) => {
        const { tint, portrait, figure } = BOSSES[b.boss];
        return (
          <li
            key={b.boss}
            className={styles.member}
            data-open={i === open || undefined}
            style={{ "--tint": tint, "--order": i } as CSSProperties}
          >
            <SpeechBubble bubble={b} open={i === open} id={`${id}-${i}`} onSelect={(how) => onSelect(i, how)} className={styles.bubble} />
            <div className={styles.figure} aria-hidden="true">
              {figure ? <img src={figure} alt="" /> : <BossAvatar portrait={portrait} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
