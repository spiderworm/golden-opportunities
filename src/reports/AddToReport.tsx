import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import type { Pin } from "~/investigate/pins/spec";
import { track } from "~/platform/analytics/analytics.client";
import { PLAYER_COPY as COPY } from "./copy";
import { REPORT_LIMITS, type PlayerReport } from "./player";
import { useReportsData } from "./useReportsData";
import styles from "./Reports.module.css";

/**
 * A pinned chart's "Add to report" (reports.md section 3): the player's reports, and New report. Choosing one opens
 * the editor on Reports with the pin added, for the player to save; nothing is written from here. The list is
 * fetched from Reports' data (/api/reports) when the menu opens.
 */
export function AddToReport({ pin }: { pin: Pin }) {
  const [open, setOpen] = useState(false);
  // Fetched when the menu opens, with a plain fetch, never through React Router (useReportsData).
  const reports: { player: PlayerReport[]; editable: boolean } | null = useReportsData(open);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && e.target !== button.current) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const list = reports?.player ?? [];
  const reported = (to: "existing" | "new") =>
    track("investigate_pin_reported", { kind: pin.kind, pinnedBy: pin.pinnedBy, to });
  const atLimit = list.length >= REPORT_LIMITS.reports;
  return (
    <div className={styles.addTo}>
      <button
        ref={button}
        type="button"
        className={styles.addToButton}
        aria-expanded={open}
        aria-label={`${COPY.addToReport}: ${pin.title}`}
        onClick={() => setOpen(!open)}
      >
        {COPY.addToReport}
      </button>
      {open && (
        <div ref={menu} className={styles.addToMenu}>
          {!reports ? (
            <p className={styles.muted} aria-busy="true">
              {"…"}
            </p>
          ) : !reports.editable ? (
            <p className={styles.muted}>{COPY.closed}</p>
          ) : (
            <ul className={styles.plain}>
              {list.map((r) => {
                const full = r.items.length >= REPORT_LIMITS.items;
                return (
                  <li key={r.id}>
                    {full ? (
                      <span className={styles.muted} title={COPY.full}>
                        {r.title}
                        <span className={styles.visuallyHidden}>{`, ${COPY.full}`}</span>
                      </span>
                    ) : (
                      <Link
                        to={`/reports?edit=${r.id}&add=${pin.id}`}
                        onClick={() => reported("existing")}
                      >
                        {r.title}
                      </Link>
                    )}
                  </li>
                );
              })}
              <li>
                {atLimit ? (
                  <span className={styles.muted}>{COPY.limit}</span>
                ) : (
                  <Link to={`/reports?new=1&add=${pin.id}`} onClick={() => reported("new")}>
                    {COPY.newReportFromPin}
                  </Link>
                )}
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
