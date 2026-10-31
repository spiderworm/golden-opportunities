import { createHash } from 'node:crypto';
import type { GameSave } from './types';
import type { Query, QueryResult, QueryView } from '../query/types';
import { evidenceFromQuery, q2EvidenceFromQuery } from './discovery-rules';
import { combinedDiscoveryParts, combinedQ2Parts } from './discovery-evidence';
import { saves } from './session.server';
import { trackServer } from '../platform/analytics/analytics.server';
import { SaveError } from './store.server';
import { currentQuarter } from './progress';
import { QueryError } from '../query/errors';

export interface ObservedQuery { query: Query; result: QueryResult }
/** Caller supplies server-authorized state and queries actually shown, never request claims. */
export function recordDiscoveries(save: GameSave, view: QueryView, observed: readonly ObservedQuery[]): void {
  // A, B and C come from views before Q1's plan, D, E and F from views before Q2's; none after.
  const quarter = currentQuarter(save);
  if (!quarter) return;
  const rules = quarter === '2194-Q1' ? evidenceFromQuery : q2EvidenceFromQuery;
  const evidence: Record<string, string[]> = {};
  for (const { query, result } of observed) for (const key of rules(query, view, result)) {
    const promotion = key.startsWith('c:');
    const filter = Object.fromEntries(Object.entries(query.filter ?? {})
      .filter(([d]) => !['quarter', 'month', ...(promotion ? ['title', 'discount_rate'] : [])].includes(d))
      .sort(([a], [b]) => a.localeCompare(b)).map(([d, values]) => [d, [...values].sort()]));
    // The evidence key contains the breakdown. Time axes are interchangeable, so views that
    // differ only by quarter or month share a scope (F's matching rule);
    // C pools all observed 15% title-month pairs, including across measures.
    const scope = createHash('sha256').update(JSON.stringify(promotion ? ['promotion'] : [query.measure, query.by.filter(d => !['quarter', 'month'].includes(d)).sort(), filter])).digest('hex');
    evidence[scope] = [...new Set([...(evidence[scope] ?? []), key])];
  }
  if (!Object.keys(evidence).length) return;
  try {
    const recorded = saves.recordEvidence(save.id, save.queryRevision ?? save.revision, evidence, quarter);
    const before = combinedDiscoveryParts(recorded.oldEvidence);
    const after = combinedDiscoveryParts(recorded.save.discoveryEvidence ?? {});
    const emit = (name: string, props: Record<string, string>) => { try { trackServer(name, props); } catch { /* Analytics cannot undo evidence. */ } };
    for (const id of recorded.save.discoveries) if (!recorded.before.includes(id)) emit('discovery_found', { id });
    for (const [part, gained] of [['A1', after.shape && !before.shape], ['A2', after.size && !before.size], ['C_partial', after.months > 0 && after.months < 3 && before.months === 0]] as const) {
      if (gained) emit('discovery_part_found', { part });
    }
    const q2Before = combinedQ2Parts(recorded.oldEvidence); const q2After = combinedQ2Parts(recorded.save.discoveryEvidence ?? {});
    const oneOfTwo = (p: typeof q2Before) => p.busy !== p.quiet;
    for (const [part, gained] of [['D_partial', oneOfTwo(q2After) && !q2Before.busy && !q2Before.quiet],
      ['E_partial', q2After.ratingsSome && !q2After.ratingsMany && !q2Before.ratingsSome]] as const) {
      if (gained) emit('discovery_part_found', { part });
    }
  } catch (error) {
    if (error instanceof SaveError && error.code === 'SAVE_BUSY') throw new QueryError('RATE_LIMITED', 'Game state is busy. Retry shortly.');
    throw error;
  }
}
