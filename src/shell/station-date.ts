const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Formats an ISO date (YYYY-MM-DD) as "4 Jan 2194", without time zones. */
export function formatStationDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Not an ISO date: ${iso}`);
  const [, year, month, day] = match;
  const monthName = months[Number(month) - 1];
  if (!monthName) throw new Error(`Not an ISO date: ${iso}`);
  return `${Number(day)} ${monthName} ${year}`;
}
