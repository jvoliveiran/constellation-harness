---
status: draft
task: 002-board-backlog-tree-and-packaging.md
date-created: 03-10-2026
last-edit: 05-10-2026
---
# Board phase 2 — backlog tree, transition witness, and packaging

## Overview

**Problem**: After phase 1 the page shows the one workflow in motion but
nothing about what is queued, parked, or shipped. That view still costs a
model call through `/constellation:tasks` and `/constellation:backlog`, and
the model re-derives the tree each time. Task status transitions have no
timestamp. The server must be started by hand with a long path.

**Impact**: The user sees the whole work hierarchy next to the live panel.
Status changes carry real timestamps. The portfolio commands can read one
deterministic JSON instead of parsing front-matter with the model. The
server starts with the session.

**Scope**:

- In: a lenient front-matter parser exposed as a CLI that emits JSON; the
  backlog tree on the page; task status transitions in the feed; the
  monitors entry that starts the server; a `/constellation:board` command
  that prints the URL; the portfolio commands optionally shelling out to
  the parser.
- Out: any write or drag action on the page; historical charts from the
  metrics log; multi-project views; an MCP server of any kind; migration
  of v0 projects to the v1 layout.

**Blocks**: nothing.
**Blocked By**: task 001 (`board.mjs`, `log-event.sh`, the clock rule).

## Acceptance Criteria

The six criteria on the task file apply verbatim. Technical notes:

1. Tree derivation follows the artifact model: links point up only, so the
   parser builds the tree from child front-matter. Plan maturity comes
   from `plans/NNN-<slug>.md` with the same number and slug as the task.
2. Lenient means: accept a title line before the opening `---`, accept
   unknown fields, accept `tasks/archive/` and `plans/archive/`. Malformed
   means: no front-matter block found, or `status` missing. Both carry a
   one-line reason.
3. A transition is detected by the board's own watcher: when a task file
   changes on disk, compare its parsed `status` before and after, and use
   the file's mtime as the transition time. Do not rely on `PostToolUse`
   for this. Observed live on 05-10-2026 in guardei-ui: the orchestrator
   writes the state file through a Bash heredoc, so the `Write|Edit` hook
   never sees `.constellation/` saves. The hook log remains the source for
   agent lifecycle only.
4. The monitor command exits 0 within 100 ms when `config.json` is absent.
5. `/constellation:board` prints the URL and whether the server answers,
   and never starts a second server for the same project.

## Implementation

### Part A — shared parser

**Files**:

- `plugins/constellation/scripts/constellation-parse.mjs` - Create - CLI
  and importable module. `node constellation-parse.mjs <projectDir>`
  prints one JSON document to stdout.
- `plugins/constellation/scripts/constellation-parse.test.mjs` - Create.

**Key Functions**:

- `parseFrontMatter(text)` - Pure. Finds the first `---` block within the
  first 20 lines, tolerates a leading title line, parses `key: value`
  pairs only (no nested YAML), strips inline comments. Returns
  `{fields, body, warnings}`.
- `scanProject(projectDir)` - Reads `epics/`, `features/`, `tasks/`,
  `tasks/archive/`, `plans/`, `plans/archive/`, `artifacts/`. Missing
  directories yield empty arrays, not errors.
- `buildTree(scan)` - Pure. Attaches tasks to features by `feature:`,
  features to epics by `epic:`, plans to tasks by number and slug. Orphans
  and feature-less tasks sit at the root. Returns the tree plus a flat
  `tasks` array with `malformed` and `lenient` flags.

**Output shape**:

```json
{
  "epics": [{"file":"E01-mvp-launch.md","status":"active","features":[…]}],
  "orphans": {"features":[…],"tasks":[…]},
  "tasks": [{"file":"014-export-csv.md","status":"refined","type":"feature","plan":{"file":"014-export-csv.md","status":"approved"},"flags":[]}],
  "warnings": [{"file":"plans/011-….md","reason":"title before front-matter"}]
}
```

### Part B — page extensions in `board.mjs`

**Files**:

- `plugins/constellation/scripts/board.mjs` - Modify - Import
  `scanProject` and `buildTree`. Watch `tasks/`, `features/`, `epics/`,
  `plans/` in addition to the phase 1 paths. Add the tree to the snapshot.
- `plugins/constellation/scripts/board.test.mjs` - Modify - Add fixtures.

**Key Functions**:

- `diffStatuses(prevTasks, nextTasks, event)` - Pure. For each task whose
  `status` changed, emits `{file, from, to, ts: event.ts}`. Appended to
  the feed and kept in memory for the session only.
- Tree panel rendering: epics as sections, features as groups, tasks as
  rows with status icon, type, plan maturity, in-flight marker with the
  current step, malformed or lenient badge with the reason on hover.
  Toggle for archived tasks. Group order matches `/constellation:tasks`:
  inbox, refined, in-progress, parked, done, dropped, malformed.

### Part C — transition witness (board change, hook widening)

**Files**:

- `plugins/constellation/scripts/board.mjs` - Modify - The watcher already
  fires on task file changes; keep the previous parsed `status` per task
  in memory and emit a transition with the file mtime when it differs.
  Also record state-file saves as activity from the watcher, since the
  orchestrator saves through Bash and no hook witnesses them.
