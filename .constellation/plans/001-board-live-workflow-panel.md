---
status: draft
task: 001-board-live-workflow-panel.md
date-created: 03-10-2026
last-edit: 03-10-2026
---
# Board phase 1 — live workflow panel on localhost

## Overview

**Problem**: Between orchestrator save points nothing shows which agent
runs or how long it has run. The progress banner appears only in the
terminal, only at save time, and timestamps in the metrics log are written
from the model's memory, so every one of them lands on a five-minute mark.

**Impact**: The user watches one in-flight workflow on a second screen with
no token cost. The harness gains a deterministic event log with real
timestamps that later phases and `/constellation:metrics` can trust.

**Scope**:

- In: a hook script that appends agent events to a JSONL file; a clock rule
  for the orchestrator; a zero-dependency Node script that watches two
  paths and serves one HTML page with Server-Sent Events.
- Out: markdown parsing, the backlog tree, any write action from the page,
  automatic process start by the plugin, a `/constellation:board` command,
  historical charts, multi-project views. All of these belong to task 002.

**Blocks**: task 002 (it extends `board.mjs` and the event log).
**Blocked By**: nothing.

## Acceptance Criteria

The six criteria on the task file apply verbatim. Technical notes:

1. Step resolution must reuse the statusline rules: filter `optionalIf`
   steps by `crossModelValidation`, append `post-pr` after `devops-pr`
   while current, pointer never moves backward, unknown step id renders raw.
2. "Within 2 seconds" is met by `fs.watch` on the two directories plus a
   2-second mtime poll as fallback.
3. Timestamps come from `date -u +%Y-%m-%dT%H:%M:%SZ` inside the hook
   script. The page pairs start and stop events by `agent_id`.
4. Absence of the state file is a normal state, not an error.
5. The orchestrator skill tells the model to run the clock command before
   every save and every metrics append, and forbids a remembered value.
6. The server opens files read-only and exposes no route that writes.

## Implementation

### Part A — hook event log (harness change)

**Files**:

- `plugins/constellation/scripts/log-event.sh` - Create - Reads the hook
  JSON on stdin, appends one line to
  `.constellation/metrics/events.jsonl`, always exits 0.
- `plugins/constellation/hooks/hooks.json` - Modify - Register the script
  on `SubagentStart`, `SubagentStop`, `Stop`, and `PostToolUse` with
  matcher `Write|Edit`.

**Behavior of `log-event.sh`**:

- Exit 0 at once when `.constellation/config.json` is absent or `jq` is
  missing. Same gate as `session-start.sh` and `guard-git.sh`.
- Create `.constellation/metrics/` when missing. The directory is already
  gitignored by the project template.
- Record `ts`, `event` (from `hook_event_name`), `session_id`, `agent_id`,
  `agent_type`, and for `PostToolUse` the `tool_input.file_path` made
  relative to the project.
- For `PostToolUse`, log only when the path starts with `.constellation/`.
  This captures state saves and task status edits with a real timestamp
  and keeps source-code edits out of the log in this phase.
- Never print to stdout. Never block. A failure to write is silent.

**Line format**:

```json
{"ts":"2026-10-03T14:02:11Z","event":"SubagentStart","session_id":"…","agent_id":"…","agent_type":"constellation:software-engineer"}
{"ts":"2026-10-03T14:09:40Z","event":"PostToolUse","session_id":"…","file":".constellation/state/current-workflow.json"}
```

### Part B — clock rule (harness change)

**Files**:

- `plugins/constellation/skills/orchestrator/SKILL.md` - Modify - In
  "Workflow State Persistence" and "Workflow Metrics", replace the
  `<ISO timestamp>` placeholders with a rule: before each save or append,
  run `date -u +%Y-%m-%dT%H:%M:%SZ` with the Bash tool and paste the
  output. Add one line to the ALWAYS list: never write a timestamp from
  memory.
- `plugins/constellation/templates/statusline.sh` - No change - It already
  computes elapsed time from `startedAt`, so it benefits directly.

### Part C — board server (new)

**Files**:

- `plugins/constellation/scripts/board.mjs` - Create - Single file, Node
  20 or later, no npm dependencies. Arguments: project directory (default:
  current directory), `--port` (default 4411).
- `plugins/constellation/scripts/board.test.mjs` - Create - Tests for the
  pure functions with `node --test`.

**Key Functions** (all in `board.mjs`):

- `loadSnapshot(projectDir)` - Reads `state/current-workflow.json`,
  `tracks.json`, `config.json`, and the last 200 lines of
  `metrics/events.jsonl`. Returns `{state, steps, events, stale}`. On a
  JSON parse error it keeps the last good snapshot and sets `stale: true`.
- `resolveSteps(state, tracks, config)` - Pure. Ports the jq logic of the
  statusline to JavaScript. Returns the ordered step list with one of
  `done | current | pending` per step, plus `n` and `N`.
- `pairEvents(lines)` - Pure. Joins `SubagentStart` and `SubagentStop` by
  `agent_id`, computes duration, flags agents still running.
- `watch(projectDir, onChange)` - `fs.watch` on `.constellation/state/`
  and `.constellation/metrics/` when they exist, plus a 2-second poll of
  the two file mtimes. Debounces 150 ms. Re-arms when a directory appears.
