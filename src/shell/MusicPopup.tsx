import { useEffect, useRef } from "react";

import styles from "./Shell.module.css";

const MARGIN = 20;

/**
 * The music's pop-up, over the bottom of the content: a song's name and
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
        // Centered under the content column, clear of the sidebar.
        place(el) {
          const content = root.parentElement?.getBoundingClientRect();
          el.style.left = `${content ? content.left + content.width / 2 : window.innerWidth / 2}px`;
          el.style.top = `${window.innerHeight - el.offsetHeight - MARGIN}px`;
        },
      });
      addEventListener("resize", placeAll);
    });
    return () => {
      live = false;
      removeEventListener("resize", placeAll);
      popup?.close();
      popup?.el.remove();
    };
  }, []);

  return <div ref={layer} className={styles.musicLayer} />;
}
