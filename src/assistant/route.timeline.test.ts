import { expect, it, vi } from "vitest";
import type { Route } from "./+types/route";

// The chat timeline's game key: GET /api/assistant gives a hash of the save, never the save's id, which is the
// cookie's value (Chart's note on #390).
const save = vi.hoisted(() => ({ current: "secret-save-id-one" }));
vi.mock("./server/availability.server.ts", () => ({
  assistantAvailability: async () => ({ state: "ready" }),
  OFFLINE: "offline",
  OFFLINE_HINT: "hint",
}));
vi.mock("~/platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
vi.mock("~/game/session.server", () => ({
  cookieSaveId: () => save.current,
  resolveSaveId: () => save.current,
  saves: { read: (id: string) => ({ id, played: [{}] }) },
}));
vi.mock("~/alma/backstory", () => ({ backstoryOf: () => null }));
vi.mock("~/alma/backstory.server", () => ({ catalogNames: () => [] }));
import { loader } from "./route";

const status = async () => {
  const res = await loader({
    request: new Request("http://localhost/api/assistant"),
  } as unknown as Route.LoaderArgs);
  return (await res.json()) as Record<string, unknown>;
};

it("gives the current quarter and a key for the game, never the save's id", async () => {
  const one = await status();
  expect(one).toMatchObject({ available: true, quarter: "2194-Q2" });
  expect(one.game).toMatch(/^[0-9a-f]{16}$/);
  expect(JSON.stringify(one)).not.toContain("secret-save-id");
  // The same game keeps its key; Play again's new save gets another.
  expect((await status()).game).toBe(one.game);
  save.current = "secret-save-id-two";
  expect((await status()).game).not.toBe(one.game);
});
