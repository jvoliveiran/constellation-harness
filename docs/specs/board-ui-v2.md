# Board UI v2 — layout, markdown, backlog table, session data, pause

Status: draft
Date: 14-10-2026
Feature: `.constellation/features/F001-board-ui-overhaul.md`
Tasks: 022, 023, 024, 025, 026 (one per phase, see §12)

## 1. Purpose

The board (`plugins/constellation/scripts/board.mjs`) shows the workflow in
flight, the specialist agents, and the backlog. Use on 14-10-2026 found six
problems:

| # | Problem | Phase |
|---|---------|-------|
| 1 | The Agents panel grows with every event and has no scroll bound. | 022 |
| 2 | The Now panel has a large blank area. The task description and the plan are not visible. | 023 |
| 3 | "Tokens spent" shows zero. | 025 |
| 4 | There is no pause button and no resume button. | 026 |
| 5 | A completed step gives no access to the output of its agents. | 025 |
| 6 | The backlog tree is hard to read. It has no search and no filters. | 024 |

This spec is the plan for all six. Each phase is one task and one PR.

## 2. Constraints that stay

- **No npm dependency.** Node 20 or later, one process, no build step. The
  only third-party code is one vendored markdown file (§7).
- **Strict CSP.** The page loads inline scripts and one inline style, each
  allowed by hash. `default-src 'none'` stays. No external font, no CDN.
- **Containment.** Every read under `.constellation/` goes through
  `openContained`, with `O_NOFOLLOW`, a regular-file check, and a byte cap.
  Reads outside the project (§8) get the same rules under a second root.
- **One write only.** The board writes one file, `state/control.json`, and
  only on a click (§9). Nothing else under `.constellation/` changes.
- **Agreement with the banner.** `resolveSteps` stays the single source for
  the step strip, so the banner, the statusline, and the board never differ.
- **Tests.** Every pure function runs under `node --test`. Routes get HTTP
  tests. Hooks get a bash test next to the script.

## 3. Source layout

Phase 022 splits `board.mjs` (1204 lines, page text inside a template
string) into modules. The entry file keeps its name, so the plugin monitor
and `/constellation:board` do not change.

```
plugins/constellation/scripts/
  board.mjs              CLI, HTTP server, filesystem, watch (entry)
  board-model.mjs        pure snapshot functions (moved, unchanged)
  board-render.mjs       pure page render functions, shipped by toString()
  board-session.mjs      transcript reader (phase 025)
  board-ui/page.html     page skeleton
  board-ui/page.css      design system and layout
  board-ui/page.js       page runtime: SSE client, router, event handlers
  board-vendor/markdown-it.min.js
  board-vendor/VERSION   name, version, sha256, source URL, license
  pause-guard.sh         PreToolUse hook (phase 026)
```

Rules:

- `board.mjs` reads `page.html`, `page.css`, `page.js`, and the vendor file
  once at start, with `readFileSync(new URL('./board-ui/page.css',
  import.meta.url))`. The CSP hashes come from the exact served text, as
  today.
- Render functions in `board-render.mjs` use no module-scope symbol and no
  import, because the page receives them through `toString()`. This is the
  current rule for `renderBacklog` and `feedText`, applied to every render
  function.
- `scripts/selftest.sh` step 11 keeps the glob `*.test.mjs`. Add a check
  that the sha256 of `board-vendor/markdown-it.min.js` equals the value in
  `board-vendor/VERSION`.

## 4. Design system

### 4.1 Tokens

Define every color as a token on `:root`. Dark is the default. Light
applies under `prefers-color-scheme: light` and under `[data-theme=light]`.
A toggle in the top bar sets `data-theme` and stores it in `localStorage`,
inside `try/catch`.

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--bg` | `#0b0d12` | `#f6f7f9` | page |
| `--surface` | `#13161e` | `#ffffff` | cards, table |
| `--surface-2` | `#1a1e28` | `#f0f2f5` | table header, chips, code |
| `--border` | `#262b38` | `#e3e6ec` | lines |
| `--text` | `#e7e9ee` | `#171a21` | body text |
| `--muted` | `#8b91a1` | `#646b7a` | labels, times |
| `--accent` | `#7c8cff` | `#4f5fe6` | links, current step, focus ring |
| `--ok` | `#4ecb8d` | `#1f9d61` | done |
| `--warn` | `#f3b63f` | `#b7791f` | running, in-progress, loops |
| `--danger` | `#ff6b6b` | `#d64545` | errors, dropped, attention |

