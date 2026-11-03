import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { track } from "~/platform/analytics/analytics.client";
import type { BossId } from "~/platform/bosses/bosses";
import { FactText } from "~/platform/bosses/facts";
import type { FocusHow, SceneMode } from "~/platform/bosses/useBossFocus";
import { DECIDE_COPY as COPY, type BriefingBubble } from "./copy";
import styles from "./Decide.module.css";

// What both quarters' plans share: the bosses' scene and the quarter playing out.

const MONTH_MS = 900;

/** The scene's bubbles, in Plot's order: teaser, full line and fact strip for each boss. */
export const sceneOf = (briefing: readonly BriefingBubble[]) =>
  briefing.map((b) => ({
    boss: b.boss,
    teaser: b.teaser,
    line: b.line,
    facts: <Facts bubble={b} />,
  }));

export function onBubbleFocused(boss: BossId, how: FocusHow, mode: SceneMode) {
  track("bubble_focused", { boss, how, mode });
}

/** A bubble's fact strip: its sentence, with the key figures in bold, and in Q1 the survey drone's scheduled picks. */
function Facts({ bubble }: { bubble: BriefingBubble }) {
  return (
    <>
      <p>
        <FactText line={bubble.facts} />
      </p>
      {bubble.picks && (
        <ul>
          {COPY.scheduled.map((pick) => (
            <li key={pick.month}>
              <strong>{pick.month}</strong> <cite className={styles.bookTitle}>{pick.title}</cite> (
              {pick.format})
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The quarter's months one by one ("January..."), then the quarter closes and the results open. */
export function PlayOut({ lines: months, done }: { lines: readonly string[]; done: boolean }) {
  const [shown, setShown] = useState(1);
  const navigate = useNavigate();
  const lines = [...months, COPY.closed];
  const closed = shown >= lines.length;

  useEffect(() => {
    if (shown < months.length || (shown === months.length && done)) {
      const timer = setTimeout(() => setShown(shown + 1), MONTH_MS);
      return () => clearTimeout(timer);
    }
  }, [shown, done, months.length]);

  useEffect(() => {
    if (!closed) return;
    const timer = setTimeout(() => navigate("/result"), MONTH_MS);
    return () => clearTimeout(timer);
  }, [closed, navigate]);

  return (
    <div className={styles.playout} role="status" aria-live="polite">
      {lines.slice(0, shown).map((line, i) => (
        <p key={line} className={i === lines.length - 1 ? styles.closed : styles.month}>
          {line}
        </p>
      ))}
    </div>
  );
}
