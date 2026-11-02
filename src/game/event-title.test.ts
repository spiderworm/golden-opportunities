import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "../alma/events";
import { bellItem, eventTitle } from "./event-title";

describe("an event's short title (endless-copy.md section 1)", () => {
  it("names Q1's and Q2's, which have no Alma event", () => {
    expect(eventTitle("2194-Q1", null)).toBe("None");
    expect(eventTitle("2194-Q2", null)).toBe("The new Inspector Ryeslton volume");
  });
  it("has a title for every event type Alma can draw", () => {
    for (const type of EVENT_TYPES) expect(eventTitle("2194-Q3", { type: type.id, params: { genre: "Mystery", month: 2, weekday: "Tuesday", cost: 300, format: "Graphic", percent: 67 } })).not.toBe("None");
  });
  it("words each as Plot's table does", () => {
    expect(eventTitle("2194-Q3", { type: "genre_surge", params: { genre: "Mystery", month: 2, percent: 20 } })).toBe("Mystery orders rising in August");
    expect(eventTitle("2194-Q4", { type: "genre_slump", params: { genre: "SciFi/Fantasy", month: 2, percent: 15 } })).toBe("Science fiction and fantasy orders falling in November");
    expect(eventTitle("2194-Q3", { type: "format_costs", params: { format: "Graphic", percent: 67 } })).toBe("Graphic novel costs at 67%");
    expect(eventTitle("2194-Q3", { type: "quiet_days", params: { weekday: "Tuesday", percent: 15 } })).toBe("Quiet Tuesdays");
  });
  it("puts a later quarter's memo on the bell", () => {
    expect(bellItem("2194-Q3", { type: "author_fares", params: { cost: 350 } })).toEqual({
      id: "2194-Q3-memo", title: "Q3 2194: Author nights at $350", detail: "Read the memo, then submit your picks and a plan for Q3 2194.",
    });
  });
});