Typography: the system font stack. Sizes 12, 13, 14, 16, and 20 px. Line
height 1.45. Numbers use `font-variant-numeric: tabular-nums`. Radius 10 px
on cards, 8 px on controls, 999 px on chips. One shadow level for dialogs.

### 4.2 Components

- **Card**: surface, border, 16 px padding, a 12 px uppercase muted title.
- **Chip**: status and type labels. Status colors: inbox muted, refined
  accent, in-progress warn, parked muted, done ok, dropped danger, other
  muted. Plan chips: draft muted, approved ok.
- **Button**: primary (accent), secondary (border), danger (danger). Height
  32 px. A disabled button shows a `title` with the reason.
- **Toolbar**: search input and filter chips in one row, wraps at phone
  width.
- **Table**: sticky header, 36 px rows, zebra, hover, sortable headers with
  a direction glyph. The in-flight task row carries an accent left border.
- **Stepper**: horizontal, one node per step, with emoji, label, and a
  connector line. Done is `--ok`, current is `--accent` with a ring, pending
  is muted. A done step with outputs is a button.
- **Dialog**: the native `<dialog>`, width `min(960px, 92vw)`, height 85vh,
  a header with title, chips, and close, a scrollable body. Esc closes.
- **Toast**: one line at the bottom right, 4 s, for control actions.

### 4.3 Layout

```
┌─ top bar: 🌌 Constellation · <project> · ● live · updated 14:02 · ☾ ─────┐
├─ Now (card, min-width 0) ─────────────────────┬─ Agents (card, 360px) ──┤
│  track chip · branch · task id + title        │  sticky, max-height     │
│  stepper                                      │  calc(100vh − 96px),    │
│  facts row                                    │  scrolls inside         │
│  task description (markdown, scrolls)         │                         │
│  [View plan] [Open task]                      │                         │
├─ Backlog (card, full width) ──────────────────┴─────────────────────────┤
│  toolbar · counts · table  |  or a detail view with breadcrumb          │
└─────────────────────────────────────────────────────────────────────────┘
```

Breakpoints: two columns at 1100 px and wider. Below that, the Agents card
moves under Now and loses the sticky position. At phone width the table
hides the Epic, Updated, and Plan columns and keeps a 16 px gutter.

### 4.4 Routes

The page keeps its state in the URL hash, so a reload and the SSE
re-render keep the view.

| Route | View |
|-------|------|
| `#/` | overview: Now, Agents, backlog table |
| `#/backlog?kind=task&status=inbox,refined&type=fix&q=board&sort=id:desc` | table with filters |
| `#/item/<kind>/<file>` | detail view in the backlog area (§6.4) |
| `#/plan/<file>` | plan dialog over the current view |
| `#/agent/<id>` | agent output dialog (§6.5) |
| `#/step/<id>` | step outputs dialog (§6.5) |

`<kind>` is one of `epic`, `feature`, `task`. `<file>` must match
`^[A-Za-z0-9][A-Za-z0-9._-]*\.md$` and must exist in the snapshot tree.
Any other value renders the overview.

`sort=` arrives with task 032.

## 5. Now panel (phase 023)

Header row: the track chip with `step n of N`, the branch in code, the task
id and its title, then the modifiers (`🔁 loop 1/3`, `⛔ awaiting your
decision`, `⏸ paused`).

Stepper: as §4.2. A done step with attributed agents (§8.4) is a button to
`#/step/<id>`.

Facts row: elapsed, tokens spent (§8.3), review loops, PR, model profile,
last save. Six facts, `auto-fit` columns of 140 px minimum.

Description: the body of `state.task`, rendered from markdown (§7). The
front matter and the first H1 do not render, because the header shows them.
The region has `max-height: 50vh` and scrolls. A `truncated` body ends with
a muted line `truncated at 512 KB`.

