---
status: parked
type: feature
source: software-architect
feature: F001-board-ui-overhaul.md
related: 025-board-session-reader-tokens-and-agent-output.md
revisit: the user asks to read an agent output on the board after the workflow ends, at the 025 verification or in a later board session
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board: read one agent output on click after the workflow ends

Proposed by the Software Architect in the task 025 pairing, round 2, 21-10-2026.

**Value hypothesis**: after a workflow ends, the user opens a finished agent row and reads its report, for example the verify report, without a new session.

**Parked because**: the user feedback of 14-10-2026 asks for the outputs of an in-progress workflow. Task 025 criterion 9 keeps the board off every transcript when no workflow runs, which keeps the privacy surface small. No evidence asks for reads after the end.

**Scope when the trigger fires**: with no workflow in flight, a click on a finished agent row reads that one agent transcript, once, through the gates of task 025 criteria 15 to 18. The board still polls no transcript. Criterion 9 changes to match.

**Effort**: S
