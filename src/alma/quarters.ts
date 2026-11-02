// Quarter names past the two the game has built ("2194-Q3", "2195-Q1"), for Alma's records.

/** The quarter after "2194-Q2": "2194-Q3"; after "2194-Q4": "2195-Q1". */
export function quarterAfter(quarter: string): string {
  const year = Number(quarter.slice(0, 4)), q = Number(quarter.slice(-1));
  return q === 4 ? `${year + 1}-Q1` : `${year}-Q${q + 1}`;
}
