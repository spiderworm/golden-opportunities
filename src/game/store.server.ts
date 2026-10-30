import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import type { GameSave } from './types';

const ID = /^[A-Za-z0-9_-]{43}$/;
const MAX_BYTES = 16 * 1024 * 1024;
export function isSaveId(value: string): boolean { return ID.test(value); }
export class SaveError extends Error {
  readonly code: 'MISSING_SAVE' | 'INVALID_SAVE' | 'SAVE_BUSY' | 'STALE_SAVE';
  constructor(code: SaveError['code']) { super(code); this.code = code; }
}
function validate(save: GameSave, id: string): void {
  if (!save || save.version !== 1 || save.id !== id || !isSaveId(id)
    || !Number.isSafeInteger(save.seed) || save.seed < 0 || save.seed > 0xffffffff
    || !Number.isSafeInteger(save.revision) || save.revision < 0
    || !Array.isArray(save.discoveries) || save.discoveries.length > 3
    || new Set(save.discoveries).size !== save.discoveries.length
    || !save.discoveries.every(d => ['A', 'B', 'C'].includes(d))
    || !Array.isArray(save.played) || save.played.length > 1) throw new SaveError('INVALID_SAVE');
  for (const quarter of save.played) {
    if (quarter.period !== '2194-Q1' || !Array.isArray(quarter.sales) || quarter.sales.length > 100_000) throw new SaveError('INVALID_SAVE');
    const ids = new Set<string>();
    for (const sale of quarter.sales) {
      const date = new Date(sale.date + 'T00:00:00Z');
      if (!/^2194-0[1-3]-[0-3]\d$/.test(sale.date) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== sale.date
        || sale.quarter !== 1 || !Number.isFinite(sale.discount) || sale.discount < 0 || sale.discount > 1
        || !Number.isSafeInteger(sale.sourceRow) || sale.sourceRow < 0
        || ![sale.id, sale.isbn, sale.orderId, sale.itemId, sale.sourceSheet].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)
        || ids.has(sale.id)) throw new SaveError('INVALID_SAVE');
      ids.add(sale.id);
    }
  }
}
/** Local single-machine storage. Atomic rename and an exclusive update lock protect readers and competing writers. */
export function createSaveStore(directory: string) {
  const file = (id: string) => { if (!isSaveId(id)) throw new SaveError('MISSING_SAVE'); return path.join(directory, id + '.json'); };
  const read = (id: string): GameSave => {
    const target = file(id);
    try {
      if (statSync(target).size > MAX_BYTES) throw new SaveError('INVALID_SAVE');
      const save = JSON.parse(readFileSync(target, 'utf8')) as GameSave;
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
  return {
    read,
    create(): GameSave {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const save: GameSave = { version: 1, id: randomBytes(32).toString('base64url'), seed: randomBytes(4).readUInt32LE(), revision: 0, discoveries: [], played: [] };
      writeFileSync(file(save.id), encode(save), { flag: 'wx', mode: 0o600 });
      return save;
    },
    update(id: string, revision: number, change: (save: GameSave) => void): GameSave {
      const target = file(id); const lock = target + '.lock';
      try { writeFileSync(lock, '', { flag: 'wx', mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new SaveError('SAVE_BUSY'); throw error; }
      const temporary = target + '.' + randomBytes(8).toString('hex') + '.tmp';
      try {
        const save = read(id);
        if (save.revision !== revision) throw new SaveError('STALE_SAVE');
        change(save); save.revision = revision + 1;
        if (save.id !== id) throw new SaveError('INVALID_SAVE');
        writeFileSync(temporary, encode(save), { flag: 'wx', mode: 0o600 });
        renameSync(temporary, target); return save;
      } finally {
        try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        unlinkSync(lock);
      }
    },
  };
}
