// The pieces the Settings panel and the full player share: the music volume,
// the song playing with its controls, and the playlist. Each returns its
// element and a dispose for when it goes.

import type { Music, Where } from "../player/player.ts";
import { icons } from "./icons.ts";

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);
const percent = (v: number) => (v === 0 ? "Mute" : `${Math.round(v * 100)}%`);

export function playButton(b: HTMLButtonElement, playing: boolean) {
  b.innerHTML = playing ? icons.pause : icons.play;
  b.setAttribute("aria-label", playing ? "Pause" : "Play");
}

export function heartButton(b: HTMLButtonElement, on: boolean) {
  b.innerHTML = on ? icons.heart : icons.heartOutline;
  b.setAttribute("aria-pressed", String(on));
  b.classList.toggle("on", on);
}

/** A song's name cut short by its ellipsis has the whole of it as a tooltip,
 * on hover (David, 30 Oct 2026). Checked as the pointer arrives and when the
 * name changes (`check`), so a name that fits has none. */
export function fullName(host: HTMLElement, name: HTMLElement) {
  const check = () => {
    if (name.scrollWidth > name.clientWidth) host.title = name.textContent ?? "";
    else host.removeAttribute("title");
  };
  host.addEventListener("pointerenter", check);
  return () => host.matches(":hover") && check();
}

/** Another app wouldn't let go of the music (oneTab), shown
 * where the player pressed play for a few seconds. */
const OTHER_TAB = "Music is playing in another game. Pause it there, then try again.";
const NOTICE_MS = 6000;
export function otherTabNotice(holder: HTMLElement, doc: Document, place?: (note: HTMLElement) => void) {
  const note = doc.createElement("p");
  note.className = "music-notice";
  note.setAttribute("role", "alert");
  note.hidden = true;
  holder.append(note);
  let timer = 0;
  /** said, if `ok` is false (the player's play, skip or back didn't take);
   * `note` to remove when its holder goes */
  return Object.assign((ok: boolean) => {
    if (ok) return;
    note.textContent = OTHER_TAB;
    note.hidden = false;
    place?.(note);
    clearTimeout(timer);
    timer = window.setTimeout(() => (note.hidden = true), NOTICE_MS);
  }, { note });
}

/** The music volume, down to Mute: the game's music volume setting. */
export function volume(music: Music, where: Where, doc: Document) {
  const el = doc.createElement("label");
  el.className = "music-volume";
  el.innerHTML = `<span><b>Music</b><small class="music-level"></small></span><input type="range" min="0" max="100" step="5" aria-label="Music volume">`;
  const slider = el.querySelector("input")!;
  const draw = () => {
    if (doc.activeElement !== slider) slider.value = String(Math.round(music.volume() * 100));
    el.querySelector(".music-level")!.textContent = percent(music.volume());
  };
  // the volume moves live as the slider does; the event once it's let go
  slider.addEventListener("input", () => music.setVolume(Number(slider.value) / 100));
  slider.addEventListener("change", () => music.volumeSettled(where));
  draw();
  return { el, dispose: music.subscribe(draw) };
}

/** The song playing: its name, back, pause and next, and its heart. */
export function nowPlaying(music: Music, where: Where, doc: Document) {
  const el = doc.createElement("div");
  el.className = "music-now";
  el.innerHTML = `<span class="music-notes">${icons.notes}</span><span class="music-title"></span>
    <span class="music-buttons">
      <button type="button" data-do="heart" aria-label="Favorite"></button>
      <button type="button" data-do="back" aria-label="Back">${icons.back}</button>
      <button type="button" data-do="play"></button>
      <button type="button" data-do="skip" aria-label="Next">${icons.skip}</button>
    </span>`;
  const button = (d: string) => el.querySelector<HTMLButtonElement>(`[data-do="${d}"]`)!;
  const title = el.querySelector<HTMLElement>(".music-title")!;
  const named = fullName(title, title);
  const said = otherTabNotice(el, doc);
  const draw = () => {
    const s = music.state();
    el.hidden = !s.song;
    title.textContent = s.song?.title ?? "";
    named();
    playButton(button("play"), s.playing);
    heartButton(button("heart"), !!s.song && music.hearted(s.song.id));
  };
  el.addEventListener("click", (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>("[data-do]")?.dataset.do;
    const song = music.state().song;
    if (d === "back") void music.back(where).then(said);
    if (d === "skip") void music.skip(where).then(said);
    if (d === "play") music.state().playing ? music.pause(where) : void music.resume(where).then(said);
    if (d === "heart" && song) music.setHearted(song.id, !music.hearted(song.id), where);
  });
  draw();
  return { el, dispose: music.subscribe(draw) };
}

/** The playlist (David, 29 Oct 2026): Shuffle, then every song with a
 * handle to drag it into the player's order, a heart, and a switch to leave
 * it out. Each time it opens, the songs switched off go to the bottom; a
 * song switched off while it's open stays put until next time, so nothing
 * jumps under the player's finger. */
