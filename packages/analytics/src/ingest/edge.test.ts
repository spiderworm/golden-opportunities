import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handler = new Function(`${readFileSync(new URL("./edge.js", import.meta.url), "utf8")}; return handler;`)();
const req = (method: string, uri = "/", headers: Record<string, string> = {}) => ({
  request: { method, uri, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, { value: v }])) },
});
const HASH = "a".repeat(64);

test("a signed POST goes through to the function", () => {
  const r = req("POST", "/", { "x-amz-content-sha256": HASH });
  assert.equal(handler(r), r.request);
});

test("the preflight is answered at the edge", () => {
  const out = handler(req("OPTIONS"));
  assert.equal(out.statusCode, 204);
  assert.match(out.headers["access-control-allow-headers"].value, /x-amz-content-sha256/);
});

test("anything else stops at the edge", () => {
  assert.equal(handler(req("GET")).statusCode, 405);
  assert.equal(handler(req("POST", "/other", { "x-amz-content-sha256": HASH })).statusCode, 405);
  assert.equal(handler(req("POST")).statusCode, 400);
  assert.equal(handler(req("POST", "/", { "x-amz-content-sha256": "nope" })).statusCode, 400);
});
