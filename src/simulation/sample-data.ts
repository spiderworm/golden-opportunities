// A sample of the simulation's generated 2194 sales, shipped as supporting files (docs/data.md): one fixed seed,
// holding course and one strong plan in each quarter, at the source workbook's sales grain and columns. The game
// makes the same lines for any save with this seed and plan; this only writes them where a reviewer can open them.
import tables from "~/bookshop/data.json";
import { joinBookshop } from "~/bookshop/joins";
import type { BookshopTables } from "~/bookshop/types";
import { q2Candidates, simulateQ2 } from "./q2";
import { simulateQuarter } from "./simulate";
import type { Plan, Q2Plan, SimulatedLine } from "./types";

export const SAMPLE_SEED = 1;
/** The source's Sales Q1 to Q4 columns, in its order. */
const COLUMNS = ["Sale Date", "ISBN", "Discount", "ItemID", "OrderID"] as const;

/** One sale line per row, as the source sheets have them: an empty discount is full price. */
function csv(lines: readonly SimulatedLine[]): string {
  const rows = lines.map((l) =>
    [l.date, l.isbn, l.discount === 0 ? "" : String(l.discount), l.itemId, l.orderId].join(","),
  );
  return [COLUMNS.join(","), ...rows].join("\n") + "\n";
}

/** File name to CSV text, for data/generated/. */
export function sampleFiles(): Record<string, string> {
  const data = joinBookshop(tables as BookshopTables);
  const q1Plan: Plan = { levers: ["repick", "events"] };
  const q1 = simulateQuarter(q1Plan, SAMPLE_SEED, data);
  // Q2's strong plan (q2.md section 8): three quiet, well-rated hardcovers, plus author nights.
  const isbn = (title: string) =>
    q2Candidates(data).find((c) => c.title === title && c.format === "Hardcover")!.isbn;
  const q2Plan: Q2Plan = {
    picks: [isbn("Land Water Sky Space"), isbn("Thatchwork Cottage"), isbn("Kalakalal Avenue")],
    levers: ["events"],
  };
  const q2 = simulateQ2(q2Plan, SAMPLE_SEED, data);
  return {
    "sales-2194-q1-hold-course.csv": csv(q1.doNothingLines),
    "sales-2194-q1-repick-and-author-nights.csv": csv(q1.lines),
    "sales-2194-q2-hold-course.csv": csv(q2.doNothingLines),
    "sales-2194-q2-quiet-picks-and-author-nights.csv": csv(q2.lines),
  };
}
