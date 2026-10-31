import type { CSSProperties } from "react";

import { BOSSES } from "./bosses";
import type { FocusHow, SceneBubble } from "./useBossFocus";
import styles from "./SpeechBubble.module.css";

export interface SpeechBubbleProps {
  bubble: SceneBubble;
  open: boolean;
  /** The id of the facts panel the bubble's button controls. */
  id: string;
  onSelect: (how: Exclude<FocusHow, "auto">) => void;
  /** The scene's own placement for the bubble. */
  className?: string;
}

/**
 * A boss's speech bubble in a scene: a disclosure button (its name, then the teaser, or the full line
 * once open) over the facts it controls. The scene places it; set --tail-* on it to aim the tail.
 */
export function SpeechBubble({ bubble, open, id, onSelect, className }: SpeechBubbleProps) {
  const { name, tint } = BOSSES[bubble.boss];
  return (
    <div
      className={className ? `${styles.bubble} ${className}` : styles.bubble}
      data-open={open || undefined}
      style={{ "--tint": tint } as CSSProperties}
    >
      <button
        type="button"
        className={styles.speech}
        aria-expanded={open}
        aria-controls={id}
        // Enter and Space click a button with no pointer: detail is 0.
        onClick={(event) => onSelect(event.detail === 0 ? "key" : "click")}
      >
        <span className={styles.name}>{name}</span>
        <span className={styles.line}>{open ? bubble.line : bubble.teaser}</span>
      </button>
      <div id={id} className={styles.facts} hidden={!open}>
        {bubble.facts}
      </div>
    </div>
  );
}
