import { useEffect, useRef } from "react";

import { cutOff } from "~/platform/lazy/cut-off";

import styles from "./Shell.module.css";

const MARGIN = 20;

/**
 * The music's pop-up, in the bottom-right corner of the content: a song's name and
 * controls as it starts, and the full player when that's tapped. Nothing
 * loads during server rendering, and with no songs nothing shows.
 */
export function MusicPopup() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    let popup: { el: HTMLElement; close: () => void; place: () => void } | undefined;
    const placeAll = () => popup?.place();
    void Promise.all([import("~/platform/music/music.client"), import("@tellim/music/popup")]).then(async ([{ loadMusic }, { createPopup }]) => {
      const music = await loadMusic();
      if (!live || !music || !layer.current) return;
      const root = layer.current;
      popup = createPopup(music, root, {
        busy: () => false,
        // The bottom-right corner of the content column: the screens keep their
        // actions at the left (Decide's Submit, Result's buttons) or top right
        // (Investigate's plan link). The pop-up is centered on `left`.
        place(el) {
          const right = root.parentElement?.getBoundingClientRect().right ?? window.innerWidth;
          el.style.left = `${right - MARGIN - el.offsetWidth / 2}px`;
          el.style.top = `${window.innerHeight - el.offsetHeight - MARGIN}px`;
        },
      });
      addEventListener("resize", placeAll);
    }, cutOff("music popup"));
    return () => {
      live = false;
      removeEventListener("resize", placeAll);
      popup?.close();
      popup?.el.remove();
    };
  }, []);

  return <div ref={layer} className={styles.musicLayer} />;
}
