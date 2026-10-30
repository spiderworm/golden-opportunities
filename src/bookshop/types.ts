export interface Book { id: string; title: string; authorId: string }
export interface Author { id: string; firstName: string; lastName: string; birthday: string; country: string; writingHoursPerDay: number }
export interface BookInfo { bookId: string; genre: string; seriesId: string | null; volume: number | null; staffComment: string | null }
export interface Edition { isbn: string; bookId: string; format: string; publisherId: string; publicationDate: string; pages: number; printRunThousands: number; listPrice: number }
export interface Publisher { id: string; name: string; city: string; state: string; country: string; establishedYear: number; marketingSpend: number }
export interface Series { id: string; name: string; plannedVolumes: number; bookTourEvents: number }
export interface Award { title: string; name: string; year: number }
export interface Rating { bookId: string; rating: number; reviewerId: number; reviewId: string }
export interface Checkout { bookId: string; month: number; year: null; count: number }
export interface LibraryStaff { libraryId: string; libraryName: string; consortiumMember: boolean; private: boolean; staffType: string; count: number }
export interface CatalogEntry { loanId: string; isbn: string; libraryId: string; copies: number }
export interface Sale { id: string; sourceSheet: string; sourceRow: number; date: string; quarter: number; isbn: string; discount: number; itemId: string; orderId: string }
export interface BookshopTables {
  books: Book[]; authors: Author[]; info: BookInfo[]; editions: Edition[];
  publishers: Publisher[]; series: Series[]; awards: Award[]; ratings: Rating[];
  checkouts: Checkout[]; libraryStaff: LibraryStaff[]; catalog: CatalogEntry[]; sales: Sale[];
}
export interface JoinedBook extends Book { author: Author; info: BookInfo | null; series: Series | null; editions: Edition[]; awards: Award[] }
export interface SaleLine extends Sale { book: JoinedBook; title: string; author: Author; genre: string | null; format: string; publisher: Publisher; listPrice: number; revenue: number }
export interface Library { id: string; name: string; consortiumMember: boolean; private: boolean; staff: Record<string, number | null> }
export interface BookshopData extends BookshopTables {
  joinedBooks: JoinedBook[]; saleLines: SaleLine[]; libraries: Library[];
  joinedRatings: (Rating & { book: JoinedBook | null })[];
  joinedCheckouts: (Checkout & { book: JoinedBook | null })[];
  joinedCatalog: (CatalogEntry & { edition: Edition; book: JoinedBook; library: Library })[];
}
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
