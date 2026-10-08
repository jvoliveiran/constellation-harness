---
status: inbox
type: spike
source: security-analyst
related: 008-board-hardening-from-gate-1-review.md
date-created: 08-10-2026
last-edit: 08-10-2026
---
# Do plugin monitors start before the workspace-trust prompt?

Moved from the open question of task 008 on 08-10-2026.

Find out whether Claude Code arms a plugin monitor before the user accepts
the workspace-trust prompt of a newly cloned repo. Since 1.3.1 the board
monitor arms on the orchestrator skill, not at session start, which narrows
the question to this: can a skill load, and so the monitor, run before
trust is granted? If it can, a crafted repo starts the board with no user
consent. Answer from the Claude Code docs or source, plus one live check in
a fresh clone.
