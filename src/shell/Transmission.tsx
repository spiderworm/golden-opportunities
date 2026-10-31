import { useEffect, useRef, type MouseEvent } from "react";
import { Link } from "react-router";

import { BossBubble } from "~/platform/bosses/BossBubble";
import { FactText } from "~/platform/bosses/facts";
import { ALERT_COPY } from "./alert-copy";
import styles from "./Transmission.module.css";

const COPY = ALERT_COPY.transmission;

export interface TransmissionProps {
  open: boolean;
  /** "Open the ledgers": the link goes to Investigate unless this prevents it. */
  onOpenLedgers: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** "Later", Escape, or a click outside the card. */
  onLater: () => void;
}

/**
 * The Commerce Office's memo, delivered by its robot over the station: a modal dialog, so focus
 * stays in it and Escape puts it off, with the scene still showing around it.
 */
export function Transmission({ open, onOpenLedgers, onLater }: TransmissionProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={COPY.label}
      onCancel={(event) => {
        event.preventDefault();
        onLater();
      }}
      // A click on the backdrop lands on the dialog itself; one on the card lands inside it.
      onClick={(event) => {
        if (event.target === event.currentTarget) onLater();
      }}
    >
      <div className={styles.card}>
        <p className={styles.kicker}>{COPY.kicker}</p>
        <BossBubble boss="profit" facts={<Memo />}>
          {COPY.line}
        </BossBubble>
        <div className={styles.actions}>
          <Link to="/investigate" className={styles.primary} onClick={onOpenLedgers}>
            {COPY.open}
          </Link>
          <button type="button" className={styles.secondary} onClick={onLater}>
            {COPY.later}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function Memo() {
  return (
    <div className={styles.memo}>
      <p className={styles.memoHeader}>
        {COPY.memoHeader.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </p>
      {COPY.memo.map((line, i) => (
        <p key={i}>
          <FactText line={line} />
        </p>
      ))}
    </div>
  );
}
