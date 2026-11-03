import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("recreates the committed JSON byte-for-byte from the source workbooks", () => {
  const output = execFileSync(process.execPath, ["tools/convert-bookshop.ts", "--check"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
  });
  expect(JSON.parse(output)).toMatchObject({
    event: "bookshop_converted",
    outcome: "success",
    sales: 56350,
    ratings: 50330,
    skippedEmptyRows: 514,
  });
}, 15000);
