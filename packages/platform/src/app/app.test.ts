import { test } from "node:test";
import assert from "node:assert/strict";
import { defineApp } from "./app.ts";
import { APPS } from "./apps.ts";

test("an app from the list: its name and older storage come with it", () => {
  const app = defineApp({ id: "waddleberg", build: "b1" });
  assert.equal(app.name, "Waddleberg");
  assert.equal(app.storagePrefix, "cubeberg");
  assert.equal(app.storageKey("music"), "cubeberg.music");
  assert.equal(app.channelName("music"), "tellim.waddleberg.music");
  assert.equal(app.home, "/");
  assert.ok(Object.isFrozen(app));
});

test("an id is a slug", () => {
  assert.throws(() => defineApp({ id: "Orbital Books" }));
});

test("an app not on the list is warned about, and still works", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const app = defineApp({ id: "not-listed" });
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(app.storagePrefix, "not-listed");
});

test("the list: ids are slugs, and no two apps keep their data under one prefix", () => {
  const prefixes = Object.entries(APPS).map(([id, a]) => ("storagePrefix" in a ? a.storagePrefix : id));
  for (const id of Object.keys(APPS)) assert.match(id, /^[a-z][a-z0-9-]*$/);
  assert.equal(new Set(prefixes).size, prefixes.length);
  // one app's prefix mustn't be another's id either: its keys would look like that app's
  for (const [id, a] of Object.entries(APPS)) if ("storagePrefix" in a) assert.ok(!(a.storagePrefix in APPS) || a.storagePrefix === id);
});
