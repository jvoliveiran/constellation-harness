---
status: approved
task: 002-board-backlog-tree-and-packaging.md
date-created: 03-10-2026
last-edit: 06-10-2026
---
# Board phase 2 — backlog tree, transition witness, and packaging

## Overview

**Problem**: After phase 1 the page shows the one workflow in motion and
nothing about what is queued, parked, or shipped. Task status changes carry
no real timestamp. The server starts only by hand, with a long path.

**Impact**: The user sees the work hierarchy next to the live panel. Status
changes appear in the feed with the file write time. The server starts with
the session and `/constellation:board` prints its URL.

**Scope**:

- In: a lenient front-matter parser, a tree builder, a status differ, a feed
  merger, and a backlog renderer as pure functions in `board.mjs`; a backlog
  panel on the page; task status transitions in the feed; crash safety in
  the scan and the refresh; a `Host` header check; a `--quiet` start mode
  with standby; the `experimental.monitors` entry in the manifest; a
  `/constellation:board` command; two phase 1 page fixes (tooltip rebuild,
  dead-server display).
- Out: a parser module or CLI (task `003-board-parser-cli-for-portfolio-commands.md`);
  any change to the portfolio commands (task 003); automatic port selection
  (task `004-board-automatic-port-selection.md`); archive directories and the
  `--all` and derived-completion rules of `/constellation:backlog` (task
  `005-board-archive-dirs-and-backlog-parity.md`); any change to
  `log-event.sh` or `hooks.json`; a `board.url` file; a `SessionEnd` hook;
  write actions on the page; historical charts; multi-project views;
  migration of v0 projects.

**Blocks**: tasks 003, 004, 005 build on the functions of this plan.
**Blocked By**: task 001 (`board.mjs`, `log-event.sh`, the clock rule) — done
in 1.2.0 and 1.2.1.

**Track**: purely technical work on internal harness tooling. No PM pairing.

## Scope review

The task carries six criteria. This plan keeps all six and adds the fixes
that a review reproduced against the phase 1 code.

| # | Criterion | Decision | Reason |
|---|---|---|---|
| 1 | Tree with status, type, plan maturity, in-flight step | Keep | Core of the phase. Parser, tree builder, renderer, one panel. |
| 2 | Malformed or lenient badge, never hidden | Keep | Warnings become flags. A "Needs attention" group and an `other` status group make sure that no file drops out. |
| 3 | Transition in the feed with a real timestamp within 2 s | Keep | The existing watcher plus the file mtime. Poll lowered to 1500 ms. |
| 4 | Server starts with the session, URL via `/constellation:board` | Keep | `experimental.monitors` verified against the CLI. Interactive sessions only. |
| 5 | Not initialized: silent exit, no process left | Keep | One `--quiet` gate on `config.json` before any other work. |
| 6 | Page stays read-only | Keep | No new route. 405 on non-GET, 403 on a foreign `Host`. |

Deferred to filed tasks, with the reason:

- **Parser module, parser CLI, and portfolio commands that shell out to
  it** → task 003. No criterion needs a CLI.
- **Automatic port selection** → task 004. Standby (F7) removes the
  same-project failure. Only the cross-project collision remains.
- **Archive directories and parity with `/constellation:backlog`** → task
  005. No criterion mentions archives.

Removed with no task: widening `log-event.sh`; state-file saves as activity;
`.constellation/state/board.url`; an HTTP probe inside the server; a
`SessionEnd` hook (Claude Code stops monitors at session end).

## Acceptance Criteria

The six criteria on the task file apply verbatim. Technical notes:

1. Links point up only, so `buildTree` attaches children by their own
   front-matter. A plan attaches to a task through its `task:` field first,
   then through an equal file name (I3). The in-flight task is the one
   whose file name equals `state.task`; the node then carries
   `state.currentStep`.
2. Lenient and malformed rules are in Part A. Every node carries `flags` and
   `warnings`. A flagged node renders in its own group and also in the
   "Needs attention" group at the top, which never collapses. A task with a
   status outside the six known values renders in the `other` group. The
   pure `renderBacklog` makes this criterion an automated test.
3. `loadSnapshot(dir, prev)` compares each task's `status` with the previous
   snapshot and records a transition with the task file's mtime as `ts`.
   The mtime is a real clock value written by the operating system. The
   hook cannot witness these writes: observed on 05-10-2026, the
   orchestrator saves through a Bash heredoc, so `PostToolUse` never fires
   for `.constellation/` files. The worst-case delay is `POLL_MS` (1500) plus
   `DEBOUNCE_MS` (150), under 2 seconds. A burst of more than 3 transitions
   in one refresh collapses into one summary entry (F8).
4. `experimental.monitors` in `plugin.json` starts
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board.mjs" --quiet` in the session
   working directory. `board.mjs` defaults `projectDir` to `process.cwd()`.
   `/constellation:board` probes `http://127.0.0.1:4411/api/snapshot`,
   compares `projectDir` with `pwd -P`, and prints the URL with `running` or
   `not running`. Monitors run in interactive sessions only; the command
   prints the manual start command as the fallback.
