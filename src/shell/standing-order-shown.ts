import { createContext } from "react";

/**
 * Whether the standing-order strip is showing above the page. On Investigate the strip carries "Write the plan"
 * (David, 3 Nov: "The two things are correllated"), so the page leaves its own button out while it shows: one
 * button, never none and never two.
 */
export const StandingOrderShown = createContext(false);

/** The plan link's words, in the strip and on Investigate. */
export const PLAN_LINK = { write: "Write the plan", results: "See the results" } as const;
