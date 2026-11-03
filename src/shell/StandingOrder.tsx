import { Link } from "react-router";

import { FactText } from "~/platform/bosses/facts";
import { ALERT_COPY, type AlertCopy } from "./alert-copy";
import styles from "./StandingOrder.module.css";

export interface StandingOrderProps {
  /** Which quarter's order: Q1's unless given. */
  copy?: AlertCopy["strip"];
  /** On Investigate, the ledgers are already open, so that link is left out. */
  onLedgers: boolean;
  onReadMemo: () => void;
  onOpenLedgers: () => void;
}

/** The Commerce Office's order, kept under the header until the plan is in. */
export function StandingOrder({
  copy: COPY = ALERT_COPY.strip,
  onLedgers,
  onReadMemo,
  onOpenLedgers,
}: StandingOrderProps) {
  return (
    <aside className={styles.strip} aria-label="Standing order">
      <p className={styles.text}>
        <span className={styles.long}>
          <FactText line={COPY.long} />
        </span>
        <span className={styles.short}>
          <FactText line={COPY.short} />
        </span>
      </p>
      <div className={styles.links}>
        <button type="button" className={styles.link} onClick={onReadMemo}>
          {COPY.memo}
        </button>
        {!onLedgers && (
          <Link to="/investigate" className={styles.link} onClick={onOpenLedgers}>
            {COPY.ledgers}
          </Link>
        )}
      </div>
    </aside>
  );
}
