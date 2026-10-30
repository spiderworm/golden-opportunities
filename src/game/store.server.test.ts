import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSaveStore } from './store.server';

const directories: string[] = [];
const fixture = () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'orbital-save-')); directories.push(dir); return { dir, store: createSaveStore(dir) }; };
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe('server save persistence', () => {
  it('survives a new store instance, isolates saves, and keeps files private', () => {
    const { store, dir } = fixture(); const a = store.create(); const b = store.create();
    store.update(a.id, 0, save => { save.discoveries.push('A'); });
    expect(createSaveStore(dir).read(a.id).discoveries).toEqual(['A']);
    expect(store.read(b.id).discoveries).toEqual([]);
    expect(statSync(path.join(dir, a.id + '.json')).mode & 0o777).toBe(0o600);
  });
  it('rejects stale and competing writes without losing the first update', () => {
    const { store, dir } = fixture(); const a = store.create();
    store.update(a.id, 0, s => { s.discoveries.push('B'); });
    expect(() => store.update(a.id, 0, () => {})).toThrow('STALE_SAVE');
    writeFileSync(path.join(dir, a.id + '.json.lock'), '');
    expect(() => store.update(a.id, 1, () => {})).toThrow('SAVE_BUSY');
    expect(store.read(a.id).discoveries).toEqual(['B']);
  });
  it('does not publish failed or invalid transactions', () => {
    const { store } = fixture(); const a = store.create();
    expect(() => store.update(a.id, 0, s => { s.discoveries.push('A'); throw Error('engine failed'); })).toThrow('engine failed');
    expect(() => store.update(a.id, 0, s => { s.seed = NaN; })).toThrow('INVALID_SAVE');
    expect(store.read(a.id)).toEqual(a);
    expect(store.update(a.id, 0, s => { s.discoveries.push('C'); }).revision).toBe(1);
  });
  it('fails closed for traversal, missing, corrupted, and future save schemas', () => {
    const { store, dir } = fixture(); const a = store.create();
    expect(() => store.read('../instance')).toThrow('MISSING_SAVE');
    expect(() => store.read('x'.repeat(43))).toThrow('MISSING_SAVE');
    writeFileSync(path.join(dir, a.id + '.json'), '{');
    expect(() => store.read(a.id)).toThrow('INVALID_SAVE');
    writeFileSync(path.join(dir, a.id + '.json'), JSON.stringify({ ...a, version: 2 }));
    expect(() => store.read(a.id)).toThrow('INVALID_SAVE');
  });
});
