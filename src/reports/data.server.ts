import { removedQuarter } from "~/game/progress";
import { getGameSession } from "~/game/session.server";
import { calibration } from "~/forecast/forecast.server";
import { shopReports } from "./shop.server";

/**
 * What Reports shows, from the save: the shop's reports, the player's own, whether they can still be edited, and the
 * periods a chart's month axis covers. Reports' page loader sends it, and so does /api/reports for the panels that
 * read it elsewhere (Decide's, Investigate's Add to report). It's what the result screens already send, never the
 * save or its seed.
 */
export function reportsData(request: Request) {
  const { save, queryView } = getGameSession(request);
  return {
    ...shopReports(save),
    // The player's reports are the save's, sent whole: they're the player's own words and pins.
    player: save.reports ?? [],
    // After removal, reports can still be opened, but no longer edited or made (section 2).
    editable: removedQuarter(save) === null,
    // The periods the player can see, for a chart's month axis, as Investigate's board has them.
    quarters: [...queryView.periods].sort(),
    // The player's saved segments, for the reports and charts that carry one (src/segments/apply.ts): their names
    // are the player's own words, as the reports are.
    segments: save.segments ?? [],
    // How the player's own forecasts have done (src/forecast): Reports' section, and Decide's panel's, read-only.
    calibration: calibration(request),
  };
}

export type ReportsData = ReturnType<typeof reportsData>;
