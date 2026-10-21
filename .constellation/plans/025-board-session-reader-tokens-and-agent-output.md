---
status: approved
task: 025-board-session-reader-tokens-and-agent-output.md
scope-approved-by: product-manager, software-architect
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board UI: session reader for tokens spent and agent outputs (task 025)

## Overview

**Problem**: The `tokens spent` fact shows zero. The fact comes from the
state file, and the model often copies the seed value forward. A done
step and a finished agent give no access to the output of the agents.
The user must ask the orchestrator for each report.

**Impact**: The board reads the Claude Code transcripts of the workflow
sessions under `~/.claude/projects`, read-only. The fact shows the real
spend, with the source in a tooltip. A finished agent row and a done
step with agents open a dialog with the final report of each agent. A
muted description tells two runs of one agent type apart.

**Scope**:

- In: the 24 criteria of the task (criterion 24, the helper-stop skip,
  came in the PM round 2). That is three new fields in
  `log-event.sh`; the session reader `board-session.mjs`; the tokens fact
  with the state-file fallback; `GET /api/agent`; the routes
  `#/agent/<id>` and `#/step/<id>`; agent rows and done steps as buttons;
  the row description; the privacy and containment rules; tests; one
  CHANGELOG block under `[Unreleased]`; the README board and hook lines;
  the spec deltas of this plan (D13).
- Out: the stepper restyle, the running-row pulse, and the `Copy` button
  (parked as task 037); a live tail of a running agent (spec §13); tasks
  032, 034, 035, 036; `CLAUDE_CONFIG_DIR` support (Product suggestion 3).
  The `.constellation` watch, the probe, the work-item reads, and the
  `/api/item` gate do not change.

**Blocks**: task 026 (it cuts 1.4.0 after this PR and adds a button to
the Now actions, which this plan does not touch).
**Blocked By**: nothing. Tasks 022, 023, and 024 are on `main` at
c309fc9. The branch `feat/025-board-session-reader-tokens-and-agent-output`
is checked out.

**Track**: Planned Work, product-scoped. PM × Architect pairing converged
(both `AGREED`; see the Feasibility Result at the end).

**Version**: no bump. The Technical Writer adds the entries under
`## [Unreleased]`. Task 026 cuts 1.4.0.

## Ground truth: what Claude Code gives (checked on 21-10-2026)

The design rests on these facts. The architect read the Claude Code
2.1.285 binary for the hook input schemas, and field names and line
structure only from the transcripts of this machine. No message text was
read or copied.

| Fact | Evidence | Consequence |
|---|---|---|
| Every hook input has `session_id`, `transcript_path` (the main session transcript), `cwd`, `agent_id`, `agent_type`. | Base schema `N` and the builder `Ec` in the binary. | `log-event.sh` can log `transcript_path` on all events. |
| `SubagentStart` adds `agent_id` and `agent_type` only. It has no `description` and no `agent_transcript_path`. | `wK` schema and the `SubagentStart` builder. | Criterion 1 passes on its own input, but a real start line never carries the two fields. D2 takes the description from `.meta.json` and derives the agent path. |
| `SubagentStop` adds `agent_transcript_path`, `agent_type`, `last_assistant_message`, `stop_hook_active`. | `CK` schema. | The stop line gives the agent path. The board compares it with the derived path (criterion 16). |
| The main transcript is `<projects>/<slug>/<session_id>.jsonl`. An agent transcript is `<projects>/<slug>/<session_id>/subagents/agent-<agent_id>.jsonl`, next to `agent-<agent_id>.meta.json`. | Folder listing. | The derived agent path is `dirname(main)/<session_id>/subagents/agent-<agent_id>.jsonl`. |
| A real `agent_id` is `a` plus 16 hex characters (17 characters). A `session_id` is a lowercase UUID. | 54 agent files, all one shape. | `^[a-f0-9]{8,32}$` (spec §8.2) matches. |
| `.meta.json` keys: `agentType`, `description`, `model` (an alias such as `opus`), `toolUseId`, `spawnDepth`, `requestShape`, `requestNonInteractive`. The file is born with the `.jsonl`. | `jq keys`; `stat -f %B`. | The description is there for a running agent. |
| An assistant line: `type: "assistant"`, `timestamp` (ISO with ms), `sessionId`, `agentId` (agent files), `message.id`, `message.model`, `message.usage` with `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`, `message.content[]` with one block per line. | `jq` field paths. | One API turn writes one line per content block, each with the same `message.id`. |
| Lines of one `message.id` do not always repeat one `usage`. `output_tokens` grows on the later lines (seen: 16, then 299). | `jq` over 8 agent files: 6 ids with two usage values. | Dedupe keeps the last line of an id (D4). First-wins undercounts the output. |
| The last assistant line of a Constellation agent holds one `tool_use` block named `SubagentHandback` with `input.message`. | `jq` block types. | `extractReport` (D5). |
| The main transcript has no sidechain lines. Agent usage also shows as `attachment.usage.totalTokens`, and the session cost as a `cost-state` line. | `jq` paths. | Count only `type: "assistant"` lines. Attachments and `cost-state` would double count. |
| Assistant lines with `message.model: "<synthetic>"` exist. | `jq`. | They carry zero usage. No special case. |

## Acceptance Criteria

The task file holds the BDD criteria. This section repeats them verbatim
and adds technical notes. "D<n>" points to the design decisions below.
"T<n>" points to the tests in the Validation section. "E<n>" points to an
existing test that changes.

### Event log

1. **Given** a SubagentStart hook input with `description`,
   `agent_transcript_path`, and `transcript_path`, **when**
   `log-event.sh` runs, **then** the logged line carries the three fields.
   - Note: D1. H1. Claude Code 2.1.285 sends none of `description` and
     `agent_transcript_path` on SubagentStart (Ground truth). The hook
     logs them when a later version sends them. The board does not depend
     on them: D2 reads the description from `.meta.json` and derives the
     agent path.
2. **Given** a SubagentStop hook input with `agent_transcript_path` and
   `transcript_path`, **when** `log-event.sh` runs, **then** the logged
   line carries both fields.
   - Note: D1. H2.
3. **Given** a hook input without one of these fields, **when**
   `log-event.sh` runs, **then** the logged line omits that field. The
   hook test covers each field present and absent.
   - Note: D1. H3 covers each field absent. H5 adds: a field that is not a
     string, or that is longer than its cap, is also omitted.
24. **Given** a SubagentStop hook input without `agent_type` (an internal
    helper agent), **when** `log-event.sh` runs, **then** it logs no
    line. Known limit: the tokens fact excludes the spend of these
    helper agents. (Numbered 24 so that the plan references to 1 to 23
    stay valid.)
   - Note: D1. H6. Added by the PM round 2 (product suggestion 2). The
     board `helperStops` count drops to 0 for new lines; old lines in the
     window still count. `pairEvents` keeps its helper rule for them.

### Tokens spent

4. **Given** a workflow in flight with three finished agents and usable
   transcript paths, **when** the page renders, **then** the tokens spent
   fact shows the sum of `input + cache creation + cache read + output`
   over the main transcript and the three agent transcripts since
   `startedAt`. The tooltip reads `from session transcripts since
   <startedAt>: in / cache / out` with the three numbers.
   - Note: D3 (which sessions and agents count), D4 (the sum), D8
     (`tokensFact`, `renderNow`). T21, T30. `cache` in the tooltip is
     creation plus read. The tooltip numbers are full integers with
     thousands separators (`toLocaleString('en-US')`), so the user can
     compare them with a `jq` sum.
5. **Given** an assistant turn with three transcript lines that repeat one
   `message.id` and one `usage`, **when** the board sums the tokens,
   **then** it counts that `usage` once.
   - Note: D4. T1. The last line of an id wins, because `output_tokens`
     grows on later lines of one turn (Ground truth).
6. **Given** assistant lines with a `timestamp` before `startedAt`,
   **when** the board sums the tokens, **then** the sum excludes them.
   - Note: D4. T2. Compare `Date.parse` values, not strings: the
     transcript has milliseconds and `startedAt` has none. An unparseable
     `startedAt` disables the transcript source (fallback of criterion 7).
7. **Given** no usable transcript path in the event log, **when** the page
   renders, **then** the fact shows the state-file delta with the tooltip
   `from the state file, as the model reported it`. **Given** that the
   delta is also null, **then** the fact shows `—`.
   - Note: D8. T9, T30. "Usable" means that at least one main transcript
     passes the gate (D6) and its read succeeds. The snapshot carries
     `tokens.source`: `transcripts`, `state`, or `none` (the data plan of
     the task).
8. **Given** a transcript that grows while the workflow runs, **when** 5
   seconds pass, **then** the fact shows the new sum. The repaint keeps
   the focus and the scroll position of the page.
   - Note: D7 (5 s poll), D11 (`keepFocus` on `#now` and `#agents`, the
     `#agents` scroll offset). T23, T44.
9. **Given** no workflow in flight, **when** the board runs, **then** it
   reads and polls no transcript.
   - Note: D7. T24. With no workflow, the reader drops its state, the poll
     makes no `stat` call, `/api/agent` answers `error: "no workflow in
     flight"`, and every agent has `transcript: false`.

### Agent and step outputs

