import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, statSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
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


describe('persistent save storage budget', () => {
  it('evicts least recently read saves at the count limit across restarts', () => {
    const { dir } = fixture(); let now = 1000;
    const options = { maxCount: 2, now: () => now };
    const store = createSaveStore(dir, options);
    const a = store.create(); now++; const b = store.create();
    now++; store.read(a.id); now++;
    const restarted = createSaveStore(dir, options); const c = restarted.create();
    expect(restarted.read(a.id).id).toBe(a.id);
    expect(() => restarted.read(b.id)).toThrow('MISSING_SAVE');
    expect(restarted.read(c.id).id).toBe(c.id);
    expect(readdirSync(dir).filter(f => f.endsWith('.json'))).toHaveLength(2);
  });
  it('expires untouched saves after 30 days, including direct reads of an expired save', () => {
    const { dir } = fixture(); let now = 1000;
    const store = createSaveStore(dir, { now: () => now });
    const a = store.create(); const b = store.create();
    now += 29 * 86400000; store.read(b.id);
    now += 86400000;
    expect(() => store.read(a.id)).toThrow('MISSING_SAVE');
    expect(store.read(b.id).id).toBe(b.id);
    const c = store.create(); now += 31 * 86400000;
    store.create();
    expect(existsSync(path.join(dir, b.id + '.json'))).toBe(false);
    expect(existsSync(path.join(dir, c.id + '.json'))).toBe(false);
  });
  it('caps aggregate bytes and protects the requester during an update', () => {
    const { dir } = fixture(); let now = 1000;
    const a = createSaveStore(dir, { now: () => now }).create();
    const maxBytes = Buffer.byteLength(JSON.stringify({ ...a, seed: 0xffffffff })) * 3 + 8;
    const store = createSaveStore(dir, { maxBytes, now: () => now });
    now++; const b = store.create(); now++; const c = store.create();
    // A is oldest but must survive the admission of its replacement file.
    now++; store.update(a.id, 0, s => { s.discoveries.push('A'); });
    expect(store.read(a.id).discoveries).toEqual(['A']);
    expect(() => store.read(b.id)).toThrow('MISSING_SAVE');
    expect(store.read(c.id).id).toBe(c.id);
    for (let i = 0; i < 10; i++) { now++; store.create(); }
    const bytes = readdirSync(dir).reduce((sum, f) => sum + statSync(path.join(dir, f)).size, 0);
    expect(bytes).toBeLessThanOrEqual(maxBytes);
  });
  it('fails closed without deleting the requester when its write cannot fit', () => {
    const { dir } = fixture(); const store = createSaveStore(dir); const a = store.create();
    const bytes = statSync(path.join(dir, a.id + '.json')).size;
    const small = createSaveStore(dir, { maxBytes: bytes + 5 });
    expect(() => small.update(a.id, 0, s => { s.discoveries.push('A'); })).toThrow('SAVE_CAPACITY');
    expect(store.read(a.id)).toEqual(a);
    expect(readdirSync(dir)).toEqual([a.id + '.json']);
  });
  it('does not evict locked saves and serializes budget admission across store instances', () => {
    const { dir } = fixture(); const store = createSaveStore(dir, { maxCount: 1 }); const a = store.create();
    writeFileSync(path.join(dir, a.id + '.json.lock'), '');
    expect(() => store.create()).toThrow('SAVE_CAPACITY');
    expect(store.read(a.id)).toEqual(a);
    writeFileSync(path.join(dir, '.store.lock'), '');
    expect(() => createSaveStore(dir).create()).toThrow('SAVE_BUSY');
  });
  it('cleans abandoned atomic-write files under the directory lock', () => {
    const { dir, store } = fixture(); const a = store.create();
    const temporary = path.join(dir, a.id + '.json.0123456789abcdef.tmp');
    writeFileSync(temporary, 'abandoned');
    store.read(a.id); expect(existsSync(temporary)).toBe(false);
  });
});

it('enforces the shared count and byte budgets with four independent processes', async () => {
  const { dir } = fixture();
  const moduleUrl = new URL('./store.server.ts', import.meta.url).href;
  mkdirSync(path.join(dir, '.store.lock'));
  writeFileSync(path.join(dir, '.store.lock', 'a'.repeat(32) + '.json'), JSON.stringify({ pid: process.pid, start: 'Mon Jan  1 00:00:00 1990', timestamp: Date.now() - 31_000 }));
  const script = `import {createSaveStore} from ${JSON.stringify(moduleUrl)};
    const store = createSaveStore(${JSON.stringify(dir)}, {maxCount: 3, maxBytes: 500});
    for (let i = 0; i < 20; i++) {
      try { store.create(); } catch (e) { if (e.code !== 'SAVE_BUSY') throw e; }
      await new Promise(resolve => setTimeout(resolve, 2));
    }`;
  await Promise.all(Array.from({ length: 4 }, () => promisify(execFile)(process.execPath, ['--input-type=module', '-e', script])));
  const files = readdirSync(dir);
  expect(files.length).toBeGreaterThan(0);
  expect(files.length).toBeLessThanOrEqual(3);
  expect(files.every(f => f.endsWith('.json'))).toBe(true);
  expect(files.reduce((sum, f) => sum + statSync(path.join(dir, f)).size, 0)).toBeLessThanOrEqual(500);
});
