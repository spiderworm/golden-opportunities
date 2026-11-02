// Where a save is in the game, from the save alone. Pure: no I/O, no server imports.
import { compareQuarters, isQuarterId, quarterAfter, stationDate, type QuarterId } from './quarters.ts';
import { removedAt } from '../simulation/strikes.ts';
import type { GameSave } from './types';

/** The index of the played quarter whose third counting strike removed the player, or null (endless.md section 7). */
export function removedQuarter(save: GameSave): number | null { return removedAt(save.played.map(q => q.outcome.reportCard.plan.overall.score)); }
/** The quarter the player is planning, or null once the panel has removed them or the game can play no further. */
export function currentQuarter(save: GameSave): QuarterId | null { return removedQuarter(save) === null ? quarterAfter(save.played.length) : null; }
/** The station's date: 1 January, 1 April once Q1 is played, 1 July once Q2 is. */
export function saveDate(save: GameSave): string { return stationDate(save.played.length); }
/** Every quarter is played: the half-year review is the last screen, and Play again starts over. */
export function isFinished(save: GameSave): boolean { return save.played.length > 0 && currentQuarter(save) === null; }
/** The quarters whose memo has been seen, in play order. A version 2 save from before Q2 marks Q1's with `alertSeen`. */
export function alertsSeenOf(save: GameSave): QuarterId[] {
  const seen = new Set<QuarterId>(save.alertsSeen ?? []);
  if (save.alertSeen) seen.add('2194-Q1');
  return [...seen].filter(isQuarterId).sort(compareQuarters);
}
