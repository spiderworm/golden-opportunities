import { beforeEach, describe, expect, it, vi } from "vitest";

// A canvas whose encodes finish when the test says so.
function canvas() {
  const encodes: ((blob: Blob | null) => void)[] = [];
  const element = { toBlob: (done: (blob: Blob | null) => void) => encodes.push(done) } as unknown as HTMLCanvasElement;
  return { element, finish: (i: number) => encodes[i]!(new Blob([String(i)], { type: "image/webp" })) };
}

// Each test gets a fresh page's worth of held frame.
let frames: typeof import("./held-frame");
beforeEach(async () => {
  vi.resetModules();
  frames = await import("./held-frame");
});

describe("held frame", () => {
  it("is ready once the encode finishes, and says so", () => {
    const seen = vi.fn();
    frames.watchHeldFrame(seen);
    const c = canvas();
    frames.holdFrame(c.element);
    expect(frames.heldFrame()).toBeUndefined();
    c.finish(0);
    expect(frames.heldFrame()).toMatch(/^blob:/);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("drops the previous visit's frame while the new one encodes", () => {
    const c = canvas();
    frames.holdFrame(c.element);
    c.finish(0);
    const first = frames.heldFrame();
    frames.holdFrame(c.element);
    expect(frames.heldFrame()).toBeUndefined();
    c.finish(1);
    expect(frames.heldFrame()).toMatch(/^blob:/);
    expect(frames.heldFrame()).not.toBe(first);
  });

  it("ignores an encode that finishes after a newer hold began", () => {
    const c = canvas();
    frames.holdFrame(c.element);
    frames.holdFrame(c.element);
    c.finish(1);
    const newest = frames.heldFrame();
    c.finish(0);
    expect(frames.heldFrame()).toBe(newest);
  });

  it("stops telling a listener once it unsubscribes", () => {
    const seen = vi.fn();
    const stop = frames.watchHeldFrame(seen);
    stop();
    const c = canvas();
    frames.holdFrame(c.element);
    c.finish(0);
    expect(seen).not.toHaveBeenCalled();
  });
});
