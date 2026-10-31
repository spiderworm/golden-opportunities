// Where a save is in the game, from the save alone. Pure: no I/O, no server imports.
import { QUARTERS, quarterAfter, stationDate, type QuarterId } from './quarters.ts';
import type { GameSave } from './types';

/** The quarter the player is planning, or null once every quarter is played. */
export function currentQuarter(save: GameSave): QuarterId | null { return quarterAfter(save.played.length); }
/** The station's date: 1 January, 1 April once Q1 is played, 1 July once Q2 is. */
export function saveDate(save: GameSave): string { return stationDate(save.played.length); }
/** Every quarter is played: the half-year review is the last screen, and Play again starts over. */
export function isFinished(save: GameSave): boolean { return save.played.length === QUARTERS.length; }
/** The quarters whose memo has been seen, in play order. A version 2 save from before Q2 marks Q1's with `alertSeen`. */
export function alertsSeenOf(save: GameSave): QuarterId[] {
  const seen = new Set<QuarterId>(save.alertsSeen ?? []);
  if (save.alertSeen) seen.add('2194-Q1');
  return QUARTERS.filter(q => seen.has(q));
}