Buttons: **View plan** opens `#/plan/<state.plan>`. When the state has no
plan, or the plan file is not in the tree, the button is disabled with the
reason. **Open task** goes to `#/item/task/<state.task>`.

Fetch rule: the page requests `/api/item` for the task when `state.task`
changes or when the task node `mtime` in the snapshot changes. The plan
loads on the first open of the dialog and again on an `mtime` change.

Empty state: `No workflow in flight`, the watched path, and one line: `The
board follows .constellation/state/current-workflow.json`.

## 6. Panels

### 6.1 Agents (phase 022)

- The card is `position: sticky; top: 16px; max-height: calc(100vh -
  96px)`. The card body is `overflow: auto; min-height: 0`.
- Running agents sit in a `Running` group pinned at the top of the scroll
  region with `position: sticky`.
- Finished agents show the newest 20. A `Show all (n)` button reveals the
  rest, up to the event tail. The snapshot keeps its current cap.
- Row: start time, agent name without the `constellation:` prefix, the
  `description` from the start event (§8.1) in muted text, and the duration
  on the right. A running row pulses the duration in `--warn`.
- The Activity list stays under the agents, capped at 30 as today, inside
  the same scroll region.
- From phase 025, a finished row is a button to `#/agent/<id>`.

### 6.2 Backlog table (phase 024)

Toolbar, left to right:

- Search input. Matches id, title, file name, type, status, feature title,
  and epic title. Case-insensitive, debounced 100 ms. `/` focuses it.
- `Kind` segmented control: Tasks, Features, Epics. Default Tasks.
- `Status` multi-select chips. Default for Tasks: inbox, refined,
  in-progress, parked, other. Done and dropped start off.
- `Type` chips (tasks only): feature, fix, refactor, debt, spike, discovery.
- `Plan` select (tasks only): any, has plan, no plan.
- `Attention` toggle: only rows with a `malformed` or `lenient` flag. The
  built toggle uses `tree.attention` (criterion 16 of the task 024 plan
  overrides this wording). Task 035 tracks the open part.
- `Reset` link.

Task 024 ships without sortable headers, the `Plan` select, and the `/`
shortcut. Task 032 holds them. The counts strip folds into the Status
chips.

Counts strip under the toolbar: one chip per task status with its count,
from `tree.counts`. A click on a chip toggles that status filter.

Columns:

| Kind | Columns |
|------|---------|
| Tasks | ID, Title, Type, Status, Feature, Epic, Plan, Updated |
| Features | ID, Title, Status, Epic, Tasks (count chips by status), Updated |
| Epics | ID, Title, Status, Features, Tasks, Updated |

Rules:

- Title comes from the first H1 of the file (§8.1). Without an H1, the
  slug renders with dashes replaced by spaces.
- Feature and Epic cells are links to `#/item/feature/<file>` and
  `#/item/epic/<file>`. An empty cell renders `—`.
- The Plan cell shows the plan status chip, or `—`.
- A row with flags shows a `--danger` dot before the ID. The `title`
  attribute lists the warnings.
- The in-flight task row shows `▶ <step label>` after the status chip.
- Sort: a click on a header sorts by that column, a second click reverses.
  Default: status group order (inbox, refined, in-progress, parked, other,
  done, dropped), then id descending. Sort state lives in the hash.
- A row click opens `#/item/<kind>/<file>`.
- Empty result: `No items match` with a Reset link.
- The `Needs attention` block becomes a one-line banner above the toolbar:
  `3 items need attention` with a button that turns the Attention toggle
  on.
- Orphan plans keep one line under the table: `2 plans without task`, with
  the file names.

Filtering and sorting are pure functions in `board-render.mjs`:
`parseBacklogRoute(hash)`, `filterRows(rows, route)`, `sortRows(rows,
route)`, `renderTable(rows, kind, route, esc)`.

### 6.3 Detail views (phase 024)

`#/item/<kind>/<file>` replaces the backlog card content. Now and Agents
stay visible.

- Breadcrumb: `Backlog › E01 Title › F001 Title › 014 Title`, each level a
  link. Missing parents skip their level.
