import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { expect, it } from "vitest";
import type { LookupPin } from "../tools/definitions";
import {
  activityOf,
  AssistantPanel,
  fitToText,
  LookupView,
  PORTRAIT,
  sendsQuestion,
  talkingTurn,
} from "./AssistantPanel";
import { Group } from "three";
import { mouthOpen, pose } from "./DeweyFaces3D";

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
  // Titled, with its Table toggle beside the title (unpressed: it's a chart), then the chart.
  expect(html).toMatch(
    /<figcaption[^>]*>Revenue by quarter<\/figcaption><button[^>]*aria-pressed="false" aria-label="Table: Revenue by quarter"[^>]*>Table<\/button><\/div><div data-chart="1">/,
  );
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

it("shows Dewey's face, named, beside what he says, from his greeting on", () => {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <AssistantPanel storage={undefined} track={() => {}} /> },
  ]);
  const html = renderToString(<Stub initialEntries={["/"]} />);
  // The portrait comes first, then the greeting in its bubble.
  expect(html).toMatch(
    new RegExp(`<img src="${PORTRAIT}" alt="Dewey"[^>]*>.*Ask me about your sales`),
  );
});

it("has the face beside the turn with focus talk, else the pointer's, else his last", () => {
  expect(talkingTurn(null, null, 0)).toBe(0);
  expect(talkingTurn(null, null, 3)).toBe(2);
  expect(talkingTurn(null, 1, 3)).toBe(1);
  expect(talkingTurn(0, 1, 3)).toBe(0);
});

it("keeps an idle face almost still, and a talking one moving", () => {
  const most = (talking: number) => {
    const dewey = new Group();
    let turn = 0;
    let rise = 0;
    for (let t = 0; t < 20; t += 0.05) {
      pose(dewey, t, 2, talking);
      turn = Math.max(
        turn,
        Math.abs(dewey.rotation.x),
        Math.abs(dewey.rotation.y),
        Math.abs(dewey.rotation.z),
      );
      rise = Math.max(rise, Math.abs(dewey.position.y));
    }
    return { turn, rise };
  };
  // Idle: under two degrees and a centimetre (he's about a metre tall); talking: several times that.
  expect(most(0).turn).toBeLessThan((2 * Math.PI) / 180);
  expect(most(0).rise).toBeLessThan(0.01);
  expect(most(1).turn).toBeGreaterThan(4 * most(0).turn);
  expect(most(1).rise).toBeGreaterThan(2 * most(0).rise);
});

it("starts a table on its table with the toggle pressed, and offers its chart where there's a breakdown", () => {
  type Lookup = Parameters<typeof LookupView>[0]["lookup"];
  const query = { measure: "revenue" as const, by: ["genre" as const] };
  const data: Lookup = {
    type: "data",
    pin: { title: "Revenue by genre", kind: "table", query },
    columns: [
      { key: "genre", label: "Genre", type: "string", nullable: false },
      { key: "revenue", label: "Revenue", type: "number", nullable: false },
    ],
    rows: [{ genre: "Mystery", revenue: 5 }],
    total: 5,
    source: "S",
  };
  const ChartView = () => <div data-chart="drawn" />;
  const html = renderToString(<LookupView lookup={data} ChartView={ChartView} />);
  expect(html).toMatch(/aria-pressed="true" aria-label="Table: Revenue by genre"/);
  expect(html).not.toMatch(/disabled/);
  expect(html).toMatch(/<table/);
  // One figure has no chart: pressed and off, saying why (Plot, chart-features-copy.md section 1).
  const total = renderToString(
    <LookupView
      lookup={{
        ...data,
        pin: { title: "Revenue", kind: "table", query: { measure: "revenue", by: [] } },
        columns: [{ key: "revenue", label: "Revenue", type: "number", nullable: false }],
        rows: [{ revenue: 5 }],
      }}
      ChartView={ChartView}
    />,
  );
  expect(total).toMatch(/disabled="" title="A single figure has no chart"/);
  // Without the page's charts (any page but Investigate), no toggle at all (Sage).
  expect(renderToString(<LookupView lookup={data} />)).not.toMatch(/aria-pressed/);
});

it("knows when Dewey is thinking, then saying his answer, and not after", () => {
  expect(activityOf([])).toBeNull();
  expect(activityOf([{ state: "done", text: "Yes." }])).toBeNull();
  expect(
    activityOf([
      { state: "done", text: "Yes." },
      { state: "streaming", text: "" },
    ]),
  ).toEqual({
    turn: 1,
    kind: "thinking",
  });
  expect(activityOf([{ state: "streaming", text: "Q3 brought" }])).toEqual({
    turn: 0,
    kind: "saying",
  });
});

it("leans back to ponder while thinking, and hops when the answer comes", () => {
  const dewey = new Group();
  let lean = 0;
  for (let t = 0; t < 20; t += 0.05) {
    pose(dewey, t, 0, 0, 1);
    lean = Math.min(lean, dewey.rotation.x);
  }
  // Looking up: tipped back a few degrees.
  expect(lean).toBeLessThan((-2 * Math.PI) / 180);
  pose(dewey, 0, 0, 0, 0, 0.5);
  // Halfway through the flare: a hop of a couple of centimetres.
  expect(dewey.position.y).toBeGreaterThan(0.02);
});

it("moves his mouth without pause while an answer streams in, and in phrases after", () => {
  const closed = (streaming: boolean) => {
    // The longest stretch his mouth stays shut, in seconds.
    let longest = 0;
    let run = 0;
    for (let t = 0; t < 20; t += 0.02) {
      const open = mouthOpen(t, 1, streaming);
      expect(open).toBeGreaterThanOrEqual(0);
      expect(open).toBeLessThanOrEqual(1);
      run = open < 0.05 ? run + 0.02 : 0;
      longest = Math.max(longest, run);
    }
    return longest;
  };
  // Syllables only: never shut for long while streaming; a breath between phrases otherwise.
  expect(closed(true)).toBeLessThan(0.3);
  expect(closed(false)).toBeGreaterThan(0.8);
});
