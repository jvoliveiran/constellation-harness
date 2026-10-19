---
status: refined
type: feature
source: user
feature: F001-board-ui-overhaul.md
order: 4
date-created: 14-10-2026
last-edit: 14-10-2026
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

## Acceptance criteria

1. Given a workflow with three finished agents, when the page renders,
   then the tokens spent fact shows the sum of `input + cache creation +
   cache read + output` over the main transcript and the three agent
   transcripts since `startedAt`, with the tooltip of spec §8.4.
2. Given an assistant turn with three content blocks that repeat one
   `usage`, then the sum counts it once.
3. Given no usable transcript path in the event log, then the fact falls
   back to the state-file delta with its tooltip, and to `—` when that is
   null.
4. Given `log-event.sh` after the change, then SubagentStart lines carry
   `description` and `agent_transcript_path`, SubagentStop lines carry
   `agent_transcript_path`, every line carries `transcript_path`, and the
   hook test covers each field.
5. Given a click on a finished agent row, then a dialog shows the agent
   type, description, model, start, duration, tokens, and the final report
   rendered from markdown. The report is `input.message` of the
   `SubagentHandback` call when present, otherwise the text of the last
   assistant message.
6. Given a click on a done step, then a dialog lists the agents that spec
   §8.4 attributes to that step, each with its report. Given the planned
   track with two architect runs, then the first attaches to Plan and the
   second to Verify.
7. Given an event log line whose `agent_transcript_path` resolves outside
   `~/.claude/projects`, or whose name is not `agent-<hex>.jsonl`, then
   the board reads nothing from it, `errors` holds `transcript: refused:
   outside session root`, and the agent dialog says `Transcript not
   available`.
8. Given a transcript of 40 MB, then the board reads its last 32 MB once
   and only appended bytes after that. Given a transcript that grows while
   the workflow runs, then the fact updates within 5 seconds.
9. Given no workflow in flight, then the board polls no transcript.
10. Given the change, then `sumUsage`, `extractReport`, and
    `attributeAgents` have tests, `/api/agent` has HTTP tests, and
    `scripts/selftest.sh` prints `selftest: ALL GREEN`.
