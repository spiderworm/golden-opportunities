// The player's segments in the browser. Investigate's views are cached by question (view-cache.client.ts), so a
// cached view would bring back the segments it was loaded with: the list lives here instead, from each answer the
// server gives (a fresh loader, or /api/segments), and the page reads it. Never written on the server, whose
// snapshot is the loader's.
import { useSyncExternalStore } from "react";
import type { SegmentAnswer } from "./api";
import type { Segment, SegmentChange } from "./segments";

let current: Segment[] | null = null;
const listeners = new Set<() => void>();

export function keepSegments(segments: Segment[]): void {
  current = segments;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The segments as the server last said, or the loader's until it has. */
export function useSegments(loaded: Segment[]): Segment[] {
  return (
    useSyncExternalStore(
      subscribe,
      () => current,
      () => null,
    ) ?? loaded
  );
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
