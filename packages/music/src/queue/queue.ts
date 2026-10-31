// What plays next (plans/music-player.md). Each time the app opens: the
// pinned songs first, in their order, once; then the rest shuffled, with
// songs new since last time at the front of that first shuffle; when the
// shuffle runs out, a fresh one that doesn't start with the song just played.
// Pinned songs stay out of the rotation until the app opens again (David,
// 29 Oct 2026, as Pizza's theme did).
//
// Exclusions are read at the moment a song is picked, so excluding or
// including a song mid-session takes effect without reshuffling. An excluded
// pinned song isn't played at all; included again, it's first again from the
// next open. If every unpinned song is excluded, the included pinned songs go
// round instead, rather than silence.
//
// With Shuffle off (David, 29 Oct 2026), the rest play in the player's own
// order, the one they've dragged the playlist into, from the song after the
// one playing, round and round. The pinned songs still come first.

export type Song = {
  /** never changes: exclusions, hearts and analytics are kept by it */
  id: string;
  /** under the game's music folder */
  file: string;
  title: string;
  /** played first, in list order, once each time the app opens */
  pinned?: boolean;
};

export type QueueOptions = {
  excluded: (id: string) => boolean;
  /** songs added since last time (by an update): the front of the first shuffle */
  fresh?: (id: string) => boolean;
  random?: () => number;
  /** the player's order, every song's id (default: the game's) */
  order?: () => string[];
  /** false: the player's order, not a shuffle (default true) */
  shuffled?: () => boolean;
};

/** Where the queue is, to carry on from after a reload (the player's `remember`). */
export type QueuePlace = { played: string[]; ahead: string[]; pinned: string[]; round: string[]; rounds: number };

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createQueue(songs: Song[], o: QueueOptions) {
  const random = o.random ?? Math.random;
  const byId = new Map(songs.map((s) => [s.id, s]));
  const pinned = songs.filter((s) => s.pinned).map((s) => s.id);
  let round: string[] = [];
  let rounds = 0;
  // what's played, oldest first; `back` steps along it
  const played: string[] = [];
  // songs to come before the shuffle: the ones stepped back over
  const ahead: string[] = [];

  const playable = (id: string) => byId.has(id) && !o.excluded(id);

  function deal(last: string | undefined): string[] {
    let pool = songs.filter((s) => !s.pinned && playable(s.id)).map((s) => s.id);
    if (!pool.length) pool = songs.filter((s) => s.pinned && playable(s.id)).map((s) => s.id);
    let order = shuffle(pool, random);
    if (rounds++ === 0 && o.fresh) order = [...order.filter((id) => o.fresh!(id)), ...order.filter((id) => !o.fresh!(id))];
    if (order.length > 1 && order[0] === last) order.push(order.shift()!);
    return order;
  }

  // the song after the one playing, in the player's order
  function inOrder(): string | undefined {
    const order = (o.order?.() ?? songs.map((s) => s.id)).filter((id) => byId.has(id));
    let list = order.filter((id) => !byId.get(id)!.pinned);
    if (!list.some(playable)) list = order;
    const at = list.indexOf(played.at(-1)!);
    for (let k = 1; k <= list.length; k++) {
      const id = list[(at + k) % list.length];
      if (playable(id)) return id;
    }
    return undefined;
  }

  /** the next song (and it's now the one playing), or null: nothing to play */
  function next(): Song | null {
    const take = (list: string[]) => {
      while (list.length) {
        const id = list.shift()!;
        if (playable(id)) return id;
      }
      return undefined;
    };
    let id = take(ahead) ?? take(pinned);
    if (!id && o.shuffled?.() === false) id = inOrder();
    if (!id) {
      id = take(round);
      if (!id) {
        round = deal(played.at(-1));
        id = take(round);
      }
    }
    if (!id) return null;
    played.push(id);
    return byId.get(id)!;
  }

  /** the song before the one playing (and it's now the one playing); the
   * one that was playing comes next again. Null at the start. */
  function back(): Song | null {
    if (played.length < 2) return null;
    ahead.unshift(played.pop()!);
    return byId.get(played.at(-1)!)!;
  }

  return {
    next,
    back,
    current: (): Song | null => (played.length ? byId.get(played.at(-1)!)! : null),
    /** how many songs have started this session (counting the one playing) */
    count: () => played.length,
    /** where it is now, to save */
    place: (): QueuePlace => ({ played: played.slice(-50), ahead: [...ahead], pinned: [...pinned], round: [...round], rounds }),
    /** carry on from a saved place: the last song played is the one playing.
     * Songs the game no longer has are dropped. */
    resume(p: QueuePlace) {
      const known = (ids: unknown) => (Array.isArray(ids) ? ids.filter((id): id is string => byId.has(id)) : []);
      played.splice(0, played.length, ...known(p.played));
      ahead.splice(0, ahead.length, ...known(p.ahead));
      pinned.splice(0, pinned.length, ...known(p.pinned).filter((id) => byId.get(id)!.pinned));
      round = known(p.round);
      rounds = Number.isInteger(p.rounds) ? p.rounds : 1;
    },
  };
}
