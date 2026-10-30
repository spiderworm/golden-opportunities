import { describe, expect, it } from "vitest";

import { summarizeFrames } from "./frame-stats";

describe("summarizeFrames", () => {
  it("reports a steady 60fps", () => {
    const s = summarizeFrames(Array(120).fill(1000 / 60));
    expect(s).toEqual({ frames: 120, fps: 60, medianMs: 16.7, p95Ms: 16.7 });
  });

  it("lets a few slow frames show in the 95th percentile but not the median", () => {
    const frames = [...Array(90).fill(16), ...Array(10).fill(50)];
    const s = summarizeFrames(frames);
    expect(s.medianMs).toBe(16);
    expect(s.p95Ms).toBe(50);
    expect(s.fps).toBe(51.5); // 100 frames in 1,940 ms
  });

  it("handles an empty window", () => {
    expect(summarizeFrames([])).toEqual({ frames: 0, fps: 0, medianMs: 0, p95Ms: 0 });
  });
});
