// What the player has chosen, kept on the device under the game's key: the
// music volume, the songs excluded and hearted, and the songs they've had
// (which is how a song that came with an update is known to be new). Nothing
// about the order or the place in a song is kept: each open shuffles afresh.

export type Prefs = {
  /** 0 (Mute) to 1, as the slider shows it */
  volume: number;
  excluded: string[];
  hearted: string[];
  /** songs the game had last time; null before the first open */
  known: string[] | null;
  /** new songs not yet played */
  fresh: string[];
  /** the playlist's order, as the player dragged it (ids; [] the game's) */
  order: string[];
  /** a fresh shuffle each open (true), or the player's order */
  shuffle: boolean;
};

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadPrefs(key: string, store: Store | undefined, legacyVolume?: () => number | null): Prefs {
  let saved: Partial<Prefs> = {};
  try {
    saved = JSON.parse(store?.getItem(`${key}.music`) ?? "{}") ?? {};
  } catch {}
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const volume = typeof saved.volume === "number" ? saved.volume : (legacyVolume?.() ?? 1);
  return {
    volume: Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1)),
    excluded: list(saved.excluded),
    hearted: list(saved.hearted),
    known: Array.isArray(saved.known) ? list(saved.known) : null,
    fresh: list(saved.fresh),
    order: list(saved.order),
    shuffle: saved.shuffle !== false,
  };
}

export function savePrefs(key: string, store: Store | undefined, prefs: Prefs, failed?: (key: string, error: unknown) => void) {
  try {
    store?.setItem(`${key}.music`, JSON.stringify(prefs));
  } catch (error) {
    failed?.(`${key}.music`, error);
  }
}

/** The player's order for the game's songs now: the saved order, then any
 * song it doesn't have yet (new, or never dragged) in the game's order. */
export function ordered(prefs: Prefs, ids: string[]): string[] {
  const kept = prefs.order.filter((id) => ids.includes(id));
  return [...kept, ...ids.filter((id) => !kept.includes(id))];
}

/** The game's songs now against last time's: the ones an update added join
 * `fresh`. The first open marks nothing new. Songs gone are forgotten from
 * `fresh` (not from excluded or hearted: a song can come back). */
export function meetSongs(prefs: Prefs, ids: string[]): Prefs {
  const added = prefs.known ? ids.filter((id) => !prefs.known!.includes(id)) : [];
  const fresh = [...prefs.fresh.filter((id) => ids.includes(id)), ...added];
  return { ...prefs, known: ids, fresh: [...new Set(fresh)] };
}
