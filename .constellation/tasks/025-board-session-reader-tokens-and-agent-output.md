---
status: in-progress
type: feature
source: user
feature: F001-board-ui-overhaul.md
order: 4
date-created: 14-10-2026
last-edit: 21-10-2026
---
# Board UI: session reader for tokens spent and agent outputs

Phase 4 of `docs/specs/board-ui-v2.md` (§6.5, §8.1, §8.3, §8.4). The
board reads the Claude Code transcripts of the workflow session, under
`~/.claude/projects`, to compute the tokens spent and to show the final
report of each agent. A completed step opens the outputs of the agents
that ran in it.

User feedback, 14-10-2026: "Tokens spent on the left side area is always
showing zero." And: "when clicking on each completed step of an in
progress workflow, have access to the full output of that step", from the
session, with no new markdown files.

Root cause of the zero: the fact is `accumulated + (sessionStart −
lastKnownRemaining)` from the state file, and the model often copies the
seed value forward instead of the latest reminder. The transcripts carry
the real usage.

Depends on task 023.

## Scope pass, 21-10-2026 (product-manager)

Value loop: the user watches a workflow, sees the real spend, opens the
output of a finished agent or a done step, and returns to the board for
the next step instead of asking the orchestrator.

**In**:
- `log-event.sh` logs `description`, `agent_transcript_path`, and
  `transcript_path` (enabler for everything below).
- Tokens spent fact from the session transcripts, with the state-file
  fallback (feature item 3).
- Agent dialog `#/agent/<id>` from a finished agent row (feature item 5).
- Step dialog `#/step/<id>` from a done step with attributed agents
  (feature item 5). The done step becomes a button with a hover and focus
  style. No other stepper change.
- Agent row description in muted text. It tells two runs of one agent type
  apart, so the user clicks the right row.
- Privacy and containment limits for the transcripts (criteria 12 to 17).

**Out**:
- Stepper restyle (connector line, current ring), running-row pulse, and
  the `Copy` button: parked as task 037.
- Live tail of a running agent: spec §13 keeps it out.
- Pairing round 2 product suggestions (21-10-2026): on-demand read of an
  agent after the workflow ends (task 038), `CLAUDE_CONFIG_DIR` support
  (task 039), and per-agent tokens in the agent row (task 040) are
  parked. The hook skip of helper SubagentStop lines is in scope
  (criterion 24), because it keeps the early agents of a long workflow
  inside the 256 KB event tail, which criteria 4 and 11 need.
- Tasks 034, 035, 036 do not fold in. No item of them blocks 025. They
  touch `board-render.mjs` and the tests, so the engineer avoids edits in
  the code that they name where possible.

**Release notes**: add the 025 entries under `[Unreleased]`. Update the
count line `The board test count grows from 138 to 243 (#022, #023,
#024).` to the new total and add `#025`. Do not add a second count line.

## Acceptance criteria

### Event log

1. **Given** a SubagentStart hook input with `description`,
   `agent_transcript_path`, and `transcript_path`, **when**
   `log-event.sh` runs, **then** the logged line carries the three fields.
   Note: Claude Code 2.1.285 sends neither `description` nor
   `agent_transcript_path` on SubagentStart. The hook logs them when
   present. The board takes the description from
   `agent-<agent_id>.meta.json` through the gate of criterion 15 and
   derives the agent path (criterion 16).
2. **Given** a SubagentStop hook input with `agent_transcript_path` and
   `transcript_path`, **when** `log-event.sh` runs, **then** the logged
   line carries both fields.
3. **Given** a hook input without one of these fields, **when**
   `log-event.sh` runs, **then** the logged line omits that field. The
   hook test covers each field present and absent.
24. **Given** a SubagentStop hook input without `agent_type` (an internal
    helper agent), **when** `log-event.sh` runs, **then** it logs no
    line. Known limit: the tokens fact excludes the spend of these
    helper agents. (Numbered 24 so that the plan references to 1 to 23
    stay valid.)

### Tokens spent

4. **Given** a workflow in flight with three finished agents and usable
   transcript paths, **when** the page renders, **then** the tokens spent
   fact shows the sum of `input + cache creation + cache read + output`
   over the main transcript and the three agent transcripts since
   `startedAt`. The tooltip reads `from session transcripts since
   <startedAt>: in / cache / out` with the three numbers.
5. **Given** an assistant turn with three transcript lines that repeat one
   `message.id` and one `usage`, **when** the board sums the tokens,
   **then** it counts that `usage` once.
6. **Given** assistant lines with a `timestamp` before `startedAt`,
   **when** the board sums the tokens, **then** the sum excludes them.
7. **Given** no usable transcript path in the event log, **when** the page
   renders, **then** the fact shows the state-file delta with the tooltip
   `from the state file, as the model reported it`. **Given** that the
   delta is also null, **then** the fact shows `—`.
8. **Given** a transcript that grows while the workflow runs, **when** 5
   seconds pass, **then** the fact shows the new sum. The repaint keeps
   the focus and the scroll position of the page.
9. **Given** no workflow in flight, **when** the board runs, **then** it
   reads and polls no transcript. A finished agent row then opens a
   dialog that says `Transcript not available (no workflow in flight)`.

### Agent and step outputs