- Header: id, title, status chip, type chip (tasks), plan chip (tasks),
  `date-created`, `last-edit`, flags with warnings.
- Body: the rendered markdown (§7). Front matter and the first H1 do not
  render.
- Children:
  - Epic: a Features table (§6.2 columns), then a Tasks table with every
    task under those features.
  - Feature: a Tasks table.
  - Task: a `View plan` button (§5), and `related:` links as chips.
- Links inside the body that point to a `.md` file in the tree, by bare
  name or by a relative path that ends in that name, rewrite to
  `#/item/<kind>/<file>` or `#/plan/<file>`.

### 6.4 Plan dialog (phase 023)

`#/plan/<file>` opens the dialog over the current view. Header: the plan
file, the plan status chip, its task id, and close. Body: the rendered
markdown. The dialog loads from `/api/item?kind=plan&file=…`. A close
returns to the previous route.

### 6.5 Agent and step dialogs (phase 025)

`#/agent/<id>`: header with the agent type, description, model, start
time, duration, and tokens. Body: the final report as rendered markdown.
The `Copy` button moves to task 037. When the transcript is not available,
the body says `Transcript not available` and gives the reason from
`/api/agent`.

`#/step/<id>`: header with the step emoji and label. Body: one collapsible
block per attributed agent (§8.4), newest last, open by default when there
is one block. Each block has the same header as the agent dialog.

## 7. Markdown rendering (phase 023)

- Library: `markdown-it`, the minified browser build, vendored as one file
  under `board-vendor/`. The license file sits next to it. `VERSION` records
  the package version, the source URL, and the sha256 of the file.
- The page embeds the file as a second inline `<script>`, allowed by its
  own hash. `script-src` lists two hashes and nothing else.
- Options: `html: false`, `linkify: false`, `typographer: false`,
  `breaks: false`. With `html: false` the library escapes raw HTML in the
  file. The default `validateLink` refuses `javascript:`, `vbscript:`, and
  `data:` targets.
- Renderer rules: only `http(s)` links keep `href`. They get
  `rel="noopener noreferrer"` and `target="_blank"`. Every other link
  loses `href`. Images render as a link with the alt text, because
  `img-src data:` blocks every remote image and a local path needs a read
  route that does not exist.
- `renderMarkdown(text, markdownit, esc)` in `board-render.mjs` wraps the
  library: strip the front matter, drop the first H1, rewrite internal
  links (§6.3), then call `md.render`. The page passes `window.markdownit`.
  A unit test passes a stub.
- Fallback: when the vendor file is absent at start, the board logs one
  line and the page renders bodies in `<pre>`.
- Styles: a `.md` scope with headings, lists, tables with borders, code
  blocks on `--surface-2`, blockquotes with an accent bar, and
  `max-width: 72ch` for prose.

## 8. Data

### 8.1 Snapshot and event log additions

Snapshot nodes gain `title` (the first `# ` line in the read prefix, after
the front matter). `task.plan` gains `mtime`. Agents gain `description`
and `transcript` (`true` when the log carried a usable path).

`log-event.sh` adds three fields, each only when the hook input has it:

| Field | Events | Source |
|-------|--------|--------|
| `description` | SubagentStart | `.description` |
| `agent_transcript_path` | SubagentStart, SubagentStop | `.agent_transcript_path` |
| `transcript_path` | all | `.transcript_path` |

The hook test gains one case per field. The event tail stays at 256 KB.

Claude Code 2.1.285 sends no `description` and no `agent_transcript_path`
on SubagentStart. The board takes the description from the `.meta.json`
file of the agent. It derives the agent path from the main transcript
path, the session id, and the agent id (§8.3). A logged `description`
wins over the meta file when a later Claude Code sends it.

### 8.2 Routes

`GET /api/item?kind=<kind>&file=<name>`

- `kind` in `epic`, `feature`, `task`, `plan`. `file` matches the name rule
  of §4.4 and exists in the current snapshot tree. Otherwise 404 with a
  short text body. The route never lists or probes a name that the tree
  does not hold.
- Reads through `openContained` and a new `readBody` with
  `BODY_CAP_BYTES = 512 * 1024`. A larger file returns the prefix and
  `truncated: true`.
