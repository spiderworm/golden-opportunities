import { renderToString } from "react-dom/server";
import { createRoutesStub, Outlet } from "react-router";
import { describe, expect, it } from "vitest";

import ShellLayout, { ErrorBoundary } from "./layout";
import { REPLAY_MISMATCH_COPY, replayMismatchOf } from "./replay-mismatch";
import type { StationState } from "./station-state";

const station: StationState = {
  date: "2194-07-01",
  dataVersion: "0123456789abcdef",
  alerts: [],
  standingOrder: { quarter: null, seen: true, submitted: true },
  q1: null,
};
/** A route error as React Router hands it to a boundary, for a thrown `data(...)`. Seeded data keys errors by
 * the route whose boundary shows them: the shell's, which catches its pages' errors. */
const routeError = (status: number, data: unknown) => ({ status, statusText: "", internal: false, data });

function renderWith(pageError: unknown, shellData: StationState | undefined = station) {
  const Stub = createRoutesStub([
    {
      id: "root",
      path: "/",
      Component: Outlet,
      children: [{ id: "shell/layout", Component: ShellLayout as never, ErrorBoundary: ErrorBoundary as never, children: [{ id: "page", path: "investigate", Component: () => <p>page</p> }] }],
    },
  ]);
  return renderToString(
    <Stub
      initialEntries={["/investigate"]}
      hydrationData={{ loaderData: { root: { instance: "instance-1" }, ...(shellData ? { "shell/layout": shellData } : {}) }, errors: { "shell/layout": pageError } }}
    />,
  );
}

describe("a save that can't be replayed (Plot, #198)", () => {
  it("is read from the loader's 409, and only from it", () => {
    expect(replayMismatchOf(routeError(409, { replayMismatch: "2194-Q2" }))).toBe("2194-Q2");
    expect(replayMismatchOf(routeError(409, { replayMismatch: "<b>" }))).toBeNull();
    expect(replayMismatchOf(routeError(500, { replayMismatch: "2194-Q2" }))).toBeNull();
    expect(replayMismatchOf(new Error("boom"))).toBeNull();
  });

  it("shows Plot's screen inside the shell, naming the quarter, with Start over", () => {
    const html = renderWith(routeError(409, { replayMismatch: "2194-Q2" }));
    expect(html).toContain(REPLAY_MISMATCH_COPY.heading.replace("'", "&#x27;"));
    expect(html).toContain("since you played Q2 2194");
    expect(html).toContain(REPLAY_MISMATCH_COPY.start);
    // The shell stays: its navigation is still there, Settings included.
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain("<p>page</p>");
  });

  it("shows any other page error inside the shell too, as the root would", () => {
    const html = renderWith(new Error("boom"));
    expect(html).toContain("Something went wrong");
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain("boom");
  });
});
