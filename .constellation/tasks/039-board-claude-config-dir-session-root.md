---
status: parked
type: feature
source: software-architect
feature: F001-board-ui-overhaul.md
related: 025-board-session-reader-tokens-and-agent-output.md
revisit: a user reports that the board shows no transcript data while CLAUDE_CONFIG_DIR moves the Claude Code config folder
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board: session root follows CLAUDE_CONFIG_DIR

Proposed by the Software Architect in the task 025 pairing, round 2, 21-10-2026.

**Value hypothesis**: a user with a moved Claude Code config folder sees the real tokens and the agent outputs on the board.

**Parked because**: no user of the harness reports a moved config folder. With a moved folder, task 025 refuses every path and the tokens fact falls back to the state file, so the failure is visible and safe.

**Scope when the trigger fires**: the session root is `realpath($CLAUDE_CONFIG_DIR/projects)` when the variable is set, else `realpath(~/.claude/projects)`. The containment rules of task 025 criteria 15 to 18 stay. The Security Analyst reviews the root choice.

**Effort**: S