5. With `--quiet`, `main()` exits 0 before any `listen` call, any watcher, and
   any snapshot when `.constellation/config.json` is absent, and prints
   nothing. The gate is `config.json`, which matches `session-start.sh` and
   `log-event.sh`.
6. The server keeps `GET` as the only accepted method and adds no route. It
   replies 403 to any `Host` header other than `127.0.0.1:<port>` or
   `localhost:<port>`, on every route.

## Implementation

All server changes land in
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs`.
New logic goes in as exported pure functions in the "Pure functions"
section, so `board.test.mjs` imports them with no I/O. No new module is
created.

### Part A — parser, tree builder, differ, feed (pure)

**Constants** (top of file):

- `POLL_MS` - change from `2000` to `1500` (T1).
- `BURST_LIMIT = 3` - new (F8).
- `FEED_LIMIT = 30` - new (F4).
- `TRANSITION_CAP = 50` - new.
- `STANDBY_MS = 5000` - new (F7). `main()` reads `BOARD_STANDBY_MS` as a
  test-only override.
- `TASK_STATUSES = ['inbox', 'refined', 'in-progress', 'parked', 'done', 'dropped']` - new.
- `KNOWN_FIELDS` - new. Field names per kind, from
  `skills/orchestrator/references/artifact-model.md`:
  epic `status, date-created, last-edit`;
  feature `status, epic, order, date-created, last-edit`;
  task `status, type, source, feature, order, related, revisit, commit,
  date-created, last-edit`;
  plan `status, task, scope-approved-by, date-created, last-edit`.

**`parseFrontMatter(text, kind)`** - new, exported. Returns
`{ fields, warnings, malformed }`. Never throws on any string input.

1. Strip one leading BOM (`﻿`) (F3).
2. Split lines on `/\r?\n/` (F3).
3. Find the first line equal to `---` within lines 1 to 10. None → return
   `malformed: true`, warning `no front-matter`.
4. When that line is not line 1, add warning `title before front-matter`.
5. Find the next line equal to `---` within 40 lines after the opening one.
   None → return `malformed: true`, warning `unclosed front-matter` (I4).
6. For each line between: split on the first `:`. Skip a line without `:`.
   Trim the key. For the value: strip an inline ` # comment`, trim, then
   strip one matching pair of surrounding `"` or `'` (F3).
7. When a key is not in `KNOWN_FIELDS[kind]`, add warning
   `unknown field: <key>`.
8. Lowercase `fields.status` (F3). When `status` is absent or empty, set
   `malformed: true` and add warning `status missing`.

**`toNode(kind, file, text, mtime)`** - new, exported. Returns the wire node
(T3 — no raw `fields` map):
`{ kind, file, id, name, status, type, order, links, mtime, flags, warnings }`.

- `base` is the file name without `.md`. Split at the first `-`. When the
  prefix matches `/^(E\d+|F\d+|\d+)$/`, `id` is the prefix and `name` is the
  rest. Otherwise `id` is `null`, `name` is `base`, and the node gets
  warning `no number in file name` (I5).
- `status` is `fields.status ?? null`. `type` is `fields.type ?? null`.
  `order` is `Number(fields.order)` when finite, else `null`.
- `links` holds only `epic`, `feature`, and `task` when present.
- `mtime` is an ISO string.
- `flags` is `['malformed']` when the parse is malformed, else `['lenient']`
  when there is any warning, else `[]`.

**`buildTree(nodes, state)`** - new, exported. Input: the flat node list plus
the parsed state file or `null`. Output:

```json
{
  "epics": [{ "file": "E01-mvp-launch.md", "status": "active", "flags": [], "warnings": [], "features": [] }],
  "orphanFeatures": [],
  "standaloneTasks": [],
  "orphanPlans": [],
  "tasks": [{ "file": "014-export-csv.md", "status": "refined", "group": "refined", "type": "feature", "plan": { "file": "014-export-csv.md", "status": "approved" }, "flags": [], "warnings": [], "inFlight": false, "currentStep": null }],
  "attention": [{ "kind": "task", "file": "015-x.md", "flags": ["malformed"], "warnings": ["status missing"] }],
  "counts": { "inbox": 0, "refined": 1, "in-progress": 0, "parked": 0, "done": 0, "dropped": 0, "other": 0, "malformed": 0 }
}
```

Logic:

1. Features attach to an epic by `links.epic`; tasks attach to a feature by
   `links.feature`. A link target that does not exist adds warning
   `missing link: <target>` and flag `lenient`. The node then sits in
   `orphanFeatures` or `standaloneTasks`.
2. Plans (I3): when `links.task` names an existing task, attach to it. Else
   attach to the task with the same file name. When `links.task` is set and
   differs from the plan file name, add warning `task link mismatch` and
   flag `lenient`. When no task matches, push the plan to `orphanPlans` with
   warning `plan without task` and flag `lenient`.
3. Task `group`: the status when it is in `TASK_STATUSES`, else `other`.
   When the status is set but unknown, add warning
   `unknown status: <value>` and flag `lenient` (F3). A task with no status
   is malformed and also goes to `other`.
4. `counts`: one per group, plus `malformed` for nodes flagged malformed.
5. `attention`: every epic, feature, task, and plan with a non-empty
   `flags`, in file-name order.
