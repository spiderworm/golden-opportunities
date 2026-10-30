import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Where this copy of the app keeps its own state; never committed. */
export const DATA_DIR = path.resolve(process.env.ORBITAL_DATA_DIR ?? ".data");

let cached: string | undefined;

/**
 * This copy of the app's instance ID (David, 30 Oct 2026): made on first run,
 * kept in .data/instance.json, and sent with its analytics like a device ID,
 * so David can tell copies apart (his Mac, each reviewer's machine).
 */
export function instanceId(dir = DATA_DIR): string {
  if (cached && dir === DATA_DIR) return cached;
  const file = path.join(dir, "instance.json");
  let id: string | undefined;
  try {
    id = JSON.parse(readFileSync(file, "utf8")).id;
  } catch {
    // not made yet
  }
  if (!id) {
    id = randomUUID();
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ id, created: new Date().toISOString() }, null, 2));
  }
  if (dir === DATA_DIR) cached = id;
  return id;
}
