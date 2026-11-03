// The game's one date style (David, 3 Nov 2026: "let's actually go with this style: 2194 Apr 1 ... that's a much
// better style than every other, and we'll just pretend the whole human universe has switched over to it by
// then"): the year, the short month, then the day, without a leading zero. A deliberate in-world exception to
// US English's "April 1, 2194". Every date the game shows goes through here. Quarters stay "Q1 2194".

export const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const monthName = (month: number): string => {
  const name = SHORT_MONTHS[month - 1];
  if (!name) throw new Error(`Not a month: ${month}`);
  return name;
};

/** A day: "2194 Apr 1". `month` is 1 to 12. */
export const stationDay = (year: string | number, month: number, day: number): string =>
  `${year} ${monthName(month)} ${day}`;

/** A span within one year: "2194 Jan 1 to Mar 31". */
export const stationSpan = (
  year: string | number,
  from: { month: number; day: number },
  to: { month: number; day: number },
): string => `${stationDay(year, from.month, from.day)} to ${monthName(to.month)} ${to.day}`;

/** An ISO date (YYYY-MM-DD) as "2194 Apr 1", without time zones. */
export function formatStationDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Not an ISO date: ${iso}`);
  return stationDay(match[1]!, Number(match[2]), Number(match[3]));
}

/** A month (YYYY-MM) as "2194 Apr". */
export function formatStationMonth(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) throw new Error(`Not a month: ${yearMonth}`);
  return `${match[1]} ${monthName(Number(match[2]))}`;
}
