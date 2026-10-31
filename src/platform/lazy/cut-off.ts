import { track } from "~/platform/analytics/analytics.client";

// Set once the page starts going away (a reload or navigation). WebKit cuts
// its loads off straight after beforeunload, before pagehide (measured, 30
// Oct 2026), so both count; a page back from the back-forward cache stays.
// beforeunload also fires for a page that stays (a download, a mailto: link),
// so it lasts only a moment: a page really going never runs the timer (Chart).
const STAYED_MS = 3000;
let leaving = false;
const goingListeners = new Set<() => void>();
let stayedWaiters: (() => void)[] = [];
const going = () => {
  if (!leaving) for (const listener of goingListeners) listener();
  leaving = true;
};
const stayed = () => {
  leaving = false;
  const waiters = stayedWaiters;
  stayedWaiters = [];
  for (const resolve of waiters) resolve();
};
if (typeof window !== "undefined") {
  addEventListener("beforeunload", () => {
    going();
    setTimeout(stayed, STAYED_MS);
  });
  addEventListener("pagehide", going);
  addEventListener("pageshow", stayed);
}

/** Whether the page has started going (a reload or navigation), as far as can be told. */
export const pageLeaving = () => leaving;

/** Calls `listener` each time the page starts going; returns the unsubscribe. */
export function onPageLeaving(listener: () => void): () => void {
  goingListeners.add(listener);
  return () => goingListeners.delete(listener);
}

/** Settles if a page that started going turns out to stay (a download, a mailto: link); a page really going never does. */
export function whenStayed(): Promise<void> {
  return new Promise((resolve) => stayedWaiters.push(resolve));
}

/**
 * The rejection handler for a lazy import (the music, the charts), by what
 * it loads. A reload or navigation can cut the import off, and WebKit then
 * rejects it ("Unable to preload CSS", "Importing a module script failed").
 * That's harmless: nothing to show on a page that's going, and the next load
 * imports afresh. Any other failure (a missing chunk, a module that throws)
 * is recorded and rethrown, so it still shows as a page error.
 */
export function cutOff(what: "music dock" | "music settings" | "music panel" | "charts") {
  return (error: unknown): null => {
    if (leaving) return null;
    track("lazy_import_failed", { what });
    throw error;
  };
}
