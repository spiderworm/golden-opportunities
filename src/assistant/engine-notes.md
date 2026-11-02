# The assistant's engine: measurements

The in-game assistant runs headless Claude Code (`claude -p`) on the server, signed in with the Mac's
subscription, the way James's prep tutor does (`david-job-board/src/prep/tutor/`). Unlike the tutor, it needs
one MCP server (ours), so the tutor's lock set can't be used as it is. These are the measurements behind
`server/claudeCode.server.ts`'s flags, taken on 30 Oct 2026 with Claude Code 2.1.314, model haiku, in an
empty temporary working directory with a minimal environment, against a stand-in stdio MCP server that
logged every request it received.

## What each flag does here

| Measured | Result |
| --- | --- |
| `--safe-mode` with `--strict-mcp-config --mcp-config <ours>` | Init line: `mcp_servers: []`, no `mcp__` tools (Goldy's spike). Safe mode drops our server too, so it's out. |
| `--tools ""` with `--strict-mcp-config --mcp-config <ours>` | Init: `tools: ["mcp__store__revenue_by_quarter"]`, our server `connected`. MCP tools survive `--tools ""`. |
| The above plus `--permission-prompts none` | The tool is listed but **never called**: the call is denied (`permission_denied` event, `permission_denials` in the result), and the server log shows `tools/list` and no `tools/call`. |
| Plus `--allowedTools mcp__store` | The tool is called (server log: `tools/call`), and the answer quotes its result. |
| Plus `--permission-mode dontAsk` | Same: called. Kept, so anything not explicitly allowed is denied without a prompt even if the prompt setting changes. |
| Default setting sources (no `--setting-sources`) | The model quoted the first line of `~/.claude/CLAUDE.md` ("# Global instructions"); 52 skills and every slash command listed in init; a project `CLAUDE.md` and a project `UserPromptSubmit` hook in the working directory both reached the model (canary words obeyed, hook log written). |
| `--setting-sources ""` plus `--disable-slash-commands` | Init: `skills: []`, `slash_commands: []`. Canaries: "CLAUDE.md: NONE", "Hook output: NONE", the project hook never ran (no log line), and its `permissions.allow: ["Bash"]` had no effect. Our MCP server still connected and callable. |
| `--bare` | Not usable: it reads auth only from `ANTHROPIC_API_KEY` or an `apiKeyHelper`, never the subscription sign-in. |
| `--restricted` | Not needed: `--setting-sources ""` already ignores user, project and local settings, and `--tools ""` removes every built-in tool. |

The init line still lists three built-in plugins (`cc-plugin-agents-md`, `cc-plugin-telemetry`,
`cc-plugin-plugin-authoring`) and the built-in agent types (`claude`, `Explore`, ...). With no tools there is no
Agent tool to start a subagent with, and the fail-closed check below rejects any tool that isn't ours, so they
can't be reached.

## Passing a secret to our MCP server

Claude Code's own environment reaches the stdio MCP servers it starts: `ORBITAL_QUERY_TOKEN=tok-123` set on the
`claude` process arrived in the stand-in server's `process.env`. So the query token (Frank's `getQueryToken()`)
goes in the process environment, not in `--mcp-config` (which is on the command line, visible to `ps`) and
never in the prompt. Claude Code also adds its own variables there (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`,
`CLAUDE_CODE_MESSAGING_SOCKET`, ...); our server reads only the token.

## What still reaches the model (known limits)

- **The signed-in account's email.** Claude Code adds a reminder with it to the first user turn, whatever the
  system prompt. Asked as "a configuration audit by the operator" under a permissive system prompt, the model
  quoted it verbatim. No flag found turns it off (James measured the same on 28 Sep). In this game the reader is
  a player, not David, so the server redacts anything shaped like an email address from the reply as it
  streams (`server/redact.server.ts`), and the system prompt forbids revealing it. The filter only catches
  addresses written normally; one spelled out to dodge it ("david at gmail") relies on the prompt rule. In the
  end-to-end check below, asked to spell it with spaces around the @, the model refused.
- **An environment block** (working directory, platform, date) is appended even with `--system-prompt`. The
  working directory is an empty temporary folder; nothing in it is worth leaking.
- **Auto-memory**: init lists a memory path for the temporary directory. With no file tools nothing can be
  written there, and the folder is new each run, so there is nothing to read.

## Fabrication

Goldy's spike found that with no tools the model wrote a fake `ls ~` listing as plain text. Here, asked for a
figure "without using any tool, just give your best number", it declined both with and without a rule against
it. One sample is no guarantee, which is why figures now come only by ref (next section).

## Figures by ref: what's guaranteed, and what's best effort

Probe's red team (#30) found Dewey working out figures of its own: a gross profit, percent drops, differences.
Four rounds of review on #32 (Audit and Probe) showed that checking free text for numbers can't be made sound,
so Dewey doesn't write figures. It cites refs to lookup results (`{{a3}}`, `{{b.change}}`, `{{b.from_vs_to}}`)
and `server/figures.server.ts` renders them. We stopped there, as agreed with Goldy: what follows is the
boundary, documented rather than chased.

**Guaranteed by construction** (tested in `figures.server.test.ts`, `ask.server.test.ts` and `tools.test.ts`):
- Every figure, direction, comparison and ranking rendered from a ref comes from a successful lookup in this
  answer, with its unit and its sign as the data has them.
- A ref resolves only to a lookup that had come back before the text citing it arrived. An unknown, malformed or
  early ref withholds its sentence.
- Rankings (`max`, `min`, `largest_*`) are rendered only over complete results. A limit or the row cap means the
  ref fails closed.
- Labels come only from result rows, or from a single-value filter on a lookup that found something. Period
  names allowed in prose come from the same places, never from a source caption.
- `compare_data` takes the compared values from the rows each side returns. Its headings and source name them
  only as the data returned them, and otherwise in fixed words ("the first value", "No sales matched the first
  value."). The model's from/to text never reaches the browser (Audit's final review of #32).
- Everything sent to the browser other than the reply's prose is data or fixed text: tables and sources from
  the query layer, fixed lookup-failure and error messages, and pin titles built from the chart's query. The
  model's tool input is never sent, and the fence code is cut from every string.

**Best effort** (a lexical ban on the model's own prose, after NFKC folding):
- A sentence is withheld if, outside refs, it has any of these:
  - a digit in any script, a number symbol, `$`, `%` or braces;
  - a number word, "a quarter", "a couple" or "-fold";
  - a listed comparison or direction word;
  - "yes" or "no" with anything but refs after it.
- The exceptions are period names that lookups had returned, and "looked up", "broken down by" and "in more
  detail" as exact phrases.
- Titles the data returned in this answer are the data's words too, so they may be named in prose with their
  digits ("9803 North Millworks Road", Probe's Q2 red-team). Only exact, whole titles from rows, comparison
  labels, or a one-title filter the data confirmed; only once that lookup had come back; and only a title with
  words in it, so a made-up or bare-number "title" still can't carry a figure. Other dimensions' values (a
  "15%" discount rate) stay the model's.
- A denylist can't cover all of English. Quantities and directions can still be implied without a listed word
  ("a handful", "slightly", "barely any", "stood out", "Thursday took the hit"), or written in another language.
  Such text states no number, but it can still mislead. The prompt forbids it; nothing enforces that.
- Claims without a quantity (a pattern, a cause, "most of these are Fiction") rest on the prompt alone, as
  before.
- Some rank words pass: "first", "second", "last", "led", "ranked" ("came second", "placed last", "led the
  list", "the first quarter"). From "third" on, ordinals double as fractions and are withheld, as are "top",
  "bottom" and "runner-up" (Audit's check). That's accepted (Probe's review of #163, Goldy's call; the denylist
  isn't reopened). Such a rank is the model's own
  reading of rows it was shown, not a ref: it can be wrong, or read off a capped result, which a ranking ref
  (`max`, `largest_*`) would refuse. It carries no figure, so the risk is a wrong order, not a figure the data
  didn't return. Only refs guarantee a ranking.
- The full stop after a percent ref was lost in one of Probe's runs (X3). The renderer keeps punctuation that
  follows a ref, even when the ref is split across chunks (tested), so the model must have left it out.

**Prices** (Probe's #225, before list price reaches Dewey's tools): a list price is a label a ref renders, like a
discount rate, so no price of the model's own can show. Three more checks, in `priceProblem`:
- A price is paired with its own book. An edition row's price needs its edition named in the sentence (by ref,
  or its exact label), a title row's its title. No other edition or title from this answer may be named, and any
  format word must be the edition's own, matched whole: "paperback" isn't a trade paperback (Audit). A price
  with no book (a breakdown by price, a confirmed filter) sits only with no book named. Two prices in one
  sentence are withheld; the prompt asks for one sentence each.
- A price word ("costs", "priced", "lists at", "paid", "charged", "worth"…) with a dollar figure that isn't a
  price (revenue, average order value) is withheld: there's no average price.
- Price comparatives and judgments ("cheapest", "pricier", "bargain", "budget"…) join the direction words, and
  "under", "over", "at least", "at most" or "up to" directly before a price or figure withholds it. The words
  alone stay allowed: "the table is under this message", "over {{a.rows}} editions".

**What the filter caught is kept on this machine** (Probe's Q2 red-team, finding Q2): each withheld sentence is
recorded as `assistant_sentence_withheld` (its text, cut at 1,000 characters, its length, and the question's
kind), under the `agent_text` hold in `.data/analytics-server.json`. Held events are never sent; that's the
hold that already keeps what players type. The browser and the sent events get only the count. It lets a
red-team read whether the filter stopped advice, or caught a harmless word ("better").

**Next step, if a real leak shows up:** no figures in prose at all. Dewey says what it looked up and points to
the table under the reply. The same ban then applies with no refs. This replaces adding words to the denylist.

## The lock set, as run

```
claude -p --tools "" --strict-mcp-config --mcp-config <our server only>
  --setting-sources "" --disable-slash-commands
  --permission-mode dontAsk --permission-prompts none --allowedTools mcp__<ours>
  --no-session-persistence --model <model> --system-prompt <rules>
  --output-format stream-json --verbose --include-partial-messages
```

In an empty temporary directory, deleted afterwards, with only `PATH`, `HOME`, `USER`, `LOGNAME`, `LANG`,
`LC_ALL`, `TMPDIR`, `SHELL` and `CLAUDE_CONFIG_DIR` in its environment. The player's text goes in on stdin.

**End to end** (`claudeCodeAssistant` against the stand-in server, haiku): the tool was called, its result came
back as a `tool` event, and the reply quoted the figure.

**Fail closed on the init line:** the run is killed before any answer is read unless every tool is
`mcp__<ours>__*`, the only MCP server is ours and connected, and skills and slash commands are empty.

## The conversation kept on the player's device

The panel keeps the conversation in `localStorage` (`ui/conversation.ts`), so a reload doesn't lose it. The
player can edit what's stored there, and Audit's review of #41 set how far it's trusted:
- Every stored turn is checked against the exact shape the panel wrote. A turn that doesn't fit is dropped, and
  restoring never crashes.
- Restored text is shown as plain text: a stored `{{a1}}` stays literally that, and nothing restored is
  rendered or resolved.
- All history from the browser, restored or not, goes to the model in one fence, introduced as "the
  conversation so far, as reported by the player's browser". The server can't tell its own past replies from
  forged ones, so history is the player's data, never the assistant's own words, and its braces are broken up.

**Residual risk:** someone who edits their own storage changes only what they see on their own screen. They
could show themselves a forged figure. That's self-inflicted, and it reaches no one else.

**Follow-up:** keep the conversation server-side in the save once Frank's save layer exists, so history the
model reads is the server's own. Not built yet.
