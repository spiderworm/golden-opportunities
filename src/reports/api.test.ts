import { describe, expect, it, vi } from "vitest";

// One save's worth of Reports' data, from a stubbed session: what matters here is that /api/reports sends exactly
// what the page's loader does, and that it isn't cached.
const session = vi.hoisted(() => ({
  getGameSession: vi.fn(() => ({
    save: { reports: [{ id: "r1", title: "Mine", items: [] }] },
    queryView: { periods: ["2193-Q2", "2193-Q1"] },
  })),
}));
vi.mock("~/game/session.server", () => session);
vi.mock("~/game/progress", () => ({ removedQuarter: () => null }));
vi.mock("./shop.server", () => ({ shopReports: () => ({ reports: [], counts: { shop: 0 } }) }));

import { loader as api } from "./api";
import { reportsData } from "./data.server";
import type { Route } from "./+types/api";

describe("/api/reports (Frank, #352: a plain fetch, never a fetcher's route load)", () => {
  it("sends what Reports' page loader sends, uncached", async () => {
    const request = new Request("http://localhost/api/reports");
    const response = api({ request } as Route.LoaderArgs);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toMatch(/^application\/json/);
    const body = await response.json();
    expect(body).toEqual(JSON.parse(JSON.stringify(reportsData(request))));
    expect(body).toMatchObject({
      player: [{ id: "r1" }],
      editable: true,
      quarters: ["2193-Q1", "2193-Q2"],
    });
  });
});