10. **Given** a finished agent row with a transcript, **when** the user
    activates it by click or keyboard, **then** a dialog shows the agent
    type, description, model, start, duration, tokens, and the final
    report rendered from markdown. The report is `input.message` of the
    last `SubagentHandback` call when present, otherwise the text of the
    last assistant message. A running agent row is not a button.
    - Note: D5, D9, D10, D11. T3, T4, T26, T33, T35, T40. The row is a
      native `<button>`, so Enter and Space work. Model: `.meta.json`
      `model`, else `message.model` of the last assistant line.
11. **Given** a done step with attributed agents (spec §8.4), **when** the
    user activates it, **then** a dialog lists those agents, newest last,
    each with the header of criterion 10 and its report. **Given** the
    planned track with two architect runs, **then** the first attaches to
    Plan and the second to Verify. A done step without agents and a
    pending step are not buttons.
    - Note: D12 (`attributeAgents`). T10 to T16, T34, T36, T42. The
      fixture of the two-run case holds an engineer run between them, as
      a real planned workflow does. D12 refines the spec rule: a later run
      attaches to the later step only when it starts after an agent of a
      step that lies between the two. So PM × Architect pairing rounds
      (two or three architect runs before any engineer) stay on Plan. The
      current step is not a button either.
12. **Given** an open agent or step dialog, **when** the user closes it,
    **then** the hash returns to the route before the dialog. **Given** a
    reply for an earlier dialog that arrives after a later one opened,
    **then** the page drops the earlier reply.
    - Note: D11. T41, T43. One `dialogSeq` serves the plan, agent, and
      step dialogs.
13. **Given** a finished agent whose transcript is missing or refused,
    **when** the user opens it, **then** the dialog body says `Transcript
    not available` and the reason.
    - Note: D9. T27, T33. Reasons: `missing`, `refused: <reason>`,
      `unreadable: <code>`, `no report`, `no workflow in flight`.
14. **Given** a report larger than 256 KB, **when** the dialog opens,
    **then** it shows the first 256 KB and a muted line `truncated at 256
    KB`.
    - Note: D5. T5, T33.

### Privacy and containment

15. **Given** a transcript path in the event log that resolves outside
    `realpath(~/.claude/projects)`, or a symlink, or a name that is not
    `<uuid>.jsonl` (main) or `agent-<hex>.jsonl` (agent), **when** the
    board meets it, **then** it reads nothing from that path and `errors`
    holds `transcript: refused: <reason>`. The error line never holds the
    path.
    - Note: D6. T7, T18, T19. "A symlink" covers every component below
      the session root, not only the last one. The root itself
      (`~/.claude` or `~/.claude/projects`) may be a link, as dotfile
      setups make it. The `.meta.json` file passes the same gate with the
      name `agent-<hex>.meta.json`.
16. **Given** an agent transcript path that is not in the `subagents`
    folder of a session that the same event log names, or whose
    `agent-<hex>` does not match the `agent_id` of its log line, **when**
    the board meets it, **then** it reads nothing from it. This keeps the
    board on the sessions of this project.
    - Note: D6. T8, T20, T29. Feasible as written. The base hook input
      gives `session_id` and the main `transcript_path` on every line, so
      the board computes the only allowed agent path and compares.
      No Security Analyst exception is needed.
17. **Given** the main session transcript, **when** the board reads it,
    **then** it uses only the `usage` numbers, `message.id`, and
    `timestamp`. No text from the main transcript reaches the page or any
    response.
    - Note: D4. T6, T22. `usageOf` returns an object with exactly six
      keys. The reader keeps no other value from a main transcript line.
18. **Given** an agent transcript, **when** `/api/agent` replies, **then**
    the reply holds only the fields of spec §8.2. It holds no prompt, no
    tool input or output other than the handback message, no raw
    transcript line, and no file path. The snapshot carries
    `transcript: true|false` per agent, never a path.
    - Note: D9, D3. T22, T28. The reply key set is exact: `id`,
      `agent_type`, `description`, `model`, `start`, `end`, `durationSec`,
      `usage`, `report`, `truncated`, `error`.
19. **Given** any request to the board, **when** it serves transcript
    data, **then** it serves it only on `127.0.0.1` through the existing
    Host check, with `cache-control: no-store`, `nosniff`, and
    `referrer-policy: no-referrer`. The board writes, lists, and sends no
    transcript data anywhere else, and writes no new file.
    - Note: D9. T28, T31. The reader opens files by derived or logged
      path only. It calls no `readdir` under the session root (T25 checks
      the source).
20. **Given** the board started with `--quiet`, **when** the session
    reader refuses, fails, or reads a transcript, **then** the board
    prints nothing to stdout or stderr. Without `--quiet`, a log line
    names the reason and never a path or transcript text.
    - Note: D7. T25. One line per distinct reason per workflow:
      `board: transcript: refused: <reason>`.
21. **Given** a transcript of 40 MB, **when** the board reads it, **then**
    it reads the last 32 MB once and only the appended bytes after that.
    - Note: D7. T17. The test injects a 1 KB cap and a 1.25 KB file, and
      checks `SESSION_CAP_BYTES === 32 * 1024 * 1024` apart.

### Tests and gate

22. **Given** the change, **then** `sumUsage`, `extractReport`, and
    `attributeAgents` have unit tests (all five tracks and a fix loop),
    `/api/agent` has HTTP tests (bad id 404, refused path, foreign
    session folder, 200 with a report from a fixture transcript, no path
    in the reply), every new `board-render.mjs` export is in
    `ISOLATION_ARGS`, and `scripts/selftest.sh` prints `selftest: ALL
    GREEN`. The suite starts from 243 tests.
    - Note: Validation lists T1 to T44 and H1 to H6. The existing
      isolation test (024 T25) fails when a new export has no entry.
23. **Given** the page at 1280 px and 390 px, dark and light, **when** the
    user opens an agent dialog and a step dialog by keyboard only, **then**
    both dialogs fit the viewport, scroll inside, and close with Esc.
    - Note: MANUAL TEST below, with CDP device emulation for 390 px
      (carry-over 024 item 5).

## Design decisions

### D1 — `log-event.sh`: three optional string fields

Add to the `jq` object, each kept only when it is a string inside its
cap:

| Field | Events | Cap |
|---|---|---|
| `description` | SubagentStart | 500 characters |
| `agent_transcript_path` | SubagentStart, SubagentStop | 1024 characters |
| `transcript_path` | all logged events | 1024 characters |

```jq
def str(cap): if type == "string" and length <= cap then . else null end;
... description: (if .hook_event_name == "SubagentStart" then (.description | str(500)) else null end),
    agent_transcript_path: (if (.hook_event_name | test("^Subagent(Start|Stop)$")) then (.agent_transcript_path | str(1024)) else null end),
    transcript_path: (.transcript_path | str(1024))
```

The existing `with_entries(select(.value != null))` drops the absent
fields.

Criterion 24: after the `EVENT` read, exit 0 with no line when the event
is SubagentStop and `agent_type` is absent, null, or empty:

```bash
if [ "$EVENT" = "SubagentStop" ]; then
  AT=$(printf '%s' "$INPUT" | jq -r '.agent_type // empty' 2>/dev/null)
  [ -n "$AT" ] || exit 0
fi
```

These helper stops arrive every 30 to 60 s. Without them, the 256 KB
window holds hours of a workflow. Update the header comment. The hook stays silent and exits 0. The
event tail stays at 256 KB. Lines grow by about 150 to 350 bytes, so the
256 KB window holds about 600 lines (D3).

### D2 — Agent description and the derived agent path

Claude Code sends neither `description` nor `agent_transcript_path` on
SubagentStart. The board does not wait for SubagentStop:

- The expected agent path is
  `path.join(path.dirname(mainPath), session_id, 'subagents', 'agent-' + agent_id + '.jsonl')`,
  where `mainPath` is the gated main transcript of the same `session_id`
  (D6), and `session_id` and `agent_id` pass their regexes first.
- When a SubagentStop line carries `agent_transcript_path`, it must equal
  the expected path. Else the agent is refused with `agent id mismatch`
  (other id) or `foreign session` (other folder).
- The description comes from `agent-<agent_id>.meta.json` next to the
  expected path, through the same gate, with a 16 KB cap. Keep
  `description` when it is a string; trim it and cap it at 200
  characters. Keep `model` when it is a string of at most 64 characters.
  A logged `description` (D1, a future Claude Code) wins over the meta
  file.
- The reader caches a meta result per `agent_id` once it parses. A
  missing meta file is tried again at the next snapshot.

### D3 — Which events feed the reader: the workflow window

`loadSnapshot` reads the whole 256 KB event window once
(`readTail(..., Infinity)`) and parses it once.

- **Agents panel**: `pairEvents` runs on the lines that are in the last
  `EVENT_TAIL` (200) **or** have `ts >= startedAt`. With no workflow it is
  the last 200, as today. So every agent of the workflow reaches the
  snapshot, and the attribution, the step dialog, and `/api/agent` see
  them. `renderAgents` keeps its cap of 20 and `Show all`.
- `pairEvents` copies `description` from the start line (string, at most
  200 characters) and nothing else new. No path enters the snapshot.
