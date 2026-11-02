import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/platform/analytics/analytics.client", () => ({ track: vi.fn() }));

import { PlanQ2 } from "./PlanQ2";
import { editionLabel } from "./q2-copy";

// Two paperbacks of one title (as Heliotrope Pajamas has): the picker keys them by ISBN.
const CANDIDATES = [
  { isbn: "989-1", bookId: "b1", title: "Heliotrope Pajamas", format: "Paperback", listPrice: 12.5 },
  { isbn: "989-2", bookId: "b1", title: "Heliotrope Pajamas", format: "Paperback", listPrice: 14.99 },
  { isbn: "989-3", bookId: "b2", title: "Land Water Sky Space", format: "Hardcover", listPrice: 48 },
];

function render() {
  const Stub = createRoutesStub([{ path: "/decide", Component: () => <PlanQ2 quarter="2194-Q2" candidates={CANDIDATES} /> }]);
  return renderToString(<Stub initialEntries={["/decide"]} />);
}

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/<!-- -->/g, "");

describe("the Q2 plan (q2.md section 5)", () => {
  it("is headed for Q2, with the bosses' Q2 brief in Plot's order", () => {
    const html = render();
    expect(html).toContain(">PLAN FOR Q2 2194</h2>");
    const teasers = [...html.matchAll(/class="[^"]*teaserLine[^"]*">([^<]+)</g)].map((m) => m[1]);
    expect(teasers).toEqual(["QUARTER TWO.", "YOUR FIRST QUARTER IS IN THE LEDGER.", "AUTHORS REMAIN AVAILABLE.", "THE CALENDAR IS EMPTY.", "PICK THREE BOOKS."]);
    const all = text(html);
    for (const fact of ["April 1 to June 30, 2194", "last year's second quarter", "60% of their list price", "$200", "April, May and June", "15% off", "up to three", "up to one"]) {
      expect(all).toContain(fact);
    }
    // Q1's scheduled picks are gone: the calendar is empty.
    expect(all).not.toContain("The Mallemaroking");
  });

  it("sets out the calendar, a row per month starting at No pick, beside the one more move", () => {
    const html = render();
    const all = text(html);
    expect(all).toContain("BOOK OF THE MONTH");
    expect(all).toContain("ONE MORE MOVE (OPTIONAL)");
    const rows = [...html.matchAll(/<span id="[^"]+-month" class="[^"]*month[^"]*">(\w+)<\/span><button[^>]*aria-expanded="false"[^>]*>([^<]+)<\/button>/g)].map((m) => [m[1], m[2]]);
    expect(rows).toEqual([["April", "No pick"], ["May", "No pick"], ["June", "No pick"]]);
    // The other move: author nights or the sale, as checkboxes; Q1's re-pick isn't one.
    expect(html.match(/<input type="checkbox"[^>]*name="levers"/g)).toHaveLength(2);
    expect(html).toContain('value="events"');
    expect(html).toContain('value="sale"');
    expect(html).not.toContain('value="repick"');
  });

  it("files the form as Q2's, and says holding course is no picks and no other move", () => {
    const html = render();
    expect(html).toContain("LKS-2194-Q2-0003");
    expect(text(html)).toContain("Three picks and one move maximum. Filed requisitions are final.");
    expect(html).toMatch(/<p id="moves-status"[^>]*>Hold course: no picks and no other move\.<\/p>/);
  });

  it("names an edition by what's printed on it: title, format and price", () => {
    expect(editionLabel(CANDIDATES[0]!)).toBe("Heliotrope Pajamas (paperback), $12.50");
    expect(editionLabel(CANDIDATES[2]!)).toBe("Land Water Sky Space (hardcover), $48.00");
  });
});

describe("a later quarter's plan, on Q2's form (endless-copy.md section 3)", () => {
  it("is headed for its quarter, with its months, its brief and the event's fare on the move", () => {
    const brief = { strikes: 0, stretch: null, formatCost: null, authorFare: 300, lot: false };
    const Stub = createRoutesStub([{ path: "/decide", Component: () => <PlanQ2 quarter="2194-Q3" candidates={CANDIDATES} brief={brief} /> }]);
    const html = renderToString(<Stub initialEntries={["/decide"]} />);
    expect(html).toContain(">PLAN FOR Q3 2194</h2>");
    const all = text(html);
    for (const month of ["July", "August", "September"]) expect(all).toContain(month);
    expect(all).not.toContain("April");
    expect(all).toContain("LKS-2194-Q3-0004");
    expect(all).toContain("$300 a night");
    const teasers = [...html.matchAll(/class="[^"]*teaserLine[^"]*">([^<]+)</g)].map((m) => m[1]);
    expect(teasers).toEqual(["YOUR SCORE IS STILL YOUR LOWEST MEASURE.", "PROFIT IS REVENUE MINUS COST.", "MR. ZOOLANDER HAS READ A BOOK.", "THE CALENDAR IS EMPTY AGAIN.", "PICK THREE BOOKS."]);
  });
});