6. In flight: the task whose `file` equals `state?.task` gets
   `inFlight: true` and `currentStep: state.currentStep`.
7. Sort every sibling list by `order` (nulls last), then file name.
8. A flag added in steps 1 to 3 never replaces `malformed`. When a node
   holds `malformed`, keep only `malformed` in `flags`.

**`diffStatuses(prevTasks, nextTasks)`** - new, exported. Returns
`[{ kind: 'transition', file, from, to, ts }]`, with `ts` from the next
node's `mtime`.

- `prevTasks` is `null` → `[]`.
- Skip a pair when the next node has no status or is malformed (F8).
- Skip a pair when the previous node existed but had no status (F8).
- A file absent from `prevTasks` yields `from: null`.
- Equal status → no entry.

**`collapseBurst(transitions, limit = BURST_LIMIT)`** - new, exported (F8).
When `transitions.length > limit`, return one entry
`{ kind: 'summary', summary: true, count: n, ts: <newest ts>, items: transitions }`.
Else return the input unchanged. The `items` field keeps the per-file
`from` and `to` in `/api/snapshot` (see the criterion 3 note in "Conflicts").

**`mergeFeed(activity, transitions, limit = FEED_LIMIT)`** - new, exported
(F4). Tags each activity entry with `kind: 'event'`. Concatenates both
lists, sorts by `Date.parse(ts)` newest first (entries without a parseable
`ts` go last), and returns the first `limit` entries. Do not use
`localeCompare` here: hook stamps have no milliseconds and mtimes do.

**`safeRefresh(load, prev, projectDir)`** - new, exported (F1). Calls
`load()`. On a throw, returns a copy of `prev` with
`errors: [...prev.errors, 'refresh failed: <message>']`. When `prev` is
`null`, returns `emptySnapshot(projectDir)` with that one error.
`emptySnapshot(projectDir)` returns every snapshot field with an empty value:
`state: null`, `progress: null`, `agents: []`, `activity: []`, `feed: []`,
`tree: null`, `transitions: []`, `stale: false`, `initialized: true`.

**`renderBacklog(tree, esc)`** - new, exported (I1, I2). Returns an HTML
string. Rules for the function body: no reference to module scope, no
import, no `</script>` sequence, plain `function` syntax. Glyph maps live
inside the function. `PAGE` injects it with `${renderBacklog.toString()}`.

- `tree` is `null` or has no node → `<div class="empty">No work items</div>`.
- First, when `tree.attention` is not empty: a block "Needs attention" that
  lists every flagged item with its badge and its warnings. Never collapse
  this block.
- Then epics as headings, features as groups, tasks as rows, then the
  `(no epic)` and `(standalone tasks)` groups, then `orphanPlans`.
- Task row: status glyph of `/constellation:tasks` (`📥 📋 🔨 🅿️ ✅ 🚫`, `❓`
  for `other`), `id` and `name`, `type`, the plan glyph (`📝` draft, `👍`
  approved) when a plan exists, `▶ <currentStep>` when in flight, and a
  badge `lenient` or `malformed`.
- Warnings render inline as `<div class="warn-line">` under the row, dim and
  small (F5). The row may keep a `title` with the same text.
- Inside each feature group and the standalone group, tasks render in
  group order: inbox, refined, in-progress, parked, other, then `done` and
  `dropped` inside `<details data-group="<group-key>:done">` and
  `<details data-group="<group-key>:dropped">`. The `<summary>` shows
  `<n> done` or `<n> dropped`. A collapsed task still appears in "Needs
  attention" when it is flagged.
- Pass every file name, status, type, step, and warning through `esc`.

### Part B — scan, snapshot, and watcher (I/O)

- `paths(projectDir)` - Modify - Add `epicsDir`, `featuresDir`, `tasksDir`,
  `plansDir`.
- `scanWorkItems(p)` - Create (F1). For each of the four directories:
  `readdirSync` in try/catch; a missing directory yields no nodes and no
  error. Skip every entry whose name starts with `.`. Keep only names that
  end in `.md`. Per file, wrap `readFileSync` and `statSync` in one
  try/catch. `ENOENT` → skip the file silently (a race or a dangling
  symlink). Any other code → push a node with `status: null`,
  `flags: ['malformed']`, `warnings: ['unreadable: <code>']`. Else call
  `toNode`.
- `loadSnapshot(projectDir, prev)` - Modify - Add three fields, keep every
  existing field and value:
  - `tree` = `buildTree(scanWorkItems(p), state)`.
  - `transitions` = `[...collapseBurst(diffStatuses(prev?.tree?.tasks ?? null, tree.tasks)), ...(prev?.transitions ?? [])].slice(0, TRANSITION_CAP)`.
  - `feed` = `mergeFeed(activity, transitions)`.
  `errors` stays `[]` when a work directory is missing.
- `watch(projectDir, onChange)` - Modify - `armAll` adds the four
  directories. `signature(p)` appends, per directory, one
  `name=mtimeMs:size` stamp per `.md` file, sorted by name (T4). A missing
  directory adds `-`. A stat error adds `name=-`.

**Data Flow**: an editor or the orchestrator writes a task file → `fs.watch`
or the 1500 ms poll fires → debounce 150 ms → `safeRefresh(loadSnapshot)` →
`diffStatuses` and `collapseBurst` → SSE push → the page renders the tree
and the feed.

