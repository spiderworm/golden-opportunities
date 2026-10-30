import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { Shell } from "./Shell";
import { noopTrack } from "./track";

function renderAt(path: string) {
  const notifications = [
    { id: "q4-revenue-down", title: "Q4 revenue is down 41% on Q3", detail: "Look into it.", unread: true, to: "/investigate" },
  ];
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <Shell stationDate="2194-01-04" notifications={notifications} track={noopTrack}>
          <p>page</p>
        </Shell>
      ),
      children: [{ path: "investigate", handle: { title: "Investigate" }, Component: () => null }],
    },
  ]);
  return renderToString(<Stub initialEntries={[path]} />);
}

describe("Shell", () => {
  it("titles the header from the deepest route handle", () => {
    expect(renderAt("/investigate")).toMatch(/<h1[^>]*>Investigate<\/h1>/);
    expect(renderAt("/")).toMatch(/<h1[^>]*>Orbital Books<\/h1>/);
  });

  it("shows the station date and the unread count", () => {
    const html = renderAt("/");
    expect(html).toContain("4 Jan 2194");
    expect(html).toContain('aria-label="Notifications, 1 unread"');
  });

  it("marks features still to come instead of linking them", () => {
    const html = renderAt("/");
    expect(html).toContain('href="/investigate"');
    expect(html).not.toContain('href="/decisions"');
    expect(html).toContain('href="/settings"');
    expect(html.match(/Soon/g)).toHaveLength(2);
  });
});
