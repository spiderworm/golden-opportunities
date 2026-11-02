import { useEffect, useRef, useState } from "react";

import { track } from "~/platform/analytics/analytics.client";
import { browserStorage } from "~/assistant/ui/conversation";
import { resetGame } from "./reset";
import styles from "./Settings.module.css";

// Reset game (David, 2 Nov 2026): starts over from January 1, 2194, after an
// in-page confirm step. Cancel takes the focus when it opens, and Escape
// closes it; either puts the focus back on the button that opened it.

export const RESET_COPY = {
  heading: "Reset game",
  text: "Starts a new game from January 1, 2194. Your plans, results, pins and conversation with Dewey are cleared. Your settings stay as they are.",
  open: "Reset game",
  question: "Reset the game? This can't be undone.",
  cancel: "Cancel",
  confirm: "Reset and start over",
  busy: "Resetting…",
  failed: "The game couldn't be reset. Try again in a moment.",
} as const;

/**
 * The panel, in Settings' words unless `copy` gives others: the shell's "Your save can't be replayed" screen uses it
 * with its own heading, text and button, and the same confirm step (src/shell/replay-mismatch.tsx).
 */
export function ResetGame({ instance, copy = {}, from = "settings" }: { instance: string | undefined; copy?: Partial<Record<"heading" | "text" | "open", string>>; from?: "settings" | "replay" }) {
  const words = { ...RESET_COPY, ...copy };
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (asking) cancel.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      opener.current?.focus();
    }
  }, [asking]);

  function ask() {
    setFailed(false);
    setAsking(true);
    track("settings_reset_asked", { from });
  }

  function close() {
    if (busy) return;
    returnFocus.current = true;
    setAsking(false);
    track("settings_reset_cancelled", { from });
  }

  async function confirm() {
    if (!instance || busy) return;
    setBusy(true);
    if (await resetGame(instance, browserStorage)) {
      // A full load, so nothing on the page still holds the old game.
      window.location.assign("/");
      return;
    }
    setBusy(false);
    setFailed(true);
  }

  return (
    <section className={styles.panel} aria-labelledby="reset-heading">
      <div className={styles.row}>
        <div>
          <h2 id="reset-heading" className={styles.heading}>
            {words.heading}
          </h2>
          <p className={styles.text}>{words.text}</p>
        </div>
        {!asking && (
          <button ref={opener} type="button" className={styles.button} disabled={!instance} onClick={ask}>
            {words.open}
          </button>
        )}
      </div>
      {asking && (
        <div
          role="group"
          aria-labelledby="reset-question"
          className={styles.confirm}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        >
          <p id="reset-question" className={styles.question}>
            {RESET_COPY.question}
          </p>
          <div className={styles.actions}>
            <button ref={cancel} type="button" className={styles.button} disabled={busy} onClick={close}>
              {RESET_COPY.cancel}
            </button>
            <button type="button" className={`${styles.button} ${styles.danger}`} disabled={busy} onClick={confirm}>
              {busy ? RESET_COPY.busy : RESET_COPY.confirm}
            </button>
          </div>
        </div>
      )}
      {failed && (
        <p className={styles.warning} role="alert">
          {RESET_COPY.failed}
        </p>
      )}
    </section>
  );
}
