---
status: inbox
type: feature
source: software-architect
related: 002-board-backlog-tree-and-packaging.md
date-created: 06-10-2026
last-edit: 06-10-2026
---
# Board automatic port selection

Deferred from task 002. Every project uses port 4411. Task 002 adds a
standby mode, so a second session on the same project takes over when the
first session ends. Two different projects still share one port, and only
one board is visible at a time.

Give each initialized project its own port, and let `/constellation:board`
find it without a file written by the server.
