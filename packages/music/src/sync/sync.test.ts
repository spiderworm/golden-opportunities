import { test } from "node:test";
import assert from "node:assert/strict";
import { createSync } from "./sync.ts";
import { fakeBrowser } from "./fake-browser.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));
const place = { played: [], ahead: [], pinned: [], round: [], rounds: 0 };
const music = (id: string, t = 0) => ({ id, place, t, at: Date.now(), running: true, paused: false, held: false });

test("an app's tabs share the music, and a tab opened later is told it", async () => {
  const b = fakeBrowser();
  const one = b.tab();
  const two = b.tab();
  const got: string[] = [];
  two.onShared((s) => got.push(s.id!));
  await tick();
  one.share(music("x"));
  await tick();
  assert.deepEqual(got, ["x"]);
  const three = b.tab();
  await tick();
  assert.equal(three.latest()?.id, "x");
  assert.ok(three.together());
});

test("the tab heard is the visible one used last; with none in sight, the last used that may play out of sight", async () => {
  const b = fakeBrowser();
  const one = b.tab();
  const two = b.tab();
  one.stand({ at: 1, visible: true, behind: false });
  two.stand({ at: 2, visible: true, behind: false });
  await tick();
  assert.equal(two.chosen(), true);
  assert.equal(one.chosen(), false);
  two.stand({ visible: false });
  await tick();
  assert.equal(one.chosen(), true);
  one.stand({ visible: false });
  await tick();
  assert.equal(one.chosen() || two.chosen(), false); // none may play out of sight
  one.stand({ behind: true });
  two.stand({ behind: true });
  await tick();
  assert.equal(two.chosen(), true);
});

test("a tab that's heard tells the one heard before, which stops", async () => {
  const b = fakeBrowser();
  const one = b.tab();
  const two = b.tab();
  let stopped = 0;
  one.onTook(() => stopped++);
  await tick();
  one.heard(true);
  await tick();
  assert.ok(two.heardHere());
  two.heard(true);
  await tick();
  assert.equal(stopped, 1);
});

test("another app playing is known, and stops when this app's player plays", async () => {
  const b = fakeBrowser();
  const pizza = b.tab("pizza");
  const books = b.tab("orbital-books");
  let asked = "";
  pizza.onStopAsked((from) => {
    asked = from;
    pizza.heard(false);
    pizza.stopped(from);
  });
  pizza.heard(true);
  await tick();
  assert.equal(books.elsewhere(), true);
  assert.equal(await books.stopOthers(), true);
  assert.equal(asked, "orbital-books");
  assert.equal(books.elsewhere(), false);
});

test("an app that doesn't answer keeps playing, and the asking app is told", async () => {
  const b = fakeBrowser();
  const deaf = b.tab("pizza", { deaf: true }); // an older build: no channel
  const books = b.tab("orbital-books");
  deaf.heard(true);
  await tick();
  assert.equal(await books.stopOthers(), false);
});

test("a tab that closes or crashes is forgotten, by its lock", async () => {
  const b = fakeBrowser();
  const one = b.tab();
  const two = b.tab();
  one.stand({ at: 1 });
  two.stand({ at: 2 });
  await tick();
  assert.equal(one.chosen(), false);
  b.crash(two.tab);
  await tick();
  await one.stopOthers(); // asks the locks
  assert.equal(one.chosen(), true);
});

test("without Web Locks, nothing is known: it just plays", () => {
  const s = createSync("a", { locks: null });
  assert.equal(s.elsewhere(), false);
  assert.equal(s.chosen(), true);
  s.dispose();
});