- **Sessions** (`sessionsOf(events)`, pure, in `board-session.mjs`): a map
  `session_id → transcript_path` from every line of the window whose
  `transcript_path` passes the lexical rules (D6). This is the set of
  "sessions that the same event log names" of criterion 16.
- **Workflow sessions**: a session whose `session_id` has, at
  `ts >= startedAt`, a SubagentStart or SubagentStop line with an
  `agent_type`, or a PostToolUse line with
  `file: ".constellation/state/current-workflow.json"`. Stop lines alone
  do not qualify. This keeps a second, unrelated session in the same
  project out of the sum.
- **Workflow agents**: agents with `start >= startedAt` (or `end` when no
  start line exists) whose `session_id` is a workflow session.
- **Sticky sets**: the reader keeps the workflow sessions and agents that
  it saw for the current `startedAt`, so an early session that falls out
  of the 256 KB window still counts. A new `startedAt` or a null state
  clears them. A board restart loses them (Risk 2).

### D4 — The token sum: `usageOf`, `sumUsage`

Pure functions in `board-session.mjs`:

- `usageOf(obj)` → `{ id, ts, input, cacheCreate, cacheRead, output }` or
  `null`. Non-null only for `type === "assistant"` with a string
  `message.id` and an object `message.usage`. `ts` is
  `Date.parse(obj.timestamp)` or `NaN`. Each number is a finite
  non-negative integer, else 0. The object has exactly these six keys.
- `sumUsage(entries, sinceMs)` → `{ spent, input, cache, output }`.
  `entries` is an iterable of `usageOf` results in file order. Dedupe by
  `id`: a later entry replaces an earlier one. Drop entries with
  `ts < sinceMs` or `NaN` ts when `sinceMs` is a number. `sinceMs`
  `null` keeps all (per-agent sums). `cache = cacheCreate + cacheRead`;
  `spent = input + cache + output`.
- The reader keeps, per file, a `Map(id → usageOf result)`, filled in
  file order, so "later replaces earlier" holds across reads. The session
  sum adds `sumUsage` of each workflow session main file and each
  workflow agent file, with `sinceMs = Date.parse(startedAt)`.
- Prefilter: the reader calls `JSON.parse` only on a line that contains
  `"type":"assistant"`. The main transcript is mostly tool output.

### D5 — The final report: `extractReport`

Pure, in `board-session.mjs`:

- The reader keeps, per agent file, `lastGroup`: the assistant lines of
  the last `message.id`, reduced to their `text` blocks and their
  `tool_use` blocks named `SubagentHandback` (`{ type, name, input:
  { message } }` only). A new assistant id resets the group. No other
  block survives the read, so no tool input reaches memory.
- `extractReport(group, capBytes = REPORT_CAP_BYTES)` →
  `{ report, truncated, error }`. When a block is a `SubagentHandback`
  `tool_use` with a string `input.message`, the report is the last such
  message. Else join the `text` blocks with `\n\n`. An empty result gives
  `{ report: null, truncated: false, error: 'no report' }`.
- `REPORT_CAP_BYTES = 256 * 1024`. A longer report keeps its first 256 KB
  of UTF-8 bytes. Cut on a character boundary: decode the prefix and drop
  a trailing `�`. Set `truncated: true`.

### D6 — The transcript gate

Spec §8.3, plus the derived agent path. In `board-session.mjs`:

- **Root**: `lexicalRoot = path.join(os.homedir(), '.claude', 'projects')`,
  `realRoot = fs.realpathSync(lexicalRoot)`. Resolve at each sync, so a
  root that appears later works. A missing root refuses every path with
  `no session root`. The root comes from `createSessionReader({ root })`;
  `board.mjs` passes the home path, tests pass a temp directory.
- **Lexical rules** (pure, `checkTranscriptPath(kind, p, ctx)`):
  1. `p` is a string, absolute, at most 1024 characters, no NUL, and
     `path.normalize(p) === p`. Else `bad path`.
  2. The base name matches the kind. Main:
     `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$`.
     Agent: `^agent-[a-f0-9]{8,32}\.jsonl$`. Meta:
     `^agent-[a-f0-9]{8,32}\.meta\.json$`. Else `name`.
  3. Main: the stem equals the `session_id` of the same line. Else
     `foreign session`.
  4. Agent and meta: equal to the expected path of D2. Else `foreign
     session` or `agent id mismatch`.
  5. `p` starts with `lexicalRoot + sep` or `realRoot + sep`. Else
     `outside root`.
  - The rules run in this order, and the first failure names the reason.
    An agent whose session has a refused main path inherits that reason
    (for example `refused: outside root`), because no expected path
    exists for it.
- **Filesystem rules** (`gateReal`):
  6. `rel` is `p` relative to the matched root.
     `fs.realpathSync(p)` must equal `path.join(realRoot, rel)`. A
     difference means a symlink below the root: `symlink`. `ENOENT` means
     `missing` (not a refusal, no error line).
  7. Open with `O_RDONLY | O_NONBLOCK | O_NOFOLLOW`. `fstat` must be a
     regular file. Else `not a regular file`. Other codes give
     `unreadable: <code>`.
- **Error lines**: a refusal adds `transcript: refused: <reason>` to the
  snapshot `errors`, once per reason. `<reason>` is one of `bad path`,
  `name`, `foreign session`, `agent id mismatch`, `outside root`,
  `symlink`, `not a regular file`, `no session root`. Each comes from a
  fixed list, never from input, so no path can reach the line.
- **No listing**: the reader opens only the gated paths. It never calls
  `readdir` under the root.
- Residual: a swap of a directory below the root to a symlink between
  check and open. Only the user can write under `~/.claude`. This is the
  same residual that `openContained` accepts.

### D7 — The reader: `createSessionReader`

`board-session.mjs` exports `SESSION_CAP_BYTES = 32 * 1024 * 1024`,
`REPORT_CAP_BYTES`, the pure functions, and
`createSessionReader({ root, capBytes = SESSION_CAP_BYTES, log = null })`:

- `sync({ events, state })` → `{ tokens, agents: Map(id → { transcript,
  description, model }), errors }`. Called by `loadSnapshot` only when
  `state` is non-null. It gates the paths (D6), reads the appended bytes
  of every known file, and computes the sums.
- Per file: `{ ino, offset, rest, usage: Map, lastGroup }`.
  - First read: when `size > capBytes`, start at `size - capBytes` and
    drop the text up to the first newline (the cut line). Else start at 0.
  - Later reads: read `[offset, size)` in 1 MB chunks into one reused
    buffer. Keep the bytes after the last newline in `rest` and prepend
    them next time. `rest` above `capBytes` is dropped with its line.
  - `size < offset` or a new `ino`: the file was replaced. Reset its state
    and read again by the first-read rule.
- `bytesRead`: a counter of the bytes that the reader read. Tests use it.
- The module uses `import fs from 'node:fs'` and calls `fs.statSync`,
  `fs.openSync`, and `fs.readSync` through that object, so a test can
  spy on them (T24).
- `changed()` → `true` when a known file has a new size or `ino`. With no
  known file it makes no `stat` call.
- `agentReply(agent, startedAt)` → the D9 fields. It runs a catch-up read
  of that one file first, so a just-finished agent shows its last lines.
- `reset()`: drop all file state and the sticky sets.
- `log(reason)`: called once per distinct refusal or read failure per
  `startedAt`. `null` under `--quiet`. The text is `transcript:
  refused: <reason>` or `transcript: unreadable: <code>`. No path, no
  transcript text.
- **Poll** (`board.mjs` `runServer`): `setInterval(5000)`. Each tick: when
  the current snapshot has no state, call `reader.reset()` once and
  return. Else when `reader.changed()`, call `refresh()`. The existing
  watch and its 1.5 s signature poll do not change.
- `loadSnapshot(projectDir, prev = null, session = null)`: a third
  argument. `null` keeps today's behavior, so the 243 tests call it as
  before. With a reader and a state: merge `transcript`, `description`,
  `model` into the snapshot agents; add `tokens`, `attribution`, and the
  reader errors.

### D8 — Tokens fact: `tokensFact` and `renderNow`

- `tokensFact(sessionSum, tokenDelta, startedAt)` in `board-model.mjs`
  (pure). `sessionSum` is the reader sum or `null`. Returns
  `{ source: 'transcripts', spent, input, cache, output, since }`, else
  `{ source: 'state', spent: tokenDelta }`, else
  `{ source: 'none', spent: null }`.
- The snapshot gains `tokens` (always present; `none` with no state) and
  keeps `tokenDelta`.
- `renderNow` reads `view.tokens`. The fact value is `fmtTok(spent)`, so
  `—` for null. The `.v` element of the tokens fact gets a `title`:
  - `transcripts`: `from session transcripts since <since>: <in> / <cache> / <out>`,
    each number through `Number.prototype.toLocaleString('en-US')`.
  - `state`: `from the state file, as the model reported it`.
  - `none`: no title.
- The page passes `snap.tokens` in the view. E1 updates the `nowView`
  fixture.

### D9 — Server: `GET /api/agent?id=<id>`

- `serve(getSnapshot, subscribe, readItemBody, readAgent = () => null)`:
  a fourth argument.
