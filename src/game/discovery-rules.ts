import type { Query, QueryResult, QueryRow, QueryView } from '../query/types';
import { D_PICKS, DISCOVERY_CATEGORIES, DISCOVERY_WEEKDAYS, E_TITLES, EVIDENCE_MEASURES } from './discovery-evidence';

/** A 2193 month key ("2193-07") as its number, or undefined for any other year or value. */
function monthOf2193(value: unknown): number | undefined {
  const match = typeof value === 'string' ? /^2193-(0[1-9]|1[0-2])$/.exec(value) : null;
  return match ? Number(match[1]) : undefined;
}
const monthKey = (month: number) => `2193-${String(month).padStart(2, '0')}`;

/** Only validated queries and successfully serialized server results enter this pure detector. */
export function evidenceFromQuery(query: Query, view: QueryView, result: QueryResult): string[] {
  if (result.truncated !== false || !result.rows.length) return [];
  const periods = view.periods.filter(p => !query.filter?.quarter || query.filter.quarter.includes(p));
  if (!periods.length || periods.some(p => !p.startsWith('2193-'))) return [];
  const evidence = new Set<string>();
  const accepted = (EVIDENCE_MEASURES as readonly string[]).includes(query.measure);
  const single = <T>(values: readonly T[] | undefined): T | undefined => values?.length === 1 ? values[0] : undefined;
  // Months are year-month keys ("2193-07"); A to C read 2193's alone.
  const monthsFor = (row: QueryRow) => monthOf2193(row.month ?? single(query.filter?.month));
  for (const row of result.rows) {
    if (typeof row[query.measure] !== 'number' || !Number.isFinite(row[query.measure])) continue;
    const month = monthsFor(row);
    const quarter = row.quarter ?? (month ? `2193-Q${Math.ceil(month / 3)}` : single(periods));
    if (!quarter || !periods.includes(quarter as typeof periods[number])) continue;
    const q = Number(quarter.slice(-1));
    if (accepted && [3, 4].includes(q)) {
      // Shape needs a full quarter, not a month sample posing as a quarter.
      const fullQuarter = !query.filter?.month || [q * 3 - 2, q * 3 - 1, q * 3].every(m => query.filter!.month!.includes(monthKey(m)));
      if (fullQuarter && !query.by.includes('month')) for (const [dimension, labels] of Object.entries(DISCOVERY_CATEGORIES)) {
        const value = row[dimension as keyof typeof DISCOVERY_CATEGORIES];
        const index = (labels as readonly unknown[]).indexOf(value);
        if (query.by.includes(dimension as keyof typeof DISCOVERY_CATEGORIES) && index >= 0) evidence.add(`a1:${query.measure}:${dimension}:${q}:${index}`);
      }
      const weekday = DISCOVERY_WEEKDAYS.indexOf(row.weekday ?? '');
      if (query.by.includes('weekday') && weekday >= 0) evidence.add(`b:${query.measure}:${q}:${weekday}`);
    }
    if (query.measure === 'avg_order_value' && [3, 4].includes(q) && query.by.every(d => ['quarter', 'month'].includes(d))) {
      if (month) evidence.add(`a2:${month}`);
      else if (!query.filter?.month || [q * 3 - 2, q * 3 - 1, q * 3].every(m => query.filter!.month!.includes(monthKey(m)))) {
        for (let m = q * 3 - 2; m <= q * 3; m++) evidence.add(`a2:${m}`);
      }
    }
    const title = row.title ?? single(query.filter?.title);
    const rate = row.discount_rate ?? single(query.filter?.discount_rate);
    if (['revenue', 'units'].includes(query.measure) && typeof title === 'string' && title.length && month && rate === '15%' && Number(row[query.measure]) > 0) {
      evidence.add(`c:${month}`);
      if (title === 'Hashtag QuokkaSelfie' && month === 12) evidence.add('c:quokka');
    }
  }
  return [...evidence];
}

/**
 * Q2's evidence (docs/design/q2.md section 6), from the same validated views. D needs 2193 rows: month
 * keys name their year, so 2194's months never count. E is average rating by title. F is one accepted
 * measure seen for Q1 of each year, by quarter (a by-month view doesn't name a quarter, so it can't).
 */
export function q2EvidenceFromQuery(query: Query, view: QueryView, result: QueryResult): string[] {
  if (result.truncated !== false || !result.rows.length) return [];
  const evidence = new Set<string>();
  const single = <T>(values: readonly T[] | undefined): T | undefined => values?.length === 1 ? values[0] : undefined;
  const periods = view.periods.filter(p => !query.filter?.quarter || query.filter.quarter.includes(p));
  if (query.measure === 'avg_rating' && query.by.includes('title')) {
    const titles = new Set(result.rows.filter(r => typeof r.title === 'string' && Number.isFinite(r.avg_rating)).map(r => r.title));
    if (titles.size) evidence.add(titles.size >= E_TITLES ? 'e:many' : 'e:some');
    return [...evidence];
  }
  if (!periods.length) return [];
  // Filters that take a subset of an edition's own sales would make its months unreadable.
  const whole = !query.filter?.weekday && !query.filter?.discount_rate;
  for (const row of result.rows) {
    if (typeof row[query.measure] !== 'number' || !Number.isFinite(row[query.measure])) continue;
    const month = monthOf2193(row.month ?? single(query.filter?.month));
    const quarter = row.quarter ?? single(query.filter?.quarter) ?? (periods.length === 1 ? periods[0] : undefined);
    if (query.measure === 'units' && whole && month) {
      const title = row.title ?? single(query.filter?.title); const format = row.format ?? single(query.filter?.format);
      const pick = D_PICKS.find(p => p.title === title && p.format === format);
      if (pick) evidence.add(`d:${pick.month}:${month}`);
    }
    if ((EVIDENCE_MEASURES as readonly string[]).includes(query.measure) && (quarter === '2193-Q1' || quarter === '2194-Q1')) evidence.add(`f:${quarter.slice(0, 4)}`);
  }
  return [...evidence];
}
