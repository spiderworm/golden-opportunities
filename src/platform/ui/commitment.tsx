import { useEffect, useReducer } from "react";

/**
 * David's rule for anything that loads in stages, such as the station or Decide's robots (3 Nov 2026): "We should
 * display nothing more than "loading" until we've committed to something. And "loading" shouldn't display unless
 * we're taking more than 500ms to make our commitment." So: nothing at first; a loading line only once `delayMs` has
 * passed since mount with nothing committed; and once committed (to the finished scene, or to its fallback), never
 * loading again.
 */
export const LOADING_DELAY_MS = 500;

export interface Commitment {
  /** The delay has passed. */
  late: boolean;
  /** It has committed, for good. */
  committed: boolean;
}

/** What happens: the delay passes, or the page commits. Committed is for good, whatever comes after. */
export function commitment(state: Commitment, event: "late" | "committed"): Commitment {
  if (state.committed) return state;
  return event === "late" ? { ...state, late: true } : { late: state.late, committed: true };
}

/** Whether the loading line shows: late, and not committed. */
export const showsLoading = (state: Commitment) => state.late && !state.committed;

/** Whether to show the loading line: after `delayMs` from mount without a commitment, and never once committed. */
export function useCommitment(
  committed: boolean,
  delayMs = LOADING_DELAY_MS,
): { loading: boolean } {
  const [state, dispatch] = useReducer(commitment, { late: false, committed: false });
  useEffect(() => {
    if (committed) dispatch("committed");
  }, [committed]);
  useEffect(() => {
    const timer = setTimeout(() => dispatch("late"), delayMs);
    return () => clearTimeout(timer);
    // The clock starts at mount and isn't restarted (Chart).
  }, []);
  // `committed` this render too, so the line never shows for the one render before the effect records it.
  return { loading: showsLoading(state) && !committed };
}

/** The loading line's words (Plot): the same for every scene, and nothing more. */
export const LOADING = "Loading…";

/**
 * The loading line. Mounted for as long as the page hasn't committed, empty until it's `loading`: screen readers
 * announce a change inside a live region they already know, but often not one inserted with its text in it (Chart,
 * #348). Placed and styled by the page through `className`.
 */
export function LoadingLine({ loading, className }: { loading: boolean; className?: string }) {
  return (
    <p role="status" className={className}>
      {loading ? LOADING : ""}
    </p>
  );
}
