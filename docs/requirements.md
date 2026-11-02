# Orbital Books: requirements

David's take-home for the Golden Analytics Full Stack Engineer challenge. The brief, broken down into a checklist, is in `~/Downloads/golden-analytics-take-home/requirements.md`. This file holds the requirements David has set for what we're building. Each one names who decided it and when. Questions still waiting on David are listed at the end.

Last brought up to date on 31 October 2026.

Due **3 November 2026**, with no extension: "no need to extend as it turns out" (David, 30 Oct).

## The game

- **Orbital Books** (working name): you run a bookstore in orbit. The brief's data is the shop's 2193, and the player runs its 2194. (David, 30 Oct)
- **Data:** the brief's Bookshop dataset (`Bookshop.xlsx`, `BookshopLibraries.xlsx`). (David, 30 Oct)
- **Analytics as gameplay.** Instead of a dashboard, the game gives you the tools to investigate your business. Every investigation follows four steps (David's concept, `~/Documents/The Last Bookstore/concept.md`):
  1. **Discover:** you receive a business question, challenge or unexpected observation.
  2. **Investigate:** you explore the data, ask questions, compare segments and find patterns.
  3. **Decide:** you act on the evidence.
  4. **Measure:** you see what happened.
- **Investigations should have more than one valid approach.** (David's concept)
- **Scoring comes from how your actions affect the bookstore over time,** not from matching a single right answer. Points aren't the main reward; discovering something interesting in the data is. (David, 30 Oct)
- **The score is a report card, not gross profit alone.** Four measures out of 100: Profit, Readers served, Happiness and Culture, with letter grades against goals set from last year. "Scoring on gross profit SOLELY feels icky to me." Details in `docs/design/scoring.md`. (David with Plot, 30 Oct)
- **M1 uses a reduced card:** Profit, Readers served, Culture from real ratings and awards, and Happiness from Quality and Value only; goals are Q1 2193 plus 5%. (Plot's proposal, scoped by Goldy, 30 Oct)
- **The overall score is the lowest measure.** "Maybe our really really mean robot overlord bosses make our overall score to whatever our lowest measure is. Just that. Always." (David, 30 Oct) Each measure grades the progress from last year to its goal, and matching last year scores 70. (Plot's proposal, approved by David, 30 Oct)
- **Two quarters, then a half-year review.** The player plays Q1 2194 (the M1 slice), then Q2 2194, and the game ends with a review of the half year. Details in `docs/design/q2.md`. (Plot and Sim's design, approved by David as written, 31 Oct: "127 LGTM")
  - **Q2's problem:** the Book of the Month calendar is empty, and the player picks the books. A plan is up to three picks (April, May, June) plus one more move.
  - **Three new discoveries** (D, E and F) can be earned in Q2.
  - **Nothing carries over from Q1 except data:** the player's Q1 joins the ledgers as 2194-Q1.
  - **Q2's goals** are Q2 2193 plus 5%, plus the new volume's expected effect.
  - **Q2 is harder than Q1:** its best plan grades about B−, against Q1's B+.
  - **The half-year score is the mean of the two quarters' overall scores** (Sim's recommendation, over Plot's first draft, which used the lower quarter).
  - The picker shows only each title's format and price, and December's 173-copy pick stays in the data Q2's lift is drawn from.
- **A new volume comes out in Q1.** "New book releases seems too exciting to pass up tbh" (David, 30 Oct). Goldy scoped it to one generated release with no new systems. The third Inspector Ryeslton mystery is out February 4, 2194, and the goals count its expected sales. It keeps selling in Q2, where picking it is a trap. Details in `docs/design/m1-new-volume.md`. (Plot's design; Sim's timing, over Plot's first draft, which moved it to April; approved by David with Q2, 31 Oct)
- **Names:** the agent is Dewey and the landlord is the Commerce Office. "Meridian Station" is out (it's a location in Halo); the station is Larkspur Station. (David, 30 Oct)

## Simulation

- **A simulation plays out the consequences of the player's decisions** over future quarters. (David, 30 Oct)
- **We fill in the data the simulation needs** that the Bookshop dataset lacks. The brief allows "data of your own choosing"; generated data is shipped with the submission as supporting files. (David, 30 Oct)
- **Generated data may include customers and demographics.** It fits the real 2193 sales exactly and explains the real patterns rather than adding new ones. Dewey stays "blind, absolutely" to it, and it isn't labelled as generated in the game. (David with Plot, 30 Oct) None were built: the simulation works in orders and copies, and the submission has no customer file (`docs/data.md`, Frank, 31 Oct).
- **The submission's data is documented in `docs/data.md`:** the source workbooks with their SHA-256s, the derived `src/bookshop/data.json` and how to regenerate or check it, and what's generated (the new volume's records, and each game's 2194 sales from the save's seed). (Frank, for Goldy's M4 packaging, #158, 31 Oct)
- **A sample of the generated data ships in `data/generated/`,** so a reviewer can open it without playing: four CSVs of the simulation's 2194 sales for one fixed seed, holding course and one strong plan per quarter, written by `npm run data:sample` and checked by `npm test`. (Frank flagged the gap; Goldy approved the sample, #158, 31 Oct)
- **Alma, an event director:** a separate behind-the-scenes LLM, blind to Dewey, picks events from set types within limits, and plays every seller and rival buyer. Its events are logged, so a game replays exactly. (David with Plot, 30 Oct) It isn't built for the take-home: Q1 and Q2 have no events and no extra stretch (`docs/design/q2.md`). Whether Q2 gets a scripted stretch is open.
- **A book market** (M2 and later): Exchange auctions and Orbitplace sales, with Dewey buying on a visible autopilot rule. (David with Plot, 30 Oct)
- **Rules are shown before a decision; effects only after in-game time passes.** Projections may come later, once David has played the game. (David with Plot, 30 Oct)

## In-game agent

- **The player can talk to the data through an in-game agent.** It must be present. (David, 30 Oct)
- **The agent must never give away the answers.** (David, 30 Oct)
- **The agent is Claude Code,** set up the way David's web UIs drive Claude Code sessions on his Mac. To be revisited before release. (David, 30 Oct)
- **Its limits, as a starting point** (proposed by Goldy, accepted by David on 30 Oct: "We'll adjust if necessary"):
  - The rules are enforced by what the agent can reach, not by instructions in its prompt. It queries data through the same layer as the dashboard and can't read files, run commands or reach the web.
  - It never has access to the scenario's hidden cause, the simulation's model, future quarters or the scoring.
  - **It can** answer specific questions about the data, draw charts the player asks for, explain terms, show how to use the tools, and pin its charts to the dashboard.
  - **It can't** answer open questions ("what's wrong?", "why?", "what should I do?"); it turns them back into questions the player could ask. It doesn't volunteer patterns the player didn't ask about, recommend or rank decisions, or predict outcomes.
  - Maybe later: a hint the player can request, at a cost to their score.
- **When Dewey declines a "why" or "what should I do" question, it offers the full menu of what it can show, in a fixed order, never a subset chosen for the question.** Steering would only ever be an explicit, paid hint. (David, choosing Plot's option 1, 30 Oct)
- **Dewey never states a figure or a direction of its own.** It cites tool results by reference and the server renders the exact value, unit and direction; any number or comparative word in its own prose is withheld. (Probe's red-team and Audit's reviews, designed by Sage, approved by Goldy, 30 Oct)
- **Dewey's conversation is restored on page reload.** (David, 30 Oct)
  - **The one exception: buying stock.** Dewey can suggest bids and run buying on autopilot, but only with a fixed rule that it shows every time ("the weakest of algorithms ever"). The rule looks at last year's sales and nothing else. The game starts with buying handed to Dewey, and the player can take it over. (David, 30 Oct)

## Look, sound and feel

- **UI:** a dashboard in the style of [this Dribbble shot](https://cdn.dribbble.com/userupload/16634923/file/original-f43329b3981a02596cc81116d1338386.png): dark navy with violet accents, metric tiles with change badges, charts and heatmaps. (David, 30 Oct)
- **3D:** beautiful 3D graphics of the orbital bookstore, inside and out, animated where possible. Models from Tripo, art from Gemini. (David, 30 Oct)
- **When the 3D station can't show, the still picture's note says why.** "This device can't show the station in 3D" appears only when the browser lacks WebGL 2. If anything failed before the scene was up (its code, tried twice, or a model didn't arrive, or it broke while starting), the note says the station didn't load; if it broke while running, that it stopped. David pushed back that his MacBook Pro "should be able to handle the scene", and it could: the scene had failed to load, and the device was blamed. (David, 31 Oct; Chart's fix, #124; wording in `docs/design/m1-copy.md` section 9)
- **Phones get a robot, not the game.** "On phones? HEAVENS NO" (David, 30 Oct). A 3D robot, the Throughput Subcommittee, reaches out and grabs the phone, says "what's this? a computer for ants?" or similar, and a plain line says the game needs a laptop or desktop computer. No music loads on a phone. (David, 30 Oct)
  - **One hand grabs the phone.** David asked for "a single hand", with a grip as wide as the phone, then chose layout B of two: the bubble at the top, the fact line at the bottom, and the hand above it. His grip: "open up the hand, face the palm towards the camera, and have the fingers grip one side of the phone, and the thumb the other". (David, 31 Oct; Orbit's #121, still open) The camera's framing is still open.
- **Music:** David makes it with Suno. The game plays it with the studio's music package. (David, 30 Oct)
- **Quality over the 45-minute guideline:** David will spend however long a high-quality experience takes. (David, 30 Oct)

## Engineering

- **The code lives in the golden-opportunities repo,** not in games-studio. It uses copies of the studio's shared packages (`packages/`, refreshed by `tools/sync-studio-packages.sh`). (David, 30 Oct)
- **The app has a server.** React Router in framework mode (formerly Remix, and David still calls it Remix), with Vite for hot reloading. (David, 30 Oct)
- **Hosting:** local only for now; to be decided later. (David, 30 Oct)
- **A reviewer can clone the repo, follow the instructions, and play.** Sim checked this from a fresh clone of `main`; the findings, and README suggestions for David, are in `docs/fresh-clone-check.md`. (Goldy's M4 item, #154, 31 Oct) Its two blocking findings are fixed (#157), and a second pass covers the real Dewey under `npm start` and the Q2 loop.
- **The real Dewey works under `npm start`,** not only under `npm run dev`. The built server starts Dewey's tool server from `src/`, so `npm start` runs from the repo. `npm start` listens on port 3000 unless `PORT` says otherwise, and fails if 3000 is busy, and a dev server that moves off 5173 still reaches its own lookups. (Frank, #150 and #157, from Sim's check, 31 Oct)
- **`npm start` listens on this computer only** (127.0.0.1), so other devices on the network can't reach it. `ORBITAL_HOST` changes the address. Dewey's lookups follow it to 127.0.0.1 (for `127.0.0.1` or `0.0.0.0`) or to [::1] (anything else). So Dewey works with `ORBITAL_HOST` set to `::1` or `::`. With a hostname, `localhost` or a LAN address, it needs `ORBITAL_QUERY_URL` to a loopback address the server listens on, and a LAN-only address has none. (David, 2 Nov: "As opposed to opening it up to network calls? For now, yes". Sage.)
- **Every month is a year and a month** (`2193-04`, `2194-04`), so 2193's and 2194's months never share a row in a chart, a table or Dewey's lookups. A bare month filter is refused. (Probe's Q2 red-team, finding Q5, #151; Frank's fix at the source, as Goldy asked, #153, 31 Oct)
- **Every copy of the app generates an instance ID** and sends it with its analytics, like a device ID. Local runs send everything too. How exposed this leaves David to abuse is still to be discussed. (David, 30 Oct)
- **What players type to the agent is kept on the device, not sent,** so it can be delivered later if David decides to. The final decision is deferred. Every other event is sent. (David, 30 Oct) Whether Dewey's own withheld sentences are kept the same way is open (Sage's #152).
- **Analytics** use the studio's `@tellim/analytics` and **send to the studio's server.** (David, 30 Oct) That brings these requirements (Annie, 30 Oct):
  - a privacy page, modelled on Waddleberg's `privacy.html`;
  - an in-game switch to turn sharing off, with the install id shown;
  - `game: "orbital-books"`, plus `version`, `platform: "web"`, a build id and the WebGL context.
- **`docs/analytics.md` lists every event and checks the promises:** each event is described on the privacy page, held agent text never leaves the device, the sharing switch stops the browser and the server, automated browsers never send (the server's own events need `ORBITAL_ANALYTICS=off`, which the e2e server sets), and `.data/instance.json` is git-ignored. (Frank, for Goldy's M4 check, #159, 31 Oct)
- **How We Build applies** (`~/Documents/how-we-build.md`): vertical slices, code organised by feature, analytics in every feature from the start.

## Process

- **All work reaches `main` through pull requests.** (David, 30 Oct)
- **Two agent approvals can merge a PR** (David, 30 Oct, later the same day): once two non-author agents have approved a PR in signed comments, one of them Audit (unless Audit is an author), it can be merged without David. David still can merge himself.
- **Every PR description names the agent that wrote the code; reviews are PR comments signed with the reviewer's name.** (David, 30 Oct)
- **Conflicts are resolved in the commits that cause them:** PR branches are rebased onto `main`, with no merge commits. (David, 30 Oct)
- **The live workspace runs on a local `live` branch** that integrates everyone's work ahead of the PRs; agents' workspaces merge into it automatically. (David, 30 Oct)
- **Major points of the collaboration go in `docs/collaboration-log.md`,** especially where David pushes back on the AI. (David, 30 Oct)

## Submission (from the brief)

- A video of about 5 minutes walking through the solution and why it was designed this way.
- The application code, with instructions for running it.
- The supporting data files, including the generated data.
- A README written by David, covering why he built this, how he used AI, and what he'd do with more time. It should say plainly that `packages/` holds existing studio code.
- A record of the major prompts and how David guided the AI.

## Open questions for David

- **Withheld sentences.** Should the sentences Dewey's figures gate withholds be recorded, kept on the device under `agent_text` like the player's questions? That widens the one exception to "events say what happened, never content". Sage's #152 holds that commit last, so it can be dropped on its own.
- **A scripted event in Q2.** Q2 has no event director. Should a scripted stretch appear, for example the Council's foot-traffic study on Readers served? (`docs/design/q2.md`)
- **The ending's framing.** Q2's result screen is the end of the game. Is "the first half of 2194" the right framing, or should the ending point to quarters to come? (`docs/design/q2.md`)
- **The phone robot's camera framing.** Layout B and the grip are chosen; how the camera frames the robot and its hand is still open. (#121)
