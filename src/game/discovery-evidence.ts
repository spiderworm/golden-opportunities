import type { DiscoveryId } from './types';

export const EVIDENCE_MEASURES = ['revenue', 'units', 'orders', 'orders_per_day'] as const;
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
