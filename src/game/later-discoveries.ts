// The discoveries a quarter offers from Q3 2194 on (endless.md section 5, with Plot's rulings on #218): its
// event's, "your last quarter on the record" (F, generalized) and "your weakest measure". Pure: the server feeds
// it the views the player produced while planning the quarter, as M1's rules are fed, and decides from them.
import type { Measure, Query, QueryResult, QueryRow, QueryView } from '../query/types';
import type { MeasureId } from '../simulation/types';
import type { QuarterId } from './quarters';
import type { GameSave } from './types';

export const LATER_DISCOVERIES = ['event', 'record', 'weakest'] as const;
export type LaterDiscoveryId = (typeof LATER_DISCOVERIES)[number];
/** Evidence keys, a fixed vocabulary, kept per scope (a view's shape) as M1's are. */
export const LATER_KEYS = new Set(['event', 'weakest', 'r:last', 'r:year']);

/** What the quarter being planned asks: its name, the last one played, the one a year before, its event, last quarter's lowest. */
export interface LaterContext {
  quarter: QuarterId;
  last: QuarterId;
  /** The same quarter a year earlier, as the ledger names it: 2193's for a 2194 quarter. */
  yearBefore: string;
  event: { type: string; params: Readonly<Record<string, string | number>> } | null;
  /** The report card's binding measures last quarter; none when every measure met its goal. */
  weakest: readonly MeasureId[];
}

/** The quarter a year before, as the ledger names it: Q3 2194's is 2193-Q3. */
export const yearBeforeOf = (quarter: QuarterId) => `${Number(quarter.slice(0, 4)) - 1}${quarter.slice(4)}`;

/** What `quarter` asks, from Q3 2194 on, after the quarters this save has played; null before Q3. */
export function laterContext(save: GameSave, quarter: QuarterId): LaterContext | null {
  const index = save.played.findIndex(q => q.period === quarter);
  const before = index === -1 ? save.played : save.played.slice(0, index);
  const last = before.at(-1);
  if (!last || before.length < 2) return null;
  const record = save.alma?.find(r => r.quarter === quarter);
  const card = last.outcome.reportCard.plan.overall;
  return { quarter, last: last.period, yearBefore: yearBeforeOf(quarter), event: record ? { type: record.type, params: record.params } : null,
    weakest: card.score >= 100 ? [] : [...card.binding] };
}

/** The events with a discovery: author fares has none for now, nor a quiet quarter (Plot, #218). */
const EVENT_DISCOVERY = new Set(['genre_surge', 'genre_slump', 'quiet_days', 'format_costs']);

