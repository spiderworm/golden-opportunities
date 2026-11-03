// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { storageKey } from "~/assistant/ui/conversation";
import { clearGameStorage, gameStorageKeys, resetGame } from "./reset";

// What a reset forgets in this browser: the old game's, and nothing of the person's.

function memoryStorage(entries: Record<string, string>) {
  const items = new Map(Object.entries(entries));
  return { items, storage: { removeItem: (key: string) => void items.delete(key) } };
}
const kept = {
  "orbital-books:pins:v1": "[]",
  [storageKey("inst-1")]: "[]",
  "orbital-books.station.view": "outside",
  // The person's, not the game's: another copy's conversation, and the kit's keys (music, sharing, held text).
  [storageKey("inst-2")]: "[]",
  "orbital-books.music.volume": "0.4",
  "orbital-books.sharingUnconfirmed": "1",
};

describe("a reset in this browser", () => {
  it("forgets the pins, this copy's conversation with Dewey and the station's view, and nothing else", () => {
    const { items, storage } = memoryStorage(kept);
    clearGameStorage(() => storage, "inst-1");
    expect([...items.keys()]).toEqual([
      storageKey("inst-2"),
      "orbital-books.music.volume",
      "orbital-books.sharingUnconfirmed",
    ]);
    expect(gameStorageKeys("inst-1")).toHaveLength(3);
  });

  it("does nothing where storage is missing or blocked", () => {
    expect(() => clearGameStorage(() => undefined, "inst-1")).not.toThrow();
    expect(() =>
      clearGameStorage(
        () => ({
          removeItem: () => {
            throw new Error("blocked");
          },
        }),
        "inst-1",
      ),
    ).not.toThrow();
  });

  it("asks the server for a new game, and forgets the old one only once it has one", async () => {
    const { items, storage } = memoryStorage(kept);
    const post = vi.fn(
      async (_url: string, _init: RequestInit) =>
        ({ type: "opaqueredirect", status: 0 }) as Response,
    );
    expect(await resetGame("inst-1", () => storage, post as typeof fetch)).toBe(true);
    const [url, init] = post.mock.calls[0]!;
    expect(url).toBe("/game/new?reset=1");
    expect(init).toEqual({ method: "POST", redirect: "manual" });
    expect(items.has("orbital-books:pins:v1")).toBe(false);

    for (const answer of [
      async () => new Response("Game state changed.", { status: 409 }),
      async () => {
        throw new TypeError("offline");
      },
    ]) {
      const fresh = memoryStorage(kept);
      expect(await resetGame("inst-1", () => fresh.storage, answer as typeof fetch)).toBe(false);
      expect(fresh.items.size).toBe(Object.keys(kept).length);
    }
  });
});
