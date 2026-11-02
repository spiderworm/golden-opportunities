import { storageKey as conversationKey } from "~/assistant/ui/conversation";
import { STORAGE_KEY as PINS_KEY } from "~/investigate/pins/usePins";
import { KEY as STATION_VIEW_KEY } from "~/station/view-memory";

// Reset game, from Settings (David, 2 Nov 2026): the server starts a new save
// (POST /game/new with reset=1, the Play again path), and this browser forgets
// what it kept of the old game. The memos, their seen flags and the station's
// arrival are in the save, so the new one has them fresh. What belongs to the
// person, not the game, stays: the instance and install numbers, the
// share-play-data choice, music settings and held agent text.

/** What this browser keeps per game: the pins board, the conversation with Dewey, and the station's last view. */
export function gameStorageKeys(instance: string): string[] {
  return [PINS_KEY, conversationKey(instance), STATION_VIEW_KEY];
}

/** Forgets this browser's per-game state. Storage can be missing or blocked; then there's nothing to forget. */
export function clearGameStorage(storage: () => Pick<Storage, "removeItem"> | undefined, instance: string) {
  for (const key of gameStorageKeys(instance)) {
    try {
      storage()?.removeItem(key);
    } catch {
      // Blocked: nothing was kept.
    }
  }
}

/**
 * Asks the server for a new game, then forgets the old one here. True once the new save is set (the server answers
 * with a redirect, not followed, so its cookie lands without loading the page twice); false if it refused.
 */
export async function resetGame(instance: string, storage: () => Pick<Storage, "removeItem"> | undefined, post = fetch): Promise<boolean> {
  const body = new FormData();
  body.set("reset", "1");
  let response: Response;
  try {
    response = await post("/game/new", { method: "POST", body, redirect: "manual" });
  } catch {
    return false;
  }
  if (response.type !== "opaqueredirect" && response.status !== 303) return false;
  clearGameStorage(storage, instance);
  return true;
}
