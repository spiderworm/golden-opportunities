// Summarizes a window of frame times for the station_frame_sample event.

export interface FrameSummary {
  frames: number;
  /** Frames per second over the window. */
  fps: number;
  /** Median and 95th-percentile frame time, in milliseconds. */
  medianMs: number;
  p95Ms: number;
}

export function summarizeFrames(frameMs: readonly number[]): FrameSummary {
  if (frameMs.length === 0) return { frames: 0, fps: 0, medianMs: 0, p95Ms: 0 };
  const sorted = [...frameMs].sort((a, b) => a - b);
  const total = sorted.reduce((sum, ms) => sum + ms, 0);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return {
    frames: sorted.length,
    fps: round1(total > 0 ? (1000 * sorted.length) / total : 0),
    medianMs: round1(at(0.5)),
    p95Ms: round1(at(0.95)),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
