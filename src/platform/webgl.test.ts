import { describe, expect, it } from "vitest";

import { canRenderWebGL2 } from "./webgl";

const docWith = (getContext: () => unknown) =>
  ({ createElement: () => ({ getContext }) }) as unknown as Pick<Document, "createElement">;

describe("canRenderWebGL2", () => {
  it("is true when a WebGL 2 context can be made, and releases it", () => {
    let lost = false;
    const gl = { getExtension: () => ({ loseContext: () => (lost = true) }) };
    expect(canRenderWebGL2(docWith(() => gl))).toBe(true);
    expect(lost).toBe(true);
  });

  it("is false without WebGL 2", () => {
    expect(canRenderWebGL2(docWith(() => null))).toBe(false);
  });

  it("is false when asking throws", () => {
    expect(
      canRenderWebGL2(
        docWith(() => {
          throw new Error("blocked");
        }),
      ),
    ).toBe(false);
  });
});
