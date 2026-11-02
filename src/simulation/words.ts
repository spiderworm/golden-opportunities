// The catalog's genre and format names as running text says them. A leaf, with no imports, so the engine
// and Alma can both use it without either depending on the other.

/** How a genre is named in running text: Alma's memo and the engine's assumptions say it the same way. */
export const GENRE_WORDS: Record<string, string> = {
  Fiction: "fiction",
  Mystery: "mystery",
  Romance: "romance",
  "SciFi/Fantasy": "science fiction and fantasy",
  "Young Adult": "young adult",
  Childrens: "children's book",
  Nonfiction: "nonfiction",
  Memoir: "memoir",
};
/** How a format is named in running text. */
export const FORMAT_WORDS: Record<string, string> = {
  Hardcover: "hardcover",
  "Trade paperback": "trade paperback",
  Paperback: "paperback",
  "Mass market paperback": "mass market paperback",
  Graphic: "graphic novel",
  "Board book": "board book",
};
