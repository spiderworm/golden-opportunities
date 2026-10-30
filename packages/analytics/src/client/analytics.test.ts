import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptable, createAnalytics, nextBatch } from "./analytics.ts";
import { joined } from "../report/report.ts";
import { createRequire } from "node:module";
const { check } = createRequire(import.meta.url)("../ingest/handler.cjs");

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const setup = (answer = true) => {
  const storage = memory();
  const bodies: any[] = [];
  const a = createAnalytics({
    game: "test",
    endpoint: "https://x",
    key: "t",
    build: "b1",
    platform: "web",
    storage,
    send: async (_url, body) => (bodies.push(JSON.parse(body)), answer),
  });
  return { a, storage, bodies };
};

test("events are sent once, in order, with the install and build, and leave the outbox", async () => {
  const { a, bodies } = setup();
  a.track("one", { x: 1 });
  a.track("two");
  await a.flush();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].game, "test");
  assert.equal(bodies[0].install, a.install());
  assert.equal(bodies[0].build, "b1");
  assert.deepEqual(bodies[0].events.map((e: any) => [e.n, e.e]), [[1, "one"], [2, "two"]]);
  await a.flush();
  assert.equal(bodies.length, 1, "nothing left to send");
  assert.equal(a.events().length, 2, "the device's own log keeps them");
});

test("a refused batch waits for next time", async () => {
  const { a, bodies } = setup(false);
  a.track("one");
  await a.flush();
  await a.flush();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].events.length, 1);
});

test("turned off: only the turning off is sent, then nothing, until it's on again", async () => {
  const { a, bodies, storage } = setup();
  a.track("before");
  a.setSharing(false);
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(bodies[0].events.map((e: any) => e.e), ["sharing_set"]);
  a.track("private");
  await a.flush();
  assert.equal(bodies.length, 1);
  assert.equal(a.sharing(), false);
  assert.equal(storage.m.get("t.sharingOff"), "true");
  a.setSharing(true);
  a.track("after");
  await a.flush();
  assert.deepEqual(bodies[1].events.map((e: any) => [e.e, e.p.on]), [["sharing_set", true], ["after", undefined]]);
});

test("the install id and the running number last across launches", async () => {
  const { a, storage } = setup();
  a.track("one");
  await a.flush(); // saves
  const b = createAnalytics({ game: "test", key: "t", build: "b1", platform: "web", storage });
  assert.equal(b.install(), a.install());
  b.track("two");
  assert.equal(b.events().at(-1)!.n, 2);
});

test("a long outbox goes in requests under the endpoint's 16 KB, oldest first, all of it", async () => {
  const { a, bodies } = setup();
  for (let i = 0; i < 500; i++) a.track("frames", { level: "c1-1", fps: 58.2, workP50: 3, workP90: 6, stalls: 0 });
  await a.flush();
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(bodies.length > 1);
  assert.ok(bodies.every((b) => JSON.stringify(b).length < 16384));
  assert.deepEqual(bodies.flatMap((b) => b.events.map((e: any) => e.n)), Array.from({ length: 500 }, (_, i) => i + 1));
});

test("a batch is at least one event, however big", () => {
  assert.equal(nextBatch([{ big: "x".repeat(20_000) }, { small: 1 }]).length, 1);
});

test("the log from before sending began goes once, ahead of the rest, without what the endpoint would refuse", async () => {
  const storage = memory();
  storage.setItem("t.events", JSON.stringify([
    { t: 1, s: "old", e: "app_opened", p: {} },
    { t: 2, s: "old", e: "Bad Name", p: {} },
    { t: 3, s: "old", e: "cube_won", p: { level: "c01-b01" } },
  ]));
  const bodies: any[] = [];
  const make = () => createAnalytics({ game: "test", endpoint: "https://x", key: "t", build: "b1", platform: "web", storage, send: async (_u, body) => (bodies.push(JSON.parse(body)), true) });
  const a = make();
  a.track("now");
  await a.flush();
  assert.deepEqual(bodies.flatMap((b) => b.events.map((e: any) => [e.n, e.e])), [[-2, "app_opened"], [-1, "cube_won"], [1, "now"]]);
  make();
  await make().flush();
  assert.equal(bodies.length, 1, "sent once only");
});

test("with sharing off, the early log stays on the device", async () => {
  const storage = memory();
  storage.setItem("t.events", JSON.stringify([{ t: 1, s: "old", e: "app_opened", p: {} }]));
  storage.setItem("t.sharingOff", "true");
  const bodies: any[] = [];
  const a = createAnalytics({ game: "test", endpoint: "https://x", key: "t", build: "b1", platform: "web", storage, send: async (_u, body) => (bodies.push(body), true) });
  await a.flush();
  assert.equal(bodies.length, 0);
});

test("props are made what the endpoint takes, and bad names aren't recorded", async () => {
  const { a, bodies } = setup();
  const warn = console.warn;
  console.warn = () => {};
  a.track("Bad Name");
  console.warn = warn;
  a.track("pizza_served", { sizes: [1, 2, 3], note: "x".repeat(300), gone: undefined, nan: NaN, ok: true });
  await a.flush();
  const p = bodies[0].events[0].p;
  assert.equal(bodies[0].events.length, 1);
  assert.deepEqual({ sizes: p.sizes, len: p.note.length, has: "gone" in p, nan: p.nan, ok: p.ok }, { sizes: "[1,2,3]", len: 200, has: false, nan: "NaN", ok: true });
});

