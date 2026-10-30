import { getGameSession } from "~/game/session.server";
import type { StationNotification } from "./NotificationsBell";

export interface StationState {
  /** The in-game date, as YYYY-MM-DD. */
  date: string;
  alerts: StationNotification[];
}

export function getStationState(request: Request): StationState {
  return {
    date: getGameSession(request).date,
    alerts: [
      {
        id: "q4-revenue-down",
        title: "Q4 revenue is down 41% on Q3",
        detail: "Find out what happened before the next quarter starts.",
        unread: true,
        to: "/investigate",
      },
    ],
  };
}
