import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { fileStorage } from "./file-storage.server";

test("values survive a restart, and removed ones stay removed", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "orbital-storage-"));
  try {
    const file = path.join(dir, "nested", "store.json");
    const a = fileStorage(file);
    a.setItem("kept", "1");
    a.setItem("gone", "2");
    a.removeItem("gone");
    const b = fileStorage(file);
    expect(b.getItem("kept")).toBe("1");
    expect(b.getItem("gone")).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
