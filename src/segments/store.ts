// The player's segments in the browser. Investigate's views are cached by question (view-cache.client.ts), so a
// cached view would bring back the segments it was loaded with: the list lives here instead, from each answer the
// server gives (a fresh loader, or /api/segments), and the page reads it. Never written on the server, whose
// snapshot is the loader's.
import { useSyncExternalStore } from "react";
import type { SegmentAnswer } from "./api";
import type { Segment, SegmentChange } from "./segments";

/** The list, and the data version of the load it came from: a change's answer keeps the version it had. */
let current: { segments: Segment[]; version: string | null } | null = null;
const listeners = new Set<() => void>();

export function keepSegments(segments: Segment[], version?: string): void {
  current = { segments, version: version ?? current?.version ?? null };
  for (const listener of listeners) listener();
}

/**
 * A fresh load's list, kept with the data version it was loaded under: Investigate's clientLoader. Here, not inline
 * there: React Router splits the clientLoader into its own chunk by the names it uses, and `view.dataVersion` there
 * pulled in the loader's server-only `dataVersion` import, which failed the production build (#387).
 */
export function keepLoadedSegments(view: { segments: Segment[]; dataVersion: string }): void {
  keepSegments(view.segments, view.dataVersion);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The segments as the server last said, or the loader's until it has. A list kept under another data version (a
 * game since replaced by Play again) is never shown: the page's own load is, until the server answers again
 * (Chart, #387).
 */
export function useSegments(loaded: Segment[], version: string): Segment[] {
  const kept = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return listFor(kept, loaded, version);
}

/** Which list the page shows: the kept one, unless it was kept under another data version, or none was. */
export function listFor(
  kept: { segments: Segment[]; version: string | null } | null,
  loaded: Segment[],
  version: string,
): Segment[] {
  return kept && (kept.version === null || kept.version === version) ? kept.segments : loaded;
}

/** One change, through POST /api/segments; the answer's list is kept, refused or not. */
export async function changeSegments(change: SegmentChange): Promise<SegmentAnswer> {
  const response = await fetch("/api/segments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
  });
  if (response.status === 409) return { ok: false, reason: "busy" };
  if (response.status !== 200 && response.status !== 400)
    throw new Error(`Segments answered ${response.status}`);
  const answer = (await response.json()) as SegmentAnswer;
  if ("segments" in answer) keepSegments(answer.segments);
  return answer;
}

/** The list as the save has it now, as the menu opens: one deleted in another tab drops out. */
export async function refreshSegments(): Promise<void> {
  const response = await fetch("/api/segments", { cache: "no-store" });
  if (response.ok) keepSegments(((await response.json()) as { segments: Segment[] }).segments);
}
