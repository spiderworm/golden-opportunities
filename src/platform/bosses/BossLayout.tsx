import { createContext, useContext, useId, type CSSProperties, type ReactNode, type Ref } from "react";

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
 * What the page hangs in the banner beside the open boss's briefing: its heading, and its form. A context, so
 * either scene (2D or Orbit's 3D) can render BossLayout without passing it through.
 */
export const BossBanner = createContext<{ heading?: ReactNode; form?: ReactNode }>({});

/**
 * The briefing's fixed layout, whichever way the bosses are drawn: the scene is the page (David: "makes the 3D
 * graphics ... much larger"). A frosted banner across the top holds the open boss's briefing and the page's
 * form; under it, five equal columns of teaser tags, each a disclosure button; then the floor, which takes the
 * rest of the room's height, where the bosses stand. Opening a tag or ticking a move moves nothing ("without
 * the robots changing position, without layout shifting"): positions change only when the scene itself is
 * resized (the window, the menu collapsing), as its layout follows its own size.
 */
export function BossLayout({ bubbles, open, onSelect, floor, columnRef }: BossLayoutProps) {
  const id = useId();
  const banner = useContext(BossBanner);
  return (
    <div className={styles.scene} style={{ "--open": open, "--count": bubbles.length } as CSSProperties}>
      <div className={styles.room}>
        {/* The banner hung from the ceiling (David's layout 2): the open boss's briefing, then the form. Its
            panels share one cell, so it's always the tallest one's height and nothing below it moves. */}
        <div className={styles.banner}>
          <div className={styles.briefing}>
            {banner.heading}
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
                    <p className={styles.speaker}>{name}</p>
                    <p className={styles.line}>{b.line}</p>
                    <div className={styles.facts}>{b.facts}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {banner.form && <div className={styles.form}>{banner.form}</div>}
        </div>
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
                  // The open panel is in the banner above; this reads it out from its own button.
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
    </div>
  );
}