- `serve(port)` - Routes: `GET /` inline HTML, `GET /api/snapshot` JSON,
  `GET /events` SSE that pushes the snapshot on every change. Binds to
  `127.0.0.1` only.

**Data Flow**: hook or orchestrator writes a file → watcher fires →
`loadSnapshot` → SSE push → browser re-renders.

**Page layout** (one HTML string, no framework):

- Header: project directory, branch, track, `n/N`, stale badge when set.
- Step strip: one cell per step with emoji and label from `tracks.json`,
  marked done, current, or pending. Modifiers under it: `⛔ awaiting your
  decision` from `waitingOn`, `🔁 loop N/3` from `reviewLoopCount`.
- Facts row: elapsed since `startedAt`, token delta computed as
  `accumulated + sessionStart − lastKnownRemaining`, task filename, PR
  number when set.
- Feed: newest first, agent type, start time, duration or "running".
- Empty state: "No workflow in flight" with the directory watched.

## Validation

**Automated Test**: `plugins/constellation/scripts/board.test.mjs`

- Run: `node --test plugins/constellation/scripts/*.test.mjs`
- `resolveSteps` with fixtures for the four banner examples in SKILL.md:
  planned 6/10, planned with loop, tweak 4/7, planned 10/11 with post-pr.
  Expected: the same `n/N` and the same current step as the examples.
- `resolveSteps` with an unknown step id. Expected: the raw id renders as
  current, no throw.
- `pairEvents` with a start without a stop. Expected: `running: true`.
- `loadSnapshot` on a directory with a truncated state file. Expected:
  previous snapshot returned, `stale: true`.
- No mocking. The track map fixture is the real `templates/tracks.json`;
  state fixtures are inline objects in the test file.

**Automated Test**: `log-event.sh`

- Run: `printf '%s' '{"hook_event_name":"SubagentStart","session_id":"s1","agent_id":"a1","agent_type":"x","cwd":"<tmp>"}' | CLAUDE_PROJECT_DIR=<tmp> plugins/constellation/scripts/log-event.sh`
  inside a temp dir that holds `.constellation/config.json`.
- Expected: exit 0, one line appended, `ts` matches
  `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$`.
- Repeat without `config.json`. Expected: exit 0, no file created.
- Wrap both in `plugins/constellation/scripts/log-event.test.sh`.

**MANUAL TEST**: end to end on a consumer project

- Why manual: it needs a live Claude Code session that spawns subagents.
- Preconditions: a project initialized with `/constellation:init`, for
  example `/Users/joaooliveira/study/user-service`. This repository is not
  initialized and cannot serve as the target.
- Steps: run `node plugins/constellation/scripts/board.mjs
  /Users/joaooliveira/study/user-service`, open `http://127.0.0.1:4411`,
  start a tweak workflow in that project, watch the page.
- Expected: the step strip matches the printed banner at every save; the
  feed shows each specialist within 2 seconds of its start; the page shows
  the empty state after the workflow completes and the state file is
  deleted.
- Observability: `GET /api/snapshot` returns the same data the page shows.

## Integration Touchpoints

- **hooks.json** - Could break: a malformed entry disables every plugin
  hook, including the git guard - Validation: `claude plugin validate
  plugins/constellation` passes, and a session in the consumer project
  still blocks `git push origin main`.
- **Tool latency** - Could break: every Write and Edit now spawns bash and
  jq - Validation: measure one hook run; accept under 50 ms.
- **statusline.sh and SKILL.md banner** - Could break: nothing, they are
  not modified - Validation: `resolveSteps` fixtures are the banner
  examples, so the three views stay in agreement.
- **metrics/ gitignore** - Could break: a project that copied an old
  template without `metrics/` ignored would commit the event log -
  Validation: `session-start.sh` already warns on uncommitted artifacts;
  add `events.jsonl` to the README note on the gitignore template.

## Risks

1. **Hook noise or duplicates** - Impact: L - Likelihood: M - The feed
   dedupes by `agent_id` and event name; duplicates collapse.
2. **`fs.watch` misses events on macOS** - Impact: M - Likelihood: M - The
   2-second poll guarantees a floor; the watcher only makes it faster.
3. **The model skips the clock command** - Impact: M - Likelihood: M - The
   hook log carries the authoritative time for agent events, so the page
   never depends on the model's value. The rule in SKILL.md improves the
   metrics log; it does not gate the page.
4. **Port in use** - Impact: L - Likelihood: L - Print the error and the
   `--port` flag, exit 1. Automatic port selection belongs to task 002.
5. **Node version** - Impact: L - Likelihood: L - Require Node 20 or later
   and print one line when older. Consumer projects are NestJS, so Node is
   present.

## Open Questions

- [ ] Default port: 4411 is a placeholder. Confirm or choose another.
- [ ] Keep `PostToolUse` logging limited to `.constellation/` paths in this
      phase, or log every Write and Edit path from the start?
- [ ] Should the hook also log `Stop` events? They mark the end of each
      orchestrator turn and make the feed show when the main session
      waits for the user. Proposed: yes, they are cheap.
