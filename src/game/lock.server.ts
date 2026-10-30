import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import path from 'node:path';

export const LOCK_LEASE_MS = 30_000;
export class SaveLockBusy extends Error {}
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
function dead(pid: number): boolean {
  try { process.kill(pid, 0); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
}
function recover(lock: string): void {
  try {
    const stat = statSync(lock);
    // Upgrade the former empty lock-file format. unlink cannot remove a new lock directory.
    if (!stat.isDirectory()) {
      if (Date.now() - stat.mtimeMs >= LOCK_LEASE_MS) unlinkSync(lock);
      return;
    }
    const entries = readdirSync(lock);
    if (entries.length === 0) {
      if (Date.now() - stat.mtimeMs >= LOCK_LEASE_MS) rmdirSync(lock);
      return;
    }
    if (entries.length !== 1 || !/^[a-f0-9]{32}\.json$/.test(entries[0])) return;
    const ownerFile = path.join(lock, entries[0]);
    let stale = Date.now() - statSync(ownerFile).mtimeMs >= LOCK_LEASE_MS;
    try {
      const owner = JSON.parse(readFileSync(ownerFile, 'utf8')) as { pid: number; timestamp: number };
      if (Number.isSafeInteger(owner.pid) && owner.pid > 0 && Number.isFinite(owner.timestamp)) {
        stale = dead(owner.pid) || Date.now() - owner.timestamp >= LOCK_LEASE_MS;
      }
    } catch (error) { if (missing(error)) return; }
    if (!stale) return;
    // Only one contender can unlink this unique owner's marker. Losers must not rmdir.
    unlinkSync(ownerFile);
    rmdirSync(lock);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'EISDIR', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
}
/** Exclusive expiring lease. A unique marker prevents an old owner releasing a new owner's lock. */
export function withSaveLock<T>(directory: string, operation: (assertOwned: () => void) => T): T {
  const lock = path.join(directory, '.store.lock');
  const ownerFile = path.join(lock, randomBytes(16).toString('hex') + '.json');
  const timestamp = Date.now();
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    recover(lock);
    try { mkdirSync(lock, { mode: 0o700 }); }
    catch (retry) { if ((retry as NodeJS.ErrnoException).code === 'EEXIST') throw new SaveLockBusy(); throw retry; }
  }
  try { writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, timestamp }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (missing(error)) throw new SaveLockBusy(); throw error; }
  const assertOwned = () => {
    if (Date.now() - timestamp >= LOCK_LEASE_MS || !existsSync(ownerFile)) throw new SaveLockBusy();
    // A delayed initializer must not join a successor's lock directory.
    const markers = readdirSync(lock);
    if (markers.length !== 1 || markers[0] !== path.basename(ownerFile)) throw new SaveLockBusy();
  };
  try { assertOwned(); return operation(assertOwned); }
  finally {
    let released = false;
    try { unlinkSync(ownerFile); released = true; } catch (error) { if (!missing(error)) throw error; }
    // Never remove a successor's nonempty directory; absent owner means ownership was lost.
    try { if (released) rmdirSync(lock); } catch (error) { if (!missing(error) && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error; }
  }
}
