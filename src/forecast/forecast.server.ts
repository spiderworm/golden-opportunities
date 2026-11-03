// The server's side of the player's forecasts (src/forecast/forecast.ts): the hints shown beside Decide's inputs,
// and, in later parts, a played quarter's forecast against what happened and the running calibration.
import { currentQuarter } from "../game/progress";
import { getGameSession } from "../game/session.server";
import { shiftQuarter } from "../query/relative";
import { runQuery } from "../query/run-query.server";
import type { QueryView } from "../query/types";
import type { QuarterId } from "../simulation/quarters";
import { type ForecastHint, type ForecastHints, type ForecastMeasure } from "./forecast";

/**
 * A quarter's total as Investigate shows it, from the player's own view: null for a quarter the ledgers don't hold,
 * so a hint is only ever a figure the player could look up. Not recorded as a query of the player's.
 */
function hint(view: QueryView, measure: ForecastMeasure, quarter: QuarterId): ForecastHint {
  if (!view.periods.includes(quarter)) return { quarter, value: null };
  const result = runQuery({ measure, by: [], filter: { quarter: [quarter] } }, view, () => {});
  return { quarter, value: result.total };
}

/** The hints for `quarter` from a view: the quarter before it and the same quarter a year earlier. */
export function hintsFor(view: QueryView, quarter: QuarterId): ForecastHints {
  const previous = shiftQuarter(quarter, -1) as QuarterId;
  const yearEarlier = shiftQuarter(quarter, -4) as QuarterId;
  const of = (measure: ForecastMeasure) => ({
    previous: hint(view, measure, previous),
    yearEarlier: hint(view, measure, yearEarlier),
  });
  return { quarter, revenue: of("revenue"), units: of("units") };
}

/**
 * The hints for the quarter being planned (David: "values for previous quarter and same quarter previous year"):
 * played data only, from the player's own view. Null once every quarter is played.
 */
export function forecastHints(request: Request): ForecastHints | null {
  const session = getGameSession(request);
  const quarter = currentQuarter(session.save);
  return quarter ? hintsFor(session.queryView, quarter) : null;
}
