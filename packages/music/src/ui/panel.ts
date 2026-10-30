// The player in Settings: the music volume (down to Mute: the game's own
// music setting), the song playing with its controls, and a Playlist row
// that opens the playlist in its place (David, 29 Oct 2026: "a submenu with
// the songs listed and the ability to toggle and favorite them. And drag to
// reorder"), with a back button to return.
//
// The game puts `el` in its settings page and calls `dispose` when the page
// goes, and styles it through the --music-* variables (music.css).

import type { Music } from "../player/player.ts";
import { icons } from "./icons.ts";
import { nowPlaying, playlist, volume } from "./parts.ts";

export function createMusicPanel(music: Music, doc: Document = document) {
  const el = doc.createElement("section");
  el.className = "music-panel";
  let parts: { el: HTMLElement; dispose: () => void }[] = [];
  let unsubscribe = () => {};

  const clear = () => {
    parts.forEach((p) => p.dispose());
    unsubscribe();
    parts = [];
    el.replaceChildren();
  };

  function top() {
    clear();
    parts = [volume(music, "settings", doc), nowPlaying(music, "settings", doc)];
    el.append(...parts.map((p) => p.el));
    const open = doc.createElement("button");
    open.type = "button";
    open.className = "music-row music-open-playlist";
    open.innerHTML = `<span class="music-song-title">Playlist<small class="music-count"></small></span>${icons.chevron}`;
    const count = () => {
      const on = music.songs.filter((s) => !music.excluded(s.id)).length;
      open.querySelector(".music-count")!.textContent = `${on} of ${music.songs.length} songs on${music.shuffle() ? ", shuffled" : ""}`;
    };
    count();
    unsubscribe = music.subscribe(count);
    open.addEventListener("click", () => {
      list();
      el.querySelector<HTMLElement>(".music-back")?.focus();
    });
    el.append(open);
  }

  function list() {
    clear();
    const head = doc.createElement("div");
    head.className = "music-sub-head";
    head.innerHTML = `<button type="button" class="music-back" aria-label="Back to Music">${icons.backArrow}</button><b>Playlist</b>`;
    head.querySelector("button")!.addEventListener("click", () => {
      top();
      el.querySelector<HTMLElement>(".music-open-playlist")?.focus();
    });
    parts = [playlist(music, "settings", doc)];
    el.append(head, parts[0].el);
    music.opened("settings");
  }

  top();
  return { el, dispose: clear };
}
