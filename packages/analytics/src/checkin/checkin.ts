// A light check-in: now and then, at a natural pause (a level just ended), a
// one-tap "how's it going?" with, for a so-so or bad answer, a reason to tap.
// The answers are events (checkin, checkin_reason), so the report can set what
// players say beside what they did. Only taps, never typed text.
//
// Never a store-rating prompt, and never a route to one, whatever the answer
// (David, 22 Oct 2026: "One thing I never want to do if we can at all ever
// avoid it is prompt users to rate us on the app store").
import type { Props } from "../client/analytics.ts";

export type CheckinOptions = {
  /** prefix for its storage key, as for createAnalytics */
  key: string;
  track: (event: string, props?: Props) => void;
  /** e.g. "How's Waddleberg going?" */
  question: string;
  /** the reasons offered after 😐 or 👎: id → label */
  reasons: Record<string, string>;
  /** pauses before the first ask (3) */
  firstAfter?: number;
  /** pauses between asks (5), and */
  every?: number;
  /** at least this many days between asks (2) */
  days?: number;
  storage?: Pick<Storage, "getItem" | "setItem">;
};

type State = { pauses: number; lastAt: number; lastPause: number; asked: number };
const DAY = 86_400_000;

export function createCheckin(o: CheckinOptions) {
  const store = o.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const KEY = `${o.key}.checkin`;
  const load = (): State => {
    try {
      return { pauses: 0, lastAt: 0, lastPause: 0, asked: 0, ...JSON.parse(store?.getItem(KEY) ?? "{}") };
    } catch {
      return { pauses: 0, lastAt: 0, lastPause: 0, asked: 0 };
    }
  };
  const save = (s: State) => {
    try {
      store?.setItem(KEY, JSON.stringify(s));
    } catch {}
  };

  /** a pause has come: whether to ask now (and it's counted as asked) */
  function due(now = Date.now()): boolean {
    const s = load();
    s.pauses++;
    const ask = s.asked ? s.pauses - s.lastPause >= (o.every ?? 5) && now - s.lastAt >= (o.days ?? 2) * DAY : s.pauses >= (o.firstAfter ?? 3);
    if (ask) Object.assign(s, { lastAt: now, lastPause: s.pauses, asked: s.asked + 1 });
    save(s);
    return ask;
  }

  /**
   * A pause has come: if it's time, puts the check-in into `into` (before
   * `before`, if given). props say where it was asked (a level, won or lost).
   * Unstyled: the game styles .checkin and its parts.
   */
  function offer(into: HTMLElement | null, props: Props = {}, before?: Element | null): boolean {
    if (!into || !due()) return false;
    o.track("checkin_shown", props);
    const el = document.createElement("div");
    el.className = "checkin";
    el.innerHTML = `<p class="checkin-q">${o.question}</p>
      <div class="checkin-moods"><button data-mood="up" aria-label="Good">👍</button><button data-mood="meh" aria-label="So-so">😐</button><button data-mood="down" aria-label="Not good">👎</button></div>`;
    el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      e.stopPropagation();
      const mood = b.dataset.mood;
      if (mood) {
        o.track("checkin", { ...props, mood });
        if (mood === "up") return void (el.innerHTML = `<p class="checkin-thanks">Thanks! 🙂</p>`);
        el.dataset.mood = mood;
        el.innerHTML = `<p class="checkin-q">What's getting in the way?</p><div class="checkin-reasons">${Object.entries(o.reasons)
          .map(([id, label]) => `<button data-reason="${id}">${label}</button>`)
          .join("")}</div>`;
      } else if (b.dataset.reason) {
        o.track("checkin_reason", { ...props, mood: el.dataset.mood ?? "", reason: b.dataset.reason });
        el.innerHTML = `<p class="checkin-thanks">Thanks, that helps.</p>`;
      }
    });
    into.insertBefore(el, before ?? null);
    return true;
  }

  return { due, offer };
}
