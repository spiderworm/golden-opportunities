// The player's buttons, drawn small and plain (no emoji: David, 28 Oct 2026).
const svg = (d: string) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;

export const icons = {
  notes: svg("M9 3v10.6A3.5 3.5 0 1 0 11 17V8h8v5.6A3.5 3.5 0 1 0 21 17V3z"),
  back: svg("M6 5h2v14H6zm3.5 7L19 5v14z"),
  skip: svg("M16 5h2v14h-2zM5 5l9.5 7L5 19z"),
  play: svg("M7 4.5v15L19.5 12z"),
  pause: svg("M6 4.5h4v15H6zm8 0h4v15h-4z"),
  heart: svg("M12 20.5l-1.4-1.3C5.4 14.5 2 11.4 2 7.6 2 4.5 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.5 22 7.6c0 3.8-3.4 6.9-8.6 11.6z"),
  heartOutline: svg("M16.5 2c-1.7 0-3.4.8-4.5 2.1C10.9 2.8 9.2 2 7.5 2 4.4 2 2 4.5 2 7.6c0 3.8 3.4 6.9 8.6 11.6l1.4 1.3 1.4-1.3C18.6 14.5 22 11.4 22 7.6 22 4.5 19.6 2 16.5 2zm-4.4 15.7l-.1.1-.1-.1C7.1 13.4 4 10.6 4 7.6 4 5.6 5.5 4 7.5 4c1.5 0 3 1 3.6 2.4h1.9C13.5 5 15 4 16.5 4c2 0 3.5 1.6 3.5 3.6 0 3-3.1 5.8-7.9 10.1z"),
  // a circle struck through: don't play this song
  exclude: svg("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A8 8 0 0 1 4 12zm8 8a8 8 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20z"),
  // a handle to drag a song by
  grip: svg("M4 7h16v2H4zm0 4h16v2H4zm0 4h16v2H4z"),
  chevron: svg("M9.3 5.3L7.9 6.7 13.2 12l-5.3 5.3 1.4 1.4L16 12z"),
  backArrow: svg("M14.7 5.3L8 12l6.7 6.7 1.4-1.4L10.8 12l5.3-5.3z"),
  close: svg("M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"),
};