- `id` must match `^[a-f0-9]{8,32}$` and name an agent in
  `getSnapshot().agents` that is not running. Else 404 `not found`, with
  no read.
- Reply 200, `application/json`, `cache-control: no-store`, plus the two
  global headers:
  `{ id, agent_type, description, model, start, end, durationSec, usage, report, truncated, error }`.
  `usage` is `{ spent, input, cache, output }` of that agent file, or
  `null`. `report` is the raw text or `null`. `error` is `null` or one of
  `missing`, `refused: <reason>`, `unreadable: <code>`, `no report`,
  `no workflow in flight`.
- Build the reply from a fixed key list, never from a spread of a parsed
  line or of the reader state.
- `runServer` passes `(id) => reader.agentReply(agent, state.startedAt)`
  when a workflow is in flight, else a reply with
  `error: 'no workflow in flight'`.
- `/api/agent` has no other gate. Spec §10 lists its rules; this plan
  adds the derived-path check.

### D10 — Render exports (`board-render.mjs`)

Each new or changed export uses no module-scope symbol and gets an
`ISOLATION_ARGS` entry (carry-over 024 item 1). An export calls only
other exports.

- `parseRoute(hash)`: add `#/agent/<id>` with `^[a-f0-9]{8,32}$` →
  `{ view: 'agent', id }`, and `#/step/<id>` with
  `^[a-z0-9][a-z0-9-]{0,39}$` → `{ view: 'step', id }`. Other text keeps
  the overview.
- `renderAgents(view, esc)`: a finished row whose `agent_id` matches the
  id regex is
  `<li><button type="button" class="arow" data-action="open-agent" data-value="<id>">…</button></li>`.
  A running row and a row without a valid id stay plain. Each row with a
  `description` shows it in `<span class="muted desc">`. The `li` count
  does not change.
- `renderSteps(progress, esc, attribution)`: a step with `state ===
  'done'` and at least one id in `attribution[step.id]` renders as
  `<button type="button" class="step done" data-action="open-step" data-value="<id>">`.
  Every other step stays a `div`. The `attribution` argument is optional.
- `renderNow(view, esc)`: D8. It passes `view.attribution` to
  `renderSteps`.
- `renderMarkdown(text, markdownit, esc, tree, keepHead)`: with
  `keepHead` true it skips the front-matter strip and the H1 drop. A
  report keeps its first heading.
- `renderAgentHead(reply, view, esc)`: the agent type without
  `constellation:`, the description, the model, the start
  (`view.hhmm`), the duration (`view.fmtDur`), and the tokens
  (`view.fmtTok(usage.spent)`).
- `renderAgentReport(reply, view, esc)`: the rendered report with
  `keepHead`, then `<p class="muted">truncated at 256 KB</p>` when
  `truncated`. When `report` is null: `<p class="muted">Transcript not
  available (<error>)</p>`.
- `renderAgentDialog(view, esc)`: `view = { reply, markdownit, tree, hhmm,
  fmtDur, fmtTok }`. A `.dlg-head` with `#dialog-title` and the close
  button, as `renderPlanDialog`, then `<div class="dlg-body md">`. A
  `reply.error` of `network` or a status code gives `Transcript not
  available (<error>)`.
- `renderStepDialog(view, esc)`: `view = { step: { id, emoji, label },
  replies, … }`. Header: the emoji and the label. Body: one
  `<details class="ablock">` per reply, start ascending (newest last),
  `open` when there is one reply. The `summary` holds `renderAgentHead`;
  the block body holds `renderAgentReport`.

### D11 — Page runtime (`board-ui/page.js`)

- **Dialog state** (carry-over 024 item 2): replace `dialogFile` with
  `dialogKey` (`plan:<file>`, `agent:<id>`, `step:<id>`). Keep one
  `dialogSeq` and one `routeBefore`. A helper
  `isDialogView(view)` is true for `plan`, `agent`, `step`.
- `openDialogRoute(hash)` replaces `openPlanRoute`: it sets `routeBefore`
  only when the current route is not a dialog view, then sets
  `location.hash`.
- `syncRoute()`:
  - `plan`: as today.
  - `agent`: open when `snap.agents` holds a finished agent with that id.
    `GET /api/agent?id=…` → `renderAgentDialog`.
  - `step`: open when the step is `done` in `snap.progress` and
    `snap.attribution[id]` is not empty. Fetch each id in parallel; when
    all replies settle, render `renderStepDialog`. A failed fetch gives
    `{ error: <status> | 'network' }` for that block.
  - Each open increments `dialogSeq`. A reply writes only when its
    `seq === dialogSeq`. Every other route closes the dialog, as today.
  - The dialog does not refetch on a new snapshot (no live tail).
- `onDialogClose()`: replace the hash with `routeBefore || '#/'` when the
  current route is any dialog view (today: plan only).
- `paintBacklogCard()`: the list hash is `routeBefore` for any dialog view.
- **Clicks**: `#agents` handles `[data-action="open-agent"]` →
  `openDialogRoute('#/agent/' + id)`. `#now` handles
  `[data-action="open-step"]` → `openDialogRoute('#/step/' + id)`.
- **Focus and scroll** (carry-over 024 item 3, criterion 8): generalize
  `keepFocus(container, repaint, scope)`. `renderNowCard` and
  `renderAgentsCard` repaint through it, keyed by `data-action` and
  `data-value`. `renderAgentsCard` saves `#agents.scrollTop` before the
  repaint and restores it after. The backlog card keeps its current call.
- Do not edit the backlog list code that tasks 034, 035, and 036 name
  (`listVocab`, the parent walk, the banner and type-filter scope)
  (carry-over 024 item 7).

### D12 — Step attribution: `attributeAgents(agents, progress)`

Pure, in `board-model.mjs`. Returns `{ [stepId]: [agent_id, …] }`, start
ascending. Only agents with a valid `agent_id` and a start time count.
The type is `agent_type` without `constellation:`.

| Agent type | Candidate steps, in track order |
|---|---|
| software-architect | architect, architect-feasibility, architect-verify |
| product-manager | product-manager, architect |
| software-engineer, frontend-engineer, ui-ux-designer | engineer |
| code-reviewer, security-analyst, dx-analyst | parallel-gate-1, review-gate |
| cross-model-reviewer | plan-review, parallel-gate-1, review-gate |
| sdet, technical-writer | parallel-gate-2, sdet |
| devops-engineer | devops-branch, devops-pr |

Algorithm:

1. `present` = the candidate steps that `progress.steps` holds, in track
   order. None: the run is not attributed.
2. One present step: the run attaches to it. Pass 1 handles these runs.
3. Two or more (pass 2): walk the present steps from the last to the
   second. The run attaches to step `s[k]` when a pass-1 run, attributed
   to a step that lies strictly between `s[k-1]` and `s[k]` in
   `progress.steps`, started before it. Else the run attaches to `s[0]`.
4. No time window. Ties in start time keep the event order.

Results on the five tracks:

- planned: PM rounds → architect (Plan). Architect pairing rounds →
  architect. The architect run after the engineer → architect-verify.
  The first devops run → devops-branch; the run after the engineer →
  devops-pr. Fix-loop reruns of the gate agents → parallel-gate-1.
  Engineer reruns → engineer. A cross-model plan review before the
  engineer → plan-review (when present); after it → parallel-gate-1.
- tweak: gates → parallel-gate-1; sdet and technical-writer → sdet.
- hotfix: gates → review-gate; sdet → sdet.
- discovery: PM → product-manager; architect → architect-feasibility.
- spike: architect → architect; engineer → engineer.

A wrong guess shows a report under a neighbor step. It never hides a
report, because the agent row still opens it.

### D13 — Spec deltas (Technical Writer)

`docs/specs/board-ui-v2.md`:

- §8.1: SubagentStart carries no `description` and no
  `agent_transcript_path` in Claude Code 2.1.285. The board takes the
  description from `.meta.json` and derives the agent path.
- §8.3: the gate (D6) with the derived-path rule; the workflow-session
  rule (D3); dedupe keeps the last line of an id (D4).
- §8.4: the attribution table and algorithm of D12.
- §6.5: the `Copy` button moves to task 037.

### D14 — Styles (`board-ui/page.css`)

No inline style (the CSP has one style hash; the 022 test checks the
sources).

```css
.arow { all: unset; box-sizing: border-box; display: grid; grid-template-columns: auto 1fr auto; gap: 8px; width: 100%; padding: 2px 4px; border-radius: 6px; cursor: pointer; }
.arow:hover { background: var(--surface-2); }
.arow:focus-visible, button.step:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.arow .desc { grid-column: 2 / 4; font-size: 12px; overflow-wrap: anywhere; }
button.step { font: inherit; color: inherit; background: none; cursor: pointer; width: 100%; }
button.step:hover { opacity: 1; background: var(--surface-2); }
.ablock { border-top: 1px solid var(--border); padding: 8px 0; }
.ablock > summary { cursor: pointer; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.dlg-body { overflow: auto; min-height: 0; }
```

The engineer matches the grid of the current agent `li` rows. The dialog
size rules of 023 stay. `.dlg-body` already scrolls when the rule exists;
add it only when it is missing.

## Implementation

