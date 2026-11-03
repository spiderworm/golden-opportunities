import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  utimesSync,
  existsSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { withSaveLock, SaveLockBusy, processStart } from "./lock.server";
import { createSaveStore } from "./store.server";
const directories: string[] = [];
const fixture = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "save-lock-"));
  directories.push(dir);
  return dir;
};
const leaveLock = (dir: string, pid: number, start: string, timestamp = Date.now()) => {
  mkdirSync(path.join(dir, ".store.lock"));
  writeFileSync(
    path.join(dir, ".store.lock", "a".repeat(32) + ".json"),
    JSON.stringify({ pid, start, timestamp }),
  );
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
it("recovers a lock left by a real dead process", () => {
  const dir = fixture();
  const pid = Number(
    execFileSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], {
      encoding: "utf8",
    }),
  );
  expect(processStart(pid)).toBeNull();
  leaveLock(dir, pid, "dead process");
  const store = createSaveStore(dir);
  const save = store.create();
  expect(store.read(save.id)).toEqual(save);
  expect(
    store.update(save.id, 0, (s) => {
      s.discoveries.push("A");
    }).revision,
  ).toBe(1);
  expect(existsSync(path.join(dir, ".store.lock"))).toBe(false);
});
it("refuses an arbitrarily old lock owned by the same live process", () => {
  const dir = fixture();
  leaveLock(dir, process.pid, processStart(process.pid)!, Date.now() - 90 * 86400000);
  expect(() => createSaveStore(dir).create()).toThrow("SAVE_BUSY");
});
it("recovers when the pid has been reused by a different process start", () => {
  const dir = fixture();
  leaveLock(dir, process.pid, "Mon Jan  1 00:00:00 1990");
  expect(createSaveStore(dir).create().revision).toBe(0);
});
it("fails closed when process existence cannot be verified", () => {
  const dir = fixture();
  leaveLock(dir, process.pid, processStart(process.pid)!);
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(Error("denied"), { code: "EPERM" });
  });
  expect(() => createSaveStore(dir).create()).toThrow("SAVE_BUSY");
});
it("publishes pid and start time together and refuses competing live owners", () => {
  const dir = fixture();
  withSaveLock(dir, () => {
    const [name] = readdirSync(path.join(dir, ".store.lock"));
    expect(JSON.parse(readFileSync(path.join(dir, ".store.lock", name), "utf8"))).toEqual({
      pid: process.pid,
      start: processStart(process.pid),
      timestamp: expect.any(Number),
    });
    expect(() => withSaveLock(dir, () => {})).toThrow(SaveLockBusy);
  });
  expect(readdirSync(dir)).toEqual([]);
});
it("permits a slow live owner to finish without a lease timeout", () => {
  const dir = fixture();
  const store = createSaveStore(dir);
  const save = store.create();
  vi.useFakeTimers();
  vi.setSystemTime(new Date());
  expect(
    store.update(save.id, 0, (s) => {
      s.discoveries.push("B");
      vi.setSystemTime(Date.now() + 30_001);
    }).revision,
  ).toBe(1);
  expect(store.read(save.id).discoveries).toEqual(["B"]);
});
it("does not guess ownership of legacy empty files, directories, or malformed owners", () => {
  const dir = fixture();
  const lock = path.join(dir, ".store.lock");
  writeFileSync(lock, "");
  const old = new Date(0);
  utimesSync(lock, old, old);
  expect(() => withSaveLock(dir, () => {})).toThrow(SaveLockBusy);
  rmSync(lock);
  mkdirSync(lock);
  utimesSync(lock, old, old);
  expect(() => withSaveLock(dir, () => {})).toThrow(SaveLockBusy);
  writeFileSync(path.join(lock, "a".repeat(32) + ".json"), "{}");
  expect(() => withSaveLock(dir, () => {})).toThrow(SaveLockBusy);
});
it("does not remove a successor marker when the original owner finally unwinds", () => {
  const dir = fixture();
  const lock = path.join(dir, ".store.lock");
  withSaveLock(dir, () => {
    rmSync(lock, { recursive: true });
    leaveLock(dir, process.pid, processStart(process.pid)!);
  });
  expect(readdirSync(lock)).toEqual(["a".repeat(32) + ".json"]);
});
