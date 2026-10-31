// The new Inspector Ryeslton volume (docs/design/m1-new-volume.md): one generated
// release, out February 4, 2194, still selling in Q2. These records are the one
// source for it: the engine's sale lines carry its ISBN and book ID, and the
// game joins them through these records. Everything here is scenario fiction,
// except what it borrows from the series' first two volumes.
import type { BookInfo, BookshopData, DeepReadonly, Edition, JoinedBook, SaleLine } from "~/bookshop/types";

/** Generated: none of this is in the 2193 data. */
export const RELEASE = {
  generated: true,
  book: { id: "BM901", title: "The Bourton Model Village Poisoning", authorId: "CS190" },
  info: {
    bookId: "BM901",
    genre: "Mystery",
    seriesId: "IR-ESP",
    volume: 3,
    staffComment: "Ryeslton's best yet, and this time every suspect is one-twelfth scale.",
  } satisfies BookInfo,
  edition: {
    isbn: "989-28-79-90194-3",
    bookId: "BM901",
    format: "Hardcover",
    publisherId: "ESP",
    publicationDate: "2194-02-04",
    pages: 312,
    printRunThousands: 10,
    listPrice: 22.99,
  } satisfies Edition,
  coverLine: "Inspector Ryeslton returns. Somebody has poisoned a village. A very small one.",
  /** Its ratings, for Happiness and Culture, are volume 2's (The Winchcombe Railway Museum Heist). */
  ratedLike: "TH296",
} as const;

export const RELEASE_DAY = RELEASE.edition.publicationDate;
/** Volume 2's 478 copies in Q1 2193, over 90 days, times the series' volume-to-volume ratio of 0.85: about 4.5 a day. */
export const RELEASE_RATE = (478 / 90) * 0.85;
/** Three times the rate in the first week, twice in the second (*generated*: no series released a volume in 2193). */
export const releaseLaunch = (daysOut: number) => (daysOut < 7 ? 3 : daysOut < 14 ? 2 : 1);

/** The release joined like the data's books: its author and series are volume 2's. */
export function releaseBook(data: DeepReadonly<BookshopData>): DeepReadonly<JoinedBook> {
  const author = data.authors.find((a) => a.id === RELEASE.book.authorId);
  const series = data.series.find((s) => s.id === RELEASE.info.seriesId);
  if (!author || !series) throw new Error("The release's author and series must be in the data");
  return { ...RELEASE.book, author, info: RELEASE.info, series, editions: [RELEASE.edition], awards: [] };
}

/** The release as a sale line, for the engine's orders and the lines it writes. */
export function releaseLine(data: DeepReadonly<BookshopData>): DeepReadonly<SaleLine> {
  const book = releaseBook(data);
  const publisher = data.publishers.find((p) => p.id === RELEASE.edition.publisherId);
  if (!publisher) throw new Error("The release's publisher must be in the data");
  const { author } = book;
  return {
    id: "release",
    sourceSheet: "simulation",
    sourceRow: 0,
    date: RELEASE_DAY,
    quarter: 1,
    isbn: RELEASE.edition.isbn,
    discount: 0,
    itemId: "release",
    orderId: "release",
    book,
    title: RELEASE.book.title,
    author,
    genre: RELEASE.info.genre,
    format: RELEASE.edition.format,
    publisher,
    listPrice: RELEASE.edition.listPrice,
    revenue: RELEASE.edition.listPrice,
  };
}