- `plugins/constellation/scripts/log-event.sh` - Modify - Widen the
  `PostToolUse` filter from `.constellation/` only to every Write and Edit
  path, relative to the project. The page shows source edits as a quiet
  activity line under the running agent. Source edits do go through the
  Write and Edit tools, so this part of the hook path is sound.

### Part D — packaging

**Files**:

- `plugins/constellation/.claude-plugin/plugin.json` - Modify - Add
  `experimental.monitors` with one entry: `node
  "${CLAUDE_PLUGIN_ROOT}/scripts/board.mjs" --quiet`, `when: "always"`,
  description "Constellation board on localhost".
- `plugins/constellation/scripts/board.mjs` - Modify - `--quiet` mode:
  exit 0 at once when `.constellation/config.json` is absent in the
  current directory; on `EADDRINUSE`, probe `GET /api/snapshot` on that
  port, and when it reports the same project directory exit 0, otherwise
  try the next port up to five times; write the chosen URL to
  `.constellation/state/board.url`.
- `plugins/constellation/commands/board.md` - Create - Reads
  `.constellation/state/board.url`, probes the URL, prints it with
  "running" or "not running", and prints the manual start command when not
  running. Read-only, like the other portfolio commands.
- `plugins/constellation/templates/gitignore` - No change - `state/` is
  already ignored, so `board.url` is too.

### Part E — portfolio commands read the parser (optional, last)

**Files**:

- `plugins/constellation/commands/tasks.md`,
  `plugins/constellation/commands/backlog.md` - Modify - Add step 0: when
  `node` is available, run `constellation-parse.mjs` and render from its
  JSON; otherwise follow the existing procedure. Output format unchanged.

This part is droppable without affecting the others. Drop it first when
the plan runs long.

## Validation

**Automated Test**: `constellation-parse.test.mjs`

- Run: `node --test plugins/constellation/scripts/`
- Fixture: a copy of the v1 layout from `docs/specs/artifact-model-v1.md`
  with one epic, two features, four tasks, two plans. Expected: tree
  depth and counts match, plan maturity attached to the right tasks.
- Fixture: a plan with a title line before `---` and a `version` field,
  as found in the consumer project. Expected: parsed, `lenient` flag,
  warning text "title before front-matter".
- Fixture: a task without front-matter. Expected: `malformed` flag,
  present in `tasks`, absent from no list.
- Fixture: empty `.constellation/`. Expected: empty arrays, no throw.
- `diffStatuses` with one task moving `refined` to `in-progress`.
  Expected: one transition with the event timestamp.

**Automated Test**: packaging

- `claude plugin validate plugins/constellation` passes with the monitors
  entry.
- Run `board.mjs --quiet` in a temp dir without `config.json`. Expected:
  exit 0, no port opened, under 100 ms.
- Start two instances on the same project. Expected: the second exits 0
  and `board.url` still points at the first.

**MANUAL TEST**: session start on a consumer project

- Why manual: monitors run only in interactive sessions.
- Preconditions: the plugin installed from this repository; the consumer
  project at `/Users/joaooliveira/study/user-service`.
- Steps: start a session there, run `/constellation:board`, open the URL,
  file a task through a tweak workflow, watch the tree and the feed.
- Expected: the server runs without a manual start; the new task appears
  in the inbox group within 2 seconds; its move to `in-progress` at branch
  creation appears in the feed with a timestamp; the session end stops the
  process (verify with `lsof -i :4411` after exit).
- Expected on this repository: no server starts, because there is no
  `config.json`.

## Integration Touchpoints

- **plugin.json** - Could break: a strict-object error in the monitors
  entry stops the whole plugin from loading - Validation: `claude plugin
  validate`, then a session that still loads the orchestrator policy.
- **Portfolio commands** - Could break: output drift between the parser
  and the model procedure - Validation: run `/constellation:tasks` on the
  consumer project before and after Part E and compare the table.
- **Hook volume** - Could break: logging every Write and Edit grows
  `events.jsonl` faster - Validation: the server reads only the tail;
  rotate the file at 5 MB from the hook script.
- **Consumer projects on v0 layout** - Could break: nothing, the parser
  returns empty arrays for missing directories - Validation: the page on
  `user-service` shows an empty tree and a warning count, not an error.

## Risks

1. **The monitors field is experimental** - Impact: M - Likelihood: M -
   Keep the manual start command documented and printed by
   `/constellation:board`; the page must not depend on the monitor.
2. **Front-matter in the wild diverges further** - Impact: L -
   Likelihood: H - The parser never throws on content; everything lands
   in the tree with a flag and a reason.
3. **Parser and commands disagree** - Impact: M - Likelihood: M - Part E
   makes the parser the source for the commands; until then the fixtures
   are built from the command's documented output format.
4. **Stale `board.url`** - Impact: L - Likelihood: M - The command probes
   the URL before printing it and labels it not running on failure.
5. **Scope creep toward write actions** - Impact: H - Likelihood: H - The
   page exposes no write route. Any future write goes through an intent
   file the orchestrator consumes under the transition rules, never
   through direct front-matter edits. Record this as an ADR when phase 2
   ships.

## Open Questions

- [ ] Part E: adopt for all five portfolio commands, or only `tasks` and
      `backlog` in this phase?
- [ ] Monitor `when`: `always`, or `on-skill-invoke:orchestrator` so the
      server starts only when a workflow begins?
- [ ] Should transitions also be appended to `events.jsonl` by the server,
      so they survive a restart? Proposed: no, the server stays read-only
      toward `.constellation/`.
