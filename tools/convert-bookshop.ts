import { readFileSync, writeFileSync } from 'node:fs';
import XLSX from 'xlsx';
import type { BookshopTables } from '../src/bookshop/types.ts';

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
const started = performance.now();
const root = new URL('../', import.meta.url);
const read = (name: string) => XLSX.read(readFileSync(new URL(`data/source/bookshop/${name}.xlsx`, root)));
const text = (v: Cell): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Expected nonempty text, got ${v}`);
  return v;
};
const number = (v: Cell): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Expected number, got ${v}`);
  return v;
};
const optionalText = (v: Cell) => v === null ? null : text(v);
const optionalNumber = (v: Cell) => v === null ? null : number(v);
const yesNo = (v: Cell) => { if (v !== 'Yes' && v !== 'No') throw new Error(`Expected Yes/No, got ${v}`); return v === 'Yes'; };
const date = (v: Cell) => {
  const parsed = XLSX.SSF.parse_date_code(number(v));
  if (!parsed) throw new Error(`Invalid Excel date: ${v}`);
  return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
};
const workbooks: XLSX.WorkBook[] = [];
let skippedEmptyRows = 0;
function rows(sheetName: string): { row: Row; sourceRow: number }[] {
  const workbook = workbooks.find(w => w.Sheets[sheetName]);
  if (!workbook) throw new Error(`Missing sheet: ${sheetName}`);
  if (workbook.Workbook?.WBProps?.date1904) throw new Error('Unexpected 1904 date system');
  const sheet = workbook.Sheets[sheetName];
  const all = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, blankrows: true });
  return all.flatMap((row, i) => {
    if (Object.values(row).every(value => value === null || value === '')) { skippedEmptyRows++; return []; }
    return [{ row, sourceRow: i + 2 }];
  });
}
function table<T>(sheet: string, schema: { [K in keyof T]: [string, (v: Cell) => T[K]] }): T[] {
  return rows(sheet).map(({ row, sourceRow }) => {
    const result: Partial<T> = {};
    for (const key of Object.keys(schema) as (keyof T)[]) {
      const [header, parse] = schema[key];
      if (!(header in row)) throw new Error(`${sheet}: missing column ${header}`);
      try { result[key] = parse(row[header]); }
      catch (error) { throw new Error(`${sheet} row ${sourceRow}, ${header}: ${String(error)}`); }
    }
    return result as T;
  });
}
type Entry<K extends keyof BookshopTables> = BookshopTables[K][number];
try {
  workbooks.push(read('Bookshop'), read('BookshopLibraries'));
  const data: BookshopTables = {
    books: table<Entry<'books'>>('Book', { id: ['BookID', text], title: ['Title', text], authorId: ['AuthID', text] }),
    authors: table<Entry<'authors'>>('Author', { id: ['AuthID', text], firstName: ['First Name', text], lastName: ['Last Name', text], birthday: ['Birthday', date], country: ['Country of Residence', text], writingHoursPerDay: ['Hrs Writing per Day', number] }),
    info: rows('Info').map(({row}) => ({ bookId: text(row.BookID1) + text(row.BookID2), genre: text(row.Genre), seriesId: optionalText(row.SeriesID), volume: optionalNumber(row['Volume Number']), staffComment: optionalText(row['Staff Comment']) })),
    editions: table<Entry<'editions'>>('Edition', { isbn: ['ISBN', text], bookId: ['BookID', text], format: ['Format', text], publisherId: ['PubID', text], publicationDate: ['Publication Date', date], pages: ['Pages', number], printRunThousands: ['Print Run Size (k)', number], listPrice: ['Price', number] }),
    publishers: table<Entry<'publishers'>>('Publisher', { id: ['PubID', text], name: ['Publishing House', text], city: ['City', text], state: ['State', text], country: ['Country', text], establishedYear: ['Year Established', number], marketingSpend: ['Marketing Spend', number] }),
    series: table<Entry<'series'>>('Series', { id: ['SeriesID', text], name: ['Series Name', text], plannedVolumes: ['Planned Volumes', number], bookTourEvents: ['Book Tour Events', number] }),
    awards: table<Entry<'awards'>>('Award', { title: ['Title', text], name: ['Award Name', text], year: ['Year Won', number] }),
    ratings: table<Entry<'ratings'>>('Ratings', { bookId: ['BookID', text], rating: ['Rating', number], reviewerId: ['ReviewerID', number], reviewId: ['ReviewID', text] }),
    checkouts: table<Entry<'checkouts'>>('Checkouts', { bookId: ['BookID', text], month: ['CheckoutMonth', number], year: ['CheckoutMonth', () => null], count: ['Number of Checkouts', number] }),
    libraryStaff: table<Entry<'libraryStaff'>>('LibraryProfile', { libraryId: ['Library ID', text], libraryName: ['Library', text], consortiumMember: ['Consortium Member', yesNo], private: ['Private', yesNo], staffType: ['Staff Type', text], count: ['Number of Staff', number] }),
    catalog: table<Entry<'catalog'>>('Catalog', { loanId: ['Loan ID', text], isbn: ['ISBN', text], libraryId: ['Library ID', text], copies: ['Number of Copies', number] }),
    sales: [1, 2, 3, 4].flatMap(quarter => rows(`Sales Q${quarter}`).map(({row, sourceRow}) => {
      const saleDate = date(row['Sale Date']);
      const discount = row.Discount === null ? 0 : number(row.Discount);
      if (discount < 0 || discount > 1) throw new Error(`Invalid discount at Q${quarter}:${sourceRow}`);
      if (!saleDate.startsWith('2193-') || Math.ceil(Number(saleDate.slice(5, 7)) / 3) !== quarter) throw new Error(`Date outside quarter: ${saleDate}`);
      return { id: `sales-q${quarter}:${sourceRow}`, sourceSheet: `Sales Q${quarter}`, sourceRow, date: saleDate, quarter, isbn: text(row.ISBN), discount, itemId: text(row.ItemID), orderId: text(row.OrderID) };
    })),
  };
  // One record per line keeps the generated artifact reviewable without expanding every field.
  const json = '{\n' + Object.entries(data).map(([key, records]) => `  ${JSON.stringify(key)}: [\n${records.map((record: unknown) => '    ' + JSON.stringify(record)).join(',\n')}\n  ]`).join(',\n') + '\n}\n';
  const destination = new URL('src/bookshop/data.json', root);
  if (process.argv.includes('--check')) {
    if (readFileSync(destination, 'utf8') !== json) throw new Error('Generated data is stale; run npm run data:bookshop');
  } else writeFileSync(destination, json);
  console.log(JSON.stringify({ event: 'bookshop_converted', outcome: 'success', durationMs: Math.round(performance.now() - started), sales: data.sales.length, ratings: data.ratings.length, skippedEmptyRows }));
} catch (error) {
  console.error(JSON.stringify({ event: 'bookshop_converted', outcome: 'failure', durationMs: Math.round(performance.now() - started) }));
  throw error;
}
