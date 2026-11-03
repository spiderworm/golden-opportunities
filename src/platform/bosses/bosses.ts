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
  /** public/bosses/<id>.webp, 256 px square, by Orbit (provenance.json beside them); without one, the placeholder face. */
  portrait?: string;
  /** public/bosses/full/<id>.webp: the full figure for scenes, 512 px tall on one shared scale (Orbit), so all drawn at one height keep their sizes; without one, the portrait stands in. */
  figure?: string;
}

const [blue, orange, green, amber, pink] = chartTheme.categorical as readonly string[];

export const BOSSES: Record<BossId, Boss> = {
  profit: {
    name: "The Commerce Office",
    tint: green!,
    portrait: "/bosses/profit.webp",
    figure: "/bosses/full/profit.webp",
  },
  readers: {
    name: "The Throughput Subcommittee",
    tint: blue!,
    portrait: "/bosses/readers.webp",
    figure: "/bosses/full/readers.webp",
  },
  happiness: {
    name: "The Readers' Guild survey drone",
    tint: pink!,
    portrait: "/bosses/happiness.webp",
    figure: "/bosses/full/happiness.webp",
  },
  culture: {
    name: "The Ministry of Culture",
    tint: amber!,
    portrait: "/bosses/culture.webp",
    figure: "/bosses/full/culture.webp",
  },
  overall: {
    name: "The Station Administrator",
    tint: orange!,
    portrait: "/bosses/overall.webp",
    figure: "/bosses/full/overall.webp",
  },
};
