# Setting up Dewey

Dewey, the station's reference assistant on the Investigate page, runs on [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code). The game runs Claude Code on this machine, locked down to the store's data tools, once for each question. Everything else in the game works without it. Without Claude Code, Dewey's panel says its terminal is offline and points here.

## Steps

1. **Install Claude Code** (it needs Node.js 22 or newer):

   ```sh
   npm install -g @anthropic-ai/claude-code
   ```

2. **Sign in** with a Claude account that includes Claude Code (Pro or Max), or an Anthropic Console account:

   ```sh
   claude auth login
   ```

   Dewey uses that stored sign-in. An `ANTHROPIC_API_KEY` set in the environment is not passed to Dewey.

3. **Check** that it's installed and signed in:

   ```sh
   claude --version      # e.g. 2.1.314 (Claude Code)
   claude auth status    # should show "loggedIn": true
   ```

4. **Start the game** (`npm run dev`) and open Investigate. Dewey's panel takes questions.

If you sign in while the game is running, Dewey notices within a minute, or straight away after a restart.

## Tested with

- **Claude Code** 2.1.314, the `claude` command on the PATH.
- **Node.js** 24.21.0.
- **macOS**.
- **Model:** Dewey asks for `sonnet` by default. Set `ORBITAL_ASSISTANT_MODEL` to use another, for example `ORBITAL_ASSISTANT_MODEL=haiku npm run dev`.

## Without Claude Code

- **The rest of the game** (the station, Investigate's dashboard, Decide, the results) works normally, and Dewey's panel says it's offline. The game never starts anything to ask Claude Code beyond `claude auth status` and `claude --version`.
- **The fake provider:** to see the panel work without Claude Code, start the game with `ORBITAL_ASSISTANT_PROVIDER=fake npm run dev`. Dewey then gives a canned reply, with real lookups: revenue by quarter, and the latest quarter beside the quarter before it, by genre. Each lookup runs through the same tool code and POST /api/query as the real Dewey's, so its tables and Pin buttons work.

## Daily caps

Each copy of the game caps its own model use every day, a UTC day (David, 3 Nov 2026): Dewey's questions, and Alma's generations (her quarter events and backstories). There's a cap for the whole copy and one for each visitor's game, so one visitor can't use everyone's share.

| Variable | Default |
| --- | --- |
| `ORBITAL_DEWEY_DAILY_CAP` | 300 questions |
| `ORBITAL_DEWEY_VISITOR_DAILY_CAP` | 40 questions |
| `ORBITAL_ALMA_DAILY_CAP` | 200 generations |
| `ORBITAL_ALMA_VISITOR_DAILY_CAP` | 20 generations |

- **Past a cap,** Dewey says "I've looked up all I can for now, and my circuits need a rest. Ask me again later.", and no model is asked. Alma's quarter event and backstory are the game's scripted ones. The rest of the game is unchanged.
- **The counts** are kept in `.data/usage.json`, so a restart doesn't reset them. They're counts only: a visitor is a hash of their save's id, and nothing anyone typed is stored.

## What Dewey can reach

Claude Code runs with no built-in tools, no settings, skills or commands from the machine, and only the game's own data tools. It sees the store's sales data the same way the player's dashboard does, and nothing else. `src/assistant/engine-notes.md` records how that was measured, and what is guaranteed about the figures Dewey states.
