# Spike: Constellation Harness → OpenCode port

A working prototype of the `.opencode/` layout that runs the Constellation Harness inside
[OpenCode](https://opencode.ai). It demonstrates the port of each extension type and, crucially,
the **hook rewrite** — the one part that is not a file copy.

Not wired into the marketplace or CI. It's a reference for the effort estimate.

## What's here

```
docs/spikes/opencode-port/
├── opencode.json                          # project config (instructions, plugin array, model)
├── AGENTS.md                              # orchestrator policy = STATIC half of SessionStart
└── .opencode/
    ├── plugins/
    │   ├── constellation-guard.ts         # PreToolUse:Bash git guard  → tool.execute.before
    │   └── constellation-bootstrap.ts     # SessionStart dynamic checks → session.created event
    ├── agents/
    │   └── software-engineer.md           # sample ported agent (frontmatter converted)
    └── commands/
        └── status.md                      # sample ported command
```

## Component mapping (Claude Code → OpenCode)

| Claude Code | OpenCode | Effort | Notes |
|---|---|---|---|
| 25 × `SKILL.md` | `.opencode/skills/` **or** read straight from `.claude/skills/` | 🟢 ~0 | OpenCode reads `.claude/skills/` natively. `allowed-tools`/`model` frontmatter is silently ignored — scope tools via agent `permission` instead. |
| 12 × agent `.md` | `.opencode/agents/*.md` | 🟡 low | `model: sonnet`→`anthropic/claude-sonnet-4-5`; drop `skills:`; add `mode: subagent` + `permission`. See `software-engineer.md`. |
| 11 × command `.md` | `.opencode/commands/*.md` | 🟡 low | Drop `disable-model-invocation`/`argument-hint`; de-namespace `constellation:` refs; lose the `/constellation:` prefix (rename to avoid clashes). See `status.md`. |
| `hooks.json` + 2 shell scripts | `.opencode/plugins/*.ts` | 🔴 **rewrite** | Declarative shell hooks → imperative TS. See both plugins. |
| MCP (`mcpServers`) | `mcp` in `opencode.json` | 🟢 trivial | Constellation ships none. |
| plugin.json + marketplace.json | *no equivalent* | 🟠 | No single install bundle — you assemble the `.opencode/` dirs + an npm plugin for the hooks. |

## The hook rewrite — where the real work is

### `constellation-guard.ts` (was `guard-git.sh`, a `PreToolUse` hook on `Bash`)
- Claude Code: stdin JSON in, **exit code 2 + stderr** to block.
- OpenCode: `tool.execute.before(input, output)` handler; **`throw new Error(msg)`** to block.
- `input.tool === "bash"`, command at `output.args.command`.
- All rules port 1:1: no `--no-verify`, no push to main, gates-before-remote, artifacts-before-push, no commit on main, no staging secrets. The `GIT_SUB` subcommand-anchor regex is translated verbatim (`[[:space:]]`→`\s`).
- **Bonus:** the `jq` dependency is gone — config/state parse with the runtime's JSON.

### `constellation-bootstrap.ts` (was `session-start.sh`, a `SessionStart` hook)
This one exposes the **one genuine gap**. `session-start.sh` does two jobs:
1. **STATIC** — prints the orchestrator routing policy into session context.
2. **DYNAMIC** — warns about an unfinished workflow / uncommitted artifacts.

OpenCode has **no confirmed hook that injects text into the model's context at session start**. So the port splits the job:
- **(1) → `AGENTS.md`** (always-loaded instructions). Clean, but static — it can't do the conditional/dynamic bits.
- **(2) → this plugin**, on the `session.created` event. But it can only *surface* warnings (toast + log), not put them in-context the way the exit-0 stdout of the shell hook did.

That degradation (advisory notice vs in-context instruction) is the fidelity cost to accept — or to close later if the installed `@opencode-ai/plugin` exposes an experimental system-prompt-transform hook.

## Open items before this is production-grade
1. **Pin the SDK surface.** `client.tui.showToast(...)` in the bootstrap plugin is best-effort — confirm the real method against the installed `@opencode-ai/plugin` package; the `event` payload types too.
2. **Verify orchestration semantics.** The 787-line `orchestrator` skill assumes Claude Code's Agent tool + `subagent_type`. OpenCode invokes subagents via `task`/`@mention` and gates parallelism differently. Porting the *files* is done; making the *workflow* behave identically needs a live run.
3. **Distribution.** Decide: ship an npm plugin (for the two hooks) + loose `.opencode/` dirs, vs a repo template. No one-shot marketplace bundle exists.
4. **The other 10 agents / 10 commands / 25 skills** follow the exact deltas shown in the two samples — mechanical, scriptable.

## Try it (rough)
```bash
cp -r docs/spikes/opencode-port/{opencode.json,AGENTS.md,.opencode} /path/to/an/initialized/project/
cd /path/to/an/initialized/project/     # must have .constellation/config.json
# .opencode/package.json with @opencode-ai/plugin, then: bun install
opencode
# then try to `git commit` on main, or `git add .env` — the guard should throw.
```

## Effort (recap)
- **Loads and mostly works:** ~1–2 days (copy skills, tweak frontmatter, the two hook plugins, AGENTS.md).
- **Faithful port** (SessionStart parity, resume UX, gate parallelism verified): ~1–2 weeks, most of it in the hook rewrite + validating the orchestrator against OpenCode's invocation model.