All paths are under
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/`
unless given in full.

### Files

| File | Change | Lines (about) |
|---|---|---|
| `log-event.sh` | D1 fields, the criterion 24 skip, and the header comment. | +12 |
| `log-event.test.sh` | H1 to H6. | +55 |
| `board-session.mjs` | New. `SESSION_CAP_BYTES`, `REPORT_CAP_BYTES`, `usageOf`, `sumUsage`, `extractReport`, `checkTranscriptPath`, `sessionsOf`, `createSessionReader` (D2 to D7). Imports `node:fs`, `node:path` only. | +280 |
| `board-model.mjs` | `pairEvents` copies `description`; `attributeAgents`, `tokensFact`; `emptySnapshot` gains `tokens` and `attribution` (D3, D8, D12). | +80 |
| `board-render.mjs` | D10. | +150, -15 |
| `board-ui/page.js` | D11. | +110, -25 |
| `board-ui/page.css` | D14. | +12 |
| `board.mjs` | `export * from './board-session.mjs'`; the whole-window event read; the `session` argument of `loadSnapshot`; `/api/agent`; the reader and the 5 s poll in `runServer`; `os.homedir()` root (D3, D7, D9). | +70 |
| `board-session.test.mjs` | New. T1 to T9, T17 to T25. | +450 |
| `board.test.mjs` | T10 to T16, T26 to T44; E1 to E6; `ISOLATION_ARGS`; `bootPage` gains `#now` click wiring and `/api/agent` replies. | +550 |
| `/Users/joaooliveira/study/constellation-harness/CHANGELOG.md` | `[Unreleased]` entries and the count line. Technical Writer. | — |
| `/Users/joaooliveira/study/constellation-harness/README.md` | Lines 214 and 215. Technical Writer. | ±2 |
| `/Users/joaooliveira/study/constellation-harness/docs/specs/board-ui-v2.md` | D13. Technical Writer. | +12 |

No change to `hooks.json` (the hook already runs on all four events),
`selftest.sh` (its glob `*.test.mjs` takes the new test file),
`board-vendor/`, `board.md`, `plugin.json`, `marketplace.json`, or
`templates/`. `board.mjs` keeps its role as the entry, and the test
`board.mjs: re-exports every 1.3.4 name` stays green.

### Existing tests that change

- **E1**: the `nowView` fixture (line about 2299) gains `tokens`.
- **E2**: the snapshot fixture (line about 2351) gains `tokens` and
  `attribution`.
- **E3**: `renderAgents` tests (lines about 1934 to 1975, 2439) that pin
  finished-row markup. The row is a button inside the same `li`.
- **E4**: the `ISOLATION_ARGS` entries of `renderSteps`, `renderNow`,
  `renderAgents`, `renderMarkdown`, and `parseRoute` (one case each with
  the new paths).
- **E5**: the `parseRoute` overview list, when it holds a hash that
  becomes an agent or step route.
- **E6**: the `serve` call sites keep working with three arguments; no
  edit unless a test counts parameters.

The engineer lists each edit in the commit body of its step.

### Order, with checkpoint commits

Each step ends GREEN, then VERIFY per
`constellation:test-verified-development` (mutation variant, named per
test below), then one commit. The commit body records the VERIFY
evidence.

1. **Hook fields and the helper-stop skip.** D1, criterion 24. Tests H1
   to H6.
   Commit: `feat: log-event.sh logs the transcript paths and the agent description, and skips helper-agent stops (task 025)`.
2. **Pure session and model functions.** `usageOf`, `sumUsage`,
   `extractReport`, `checkTranscriptPath`, `sessionsOf`,
   `attributeAgents`, `tokensFact`, `pairEvents` description. Tests T1 to
   T16.
   Commit: `feat: board sums transcript usage, extracts agent reports, and attributes agents to steps (task 025)`.
3. **Reader and snapshot.** `createSessionReader`, the gate, the caps, the
   whole-window event read, the `session` argument, the 5 s poll, the
   quiet logger. Tests T17 to T25; E2.
   Commit: `feat: board reads the workflow session transcripts under ~/.claude/projects with containment and caps (task 025)`.
4. **Route.** `/api/agent`. Tests T26 to T31; E6.
   Commit: `feat: board serves agent reports at /api/agent (task 025)`.
5. **Render.** D10, D14. Tests T32 to T39; E1, E3, E4, E5.
   Commit: `feat: board renders the tokens source, agent rows and done steps as buttons, and the agent and step dialogs (task 025)`.
6. **Page runtime.** D11. Tests T40 to T44.
   Commit: `feat: board page opens agent and step dialogs from the hash and keeps focus on live repaints (task 025)`.
7. **Manual check** (Validation). Fix what it finds, then commit under
   `fix:` when a fix was needed.

### Data flow

- Hook: Claude Code → `log-event.sh` → `events.jsonl` line with
  `session_id`, `transcript_path`, and on SubagentStop
  `agent_transcript_path`.
- Snapshot: `readTail(events, Infinity)` → `parseEventLines` → window
  (last 200 or since `startedAt`) → `pairEvents` → agents. With a state:
  `reader.sync({ events, state })` → `sessionsOf` → gate (D6) → read
  appended bytes → `usageOf` per assistant line → per-file maps →
  `sumUsage` → `tokensFact` → `snapshot.tokens`; meta → agent
  `description`, `model`, `transcript`; `attributeAgents(agents,
  progress)` → `snapshot.attribution`.
- Poll: every 5 s, `reader.changed()` → `refresh()` → SSE frame → page
  `render()` → `keepFocus` repaints.
- Agent dialog: button → `openDialogRoute('#/agent/<id>')` →
  `hashchange` → `syncRoute` → `GET /api/agent?id=` → id regex and
  snapshot check → `reader.agentReply` (catch-up read, `extractReport`,
  per-agent `sumUsage`) → fixed-key reply → `renderAgentDialog`.
- Step dialog: button → `#/step/<id>` → `syncRoute` →
  `snap.attribution[id]` → parallel `/api/agent` → `renderStepDialog`.
- Close: Esc or ✕ → `close` → `onDialogClose` → `replaceState(routeBefore
  || '#/')`.

## Validation

Follow `constellation:test-verified-development`. Every new test has a
named mutation: apply it, run the file, confirm that the named test fails
for that reason, restore the code.

- Run: `node --test /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/*.test.mjs`
- Hook: `bash /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/log-event.test.sh`
- Lint Gate: `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`
- Mocking: none at the logic level. Fixtures are in-memory line arrays,
  temporary directories that stand in for `~/.claude/projects`, real
  local sockets, and the `vm` page sandbox. No test reads the real
  `~/.claude`. `createSessionReader` takes the temp root.

All 243 current tests pass on `main` at c309fc9.

**Automated Test**: hook (`log-event.test.sh`; criteria 1 to 3, 24)

| # | Case | Proves | Mutation that must fail it |
|---|---|---|---|
| H1 | SubagentStart with `description`, `agent_transcript_path`, `transcript_path` | The line holds the three values. | Remove `description` from the `jq` object. |
| H2 | SubagentStop with `agent_transcript_path`, `transcript_path` | The line holds both. | Limit `agent_transcript_path` to SubagentStart. |
| H3 | Three inputs, each without one field | The line has no key for the absent field. | `.description // ""` in place of `str(500)`. |
| H4 | PostToolUse and Stop with `transcript_path` | The line holds it. | Limit `transcript_path` to the Subagent events. |
| H5 | `description` as an object; a 1025-character path | Both keys absent; the hook prints nothing; exit 0. | Drop the `type == "string"` check. |
| H6 | SubagentStop without `agent_type`, with `agent_type: null`, and with `agent_type: ""`; then a SubagentStop with `agent_type` (criterion 24) | The line count stays the same for the three helper stops; the fourth adds one line; exit 0 and no output each time. | Remove the `[ -n "$AT" ] \|\| exit 0` guard. |

**Automated Test**: pure session functions (`board-session.test.mjs`; criteria 5, 6, 10, 14 to 17)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T1 | `sumUsage: lines that repeat one message.id count once, and the last line wins` | Three lines of `m1` with output 16, 16, 299 and equal input → `output` 299 and `input` once. | First line wins; or no dedupe. |
| T2 | `sumUsage: entries before startedAt and entries without a parseable timestamp drop out` | One entry 1 s before the cut is out; one at the cut is in; `sinceMs: null` keeps all. | Remove the cut. |
| T3 | `extractReport: the last SubagentHandback message is the report` | A group of thinking, text, and a `SubagentHandback` block → `input.message`. | Prefer the text blocks. |
| T4 | `extractReport: without a handback, the text blocks of the last message join` | Two text lines of the last id join with a blank line; an earlier id's text is absent; no assistant line → `error: 'no report'`. | Join the text of every group. |
| T5 | `extractReport: a report over 256 KB keeps its first 256 KB and sets truncated` | 300 KB of `é` → byte length ≤ 256 KB, no `�`, `truncated: true`; 10 bytes → `truncated: false`. | Cap at 512 KB. |
| T6 | `usageOf: keeps only the id, the time, and the four numbers` | `Object.keys` equals the six names; a line with text content and a sentinel prompt yields no sentinel in `JSON.stringify`; a non-number field → 0; a `user` line → null. | Return `{ ...message.usage, text }`. |
| T7 | `checkTranscriptPath: names, absolute paths, normalization, and the root prefix` | Table: valid main, agent, meta; `x.jsonl`, `agent-XYZ.jsonl`, `../`, relative, NUL, 1025 characters, outside root → each named reason. | Loosen the main regex to `\.jsonl$`. |
| T8 | `checkTranscriptPath: an agent path must be the derived path of its line` | Other session folder → `foreign session`; other id → `agent id mismatch`; main stem ≠ `session_id` → `foreign session`. | Drop the `agent_id` comparison. |
| T9 | `sessionsOf and the workflow sessions: only sessions with an agent or a state write since startedAt count` | A Stop-only session is named but not a workflow session; a session before `startedAt` is out. | Count every session in the window. |

