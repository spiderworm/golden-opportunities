// The scripted fallback (endless.md section 9): when the model is unavailable, too slow, or wrong twice, the
// quarter takes the first of its three candidates with scripted flavor. The candidates come from the save's
// seed and the quarter, so a retry after a failed write scripts the same event. The flavor passes the same
// checks as Alma's (tested for every type and measure).
//
// The texts are Plot's: a story per type and value, a reason per measure, and a boss line per type.

import type { Candidate, QuarterContext } from "./candidates";
import type { MeasureId } from "./events";
import { wantsReason, type Flavor } from "./validate";

// Stories are keyed by type, then by the candidate's genre, weekday or format, so the cause fits the event.
// Types with no such param use the "" key. Each story names only its own value, or nothing.
const STORIES: Record<string, Record<string, string>> = {
  genre_surge: {
    Fiction: "The Ring C reading circle has voted to spend the season on fiction.",
    Mystery:
      "A book club on the hydroponics deck has started on mysteries, and its members are trading suspects over the tomato vines.",
    Romance:
      "The station's matchmaking service has started sending a romance home with every match.",
    "SciFi/Fantasy":
      "The observation deck is screening old Earth space films, and the audience keeps asking for science fiction to read afterward.",
    "Young Adult":
      "The station school has set its older students a reading challenge, and young adult books fill the list.",
    Childrens:
      "The station nursery has started a bedtime story hour, and parents are looking for children's books to take home.",
    Nonfiction:
      "The Station Council has announced a quiz night on the history of Larkspur, and the contestants are studying nonfiction.",
    Memoir:
      "The retired shuttle pilots' society has started a writing class, and its members are reading memoirs for ideas.",
  },
  genre_slump: {
    Fiction: "The station archive is lending its fiction collection free of charge this season.",
    Mystery: "A stall on Ring B has started selling secondhand mysteries by the crate.",
    Romance:
      "The station archive has put its romance collection on the ring network, free to every resident.",
    "SciFi/Fantasy":
      "The observation deck's film season has ended, and the station's fantasy fans have gone back to their games.",
    "Young Adult":
      "Exams have started at the station school, and its older students are studying instead of reading young adult books for fun.",
    Childrens:
      "The station nursery is closed for refitting, and many of its families are visiting relatives planetside.",
    Nonfiction:
      "The Station Council has opened its reference library to every resident, free of charge.",
    Memoir: "The retired shuttle pilots' society is away on a cruise to the outer rings.",
  },
  quiet_days: {
    Monday: "The Ring C shuttle now docks an hour later on Mondays.",
    Tuesday: "Ring C's main corridor is closed for cleaning on Tuesdays.",
    Wednesday:
      "The station gym has moved its free classes to Wednesdays, and the corridor outside the shop has gone quiet.",
    Thursday: "The hydroponics deck now holds its market on Thursdays, at the far end of the ring.",
    Friday:
      "The Commerce Office has moved its weekly inspections to Fridays, and visitors are keeping away from Ring C while the inspectors are out.",
    Saturday:
      "The station's sports league now plays its matches on Saturdays, and the whole ring turns out to watch.",
    Sunday:
      "The Ring C shuttle runs a reduced service on Sundays while its engines are overhauled.",
  },
  author_fares: { "": "The shuttle line has repriced its author fares for the season." },
  format_costs: {
    Hardcover:
      "The printworks has run short of hardcover board, and its supplier is charging what it likes.",
    "Trade paperback":
      "The printworks' trade paperback press is out for repairs, and the backup press charges extra.",
    Paperback: "The paper mill on Ring D has repriced the stock it sells for paperbacks.",
    "Mass market paperback":
      "The freighter that carries mass market paperbacks has added a fuel surcharge.",
    Graphic: "The printworks has run short of color ink, and graphic novels are the hardest hit.",
    "Board book": "The board book bindery has run short of laminate.",
  },
  quiet_quarter: {
    "": "The station's calendar is clear this quarter: no festivals, no closures and no shortages.",
  },
};

