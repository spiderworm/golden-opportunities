import { describe, expect, it, vi } from "vitest";

import { QueryError } from "~/query/errors";

const record = vi.hoisted(() => ({ busy: false }));
vi.mock("~/game/session.server", async () => {
  const { BASELINE_VIEW } = await import("~/query/view.server");
  return { getGameSession: () => ({ save: { id: "a".repeat(43), played: [], discoveries: [] }, queryView: BASELINE_VIEW }) };
});
vi.mock("~/game/progress", () => ({ currentQuarter: () => "2194-Q1" }));
vi.mock("~/game/discoveries.server", () => ({
  recordDiscoveries: () => {
    if (record.busy) throw new QueryError("RATE_LIMITED", "The save is busy.");
  },
}));
vi.mock("~/platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));

const { loader, shouldRevalidate } = await import("./route");
const load = (search = "") => loader({ request: new Request(`http://localhost/investigate${search}`) } as never);

describe("Investigate's loader, for the browser's cache", () => {
  it("names the data version it computed the view under, and whether it recorded the view's evidence", () => {
    record.busy = false;
    const view = load("?by=genre");
    expect(view.dataVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(view.evidence).toBe("recorded");
  });

  it("says when the recording was deferred, so the browser never keeps that view", () => {
    record.busy = true;
    expect(load("?by=genre").evidence).toBe("deferred");
    record.busy = false;
  });
});

describe("when Investigate looks again", () => {
  const args = (formAction?: string) => ({ formAction, defaultShouldRevalidate: true }) as never;

  it("doesn't, for the memo's seen mark, which changes no data", () => {
    expect(shouldRevalidate(args("/alert/seen"))).toBe(false);
  });

  it("does, as usual, for anything else", () => {
    expect(shouldRevalidate(args())).toBe(true);
    expect(shouldRevalidate(args("/decide"))).toBe(true);
    expect(shouldRevalidate(args("/game/new"))).toBe(true);
  });
});
