import type { DiscoveryId } from './types';

export const EVIDENCE_MEASURES = ['revenue', 'units', 'orders', 'orders_per_day'] as const;

/**
 * Q2's discovery D (docs/design/q2.md section 6): 2193's Books of the Month that sold 100 or more
 * copies in an average other month (busy), or under 25 (quiet), by the month each was the pick.
 * January's Thatchwork Cottage is neither. A test checks these against the engine's 2193 picks.
 */
export const D_PICKS: readonly { month: number; title: string; format: string; busy: boolean }[] = [
  { month: 2, title: 'The Seawitch Sings', format: 'Mass market paperback', busy: true },
  { month: 3, title: 'Some Eggs or Something?', format: 'Trade paperback', busy: true },
  { month: 4, title: '9803 North Millworks Road', format: 'Mass market paperback', busy: true },
  { month: 5, title: 'Nothing But Capers', format: 'Hardcover', busy: false },
  { month: 6, title: 'A Horrible Human with the Habits of a Monster', format: 'Graphic', busy: false },
  { month: 7, title: 'Ballinby Boys', format: 'Hardcover', busy: true },
  { month: 8, title: 'Inconvenient Confessions: a memoir', format: 'Trade paperback', busy: false },
  { month: 9, title: 'The Thing Is', format: 'Mass market paperback', busy: false },
  { month: 10, title: 'The Startling End of Mr. Hidhoo', format: 'Graphic', busy: false },
  { month: 11, title: 'Quiddity and Quoddity', format: 'Trade paperback', busy: false },
  { month: 12, title: 'Hashtag QuokkaSelfie', format: 'Trade paperback', busy: false },
];
/** E: average rating seen for this many titles in one view. */
export const E_TITLES = 20;
/** `d:{pick month}:{month seen}`, `e:some`/`e:many`, and `f:2193`/`f:2194` for Q1 of each year. */
function Q2_EVIDENCE_KEYS(): string[] {
  return [...D_PICKS.flatMap(p => Array.from({ length: 12 }, (_, i) => `d:${p.month}:${i + 1}`)), 'e:some', 'e:many', 'f:2193', 'f:2194'];
}
/** Stable indices into the unchanged 2193 workbook's category labels. */
export const DISCOVERY_CATEGORIES = {
  genre: ['Childrens', 'Fiction', 'Memoir', 'Mystery', 'Nonfiction', 'Romance', 'SciFi/Fantasy', 'Young Adult'],
  format: ['Board book', 'Graphic', 'Hardcover', 'Mass market paperback', 'Paperback', 'Trade paperback'],
  publisher: ['Cedar House Publishers', 'Etaoin Shrdlu Press', 'Palimpsest Printing', 'Sound & Seas Co.'],
} as const;
export const DISCOVERY_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const EVIDENCE_KEYS = new Set<string>([
  ...EVIDENCE_MEASURES.flatMap(m => [3, 4].flatMap(q => [
    ...Object.entries(DISCOVERY_CATEGORIES).flatMap(([d, labels]) => labels.map((_, i) => `a1:${m}:${d}:${q}:${i}`)),
    ...DISCOVERY_WEEKDAYS.map((_, i) => `b:${m}:${q}:${i}`),
  ])),
  ...Array.from({ length: 6 }, (_, i) => `a2:${i + 7}`),
  ...Array.from({ length: 12 }, (_, i) => `c:${i + 1}`), 'c:quokka',
  ...Q2_EVIDENCE_KEYS(),
]);
export function discoveryParts(evidence: readonly string[]) {
  const set = new Set(evidence);
  const shape = EVIDENCE_MEASURES.some(m => Object.entries(DISCOVERY_CATEGORIES).some(([d, labels]) =>
    labels.filter((_, i) => [3, 4].every(q => set.has(`a1:${m}:${d}:${q}:${i}`))).length >= ({ genre: 6, format: 5, publisher: 4 }[d]!)));
  const size = [7, 8, 9, 10, 11, 12].every(m => set.has(`a2:${m}`));
  const weekdays = EVIDENCE_MEASURES.some(m => [3, 4].every(q => DISCOVERY_WEEKDAYS.every((_, i) => set.has(`b:${m}:${q}:${i}`))));
  const months = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => set.has(`c:${m}`)).length;
  return { shape, size, weekdays, months, quokka: set.has('c:quokka') };
}
export function discoveriesFromEvidence(evidence: readonly string[]): DiscoveryId[] {
  const p = discoveryParts(evidence);
  return [...(p.shape && p.size ? ['A' as const] : []), ...(p.weekdays ? ['B' as const] : []), ...(p.months >= 3 ? ['C' as const] : [])];
}

export const MAX_EVIDENCE_SCOPES = 64;
export function combinedDiscoveryParts(buckets: Record<string, string[]>) {
  const parts = Object.values(buckets).map(discoveryParts);
  return { shape: parts.some(p => p.shape), size: parts.some(p => p.size), weekdays: parts.some(p => p.weekdays),
    months: Math.max(0, ...parts.map(p => p.months)) };
}
export function discoveriesFromBuckets(buckets: Record<string, string[]>): DiscoveryId[] {
  const p = combinedDiscoveryParts(buckets);
  return [...(p.shape && p.size ? ['A' as const] : []), ...(p.weekdays ? ['B' as const] : []), ...(p.months >= 3 ? ['C' as const] : [])];
}

/** A pick's units seen in its own month and at least 3 others. */
function pickSeen(set: ReadonlySet<string>, month: number): boolean {
  const months = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => set.has(`d:${month}:${m}`));
  return months.includes(month) && months.length >= 4;
}
export function q2DiscoveryParts(evidence: readonly string[]) {
  const set = new Set(evidence);
  return {
    busy: D_PICKS.some(p => p.busy && pickSeen(set, p.month)),
    quiet: D_PICKS.some(p => !p.busy && pickSeen(set, p.month)),
    ratings: set.has('e:many') ? 'many' as const : set.has('e:some') ? 'some' as const : null,
    record: set.has('f:2193') && set.has('f:2194'),
  };
}
/** D's two picks can come from different views; E needs one view of 20 titles; F one scope with both years. */
export function combinedQ2Parts(buckets: Record<string, string[]>) {
  const parts = Object.values(buckets).map(q2DiscoveryParts);
  return { busy: parts.some(p => p.busy), quiet: parts.some(p => p.quiet), ratingsSome: parts.some(p => p.ratings !== null),
    ratingsMany: parts.some(p => p.ratings === 'many'), record: parts.some(p => p.record) };
}
export function q2DiscoveriesFromBuckets(buckets: Record<string, string[]>): ('D' | 'E' | 'F')[] {
  const p = combinedQ2Parts(buckets);
  return [...(p.busy && p.quiet ? ['D' as const] : []), ...(p.ratingsMany ? ['E' as const] : []), ...(p.record ? ['F' as const] : [])];
}
/** Scopes that complete a part on their own, kept when the oldest scopes are discarded. */
export function witnessScopes(buckets: Record<string, string[]>): Set<string> {
  const scopes = Object.keys(buckets);
  const first = (test: (keys: string[]) => boolean) => scopes.find(k => test(buckets[k]!));
  return new Set([first(k => discoveryParts(k).shape), first(k => discoveryParts(k).size), first(k => q2DiscoveryParts(k).busy),
    first(k => q2DiscoveryParts(k).quiet), first(k => q2DiscoveryParts(k).ratings === 'many'), first(k => q2DiscoveryParts(k).record)]
    .filter((k): k is string => k !== undefined));
}
