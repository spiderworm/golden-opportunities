import type { Outcome } from '../simulation/types';
import type { Sale } from '../bookshop/types';
import type { QuarterId } from './quarters';

export type DiscoveryId = 'A' | 'B' | 'C';
/** A committed quarter: its visible sale lines and the result they produced, written together. */
export interface PlayedQuarter { period: QuarterId; sales: Sale[]; outcomeId: string; outcome: Outcome }
/** Private server persistence. Never return a save or its seed from a route. */
export interface GameSave {
  version: 2;
  id: string;
  seed: number;
  revision: number;
  /** Data/view version; absent legacy values mean revision. */
  queryRevision?: number;
  /** Bounded server-derived evidence, never accepted from a request. */
  discoveryEvidence?: Record<string, string[]>;
  discoveries: DiscoveryId[];
  /** In play order; absent quarters haven't been played. */
  played: PlayedQuarter[];
  /** Set once the player has seen the Commerce Office's opening transmission; absent before, and in older saves. */
  alertSeen?: true;
}
