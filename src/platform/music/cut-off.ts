/**
 * A reload or navigation can cut off the lazy music import, and WebKit then
 * rejects it ("Unable to preload CSS", "Importing a module script failed").
 * That's harmless: no music on this page, and the next load imports afresh.
 */
export function ignoreCutOff(): void {}
