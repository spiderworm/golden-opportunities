# Bookshop data decisions

`npm run data:bookshop` regenerates `src/bookshop/data.json`; add `-- --check`
to verify it without writing. Node 22.18+ (native TypeScript stripping) is required.
The unchanged submission workbooks live in `data/source/bookshop/`.
SheetJS CE 0.20.3 is pinned to its official release tarball and lockfile integrity:
it supports these Excel workbooks, typed parsing, and Excel serial dates without
shipping an XLSX parser to players. Distribution reference:
https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

Import `loadBookshop` from `src/bookshop/loader.server` in server code only.
React Router rejects client imports of this module. Browser consumers receive
selected data through route loaders and server queries; `joinBookshop` from
`src/bookshop/joins` and the types remain importable in either runtime without
importing the dataset.
It returns a cached, deeply readonly typed view with normalized tables and joined
books, sale lines, ratings, checkouts, libraries, and catalog entries. The joined
sale's `book` includes its source ID, author, info, series, editions, and awards.
Optional `track(event, props)` receives a content-free `bookshop_loaded` event with duration,
cache hit, and sale count; connect it to the application's platform analytics.
The converter emits success/failure and timing events to stdout/stderr. There is
no UI, simulation data, network request, or analytics vendor dependency here.
The normalized JSON is about 14 MB uncompressed and stays on the server.
Route loaders should return only the subset needed by their UI.
The cache lasts for the module lifetime; a new build replaces the imported data.

## Normalization and omissions

- All four quarterly sales sheets are concatenated, retaining all 56,350 rows.
  Dates use the workbook's Excel 1900 calendar and become `YYYY-MM-DD` strings,
  independent of time zone. Sale dates must belong to 2193 and the sheet quarter.
- Blank discounts mean zero. Each row is one sold item. Revenue is
  `listPrice * (1 - discount)` with no per-row cent rounding. Source prices and
  discounts can produce fractional cents; round only for presentation after
  summing. Revenue is gross discounted sales, not profit or net of returns/tax.
- `Info.BookID1 + Info.BookID2` forms the book ID. Both components are source
  text (e.g. `MM` + `424`). ISBNs, review IDs, item IDs, and order IDs stay text;
  numeric reviewer IDs stay numeric. Source text/whitespace is otherwise kept.
- Exactly 514 wholly empty trailing Ratings rows are omitted. All 50,330 actual
  ratings remain. Nonempty malformed rows cause conversion errors.
- Awards have titles, not book IDs; join on the exact title, preserving source
  awards as a separate table. Optional series/volume/staff comments remain null.
- Required sale/edition/book/author/publisher and catalog joins fail loudly on
  missing relationships. Indexed dimension keys must be unique. Library profile
  metadata must agree across staff rows; duplicate staff categories fail.

## Judgment calls affecting consumers

- CH392 has no Book row. Retain its 548 ratings and 12 checkout rows with
  `bookId: "CH392"` and `book: null` in the joined views. Do not invent a title or
  drop these observations. Consumers grouping by book must show an unknown-book
  group or explicitly disclose exclusion. There is no fabricated Book record.
- DG384 remains in the catalog of books with an empty editions array. Seven
  authors with no books and two editions with no sales remain in their tables.
  Do not infer that absent editions or sales mean missing rows to fabricate.
- Two Q1 ItemIDs occur under different orders. Keep both sale rows. Use the
  deterministic sheet/physical-row ID (`sales-q1:2`, etc.) as sale identity;
  ItemID alone is not unique. Row IDs are stable while the source is unchanged.
- Preserve all 354 mismatching ItemID/OrderID numeric prefixes. OrderID stays
  opaque; do not parse a date or reassign an order from either ID. Sale Date is
  authoritative for timing. Source sheet and physical row are exposed for audit.
- Preserve birthdays in 2225 and 2238, publisher establishment in 1982, and
  writing time 5.13 hours/day. These are source anomalies, not evidence for a
  particular corrected value. Avoid presenting derived ages as trustworthy.
- Preserve `Armchair Athanaeum` and `Newberry Medal` verbatim. No speculative
  spelling changes to names; any later presentation correction should be explicit.
- Pivot LibraryProfile into seven libraries, keeping the original 18 long-form
  staff rows too. Missing staff categories are null (unknown), never zero.
  L-AA lacks assistants and technicians; L-BS lacks assistants.
- Checkout months have no year: use `year: null` and retain month 1–12. Do not
  merge them into the 2193 sales timeline as if a year were observed.

## Reconciliation

| Period | Revenue before display rounding |
| --- | ---: |
| Q1 | 95,245.8078 |
| Q2 | 164,436.9438 |
| Q3 | 274,036.1650 |
| Q4 | 161,524.6946 |
| Year | 695,243.6112 |

Other retained table counts: 58 books, 41 authors, 58 info records, 95 editions,
4 publishers, 6 series, 18 awards, 668 checkout rows, 291 library catalog rows.
Tests allow only floating-point summation tolerance in revenue reconciliation.
