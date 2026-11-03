import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { expect, it } from "vitest";
import type { LookupPin } from "../tools/definitions";
import { AssistantPanel, fitToText, LookupView, sendsQuestion } from "./AssistantPanel";

it("renders an empty panel on the server, without touching storage, and offers no reset until there's a conversation", () => {
  const storage = new Proxy({} as Storage, {
    get() {
      throw new Error("storage read during server rendering");
    },
  });
  const Stub = createRoutesStub([
    { path: "/", Component: () => <AssistantPanel storage={storage} track={() => {}} /> },
  ]);
  const html = renderToString(<Stub initialEntries={["/"]} />);
  expect(html).toMatch(/Ask me about your sales/);
  expect(html).not.toMatch(/New conversation/);
});

it("draws a chart Dewey showed with the page's chart, titled, sourced and pinnable; as its table without one", () => {
  type Lookup = Parameters<typeof LookupView>[0]["lookup"];
  const chart = {
    title: "Revenue by quarter",
    kind: "line" as const,
    query: { measure: "revenue" as const, by: ["quarter" as const] },
  };
  const drawn: Lookup = {
    type: "chart",
    chart,
    pin: chart,
    columns: [
      { key: "quarter", label: "Quarter", type: "string", nullable: false },
      { key: "revenue", label: "Revenue", type: "number", nullable: false },
    ],
    rows: [{ quarter: "2193-Q4", revenue: 5 }],
    total: 5,
    source: "S",
  };
  const ChartView = ({ result }: { result: { rows: unknown[] } }) => (
    <div data-chart={result.rows.length} />
  );
  const html = renderToString(
    <LookupView lookup={drawn} ChartView={ChartView} pinning={{ onPin: () => true }} />,
  );
  expect(html).toMatch(/<figcaption[^>]*>Revenue by quarter<\/figcaption><div data-chart="1">/);
  expect(html).toMatch(/Source: S/);
  expect(html).toMatch(/aria-label="Pin Revenue by quarter"/);
  expect(html).not.toMatch(/<table/);
  const table = renderToString(<LookupView lookup={drawn} />);
  expect(table).toMatch(/<table/);
  expect(table).toMatch(/2193-Q4/);
});

it("offers Pin on every lookup it can pin, only where the page takes pins, and says when it's already pinned", () => {
  type Lookup = Parameters<typeof LookupView>[0]["lookup"];
  const table: LookupPin = {
    title: "Revenue by quarter",
    kind: "table",
    query: { measure: "revenue", by: ["quarter"] },
  };
  const data: Lookup = {
    type: "data",
    columns: [{ key: "revenue", label: "Revenue", type: "number", nullable: false }],
    rows: [{ revenue: 1 }],
    total: 1,
    source: "S",
  };
  const comparison: LookupPin = {
    title: "Revenue compared across quarter",
    kind: "comparison",
    comparison: { measure: "revenue", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: [] },
  };
  const compared: Lookup = {
    type: "comparison",
    columns: [],
    rows: [],
    total: { from: 1, to: 2, change: 1, percent_change: 100, direction: "rose" },
    labels: { from: null, to: null },
    source: "S",
    pin: comparison,
  };
  const pinning = { onPin: () => true };
  expect(renderToString(<LookupView lookup={{ ...data, pin: table }} pinning={pinning} />)).toMatch(
    /aria-label="Pin Revenue by quarter"[^>]*>Pin</,
  );
  expect(renderToString(<LookupView lookup={compared} pinning={pinning} />)).toMatch(
    /aria-label="Pin Revenue compared across quarter"/,
  );
  expect(
    renderToString(
      <LookupView
        lookup={{ ...data, pin: table }}
        pinning={{ ...pinning, isPinned: () => true }}
      />,
    ),
  ).toMatch(/disabled=""[^>]*aria-label="Pinned: Revenue by quarter"[^>]*>Pinned</);
  // No pin from the server (its input didn't check), or nowhere to put one: no button.
  expect(renderToString(<LookupView lookup={data} pinning={pinning} />)).not.toMatch(/<button/);
  expect(renderToString(<LookupView lookup={{ ...data, pin: table }} />)).not.toMatch(/<button/);
});

it("asks in a box that wraps what's typed, labelled and limited as before", () => {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <AssistantPanel storage={{} as Storage} track={() => {}} /> },
  ]);
  const html = renderToString(<Stub initialEntries={["/"]} />);
  // A textarea wraps; an input scrolled its text off the left (David, 2 Nov).
  expect(html).toMatch(
    /<textarea[^>]*aria-label="Question for Dewey"[^>]*maxLength="500"[^>]*rows="1"/,
  );
  expect(html).not.toMatch(/<input/);
});

it("sends on Enter, and makes a new line on Shift+Enter or while an IME is composing", () => {
  expect(sendsQuestion({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
  expect(sendsQuestion({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
  expect(sendsQuestion({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
  expect(sendsQuestion({ key: "a", shiftKey: false, isComposing: false })).toBe(false);
});

it("fits the box to its text, border and all, however tall, with no limit", () => {
  // A box whose text is 600 px tall, inside 2 px of border: it measures itself at auto first, then grows.
  const heights: string[] = [];
  const box = {
    scrollHeight: 600,
    offsetHeight: 40,
    clientHeight: 38,
    style: {
      set height(h: string) {
        heights.push(h);
      },
      get height() {
        return heights.at(-1) ?? "";
      },
    },
  };
  fitToText(box);
  expect(heights).toEqual(["auto", "602px"]);
});
