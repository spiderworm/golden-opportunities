import type { QueryTrack } from './types';

/** Local, content-free sink; replace/inject the platform's server adapter when available. */
export const trackQuery: QueryTrack = (event, props) => console.info(JSON.stringify({ event, ...props }));

export function emit(track: QueryTrack, event: string, props: Record<string, string | number | boolean>): void {
  // Observability failures must not change query results or their visibility boundary.
  try { track(event, props); } catch { /* The caller owns recovery of its analytics transport. */ }
}