**Automated Test**: attribution and the fact (`board.test.mjs`; criteria 7, 11, 22)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T10 | `attributeAgents: planned track, two architect runs, Plan then Verify` | Criterion 11 case: architect, devops, engineer, gate trio, gate-2 duo, architect, devops → architect gets run 1, architect-verify run 2, devops-branch and devops-pr one each. | Attach every run of a multi-step type to its first present step. |
| T11 | `attributeAgents: planned track with pairing rounds and a fix loop` | PM, architect ×2 before the engineer → architect; a code-reviewer rerun and an engineer rerun → parallel-gate-1 and engineer; verify run → architect-verify. | Use the spec count rule (second run → second step). |
| T12 | `attributeAgents: tweak track` | Gates → parallel-gate-1; sdet → sdet. | Remove `sdet` from the sdet candidates. |
| T13 | `attributeAgents: hotfix track` | Gates → review-gate. | Remove `review-gate` from the gate candidates. |
| T14 | `attributeAgents: discovery track` | PM → product-manager; architect → architect-feasibility. | Remove `architect-feasibility`. |
| T15 | `attributeAgents: spike track and unknown types` | Architect → architect; engineer → engineer; `Explore`, a null type, and an id that fails the regex → absent; a step not in `progress` gets no key. | Keep agents without a valid id. |
| T16 | `tokensFact: transcripts first, then the state delta, then none` | Three cases and their `source`. | Swap the first two branches. |

**Automated Test**: the reader (`board-session.test.mjs`; criteria 4, 8, 9, 15 to 21)

Each test builds a temp root `<tmp>/projects/-p/` with a main transcript
`<uuid>.jsonl`, a `subagents/` folder, and an event array.

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T17 | `reader: a file over the cap reads its last cap once, drops the cut line, then reads only appended bytes` | Cap 1 KB, file 1.25 KB: first `bytesRead` is 1024 and the cut line is not counted; append 200 bytes → `bytesRead` grows by 200; `SESSION_CAP_BYTES === 33554432`. | Read from offset 0 each sync. |
| T18 | `reader: a path outside the root and a bad name read nothing and add one refused line without the path` | `bytesRead` 0 for them; `errors` holds `transcript: refused: outside root` and `transcript: refused: name` once; no error holds the temp dir. | Put the path in the error text. |
| T19 | `reader: a symlink at the file or at a folder below the root is refused` | File link and `subagents` link → `transcript: refused: symlink`, no read. A linked root (the `projects` folder itself) still reads. | Drop the realpath equality check. |
| T20 | `reader: an agent path in another session folder or with another agent id reads nothing` | Stop line with a path under a session that the log does not name; and `agent-<other>.jsonl` → refused, `transcript: false`. | Accept the stop line path without the comparison. |
| T21 | `reader: the session sum covers the main transcript and three agent transcripts since startedAt` | Hand sum equals `tokens.spent`; the parts match; a Stop-only foreign session is out; meta gives `description` and `model`. | Skip the agent files. |
| T22 | `reader: no main transcript text and no path reaches the snapshot` | Sentinels in a user prompt, an assistant text block, and a tool input of the main file; `JSON.stringify(snapshot)` holds no sentinel and not the temp dir. | Copy `message` into the usage map. |
| T23 | `reader: a grown transcript gives the new sum at the next sync; a partial last line waits for its newline` | Append half a line → sum unchanged; append the rest → sum grows; `changed()` true after each append, false after the sync. | Drop the `rest` carry. |
| T24 | `reader: no workflow in flight reads nothing and polls nothing` | `loadSnapshot` with no state → `bytesRead` 0, `tokens.source` `none`; after `reset()`, `changed()` makes no `fs.statSync` call (spy). | Call `sync` without a state. |
| T25 | `reader: quiet prints nothing; the logger gets one line per reason and no path` | `log: null` and a spy on `process.stderr.write` and `console.error` → no call; with a logger → one call per reason across two syncs, text without the temp dir; the source holds no `readdirSync`. | Log with `console.error` always. |

**Automated Test**: `/api/agent` (`board.test.mjs`; criteria 13, 14, 18, 19, 22)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T26 | `serve: /api/agent returns 200 with the report of a fixture transcript` | Handback text; `usage` of that file; `start`, `end`, `durationSec` from the snapshot. | Return the first assistant text. |
| T27 | `serve: /api/agent with a refused path returns report null and the reason` | `error: 'refused: outside root'`; no path. | Return 404 for a refusal. |
| T28 | `serve: /api/agent replies with the spec keys only, no path, no prompt, no tool input` | `Object.keys` equals the eleven names; the body holds no temp dir, no prompt sentinel, no Bash input sentinel; headers `no-store`, `nosniff`, `no-referrer`. | Add `path` to the reply. |
| T29 | `serve: /api/agent with a foreign session folder reads nothing` | `error: 'refused: foreign session'`; `bytesRead` unchanged. | Drop the session check. |
| T30 | `serve: /api/agent refuses a bad id, an unknown id, and a running agent with 404` | `../x`, `ABCDEF12`, `abc`, an unknown valid id, a running id → 404, no read. | Drop the running check. |
| T31 | `serve: foreign Host on /api/agent returns 403` | 403. | Move the route above the Host check. |

**Automated Test**: render (`board.test.mjs`; criteria 4, 7, 10, 11, 13, 14)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T32 | `parseRoute: agent and step routes` | `#/agent/a0e575badeb8675d0` → agent; `#/agent/XYZ` and `#/agent/../x` → overview; `#/step/architect-verify` → step; `#/step/A b` → overview. | Drop the `$` anchor of the agent regex. |
| T33 | `renderAgentDialog: header, report, truncation line, and the unavailable state` | The six header facts; markdown body with its H1 kept; `truncated at 256 KB`; `Transcript not available (missing)`; text escaped. | Drop the truncation line. |
| T34 | `renderStepDialog: one block per agent, newest last, open when alone` | Order by start; `open` only with one block. | Reverse the order. |
| T35 | `renderAgents: a finished row with a valid id is a button; a running row is not; the description is muted` | `data-action="open-agent"` count; running row has no button; `<script>` in a description is escaped. | Render running rows as buttons. |
| T36 | `renderSteps: only a done step with attributed agents is a button` | Done with agents → button; done without, current, pending → `div`. | Make the current step a button. |
| T37 | `renderNow: the tokens fact shows the source tooltip` | `transcripts` title text exact with `1,234` style numbers; `state` title; `none` → `—` and no title. | Swap the two titles. |
| T38 | `renderMarkdown: keepHead keeps the front matter and the first H1` | With `keepHead` the H1 renders; without, the 023 behavior holds. | Ignore `keepHead`. |
| T39 | `board-render.mjs: every export runs in a vm context that holds only the prelude` (existing 024 T25) | New entries for `renderAgentHead`, `renderAgentReport`, `renderAgentDialog`, `renderStepDialog`. | Call a non-exported helper. |

**Automated Test**: page runtime (`board.test.mjs`, `bootPage`; criteria 8, 10 to 12)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T40 | `page: a click on a finished agent row opens #/agent/<id> and renders the reply` | Hash, one `/api/agent?id=` fetch, dialog `showModal`, title. | Remove the `#agents` handler branch. |
| T41 | `page: closing an agent dialog returns to the route before it` | From `#/backlog?kind=feature` → agent → close → hash `#/backlog?kind=feature`. | Keep the plan-only check in `onDialogClose`. |
| T42 | `page: a done step opens #/step/<id> and fetches each attributed agent` | Two fetches; blocks in start order; a pending step hash shows the overview and no fetch. | Fetch only the first agent. |
| T43 | `page: a reply for an earlier dialog after a later one opened is dropped` | Deferred: open agent A, then step S; resolve S, then A → the dialog holds S. | Remove the `seq` check in the agent open. |
| T44 | `page: a snapshot repaint keeps the focus on a step button and an agent row, and the agents scroll offset` | `document.activeElement` keeps `data-value`; `#agents.scrollTop` restored. | Repaint `#now` without `keepFocus`. |

**MANUAL TEST**: tokens, dialogs, and layout in a browser (criteria 4, 8, 10 to 15, 23; spec §11)

- **Why manual**: the real Chrome layout at 390 px, keyboard-only use of
  the native dialog, Esc, focus rings, and the 5 s live update need a
  browser. The project adds no browser dependency.
