import type { Outcome } from '../simulation/types';
import type { Sale } from '../bookshop/types';

export type DiscoveryId = 'A' | 'B' | 'C';
export interface PlayedQuarter { period: '2194-Q1'; sales: Sale[] }
/** Private server persistence. Never return a save or its seed from a route. */
export interface GameSave {
  version: 1;
  id: string;
  seed: number;
  revision: number;
  /** Data/view version; absent legacy values mean revision. */
  queryRevision?: number;
  /** Bounded server-derived evidence, never accepted from a request. */
  discoveryEvidence?: Record<string, string[]>;
  discoveries: DiscoveryId[];
  played: PlayedQuarter[];
  /** Set once the player has seen the Commerce Office's opening transmission; absent before, and in older saves. */
  alertSeen?: true;
  /** Absent until the quarter transaction commits; old unplayed saves remain valid. */
  completion?: { outcomeId: string; outcome: Outcome };
}
