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
  discoveries: DiscoveryId[];
  played: PlayedQuarter[];
  /** Absent until the quarter transaction commits; old unplayed saves remain valid. */
  completion?: { outcomeId: string; outcome: Outcome };
}
