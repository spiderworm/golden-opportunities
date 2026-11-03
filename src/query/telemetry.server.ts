import { trackServer } from "../platform/analytics/analytics.server";
import type { QueryTrack } from "./types";

/** Content-free server analytics; query values and save identity never enter events. */
export const trackQuery: QueryTrack = (event, props) => trackServer(event, props);

export function emit(
  track: QueryTrack,
  event: string,
  props: Record<string, string | number | boolean>,
): void {
  // Observability failures must not change query results or their visibility boundary.
  try {
    track(event, props);
  } catch {
    /* The caller owns recovery of its analytics transport. */
  }
}
