// The station's last drawn frame, kept as a picture when the player leaves
// the Station screen. Coming back mounts a new WebGL canvas, which stays
// empty for a few hundred milliseconds before it draws; the Station screen
// shows this picture over it until then, so the station never blinks out.
// It lives only as long as the page.

let held: string | undefined;

/** The last frame the station drew before the player left, if any. */
export function heldFrame(): string | undefined {
  return held;
}

/**
 * Keeps what the canvas shows now. Call it straight after drawing, in the
 * same task: WebGL clears its drawing buffer once the frame is shown, but
 * toBlob copies the pixels when it's called and only encodes them later.
 */
export function holdFrame(canvas: HTMLCanvasElement) {
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      if (held) URL.revokeObjectURL(held);
      held = URL.createObjectURL(blob);
    },
    "image/webp",
    0.85,
  );
}
