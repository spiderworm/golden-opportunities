import type { CSSProperties, ReactNode } from "react";

import { BOSSES, type BossId } from "./bosses";
import styles from "./BossBubble.module.css";

export interface BossBubbleProps {
  boss: BossId;
  /** What the boss says. Bosses speak in capitals; the copy carries them. */
  children: ReactNode;
  /** The plain facts behind the joke, on a lighter strip inside the bubble: reading only these gives the whole brief. */
  facts?: ReactNode;
  /** Its place in a scene: each enters a beat after the one before. */
  order?: number;
}

/** A boss speaking: portrait (or a tinted robot face until there is one), name, speech bubble and any facts. */
export function BossBubble({ boss, children, facts, order = 0 }: BossBubbleProps) {
  const { name, tint, portrait } = BOSSES[boss];
  return (
    <figure className={styles.boss} style={{ "--tint": tint, "--order": order } as CSSProperties}>
      <BossAvatar portrait={portrait} />
      <figcaption className={styles.name}>{name}</figcaption>
      <div className={styles.bubble}>
        <blockquote className={styles.line}>{children}</blockquote>
        {facts && <div className={styles.facts}>{facts}</div>}
      </div>
    </figure>
  );
}

/** The portrait, or until there is one, a robot face in the boss's tint. Decorative: the name says who. */
export function BossAvatar({ portrait }: { portrait?: string }) {
  return (
    <div className={styles.avatar} aria-hidden="true">
      {portrait ? (
        <img src={portrait} alt="" width={64} height={64} />
      ) : (
        <svg viewBox="0 0 64 64" width="64" height="64" className={styles.face}>
          <line x1="32" y1="6" x2="32" y2="15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="32" cy="6" r="3.5" fill="currentColor" />
          <rect x="11" y="15" width="42" height="36" rx="10" fill="currentColor" opacity="0.22" stroke="currentColor" strokeWidth="3" />
          <rect x="20" y="26" width="8" height="8" rx="2" fill="currentColor" />
          <rect x="36" y="26" width="8" height="8" rx="2" fill="currentColor" />
          <line x1="23" y1="42" x2="41" y2="42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <rect x="5" y="27" width="6" height="12" rx="2" fill="currentColor" />
          <rect x="53" y="27" width="6" height="12" rx="2" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}
