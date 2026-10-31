// The dock: the pop-up's pill kept for good in a place of the game's own,
// such as the bottom of its sidebar (Goldy's game; David 30 Oct 2026: "the
// music player seems like it can always live in tooltip player mode, never
// really needs to go away, if it goes in the navigation sidebar, pinned to
// the bottom of it"). Its name opens the full player over `layer`, where the
// dock is. `compact` keeps only pause / play, for a collapsed sidebar.
//
// Its analytics say where: "dock".

import type { Music } from "../player/player.ts";
import { createPopup } from "./popup.ts";

export type DockOptions = {
  /** where the full player floats, over the page: a fixed layer (default: root) */
  layer?: HTMLElement;
  /** the full player opened or closed */
  full?(open: boolean): void;
};

export function createDock(music: Music, root: HTMLElement, o: DockOptions = {}) {
  const pill = createPopup(music, root, { docked: true, busy: () => false, place() {}, layer: o.layer, full: o.full });
  return {
    el: pill.el,
    open: pill.open,
    close: pill.close,
    /** only pause / play (a collapsed sidebar), or everything again */
    compact(on: boolean) {
      pill.el.classList.toggle("music-compact", on);
      if (on) pill.close();
    },
    dispose: pill.dispose,
  };
}