### Part C — page (HTML string in `board.mjs`)

- Layout: add one full-width `<section>` "Backlog" under `<main>`, with
  `<div id="backlog">`. Add the CSS classes `.warn-line` (11px, `--dim`)
  and `details summary` (pointer, `--dim`).
- Inject `${renderBacklog.toString()}` into the page script.
- `render()` - Modify:
  1. Before it replaces `#backlog`, collect the `data-group` ids of every
     open `<details>`. After the replace, set `open` on the same ids (I2).
  2. Feed (F4): the "No events yet" empty state shows only when
     `snap.agents` and `snap.feed` are both empty. Render the agent list as
     today. Render the Activity list from `snap.feed`, independent of
     `snap.agents`. Entry kinds: `event` as in phase 1; `transition` as
     `<hh:mm:ss> <file> <from> → <to>` (`from` null renders `new`);
     `summary` as `<hh:mm:ss> <n> task statuses changed at once (branch
     switch or pull?)`.
  3. Durations (F5): the elapsed fact and each running agent duration
     render as `<span data-since="<iso>" data-prefix="running ">`.
- Render schedule (F5): call `render()` on each SSE `message` and on each
  connection state change only. Replace `setInterval(render, 1000)` with
  `setInterval(tick, 1000)`. `tick()` updates the text of every
  `[data-since]` element to `data-prefix + fmtDur(now - since)` and touches
  nothing else.
- Connection state (F6): add `var connected = false, lostAt = null`.
  `es.onopen` sets `connected = true`, `lostAt = null`, then `render()`.
  `es.onmessage` also sets `connected = true`, `lostAt = null`.
  `es.onerror` sets `connected = false`, sets `lostAt = Date.now()` only when
  it is `null`, then `render()`. `render()` adds the badge
  `disconnected since HH:MM — showing last data` when `!connected && lostAt`.
  `now` for every duration (`since()` and `tick()`) is
  `connected ? Date.now() : lostAt`, so timers freeze.
- Keep the phase 1 markup of "Now" and "Agents" otherwise unchanged.

### Part D — packaging and server hardening

- `serve(getSnapshot, subscribe)` - Modify, export. Drop the unused `port`
  parameter. Before the method check, on every request (F2):
  `const port = server.address().port;` then allow only
  `req.headers.host === '127.0.0.1:' + port` or `'localhost:' + port`.
  Any other value, or no `Host`, → `res.writeHead(403).end()`. Then the
  existing 405 check, then the existing routes.
- `parseArgs` - Modify - Accept `--quiet`.
- `main()` - Modify:
  1. After `parseArgs` and the port check: when `quiet` is set and
     `.constellation/config.json` is absent, `process.exit(0)` with no
     output. This runs before any watcher, snapshot, or `listen`. Same
     guard style as `session-start.sh` (criterion 5).
  2. Without `quiet`, keep the phase 1 check on the `.constellation`
     directory and its exit 1.
  3. `let snapshot = null`. `getSnapshot = () => snapshot ?? (snapshot = safeRefresh(() => loadSnapshot(dir), null, dir))`.
     `refresh = () => { snapshot = safeRefresh(() => loadSnapshot(dir, snapshot), snapshot, dir); notify(); }` (F1).
  4. Register `server.on('listening', onListening)` once. `onListening`
     takes the first snapshot, starts `watch(dir, refresh)`, and prints the
     banner only without `quiet`.
  5. `server.on('error', e)`: when `e.code === 'EADDRINUSE'` and `quiet` is
     set, print nothing and call
     `setTimeout(() => { server.close(); server.listen(port, '127.0.0.1'); }, standbyMs)`
     (F7). `standbyMs` is `Number(process.env.BOARD_STANDBY_MS) || STANDBY_MS`.
     Any other case keeps the phase 1 behavior: print the error, stop the
     watcher when it runs, exit 1.
  6. `shutdown` stops the watcher only when it runs.
- `/Users/joaooliveira/study/constellation-harness/plugins/constellation/.claude-plugin/plugin.json` -
  Modify - Add:

```json
"experimental": {
  "monitors": [
    {
      "name": "board",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/board.mjs\" --quiet",
      "description": "Constellation board on http://127.0.0.1:4411",
      "when": "always"
    }
  ]
}
```

  Verified against the installed CLI 2.1.273 on 06-10-2026 with
  `claude plugin validate`: `experimental.monitors` is a known field;
  `name`, `command`, and `description` are required and non-empty; `when`
  is optional and accepts `always` or `on-skill-invoke:<skill>`; any other
  key fails validation. The command string above passes. Declare the key
  under `experimental`, never at the top level. Documented constraints:
  the command runs as a persistent process in the session working
  directory; Claude Code stops it at session end; a disabled plugin does
  not stop a running monitor; the command must not reference
  `${user_config.*}`; monitors do not run under `-p`; monitor stdout reaches
  Claude as a notification, so a quiet board prints nothing on success.