- Response: `{ kind, file, mtime, truncated, text }`. `text` is the raw
  file. The page renders it.
- `cache-control: no-store`.

`GET /api/agent?id=<agent_id>`

- `id` matches `^[a-f0-9]{8,32}$` and names an agent in the current
  snapshot. Otherwise 404.
- Resolves the transcript path from the event log (§8.1) under the session
  root (§8.3). Response: `{ id, agent_type, description, model, start, end,
  durationSec, usage, report, truncated, error }`. `report` is the raw
  text. `error` names the reason when `report` is null.

`POST /api/control` — see §9.

### 8.3 Session reader (`board-session.mjs`, phase 025)

Source of truth: the Claude Code transcripts under
`~/.claude/projects/<slug>/`. The main session transcript is
`<session_id>.jsonl`. A subagent transcript is
`<session_id>/subagents/agent-<agent_id>.jsonl` with a sibling
`.meta.json` that holds `agentType`, `description`, and `model`. The hook
input gives the main path. The board derives the agent path from it.

Containment under a second root:

- Project folder: a main transcript must sit directly in
  `<SESSION_ROOT>/<projectSlug>/`. `projectSlug` is `realpath(projectDir)`
  with each character that is not a letter or a digit replaced by `-`.
  Other folders give the reason `other project`. Paths such as `/a/b-c`,
  `/a/b/c`, and `/a/b.c` map to one slug, so the gate treats them as one
  project. Known limit: a session that starts in a subdirectory or a
  worktree, or a slug that Claude Code shortens, is refused as `other
  project`, and the tokens fact falls back to the state file.
- Derived agent path: the only allowed agent path is
  `dirname(main)/<session_id>/subagents/agent-<agent_id>.jsonl`. A
  SubagentStop `agent_transcript_path` must equal it. Else the agent is
  refused with `agent id mismatch` or `foreign session`. The meta file
  passes the same gate.
- `SESSION_ROOT = realpath(~/.claude/projects)`. Every path from the event
  log must resolve under it, through `containedReal` with that root.
- The main transcript name must be `<uuid>.jsonl`. An agent transcript
  name must be `agent-<hex>.jsonl`. Anything else is refused with one
  `errors` line: `transcript: refused: <reason>`.
- Reads use `openContained` rules: `O_NOFOLLOW`, regular file, byte cap.
  `SESSION_CAP_BYTES = 32 MB` per file. A larger file reads its last 32 MB
  and drops the cut first line.
- Reads are incremental. The reader keeps `{ path → { offset, rest } }`
  and reads only appended bytes. Transcripts are append-only.
- Trigger: a 5 s poll of the sizes of the known transcript files, armed
  only while a workflow is in flight. The `.constellation` watch does not
  change.

Token sum:

- Count lines with `type: "assistant"` and `message.usage`, with
  `timestamp >= state.startedAt`.
- Lines repeat `usage` for every content block of one turn, and
  `output_tokens` grows on later lines. Dedupe by `message.id` and keep the
  last line of an id.
- Workflow sessions only: a session counts when, at or after
  `startedAt`, its log shows a SubagentStart or SubagentStop with an
  `agent_type`, or a write to `current-workflow.json`. Stop lines alone do
  not qualify. A parallel session of the same project stays out of the
  sum.
- `spent = input_tokens + cache_creation_input_tokens +
  cache_read_input_tokens + output_tokens`. Keep the four parts for the
  tooltip.
- Sum the main transcript of every workflow session since
  `startedAt`, plus every agent transcript of those sessions.
- Per agent: the same sum over its own transcript.

Final report:

- Take the last `assistant` line of the agent transcript. When it holds a
  `tool_use` named `SubagentHandback`, the report is `input.message`.
  Otherwise join its `text` blocks.
- Cap the report at 256 KB with `truncated: true`.

### 8.4 Tokens fact and step attribution

The `tokens spent` fact shows, in this order:

1. The session sum, with the tooltip `from session transcripts since
   <startedAt>: in / cache / out`.
2. The state-file delta (`tokenDelta`), with the tooltip `from the state
   file, as the model reported it`. This is the current value. It stays
   at zero whenever the model copies the seed value forward instead of the
   latest reminder, which is the cause of problem 3.
