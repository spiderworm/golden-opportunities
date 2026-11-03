// A daily cap on model use (David, 3 Nov 2026: "Cap Dewey's and Alma's usage"): the real cost of a copy of the game
// that's open to the world is the model it calls. Two caps a day for each of Dewey's questions and Alma's
// generations: one for this copy of the app (the instance), and one for each visitor (their game's save), so one
// visitor can't spend everyone's share. A day is a UTC day.
//
// Counted on the server and kept in .data/usage.json, so a restart doesn't reset it. Only counts are kept: a
// visitor is a hash of their save's id, and nothing they typed or were shown is stored.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./analytics/instance.server.ts";

export type UsageKind = "dewey" | "alma";
/** Which cap a use would pass. */
export type Cap = "instance" | "visitor";

/** Each cap's default, and the variable that sets it: a whole number, 0 for none at all. */
const CAPS: Record<UsageKind, Record<Cap, [env: string, fallback: number]>> = {
  dewey: {
    instance: ["ORBITAL_DEWEY_DAILY_CAP", 300],
    visitor: ["ORBITAL_DEWEY_VISITOR_DAILY_CAP", 40],
  },
  alma: {
    instance: ["ORBITAL_ALMA_DAILY_CAP", 200],
    visitor: ["ORBITAL_ALMA_VISITOR_DAILY_CAP", 20],
  },
};

export function capsFor(
  kind: UsageKind,
  env: NodeJS.ProcessEnv = process.env,
): Record<Cap, number> {
  const read = ([name, fallback]: [string, number]) => {
    const value = env[name]?.trim();
    return value && /^\d{1,7}$/.test(value) ? Number(value) : fallback;
  };
  return { instance: read(CAPS[kind].instance), visitor: read(CAPS[kind].visitor) };
}

interface Counts {
  total: number;
  /** By visitor: a hash of their save's id. */
  visitors: Record<string, number>;
}
interface Usage {
  version: 1;
  /** The UTC day these counts are for, "2026-11-03"; another day starts again from nothing. */
  day: string;
  counts: Record<UsageKind, Counts>;
}

const empty = (day: string): Usage => ({
  version: 1,
  day,
  counts: { dewey: { total: 0, visitors: {} }, alma: { total: 0, visitors: {} } },
});

const isCounts = (v: unknown): v is Counts =>
  typeof v === "object" &&
  v !== null &&
  Number.isInteger((v as Counts).total) &&
  typeof (v as Counts).visitors === "object" &&
  (v as Counts).visitors !== null &&
  Object.values((v as Counts).visitors).every(Number.isInteger);

/** The file's counts for `day`; nothing (a new day, a missing or broken file) starts from zero. */
function load(file: string, day: string): Usage {
  try {
    const usage = JSON.parse(readFileSync(file, "utf8")) as Usage;
    if (
      usage.version === 1 &&
      usage.day === day &&
      isCounts(usage.counts?.dewey) &&
      isCounts(usage.counts?.alma)
    )
      return usage;
  } catch {
    // Missing or unreadable: a fresh count.
  }
  return empty(day);
}

/** Written whole and then moved into place, so a crash mid-write can't leave half a file. */
function store(file: string, usage: Usage) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(usage), { mode: 0o600 });
  renameSync(temporary, file);
}

const visitorKey = (visitor: string) =>
  createHash("sha256").update(visitor).digest("hex").slice(0, 16);

/**
 * Counts one use of `kind` for `visitor` (their save's id, or null when there's no game), unless it would pass a
 * cap: then nothing is counted, and the cap it would pass is returned. Null means it's allowed, and counted.
 */
export function spend(
  kind: UsageKind,
  visitor: string | null,
  {
    now = new Date(),
    env = process.env,
    file = path.join(DATA_DIR, "usage.json"),
  }: { now?: Date; env?: NodeJS.ProcessEnv; file?: string } = {},
): Cap | null {
  const caps = capsFor(kind, env);
  const usage = load(file, now.toISOString().slice(0, 10));
  const counts = usage.counts[kind];
  if (counts.total >= caps.instance) return "instance";
  const key = visitor ? visitorKey(visitor) : null;
  if (key && (counts.visitors[key] ?? 0) >= caps.visitor) return "visitor";
  counts.total += 1;
  if (key) counts.visitors[key] = (counts.visitors[key] ?? 0) + 1;
  store(file, usage);
  return null;
}