- **Preconditions**: the branch at step 6 or later; Chrome; the CDP
  driver `<scratchpad>/cdp-024.mjs` copied to `<scratchpad>/cdp-025.mjs`
  (it already has the evaluate argument and `--width 390`). This repo has
  no `config.json`, so `log-event.sh` logs nothing here. The orchestrator
  builds a scratch initialized project and fake transcripts under a temp
  HOME. Never point the board at the real `~/.claude`.
- **Fixture**: write `<scratchpad>/board-fixture/build-025.sh`. Use a
  real path: on macOS `/tmp` is a symlink, and the gate compares real
  paths, so use the scratchpad path under `/private/tmp`.

```bash
#!/usr/bin/env bash
# Task 025 fixture: a scratch initialized project and a fake HOME with transcripts.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd -P)"
FIX="$HERE/project025"; FHOME="$HERE/home025"
TPL=/Users/joaooliveira/study/constellation-harness/plugins/constellation/templates
rm -rf "$FIX" "$FHOME"
mkdir -p "$FIX/.constellation/state" "$FIX/.constellation/metrics" "$FIX/.constellation/tasks" "$FIX/.constellation/plans"
echo '{}' > "$FIX/.constellation/config.json"
cp "$TPL/tracks.json" "$FIX/.constellation/"
printf -- '---\nstatus: in-progress\ntype: feature\n---\n# Session reader fixture\n\nBody.\n' > "$FIX/.constellation/tasks/025-fixture.md"
cat > "$FIX/.constellation/state/current-workflow.json" <<'EOF'
{ "track": "planned", "branch": "feat/025-fixture", "task": "025-fixture.md", "currentStep": "devops-pr", "completedSteps": ["architect","devops-branch","engineer","lint-gate","parallel-gate-1","parallel-gate-2","architect-verify"], "reviewLoopCount": 1, "startedAt": "2026-10-21T09:00:00Z", "lastUpdatedAt": "2026-10-21T11:00:00Z" }
EOF
node "$HERE/gen-025.mjs" "$FIX" "$FHOME"
echo "HOME=\"$FHOME\" node /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs \"$FIX\" --port 4499"
```

  `gen-025.mjs` (scratchpad, not in the repo) writes, with `SID =
  11111111-2222-4333-8444-555555555555` and `SLUG =
  $FHOME/.claude/projects/-fixture`:
  - `SLUG/SID.jsonl`: 30 assistant lines, 5 of them before `startedAt`,
    with pairs that repeat a `message.id` and grow `output_tokens`, plus
    `user` lines with the sentinel `MAIN-SECRET`.
  - Agents (17-character ids): `software-architect` ×2 (09:05, 10:40),
    `devops-engineer` ×2, `software-engineer`, `code-reviewer` ×2 (one
    fix-loop rerun), `security-analyst`, `sdet`, `technical-writer`. Each
    gets `subagents/agent-<id>.jsonl` (a `user` line with
    `AGENT-PROMPT-SECRET`, a Bash `tool_use` with `TOOL-SECRET`, a final
    `SubagentHandback` with a markdown report) and `.meta.json`
    (`agentType`, `description`, `model`). One architect report is 300 KB.
    One code-reviewer gets no `.jsonl` (missing). One sdet run ends with
    text and no handback.
  - `events.jsonl`: SubagentStart and SubagentStop lines for each agent
    with `session_id`, `transcript_path`, and on stop
    `agent_transcript_path`; a PostToolUse line for
    `.constellation/state/current-workflow.json`; a second session
    `22222222-3333-4444-8555-666666666666` whose `transcript_path` is a
    real `<uuid>.jsonl` file in `$HERE/outside025/` (outside the root),
    with one SubagentStart and SubagentStop pair (expect
    `transcript: refused: outside root`, and that agent dialog says
    `Transcript not available (refused: outside root)`); one SubagentStop
    whose `agent_transcript_path` names another agent id (expect
    `transcript: refused: agent id mismatch`); one running agent (start
    line only).
  - It prints the independent check:
    `jq -s --arg s 2026-10-21T09:00:00Z '[.[] | select(.type=="assistant" and .message.usage and .timestamp >= $s)] | group_by(.message.id) | map(max_by(.message.usage.output_tokens).message.usage | .input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens + .output_tokens) | add' "$SLUG/$SID.jsonl" "$SLUG/$SID"/subagents/agent-*.jsonl`
- **Steps**:
  1. Run `build-025.sh`, start the printed command, open
     `http://127.0.0.1:4499`. The console holds no CSP error.
  2. Hover the tokens fact. Expect the `from session transcripts since
     2026-10-21T09:00:00Z: …` title. The value matches the `jq` sum
     (exact for the fixture).
  3. Append one assistant line with known usage to the main transcript.
     Within 6 s the fact grows by that amount. Keep the focus on a step
     button during the wait: it keeps the focus and the page keeps its
     scroll.
  4. Keyboard only: Tab to the newest finished architect row, press
     Enter. Expect the dialog with type, description, model, start,
     duration, tokens, and the rendered report. Esc closes it; the hash
     returns to `#/`.
  5. Open the 300 KB report: expect `truncated at 256 KB` at the end of a
     body that scrolls inside the dialog.
  6. Open the missing code-reviewer: `Transcript not available (missing)`.
  7. Tab to the done Plan step, press Enter: blocks in start order
     (first architect only, plus nothing from Verify). Open the Verify
     step: the second architect. Open Review Gate 1: both code-reviewer
     runs and the security analyst.
  8. The running agent row and the current and pending steps take no
     focus as buttons.
  9. `curl -s 'http://127.0.0.1:4499/api/agent?id=<id>' | grep -c
     'SECRET\|home025'` prints `0` for every agent. `curl -s
     http://127.0.0.1:4499/api/snapshot | grep -c 'SECRET\|home025'`
     prints `0`.
  10. The Now errors region holds `transcript: refused: outside root`
      and `transcript: refused: agent id mismatch`, each once, and no
      path.
  11. Run the CDP driver at 1280 px and with `--width 390`, dark and
      light, on `#/agent/<id>` and `#/step/parallel-gate-1`. Expect
      `scrollWidth === clientWidth`, the dialog inside the viewport, and
      the body scroll inside it.
  12. Remove the state file. Within 6 s the Now card shows `No workflow
      in flight`; `lsof -p <pid>` lists no transcript.
  13. Restart the board with `--quiet` and a refused path in the log:
      stdout and stderr stay empty.
- **Expected**: each step as written. Any path or sentinel in a reply, a
  focus jump on a repaint, or a horizontal scroll at 390 px fails the
  check.
- **Observability**: the snapshot `tokens.source` and `errors`; the
  board stderr without `--quiet`; the CDP state line (`scrollWidth`,
  `clientWidth`, `location.hash`); screenshots in the scratchpad.

## Integration Touchpoints

- **Claude Code hook input** - Could break: a version renames or drops
  `transcript_path` or `agent_transcript_path` - Validation: H1 to H6 pin
  the hook; a missing path gives the state fallback, visible as
  `tokens.source: state` (data plan decision rule).
- **Claude Code transcript format** (undocumented JSONL) - Could break: a
  new line shape, a new usage key, a renamed handback tool - Validation:
  the parser ignores what it does not know; T1 to T6 pin the 2.1.285
  shape; the manual `jq` check.
- **`~/.claude/projects`** - Could break: a read outside the root, a
  symlink, a foreign session - Validation: D6; T7, T8, T18 to T20, T29.
- **Snapshot wire format** - Could break: a consumer that pins the key
  set - Validation: `tokens`, `attribution`, and the agent fields
  `description`, `transcript`, `model` are additions; `tokenDelta`
  stays; E2.
- **`/api/agent`** - Could break: a leak of a path, a prompt, or tool
  input - Validation: T22, T28, manual step 9.
- **HTTP headers and Host check** - Could break: the new route skips them
  - Validation: T28, T31.
- **CSP** - Could break: a new inline style or handler - Validation: the
  022 tests (no `style=` in the sources, no color literal) cover the new
  code; manual step 1.
- **Shared `#dialog` and history** - Could break: the plan dialog close
  lands on a wrong route - Validation: T41, T43, and the 023/024 plan
  dialog tests stay green.
- **Live repaint** - Could break: focus or scroll jumps every 5 s -
  Validation: T44, manual step 3.
- **The event tail** - Could break: longer lines halve the window, and
  the 200-line agent window drops early agents - Validation: D3 window
  rule and sticky sets; Risk 2.
- **Current tests (243)** - Could break: E1 to E6 - Validation: each edit
  listed in the commit body.
- **Plugin packaging** - Could break: the new `board-session.mjs` is not
  shipped - Validation: the plugin ships the `scripts/` folder whole;
  `board.mjs` imports it, so the import test of 022 fails if it is
  absent.
- **README, spec, CHANGELOG** - Could break: the README still says
  "token delta" and does not disclose the transcript read - Validation:
  the Technical Writer edits (Release notes section).

## Risks

1. **Claude Code changes the transcript or hook format** - Impact: M -
   Likelihood: M - Mitigation: a tolerant parser that keeps six keys per
   line; the state fallback; the `source` field makes a silent fallback
   visible; the data plan opens a fix task on any fallback with logged
   paths.
