# Orbital Books

Orbital Books is an analytics simulation game. You run a bookstore on an orbital space station, are bossed by robotic overlords that are inexplicably obsessed with the Zoolander universe, and need to find ways to meet their quarterly demands: raise profits, bring in more customers, and sell more books. Scour past quarters' data with the help of your somewhat functional robotic assistant, Dewey, rendering charts and tables in thousands of configurations to find the evidence you need to make the best decision for the quarter ahead. Make your decision, and buckle up: you're graded across several categories, and your overall score is the lowest score among them all.

## Why I built Orbital Books

I read two parts to this question, and I'd like to answer both honestly. Part one: why did I choose to build a game? Part two: why Orbital Books, specifically?

### Why build a game?

I had a few reasons to choose a game as the type of app I'm building. They include:

- I have a set of game-related assets and resources available for use (from other projects)
- Games can make analytics (more) interactive and fun

Perhaps most importantly, since I'm building this as part of an interview process, the company that's considering bringing me on board deserves to understand who it is they're talking to.

- somebody that will build his development environment because he has his own personal vision of what a modern development environment should be (Roundhouse), and a game fits well alongside other Roundhouse projects
- somebody that leans heavily towards creativity and expressive ideas with tantalizing UIs in heavily gamified experiences. While I don't build games professionally, I do aim to build experiences that have that "hook", a "that was sweet" moment that people are thinking about long after they step away from the keyboard

### Why build Orbital Books, specifically?

Orbital Books came about as I thought about the suggested data sets provided to me, along with the suggestion that I could bring my own. Orbital Books builds upon one of the data sets, and simulates future quarters based on the players' decisions. It brings together things I'm passionate about: science fiction literature, literature in general, technology, games, and 3D rendering.

## How I used AI to build

I built this project exclusively within Roundhouse, my personal AI development workbench. I started off by spawning a Claude Code agent named "Goldy". I gave Goldy a summary of the requirement and links to the data sets and asked for analysis with strict instructions that they were not to provide me any project suggestions. As I considered several possible things I might build, I admittedly bemoaned the freedom present in the instructions until I decided to just build what best represents me as a person. I gave the description of Orbital Books to Goldy, described its role as coordinator, and asked how many agents it wanted to build this along with. We created those agents in Roundhouse and Goldy began distributing tasks.

I set forth some rules for PR reviews, and I personally reviewed and gated PRs with my approval to make sure I was intimately familiar with the code, but my ability to review and approve quickly was becoming a bottleneck, so I allowed for merges to occur with two approvals from non-author agents. We set up a robust testing strategy that included Playwright tests. We found that heavy testing gobbled up computer resources too greedily, and set up a baton system that allowed only the one holding the baton to run heavy tests.

I regularly reviewed the work that occurred and provided feedback and updated instructions, typically through Goldy, who relayed it on to appropriate handlers. Other than that, the agents queried me for decisions or test execution that they couldn't do on their own, collaborated with each other, and built a tremendously satisfying experience over the course of many iterations.

The full summary of the work together is available in [the collaboration log](./docs/collaboration-log.md).

## What would I build if I had more time

If I were to spend more time on this project (a possibility; it is pretty fun and might have value as a polished game), I'd focus on the following:

**I'd migrate from a quarterly turn-based simulation model to a continuously running simulation that runs in real time at an adjustable speed.** I realized halfway through that there was a gameplay hook within reach: watching the numbers update in real time and sped up simulation time, with the ability to pause at any crucial time and make key adjustments to the decisions that can greatly affect the quarterly outcome. While it would be a valuable adjustment, it was risky to pivot to a better simulation model and I opted to put it at the top of my backlog.

**I'd strengthen the UI story and do more to sell it as a futuristic UI.** It doesn't meet my design bar. I’d work with Gemini and ChatGPT as concept artists to develop a sleeker visual direction, build flows that work cleanly against the user stories as I see them, and rework existing pages and components into those looks and flows.

**I'd give Dewey the ability to join tables.** A miss on my part: if asked for a table with sets of columns not already joined, Dewey will only give the data in separate tables, and refuse to output it as a single table joined on obvious columns like quarter, or month+year. Joined tables will open up operations like pivoting, which I think could help solve certain problems.

**I'd go through the scenarios that we've baked in, plus those generated by Almanac, and verify quality.** I haven't had a chance to play this game nearly as much as I'd like to, not deeply at least. Doing so, I'm sure I'd discover a lot more room for refinement, particularly in later levels where Almanac (the agent driving scenarios behind the scenes) is given more opportunity to drive the story in whatever direction they choose.

## How to run Orbital Books

### First step, set up Dewey

Your first step will be to configure your environment for Dewey, the robotic assistant backed by Claude. You can run Dewey via a Claude Code CLI install, or via Claude APIs, your choice. Instructions for both are found in [docs/dewey-setup.md](./docs/dewey-setup.md).

### Running it locally (for development)

Once Dewey is set up, a standard set of NPM commands will get you up and running.

```bash
npm ci
npm run dev
```

Open the URL printed by Vite, normally [http://localhost:5173](http://localhost:5173), in your browser.

## Notes

The `packages/` directory contains shared code from my existing games-studio project. Code within that directory wasn’t written specifically for this exercise.