test("a batch the endpoint refuses as malformed is dropped, so later ones still go", async () => {
  const storage = memory();
  const bodies: any[] = [];
  let answer: boolean | "refused" = "refused";
  const a = createAnalytics({ game: "test", endpoint: "https://x", key: "t", build: "b1", platform: "web", storage, send: async (_u, body) => (bodies.push(JSON.parse(body)), answer) });
  const warn = console.warn;
  console.warn = () => {};
  a.track("one");
  await a.flush();
  console.warn = warn;
  answer = true;
  a.track("two");
  await a.flush();
  assert.deepEqual(bodies.map((b) => b.events.map((e: any) => e.e)), [["one"], ["two"]]);
});

const made = (env: { userAgent: string; webdriver?: boolean; search?: string }) => {
  const storage = memory();
  const bodies: any[] = [];
  const a = createAnalytics({
    game: "test", endpoint: "https://x", key: "t", build: "b1", platform: "android", storage,
    env: { userAgent: env.userAgent, webdriver: !!env.webdriver, search: env.search ?? "" },
    gl: () => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => "Mali-G715" }) as any,
    send: async (_u, body) => (bodies.push(JSON.parse(body)), true),
  });
  return { a, bodies, storage };
};

test("every game: Play's test robots send, labeled testlab; real phones send as themselves", async () => {
  const robot = made({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 5; wv) TellimTestLab" });
  robot.a.track("one");
  await robot.a.flush();
  assert.equal(robot.bodies[0].platform, "testlab");
  const phone = made({ userAgent: "Mozilla/5.0 (Linux; Android 17; Pixel 8 Pro; wv)" });
  phone.a.track("one");
  await phone.a.flush();
  assert.equal(phone.bodies[0].platform, "android");
});

test("every game: automated runs send nothing and keep a log of their own", async () => {
  const run = made({ userAgent: "x", webdriver: true });
  run.a.track("one");
  await run.a.flush();
  assert.equal(run.bodies.length, 0);
  assert.equal(run.a.events().length, 1);
});

test("every game: a device event once per startup, with the game's GPU", async () => {
  const phone = made({ userAgent: "Mozilla/5.0 (Linux; Android 17; Pixel 8 Pro Build/X; wv)" });
  await new Promise((r) => setTimeout(r, 1700));
  const d = phone.a.events().filter((e) => e.e === "device");
  assert.equal(d.length, 1);
  assert.equal(d[0].p.gpu, "Mali-G715");
  assert.equal(d[0].p.model, "Pixel 8 Pro");
});

test("the build's version goes with each batch when the game gives it", async () => {
  const storage = memory();
  const bodies: any[] = [];
  const a = createAnalytics({ game: "test", endpoint: "https://x", key: "t", build: "b1", version: "0.1.12-alpha", platform: "web", storage, env: { userAgent: "x", webdriver: false, search: "" }, send: async (_u, body) => (bodies.push(JSON.parse(body)), true) });
  a.track("one");
  await a.flush();
  assert.equal(bodies[0].version, "0.1.12-alpha");
});

test("held events stay on the device, apart from the log, until released with their own time and number", async () => {
  const { a, bodies, storage } = setup();
  const question = "How far is the nearest bookshop? ".repeat(20); // 660 characters
  a.track("one");
  a.track("agent_asked", { text: question, chars: question.length }, { hold: "agent_text" });
  a.track("two");
  await a.flush();
  assert.deepEqual(bodies.flatMap((b) => b.events.map((e: any) => e.e)), ["one", "two"], "the held event isn't sent");
  assert.deepEqual(a.events().map((e) => e.e), ["one", "two"], "nor in the log, so it can't push normal events out");
  const [held] = a.held("agent_text");
  assert.equal(held.n, 2);
  assert.ok(acceptable(held), "kept in a form the endpoint takes as it is");
  assert.equal(joined(held.p, "text"), question, "the pieces join back into the question");

  // survives a reload
  await new Promise((r) => setTimeout(r, 3100)); // the first instance's write, a moment later
  const reloaded = createAnalytics({ game: "test", endpoint: "https://x", key: "t", build: "b1", platform: "web", storage, send: async (_u, body) => (bodies.push(JSON.parse(body)), true) });
  assert.equal(reloaded.held("agent_text").length, 1);

  assert.equal(reloaded.release("agent_text"), 1);
  await reloaded.flush();
  const sent = bodies.at(-1).events.find((e: any) => e.e === "agent_asked");
  assert.deepEqual([sent.n, sent.t], [held.n, held.t], "released with its own number and time");
  assert.equal(check(JSON.stringify(bodies.at(-1)), new Set(["test"]), Date.now()).status, 200, "the endpoint takes the released batch");
  assert.equal(reloaded.held("agent_text").length, 0);
});

test("release waits while sharing is off; discard deletes unsent", () => {
  const { a } = setup();
  a.track("agent_asked", { text: "hi" }, { hold: "agent_text" });
  a.setSharing(false);
  assert.equal(a.release("agent_text"), 0);
  assert.equal(a.held("agent_text").length, 1, "still held");
  a.discard("agent_text");
  assert.equal(a.held("agent_text").length, 0);
});
