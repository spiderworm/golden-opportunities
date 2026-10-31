// The Commerce Office's opening alert (docs/design/m1-copy.md, section 1, Plot's
// strings): the transmission on first arrival, the standing-order strip until
// the plan is in, and the bell's archived copy. The memo's facts stay plain.

export const ALERT_COPY = {
  transmission: {
    /** The dialog's accessible name. */
    label: "Transmission from the Commerce Office",
    kicker: "INCOMING TRANSMISSION",
    line: "THE NUMBERS HAVE GONE DOWN. WE PREFER UP. MR. ZOOLANDER TEACHES THAT ONE MUST ALWAYS LOOK. PLEASE LOOK AT THE LEDGERS.",
    memoHeader: ["LARKSPUR STATION / COMMERCE OFFICE", "Quarterly review: Orbital Books, Ring C, Berth 14", "January 1, 2194"],
    memo: [
      ["Fourth-quarter revenue: $161,525. Third quarter: $274,036. ", { strong: "Down 41%." }],
      ["The Commerce Office expects a plan for the first quarter before the shuttle season ends. Your ledgers are on the console, and Dewey can help you read them there."],
      ["Submit your plan when you are ready."],
    ],
    open: "Open the ledgers",
    later: "Later",
  },
  strip: {
    long: ["Standing order from the Commerce Office: Q4 revenue is down ", { strong: "41%" }, " on Q3. Submit a plan for Q1 2194."],
    short: ["Standing order: Q4 revenue down ", { strong: "41%" }, ". Plan due for Q1 2194."],
    ledgers: "Open the ledgers",
    memo: "Read the memo",
  },
  bell: {
    title: "Q4 revenue is down 41% on Q3",
    detail: "Find out what happened, then submit a plan for Q1 2194.",
  },
} as const;
