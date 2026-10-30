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

## Simulation

- **A simulation plays out the consequences of the player's decisions** over future quarters. (David, 30 Oct)
- **We fill in the data the simulation needs** that the Bookshop dataset lacks. The brief allows "data of your own choosing"; generated data is shipped with the submission as supporting files. (David, 30 Oct)

## In-game agent

- **The player can talk to the data through an in-game agent.** It must be present. (David, 30 Oct)
- **The agent must never give away the answers.** (David, 30 Oct)
- **What exactly the agent can and can't do is still open.** (David, 30 Oct)

## Look, sound and feel

- **UI:** a dashboard in the style of [this Dribbble shot](https://cdn.dribbble.com/userupload/16634923/file/original-f43329b3981a02596cc81116d1338386.png): dark navy with violet accents, metric tiles with change badges, charts and heatmaps. (David, 30 Oct)
- **3D:** beautiful 3D graphics of the orbital bookstore, inside and out, animated where possible. Models from Tripo, art from Gemini. (David, 30 Oct)
- **Music:** David makes it with Suno. The game plays it with the studio's music package. (David, 30 Oct)
- **Quality over the 45-minute guideline:** David will spend however long a high-quality experience takes. (David, 30 Oct)

## Engineering

- **The code lives in the golden-opportunities repo,** not in games-studio. It uses copies of the studio's shared packages (`packages/`, refreshed by `tools/sync-studio-packages.sh`). (David, 30 Oct)
- **The app has a server.** React Router in framework mode (formerly Remix, and David still calls it Remix), with Vite for hot reloading. (David, 30 Oct)
- **Analytics** use the studio's `@tellim/analytics` and **send to the studio's server.** (David, 30 Oct) That brings these requirements (Annie, 30 Oct):
  - a privacy page, modelled on Waddleberg's `privacy.html`;
  - an in-game switch to turn sharing off, with the install id shown;
  - `game: "orbital-books"`, plus `version`, `platform: "web"`, a build id and the WebGL context.
- **How We Build applies** (`~/Documents/how-we-build.md`): vertical slices, code organised by feature, analytics in every feature from the start.

## Submission (from the brief)

- A video of about 5 minutes walking through the solution and why it was designed this way.
- The application code, with instructions for running it.
- The supporting data files, including the generated data.
- A README written by David, covering why he built this, how he used AI, and what he'd do with more time. It should say plainly that `packages/` holds existing studio code.
- A record of the major prompts and how David guided the AI.
