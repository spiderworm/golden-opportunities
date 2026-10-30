import { useEffect, useState } from "react";
import { useRouteLoaderData } from "react-router";

import { installId, setSharing, sharing, track } from "~/platform/analytics/analytics.client";
import type { loader as rootLoader } from "~/root";
import styles from "./Settings.module.css";

export function meta() {
  return [{ title: "Settings · Orbital Books" }];
}

export default function Settings() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  // Analytics start in the browser, so read their state after the first render.
  const [state, setState] = useState<{ on: boolean; install: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setState({ on: sharing(), install: installId() });
    track("settings_opened");
  }, []);

  async function toggle() {
    if (!state || saving) return;
    const on = !state.on;
    setSaving(true);
    await setSharing(on);
    setState({ ...state, on });
    setSaving(false);
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <section className={styles.panel} aria-labelledby="share-heading">
        <div className={styles.row}>
          <div>
            <h2 id="share-heading" className={styles.heading}>Share play data</h2>
            <p className={styles.text}>
              Sends Tellim Games an anonymous record of how the game is played, so we can make it better. It never
              includes what you type to Dewey. <a href="/privacy.html">Privacy policy</a>
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
        <dl className={styles.ids}>
          <dt>Install number</dt>
          <dd>{state?.install || "…"}</dd>
          <dt>Instance number</dt>
          <dd>{root?.instance ?? "…"}</dd>
        </dl>
        <p className={styles.note}>To have your play data deleted, email tellim.games@gmail.com with your install number.</p>
      </section>
    </div>
  );
}
