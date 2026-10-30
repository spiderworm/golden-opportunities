import type { StationNotification } from "./NotificationsBell";

export interface StationState {
  /** The in-game date, as YYYY-MM-DD. */
  date: string;
  alerts: StationNotification[];
}

/**
 * Placeholder game state. Frank's game state (the save, the clock, the visible
 * periods) will own the date, and Plot's design the alert wording; swap this
 * for the real source when it lands.
 */
export function getStationState(): StationState {
  return {
    date: "2194-01-04",
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
