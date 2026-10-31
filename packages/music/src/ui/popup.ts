// The pop-up (Waddleberg's song toast, grown into a player; David 29 Oct
// 2026): as a song starts, its name, low and quiet, for a few seconds (David,
// 14 Oct: "so that players get to know the names of the songs they're
// listening to"), between its controls: back and pause on the left, the
// heart and next on the right (David's order). Tapping the name opens the
// full player where the pop-up was: the volume, the song playing and the
// playlist. It stays open until closed, tapped outside or the app is put away.
//
// The game says where the pop-up goes (`place`) and when it must wait
// (`busy`): it never covers the play area or a card. While it waits, a song
// that's over isn't named late; the one playing then is.
//
// Docked (dock.ts), the pill stays: it sits in the game's own place for it
// (Goldy's sidebar, David 30 Oct 2026: "can always live in tooltip player
// mode, never really needs to go away") and shows the song playing, or
// "Music" with a play button before the first one.

import type { Music, Song, Where } from "../player/player.ts";
import { icons } from "./icons.ts";
import { fullName, heartButton, nowPlaying, otherTabNotice, playButton, playlist, volume } from "./parts.ts";

export type PopupHost = {
  /** a card or moment the pop-up mustn't cover is up */
  busy(): boolean;
  /** put the pop-up where it may go (its size is known: it's in the page,
   * invisible). `open` is always false now: the full player places itself. */
  place(el: HTMLElement, open: boolean): void;
  /** it's gone (to give back what place() moved aside) */
  hidden?(): void;
  /** the full player opened or closed (a game might pause for it) */
  full?(open: boolean): void;
  /** the pill stays put and shown (dock.ts): no timers, no place() */
  docked?: boolean;
  /** where the full player floats, over the page (default: root) */
  layer?: HTMLElement;
};

const SHOW_MS = 4000; // the name alone
const TOUCHED_MS = 6000; // after a control's been touched
const WAIT_MS = 500;
const MARGIN = 8;

