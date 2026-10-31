import type { Query, QueryResult, QueryRow, QueryView } from '../query/types';
import { DISCOVERY_CATEGORIES, DISCOVERY_WEEKDAYS, EVIDENCE_MEASURES } from './discovery-evidence';

/** Only validated queries and successfully serialized server results enter this pure detector. */
export function evidenceFromQuery(query: Query, view: QueryView, result: QueryResult): string[] {
  if (result.truncated !== false || !result.rows.length) return [];
  const periods = view.periods.filter(p => !query.filter?.quarter || query.filter.quarter.includes(p));
  if (!periods.length || periods.some(p => !p.startsWith('2193-'))) return [];
  const evidence = new Set<string>();
  const accepted = (EVIDENCE_MEASURES as readonly string[]).includes(query.measure);
  const single = <T>(values: readonly T[] | undefined): T | undefined => values?.length === 1 ? values[0] : undefined;
  const monthsFor = (row: QueryRow) => {
    const month = row.month ?? single(query.filter?.month);
    return typeof month === 'string' && /^(0[1-9]|1[0-2])$/.test(month) ? Number(month) : undefined;
  };
  for (const row of result.rows) {
    if (typeof row[query.measure] !== 'number' || !Number.isFinite(row[query.measure])) continue;
    const month = monthsFor(row);
    const quarter = row.quarter ?? (month ? `2193-Q${Math.ceil(month / 3)}` : single(periods));
    if (!quarter || !periods.includes(quarter as typeof periods[number])) continue;
    const q = Number(quarter.slice(-1));
    if (accepted && [3, 4].includes(q)) {
      // Shape needs a full quarter, not a month sample posing as a quarter.
      const fullQuarter = !query.filter?.month || [q * 3 - 2, q * 3 - 1, q * 3].every(m => query.filter!.month!.includes(String(m).padStart(2, '0')));
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
      else if (!query.filter?.month || [q * 3 - 2, q * 3 - 1, q * 3].every(m => query.filter!.month!.includes(String(m).padStart(2, '0')))) {
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
