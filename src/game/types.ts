import type { Outcome, Q2Outcome } from '../simulation/types';
import type { Sale } from '../bookshop/types';
import type { QuarterId } from './quarters';
import type { AlmaRecord } from '../alma/record';

/** A to C are found in Q1, D to F in Q2 (docs/design/q2.md section 6). */
export type DiscoveryId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Q2DiscoveryId = 'D' | 'E' | 'F';
export const Q1_DISCOVERIES = ['A', 'B', 'C'] as const;
export const Q2_DISCOVERIES = ['D', 'E', 'F'] as const;
/** Q2's outcome with the discoveries the game records, as M1's Outcome has them: Q2's own only. */
export interface Q2GameOutcome extends Q2Outcome { discoveries: Q2DiscoveryId[] }
/**
 * A quarter's sale lines: replayed from its plan and the save's seed, and checked against the hash and count taken
 * when it was played (replay.server.ts); or, in saves from before that, stored.
 */
export type QuarterLines = { lines: { hash: string; count: number }; sales?: never } | { sales: Sale[]; lines?: never };
/** A committed quarter: its plan and result (the plan is in the outcome), and its lines, written together. */
export type PlayedQuarter = (
  | { period: '2194-Q1'; outcomeId: string; outcome: Outcome }
  | { period: Exclude<QuarterId, '2194-Q1'>; outcomeId: string; outcome: Q2GameOutcome }
) & QuarterLines;
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
  /**
   * Alma's event records, one per quarter from Q3 2194, in quarter order, up to the next unplayed quarter (the
   * one Alma prepares). Absent in older saves. Once written, a record is the quarter's truth (src/alma).
   */
  alma?: AlmaRecord[];
}
