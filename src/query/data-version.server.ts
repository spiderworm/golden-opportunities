// The version of the facts a save's queries can see, for caches to key on (David: "a solid client-side caching
// strategy"). A query's result depends only on the build, the save and its committed quarters (queryViewForSave),
// so the version changes exactly when one of those does: a plan commit, a reset or new game (a new save), or a
// new server process. Discovery and alert-seen writes don't change it, so they never empty a cache.

import { createHash, randomBytes } from 'node:crypto';
import type { GameSave } from '../game/types';

/** New on every server start, so nothing cached outlives a new build or a restart. */
const BOOT = randomBytes(8).toString('hex');

/**
 * An opaque 16-hex version. It's a hash, never the save ID itself, which is the cookie's secret: the browser can
 * hold and compare it, but can't recover the save from it.
 */
export function dataVersion(save: Pick<GameSave, 'id' | 'played'>): string {
  const committed = save.played.map(quarter => `${quarter.period}=${quarter.outcomeId}`).join(',');
  return createHash('sha256').update(`orbital-data-version\0${BOOT}\0${save.id}\0${committed}`).digest('hex').slice(0, 16);
}

/** The response header carrying the version a query's result was computed under. */
export const DATA_VERSION_HEADER = 'X-Orbital-Data-Version';
