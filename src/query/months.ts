// Month keys name their year ("2193-04"): the player's 2194 sits beside 2193 in the same views.
// Shared by the server and the browser, so it imports nothing.

/**
 * A month value from before months had a year ("04"), as its 2193 key. Those were saved in pins and
 * URLs before any 2194 data existed, so they meant 2193. Anything else is returned unchanged.
 */
export function yearMonth(value: string): string {
  return /^(0[1-9]|1[0-2])$/.test(value) ? `2193-${value}` : value;
}
