// The station's bosses (docs/design/scoring.md, "The bosses"): heartless,
// groupthink robots who speak in capitals. One entry each, so a screen names
// a boss by id and gets the same name, tint and portrait everywhere.
import { chartTheme } from "~/platform/charts/chart-theme";
import type { MeasureId } from "~/simulation/types";

/** A boss is known by what it judges: its measure, or the overall score (the Administrator). */
export type BossId = MeasureId | "overall";

export interface Boss {
  name: string;
  /** The placeholder's color, and an accent around the portrait. */
  tint: string;
  /** public/bosses/<id>.webp, 256 px square, once Orbit makes it: one line here swaps out the placeholder. */
  portrait?: string;
}

const [blue, orange, green, amber, pink] = chartTheme.categorical as readonly string[];

export const BOSSES: Record<BossId, Boss> = {
  profit: { name: "The Commerce Office", tint: green! },
  readers: { name: "The Throughput Subcommittee", tint: blue! },
  happiness: { name: "The Readers' Guild survey drone", tint: pink! },
  culture: { name: "The Ministry of Culture", tint: amber! },
  overall: { name: "The Station Administrator", tint: orange! },
};
