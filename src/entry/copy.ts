// The entry page's words (Plot's), for David's request of 3 Nov 2026: shown once, before anything else, at any
// URL. Plain and friendly, not legal. Changing what the player agrees to means bumping ENTRY_VERSION (cookie.ts),
// so everyone who agreed to the old words sees the new ones.

export const ENTRY_COPY = {
  title: "Orbital Books",
  heading: "Before you go in",
  what: [
    "Orbital Books is a simulated, interactive analytics experience. You run a bookstore on a space station: read its sales ledgers, ask its reference assistant, and make a plan each quarter for a panel of robot bosses.",
    "The store, its books, its customers and its numbers are all made up.",
  ],
  musicHeading: "It plays music",
  music:
    "Inside, the game plays music. You can turn it off here, and pause it at any time from the player in the corner.",
  playMusic: "Play the music",
  shareHeading: "Please keep the link to yourself",
  share:
    "You're welcome to share it with people at your own company. Please don't share it with anyone outside your company without written permission from David Millet.",
  agree:
    "I understand that this is a simulation, and I agree not to share the link outside my company without David Millet's written permission.",
  continue: "Continue",
  /** Under Continue while it's off; it says what turns it on. */
  needsAgree: "Check the box above to continue.",
  once: "You'll see this page once on this browser.",
  privacy: "Privacy policy",
} as const;