10. **Given** a finished agent row with a transcript, **when** the user
    activates it by click or keyboard, **then** a dialog shows the agent
    type, description, model, start, duration, tokens, and the final
    report rendered from markdown. The report is `input.message` of the
    last `SubagentHandback` call when present, otherwise the text of the
    last assistant message. The description and the model come from
    `agent-<agent_id>.meta.json`. A running agent row is not a button.
11. **Given** a done step with attributed agents (spec §8.4), **when** the
    user activates it, **then** a dialog lists those agents, newest last,
    each with the header of criterion 10 and its report. **Given** the
    planned track with two PM × Architect pairing rounds, then an
    engineer run, then an architect run, **then** both pairing rounds
    attach to Plan and the last architect run attaches to Verify. An
    architect run attaches to Verify only when an engineer run started
    before it (plan decision D12). A done step without agents and a
    pending step are not buttons.
12. **Given** an open agent or step dialog, **when** the user closes it,
    **then** the hash returns to the route before the dialog. **Given** a
    reply for an earlier dialog that arrives after a later one opened,
    **then** the page drops the earlier reply.
13. **Given** a finished agent whose transcript is missing or refused,
    **when** the user opens it, **then** the dialog body says `Transcript
    not available` and the reason.
14. **Given** a report larger than 256 KB, **when** the dialog opens,
    **then** it shows the first 256 KB and a muted line `truncated at 256
    KB`.

### Privacy and containment

15. **Given** a transcript path in the event log that resolves outside
    `realpath(~/.claude/projects)`, or a symlink, or a name that is not
    `<uuid>.jsonl` (main) or `agent-<hex>.jsonl` (agent), **when** the
    board meets it, **then** it reads nothing from that path and `errors`
    holds `transcript: refused: <reason>`. The error line never holds the
    path.
16. **Given** an agent transcript path that is not in the `subagents`
    folder of a session that the same event log names, or whose
    `agent-<hex>` does not match the `agent_id` of its log line, **when**
    the board meets it, **then** it reads nothing from it. This keeps the
    board on the sessions of this project.
17. **Given** the main session transcript, **when** the board reads it,
    **then** it uses only the `usage` numbers, `message.id`, and
    `timestamp`. No text from the main transcript reaches the page or any
    response.
18. **Given** an agent transcript, **when** `/api/agent` replies, **then**
    the reply holds only the fields of spec §8.2. It holds no prompt, no
    tool input or output other than the handback message, no raw
    transcript line, and no file path. The snapshot carries
    `transcript: true|false` per agent, never a path.
19. **Given** any request to the board, **when** it serves transcript
    data, **then** it serves it only on `127.0.0.1` through the existing
    Host check, with `cache-control: no-store`, `nosniff`, and
    `referrer-policy: no-referrer`. The board writes, lists, and sends no
    transcript data anywhere else, and writes no new file.
20. **Given** the board started with `--quiet`, **when** the session
    reader refuses, fails, or reads a transcript, **then** the board
    prints nothing to stdout or stderr. Without `--quiet`, a log line
    names the reason and never a path or transcript text.
21. **Given** a transcript of 40 MB, **when** the board reads it, **then**
    it reads the last 32 MB once and only the appended bytes after that.

### Tests and gate

22. **Given** the change, **then** `sumUsage`, `extractReport`, and
    `attributeAgents` have unit tests (all five tracks and a fix loop),
    `/api/agent` has HTTP tests (bad id 404, refused path, foreign
    session folder, 200 with a report from a fixture transcript, no path
    in the reply), every new `board-render.mjs` export is in
    `ISOLATION_ARGS`, and `scripts/selftest.sh` prints `selftest: ALL
    GREEN`. The suite starts from 243 tests.
23. **Given** the page at 1280 px and 390 px, dark and light, **when** the
    user opens an agent dialog and a step dialog by keyboard only, **then**
    both dialogs fit the viewport, scroll inside, and close with Esc.

## Success metrics and data plan

- Primary metric: the share of in-flight snapshots where the tokens fact
  comes from the transcripts, and its match with an independent `jq` sum
  over the same files. Target: 100 % of snapshots, sum within 1 %.
  Judged on the first full workflow in an initialized project after the
  release that carries 025. This repo has no `config.json`, so
  `log-event.sh` logs nothing here; the check runs in a scratch
  initialized project.
- Secondary signal: at the 025 verification, the user reads one agent
  report and one step from the board, without a request to the
  orchestrator.
- Instrumentation: the snapshot exposes the fact source
  (`transcripts | state | none`). No analytics, no click tracking.
- Decision rule: source `transcripts` and match within 1 % → mark F001
  items 3 and 5 done. Fallback in any snapshot with logged paths → open a
  fix task on the path logging before the F001 release.

## Iteration hypothesis

We believe that the user will trust the tokens fact and read agent
outputs on the board, because the numbers and the reports come from the
session itself. We will know at the first workflow after the release, by
the fact source and the `jq` check.

## Scope notes from the task 023 scope pass (19-10-2026)

- Stepper restyle (connector line, current ring, spec §4.2) moves here, because this task makes done steps buttons.
- F001 carry-over 2: the running-row duration pulse in `--warn` (spec §6.1) moves here, because this task changes the agent rows.
- 21-10-2026: the 025 scope pass parks both items, plus the `Copy` button, as task 037.
