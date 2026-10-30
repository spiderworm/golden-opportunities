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

import type { Music, Song } from "../player/player.ts";
import { icons } from "./icons.ts";
import { heartButton, nowPlaying, playButton, playlist, volume } from "./parts.ts";

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
};

const SHOW_MS = 4000; // the name alone
const TOUCHED_MS = 6000; // after a control's been touched
const WAIT_MS = 500;
const MARGIN = 8;

export function createPopup(music: Music, root: HTMLElement, host: PopupHost) {
  const doc = root.ownerDocument;
  root.insertAdjacentHTML(
    "beforeend",
    `<div class="music-popup">
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
  let waiting = false;
  let timer = 0;
  let shown = false;
  let full: { el: HTMLElement; dispose: () => void } | null = null;

  function draw() {
    const s = music.state();
    if (!s.song) return;
    el.querySelector(".music-title")!.textContent = s.song.title;
    playButton(button("play"), s.playing);
    heartButton(button("heart"), music.hearted(s.song.id));
  }

  function show() {
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
    clearTimeout(timer);
    timer = window.setTimeout(hide, ms);
  }

  function hide() {
    clearTimeout(timer);
    el.classList.remove("on");
    if (shown) host.hidden?.();
    shown = false;
  }

  // The full player, where the pop-up was: over it, growing up from it in
  // the lower half of the screen, down from it in the upper half.
  function openFull() {
    if (full) return;
    if (!shown) host.place(el, false);
    const at = el.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    hide();
    const card = doc.createElement("div");
    card.className = "music-full";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Music");
    card.innerHTML = `<button type="button" class="music-close" aria-label="Close">${icons.close}</button><div class="music-full-body"></div>`;
    const parts = [volume(music, "popup", doc), nowPlaying(music, "popup", doc), playlist(music, "popup", doc)];
    card.querySelector(".music-full-body")!.append(...parts.map((p) => p.el));
    root.append(card);
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
    music.opened("popup");
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
    if (d === "back") music.back("popup");
    if (d === "skip") music.skip("popup");
    if (d === "play") music.state().playing ? music.pause("popup") : music.resume("popup");
    if (d === "heart" && song) music.setHearted(song.id, !music.hearted(song.id), "popup");
    linger(TOUCHED_MS);
  });
  doc.addEventListener("keydown", (e) => e.key === "Escape" && closeFull());

  // a new song is named, unless the full player is open (it shows it)
  music.onSong(() => full || waiting || show());
  music.subscribe(() => shown && draw());
  // an app put away comes back without either
  doc.addEventListener("visibilitychange", () => {
    if (!doc.hidden) return;
    hide();
    closeFull();
  });

  return {
    el,
    /** for the game: open the full player from a button of its own */
    open: openFull,
    close: closeFull,
    hide,
    /** for the game: it moved what the pop-up sits by (a resize) */
    place: () => shown && host.place(el, false),
  };
}

export type { Song };
