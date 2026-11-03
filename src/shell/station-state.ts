import { alertsSeenOf, currentQuarter } from "~/game/progress";
import { quarterIndex, type QuarterId } from "~/game/quarters";
import { getGameSession } from "~/game/session.server";
import { dataVersion } from "~/query/data-version.server";
import type { Grade, MeasureId } from "~/simulation/types";
import { ALERT_COPY, Q2_ALERT_COPY, type AlertCopy } from "./alert-copy";
import { laterMemo } from "./later-memo.server";
import { bellItem } from "~/game/event-title";
import type { StationNotification } from "./NotificationsBell";

export interface StationState {
  /** The in-game date, as YYYY-MM-DD. */
  date: string;
  /** Newest first: each quarter's memo once its quarter has opened. */
  alerts: StationNotification[];
  /**
   * The Commerce Office's standing order for the quarter being planned (null once every quarter is played):
   * whether that quarter's memo has been seen, and whether its plan is in.
   */
  standingOrder: {
    quarter: QuarterId | null;
    seen: boolean;
    submitted: boolean;
    memo?: AlertCopy | null;
  };
  /** Q1's overall result, for Q2's memo ("First-quarter overall score"); null until Q1 is played. */
  q1: { score: number; grade: Grade; binding: MeasureId[] } | null;
  /**
   * The version of what this save's queries can see: it changes on every plan commit, reset, new game and server
   * restart, and nowhere else. Browser caches of query results key on it (src/query/data-version.server.ts).
   */
  dataVersion: string;
}

export function getStationState(request: Request): StationState {
  const { save, date } = getGameSession(request);
  const quarter = currentQuarter(save);
  const seen = alertsSeenOf(save);
  const q1 = save.played[0]?.outcome.reportCard.plan.overall;
  const alerts: StationNotification[] = [
    {
      id: "q4-revenue-down",
      title: ALERT_COPY.bell.title,
      detail: ALERT_COPY.bell.detail,
      unread: !seen.includes("2194-Q1"),
      to: "/investigate",
    },
  ];
  if (save.played.length >= 1) {
    alerts.unshift({
      id: "q2-calendar-empty",
      title: Q2_ALERT_COPY.bell.title,
      detail: Q2_ALERT_COPY.bell.detail,
      unread: !seen.includes("2194-Q2"),
      to: "/investigate",
    });
  }
  // From Q3, each quarter's memo is built from its Alma record (later-memo.server.ts), newest first on the bell. The
  // record is written while the player reads the last result; until it is, the quarter has no memo yet, and the
  // next load shows it, so the memo never shows before its record is saved (endless.md section 9).
  const reached = quarter ? quarterIndex(quarter) : save.played.length - 1;
  for (const record of save.alma ?? []) {
    if (quarterIndex(record.quarter) < 2 || quarterIndex(record.quarter) > reached) continue;
    alerts.unshift({
      ...bellItem(record.quarter, record),
      unread: !seen.includes(record.quarter),
      to: "/investigate",
    });
  }
  const current =
    quarter && quarterIndex(quarter) >= 2
      ? save.alma?.find((r) => r.quarter === quarter)
      : undefined;
  return {
    date,
    alerts,
    standingOrder: {
      quarter,
      seen: quarter === null || seen.includes(quarter),
      submitted: quarter === null,
      ...(quarter && quarterIndex(quarter) >= 2
        ? { memo: current ? laterMemo(save, quarter, current) : null }
        : {}),
    },
    q1: q1 ? { score: q1.score, grade: q1.grade, binding: [...q1.binding] } : null,
    dataVersion: dataVersion(save),
  };
}
