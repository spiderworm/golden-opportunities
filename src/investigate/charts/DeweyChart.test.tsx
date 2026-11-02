import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

import { DeweyChart } from "./DeweyChart";

const result = (rows: Record<string, string | number>[]) => ({
  columns: [{ key: "genre" as const, label: "Genre", type: "string" as const, nullable: true }, { key: "revenue" as const, label: "Revenue", type: "number" as const, nullable: false }],
  rows,
  total: null,
  source: "S",
});

it("draws Dewey's chart as Investigate draws a pin, or says nothing matched", () => {
  const chart = { title: "Revenue by genre", kind: "bar" as const, query: { measure: "revenue" as const, by: ["genre" as const] } };
  expect(renderToString(<DeweyChart chart={chart} result={result([{ genre: "Fiction", revenue: 9 }])} />)).toMatch(/role="img" aria-label="Revenue by genre"/);
  expect(renderToString(<DeweyChart chart={chart} result={result([])} />)).toMatch(/Nothing matched/);
});
