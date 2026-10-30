import { describe, expect, it } from "vitest";
import { clearConversation, historyFor, INTERRUPTED, loadConversation, MAX_TURNS, saveConversation, storageKey, type StoredReply } from "./conversation.ts";

/** A Storage in memory, optionally full past `quota` characters, or broken outright. */
class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  private quota: number;
  private broken: boolean;
  constructor(quota = Infinity, broken = false) {
    this.quota = quota;
    this.broken = broken;
  }
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    if (this.broken) throw new Error("SecurityError");
    return this.items.get(key) ?? null;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  removeItem(key: string) {
    if (this.broken) throw new Error("SecurityError");
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.broken || value.length > this.quota) throw new Error("QuotaExceededError");
    this.items.set(key, value);
  }
}

const reply = (n: number, extra: Partial<StoredReply> = {}): StoredReply => ({
  question: `Question ${n}`,
  text: `Revenue in 2193-Q${(n % 4) + 1} was $161,524.69. I'd rather not give a number I didn't look up.`,
  lookups: [
    { type: "data", columns: [{ key: "revenue", label: "Revenue", type: "number", nullable: false }], rows: [{ revenue: 161524.69 }], total: 161524.69, source: "Revenue from sale lines" },
    { type: "pin", chart: { title: "Revenue by quarter", kind: "bar", query: { measure: "revenue", by: ["quarter"] } }, source: "S", placed: true },
  ],
  state: "done",
  ...extra,
});

describe("keeping the conversation in the browser", () => {
  it("restores it exactly as it was shown: replies, tables with sources, pins and withheld notes", () => {
    const storage = new MemoryStorage();
    const replies = [reply(1), reply(2, { state: "stopped" }), reply(3, { state: "failed", error: "The assistant is unavailable right now. Try again in a moment." })];
    expect(saveConversation(storage, "inst", replies)).toBe(3);
    expect(loadConversation(storage, "inst")).toEqual(replies);
    // Each copy's own, by instance ID.
    expect(loadConversation(storage, "other")).toEqual([]);
  });

  it("keeps only the last fifty turns", () => {
    const storage = new MemoryStorage();
    const replies = Array.from({ length: MAX_TURNS + 7 }, (_, i) => reply(i));
    expect(saveConversation(storage, "inst", replies)).toBe(MAX_TURNS);
    const restored = loadConversation(storage, "inst");
    expect(restored).toHaveLength(MAX_TURNS);
    expect(restored[0].question).toBe("Question 7");
    expect(restored.at(-1)!.question).toBe(`Question ${MAX_TURNS + 6}`);
  });

  it("shows an answer the reload cut off as interrupted, never as complete, and tells the model so", () => {
    const storage = new MemoryStorage();
    saveConversation(storage, "inst", [reply(1), reply(2, { text: "Revenue in 2193-Q4 was", state: "streaming" })]);
    const restored = loadConversation(storage, "inst");
    expect(restored.map((r) => r.state)).toEqual(["done", INTERRUPTED]);
    expect(restored[1].text).toBe("Revenue in 2193-Q4 was");
    expect(historyFor(restored)).toEqual([
      { role: "player", text: "Question 1" },
      { role: "assistant", text: reply(1).text },
      { role: "player", text: "Question 2" },
      { role: "assistant", text: "(This answer was interrupted before it finished.)" },
    ]);
  });

  it("sends the model the rendered replies only: never lookups", () => {
    const history = historyFor([reply(1)]);
    expect(JSON.stringify(history)).not.toMatch(/source|rows|pin/);
  });

  it("keeps as many of the latest turns as fit when storage is full", () => {
    const one = JSON.stringify([reply(1)]).length;
    const storage = new MemoryStorage(one * 3);
    expect(saveConversation(storage, "inst", Array.from({ length: 8 }, (_, i) => reply(i)))).toBe(2);
    expect(loadConversation(storage, "inst").map((r) => r.question)).toEqual(["Question 6", "Question 7"]);
    // Nothing fits: nothing kept, and nothing stale left behind.
    const tiny = new MemoryStorage(10);
    tiny.setItem(storageKey("inst"), "[]");
    expect(saveConversation(tiny, "inst", [reply(1)])).toBe(0);
    expect(tiny.getItem(storageKey("inst"))).toBeNull();
  });

  it("works without storage, with storage that throws, and with anything unreadable", () => {
    expect(saveConversation(undefined, "inst", [reply(1)])).toBe(0);
    expect(loadConversation(undefined, "inst")).toEqual([]);
    const broken = new MemoryStorage(Infinity, true);
    expect(saveConversation(broken, "inst", [reply(1)])).toBe(0);
    expect(loadConversation(broken, "inst")).toEqual([]);
    expect(() => clearConversation(broken, "inst")).not.toThrow();
    const storage = new MemoryStorage();
    for (const junk of ["{", '{"a":1}', '[{"question":1}]', "null"]) {
      storage.setItem(storageKey("inst"), junk);
      expect(loadConversation(storage, "inst"), junk).toEqual([]);
    }
  });

  it("a new conversation clears it", () => {
    const storage = new MemoryStorage();
    saveConversation(storage, "inst", [reply(1)]);
    clearConversation(storage, "inst");
    expect(loadConversation(storage, "inst")).toEqual([]);
  });
});
