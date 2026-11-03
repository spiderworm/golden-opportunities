import { QueryError } from "./errors";
import { isRecord } from "./validate";
import type { QueryView } from "./types";

export const BASELINE_VIEW: QueryView = Object.freeze({
  periods: Object.freeze(["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"] as const),
  includeUndated: true,
});

/** Replace with a trusted save/session resolver when that feature lands. */
export function resolveQueryView(): QueryView {
  return BASELINE_VIEW;
}

/**
 * Most periods a view may allow: 2193's four and every quarter the game can play (400, game/quarters.ts).
 * The 80 before the endless loop failed a save at 76 quarters.
 */
export const MAX_VIEW_PERIODS = 404;
/**
 * Most simulated lines a view given as lines may carry (tests, and the rollups' proofs, compare against them). As
 * lines, a five-year save (302,517) took 1.7 to 2.2 KB a line (Frank, #242), so 600,000 is about ten years.
 */
export const MAX_SIMULATED_LINES = 600_000;
/**
 * Most cells a save's view may carry: what its ledgers cost now that they're rolled up (docs/design/rollups.md).
 * Measured on the five-year save (Frank, rollups step 4, 2 Nov 2026): 30,516 cells added 21 MB of heap after a
 * collection (lines added 168 MB), and Investigate's 11 queries took 0.61 to 0.66 s cold, about 2 ms per thousand
 * cells per query. So 150,000 cells is about 24 years: some 100 MB, 0.3 s a query, 3.5 s for a cold load. Past it a
 * save's ledgers refuse rather than slow every page. Each spanning order's lines per cell, and each cell's sum of
 * squares, for the spread of order totals (Sim, evidence, 3 Nov), added 2.2 MB to the five-year save's 30,555 cells
 * and 26,640 spanning orders (measured after a forced collection): about 23 MB, so some 114 MB at the bound.
 */
export const MAX_SIMULATED_CELLS = 150_000;

export function validateView(view: QueryView): void {
  if (
    !isRecord(view) ||
    Object.keys(view).some(
      (key) =>
        !["periods", "includeUndated", "simulatedSales", "simulatedCells", "version"].includes(key),
    ) ||
    !Array.isArray(view.periods) ||
    view.periods.length > MAX_VIEW_PERIODS ||
    !view.periods.every(
      (period) => typeof period === "string" && /^[1-9]\d{3}-Q[1-4]$/.test(period),
    ) ||
    new Set(view.periods).size !== view.periods.length ||
    typeof view.includeUndated !== "boolean" ||
    (view.simulatedSales !== undefined &&
      (!Array.isArray(view.simulatedSales) || view.simulatedSales.length > MAX_SIMULATED_LINES)) ||
    (view.simulatedCells !== undefined &&
      (view.simulatedSales !== undefined ||
        !isRecord(view.simulatedCells) ||
        !Array.isArray(view.simulatedCells.cells) ||
        !Array.isArray(view.simulatedCells.spanning) ||
        !Array.isArray(view.simulatedCells.spanningLines) ||
        view.simulatedCells.spanningLines.length !== view.simulatedCells.spanning.length ||
        view.simulatedCells.cells.length > MAX_SIMULATED_CELLS)) ||
    (view.version !== undefined &&
      (typeof view.version !== "string" || !/^[0-9a-f]{16}$/.test(view.version)))
  ) {
    throw new QueryError(
      "INVALID_VIEW",
      "The server view must declare unique allowed periods and undated access within supported bounds.",
    );
  }
}
