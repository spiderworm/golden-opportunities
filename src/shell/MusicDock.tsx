import { useEffect, useRef, type RefObject } from "react";
import type { createDock } from "@tellim/kit/music/dock";

import { cutOff } from "~/platform/lazy/cut-off";
import { isPhoneScreen } from "~/platform/phone";

import styles from "./Shell.module.css";

/**
 * The music, docked at the bottom of the menu for good (David, 30 Oct 2026:
 * "the music player seems like it can always live in tooltip player mode,
 * never really needs to go away, if it goes in the navigation sidebar,
 * pinned to the bottom of it"): the song's name over its controls, or
 * "Music" and play before the first song. Its name opens the full player
 * over the page, in `layer`. In the collapsed menu, only pause / play.
 * Nothing loads during server rendering, and with no songs nothing shows.
 */
export function MusicDock({
  collapsed,
  layer,
}: {
  collapsed: boolean;
  layer: RefObject<HTMLDivElement | null>;
}) {
  const spot = useRef<HTMLDivElement>(null);
  const dock = useRef<ReturnType<typeof createDock>>(null);
  const compact = useRef(collapsed);
  compact.current = collapsed;

  useEffect(() => {
    // No music on a phone (David): it gets the phone screen, and the game only mounts there for a moment.
    if (isPhoneScreen()) return;
    let live = true;
    // Caught after the whole chain: loadMusic makes a lazy import of its own (the kit's music), and a reload can cut that one off too.
    void Promise.all([import("~/platform/music/music.client"), import("@tellim/kit/music/dock")])
      .then(async ([{ loadMusic }, { createDock }]) => {
        const music = await loadMusic();
        if (!live || !music || !spot.current) return;
        dock.current = createDock(music, spot.current, { layer: layer.current ?? undefined });
        dock.current.compact(compact.current);
      })
      .catch(cutOff("music dock"));
    return () => {
      live = false;
      dock.current?.dispose();
      dock.current = null;
    };
  }, [layer]);

  useEffect(() => dock.current?.compact(collapsed), [collapsed]);

  return <div ref={spot} className={styles.musicDock} />;
}
