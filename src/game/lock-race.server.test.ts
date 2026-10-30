import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ beforeUnlink: undefined as undefined | ((file: string) => void) }));
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, unlinkSync: (file: Parameters<typeof fs.unlinkSync>[0]) => {
    hooks.beforeUnlink?.(String(file));
    return fs.unlinkSync(file);
  } };
});
import { createSaveStore } from './store.server';
let directory: string;
afterEach(() => { hooks.beforeUnlink = undefined; vi.restoreAllMocks(); if (directory) rmSync(directory, { recursive: true, force: true }); });
it('Audit regression: a pause after the final check cannot let a successor commit before stale eviction', () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'save-scheduling-'));
  let time = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => time);
  const old = createSaveStore(directory, { maxCount: 2 });
  const a = old.create(); time++; old.create();
  const target = path.join(directory, a.id + '.json');
  const successor = createSaveStore(directory, { maxCount: 2 });
  let intercepted = false;
  hooks.beforeUnlink = file => {
    if (file !== target || intercepted) return;
    intercepted = true; time += 30_001;
    // Exactly between assertOwned and unlink. Propagate SAVE_BUSY to stop the probe's eviction.
    successor.update(a.id, 0, s => { s.discoveries.push('A'); });
  };
  expect(() => old.create()).toThrow('SAVE_BUSY');
  expect(intercepted).toBe(true);
  expect(existsSync(target)).toBe(true);
  expect(successor.read(a.id).revision).toBe(0);
  expect(successor.update(a.id, 0, s => { s.discoveries.push('A'); }).revision).toBe(1);
  expect(successor.read(a.id).discoveries).toEqual(['A']);
});
