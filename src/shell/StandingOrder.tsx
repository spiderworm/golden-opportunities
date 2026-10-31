import { Link } from "react-router";

import { FactText } from "~/platform/bosses/facts";
import { ALERT_COPY } from "./alert-copy";
import styles from "./StandingOrder.module.css";

const COPY = ALERT_COPY.strip;

export interface StandingOrderProps {
  /** On Investigate, the ledgers are already open, so that link is left out. */
  onLedgers: boolean;
  onReadMemo: () => void;
  onOpenLedgers: () => void;
}

/** The Commerce Office's order, kept under the header until the plan is in. */
export function StandingOrder({ onLedgers, onReadMemo, onOpenLedgers }: StandingOrderProps) {
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
