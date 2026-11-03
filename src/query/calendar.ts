import type { Dimension, Query, QueryView } from "./types";

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const CALENDAR_DIMENSIONS = ["quarter", "month", "weekday"] as const;
export type CalendarDay = Record<(typeof CALENDAR_DIMENSIONS)[number], string>;

/** Calendar exposure, not observed sale dates: zero-sale days count too. */
export function eligibleDays(query: Query, view: QueryView): CalendarDay[] {
  const days: CalendarDay[] = [];
  for (const period of view.periods) {
    const year = Number(period.slice(0, 4));
    const startMonth = (Number(period.slice(-1)) - 1) * 3;
    const end = Date.UTC(year, startMonth + 3, 1);
    for (let time = Date.UTC(year, startMonth, 1); time < end; time += 86_400_000) {
      const date = new Date(time);
      const day: CalendarDay = {
        quarter: period,
        month: `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
        weekday: WEEKDAYS[date.getUTCDay()],
      };
      if (
        CALENDAR_DIMENSIONS.every(
          (key) => !query.filter?.[key] || query.filter[key]!.includes(day[key]),
        )
      )
        days.push(day);
    }
  }
  return days;
}

export function groupDays(
  days: readonly CalendarDay[],
  dimensions: Partial<Record<Dimension, string | null>>,
): number {
  return days.filter((day) =>
    CALENDAR_DIMENSIONS.every(
      (key) => dimensions[key] === undefined || dimensions[key] === day[key],
    ),
  ).length;
}
