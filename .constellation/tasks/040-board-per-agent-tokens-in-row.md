---
status: parked
type: feature
source: software-architect
feature: F001-board-ui-overhaul.md
related: 025-board-session-reader-tokens-and-agent-output.md
revisit: the user asks which agent spent the most tokens, or opens several agent dialogs only to compare their tokens, at the 025 verification or in a later board session
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board: per-agent tokens in the agent row

Proposed by the Software Architect in the task 025 pairing, round 2, 21-10-2026.

**Value hypothesis**: the user sees at a glance which agent costs the most, without opening each dialog.

**Parked because**: task 025 shows the per-agent tokens in the agent dialog header and the total in the facts row. The row already holds time, name, description, and duration, and no feedback asks for a cost per row.

**Scope when the trigger fires**: each finished agent row shows its token sum in muted text before the duration, with the four parts in the `title`. Phone width keeps the row on one line.

**Effort**: S
