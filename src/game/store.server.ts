import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync, statSync, readdirSync, utimesSync, existsSync } from 'node:fs';
import path from 'node:path';
import { withSaveLock, SaveLockBusy } from './lock.server.ts';
import { isQuarterOutcome } from './outcome.ts';
import type { GameSave } from './types';
import { compareQuarters, isQuarterId, isQuarterName, nextQuarter, playableQuarters, quarterAt, quarterMonths, quarterNumber, type QuarterId } from './quarters.ts';
import { LATER_KEYS } from './later-discoveries.ts';
import { alertsSeenOf, currentQuarter } from './progress.ts';
import { isAlmaLog } from '../alma/record.ts';
import { EVIDENCE_KEYS, MAX_EVIDENCE_SCOPES, discoveriesFromBuckets, q2DiscoveriesFromBuckets, witnessScopes } from './discovery-evidence.ts';

const ID = /^[A-Za-z0-9_-]{43}$/;
const MAX_BYTES = 16 * 1024 * 1024;
/**
 * Version 1 kept the one quarter's result beside the save (`completion`), apart from its sales.
 * Version 2 keeps each result with its quarter. Converted on read and written as version 2 by
 * the next write. The game always wrote a v1 quarter and its result together, so any other
 * pairing is left as v1 to fail validation.
 */