- `/Users/joaooliveira/study/constellation-harness/plugins/constellation/commands/board.md` -
  Create - Read-only command. Procedure: run
  `curl -s -m 1 http://127.0.0.1:4411/api/snapshot` and `pwd -P` (T2). When
  the reply parses and `projectDir` equals the `pwd -P` value, print
  `Board running: http://127.0.0.1:4411`. When `projectDir` differs, print
  the directory that holds the port and the manual command with
  `--port 4412`. When there is no reply, print `Board not running` and the
  manual command `node "${CLAUDE_PLUGIN_ROOT}/scripts/board.mjs"`. Add one
  line: the automatic start needs an interactive session. The command never
  starts and never stops a process.
- `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/session-start.sh` -
  Modify - Add `/constellation:board` to the `COMMANDS` line.

### Files

| File | Change | Estimated delta |
|---|---|---|
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs` | Modify | +440 / −30 (constants 20, parser 60, toNode 30, tree 85, differ and burst 30, feed 15, safeRefresh and empty 25, renderBacklog 85, scan 35, snapshot 10, watcher 15, serve 10, page script and CSS 55, CLI 35) |
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs` | Modify | +480 |
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/.claude-plugin/plugin.json` | Modify | +11 |
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/commands/board.md` | Create | +40 |
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/session-start.sh` | Modify | 1 line changed |

`board.mjs` grows from 542 to about 950 lines. Not modified: `log-event.sh`,
`log-event.test.sh`, `hooks.json`, the four portfolio commands,
`templates/gitignore`, `scripts/selftest.sh`. CHANGELOG and README updates
belong to the Technical Writer at Gate 2.

### Existing tests and how they stay green

`board.test.mjs` holds 15 tests. All pass on 06-10-2026 with Node 25.9.0.

- Eight tests call `resolveSteps`. Not modified.
- Three tests call `pairEvents` and `parseEventLines`. Not modified.
- One test calls `tokenDelta`. Not modified.
- Three tests call `loadSnapshot` on `tmpProject()`, which creates only
  `state/`, `metrics/`, `tracks.json`, and `config.json`:
  - `loadSnapshot: no state file is a normal empty state` asserts `errors`
    deep-equals `[]`. `scanWorkItems` must push no error for a missing
    directory.
  - `loadSnapshot: truncated state file keeps the previous snapshot and
    flags stale` passes the earlier snapshot as `prev`. `diffStatuses` gets
    `[]` and returns `[]`. The test asserts named fields only.
  - `loadSnapshot: tails events.jsonl and skips partial lines` asserts
    `agents` only. The `activity` field keeps its shape; `feed` is new.
- No current test calls `serve` or `main`, so the signature change of
  `serve`, the `Host` check, and `POLL_MS` affect no current test.

`log-event.test.sh` (five blocks, seven `pass` lines): the script is not
modified, so every check stays green.

`scripts/selftest.sh` step 11 runs `node --test
plugins/constellation/scripts/*.test.mjs`, `node --check board.mjs`, and
`log-event.test.sh`. New tests run there with no change to the runner. Step
2 validates `plugin.json` with `jq`. Step 3 runs `claude plugin validate`.

## Validation

Follow `constellation:test-verified-development`. The VERIFY gate cannot
stash `board.mjs`, because every test imports from it. Use the per-function
mutation variant: invert or disable the key branch named in the "Mutation"
column, run the test file, confirm that the test fails for the intended
reason, restore the branch, then run the file again.

- Run: `node --test plugins/constellation/scripts/board.test.mjs`
- Mocking: none. Fixtures are inline strings, temporary directories, real
  local sockets, and child processes.
- Network tests use `http.request` with an explicit `headers.host`. Do not
  use `fetch`: it does not let the test set `Host`.

**Automated Test**: parser — `parseFrontMatter`, `toNode`

| Test name | Proves | Mutation | Criterion |
|---|---|---|---|
| `parseFrontMatter: well-formed task yields fields and no warnings` | Happy path; `malformed` is `false`. | Return an empty `fields`. | 1 |
| `parseFrontMatter: title line before --- is lenient with a reason` | Warning `title before front-matter`. | Skip the line-1 check. | 2 |
| `parseFrontMatter: unknown field is lenient with the field name` | `version:` on a plan yields `unknown field: version`. | Skip the known-field check. | 2 |
| `parseFrontMatter: no front-matter is malformed` | `malformed: true`, `no front-matter`. | Search all lines. | 2 |
| `parseFrontMatter: unclosed front-matter is malformed` | An opening `---` with no closing line in 40 lines yields `unclosed front-matter`. | Drop the 40-line bound. | 2 |
| `parseFrontMatter: missing status is malformed` | `status missing`. | Skip the status check. | 2 |
| `parseFrontMatter: inline comment is stripped from the value` | `status: inbox   # queued` yields `inbox`. | Skip the comment strip. | 1 |
| `parseFrontMatter: CRLF file parses with no warnings` | `\r\n` endings yield clean values and no warning. | Split on `\n`. | 2 |
| `parseFrontMatter: BOM file has no title warning` | A leading `﻿` yields no `title before front-matter`. | Skip the BOM strip. | 2 |
| `parseFrontMatter: quoted and capitalized status normalizes` | `status: "Done"` yields `done`. | Skip the quote strip or the lowercase. | 2 |
| `toNode: numbered prefixes yield ids, other names warn` | `E01-x` → `E01`, `F001-y` → `F001`, `014-z` → `014`; `worktree-per-workflow.md` → `id: null`, warning `no number in file name`, flag `lenient`. | Accept any prefix. | 2 |
| `toNode: wire node carries no raw fields map` | `node.fields` is `undefined`; `links` holds `feature`. | Spread `fields` into the node. | 1 |

**Automated Test**: tree — `buildTree`

| Test name | Proves | Mutation | Criterion |
|---|---|---|---|
| `buildTree: v1 fixture attaches features, tasks, and plans` | One epic, two features, four tasks, two plans; depth, counts, and plan maturity match. | Skip the feature attach. | 1 |
| `buildTree: task without feature is standalone` | The task sits in `standaloneTasks`. | Attach to the first feature. | 1 |
| `buildTree: missing link target is lenient and orphaned` | `feature: F999-x.md` yields `missing link: F999-x.md` and `standaloneTasks`. | Skip the warning. | 2 |
| `buildTree: malformed task stays in the flat list, the counts, and attention` | Flat `tasks` contains it; `counts.malformed` is 1; `attention` holds it. | Filter malformed nodes out. | 2 |
| `buildTree: unknown status lands in other with a warning` | `status: in-progres` → `group: 'other'`, warning `unknown status: in-progres`, `counts.other` is 1. | Drop tasks outside the six statuses. | 2 |
| `buildTree: siblings sort by order then file name` | `order: 2` after `order: 1`; no `order` last. | Sort by file name only. | 1 |
| `buildTree: state.task marks the in-flight task with its step` | `inFlight: true`, `currentStep` equals the state value. | Compare against `state.branch`. | 1 |
| `buildTree: plan task link wins over the file name` | Plan `099-a.md` with `task: 014-b.md` attaches to `014-b.md`. | Match by file name first. | 1 |
| `buildTree: differing task link adds task link mismatch` | Same fixture: the plan carries `task link mismatch` and `lenient`. | Skip the comparison. | 2 |
| `buildTree: plan without task is orphaned and needs attention` | `orphanPlans` holds it with `plan without task`; `attention` holds it. | Drop unmatched plans. | 2 |

**Automated Test**: transitions and feed — `diffStatuses`, `collapseBurst`, `mergeFeed`, `safeRefresh`

| Test name | Proves | Mutation | Criterion |
|---|---|---|---|
| `diffStatuses: status change yields one transition with the mtime` | `refined` → `in-progress`, `ts` equals the next mtime. | Use `Date.now()` for `ts`. | 3 |
| `diffStatuses: unchanged tasks and null prev yield nothing` | Both return `[]`. | Drop the equality check. | 3 |
| `diffStatuses: new task yields from null` | `from: null`. | Skip files absent from prev. | 3 |
| `diffStatuses: malformed next node is skipped` | A next node with no status yields no entry. | Remove the next-node skip. | 3 |
| `diffStatuses: prev node without status is skipped` | A prev node with `status: null` yields no entry. | Remove the prev-node skip. | 3 |
| `collapseBurst: four changes collapse to one summary` | One entry, `summary: true`, `count: 4`, `ts` is the newest, `items` has 4. | Skip the collapse. | 3 |
| `collapseBurst: three changes stay as three` | Input returned unchanged. | Change `>` to `>=`. | 3 |
| `mergeFeed: orders entries by time across both sources` | Mixed `ts` with and without milliseconds sort newest first. | Use `localeCompare`. | 3 |
| `mergeFeed: transitions appear when activity is empty` | `mergeFeed([], [t])` returns `[t]`. | Return `activity` when transitions are second. | 3 |
| `mergeFeed: output is capped at the limit` | 40 inputs return 30. | Drop the slice. | 3 |
| `safeRefresh: a throwing loader keeps the previous snapshot` | `state` of prev kept; `errors` ends with `refresh failed: boom`; prev object not mutated. | Rethrow. | 1 |

**Automated Test**: renderer — `renderBacklog`

| Test name | Proves | Mutation | Criterion |
|---|---|---|---|
| `renderBacklog: every task file appears, including malformed and other` | Output contains each file name of a fixture tree that holds a malformed and an `other` task. | Skip the `other` group. | 2 |
| `renderBacklog: file names are escaped` | A task named `<img src=x onerror=alert(1)>.md` renders as `&lt;img`; the raw tag is absent. | Pass the name without `esc`. | 6 |
| `renderBacklog: Needs attention lists malformed and lenient items with warnings` | The block exists, lists both items, and shows the warning text inline. | Skip the block. | 2 |
| `renderBacklog: done and dropped collapse in details with counts` | `<details data-group="…:done">` with `2 done` in its summary; no `details` around Needs attention. | Render done tasks inline. | 1 |
| `renderBacklog: source runs with no module scope` | `new Function('return ' + renderBacklog.toString())()` renders the fixture with the same output. | Reference a module constant inside. | 1 |

**Automated Test**: snapshot — `loadSnapshot`, `scanWorkItems`

| Test name | Proves | Mutation | Criterion |
|---|---|---|---|
| `loadSnapshot: missing work directories yield an empty tree and no errors` | `tree.tasks` is `[]`, `errors` is `[]`. | Push an error on a missing directory. | 1, 5 |
| `loadSnapshot: tasks directory populates the tree with plan maturity` | One task with `plan.status`. | Skip the plans directory. | 1 |
| `loadSnapshot: a status edit between two snapshots records a transition` | Write `refined`, snapshot; write `in-progress`, snapshot with `prev`; one transition with a parseable `ts`; `feed` holds it. | Drop `transitions` from `feed`. | 3 |
| `loadSnapshot: transitions cap at 50 and keep the newest first` | 51 single changes keep 50; index 0 is the newest. | Drop the slice. | 3 |
| `loadSnapshot: dangling symlinks and lock files do not throw` | A tasks directory with a dangling `.#001-x.md` symlink, a dangling `002-gone.md` symlink, and one valid task: no throw; the tree holds exactly the valid task. | Remove the try/catch or the dot-skip. | 1 |
| `loadSnapshot: an unreadable entry is malformed with its code` | A directory named `003-dir.md` yields a node with `unreadable: EISDIR` and `malformed`. | Skip every error silently. | 2 |

**Automated Test**: server — `serve`

Each test calls `serve(() => snap, () => {})`, listens on port 0 on
`127.0.0.1`, and closes the server in `finally`.

| Test name | Proves | Mutation | Criterion |
|---|---|---|---|
| `serve: foreign Host on /api/snapshot returns 403` | `Host: attacker.example:<port>` → 403. | Remove the Host check. | 6 |
| `serve: foreign Host on /events returns 403` | Same on `/events`; the response ends. | Check the Host on `/api/snapshot` only. | 6 |
| `serve: correct Host returns 200 for 127.0.0.1 and localhost` | Both allowed values → 200 with the JSON body. | Allow `127.0.0.1` only. | 6 |
| `serve: POST with a correct Host returns 405` | Method check still runs after the Host check. | Remove the method check. | 6 |

**Automated Test**: CLI — child processes

Each test uses `spawn` or `spawnSync` with `process.execPath`, a 5000 ms
timeout, and kills the child in `finally`.

| Test name | Proves | Mutation | Criterion |
|---|---|---|---|
| `cli: --quiet without config.json exits 0 and prints nothing` | Status 0, empty stdout and stderr. | Move the quiet gate after `listen`. | 5 |
| `cli: without --quiet an uninitialized directory still exits 1` | Status 1, stderr contains `not found`. | Apply the quiet gate always. | 5 |
| `cli: without --quiet a taken port still exits 1` | A blocker holds the port; status 1, stderr contains `in use`. | Enter standby always. | 4 |
| `cli: --quiet on a taken port stands by, then takes over` | Blocker holds the port. Spawn `board.mjs --quiet --port <p> <tmpProject>` with `BOARD_STANDBY_MS=200`. After 600 ms: child alive, stdout and stderr empty, and a request with the correct Host gets no board snapshot. Close the blocker. Within 2 s, `GET /api/snapshot` with the correct Host returns 200 with the right `projectDir`. | Exit on `EADDRINUSE`. | 4 |

**Automated Test**: manifest

- Run: `scripts/selftest.sh`. Step 2 proves that `plugin.json` is valid
  JSON. Step 3 proves that `claude plugin validate` accepts the monitors
  entry. Expected: `selftest: ALL GREEN`.

**Count**: 52 new automated tests (12 parser, 10 tree, 11 transitions and
feed, 5 renderer, 6 snapshot, 4 server, 4 CLI). With the 15 current tests,
`board.test.mjs` holds 67.

**MANUAL TEST**: tree, badges, and page behavior on a consumer project

- Why manual: rendering, tooltips, and connection state are visual.
- Preconditions: the consumer project at
  `/Users/joaooliveira/study/user-service` with v1 artifacts.
- Steps: 1. Run `node plugins/constellation/scripts/board.mjs
  /Users/joaooliveira/study/user-service`. 2. Open `http://127.0.0.1:4411`.
  3. Compare the tree with `/constellation:backlog --all`. 4. Add
  `version: 2` to one plan. 5. Remove the front-matter from one task.
  6. Open one done group and wait 10 seconds. 7. Stop the server with
  Ctrl-C and wait 10 seconds.
- Expected: step 3 matches in grouping and glyphs. Steps 4 and 5: both
  items appear in "Needs attention" with the warning text visible under the
  row, and stay in their own groups. Step 6: the group stays open across
  updates, and the warning lines stay readable. Step 7: the badge reads
  `disconnected since HH:MM — showing last data`, and the elapsed and
  running timers stop.
- Observability: `GET /api/snapshot` returns `tree.attention` with both
  items.

**MANUAL TEST**: transition timing

- Why manual: the check needs a wall clock and a browser.
- Steps: 1. With the page open and an empty `events.jsonl`, change
  `status: inbox` to `status: refined` in one task file with an editor.
  2. Note the wall clock at save time.
- Expected: within 2 seconds the Activity list shows
  `<file> inbox → refined` with a time equal to the save time.

**MANUAL TEST**: monitor start, standby, and silent exit

- Why manual: monitors run only in interactive sessions.
- Preconditions: the plugin installed from this repository.
- Steps: 1. Start session A in `/Users/joaooliveira/study/user-service`.
  2. Run `/constellation:board` and open the URL. 3. Start session B in the
  same directory. 4. Exit session A. 5. Reload the page within 10 seconds.
  6. Exit session B. 7. Run `lsof -i :4411`. 8. Start a session in a
  directory without `.constellation/config.json`. 9. Check the task panel
  for any notice from the monitor's exit (T5, unverified behavior).
  10. Run `lsof -i :4411` and `pgrep -f board.mjs`.
- Expected: step 2 prints `Board running: http://127.0.0.1:4411`. Step 5
  shows the page again, served by session B's board. Step 7 shows no
  listener. Step 9: record what the panel shows; a visible notice is a
  finding for a follow-up, not a failure. Step 10 shows no board process.

## Integration Touchpoints

- **`plugin.json` monitors entry** - Could break: an unknown key fails
  validation; an unexpanded `${CLAUDE_PLUGIN_ROOT}` stops the start -
  Validation: selftest step 3; the manual monitor test.
- **Monitor working directory** - Could break: a session whose working
  directory is not the project root watches the wrong directory or exits 0
  - Validation: step 2 of the manual monitor test.
- **Local network surface** - Could break: a page on another origin reads
  the backlog through DNS rebinding - Validation: the four `serve` tests;
  `curl -H "Host: attacker.example:4411"` returns 403.
- **Watcher and process stability** - Could break: an exception in the
  refresh timer exits Node, and a monitor never restarts it - Validation:
  the dangling-symlink test and the `safeRefresh` test.
- **Watcher load** - Could break: the 1500 ms poll stats every work-item
  file - Validation: measure one `signature()` call on `user-service`;
  accept under 20 ms.
- **`loadSnapshot` consumers** - Could break: the three current snapshot
  tests - Validation: those tests plus "missing work directories".
- **Portfolio commands** - Could break: nothing; not modified. The page
  shows every node, `/constellation:backlog` hides done tasks by default -
  Validation: the manual comparison with `--all`; full parity is task 005.
- **Consumer projects on the v0 layout** - Could break: nothing; missing
  directories yield "No work items" - Validation: open the page on a v0
  project.
- **selftest.sh and CI** - Could break: a socket or child-process test that
  hangs - Validation: 5000 ms timeouts; every server and child closes in
  `finally`.

## Risks

1. **Monitors run in interactive sessions only** - Impact: M -
   Likelihood: H - No start under `-p`, on some platforms, or when the
   Monitor tool is off. Mitigation: `/constellation:board` always prints the
   manual start command.
2. **`experimental.monitors` is an experimental key** - Impact: M -
   Likelihood: L - The key can change between versions. The manual start
   does not depend on it. The documented fallback is an async
   `SessionStart` hook, which needs a PID file, signal handlers, a liveness
   check, and a `SessionEnd` kill inside a shared 1.5-second budget. Take it
   only if the key becomes unacceptable.
3. **`${CLAUDE_PLUGIN_ROOT}` expansion in a monitor command** - Impact: M -
   Likelihood: L - `hooks.json` relies on the same variable. Validation by
   the manual monitor test. Fallback as in risk 2.
4. **One fixed port for every project** - Impact: L - Likelihood: M -
   Standby removes the same-project failure: a second session's board takes
   over when the first session ends. Two different projects still share
   port 4411. The second board stands by and takes over when the other
   session ends; until then, `/constellation:board` names the directory
   that holds the port. Task 004 covers the rest.
5. **`renderBacklog.toString()` injection** - Impact: M - Likelihood: L - A
   module-scope reference inside the function breaks only in the browser.
   Mitigation: the `new Function` test runs the stringified source in
   isolation.
6. **`board.mjs` grows to about 950 lines** - Impact: L - Likelihood: H -
   Accepted for this phase. Task 003 extracts the pure functions into a
   module.

## Conflicts with the task criteria

- **Criterion 3 and the burst collapse (F8).** The criterion says the feed
  shows the old and new status. A burst of more than 3 changes renders one
  summary line, not each pair. Resolution in this plan: the summary entry
  keeps the pairs in `items`, visible in `/api/snapshot`. A single edit
  always renders its pair. No task text change.
- **Criterion 1 and the collapsed done and dropped groups (I2).** The tree
  still holds every done and dropped task, one click away, with the count in
  the summary. Criterion 2 holds: a flagged task also renders in "Needs
  attention", which never collapses.

## Resolved decisions

- **Q1 — timestamp source.** Accepted. The task file's mtime is the
  transition timestamp. Criterion 3 in the task now reads "a real
  timestamp".
- **Q2 — interactive-only monitors.** Accepted. Monitors start in
  interactive sessions only. `/constellation:board` prints the manual start
  command as the fallback.
- **Q3 — follow-up tasks.** Accepted. The orchestrator filed three inbox
  tasks: `003-board-parser-cli-for-portfolio-commands.md`,
  `004-board-automatic-port-selection.md`, and
  `005-board-archive-dirs-and-backlog-parity.md`.
- **Monitor `when`.** `always`, because criterion 4 requires a start at
  session start.
- **Server lifetime.** Claude Code stops monitors at session end. No
  `SessionEnd` hook.
