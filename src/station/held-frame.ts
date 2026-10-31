// The station's last drawn frame, kept as a picture when the player leaves
// the Station screen. Coming back mounts a new WebGL canvas, which stays
// empty for a few hundred milliseconds before it draws; the Station screen
// shows this picture over it until then, so the station never blinks out.
// It lives only as long as the page.

let held: string | undefined;
/** Counts holds, so an encode that finishes after a newer hold began is dropped. */
let holds = 0;
const listeners = new Set<() => void>();

const changed = () => listeners.forEach((listener) => listener());

/** The last frame the station drew before the player left, once it's ready. */
export function heldFrame(): string | undefined {
  return held;
}

/** Calls `listener` whenever the held frame changes; returns the unsubscribe. */
export function watchHeldFrame(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Keeps what the canvas shows now. Call it straight after drawing, in the
 * same task: WebGL clears its drawing buffer once the frame is shown, but
 * toBlob copies the pixels when it's called and only encodes them later.
 * Until the encode finishes there's no held frame, rather than the one
 * before it: a player who comes straight back could have changed view since.
 */
export function holdFrame(canvas: HTMLCanvasElement) {
  const hold = ++holds;
  if (held) {
    URL.revokeObjectURL(held);
    held = undefined;
    changed();
  }
  canvas.toBlob(
    (blob) => {
      if (!blob || hold !== holds) return;
      held = URL.createObjectURL(blob);
      changed();
    },
    "image/webp",
    0.85,
  );
}
