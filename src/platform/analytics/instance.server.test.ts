import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { instanceId } from "./instance.server";

const dirs: string[] = [];
const fresh = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "orbital-instance-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

test("an instance ID is made once and kept", () => {
  const dir = fresh();
  const first = instanceId(dir);
  expect(first).toMatch(/^[0-9a-f-]{36}$/);
  expect(instanceId(dir)).toBe(first);
  expect(JSON.parse(readFileSync(path.join(dir, "instance.json"), "utf8")).id).toBe(first);
});

test("each copy of the app gets its own", () => {
  expect(instanceId(fresh())).not.toBe(instanceId(fresh()));
});
