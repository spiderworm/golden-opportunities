import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceProps } from "./device.ts";
const screen = { width: 360, height: 800, ratio: 3 };
const gl = { getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 123 }), getParameter: () => "Mali-G78" } as unknown as Parameters<typeof deviceProps>[0];
const ua = "Mozilla/5.0 (Linux; Android 16; Pixel 8 Pro Build/BP4A.123; wv) AppleWebKit/537.36";
test("WebView reports hardware categories without the full UA or build", async () => {
  assert.deepEqual(await deviceProps(gl, { userAgent: ua, deviceMemory: 8, hardwareConcurrency: 9 }, screen), {
    gpu: "Mali-G78", os: "16", model: "Pixel 8 Pro", memory: 8, cores: 9, screen: "1080x2400@3",
  });
});
test("client hints replace reduced UA placeholders and obey ingest limits", async () => {
  const p = await deviceProps({ ...gl, getParameter: () => "g".repeat(250) }, {
    userAgent: "Mozilla/5.0 (Linux; Android 10; K)",
    userAgentData: { async getHighEntropyValues(keys) {
      assert.deepEqual(keys, ["model", "platformVersion"]);
      return { model: "m".repeat(250), platform: "Android", platformVersion: "16.0.0" };
    } },
  }, screen);
  assert.equal(p.os, "16.0.0"); assert.equal(String(p.model).length, 200); assert.equal(String(p.gpu).length, 200);
  assert.ok(Object.entries(p).every(([k,v]) => k.length <= 40 && ["number", "string"].includes(typeof v)));
});
test("denied APIs omit unavailable data, including Android 10 / K placeholders", async () => {
  assert.deepEqual(await deviceProps({ ...gl, getExtension: () => { throw Error("denied"); } }, {
    userAgent: "Mozilla/5.0 (Linux; Android 10; K)", deviceMemory: NaN, hardwareConcurrency: 0,
    userAgentData: { async getHighEntropyValues() { throw Error("denied"); } },
  }, screen), { screen: "1080x2400@3" });
});
test("unsupported desktop browsers still report available fields", async () => {
  assert.deepEqual(await deviceProps({ ...gl, getExtension: () => null }, {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", hardwareConcurrency: 8,
  }, screen), { cores: 8, screen: "1080x2400@3" });
});
test("stalled hints do not lose startup telemetry", async () => {
  const p = await deviceProps(gl, { userAgent: ua, userAgentData: { getHighEntropyValues: () => new Promise(() => {}) } }, screen);
  assert.equal(p.model, "Pixel 8 Pro"); assert.equal(p.os, "16");
});

test("works on Android WebViews before Chrome 92 (no Array.prototype.at), and says which Chrome", async () => {
  const at = Array.prototype.at;
  // @ts-expect-error: as on an old WebView
  delete Array.prototype.at;
  try {
    const p = await deviceProps(gl, { userAgent: "Mozilla/5.0 (Linux; Android 9; SM-A105F Build/PPR1; wv) AppleWebKit/537.36 Chrome/91.0.4472.120 Mobile Safari/537.36" }, screen);
    assert.equal(p.model, "SM-A105F");
    assert.equal(p.os, "9");
    assert.equal(p.chrome, 91);
  } finally {
    Array.prototype.at = at;
  }
});
