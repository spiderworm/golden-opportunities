import { useId, type ReactNode } from "react";

import styles from "./ReasonToggle.module.css";

/**
 * A toggle button that, when it can't be used, says why (David, 3 Nov 2026: "When "vs. same quarter last year"
 * is not available, can we get a tooltip explaining why?"). It stays focusable rather than `disabled`, which some
 * browsers give no hover and which keyboards skip: `aria-disabled`, with the reason as text it describes itself
 * by, shown on hover and on focus and read by screen readers.
 */
export function ReasonToggle({
  pressed,
  reason,
  onToggle,
  className,
  label,
  hint,
  children,
}: {
  /** What it does, as its tooltip while it can be used ("See which genres added to revenue and which took away"). */
  hint?: string;
  /** Its accessible name, where its text alone is ambiguous ("Table: Revenue by month"). */
  label?: string;
  pressed: boolean;
  /** Why it can't be used now, or null when it can. */
  reason: string | null;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={className}
        aria-pressed={pressed}
        aria-label={label}
        title={reason === null ? hint : undefined}
        aria-disabled={reason !== null || undefined}
        aria-describedby={reason !== null ? id : undefined}
        onClick={() => reason === null && onToggle()}
      >
        {children}
      </button>
      {reason !== null && (
        <span id={id} role="tooltip" className={styles.reason}>
          {reason}
        </span>
      )}
    </span>
  );
}
