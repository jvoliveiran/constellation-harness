---
status: parked
type: feature
source: product-manager
feature: F001-board-ui-overhaul.md
related: 026-board-pause-and-resume.md
revisit: in events.jsonl, fewer than 60 % of the first 10 pauses end in PauseReleased (most end in PauseDenied), or the user asks for a resume with no terminal input after a long pause
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board: resume a stopped session with no terminal input

Parked by the Product Manager in the task 026 scope pass, 21-10-2026.

**Value hypothesis**: a user who pauses for longer than the hold window
resumes from the page alone, without typing `/constellation:resume`.

**Parked because**: Claude Code has no external prompt injection. The
026 hold covers 9 minutes. Data must show that longer pauses are common
before the harness pays for a second mechanism.