2. **The sum misses or adds sessions** - Impact: M - Likelihood: L -
   Mitigation: the workflow-session rule (D3) excludes a parallel
   session without agents or state writes; the sticky sets keep early
   sessions inside one board process; criterion 24 removes the helper
   SubagentStop lines, the main cause of window loss, so the 256 KB
   window holds hours of a workflow. Residual: a board restart after
   more than about 600 real log lines since `startedAt` undercounts.
   Known limit (criterion 24): the sum excludes helper-agent spend.
3. **A privacy leak through errors, logs, the snapshot, or the reply** -
   Impact: H - Likelihood: L - Mitigation: fixed reason lists; fixed-key
   replies; the main-file parser keeps six keys; sentinel tests T6, T22,
   T28; manual step 9; the Security Analyst at Gate 1.
4. **The first read of a large transcript blocks the event loop** -
   Impact: L - Likelihood: M - Mitigation: 1 MB chunks, the
   `"type":"assistant"` prefilter, and a 32 MB cap. Expect under 300 ms
   once per file per board process.
5. **Repaint every 5 s during active work disturbs the user** - Impact:
   M - Likelihood: M - Mitigation: `keepFocus` on `#now` and `#agents`,
   the scroll offset restore, T44, manual step 3. A refresh fires only
   when a known file grew.
6. **The attribution guess is wrong in an unusual flow** - Impact: L -
   Likelihood: M - Mitigation: deterministic rule, five-track tests; a
   wrong guess moves a report to a neighbor step, and the agent row
   still opens it.

## Logging

The board has no log file. Its observability is the snapshot, the page,
stderr, and the process exit. No user IDs exist in this local,
single-user tool.

- Reader refusal: one `errors` line per reason in the snapshot
  (`transcript: refused: <reason>`), shown in the Now errors region.
- Reader read failure: `transcript: unreadable: <code>` in `errors`.
- Without `--quiet`: the same text on stderr as `board: transcript: …`,
  once per reason per workflow. With `--quiet`: nothing.
- `/api/agent`: a 404 `not found` for a bad or unknown id, with no stderr
  line, as `/api/item` does. A refusal or a missing file is a 200 with
  `error`, so the dialog shows the reason.
- The page: a failed fetch shows `Transcript not available (<status>)`
  in the dialog.
- The fact source: `tokens.source` in every snapshot (the data plan
  metric).

## Release notes for the Technical Writer

Add to `## [Unreleased]` in
`/Users/joaooliveira/study/constellation-harness/CHANGELOG.md`. Do not
bump `plugin.json` or `marketplace.json`; task 026 cuts 1.4.0.

Under `### Added`:

- **Tokens spent comes from the session transcripts** (#025). While a
  workflow runs, the board reads the Claude Code transcripts of the
  workflow sessions and their agents under `~/.claude/projects`,
  read-only, and sums input, cache, and output tokens since the workflow
  start. The tooltip names the source. Without usable transcripts the
  fact falls back to the state-file delta, then to `—`. The value
  follows a growing transcript within 5 seconds.
- **Agent and step outputs** (#025). A finished agent row opens
  `#/agent/<id>`: type, description, model, start, duration, tokens, and
  the final report rendered from markdown. A done step with agents opens
  `#/step/<id>` with the reports of its agents, newest last. A report
  over 256 KB shows its first 256 KB. A missing or refused transcript
  shows the reason.
- Agent rows show the agent description in muted text (#025).
- **`GET /api/agent?id=<id>`** (#025). It returns `{ id, agent_type,
  description, model, start, end, durationSec, usage, report, truncated,
  error }` for a finished agent in the snapshot. It holds no file path,
  no prompt, and no tool input.
- `log-event.sh` logs `transcript_path` on every event,
  `agent_transcript_path` on SubagentStop, and `description` on
  SubagentStart when the hook input carries them (#025).
- The snapshot carries `tokens` (with `source`), `attribution`, and per
  agent `description`, `model`, and `transcript` (#025).

Under `### Security`:

- The transcript reader reads only paths that the project event log
  names, under `realpath(~/.claude/projects)`, with no symlink below
  that root, a fixed name rule, the session folder and agent id of the
  same log line, `O_NOFOLLOW`, a 32 MB tail cap, and incremental reads.
  It lists no directory and writes nothing. It reads nothing while no
  workflow is in flight (#025).

Under `### Changed`:

- `log-event.sh` logs no line for a SubagentStop without `agent_type`.
  Claude Code sends one for internal helper agents every 30 to 60
  seconds. The event window now holds hours of a workflow (#025).
  Known limit: the tokens spent fact excludes the spend of these helper
  agents.
- Update the existing count line. It reads "The board test count grows
  from 138 to 243 (#022, #023, #024)." Make it "The board test count
  grows from 138 to <N> (#022, #023, #024, #025)", with `<N>` from the
  final `node --test` run over `scripts/*.test.mjs`. Do not add a second
  count line.

README line 214: replace "elapsed time, token delta," with "elapsed
time, tokens spent from the session transcripts (state-file fallback),"
and after "a feed of which specialist runs right now" add ". A finished
agent row or a done step opens the final reports of its agents". Add one
sentence before "it never writes to `.constellation/`": "While a workflow
runs, it reads the Claude Code transcripts of the workflow sessions
under `~/.claude/projects`, read-only, and serves them only to the
local page." README line 215: add "The lines carry the session
transcript path, and on SubagentStop the agent transcript path." after
the first sentence.

Spec: the D13 deltas.

## Feasibility Result

- **VERDICT**: AGREED
- **FEASIBILITY**:
  - Hook fields (criteria 1 to 3): `trivial`. Three `jq` keys and five
    bash cases. Note: Claude Code 2.1.285 sends `description` and
    `agent_transcript_path` on no SubagentStart. The criterion holds on
    its input; the user outcome comes from D2.
  - Tokens from transcripts (4 to 9): `moderate`. One incremental reader
    over append-only files. The dedupe rule needs "last line wins"
    (Ground truth), not "count the first".
  - Agent dialog (10, 13, 14): `moderate`. The handback form is the
    observed shape. The report is extracted during the incremental read.
  - Step dialog and attribution (11): `moderate`. The spec count rule
    puts PM × Architect pairing round 2 on Verify; D12 fixes this with an
    order rule and no time window.
  - Dialog state and close (12): `trivial`. One key, one sequence.
  - Containment (15, 16): `moderate`. Criterion 16 is feasible as
    written: every hook line carries `session_id` and the main
    `transcript_path`, so the board derives the only allowed agent path.
    No Security Analyst exception is needed.
  - Privacy (17 to 20): `moderate`. Fixed-key objects and fixed reason
    lists; sentinel tests.
  - Caps (21): `trivial` with an injected cap.
  - Tests and gate (22): `moderate` by volume (about 44 tests).
  - Helper-stop skip (24): `trivial`. One guard and one bash case.
  - Manual check (23): `moderate`. It needs a scratch initialized
    project and a fake HOME; the plan gives the script.
- **SIMPLIFICATIONS** (no criterion changes):
  - The description comes from `.meta.json` and the agent path is
    derived from the main path, so a running row has its description and
    the live sum includes running agents without SubagentStop.
  - The report is extracted during the same incremental read that sums
    tokens. `/api/agent` does one catch-up read. One read path, one cap
    rule.
  - One `dialogSeq` and one `routeBefore` for all three dialog kinds.
  - The 5 s poll calls the existing `refresh()`. No token-only SSE frame.
  - `attributeAgents` runs on the server. The snapshot carries the map,
    so the page ships no new model code.
- **PRODUCT_SUGGESTIONS** (for the PM to triage, not in this plan):
  Round 2: the PM parked suggestions 1, 3, and 4 as tasks 038, 039,
  and 040.
  1. Criterion 9 makes agent reports unavailable once the workflow ends.
     An on-demand read of one clicked finished agent, under the same
     gate, keeps reports readable after the merge. Cost: small (the
     reader exists). It needs a criterion 9 change.
  2. `log-event.sh` logs a SubagentStop for internal helper agents every
     30 to 60 s (no `agent_type`). Skip them in the hook. Round 2: the PM
     took it in scope as criterion 24.
  3. `CLAUDE_CONFIG_DIR` support for users who move `~/.claude`. Today
     the board falls back to the state delta for them.
  4. Per-agent tokens in the agent row. The reader has the number; cost
     is one span and one test.
- **RISKS**: see the Risks section. The top item is a format change in
  Claude Code (M/M), made visible by `tokens.source`.
- **OPEN_QUESTIONS**: none blocking. Notes for the PM are under Open
  Questions.

## Open Questions

None blocking. Notes for the PM, recorded as decisions:

- Criterion 1: the hook logs `description` and `agent_transcript_path`
  on SubagentStart when they arrive, but Claude Code 2.1.285 never sends
  them. The row description comes from `.meta.json` (D2). The criterion
  text stays.
- Criterion 11: D12 refines the spec rule so pairing rounds stay on
  Plan. The two-run case of the criterion holds, with an engineer run
  between the two architect runs as in a real planned workflow.
- Criterion 9: with no workflow in flight, a finished agent row still
  opens, and the dialog says `Transcript not available (no workflow in
  flight)`. Product suggestion 1 is the alternative.
- The current step is not a button, as the done-step rule implies.
