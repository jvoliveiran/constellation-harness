---
status: inbox
type: feature
source: software-architect
related: 002-board-backlog-tree-and-packaging.md
date-created: 06-10-2026
last-edit: 08-10-2026
---
# Board automatic port selection

Deferred from task 002. Every project uses port 4411. Task 002 adds a
standby mode, so a second session on the same project takes over when the
first session ends. Two different projects still share one port, and only
one board is visible at a time.

Give each initialized project its own port, and let `/constellation:board`
find it without a file written by the server.

## Note from the task 014 review (08-10-2026)

- On Windows, `SAFE_DIR` requires a leading `/`, so `classifyProbe` returns `foreign` for every Windows path, including the project's own board. Treat Windows paths when port selection changes the probe.
- A process on another UID can reply with the user's own `realpath(projectDir)` and get `Board running`. The verdict is fixed text, so nothing reaches Claude's context, but the user then opens that process's page.