export function createPopup(music: Music, root: HTMLElement, host: PopupHost) {
  const doc = root.ownerDocument;
  const docked = !!host.docked;
  const where: Where = docked ? "dock" : "popup";
  const layer = host.layer ?? root;
  root.insertAdjacentHTML(
    "beforeend",
    `<div class="music-popup${docked ? " music-dock on" : ""}">
      <button type="button" data-do="back" aria-label="Back">${icons.back}</button>
      <button type="button" data-do="play"></button>
      <button class="music-popup-name" type="button" aria-haspopup="dialog" aria-label="Open the music player"><span class="music-notes">${icons.notes}</span><span class="music-title" role="status" aria-live="polite"></span></button>
      <button type="button" data-do="heart" aria-label="Favorite"></button>
      <button type="button" data-do="skip" aria-label="Next">${icons.skip}</button>
    </div>`,
  );
  const all = root.querySelectorAll<HTMLElement>(".music-popup");
  const el = all[all.length - 1];
  const button = (d: string) => el.querySelector<HTMLButtonElement>(`[data-do="${d}"]`)!;
  const named = fullName(el.querySelector(".music-popup-name")!, el.querySelector(".music-title")!);
  // the dock's note floats over the page, by it (a sidebar would clip it)
  const said = docked
    ? otherTabNotice(layer, doc, (note) => {
        const at = el.getBoundingClientRect();
        const box = layer.getBoundingClientRect();
        note.style.left = `${at.left - box.left}px`;
        note.classList.add("music-floating");
        note.style.bottom = `${box.bottom - at.top + 6}px`;
      })
    : otherTabNotice(el, doc);
  let waiting = false;
  let timer = 0;
  let shown = false;
  let full: { el: HTMLElement; dispose: () => void } | null = null;
  // a tap on the dock before any song has started is the gesture that
  // starts the music (player.ts): its play button mustn't then pause it
  let begun = false;
  let starting = false;

  function draw() {
    const s = music.state();
    if (!s.song && !docked) return;
    el.querySelector(".music-title")!.textContent = s.song?.title ?? "Music";
    named();
    playButton(button("play"), s.playing);
    heartButton(button("heart"), !!s.song && music.hearted(s.song.id));
    button("heart").disabled = !s.song;
  }

  function show() {
    if (docked) return draw();
    clearTimeout(timer);
    if (host.busy()) {
      waiting = true;
      timer = window.setTimeout(show, WAIT_MS);
      return;
    }
    waiting = false;
    if (!music.state().song) return hide();
    draw();
    shown = true;
    host.place(el, false);
    el.classList.add("on");
    linger(SHOW_MS);
  }

  function linger(ms: number) {
    if (docked) return;
    clearTimeout(timer);
    timer = window.setTimeout(hide, ms);
  }

  function hide() {
    if (docked) return;
    clearTimeout(timer);
    el.classList.remove("on");
    if (shown) host.hidden?.();
    shown = false;
  }

  // The full player, where the pop-up was: over it, growing up from it in
  // the lower half of the screen, down from it in the upper half.
  function openFull() {
    if (full) return;
    if (!shown && !docked) host.place(el, false);
    const at = el.getBoundingClientRect();
    const box = layer.getBoundingClientRect();
    hide();
    const card = doc.createElement("div");
    card.className = "music-full";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Music");
    card.innerHTML = `<button type="button" class="music-close" aria-label="Close">${icons.close}</button><div class="music-full-body"></div>`;
    const parts = [volume(music, where, doc), nowPlaying(music, where, doc), playlist(music, where, doc)];
    card.querySelector(".music-full-body")!.append(...parts.map((p) => p.el));
    layer.append(card);
    const width = Math.min(box.width - 2 * MARGIN, 400);
    const centre = at.left + at.width / 2 - box.left;
    card.style.width = `${width}px`;
    card.style.left = `${Math.max(MARGIN, Math.min(box.width - width - MARGIN, centre - width / 2))}px`;
    if (at.top + at.height / 2 > box.top + box.height / 2) {
      card.style.bottom = `${Math.max(MARGIN, box.bottom - at.bottom)}px`;
      card.style.maxHeight = `${at.bottom - box.top - MARGIN}px`;
    } else {
      card.style.top = `${Math.max(MARGIN, at.top - box.top)}px`;
      card.style.maxHeight = `${box.bottom - at.top - MARGIN}px`;
    }
    // a tap outside closes it, and only closes it: the game doesn't get it
    const outside = (e: PointerEvent) => {
      if (card.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      closeFull();
    };
    full = {
      el: card,
      dispose() {
        parts.forEach((p) => p.dispose());
        doc.removeEventListener("pointerdown", outside, true);
        card.remove();
      },
    };
    card.querySelector(".music-close")!.addEventListener("click", closeFull);
    doc.addEventListener("pointerdown", outside, true);
    music.opened(where);
    host.full?.(true);
    card.querySelector<HTMLElement>(".music-close")!.focus({ preventScroll: true });
  }

  function closeFull() {
    if (!full) return;
    full.dispose();
    full = null;
    host.full?.(false);
  }

  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".music-popup-name")) return openFull();
    const d = t.closest<HTMLElement>("[data-do]")?.dataset.do;
    const song = music.state().song;
    if (!d) return;
    // (unless another tab has the music: then this play is the player's own, and takes it)
    if (d === "play" && starting && !music.state().elsewhere) return;
    if (d === "back") void music.back(where).then(said);
    if (d === "skip") void music.skip(where).then(said);
    if (d === "play") music.state().playing ? music.pause(where) : void music.resume(where).then(said);
    if (d === "heart" && song) music.setHearted(song.id, !music.hearted(song.id), where);
    linger(TOUCHED_MS);
  });
  const pressed = () => (starting = !begun);
  el.addEventListener("pointerdown", pressed);
  el.addEventListener("keydown", pressed);
  const escape = (e: KeyboardEvent) => e.key === "Escape" && closeFull();
  doc.addEventListener("keydown", escape);

  // a new song is named, unless the full player is open (it shows it)
  const offSong = music.onSong(() => {
    begun = true;
    if (!full && !waiting) show();
  });
  const offState = music.subscribe(() => (shown || docked) && draw());
  if (docked) draw();
  // an app put away comes back without either
  const away = () => {
    if (!doc.hidden) return;
    hide();
    closeFull();
  };
  doc.addEventListener("visibilitychange", away);

  return {
    el,
    /** for the game: open the full player from a button of its own */
    open: openFull,
    close: closeFull,
    hide,
    /** for the game: it moved what the pop-up sits by (a resize) */
    place: () => shown && !docked && host.place(el, false),
    /** for the game: the pop-up is done with (its page or component goes):
     * closes it, removes it and stops listening (Goldy's game, 30 Oct 2026) */
    dispose() {
      closeFull();
      clearTimeout(timer);
      offSong();
      offState();
      doc.removeEventListener("keydown", escape);
      doc.removeEventListener("visibilitychange", away);
      said.note.remove();
      el.remove();
    },
  };
}

export type { Song };
