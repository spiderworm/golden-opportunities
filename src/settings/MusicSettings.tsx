import { useEffect, useRef, useState } from "react";
import type { Music } from "@tellim/music/player";

import { cutOff } from "~/platform/lazy/cut-off";
import { isPhoneScreen } from "~/platform/phone";

import styles from "./Settings.module.css";

/** The music panel: the volume (down to mute), the song playing and the playlist. Absent with no songs. */
export function MusicSettings({ load }: { load?: () => Promise<Music | null> }) {
  const [music, setMusic] = useState<Music | null>(null);
  const holder = useRef<HTMLElement>(null);

  useEffect(() => {
    // No music on a phone (David): it gets the phone screen, and the game only mounts there for a moment.
    if (isPhoneScreen()) return;
    let live = true;
    const get = load ?? (() => import("~/platform/music/music.client").then(({ loadMusic }) => loadMusic(), cutOff("music settings")));
    void get().then((m) => live && setMusic(m));
    return () => {
      live = false;
    };
  }, [load]);

  useEffect(() => {
    if (!music || !holder.current) return;
    let panel: { el: HTMLElement; dispose: () => void } | undefined;
    let live = true;
    void import("@tellim/music/panel").then(({ createMusicPanel }) => {
      if (!live || !holder.current) return;
      panel = createMusicPanel(music);
      holder.current.append(panel.el);
    }, cutOff("music panel"));
    return () => {
      live = false;
      panel?.dispose();
      panel?.el.remove();
    };
  }, [music]);

  if (!music) return null;
  // The panel's first row is the music volume, labelled "Music": no heading of our own.
  return <section ref={holder} className={styles.panel} aria-label="Music" />;
}
