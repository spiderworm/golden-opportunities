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
it. That's one sample, not a guarantee: the system prompt still forbids any figure not returned by a tool in
this turn, and the UI shows the source of each figure, so a figure with no source stands out.

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
- Restored turns go to the model in their own fence, as "an earlier conversation, as stored on the player's
  device". They are the player's data, never the assistant's own words, and their braces are broken up.

**Residual risk:** someone who edits their own storage changes only what they see on their own screen. They
could show themselves a forged figure. That's self-inflicted, and it reaches no one else.

**Follow-up:** keep the conversation server-side in the save once Frank's save layer exists. Not built yet.