3. `—`.

Step attribution is a pure function `attributeAgents(agents, progress)`. It
returns `{ [stepId]: [agent_id, ...] }`, start ascending. Only agents with a
valid `agent_id` and a start time count. The type is `agent_type` without
`constellation:`.

| Agent type | Candidate steps, in track order |
|------------|---------------------------------|
| software-architect | architect, architect-feasibility, architect-verify |
| product-manager | product-manager, architect |
| software-engineer, frontend-engineer, ui-ux-designer | engineer |
| code-reviewer, security-analyst, dx-analyst | parallel-gate-1, review-gate |
| cross-model-reviewer | plan-review, parallel-gate-1, review-gate |
| sdet, technical-writer | parallel-gate-2, sdet |
| devops-engineer | devops-branch, devops-pr |

Algorithm:

1. `present` is the candidate steps that `progress.steps` holds, in track
   order. When none is present, the run is not attributed.
2. When one step is present, the run attaches to it (pass 1).
3. When two or more are present (pass 2), walk them from the last to the
   second. The run attaches to `s[k]` when a pass-1 run, attributed to a
   step strictly between `s[k-1]` and `s[k]`, started before it. Else the
   run attaches to `s[0]`.
4. The function has no time window. Ties in start time keep the event
   order.

A wrong guess shows a report under a neighbor step. It never hides a
report, because the agent row still opens it.

## 9. Pause and resume (phase 026)

Claude Code offers no external pause. The design holds the next tool call
of the session with a hook, and tells the model to stop when the hold
expires.

### 9.1 Control file

`.constellation/state/control.json`:

```json
{ "paused": true, "since": "2026-10-14T14:02:11Z", "by": "board" }
```

Pause creates it. Resume deletes it. Absence means not paused, so the hook
check is one `test -f`. The file is under `state/`, which the project
template gitignores.

### 9.2 Hook `pause-guard.sh`

Registered on `PreToolUse` with matcher `""` and `timeout: 600`. The
existing `guard-git.sh` entry stays.

1. Exit 0 at once when `control.json` is absent, or when
   `current-workflow.json` is absent. A stale control file never blocks a
   session without a workflow.
2. Append `{ "event": "PauseHold", "ts", "session_id", "agent_id" }` to
   `events.jsonl`.
3. Poll every second. When `control.json` disappears, exit 0. The tool
   runs and the session continues with no user action.
4. After `HOLD_SECONDS` (default 540, below the 600 s hook timeout. At
   600 s the tool runs), append `{ "event": "PauseDenied" }` and print:

```json
{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny",
  "permissionDecisionReason": "Constellation board paused this workflow at <since>. Do not run more tools. Report the last save point to the user and end the turn. The user resumes with /constellation:resume." } }
```

`HOLD_SECONDS` and the project directory come from the environment so the
bash test can set a 2 s hold.

### 9.3 Orchestrator rule

Add one rule to the orchestrator skill: when a tool denial, or an agent
report, carries `Constellation board paused this workflow`, end the turn
with the pause message and the last save point. Do not save. Do not
retry. `/constellation:resume` starts from `currentStep` of the saved
state, as today.

Add `workflow-paused` to the metrics event table, written by the hook, not
by the model.

### 9.4 Route `POST /api/control`

- Body: `{ "action": "pause" }` or `{ "action": "resume" }`, at most 1 KB,
  `content-type: application/json`.
- Checks, each a 403: the Host check as today; `Origin` equals
  `http://127.0.0.1:<port>` or `http://localhost:<port>`;
  `Sec-Fetch-Site`, when present, equals `same-origin`; header
  `x-board-token` equals the process token. The token is 32 random bytes
  in hex, minted at start and carried in the snapshot as `csrf`.
- 409 when no workflow is in flight (`pause`), or when no control file
  exists (`resume`).
- Pause writes to a temp file in `state/` and renames it. `state/` must
  resolve inside the root and be a directory. Resume unlinks the file.
- 204 on success. The watcher sees the change and pushes a snapshot with
  `control: { paused, since, by }`.

### 9.5 Page

