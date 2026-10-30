import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A Storage the analytics client can use on the server, kept in one JSON file. */
export function fileStorage(file: string): Store {
  let items: Record<string, string> = {};
  try {
    items = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // first run, or an unreadable file: start empty
  }
  const save = () => {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(items));
    renameSync(tmp, file);
  };
  return {
    getItem: (key) => items[key] ?? null,
    setItem(key, value) {
      items[key] = String(value);
      save();
    },
    removeItem(key) {
      delete items[key];
      save();
    },
  };
}
