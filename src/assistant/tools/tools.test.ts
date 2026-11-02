import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createInterface } from "node:readline";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIMENSIONS, MEASURES } from "../../query/types.ts";
import { checkChart, checkComparison, checkQuery, describeData, ToolInputError, TOOLS } from "./definitions.ts";
import { callTool, handle, queryEndpoint, resetRefsForTests } from "./server.ts";
import { defaultQueryUrl, orbitalToolServer, toolServerPath } from "./toolServer.server.ts";
import { toWire } from "../server/ask.server.ts";
import { fakeLookupAssistant } from "../server/fakeLookups.server.ts";
import { Refs, sentenceGate } from "../server/figures.server.ts";
import type { ProviderEvent } from "../server/provider.server.ts";

describe("the tool list", () => {
  it("is exactly: describe, query, compare, pin; every input schema is closed", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["describe_data", "query_data", "compare_data", "pin_chart"]);
    for (const t of TOOLS) expect(t.inputSchema.additionalProperties, t.name).toBe(false);
  });

  it("names the contract's measures and dimensions, so new ones carry through", () => {
    const d = describeData();
    expect(d.measures.map((m) => m.name)).toEqual([...MEASURES]);
    expect(d.dimensions).toEqual(DIMENSIONS);
  });
});

describe("checking a query from the model", () => {
  it("rebuilds a good query from known parts", () => {
    expect(checkQuery({ measure: "revenue", by: ["quarter"], filter: { genre: ["Mystery"] }, sort: { column: "revenue", direction: "desc" }, limit: 5 })).toEqual({
      measure: "revenue",
      by: ["quarter"],
      filter: { genre: ["Mystery"] },
      sort: { column: "revenue", direction: "desc" },
      limit: 5,
    });
    expect(checkQuery({ measure: "units" })).toEqual({ measure: "units", by: [] });
  });

  it.each([
    ["an unknown field (no view, SQL or code)", { measure: "revenue", by: [], view: { periods: ["2194-Q1"] } }, /unknown fields: view/],
    ["SQL", { measure: "revenue", by: [], sql: "select *" }, /unknown fields: sql/],
    ["an unknown measure", { measure: "profit", by: [] }, /Unknown measure/],
    ["three dimensions", { measure: "revenue", by: ["quarter", "genre", "format"] }, /up to 2/],
    ["a repeated dimension", { measure: "revenue", by: ["genre", "genre"] }, /different/],
    ["a dimension the measure lacks", { measure: "avg_rating", by: ["quarter"] }, /can't be grouped by quarter/],
    ["a filter the measure lacks", { measure: "checkouts", by: [], filter: { format: ["Hardcover"] } }, /can't be filtered/],
    ["an unknown filter", { measure: "revenue", by: [], filter: { __proto__x: ["a"] } }, /Unknown filter/],
    ["an empty filter", { measure: "revenue", by: [], filter: { genre: [] } }, /1 to 50/],
    ["a non-string filter", { measure: "revenue", by: [], filter: { genre: [{ $ne: 1 }] } }, /1 to 50/],
    ["a huge filter value", { measure: "revenue", by: [], filter: { genre: ["x".repeat(201)] } }, /1 to 50/],
    ["a sort on another column", { measure: "revenue", by: ["genre"], sort: { column: "units", direction: "asc" } }, /"sort" must name/],
    ["a limit over 200", { measure: "revenue", by: [], limit: 201 }, /limit/],
    ["a string", "revenue", /must be an object/],
  ])("refuses %s", (_, input, message) => {
    expect(() => checkQuery(input)).toThrow(ToolInputError);
    expect(() => checkQuery(input)).toThrow(message);
  });

  it("checks charts to pin and titles them from their query, ignoring any title from the model (Probe X1)", () => {
    expect(checkChart({ title: "Revenue soared in autumn", kind: "bar", query: { measure: "revenue", by: ["quarter"] } })).toEqual({ title: "Revenue by quarter", kind: "bar", query: { measure: "revenue", by: ["quarter"] } });
    expect(checkChart({ kind: "line", query: { measure: "avg_order_value", by: ["discount_rate", "month"], filter: { genre: ["Mystery"] } } }).title).toBe("Average order value by discount rate and month, filtered");
    expect(() => checkChart({ title: "x", kind: "pie", query: { measure: "revenue", by: [] } })).toThrow(/kind/);
    expect(() => checkChart({ title: "x", kind: "bar", query: { measure: "revenue", by: [] }, html: "<script>" })).toThrow(/unknown fields/);
  });
});

describe("checking a comparison from the model", () => {
  it("rebuilds a good comparison from known parts", () => {
    expect(checkComparison({ measure: "orders_per_day", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: ["weekday"], filter: { genre: ["Mystery"] } })).toEqual({
      measure: "orders_per_day",
      across: "quarter",
      from: "2193-Q3",
      to: "2193-Q4",
      by: ["weekday"],
      filter: { genre: ["Mystery"] },
    });
    expect(checkComparison({ measure: "revenue", across: "quarter", from: "2193-Q2", to: "2193-Q4" })).toEqual({ measure: "revenue", across: "quarter", from: "2193-Q2", to: "2193-Q4", by: [] });
  });

  it.each([
    ["an unknown field", { measure: "revenue", across: "quarter", from: "a", to: "b", view: {} }, /unknown fields: view/],
    ["an unknown measure (no profit)", { measure: "gross_profit", across: "quarter", from: "a", to: "b" }, /Unknown measure/],
    ["an unknown dimension", { measure: "revenue", across: "cost", from: "a", to: "b" }, /"across"/],
    ["the same value twice", { measure: "revenue", across: "quarter", from: "a", to: "a" }, /must differ/],
    ["two breakdowns", { measure: "revenue", across: "quarter", from: "a", to: "b", by: ["genre", "format"] }, /at most one/],
    ["a breakdown by the compared dimension", { measure: "revenue", across: "quarter", from: "a", to: "b", by: ["quarter"] }, /can't be quarter/],
    ["a filter on the compared dimension", { measure: "revenue", across: "quarter", from: "a", to: "b", filter: { quarter: ["c"] } }, /Don't filter on quarter/],
    ["a dimension the measure lacks", { measure: "avg_rating", across: "quarter", from: "a", to: "b" }, /can't be grouped by quarter/],
    ["a huge value", { measure: "revenue", across: "title", from: "x".repeat(201), to: "b" }, /"from"/],
  ])("refuses %s", (_, input, message) => {
    expect(() => checkComparison(input)).toThrow(ToolInputError);
    expect(() => checkComparison(input)).toThrow(message);
  });
});

describe("the query endpoint", () => {
  it("must be on this machine, so the token can't be sent away", () => {
    expect(queryEndpoint({ ORBITAL_QUERY_TOKEN: "t", ORBITAL_QUERY_URL: "http://127.0.0.1:5173/api/query" }).url.port).toBe("5173");
    expect(() => queryEndpoint({ ORBITAL_QUERY_TOKEN: "t", ORBITAL_QUERY_URL: "http://evil.example/api/query" })).toThrow(/loopback IP/);
    expect(() => queryEndpoint({ ORBITAL_QUERY_TOKEN: "t", ORBITAL_QUERY_URL: "http://127.0.0.1.evil.example/" })).toThrow(/loopback IP/);
    expect(() => queryEndpoint({ ORBITAL_QUERY_URL: "http://127.0.0.1/" })).toThrow(/TOKEN/);
  });

  it("must be a loopback IP literal: never a hostname, not even localhost (hostnames are resolved)", () => {
    expect(queryEndpoint({ ORBITAL_QUERY_TOKEN: "t", ORBITAL_QUERY_URL: "http://[::1]:5173/api/query" }).url.hostname).toBe("[::1]");
    for (const url of ["http://localhost:5173/api/query", "http://LOCALHOST:5173/", "http://localhost./", "http://ip6-localhost/", "http://me.localhost/", "http://user:pw@127.0.0.1/", "https://127.0.0.1/", "http://[::ffff:7f00:1]/"]) {
      expect(() => queryEndpoint({ ORBITAL_QUERY_TOKEN: "t", ORBITAL_QUERY_URL: url }), url).toThrow(/loopback IP/);
    }
  });

  it("defaults to [::1] and this server's own port", () => {
    expect(defaultQueryUrl({})).toBe("http://[::1]:5173/api/query");
    expect(defaultQueryUrl({ PORT: "3000" })).toBe("http://[::1]:3000/api/query");
    expect(defaultQueryUrl({ PORT: "evil.example" })).toBe("http://[::1]:5173/api/query");
    expect(() => queryEndpoint({ ORBITAL_QUERY_TOKEN: "t", ORBITAL_QUERY_URL: defaultQueryUrl({}) })).not.toThrow();
  });

  it("takes the dev server's own recorded address first, since Vite moves to 5174 when 5173 is busy", () => {
    expect(defaultQueryUrl({ ORBITAL_LISTEN_PORT: "5174", ORBITAL_LISTEN_HOST: "::1" })).toBe("http://[::1]:5174/api/query");
    expect(defaultQueryUrl({ ORBITAL_LISTEN_PORT: "5174", ORBITAL_LISTEN_HOST: "127.0.0.1", PORT: "3000" })).toBe("http://127.0.0.1:5174/api/query");
    expect(defaultQueryUrl({ ORBITAL_LISTEN_PORT: "5174", ORBITAL_LISTEN_HOST: "::" })).toBe("http://[::1]:5174/api/query");
    expect(defaultQueryUrl({ ORBITAL_LISTEN_PORT: "x", PORT: "3000" })).toBe("http://[::1]:3000/api/query");
    expect(defaultQueryUrl({ ORBITAL_LISTEN_PORT: "5174", ORBITAL_QUERY_URL: "http://127.0.0.1:9/api/query" })).toBe("http://127.0.0.1:9/api/query");
  });

  it("follows npm start's HOST, so Dewey still reaches a server that listens on 127.0.0.1 only (David, 2 Nov)", () => {
    expect(defaultQueryUrl({ PORT: "3000", HOST: "127.0.0.1" })).toBe("http://127.0.0.1:3000/api/query");
    expect(defaultQueryUrl({ PORT: "3000", HOST: "0.0.0.0" })).toBe("http://127.0.0.1:3000/api/query");
    expect(defaultQueryUrl({ PORT: "3000", HOST: "::1" })).toBe("http://[::1]:3000/api/query");
    expect(defaultQueryUrl({ PORT: "3000", HOST: "::" })).toBe("http://[::1]:3000/api/query");
    // The dev server's recorded address wins over HOST, as it does over PORT.
    expect(defaultQueryUrl({ ORBITAL_LISTEN_PORT: "5174", ORBITAL_LISTEN_HOST: "::1", HOST: "127.0.0.1" })).toBe("http://[::1]:5174/api/query");
  });

  it("finds the tool server from source and from the production build, which can't bundle it", () => {
    const source = fileURLToPath(new URL("./server.ts", import.meta.url));
    expect(toolServerPath(new URL("./toolServer.server.ts", import.meta.url))).toBe(source);
    // Where the build runs this module: build/server/index.js, two levels below the project root.
    expect(toolServerPath(new URL("../../../build/server/index.js", import.meta.url))).toBe(source);
    expect(existsSync(toolServerPath(new URL("../../../build/server/index.js", import.meta.url)))).toBe(true);
    expect(() => toolServerPath(new URL("file:///nowhere/build/server/index.js"))).toThrow(/tool server .* is missing/);
    expect(orbitalToolServer("t").args).toEqual([source]);
  });

  it("gets its port and host from `npm start`, which sets PORT (3000 unless set) and HOST (127.0.0.1 unless ORBITAL_HOST)", () => {
    const start: string = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).scripts.start;
    expect(start).toMatch(/^PORT=\$\{PORT:-3000\} HOST=\$\{ORBITAL_HOST:-127\.0\.0\.1\} react-router-serve /);
  });
});

describe("calling tools against the app", () => {
  let server: Server;
  let env: NodeJS.ProcessEnv;
  const seen: { auth?: string; body: unknown }[] = [];
  const body = (req: IncomingMessage) => new Promise<string>((r) => {
    let s = "";
    req.on("data", (c) => (s += c)).on("end", () => r(s));
  });
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const query = JSON.parse(await body(req));
      seen.push({ auth: req.headers.authorization, body: query });
      res.setHeader("content-type", "application/json");
      if (query.measure === "orders") {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { code: "INVALID_QUERY", message: "bad orders" } }));
      }
      if (query.by?.[0] === "genre" && query.filter?.quarter) {
        const q = query.filter.quarter[0];
        const rows = (q === "2193-Q3" ? [{ genre: "Mystery", revenue: 200 }, { genre: "Poetry", revenue: 40 }] : [{ genre: "Mystery", revenue: 150 }, { genre: "Sci-Fi", revenue: 10 }]).map((r) => ({ ...r, quarter: q }));
        return res.end(JSON.stringify({ columns: [{ key: "genre", label: "Genre", type: "string", nullable: true }, { key: "revenue", label: "Revenue", type: "number", nullable: false }], rows, total: rows.reduce((t, r) => t + r.revenue, 0), source: `Genres, ${q}` }));
      }
      // Audit's probe: values that match nothing come back empty.
      if (query.by?.includes("title") && query.filter?.title) return res.end(JSON.stringify({ columns: [], rows: [], total: 0, source: "Revenue from 0 visible matching sale lines" }));
      if (query.measure === "units") {
        res.statusCode = 500;
        return res.end("Internal error at /Users/david/secret with token abc");
      }
      res.end(JSON.stringify({ columns: [{ key: "quarter", label: "Quarter", type: "string", nullable: false }], rows: [{ quarter: "2193-Q1", revenue: 10 }], total: 10, source: "Sales, 2193-Q1 to Q4", extra: "dropped" }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    env = { ORBITAL_QUERY_TOKEN: "tok", ORBITAL_QUERY_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/query` };
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("sends only the checked query, with the token, and returns the result with its source and refs", async () => {
    resetRefsForTests();
    const result = await callTool("query_data", { measure: "revenue", by: ["quarter"] }, env);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ ref: "a", columns: [{ key: "quarter", label: "Quarter", type: "string", nullable: false }], rows: [{ ref: "a1", quarter: "2193-Q1", revenue: 10 }], total: 10, source: "Sales, 2193-Q1 to Q4", complete: true });
    expect(seen.at(-1)).toEqual({ auth: "Bearer tok", body: { measure: "revenue", by: ["quarter"] } });
    expect(JSON.parse((await callTool("query_data", { measure: "revenue", by: [] }, env)).content[0].text)).toMatchObject({ ref: "b", rows: [{ ref: "b1" }] });
    // A limit the rows reach may have cut the result, so rankings over it aren't offered.
    expect(JSON.parse((await callTool("query_data", { measure: "revenue", by: ["quarter"], limit: 1 }, env)).content[0].text).complete).toBe(false);
  });

  it("never reaches the app with a bad query", async () => {
    const before = seen.length;
    const result = await callTool("query_data", { measure: "revenue", by: [], view: { periods: ["2194-Q1"] } }, env);
    expect(result.isError).toBe(true);
    expect(seen.length).toBe(before);
  });

  it("passes the app's own error back, but hides anything unexpected", async () => {
    expect((await callTool("query_data", { measure: "orders", by: [] }, env)).content[0].text).toBe("INVALID_QUERY: bad orders");
    const hidden = await callTool("query_data", { measure: "units", by: [] }, env);
    expect(hidden).toEqual({ content: [{ type: "text", text: "The data terminal is unavailable right now." }], isError: true });
  });

  it("compares two values as two queries and works out the change itself, with a source", async () => {
    const before = seen.length;
    const result = JSON.parse((await callTool("compare_data", { measure: "revenue", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: ["genre"] }, env)).content[0].text);
    expect(seen.slice(before).map((s) => s.body)).toEqual([
      { measure: "revenue", by: ["genre", "quarter"], filter: { quarter: ["2193-Q3"] } },
      { measure: "revenue", by: ["genre", "quarter"], filter: { quarter: ["2193-Q4"] } },
    ]);
    expect(result.columns.map((c: { key: string }) => c.key)).toEqual(["genre", "from", "to", "change", "percent_change"]);
    expect(result.ref).toMatch(/^[a-z]+$/);
    expect(result.rows.map(({ ref, ...row }: { ref: string }) => (expect(ref).toBe(`${result.ref}${result.rows.findIndex((r: { ref: string }) => r.ref === ref) + 1}`), row))).toEqual([
      { genre: "Mystery", from: 200, to: 150, change: -50, percent_change: -25, direction: "fell" },
      { genre: "Poetry", from: 40, to: null, change: null, percent_change: null, direction: null },
      { genre: "Sci-Fi", from: null, to: 10, change: null, percent_change: null, direction: null },
    ]);
    expect(result.total).toEqual({ from: 240, to: 160, change: -80, percent_change: (-80 / 240) * 100, direction: "fell" });
    expect(result.labels).toEqual({ from: "2193-Q3", to: "2193-Q4" });
    expect(result.source).toMatch(/^revenue compared across quarter, 2193-Q3 against 2193-Q4\. .*2193-Q3: Genres, 2193-Q3 2193-Q4: Genres, 2193-Q4$/);
  });

  it("the fake provider looks up for real, through this code, and says nothing the figure gate would withhold", async () => {
    const events: ProviderEvent[] = [];
    for await (const e of fakeLookupAssistant(env as Record<string, string>).ask({ system: "", message: "" }, new AbortController().signal)) events.push(e);
    // The stub has one quarter, so there's nothing to compare.
    expect(events.map((e) => (e.type === "tool" ? e.name : e.type))).toEqual(["text", "query_data"]);
    expect(toWire(events[1]!)).toMatchObject({ type: "data", rows: [{ quarter: "2193-Q1", revenue: 10 }], pin: { kind: "table", query: { measure: "revenue", by: ["quarter"] } } });
    const text = (events[0] as { text: string }).text;
    const gate = sentenceGate(new Refs());
    expect(gate.push(text) + gate.flush()).toBe(text);
  });

  it("names compared values only as the data returned them: never the model's text (Audit's probe)", async () => {
    const result = JSON.parse((await callTool("compare_data", { measure: "revenue", across: "title", from: "Gross profit rose to $777", to: "Not a real title" }, env)).content[0].text);
    expect(result.labels).toEqual({ from: null, to: null });
    expect(result.columns.map((c: { label: string }) => c.label)).toEqual(["First value", "Second value", "Change", "Change (%)"]);
    expect(JSON.stringify(result)).not.toMatch(/Gross profit|777|Not a real title/);
    expect(result.source).toMatch(/^revenue compared across title, the first value against the second value\. No sales matched the first value\. No sales matched the second value\./);
  });

  it("pins a chart after checking its query runs", async () => {
    const result = JSON.parse((await callTool("pin_chart", { kind: "line", query: { measure: "revenue", by: ["quarter"] } }, env)).content[0].text);
    expect(result).toEqual({ pinned: true, chart: { title: "Revenue by quarter", kind: "line", query: { measure: "revenue", by: ["quarter"] } }, rows: 1, source: "Sales, 2193-Q1 to Q4" });
  });

  it("leaves out pin_chart for pages with nowhere to pin", async () => {
    const noPins = { ...env, ORBITAL_PINS: "0" };
    const list = (await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, noPins)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(["describe_data", "query_data", "compare_data"]);
    expect((await callTool("pin_chart", { title: "R", kind: "bar", query: { measure: "revenue", by: [] } }, noPins)).isError).toBe(true);
    expect(orbitalToolServer("t", { pins: false }).env?.ORBITAL_PINS).toBe("0");
  });

  it("refuses unknown tools", async () => {
    expect((await callTool("read_file", { path: "/etc/passwd" }, env)).isError).toBe(true);
    expect(await handle({ jsonrpc: "2.0", id: 1, method: "resources/list" }, env)).toMatchObject({ error: { code: -32601 } });
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, env)).toBeNull();
  });

  it("speaks MCP over stdio as a process", async () => {
    const launch = orbitalToolServer("tok", { queryUrl: env.ORBITAL_QUERY_URL });
    const child = spawn(launch.command, launch.args, { env: { PATH: process.env.PATH, ...launch.env }, stdio: ["pipe", "pipe", "inherit"] });
    const replies = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const ask = async (m: object) => {
      child.stdin.write(`${JSON.stringify(m)}\n`);
      return JSON.parse((await replies.next()).value);
    };
    try {
      expect((await ask({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).result.serverInfo.name).toBe("orbital");
      expect((await ask({ jsonrpc: "2.0", id: 2, method: "tools/list" })).result.tools).toHaveLength(4);
      const call = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "query_data", arguments: { measure: "revenue", by: ["quarter"] } } });
      expect(JSON.parse(call.result.content[0].text).source).toBe("Sales, 2193-Q1 to Q4");
      expect((await ask({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "x", arguments: {} }, junk: "x".repeat(70_000) })).error.message).toBe("Request too large");
    } finally {
      child.kill();
    }
  });
});