// The stretch's reason, in the voice of the measure's boss.
const REASONS: Record<MeasureId, string> = {
  profit: "THE COMMERCE OFFICE HAS BOUGHT A NEW LEDGER. IT IS VERY EMPTY.",
  readers: "THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC.",
  happiness: "THE SURVEY DRONE HAS BEEN RECALIBRATED. IT NOW NOTICES FROWNS.",
  culture: "THE MINISTRY HAS DECLARED THIS A SEASON OF SERIOUS READING.",
};

// Two boss lines per type, one naming Mr. Zoolander and one plain. They name no genre, day or format, so they
// fit any value. The bosses quote him every other quarter at most, so the joke stays odd rather than constant.
const BOSS_LINES: Record<string, { zoolander: string; plain: string }> = {
  genre_surge: {
    zoolander:
      "THE COMMERCE OFFICE HAS NOTED THE ENTHUSIASM. MR. ZOOLANDER SAYS A CROWD IS A RUNWAY NOBODY HAS WALKED YET. DO NOT WASTE IT.",
    plain:
      "THE COMMERCE OFFICE HAS NOTED THE ENTHUSIASM. ENTHUSIASM IS NOT REVENUE. MAKE IT REVENUE.",
  },
  genre_slump: {
    zoolander:
      "FREE BOOKS ARE NOT OUR CONCERN. MR. ZOOLANDER NEVER WORRIED ABOUT FREE THINGS. HE WAS TOO GOOD-LOOKING.",
    plain: "FREE BOOKS ARE NOT OUR CONCERN. YOUR LEDGER IS OUR CONCERN. WE HAVE NO OTHER CONCERNS.",
  },
  quiet_days: {
    zoolander: "THE TIMETABLE IS FINAL. MR. ZOOLANDER COULD NOT TURN LEFT, AND HE ADAPTED. ADAPT.",
    plain: "THE TIMETABLE IS FINAL. WE DO NOT ADJUST TIMETABLES. TIMETABLES ADJUST US.",
  },
  author_fares: {
    zoolander:
      "THE FARES ARE THE FARES. MR. ZOOLANDER ALSO TRAVELED FOR WORK. HE NEVER ASKED ABOUT FARES. BE LIKE HIM.",
    plain:
      "THE FARES ARE THE FARES. WE ASKED WHETHER AUTHORS COULD WALK. THEY CANNOT WALK IN SPACE.",
  },
  format_costs: {
    zoolander:
      "THE PRINTWORKS SENDS ITS REGRETS. MR. ZOOLANDER DOES NOT ACCEPT REGRETS. NEITHER DO WE.",
    plain: "THE PRINTWORKS SENDS ITS REGRETS. WE DO NOT ACCEPT REGRETS. WE ACCEPT RECEIPTS.",
  },
  quiet_quarter: {
    zoolander:
      "NOTHING IS EXPECTED THIS QUARTER. THE PANEL WILL EXPECT SOMETHING ANYWAY. MR. ZOOLANDER CALLS THIS BLUE STEEL.",
    plain: "NOTHING IS EXPECTED THIS QUARTER. THE PANEL WILL EXPECT SOMETHING ANYWAY.",
  },
};

/** True if last quarter's boss line quoted Mr. Zoolander, so this quarter's shouldn't. */
const zoolanderLastQuarter = (context: QuarterContext) =>
  /zoolander/i.test(context.previous.at(-1)?.bossLine ?? "");

/** The value a story is keyed by: the candidate's genre, weekday or format, or "" for a type with none. */
const storyKey = (candidate: Candidate) =>
  String(candidate.params.genre ?? candidate.params.weekday ?? candidate.params.format ?? "");

/** The scripted flavor for a candidate. */
export function scriptedFlavor(candidate: Candidate, context: QuarterContext): Flavor {
  return {
    story: STORIES[candidate.type][storyKey(candidate)],
    ...(wantsReason(candidate, context) && candidate.stretch
      ? { reason: REASONS[candidate.stretch.measure] }
      : {}),
    bossLine: BOSS_LINES[candidate.type][zoolanderLastQuarter(context) ? "plain" : "zoolander"],
  };
}
