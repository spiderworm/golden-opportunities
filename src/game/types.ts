import type { Outcome, Q2Outcome } from '../simulation/types';
import type { Sale } from '../bookshop/types';
import type { QuarterId } from './quarters';

export type DiscoveryId = 'A' | 'B' | 'C';
/** Q2's outcome with the discoveries the game records, as M1's Outcome has them. */
export interface Q2GameOutcome extends Q2Outcome { discoveries: DiscoveryId[] }
/** A committed quarter: its visible sale lines and the result they produced, written together. */
export type PlayedQuarter =
  | { period: '2194-Q1'; sales: Sale[]; outcomeId: string; outcome: Outcome }
  | { period: '2194-Q2'; sales: Sale[]; outcomeId: string; outcome: Q2GameOutcome };
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
  /** Set once the player has seen the Commerce Office's opening transmission; absent before, and in older saves. Q1's, as `alertsSeen` has it. */
  alertSeen?: true;
  /** The quarters whose Commerce Office memo the player has seen, in play order. */
  alertsSeen?: QuarterId[];
}