function upgrade(save: unknown): unknown {
  if (typeof save !== 'object' || save === null || (save as { version?: unknown }).version !== 1) return save;
  const { completion, played, ...rest } = save as Record<string, unknown>;
  if (!Array.isArray(played) || played.length !== (completion === undefined ? 0 : 1)) return save;
  return { ...rest, version: 2, played: played.map(quarter => ({ ...quarter, ...(completion as object) })) };
}
export function isSaveId(value: string): boolean { return ID.test(value); }
export class SaveError extends Error {
  readonly code: 'MISSING_SAVE' | 'INVALID_SAVE' | 'SAVE_BUSY' | 'STALE_SAVE' | 'SAVE_CAPACITY' | 'REPLAY_MISMATCH';
  constructor(code: SaveError['code']) { super(code); this.code = code; }
}
function validEvidence(value: unknown): value is Record<string, string[]> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length <= MAX_EVIDENCE_SCOPES && Object.entries(value).every(([scope, keys]) =>
      /^[a-f0-9]{64}$/.test(scope) && Array.isArray(keys) && keys.length <= EVIDENCE_KEYS.size
      && new Set(keys).size === keys.length && keys.every(k => EVIDENCE_KEYS.has(k)));
}
/** Later quarters' evidence: one quarter, a bounded number of scopes, each a set of fixed keys (later-discoveries.ts). */
const MAX_LATER_SCOPES = 32;
function validLaterEvidence(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { quarter, scopes } = value as { quarter?: unknown; scopes?: unknown };
  return Object.keys(value).length === 2 && isQuarterName(quarter) && typeof scopes === 'object' && scopes !== null && !Array.isArray(scopes)
    && Object.keys(scopes).length <= MAX_LATER_SCOPES && Object.entries(scopes).every(([scope, keys]) => /^[a-f0-9]{64}$/.test(scope)
      && Array.isArray(keys) && keys.length <= LATER_KEYS.size && new Set(keys).size === keys.length && keys.every(k => LATER_KEYS.has(k)));
}
function validate(save: GameSave, id: string): void {
  if (!save || save.version !== 2 || save.id !== id || !isSaveId(id)
    || !Number.isSafeInteger(save.seed) || save.seed < 0 || save.seed > 0xffffffff
    || !Number.isSafeInteger(save.revision) || save.revision < 0
    || (save.queryRevision !== undefined && (!Number.isSafeInteger(save.queryRevision) || save.queryRevision < 0 || save.queryRevision > save.revision))
    || (save.discoveryEvidence !== undefined && !validEvidence(save.discoveryEvidence))
    || (save.alertSeen !== undefined && save.alertSeen !== true)
    || (save.alertsSeen !== undefined && (!Array.isArray(save.alertsSeen) || save.alertsSeen.length > playableQuarters()
      || !save.alertsSeen.every((q, i, all) => isQuarterId(q) && (i === 0 || compareQuarters(all[i - 1]!, q) < 0))))
    || !Array.isArray(save.discoveries) || save.discoveries.length > 6
    || new Set(save.discoveries).size !== save.discoveries.length
    || !save.discoveries.every(d => ['A', 'B', 'C', 'D', 'E', 'F'].includes(d))
    || !Array.isArray(save.played) || save.played.length > playableQuarters()
    || (save.laterEvidence !== undefined && !validLaterEvidence(save.laterEvidence))
    // Alma's records reach no further than the next unplayed quarter, so none before a quarter is played.
    || (save.alma !== undefined && (!save.played.length || !isAlmaLog(save.alma, nextQuarter(save.played.at(-1)!.period))))) throw new SaveError('INVALID_SAVE');
  // Sale ids are unique across quarters, not just within one.
  const ids = new Set<string>();
  for (const [index, quarter] of save.played.entries()) {
    if (!quarter || quarter.period !== quarterAt(index) || typeof quarter.outcomeId !== 'string' || !/^[a-f0-9-]{36}$/.test(quarter.outcomeId)
      || !isQuarterOutcome(quarter.period, quarter.outcome) || quarter.outcome.quarter !== quarter.period) throw new SaveError('INVALID_SAVE');
    // Replayed lines: a hash and a count, matching the outcome's units. The replay itself is checked on read.
    if (quarter.sales === undefined) {
      const lines = quarter.lines as unknown;
      if (typeof lines !== 'object' || lines === null || Object.keys(lines).sort().join() !== 'count,hash'
        || typeof (lines as { hash: unknown }).hash !== 'string' || !/^[0-9a-f]{64}$/.test((lines as { hash: string }).hash)
        || !Number.isSafeInteger((lines as { count: unknown }).count) || (lines as { count: number }).count > 100_000
        || quarter.outcome.totals.plan.units !== (lines as { count: number }).count) throw new SaveError('INVALID_SAVE');
      continue;
    }
    if (quarter.lines !== undefined || !Array.isArray(quarter.sales) || quarter.sales.length > 100_000
      || quarter.outcome.totals.plan.units !== quarter.sales.length) throw new SaveError('INVALID_SAVE');
    const months = quarterMonths(quarter.period); const number = quarterNumber(quarter.period);
    for (const sale of quarter.sales) {
      const date = new Date(sale.date + 'T00:00:00Z');
      if (typeof sale.date !== 'string' || !months.includes(sale.date.slice(0, 7)) || !/^\d{4}-\d{2}-[0-3]\d$/.test(sale.date)
        || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== sale.date
        || sale.quarter !== number || !Number.isFinite(sale.discount) || sale.discount < 0 || sale.discount > 1
        || !Number.isSafeInteger(sale.sourceRow) || sale.sourceRow < 0
        || ![sale.id, sale.isbn, sale.orderId, sale.itemId, sale.sourceSheet].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)
        || ids.has(sale.id)) throw new SaveError('INVALID_SAVE');
      ids.add(sale.id);
    }
  }
}
export const SAVE_LIMITS = { count: 200, bytes: 256 * 1024 * 1024, idleMs: 30 * 24 * 60 * 60 * 1000 } as const;
interface StoreOptions { maxCount?: number; maxBytes?: number; idleMs?: number; now?: () => number }
/** Disk-backed LRU and budget; a directory lock serializes admission across processes. */
export function createSaveStore(directory: string, options: StoreOptions = {}) {
  const maxCount = options.maxCount ?? SAVE_LIMITS.count;
  const maxBytes = options.maxBytes ?? SAVE_LIMITS.bytes;
  const idleMs = options.idleMs ?? SAVE_LIMITS.idleMs;
  const now = options.now ?? Date.now;
  if (![maxCount, maxBytes, idleMs].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid save budget');
  const file = (id: string) => { if (!isSaveId(id)) throw new SaveError('MISSING_SAVE'); return path.join(directory, id + '.json'); };
  const remove = (target: string) => { try { unlinkSync(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } };
  let assertOwned = () => {};
  const locked = <T>(operation: () => T): T => {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      return withSaveLock(directory, check => {
        const previous = assertOwned; assertOwned = check;
        try { return operation(); } finally { assertOwned = previous; }
      });
    } catch (error) { if (error instanceof SaveLockBusy) throw new SaveError('SAVE_BUSY'); throw error; }
  };
  const touch = (target: string) => { assertOwned(); const time = new Date(now()); utimesSync(target, time, time); };
  // mtime is the durable last-used time, including reads. It survives process restarts.
  const inventory = (protectedId?: string) => {
    const entries: { id: string; target: string; bytes: number; touched: number; locked: boolean }[] = [];
    for (const name of readdirSync(directory)) {
      // Atomic-write leftovers are safe to remove while holding the directory lock.
      if (/^[A-Za-z0-9_-]{43}\.json\.[a-f0-9]{16}\.tmp$/.test(name)) { remove(path.join(directory, name)); continue; }
      if (!/^[A-Za-z0-9_-]{43}\.json$/.test(name)) continue;
      const id = name.slice(0, -5); const target = file(id); const stat = statSync(target);
      const busy = existsSync(target + '.lock');
      if (id !== protectedId && !busy && now() - stat.mtimeMs >= idleMs) { assertOwned(); unlinkSync(target); continue; }
      entries.push({ id, target, bytes: stat.size, touched: stat.mtimeMs, locked: busy });
    }
    return entries;
  };
  const makeRoom = (extraCount: number, extraBytes: number, protectedId?: string) => {
    const entries = inventory(protectedId);
    let count = entries.length + extraCount;
    let bytes = entries.reduce((sum, entry) => sum + entry.bytes, extraBytes);
    const victims = entries.filter(e => e.id !== protectedId && !e.locked).sort((a, b) => a.touched - b.touched || a.id.localeCompare(b.id));
    const evict: typeof victims = [];
    while (count > maxCount || bytes > maxBytes) {
      const victim = victims.shift();
      if (!victim) throw new SaveError('SAVE_CAPACITY');
      evict.push(victim); count--; bytes -= victim.bytes;
    }
    for (const victim of evict) { assertOwned(); unlinkSync(victim.target); }
  };
  const readUnlocked = (id: string): GameSave => {
    const target = file(id);
    try {
      const stat = statSync(target);
      if (now() - stat.mtimeMs >= idleMs && !existsSync(target + '.lock')) { assertOwned(); unlinkSync(target); throw new SaveError('MISSING_SAVE'); }
      if (stat.size > MAX_BYTES) throw new SaveError('INVALID_SAVE');
      const save = upgrade(JSON.parse(readFileSync(target, 'utf8'))) as GameSave;
      validate(save, id); return save;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new SaveError('MISSING_SAVE');
      if (error instanceof SyntaxError) throw new SaveError('INVALID_SAVE');
      throw error;
    }
  };
  const encode = (save: GameSave) => {
    validate(save, save.id); const json = JSON.stringify(save);
    if (Buffer.byteLength(json) > MAX_BYTES) throw new SaveError('INVALID_SAVE');
    return json;
  };
  const publish = (id: string, save: GameSave): GameSave => {
    const target = file(id);
    assertOwned();
    const json = encode(save);
    // Reserve the full temporary file, not just growth, to bound peak bytes too.
    makeRoom(0, Buffer.byteLength(json), id);
    const temporary = target + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      assertOwned();
      writeFileSync(temporary, json, { flag: 'wx', mode: 0o600 }); touch(temporary);
      assertOwned();
      renameSync(temporary, target); return save;
    } finally { remove(temporary); }
  };
  return {
    read(id: string): GameSave {
      file(id);
      return locked(() => { const save = readUnlocked(id); makeRoom(0, 0, id); touch(file(id)); return save; });
    },
    create(): GameSave {
      return locked(() => {
        const save: GameSave = { version: 2, id: randomBytes(32).toString('base64url'), seed: randomBytes(4).readUInt32LE(), revision: 0, queryRevision: 0, discoveries: [], played: [] };
        const json = encode(save); makeRoom(1, Buffer.byteLength(json));
        assertOwned();
        writeFileSync(file(save.id), json, { flag: 'wx', mode: 0o600 }); touch(file(save.id));
        return save;
      });
    },
    /** Merge only allowlisted evidence under the same lock; never change the query grant. */
    recordEvidence(id: string, queryRevision: number, evidence: Record<string, string[]>, quarter: QuarterId = '2194-Q1') {
      if (!validEvidence(evidence)) throw new SaveError('INVALID_SAVE');
      return locked(() => {
        if (existsSync(file(id) + '.lock')) throw new SaveError('SAVE_BUSY');
        const save = readUnlocked(id);
        const before = [...save.discoveries]; const oldEvidence = structuredClone(save.discoveryEvidence ?? {});
        // Only the quarter still being planned gathers evidence: a view from before its plan can't add after it.
        if (currentQuarter(save) !== quarter || (save.queryRevision ?? save.revision) !== queryRevision) return { save, before, oldEvidence };
        const merged = structuredClone(oldEvidence);
        for (const [scope, keys] of Object.entries(evidence)) {
          const combined = [...new Set([...(merged[scope] ?? []), ...keys])].sort();
          delete merged[scope]; merged[scope] = combined;
        }
        // Parts are independent (A1/A2, D's busy and quiet picks): retain a completed witness for
        // each even if many later partial scopes arrive before the other part is found.
        const witnesses = witnessScopes(merged);
        while (Object.keys(merged).length > MAX_EVIDENCE_SCOPES) delete merged[Object.keys(merged).find(k => !witnesses.has(k))!];
        if (Object.keys(merged).length === Object.keys(oldEvidence).length && Object.entries(merged).every(([scope, keys]) => JSON.stringify(keys) === JSON.stringify(oldEvidence[scope]))) return { save, before, oldEvidence };
        save.queryRevision = save.queryRevision ?? save.revision;
        save.revision++;
        save.discoveryEvidence = merged;
        save.discoveries = [...new Set([...before, ...discoveriesFromBuckets(merged), ...q2DiscoveriesFromBuckets(merged)])].sort();
        return { save: publish(id, save), before, oldEvidence };
      });
    },
    /**
     * Evidence for a quarter from Q3 on, while it's the one being planned (as recordEvidence, for A to F). A new
     * quarter's replaces the last's. The oldest scopes go past the bound, keeping any that already find something.
     */
    recordLaterEvidence(id: string, queryRevision: number, quarter: QuarterId, evidence: Record<string, string[]>) {
      if (!validLaterEvidence({ quarter, scopes: evidence })) throw new SaveError('INVALID_SAVE');
      return locked(() => {
        if (existsSync(file(id) + '.lock')) throw new SaveError('SAVE_BUSY');
        const save = readUnlocked(id);
        const old = save.laterEvidence?.quarter === quarter ? save.laterEvidence.scopes : {};
        if (currentQuarter(save) !== quarter || (save.queryRevision ?? save.revision) !== queryRevision) return { save, old };
        const merged: Record<string, string[]> = structuredClone(old);
        for (const [scope, keys] of Object.entries(evidence)) {
          const combined = [...new Set([...(merged[scope] ?? []), ...keys])].sort();
          delete merged[scope]; merged[scope] = combined;
        }
        const finds = (keys: string[]) => keys.includes('event') || keys.includes('weakest') || (keys.includes('r:last') && keys.includes('r:year'));
        while (Object.keys(merged).length > MAX_LATER_SCOPES) delete merged[Object.keys(merged).find(k => !finds(merged[k]!)) ?? Object.keys(merged)[0]!];
        if (JSON.stringify(merged) === JSON.stringify(old) && save.laterEvidence?.quarter === quarter) return { save, old };
        save.queryRevision = save.queryRevision ?? save.revision;
        save.revision++;
        save.laterEvidence = { quarter, scopes: merged };
        return { save: publish(id, save), old };
      });
    },
    /** Record that the current quarter's memo was seen. Not query data, so it never changes the query grant; idempotent. */
    markAlertSeen(id: string): GameSave {
      return locked(() => {
        if (existsSync(file(id) + '.lock')) throw new SaveError('SAVE_BUSY');
        const save = readUnlocked(id);
        const quarter = currentQuarter(save); const seen = alertsSeenOf(save);
        if (!quarter || seen.includes(quarter)) return save;
        save.queryRevision = save.queryRevision ?? save.revision;
        save.revision++;
        // One list from here on; the old Q1 flag folds into it.
        delete save.alertSeen;
        save.alertsSeen = [...new Set([...seen, quarter])].filter(isQuarterId).sort(compareQuarters);
        return publish(id, save);
      });
    },
    update(id: string, revision: number, change: (save: GameSave) => void): GameSave {
      const target = file(id);
      return locked(() => {
        if (existsSync(target + '.lock')) throw new SaveError('SAVE_BUSY');
        const save = readUnlocked(id);
        if (save.revision !== revision) throw new SaveError('STALE_SAVE');
        const queryRevision = save.queryRevision ?? save.revision;
        change(save); save.revision = revision + 1; save.queryRevision = queryRevision + 1;
        if (save.id !== id) throw new SaveError('INVALID_SAVE');
        return publish(id, save);
      });
    },
  };
}
