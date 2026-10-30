import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import path from 'node:path';

export class SaveLockBusy extends Error {}
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
/** null means proven absent. Permission/inspection failures fail closed, never mean dead. */
export function processStart(pid: number): string | null {
  try { process.kill(pid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return null; throw new SaveLockBusy(); }
  try {
    const start = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8', timeout: 2000, maxBuffer: 4096, env: { ...process.env, LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (start) return start;
  } catch { /* Check for exit during inspection below. */ }
  try { process.kill(pid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return null; }
  throw new SaveLockBusy();
}
let ownStart: string | undefined;
function ownerGone(ownerFile: string): boolean {
  let owner: { pid?: unknown; start?: unknown };
  try { owner = JSON.parse(readFileSync(ownerFile, 'utf8')); }
  catch { return false; }
  if (!owner || !Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0) return false;
  const actual = processStart(Number(owner.pid));
  return actual === null || (typeof owner.start === 'string' && owner.start.length > 0 && actual !== owner.start);
}
function recover(lock: string): void {
  try {
    const entries = readdirSync(lock);
    // No timeout-based recovery, including unverifiable legacy empty locks.
    if (entries.length !== 1 || !/^[a-f0-9]{32}\.json$/.test(entries[0])) return;
    const ownerFile = path.join(lock, entries[0]);
    if (!ownerGone(ownerFile)) return;
    // Only one contender can unlink this dead owner's unique marker.
    unlinkSync(ownerFile);
    rmdirSync(lock);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
}
/** Publish a complete owner directory atomically; never steal from a process that can resume. */
export function withSaveLock<T>(directory: string, operation: (assertOwned: () => void) => T): T {
  ownStart ??= processStart(process.pid) ?? undefined;
  if (!ownStart) throw new SaveLockBusy();
  const token = randomBytes(16).toString('hex');
  const lock = path.join(directory, '.store.lock');
  const candidate = path.join(directory, `.store-owner-${process.pid}-${token}`);
  const marker = token + '.json';
  const ownerFile = path.join(lock, marker);
  mkdirSync(candidate, { mode: 0o700 });
  let acquired = false;
  try {
    writeFileSync(path.join(candidate, marker), JSON.stringify({ pid: process.pid, start: ownStart, timestamp: Date.now() }), { flag: 'wx', mode: 0o600 });
    const publish = () => {
      if (existsSync(lock)) throw new SaveLockBusy();
      try { renameSync(candidate, lock); acquired = true; }
      catch (error) {
        if (['EEXIST', 'ENOTEMPTY', 'ENOTDIR', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw new SaveLockBusy();
        throw error;
      }
    };
    try { publish(); } catch (error) {
      if (!(error instanceof SaveLockBusy)) throw error;
      recover(lock); publish();
    }
    const assertOwned = () => { if (!existsSync(ownerFile)) throw new SaveLockBusy(); };
    assertOwned();
    return operation(assertOwned);
  } finally {
    const ownDirectory = acquired ? lock : candidate;
    let released = false;
    try { unlinkSync(path.join(ownDirectory, marker)); released = true; } catch (error) { if (!missing(error)) throw error; }
    // Only remove the directory after removing our unique marker, never a successor's.
    if (released || !acquired) {
      try { rmdirSync(ownDirectory); } catch (error) { if (!missing(error) && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error; }
    }
  }
}
