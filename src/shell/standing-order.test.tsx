import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { Shell, type ShellHandle } from "./Shell";

/** Just the strip's markup (the transmission has its own "Open the ledgers"). */
function strip(html: string) {
  const start = html.indexOf('aria-label="Standing order"');
  return start < 0 ? "" : html.slice(start, html.indexOf("</aside>", start));
}

function renderAt(path: string, standingOrder = { seen: false, submitted: false }) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <Shell stationDate="2194-01-01" notifications={[]} standingOrder={standingOrder} track={() => {}}>
          <p>page</p>
        </Shell>
      ),
      children: [
        { path: "investigate", Component: () => null },
        { path: "decide", handle: { standingOrder: false } satisfies ShellHandle, Component: () => null },
      ],
    },
  ]);
  return renderToString(<Stub initialEntries={[path]} />);
}

describe("the standing order", () => {
  it("keeps the order under the header, with the figure in bold and a short form for phones", () => {
    const html = renderAt("/");
    expect(html).toContain('aria-label="Standing order"');
    expect(html).toContain("Standing order from the Commerce Office: Q4 revenue is down <strong>41%</strong> on Q3. Submit a plan for Q1 2194.");
    expect(html).toContain("Standing order: Q4 revenue down <strong>41%</strong>. Plan due for Q1 2194.");
    expect(html).toContain(">Read the memo</button>");
    expect(html).toContain('href="/investigate"');
    expect(html.indexOf("</header>")).toBeLessThan(html.indexOf("Standing order"));
  });

  it("leaves out the ledgers link on the ledgers", () => {
    expect(strip(renderAt("/"))).toMatch(/<a[^>]*>Open the ledgers<\/a>/);
    expect(strip(renderAt("/investigate"))).not.toContain("Open the ledgers");
    expect(strip(renderAt("/investigate"))).toContain(">Read the memo</button>");
  });

  it("stays off the plan's own screens, and goes once the plan is in", () => {
    expect(renderAt("/decide")).not.toContain('aria-label="Standing order"');
    expect(renderAt("/", { seen: true, submitted: true })).not.toContain('aria-label="Standing order"');
    expect(renderAt("/", { seen: true, submitted: false })).toContain('aria-label="Standing order"');
  });

  it("holds the transmission ready, closed until the client opens it: the memo in plain words under the boss's line", () => {
    const html = renderAt("/");
    expect(html).toMatch(/<dialog[^>]*aria-label="Transmission from the Commerce Office"/);
    expect(html).not.toMatch(/<dialog[^>]* open/);
    expect(html).toContain("INCOMING TRANSMISSION");
    expect(html).toContain("THE NUMBERS HAVE GONE DOWN.");
    expect(html).toContain("<span>LARKSPUR STATION / COMMERCE OFFICE</span>");
    expect(html).toContain("Third quarter: $274,036. <strong>Down 41%.</strong>");
    expect(html).toContain("Your ledgers are on the console, and Dewey can help you read them there.");
    expect(html).toMatch(/<a[^>]*href="\/investigate"[^>]*>Open the ledgers<\/a><button type="button"[^>]*>Later<\/button>/);
    // The joke stays in the boss's line; the memo's facts are plain.
    const memo = html.slice(html.indexOf("LARKSPUR"));
    expect(memo).not.toContain("ZOOLANDER");
  });
});
