import type { BookshopData, BookshopTables, Library } from './types';

function index<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    if (result.has(id)) throw new Error(`Duplicate key: ${id}`);
    result.set(id, row);
  }
  return result;
}
function required<T>(map: Map<string, T>, id: string): T {
  const value = map.get(id);
  if (!value) throw new Error(`Missing required relationship: ${id}`);
  return value;
}

/** Pure joins; no filesystem or workbook parser in the browser bundle. */
export function joinBookshop(tables: BookshopTables): BookshopData {
  const authors = index(tables.authors, x => x.id);
  const info = index(tables.info, x => x.bookId);
  const series = index(tables.series, x => x.id);
  const publishers = index(tables.publishers, x => x.id);
  const editions = index(tables.editions, x => x.isbn);
  const joinedBooks = tables.books.map(book => {
    const details = info.get(book.id) ?? null;
    return { ...book, author: required(authors, book.authorId), info: details,
      series: details?.seriesId ? required(series, details.seriesId) : null,
      editions: tables.editions.filter(x => x.bookId === book.id),
      awards: tables.awards.filter(x => x.title === book.title) };
  });
  const books = index(joinedBooks, x => x.id);
  for (const edition of tables.editions) { required(books, edition.bookId); required(publishers, edition.publisherId); }
  const saleLines = tables.sales.map(sale => {
    const edition = required(editions, sale.isbn);
    const book = required(books, edition.bookId);
    return { ...sale, book, title: book.title, author: book.author, genre: book.info?.genre ?? null,
      format: edition.format, publisher: required(publishers, edition.publisherId),
      listPrice: edition.listPrice, revenue: edition.listPrice * (1 - sale.discount) };
  });
  const staffTypes = [...new Set(tables.libraryStaff.map(x => x.staffType))];
  const libraryMap = new Map<string, Library>();
  for (const row of tables.libraryStaff) {
    let library = libraryMap.get(row.libraryId);
    if (!library) {
      library = { id: row.libraryId, name: row.libraryName, consortiumMember: row.consortiumMember,
        private: row.private, staff: Object.fromEntries(staffTypes.map(type => [type, null])) };
      libraryMap.set(row.libraryId, library);
    }
    if (library.staff[row.staffType] !== null) throw new Error(`Duplicate staff category: ${row.libraryId}`);
    if (library.name !== row.libraryName || library.private !== row.private || library.consortiumMember !== row.consortiumMember) throw new Error(`Inconsistent library: ${row.libraryId}`);
    library.staff[row.staffType] = row.count;
  }
  return { ...tables, joinedBooks, saleLines, libraries: [...libraryMap.values()],
    joinedRatings: tables.ratings.map(row => ({ ...row, book: books.get(row.bookId) ?? null })),
    joinedCheckouts: tables.checkouts.map(row => ({ ...row, book: books.get(row.bookId) ?? null })),
    joinedCatalog: tables.catalog.map(row => {
      const edition = required(editions, row.isbn);
      return { ...row, edition, book: required(books, edition.bookId), library: required(libraryMap, row.libraryId) };
    }) };
}

