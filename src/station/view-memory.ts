import type { StationViewpoint } from "./scene/StationScene";

// The station opens where the player last left it: inside the shop on a
// first visit, then wherever they were when they last moved the camera.

const KEY = "orbital-books.station.view";
export const FIRST_VIEW: StationViewpoint = "inside";

/** The view to open on. Anything unreadable (no storage, a stale value) counts as a first visit. */
export function rememberedView(storage: Pick<Storage, "getItem"> | undefined): StationViewpoint {
  try {
    const saved = storage?.getItem(KEY);
    return saved === "inside" || saved === "outside" ? saved : FIRST_VIEW;
  } catch {
    return FIRST_VIEW;
  }
}

/** Keeps the view for next time; a browser that won't store it just opens inside again. */
export function rememberView(storage: Pick<Storage, "setItem"> | undefined, view: StationViewpoint) {
  try {
    storage?.setItem(KEY, view);
  } catch {
    // Storage full or blocked: nothing to do.
  }
}
