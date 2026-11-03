import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { Shell } from "./Shell";

function renderAt(path: string, counts?: { reports?: number }) {
  const notifications = [
    {
      id: "q4-revenue-down",
      title: "Q4 revenue is down 41% on Q3",
      detail: "Look into it.",
      unread: true,
      to: "/investigate",
    },
  ];
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <Shell
          stationDate="2194-01-04"
          notifications={notifications}
          track={() => {}}
          counts={counts}
        >
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

  it("links every feature, Reports with its count of new reports, gone at zero", () => {
    const html = renderAt("/");
    for (const to of ["/investigate", "/decide", "/reports", "/settings"])
      expect(html).toContain(`href="${to}"`);
    expect(html).not.toContain("Soon");
    expect(html).not.toContain("Reports, ");
    const counted = renderAt("/", { reports: 2 });
    expect(counted).toContain('aria-label="Reports, 2 new"');
    expect(counted).toMatch(/>2<\/span><\/a>/);
  });
});
