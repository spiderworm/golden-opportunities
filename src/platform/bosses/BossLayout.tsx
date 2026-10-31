import { useId, type CSSProperties, type ReactNode, type Ref } from "react";

import { BOSSES } from "./bosses";
import type { BossSceneProps } from "./BossScene2D";
import styles from "./BossLayout.module.css";

export interface BossLayoutProps extends BossSceneProps {
  /** What stands on the floor, under the five columns: the 2D figures, or the 3D canvas. */
  floor: ReactNode;
  /** Each column's element, for a scene that places its bosses under them. */
  columnRef?: (index: number) => Ref<HTMLLIElement>;
}

/**
 * The briefing's fixed layout, whichever way the bosses are drawn (David: the bubbles open "without the
 * robots changing position, without layout shifting"). Five equal columns of teaser bubbles, each a
 * disclosure button; the floor the bosses stand on; then one panel with the open boss's full line and
 * facts, sized to the largest of the five, so opening a bubble moves nothing. Positions change only when
 * the scene itself is resized (the window, the menu collapsing): its layout follows its own width.
 */
export function BossLayout({ bubbles, open, onSelect, floor, columnRef }: BossLayoutProps) {
  const id = useId();
  return (
    <div className={styles.scene} style={{ "--open": open, "--count": bubbles.length } as CSSProperties}>
      <div className={styles.room}>
        <ul className={styles.cast}>
          {bubbles.map((b, i) => {
            const { name, tint } = BOSSES[b.boss];
            return (
              <li key={b.boss} ref={columnRef?.(i)} className={styles.column} style={{ "--tint": tint, "--order": i } as CSSProperties}>
                <button
                  type="button"
                  className={styles.teaser}
                  data-open={i === open || undefined}
                  aria-expanded={i === open}
                  aria-controls={`${id}-${i}`}
                  // The open panel comes after all five buttons; this reads it out from its own button.
                  aria-describedby={i === open ? `${id}-${i}` : undefined}
                  // Enter and Space click a button with no pointer: detail is 0.
                  onClick={(event) => onSelect(i, event.detail === 0 ? "key" : "click")}
                >
                  <span className={styles.name}>{name}</span>
                  <span className={styles.teaserLine}>{b.teaser}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className={styles.floor}>{floor}</div>
      </div>
      {/* Every panel is laid out in the same cell, so the box is always the largest one's size. */}
      <div className={styles.panels}>
        {bubbles.map((b, i) => {
          const { name, tint } = BOSSES[b.boss];
          return (
            <div
              key={b.boss}
              id={`${id}-${i}`}
              className={styles.panel}
              data-open={i === open || undefined}
              aria-hidden={i !== open || undefined}
              style={{ "--tint": tint } as CSSProperties}
            >
              <div className={styles.speech}>
                <p className={styles.speaker}>{name}</p>
                <p className={styles.line}>{b.line}</p>
              </div>
              <div className={styles.facts}>{b.facts}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
