# Orbital Books: requirements

David's take-home for the Golden Analytics Full Stack Engineer challenge. The brief, broken down into a checklist, is in `~/Downloads/golden-analytics-take-home/requirements.md`. This file holds the requirements David has set for what we're building. Each one names who decided it and when.

Due **3 November 2026**. Golden Analytics will extend if asked; David will decide after the first few hours of building (30 Oct).

## The game

- **Orbital Books** (working name): you run a bookstore in orbit in the year 2193. (David, 30 Oct)
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
- **Names:** the agent is Dewey and the landlord is the Commerce Office. "Meridian Station" is out (it's a location in Halo); Larkspur Station is proposed. (David, 30 Oct)

## Simulation

- **A simulation plays out the consequences of the player's decisions** over future quarters. (David, 30 Oct)
- **We fill in the data the simulation needs** that the Bookshop dataset lacks. The brief allows "data of your own choosing"; generated data is shipped with the submission as supporting files. (David, 30 Oct)
- **Generated data may include customers and demographics.** It fits the real 2193 sales exactly and explains the real patterns rather than adding new ones. Dewey stays "blind, absolutely" to it, and it isn't labelled as generated in the game. (David with Plot, 30 Oct)
- **Alma, an event director:** a separate behind-the-scenes LLM, blind to Dewey, picks events from set types within limits, and plays every seller and rival buyer. Its events are logged, so a game replays exactly. (David with Plot, 30 Oct)
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
- **Music:** David makes it with Suno. The game plays it with the studio's music package. (David, 30 Oct)
- **Quality over the 45-minute guideline:** David will spend however long a high-quality experience takes. (David, 30 Oct)

## Engineering

- **The code lives in the golden-opportunities repo,** not in games-studio. It uses copies of the studio's shared packages (`packages/`, refreshed by `tools/sync-studio-packages.sh`). (David, 30 Oct)
- **The app has a server.** React Router in framework mode (formerly Remix, and David still calls it Remix), with Vite for hot reloading. (David, 30 Oct)
- **Hosting:** local only for now; to be decided later. (David, 30 Oct)
- **Every copy of the app generates an instance ID** and sends it with its analytics, like a device ID. Local runs send everything too. How exposed this leaves David to abuse is still to be discussed. (David, 30 Oct)
- **What players type to the agent is kept on the device, not sent,** so it can be delivered later if David decides to. The final decision is deferred. Every other event is sent. (David, 30 Oct)
- **Analytics** use the studio's `@tellim/analytics` and **send to the studio's server.** (David, 30 Oct) That brings these requirements (Annie, 30 Oct):
  - a privacy page, modelled on Waddleberg's `privacy.html`;
  - an in-game switch to turn sharing off, with the install id shown;
  - `game: "orbital-books"`, plus `version`, `platform: "web"`, a build id and the WebGL context.
- **How We Build applies** (`~/Documents/how-we-build.md`): vertical slices, code organised by feature, analytics in every feature from the start.

## Process

- **All work reaches `main` through pull requests David approves.** (David, 30 Oct)
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