- The Now header shows **Pause** when a workflow is in flight and no
  control file exists. It shows a `⏸ paused since hh:mm` chip and
  **Resume** when the control file exists.
- After `PauseHold` the chip says `holding — resume continues at once`.
  After `PauseDenied` it says `session stopped — type
  /constellation:resume after you resume`.
- A toast confirms each action. A 403 or 409 shows the reason.
- The statusline reads the control file and renders the `aborted` modifier
  from `tracks.json` (`⏸ paused`), so the terminal agrees with the page.

### 9.6 Documentation changes

README, the board section: replace `never writes to .constellation/` with
`writes one file, state/control.json, on a Pause click, and deletes it on
Resume`. The task 001 criterion 6 stays true for every other file. The
orchestrator skill command table gains the pause behavior next to
`/constellation:abort`.

## 10. Security summary

| Surface | Rule |
|---------|------|
| `/api/item` | name regex, tree membership, `openContained`, 512 KB cap |
| `/api/agent` | id regex, snapshot membership, session root, name regex, 32 MB cap |
| `/api/control` | Host, Origin, Sec-Fetch-Site, process token, body cap, atomic write inside `state/` |
| Markdown | `html: false`, link validation, `rel=noopener`, no remote images |
| Vendor file | sha256 pinned in `VERSION`, checked by selftest, served by CSP hash |
| Transcripts | read-only, under `~/.claude/projects`, never listed, never written |
| Event log | new fields are strings, capped by the 256 KB tail, validated before use |

## 11. Tests

Pure (`node --test`):

- `extractTitle`, `renderMarkdown` with a stub library (front matter strip,
  H1 drop, link rewrite, `html: false` option passed).
- `parseBacklogRoute`, `filterRows`, `sortRows`, `renderTable` on a fixture
  of 3 epics, 5 features, 40 tasks, with flags and an in-flight task.
- `sumUsage` (dedupe by `message.id`, `startedAt` cut), `extractReport`
  (handback and text forms), `attributeAgents` (all five tracks, fix loop).
- `renderNow`, `renderAgents` (cap 20, running first), `renderItemView`.

HTTP (`serve` tests as today):

- `/api/item`: 404 on a bad name, 404 on a name outside the tree, 200 with
  `truncated` on a 600 KB file, symlink refused.
- `/api/agent`: 404 on a bad id, refused path outside the session root,
  200 with a report from a fixture transcript.
- `/api/control`: 403 without token, 403 with a foreign Origin, 409 with
  no workflow, 204 and file content on pause, 204 and no file on resume.
- The CSP header lists exactly two script hashes and one style hash.

Hook (`pause-guard.test.sh`): absent file exits 0 within 100 ms; a file
removed during the hold exits 0; an expired hold prints the deny JSON and
appends `PauseDenied`.

Manual, once per phase, in the browser: dark and light, 1280 px and 390
px, keyboard only through the toolbar and the dialog, a backlog of 500
generated tasks renders under 100 ms per snapshot.

## 12. Phases

| Task | Phase | Problems | Depends on | Effort |
|------|-------|----------|------------|--------|
| 022 | Source split, design system, layout, Agents panel bound | 1 | — | M |
| 023 | Markdown rendering, task description, plan dialog | 2 | 022 | M |
| 024 | Backlog table, filters, search, detail views | 6 | 023 | L |
| 025 | Session reader: tokens, agent output, step outputs | 3, 5 | 023 | L |
| 026 | Pause and resume: control file, hook, route, skill rule | 4 | 022 | M |

025 and 026 can run in parallel after 023. Each phase is one PR. The
CHANGELOG entries go under `[Unreleased]` until the release that follows
the last merged phase.

## 13. Out of scope

- Writes beyond `control.json`: no status edits, no task creation from the
  page.
- Multi-project views, historical charts, a public host, authentication.
- External fonts, icon sets, or any CDN asset.
- Live tailing of an agent's transcript while it runs. The agent dialog
  reads the final report only.

## 14. Open decisions

- Whether `SubagentStop.last_assistant_message` is small enough to log.
  The plan reads the transcript instead and does not log it.
- Whether the Agents panel also lists the orchestrator's own turns. Not
  in this version.
