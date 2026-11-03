import { useEffect, useState } from "react";
import { useRouteLoaderData } from "react-router";

import {
  setSharing,
  sharingConfirmed,
  startAnalytics,
  track,
} from "~/platform/analytics/analytics.client";
import type { loader as rootLoader } from "~/root";
import type { ShellHandle } from "~/shell/Shell";
import { MusicSettings } from "./MusicSettings";
import { ResetGame } from "./ResetGame";
import styles from "./Settings.module.css";

export const handle: ShellHandle = { title: "Settings" };

export function meta() {
  return [{ title: "Settings · Orbital Books" }];
}

export default function Settings() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  // Analytics start in the browser, so read their state after the first render.
  const [state, setState] = useState<{ on: boolean; install: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  useEffect(() => {
    if (!root) return;
    // A child's effects run before the root's, so make sure analytics have
    // started (it's idempotent) before reading their state.
    const analytics = startAnalytics(root.instance);
    setState({ on: analytics.sharing(), install: analytics.install() });
    track("settings_opened");
    // Includes the attempt made at page load: a choice the server never
    // confirmed keeps its warning across reloads until the server does.
    let live = true;
    void sharingConfirmed().then((confirmed) => live && setUnconfirmed(!confirmed));
    return () => {
      live = false;
    };
  }, [root?.instance]);

  async function toggle() {
    if (!state || saving) return;
    const on = !state.on;
    setSaving(true);
    const confirmed = await setSharing(on);
    setState({ ...state, on });
    setUnconfirmed(!confirmed);
    setSaving(false);
  }

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-labelledby="share-heading">
        <div className={styles.row}>
          <div>
            <h2 id="share-heading" className={styles.heading}>
              Share play data
            </h2>
            <p className={styles.text}>
              Sends Tellim Games an anonymous record of how the game is played, so we can make it
              better. It never includes what you type to Dewey.{" "}
              <a href="/privacy.html">Privacy policy</a>
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state?.on ?? true}
            aria-labelledby="share-heading"
            className={styles.switch}
            disabled={!state || saving}
            onClick={toggle}
          >
            <span className={styles.knob} />
          </button>
        </div>
        {unconfirmed && (
          <p className={styles.warning} role="status">
            The game couldn't confirm this with its server.{" "}
            {state?.on
              ? "Try again in a moment."
              : "This browser has stopped sending, and the server will be told again the next time the game opens."}
          </p>
        )}
        <dl className={styles.ids}>
          <dt>Install number</dt>
          <dd>{state?.install || "…"}</dd>
          <dt>Instance number</dt>
          <dd>{root?.instance ?? "…"}</dd>
        </dl>
        <p className={styles.note}>
          To have your play data deleted, email tellim.games@gmail.com with your install number.
        </p>
      </section>
      <MusicSettings />
      <ResetGame instance={root?.instance} />
    </div>
  );
}
