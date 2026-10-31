import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import tables from '../src/bookshop/data.json';
import { joinBookshop } from '../src/bookshop/joins';
import type { BookshopTables } from '../src/bookshop/types';
import { RELEASE } from '../src/simulation/release';
import { simulateQuarter } from '../src/simulation/simulate';
import { SAMPLE_SEED } from '../src/simulation/sample-data';

const root = fileURLToPath(new URL('../', import.meta.url));
const rows = (name: string) => readFileSync(new URL(`../data/generated/${name}`, import.meta.url), 'utf8').trimEnd().split('\n');

it('recreates the committed sample of generated data byte-for-byte (npm run data:sample -- --check)', () => {
  const output = execFileSync(process.execPath, ['tools/sample-data.ts', '--check'], { cwd: root, encoding: 'utf8' });
  expect(JSON.parse(output)).toMatchObject({ event: 'sample_data_generated', outcome: 'success' });
}, 60000);

it("is the engine's own output, in the source sales' columns, new volume included", () => {
  const q1 = simulateQuarter({ levers: ['repick', 'events'] }, SAMPLE_SEED, joinBookshop(tables as BookshopTables));
  const hold = rows('sales-2194-q1-hold-course.csv'); const plan = rows('sales-2194-q1-repick-and-author-nights.csv');
  expect(hold[0]).toBe('Sale Date,ISBN,Discount,ItemID,OrderID');
  expect(hold.length - 1).toBe(q1.outcome.totals.holdCourse.units);
  expect(plan.length - 1).toBe(q1.outcome.totals.plan.units);
  const release = hold.slice(1).filter(r => r.split(',')[1] === RELEASE.edition.isbn).map(r => r.split(',')[0]!);
  expect(release.length).toBeGreaterThan(250);
  expect([...release].sort()[0]! >= '2194-02-04').toBe(true);
  expect(rows('sales-2194-q2-hold-course.csv').slice(1).every(r => r >= '2194-04-01' && r < '2194-07-01')).toBe(true);
});
