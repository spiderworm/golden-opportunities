import { getGameSession } from "~/game/session.server";
import { ALERT_COPY } from "./alert-copy";
import type { StationNotification } from "./NotificationsBell";

export interface StationState {
  /** The in-game date, as YYYY-MM-DD. */
  date: string;
  alerts: StationNotification[];
  /** The Commerce Office's standing order: whether its transmission has been seen, and whether the plan it asks for is in. */
  standingOrder: { seen: boolean; submitted: boolean };
}

export function getStationState(request: Request): StationState {
  const { save, date } = getGameSession(request);
  const seen = save.alertSeen === true;
  return {
    date,
    alerts: [
      {
        id: "q4-revenue-down",
        title: ALERT_COPY.bell.title,
        detail: ALERT_COPY.bell.detail,
        unread: !seen,
        to: "/investigate",
      },
    ],
    standingOrder: { seen, submitted: save.played.length > 0 },
  };
}
