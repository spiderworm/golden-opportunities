import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/game/game.server", () => ({ getPlan: vi.fn(), submitPlan: vi.fn() }));
vi.mock("~/platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));

import Decide from "./route";

function render() {
  const Stub = createRoutesStub([{ path: "/decide", Component: () => <Decide /> }]);
  return renderToString(<Stub initialEntries={["/decide"]} />);
}

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("the bosses' brief (m1-copy section 3)", () => {
  it("has five bubbles, one per boss, in Plot's order", () => {
    const names = [...render().matchAll(/<figcaption[^>]*>([^<]+)<\/figcaption>/g)].map((m) => m[1]);
    expect(names).toEqual([
      "The Station Administrator",
      "The Commerce Office",
      "The Ministry of Culture",
      "The Readers&#x27; Guild survey drone",
      "The Throughput Subcommittee",
    ]);
  });

  it("carries every fact in the strips, as real text with the figures in bold", () => {
    const html = render();
    const strips = [...html.matchAll(/<div class="[^"]*facts[^"]*">([\s\S]*?)<\/div><\/div><\/figure>/g)].map((m) => text(m[1]!));
    expect(strips).toHaveLength(5);
    const all = strips.join(" ");
    for (const fact of [
      "January 1 to March 31, 2194",
      "Profit, Readers served, Happiness and Culture",
      "last year's first quarter plus 5%",
      "lowest measure",
      "60% of their list price",
      "$200",
      "15% off",
      "January The Mallemaroking (mass market paperback)",
      "February Rystwyth (hardcover)",
      "March Portmeirion (mass market paperback)",
      "up to two",
    ]) expect(all).toContain(fact);
    expect(html).toContain("<strong>60% of their list price</strong>");
  });

  it("drops the old brief", () => {
    const html = render();
    expect(html).not.toContain("What you need to know");
    expect(html).not.toContain("Already scheduled by the previous manager");
  });
});
