/** The quarters a game plays, in order. Each played quarter is saved with its own plan and result. */
export const QUARTERS = ['2194-Q1'] as const;
export type QuarterId = (typeof QUARTERS)[number];
export function isQuarterId(value: unknown): value is QuarterId { return (QUARTERS as readonly unknown[]).includes(value); }
/** A quarter's months, as YYYY-MM, in order. */
export function quarterMonths(period: QuarterId): string[] {
  const [year, q] = period.split('-Q');
  return [0, 1, 2].map(i => `${year}-${String(3 * Number(q) - 2 + i).padStart(2, '0')}`);
}
/** The sale-line quarter number, 1 to 4. */
export function quarterNumber(period: QuarterId): number { return Number(period.slice(-1)); }
