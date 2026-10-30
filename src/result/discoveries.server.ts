// The discoveries' words (docs/design/m1-copy.md, section 6). Server-only: the
// found text is the answer, and the hint says where it is, so neither may ship
// in the browser's code. The result loader sends each player only what they
// have earned, and only after the quarter has played out.
import type { DiscoveryId } from "~/game-stub/types";

const DISCOVERIES: { id: DiscoveryId; found: string; notFound: string }[] = [
  {
    id: "A",
    found: "The whole store slowed. Every genre fell by a similar share, and orders fell while order size held.",
    notFound: "Compare Q3 and Q4 by genre, and look at average order value.",
  },
  { id: "B", found: "Weekdays emptied; weekends held.", notFound: "Break Q3 and Q4 down by weekday." },
  {
    id: "C",
    found: "Nonfiction's rise was one discounted title, and every month had one: the Book of the Month.",
    notFound: "Look closer at the one genre that grew, then break it down by discount.",
  },
];

export interface EarnedDiscovery {
  id: DiscoveryId;
  found: boolean;
  /** What was found, or where to look when it wasn't. */
  text: string;
}

export function earnedDiscoveries(found: readonly DiscoveryId[]): EarnedDiscovery[] {
  return DISCOVERIES.map((d) => (found.includes(d.id) ? { id: d.id, found: true, text: d.found } : { id: d.id, found: false, text: d.notFound }));
}
