import { describe, expect, it } from 'vitest';
import { joinBookshop } from './joins';
import { loadBookshop } from './loader.server';
import tables from './data.json';
import type { BookshopTables } from './types';

const data = loadBookshop();
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe('Bookshop source reconciliation', () => {
  it('joins every sale without multiplying rows and reconciles all quarters', () => {
    expect(data.saleLines).toHaveLength(56350);
    expect(new Set(data.saleLines.map(x => x.id)).size).toBe(56350);
    const totals = [1, 2, 3, 4].map(q => sum(data.saleLines.filter(s => s.quarter === q).map(s => s.revenue)));
    [95245.8078, 164436.9438, 274036.165, 161524.6946].forEach((expected, i) => expect(totals[i]).toBeCloseTo(expected, 4));
    expect(sum(totals)).toBeCloseTo(695243.6112, 4);
    expect(data.saleLines.every(s => s.date.startsWith('2193-') && s.book.id && s.title && s.author.id && s.genre && s.format && s.publisher.id)).toBe(true);
    expect(data.saleLines.every(s => s.revenue === s.listPrice * (1 - s.discount))).toBe(true);
  });

  it('preserves collisions and conflicting item/order prefixes without losing sales', () => {
    const items = new Map<string, Set<string>>();
    for (const sale of data.sales.filter(s => s.quarter === 1)) {
      if (!items.has(sale.itemId)) items.set(sale.itemId, new Set());
      items.get(sale.itemId)!.add(sale.orderId);
    }
    expect([...items.values()].filter(orders => orders.size > 1)).toHaveLength(2);
    expect(data.sales.filter(s => s.itemId.split('-')[0] !== s.orderId.split('-')[0])).toHaveLength(354);
    expect(data.saleLines.some(s => s.discount === 0 && s.revenue === s.listPrice)).toBe(true);
  });

  it('retains unknown books, unsold editions, and authors without books', () => {
    expect(data.ratings).toHaveLength(50330);
    expect(data.joinedRatings.filter(r => r.book === null)).toHaveLength(548);
    expect(data.joinedRatings.filter(r => r.book === null).every(r => r.bookId === 'CH392')).toBe(true);
    expect(data.joinedCheckouts.filter(r => r.book === null)).toHaveLength(12);
    expect(data.joinedCheckouts.filter(r => r.book === null).every(r => r.bookId === 'CH392')).toBe(true);
    expect(data.joinedBooks.find(b => b.id === 'DG384')?.editions).toEqual([]);
    expect(data.authors.filter(a => !data.books.some(b => b.authorId === a.id))).toHaveLength(7);
    const sold = new Set(data.sales.map(s => s.isbn));
    expect(data.editions.filter(e => !sold.has(e.isbn))).toHaveLength(2);
    expect(data.joinedBooks.find(b => b.id === 'MM424')?.info?.bookId).toBe('MM424');
  });

  it('keeps questionable source facts and does not invent checkout years or staff counts', () => {
    expect(data.authors.filter(a => a.birthday > '2193-12-31').map(a => a.birthday).sort()).toEqual(['2225-01-29', '2238-01-21']);
    expect(data.authors.find(a => a.id === 'DB605')?.writingHoursPerDay).toBe(5.13);
    expect(data.publishers.find(p => p.id === 'PP')?.establishedYear).toBe(1982);
    expect(data.awards.some(a => a.name === 'Newberry Medal')).toBe(true);
    expect(data.checkouts.every(c => c.year === null && c.month >= 1 && c.month <= 12)).toBe(true);
    expect(data.libraries).toHaveLength(7);
    expect(data.libraries.filter(l => Object.values(l.staff).includes(null))).toHaveLength(2);
    expect(data.libraries.find(l => l.id === 'L-AA')).toMatchObject({ name: 'Armchair Athanaeum', staff: { Librarians: 6, 'Library Assistants': null, 'Library Technicians': null } });
    expect(data.libraries.find(l => l.id === 'L-BS')?.staff['Library Assistants']).toBeNull();
    expect(data.joinedCatalog).toHaveLength(291);
    expect(data.joinedCatalog.every(c => c.book && c.edition && c.library)).toBe(true);
  });

  it('fails loudly on broken required joins or duplicate dimension keys', () => {
    expect(() => joinBookshop({ ...tables, editions: [] } as BookshopTables)).toThrow('Missing required relationship');
    expect(() => joinBookshop({ ...tables, authors: [...tables.authors, tables.authors[0]] } as BookshopTables)).toThrow('Duplicate key');
  });

  it('caches joins and reports content-free load measurements', () => {
    const events: { event: string; props?: Record<string, string | number | boolean> }[] = [];
    expect(loadBookshop((event, props) => events.push({ event, props }))).toBe(data);
    expect(events[0]).toMatchObject({ event: 'bookshop_loaded', props: { cacheHit: true, saleLines: 56350 } });
    expect(events[0].props?.durationMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(events[0].props!).sort()).toEqual(['cacheHit', 'durationMs', 'saleLines']);
  });
});
