import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, utimesSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { withSaveLock, SaveLockBusy, LOCK_LEASE_MS } from './lock.server';
import { createSaveStore } from './store.server';
const directories: string[] = [];
const fixture = () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'save-lock-')); directories.push(dir); return dir; };
const leaveLock = (dir: string, pid: number, timestamp: number) => {
  mkdirSync(path.join(dir, '.store.lock'));
  writeFileSync(path.join(dir, '.store.lock', 'a'.repeat(32) + '.json'), JSON.stringify({ pid, timestamp }));
};
afterEach(() => { vi.useRealTimers(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it('recovers a newly orphaned lock from a real dead process', () => {
  const dir = fixture();
  const pid = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }));
  expect(() => process.kill(pid, 0)).toThrow();
  leaveLock(dir, pid, Date.now());
  const store = createSaveStore(dir); const save = store.create();
  expect(store.read(save.id)).toEqual(save);
  expect(store.update(save.id, 0, s => { s.discoveries.push('A'); }).revision).toBe(1);
  expect(existsSync(path.join(dir, '.store.lock'))).toBe(false);
});
it('recovers an expired lease even if the recorded pid is alive', () => {
  const dir = fixture(); leaveLock(dir, process.pid, Date.now() - LOCK_LEASE_MS - 1);
  const store = createSaveStore(dir); expect(store.create().revision).toBe(0);
});
it('rejects a live unexpired owner and records pid and timestamp', () => {
  const dir = fixture();
  withSaveLock(dir, () => {
    const [name] = readdirSync(path.join(dir, '.store.lock'));
    expect(JSON.parse(readFileSync(path.join(dir, '.store.lock', name), 'utf8'))).toEqual({ pid: process.pid, timestamp: expect.any(Number) });
    expect(() => withSaveLock(dir, () => {})).toThrow(SaveLockBusy);
  });
});
it('fences a paused owner and prevents its cleanup from releasing a successor', () => {
  const dir = fixture(); vi.useFakeTimers(); vi.setSystemTime(new Date());
  withSaveLock(dir, checkOld => {
    vi.setSystemTime(Date.now() + LOCK_LEASE_MS + 1);
    withSaveLock(dir, checkNew => {
      expect(checkOld).toThrow(SaveLockBusy);
      expect(checkNew).not.toThrow();
    });
  });
  expect(existsSync(path.join(dir, '.store.lock'))).toBe(false);
});
it('does not publish an update after its lease expires', () => {
  const dir = fixture(); const store = createSaveStore(dir); const save = store.create();
  vi.useFakeTimers(); vi.setSystemTime(new Date());
  expect(() => store.update(save.id, 0, s => {
    s.discoveries.push('B'); vi.setSystemTime(Date.now() + LOCK_LEASE_MS + 1);
  })).toThrow('SAVE_BUSY');
  expect(store.read(save.id)).toEqual(save);
});
it('recovers old legacy empty files and crashed initialization directories', () => {
  const dir = fixture(); const lock = path.join(dir, '.store.lock');
  writeFileSync(lock, ''); const old = new Date(Date.now() - LOCK_LEASE_MS - 1); utimesSync(lock, old, old);
  withSaveLock(dir, () => {});
  mkdirSync(lock); utimesSync(lock, old, old);
  withSaveLock(dir, () => {});
});

it('does not remove a successor lock when the original owner finally unwinds', () => {
  const dir = fixture(); const lock = path.join(dir, '.store.lock');
  withSaveLock(dir, () => {
    rmSync(lock, { recursive: true });
    leaveLock(dir, process.pid, Date.now());
  });
  expect(readdirSync(lock)).toEqual(['a'.repeat(32) + '.json']);
});