/** What a quarter offers, with what its texts name (endless-copy.md section 4). */
export function laterOffers(ctx: LaterContext): { id: LaterDiscoveryId; params: Record<string, string> }[] {
  const offers: { id: LaterDiscoveryId; params: Record<string, string> }[] = [];
  if (ctx.event && EVENT_DISCOVERY.has(ctx.event.type)) {
    const p = ctx.event.params;
    offers.push({ id: 'event', params: { type: ctx.event.type, yearBefore: ctx.yearBefore,
      ...(p.genre !== undefined ? { genre: String(p.genre) } : {}), ...(p.weekday !== undefined ? { weekday: String(p.weekday) } : {}),
      ...(p.format !== undefined ? { format: String(p.format) } : {}) } });
  }
  offers.push({ id: 'record', params: { last: ctx.last, yearBefore: ctx.yearBefore } });
  if (ctx.weakest.length) offers.push({ id: 'weakest', params: { measure: ctx.weakest[0]!, last: ctx.last } });
  return offers;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const single = <T>(values: readonly T[] | undefined): T | undefined => (values?.length === 1 ? values[0] : undefined);
/** The quarter a row speaks for: its own, its month's, or the one the view is narrowed to. */
function rowQuarter(query: Query, view: QueryView, row: QueryRow): string | undefined {
  if (row.quarter) return row.quarter;
  const month = MONTH.exec(row.month ?? single(query.filter?.month) ?? '');
  if (month) return `${month[1]}-Q${Math.ceil(Number(month[2]) / 3)}`;
  const quarter = single(query.filter?.quarter);
  if (quarter) return quarter;
  // A view narrowed to whole months of one quarter, or a save that sees one quarter only.
  const months = query.filter?.month?.map(m => MONTH.exec(m)).filter(Boolean).map(m => `${m![1]}-Q${Math.ceil(Number(m![2]) / 3)}`);
  if (months?.length && new Set(months).size === 1) return months[0];
  return single(view.periods);
}

/** The ledger measures that look into each report-card measure (Plot, #218). Happiness is undated in the ledger. */
const WEAKEST: Record<MeasureId, { measure: Measure; by: readonly ('month' | 'title')[]; dated: boolean }> = {
  profit: { measure: 'revenue', by: ['month', 'title'], dated: true },
  readers: { measure: 'orders', by: ['month', 'title'], dated: true },
  happiness: { measure: 'avg_rating', by: ['title'], dated: false },
  culture: { measure: 'units', by: ['title'], dated: true },
};

/** The evidence keys one shown view gives the quarter being planned: nonempty, untruncated, the server's own result. */
export function laterEvidenceFromQuery(query: Query, view: QueryView, result: QueryResult, ctx: LaterContext): string[] {
  if (result.truncated !== false || !result.rows.length) return [];
  const rows = result.rows.filter(row => typeof row[query.measure] === 'number' && Number.isFinite(row[query.measure]));
  if (!rows.length) return [];
  const keys = new Set<string>();
  const quarters = new Set(rows.map(row => rowQuarter(query, view, row)).filter((q): q is string => q !== undefined));
  const event = ctx.event;
  if (event && EVENT_DISCOVERY.has(event.type)) {
    const p = event.params;
    if ((event.type === 'genre_surge' || event.type === 'genre_slump') && query.measure === 'units' && query.by.includes('title')
      && single(query.filter?.genre) === String(p.genre)) {
      const titles = new Set(rows.filter(row => row.title && rowQuarter(query, view, row) === ctx.yearBefore).map(row => row.title));
      if (titles.size >= 10) keys.add('event');
    }
    if (event.type === 'quiet_days' && (query.measure === 'orders' || query.measure === 'orders_per_day') && query.by.includes('weekday')
      && [...quarters].some(q => q < ctx.quarter)) keys.add('event');
    if (event.type === 'format_costs' && (query.measure === 'units' || query.measure === 'revenue') && query.by.includes('format')
      && quarters.has(ctx.yearBefore)) keys.add('event');
  }
  if (['revenue', 'units', 'orders', 'orders_per_day'].includes(query.measure)) {
    if (quarters.has(ctx.last)) keys.add('r:last');
    if (quarters.has(ctx.yearBefore)) keys.add('r:year');
  }
  // Only the measure the offer names: with tied binders, the found text must name the one looked at (Plot, #221).
  const weakest = ctx.weakest[0];
  const look = weakest && WEAKEST[weakest];
  if (look && query.measure === look.measure && look.by.some(d => query.by.includes(d)) && (!look.dated || quarters.has(ctx.last))) keys.add('weakest');
  return [...keys];
}

/** The quarter's discoveries from its evidence: "record" needs both years in one scope, as F does. */
export function laterFound(scopes: Readonly<Record<string, readonly string[]>>, ctx: LaterContext): LaterDiscoveryId[] {
  const lists = Object.values(scopes);
  const offered = new Set(laterOffers(ctx).map(o => o.id));
  return LATER_DISCOVERIES.filter(id => offered.has(id) && (id === 'record'
    ? lists.some(keys => keys.includes('r:last') && keys.includes('r:year'))
    : lists.some(keys => keys.includes(id))));
}
