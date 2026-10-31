import { test } from "node:test";
import assert from "node:assert/strict";
import { defineApp } from "../app/app.ts";
import { createPresence } from "./presence.ts";

// one browser's BroadcastChannels
function host() {
  const channels = new Set<{ onmessage: ((e: MessageEvent) => void) | null }>();
  return () => {
    const c = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      postMessage(data: unknown) {
        for (const other of channels) if (other !== c) queueMicrotask(() => other.onmessage?.({ data } as MessageEvent));
      },
      close: () => void channels.delete(c),
    };
    channels.add(c);
    return c;
  };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test("tabs know each other, this app's and others', and a closing tab goes", async () => {
  const channel = host();
  const pizza = defineApp({ id: "pizza", home: "/pizza/" });
  const one = createPresence(pizza, { channel, tab: "1" });
  const two = createPresence(pizza, { channel, tab: "2" });
  const other = createPresence(defineApp({ id: "waddleberg", home: "/cubeberg/" }), { channel, tab: "3" });
  await tick();
  assert.deepEqual(one.mine().map((p) => p.tab), ["2"]);
  assert.deepEqual(one.peers().map((p) => p.tab).sort(), ["2", "3"]);
  assert.deepEqual(other.mine(), []);
  two.dispose();
  await tick();
  assert.deepEqual(one.mine(), []);
});

test("two apps claiming one id are told of", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const channel = host();
  createPresence(defineApp({ id: "pizza", home: "/pizza/" }), { channel, tab: "1" });
  createPresence(defineApp({ id: "pizza", home: "/slice/" }), { channel, tab: "2" });
  await tick();
  assert.ok(warn.mock.callCount() >= 1);
  assert.match(String(warn.mock.calls[0]!.arguments[0]), /two apps can't share an id/);
});