export function playlist(music: Music, where: Where, doc: Document) {
  music.sinkExcluded();
  const el = doc.createElement("div");
  el.className = "music-playlist";
  el.innerHTML = `<label class="music-row music-shuffle"><span class="music-song-title">Shuffle<small class="music-shuffle-says"></small></span>
      <span class="music-switch"><input type="checkbox" data-do="shuffle" aria-label="Shuffle"><span></span></span></label>
    <p class="music-none" hidden>Every song is switched off, so no music plays.</p>
    <ul class="music-songs"></ul>`;
  const ul = el.querySelector("ul")!;
  const shuffle = el.querySelector<HTMLInputElement>('[data-do="shuffle"]')!;
  let shown = "";

  function rows() {
    const list = music.playlist();
    const key = list.map((s) => s.id).join("\n");
    if (key === shown) return;
    const focused = (doc.activeElement as HTMLElement | null)?.closest<HTMLElement>("li")?.dataset.id;
    shown = key;
    ul.innerHTML = list
      .map(
        (s) => `<li data-id="${esc(s.id)}">
        <button type="button" class="music-grip" aria-label="Move ${esc(s.title)}: up and down arrows">${icons.grip}</button>
        <span class="music-song-title">${esc(s.title)}${s.pinned ? `<small class="music-tag">Plays first</small>` : ""}<small class="music-new" hidden>New</small></span>
        <button type="button" class="music-heart" aria-label="Favorite: ${esc(s.title)}"></button>
        <span class="music-switch"><input type="checkbox" aria-label="Play ${esc(s.title)}"><span></span></span>
      </li>`,
      )
      .join("");
    if (focused) ul.querySelector<HTMLElement>(`li[data-id="${CSS.escape(focused)}"] .music-grip`)?.focus();
  }

  function draw() {
    rows();
    const s = music.state();
    shuffle.checked = music.shuffle();
    el.querySelector(".music-shuffle-says")!.textContent = music.shuffle() ? "A fresh order each time the game opens" : "Plays in the order below";
    el.querySelector<HTMLElement>(".music-none")!.hidden = !music.allExcluded();
    for (const li of ul.querySelectorAll<HTMLElement>("li")) {
      const id = li.dataset.id!;
      li.classList.toggle("playing", s.song?.id === id);
      li.classList.toggle("out", music.excluded(id));
      li.querySelector<HTMLInputElement>("input")!.checked = !music.excluded(id);
      heartButton(li.querySelector<HTMLButtonElement>(".music-heart")!, music.hearted(id));
      li.querySelector<HTMLElement>(".music-new")!.hidden = !music.fresh(id);
    }
  }

  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const id = t.closest<HTMLElement>("li")?.dataset.id;
    if (id && t.closest(".music-heart")) music.setHearted(id, !music.hearted(id), where);
  });
  el.addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (box === shuffle) return music.setShuffle(box.checked, where);
    const id = box.closest<HTMLElement>("li")?.dataset.id;
    if (id) music.setExcluded(id, !box.checked, where);
  });
  // the handle by keyboard: up and down move the song a place
  ul.addEventListener("keydown", (e) => {
    const id = (e.target as HTMLElement).closest(".music-grip") && (e.target as HTMLElement).closest<HTMLElement>("li")?.dataset.id;
    if (!id || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const at = music.playlist().findIndex((s) => s.id === id);
    music.move(id, at + (e.key === "ArrowUp" ? -1 : 1), where);
  });
  drag(ul, (id, to) => music.move(id, to, where));

  draw();
  return { el, dispose: music.subscribe(draw) };
}

/** Drag a row by its handle: it follows the finger, the others make room,
 * and on letting go it's moved there. Near the top or bottom of a list that
 * scrolls, the list scrolls with it. */
function drag(ul: HTMLElement, moved: (id: string, to: number) => void) {
  ul.addEventListener("pointerdown", (e) => {
    const grip = (e.target as HTMLElement).closest<HTMLElement>(".music-grip");
    const li = grip?.closest<HTMLElement>("li");
    if (!grip || !li) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const items = [...ul.children] as HTMLElement[];
    const from = items.indexOf(li);
    const tops = items.map((x) => x.offsetTop);
    const h = li.offsetHeight;
    const scroller = scrollParent(ul);
    const scroll0 = scroller?.scrollTop ?? 0;
    const y0 = e.clientY;
    let y = e.clientY;
    let to = from;
    let tick = 0;
    li.classList.add("dragging");

    const place = () => {
      const dy = y - y0 + ((scroller?.scrollTop ?? 0) - scroll0);
      const min = tops[0] - tops[from];
      const max = tops[items.length - 1] - tops[from];
      const d = Math.max(min, Math.min(max, dy));
      li.style.transform = `translateY(${d}px)`;
      to = Math.max(0, Math.min(items.length - 1, from + Math.round(d / h)));
      items.forEach((x, i) => {
        if (x === li) return;
        const shift = from < i && i <= to ? -h : to <= i && i < from ? h : 0;
        x.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    };
    // the list scrolls while the finger rests near its edge
    const edge = () => {
      tick = 0;
      if (!scroller) return;
      const r = scroller.getBoundingClientRect();
      const speed = y < r.top + 40 ? -8 : y > r.bottom - 40 ? 8 : 0;
      if (!speed) return;
      scroller.scrollTop += speed;
      place();
      tick = requestAnimationFrame(edge);
    };
    const move = (ev: PointerEvent) => {
      y = ev.clientY;
      place();
      if (!tick) tick = requestAnimationFrame(edge);
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      cancelAnimationFrame(tick);
      li.classList.remove("dragging");
      items.forEach((x) => (x.style.transform = ""));
      if (to !== from) moved(li.dataset.id!, to);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  });
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}
