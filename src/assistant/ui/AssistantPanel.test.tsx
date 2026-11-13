import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import type { LookupPin } from "../tools/definitions";
import {
  activityOf,
  AssistantPanel,
  fitToText,
  LookupView,
  tableTitle,
  PORTRAIT,
  sendsQuestion,
  talkingTurn,
  withNewline,
} from "./AssistantPanel";
import { Group } from "three";
import { mouthOpen, pose, screenFrame } from "./DeweyFaces3D";

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
  // Titled, with its Table toggle (unpressed: it's a chart) and then Pin beside the title, in one group (David,
  // 3 Nov 2026: "put the "pin" button right next to the chart/table toggle"), then the chart.
  expect(html).toMatch(
    /<figcaption[^>]*>Revenue by quarter<\/figcaption><div[^>]*><span[^>]*><button[^>]*aria-pressed="false" aria-label="Table: Revenue by quarter"[^>]*>Table<\/button><\/span><div[^>]*><button[^>]*aria-label="Pin Revenue by quarter"[^>]*>Pin<\/button><\/div><\/div><\/div><div data-chart="1">/,
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

it("sends on Enter, and makes a new line on Shift+Enter, Option+Enter or while an IME is composing", () => {
  const key = { key: "Enter", shiftKey: false, altKey: false, isComposing: false };
  expect(sendsQuestion(key)).toBe(true);
  expect(sendsQuestion({ ...key, shiftKey: true })).toBe(false);
  expect(sendsQuestion({ ...key, altKey: true })).toBe(false);
  expect(sendsQuestion({ ...key, isComposing: true })).toBe(false);
  expect(sendsQuestion({ ...key, key: "a" })).toBe(false);
});

it("puts Option+Enter's new line at the caret or over the selection, within the limit (David, 4 Nov 2026)", () => {
  // At the caret, and the caret after it.
  expect(withNewline("ab", 1, 1, 500)).toEqual({ value: "a\nb", caret: 2 });
  expect(withNewline("", 0, 0, 500)).toEqual({ value: "\n", caret: 1 });
  expect(withNewline("ab", 2, 2, 500)).toEqual({ value: "ab\n", caret: 3 });
  // Over a selection, which it replaces.
  expect(withNewline("abcd", 1, 3, 500)).toEqual({ value: "a\nd", caret: 2 });
  // Replacing a selection frees room; at the limit with none selected, nothing changes.
  expect(withNewline("abc", 0, 3, 3)).toEqual({ value: "\n", caret: 1 });
  expect(withNewline("abc", 3, 3, 3)).toBeNull();
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
  expect(html).not.toMatch(/aria-disabled/);
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
  // Still focusable: aria-disabled, its reason as text it's described by (ReasonToggle).
  expect(total).toMatch(/aria-pressed="true"[^>]*aria-disabled="true" aria-describedby="[^"]+"/);
  expect(total).toMatch(/role="tooltip"[^>]*>A single figure has no chart</);
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

it("shows the spinner while thinking, the lightbulb as the answer arrives, mouths while talking, else his smile", () => {
  const frames = (mood: { talk: number; think: number; idea: number | null }, streaming = false) =>
    new Set(Array.from({ length: 400 }, (_, i) => screenFrame(i * 0.05, 1, mood, streaming)));
  // Thinking: the six spinner frames, every one of them in turn.
  expect([...frames({ talk: 0, think: 1, idea: null })].sort((a, b) => a - b)).toEqual([
    0, 1, 2, 3, 4, 5,
  ]);
  // The idea: the bulb's three frames in order, the last held.
  expect(
    [0, 0.3, 0.6, 1.5].map((idea) => screenFrame(0, 1, { talk: 1, think: 0, idea }, true)),
  ).toEqual([6, 7, 8, 8]);
  // Talking: his smile between syllables, and mouths of every size.
  const talking = frames({ talk: 1, think: 0, idea: null }, true);
  expect(talking.has(9)).toBe(true);
  expect([10, 15].some((f) => talking.has(f))).toBe(true);
  expect([13, 14].some((f) => talking.has(f))).toBe(true);
  expect([12, 16].some((f) => talking.has(f))).toBe(true);
  // Idle: his smile, and now and then a happy blink, never a mouth.
  expect([...frames({ talk: 0, think: 0, idea: null })].sort((a, b) => a - b)).toEqual([9, 17]);
});

it("puts a table's Pin beside its toggle in the header, not after the source (David, 3 Nov 2026)", () => {
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
  const html = renderToString(
    <LookupView lookup={data} ChartView={() => <div />} pinning={{ onPin: () => true }} />,
  );
  const toggle = html.indexOf('aria-label="Table: Revenue by genre"');
  const pin = html.indexOf('aria-label="Pin Revenue by genre"');
  // The toggle first, then Pin, both before the table and the source line.
  expect(toggle).toBeGreaterThan(-1);
  expect(pin).toBeGreaterThan(toggle);
  expect(pin).toBeLessThan(html.indexOf("<table"));
  expect(pin).toBeLessThan(html.indexOf("Source:"));
  // Without the page's charts there's no toggle, and Pin still sits in the header.
  const plain = renderToString(<LookupView lookup={data} pinning={{ onPin: () => true }} />);
  expect(plain.indexOf('aria-label="Pin Revenue by genre"')).toBeLessThan(plain.indexOf("<table"));
});

it("draws a table with the page's own table where it has one, so its evidence shows as Investigate's (Chart)", () => {
  type Lookup = Parameters<typeof LookupView>[0]["lookup"];
  const data: Lookup = {
    type: "data",
    columns: [
      { key: "genre", label: "Genre", type: "string", nullable: false },
      { key: "avg_rating", label: "Average rating", type: "number", nullable: false },
    ],
    rows: [{ genre: "Mystery", avg_rating: 4.1 }],
    total: 4.1,
    source: "S",
    evidence: { unit: "ratings", rows: [{ n: 212, se: 0.09 }], total: { n: 212, se: 0.09 } },
  };
  const TableView = ({ result }: { result: { evidence?: { unit: string | null } } }) => (
    <div data-table={result.evidence?.unit ?? "none"} />
  );
  const html = renderToString(<LookupView lookup={data} TableView={TableView} />);
  expect(html).toMatch(/data-table="ratings"/);
  expect(html).not.toMatch(/<table/);
  // Without it, the panel's own table.
  expect(renderToString(<LookupView lookup={data} />)).toMatch(/<table/);
});

it("flags a comparison's change within noise after its percent, only where the data judged it (Plot)", () => {
  type Lookup = Parameters<typeof LookupView>[0]["lookup"];
  const comparison = {
    type: "comparison",
    columns: [
      { key: "genre", label: "Genre", type: "string", nullable: true },
      { key: "from", label: "2193-Q3", type: "number", nullable: true },
      { key: "to", label: "2193-Q4", type: "number", nullable: true },
      { key: "change", label: "Change", type: "number", nullable: true },
      { key: "percent_change", label: "Change (%)", type: "number", nullable: true },
    ],
    rows: [
      { genre: "Mystery", from: 100, to: 104, change: 4, percent_change: 4, noise: "within" },
      { genre: "Poetry", from: 100, to: 300, change: 200, percent_change: 200, noise: "clear" },
      { genre: "Drama", from: 0, to: 3, change: 3, percent_change: null, noise: "within" },
    ],
    total: { from: 200, to: 407, change: 207, percent_change: 103.5, noise: "clear" },
    labels: { from: "2193-Q3", to: "2193-Q4" },
    source: "S",
  } as unknown as Lookup;
  const html = renderToString(<LookupView lookup={comparison} />);
  expect(html.match(/· within noise/g)).toHaveLength(2);
  expect(html).toMatch(/title="A difference this small often shows up by chance/);
});

describe("a lookup of several measures (req_2d436ee864cd; Plot, section 11)", () => {
  type Lookup = Parameters<typeof LookupView>[0]["lookup"];
  const query = { measure: "revenue" as const, also: ["units" as const], by: ["quarter" as const] };
  // A stored lookup keeps its query beside it (fold.ts's dataQuery); one with no pin titles its chart from its columns.
  const data = {
    type: "data",
    query,
    columns: [
      { key: "quarter", label: "Quarter", type: "string", nullable: false },
      { key: "revenue", label: "Revenue", type: "number", nullable: false },
      { key: "units", label: "Units sold", type: "number", nullable: false },
    ],
    rows: [{ quarter: "2193-Q4", revenue: 50, units: 7 }],
    total: 50,
    source: "S",
    measures: {
      revenue: {
        total: 50,
        evidence: { unit: null, rows: [{ n: 7, se: 0 }], total: { n: 7, se: 0 } },
      },
      units: {
        total: 7,
        evidence: { unit: null, rows: [{ n: 7, se: 0 }], total: { n: 7, se: 0 } },
      },
    },
  } as Lookup;
  const ChartView = () => <div data-chart="" />;

  it("ends its table with an All row of every measure's figure, with no Total line", () => {
    const html = renderToString(<LookupView lookup={data} />);
    expect(html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|")).toContain("|All|50|7|");
    expect(html).not.toMatch(/Total:/);
  });

  it("with no breakdown, shows its one row without an All row repeating it (Audit, #419)", () => {
    const overall = {
      ...data,
      columns: (data as Extract<Lookup, { type: "data" }>).columns.filter(
        (c) => c.key !== "quarter",
      ),
      rows: [{ revenue: 50, units: 7 }],
    } as Lookup;
    const html = renderToString(<LookupView lookup={overall} />);
    expect(html.match(/>50</g)).toHaveLength(1);
    expect(html).not.toMatch(/>All</);
  });

  it("titles its chart from every measure, and says why there's none where the page's chart can't draw it", () => {
    const fine = renderToString(
      <LookupView lookup={data} ChartView={ChartView} chartProblem={() => null} />,
    );
    expect(fine).toMatch(/aria-label="Table: Revenue and units sold by quarter"/);
    expect(fine).not.toMatch(/aria-disabled="true"/);
    const off = renderToString(
      <LookupView
        lookup={data}
        ChartView={ChartView}
        chartProblem={() => "These measures need three axes, and a chart has two"}
      />,
    );
    expect(off).toMatch(/These measures need three axes, and a chart has two/);
  });

  it("names its measures in the order the query does: a title for one, two or three", () => {
    const column = (label: string, type = "number") => ({ label, type });
    expect(tableTitle({ columns: [column("Genre", "string"), column("Revenue")] })).toBe(
      "Revenue by genre",
    );
    expect(
      tableTitle({
        columns: [
          column("Quarter", "string"),
          column("Revenue"),
          column("Units sold"),
          column("Orders"),
        ],
      }),
    ).toBe("Revenue, units sold and orders by quarter");
  });
});
