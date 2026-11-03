import { useEffect, useRef, useState } from "react";

/**
 * David's rule for anything that loads in stages, such as the station or Decide's robots (3 Nov 2026): "We should
 * display nothing more than "loading" until we've committed to something. And "loading" shouldn't display unless
 * we're taking more than 500ms to make our commitment." So: nothing at first; a loading line only once `delayMs` has
 * passed since mount with nothing committed; and once committed (to the finished scene, or to its fallback), never
 * loading again.
 */
export const LOADING_DELAY_MS = 500;

/** Whether to show the loading line: after `delayMs` from mount without a commitment, and never once committed. */
export function useCommitment(
  committed: boolean,
  delayMs = LOADING_DELAY_MS,
): { loading: boolean } {
  const [late, setLate] = useState(false);
  // Committed once is committed for good: a later `false` (a scene unmounting as the page goes) doesn't bring the
  // line back.
  const ever = useRef(false);
  if (committed) ever.current = true;
  useEffect(() => {
    if (ever.current) return;
    const timer = setTimeout(() => setLate(true), delayMs);
    return () => clearTimeout(timer);
    // The clock starts at mount and isn't restarted (Chart).
  }, []);
  return { loading: late && !ever.current };
}

/** The loading line's words (Plot): the same for every scene, and nothing more. */
export const LOADING = "Loading…";

/** The loading line: read out as it appears. Styled and placed by the page through `className`. */
export function LoadingLine({ className }: { className?: string }) {
  return (
    <p role="status" className={className}>
      {LOADING}
    </p>
  );
}
