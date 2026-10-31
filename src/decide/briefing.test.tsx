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
    const names = [...render().matchAll(/<span class="[^"]*name[^"]*">([^<]+)<\/span>/g)].map((m) => m[1]);
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
    const strips = [...html.matchAll(/<div class="[^"]*facts[^"]*">([\s\S]*?)<\/div>/g)].map((m) => text(m[1]!));
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

  it("opens the Administrator's bubble first, and shows the others' teasers", () => {
    const html = render();
    expect([...html.matchAll(/aria-expanded="(true|false)"/g)].map((m) => m[1])).toEqual(["true", "false", "false", "false", "false"]);
    // Each bubble is a button controlling its panel; the closed ones' panels are laid out but hidden.
    expect(html.match(/<button type="button"[^>]*aria-expanded="[^"]*" aria-controls="[^"]+"/g)).toHaveLength(5);
    const panels = [...html.matchAll(/<div id="[^"]+" class="[^"]*panel[^"]*"( data-open="true")?( aria-hidden="true")?/g)].map((m) => (m[1] ? "open" : m[2] ? "hidden" : "?"));
    expect(panels).toEqual(["open", "hidden", "hidden", "hidden", "hidden"]);
    const open = /<div id="[^"]+" class="[^"]*panel[^"]*" data-open="true"[^>]*>([\s\S]*?)<div id=/.exec(html)?.[1] ?? "";
    expect(open).toContain("WE CALL THIS TEAMWORK. MR. ZOOLANDER WOULD CALL IT ONE LOOK.");
    expect(open).not.toContain("THREE SEEMED LENIENT");
    for (const teaser of ["ATTENTION, SHOPKEEPER. A NEW QUARTER.", "WE WILL GRADE YOU ON FOUR MEASURES.", "AUTHORS MAY BE INVITED.", "THE PREVIOUS MANAGER LEFT A SCHEDULE.", "SELECT UP TO TWO MOVES."]) {
      expect(html).toContain(`>${teaser}</span>`);
    }
    expect(html).toContain("Select a boss to hear more.");
  });

  it("keeps the rules the choice turns on beside the moves", () => {
    const html = render();
    expect(html).toMatch(/<legend[^>]*>Your moves \(choose up to two\)<\/legend><p id="moves-rule"[^>]*>Your score is your <strong>lowest measure<\/strong>: Profit, Readers served, Happiness or Culture\.<\/p>/);
    expect(html).toContain('aria-describedby="moves-rule moves-status"');
    expect(html).toContain("instead of the scheduled picks (The Mallemaroking, Rystwyth and Portmeirion).");
  });

  it("drops the old brief", () => {
    const html = render();
    expect(html).not.toContain("What you need to know");
    expect(html).not.toContain("Already scheduled by the previous manager");
  });
});
