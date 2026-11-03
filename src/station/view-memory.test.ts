import { describe, expect, it } from "vitest";

import { FIRST_VIEW, rememberedView, rememberView } from "./view-memory";

const memoryStorage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  };
};

describe("station view memory", () => {
  it("opens inside the shop on a first visit", () => {
    expect(FIRST_VIEW).toBe("inside");
    expect(rememberedView(() => memoryStorage())).toBe("inside");
  });

  it("opens where the player last moved the camera", () => {
    const storage = memoryStorage();
    rememberView(() => storage, "outside");
    expect(rememberedView(() => storage)).toBe("outside");
    rememberView(() => storage, "inside");
    expect(rememberedView(() => storage)).toBe("inside");
  });

  it("treats missing, blocked or stale storage as a first visit", () => {
    expect(rememberedView(() => undefined)).toBe("inside");
    expect(rememberedView(() => ({ getItem: () => "upstairs" }))).toBe("inside");
    expect(
      rememberedView(() => ({
        getItem: () => {
          throw new Error("blocked");
        },
      })),
    ).toBe("inside");
    expect(() =>
      rememberView(
        () => ({
          setItem: () => {
            throw new Error("full");
          },
        }),
        "outside",
      ),
    ).not.toThrow();
  });

  it("falls back when merely reaching for storage throws", () => {
    const blocked = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    expect(rememberedView(blocked)).toBe("inside");
    expect(() => rememberView(blocked, "outside")).not.toThrow();
  });
});
