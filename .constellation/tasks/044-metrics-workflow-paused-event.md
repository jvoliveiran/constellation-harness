---
status: parked
type: feature
source: product-manager
feature: F001-board-ui-overhaul.md
related: 026-board-pause-and-resume.md
revisit: /constellation:metrics needs pause counts per workflow, or pauses occur in 10 or more workflows
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Metrics: a workflow-paused event in workflow-log.jsonl

Parked by the Product Manager in the task 026 scope pass, 21-10-2026.
Spec `docs/specs/board-ui-v2.md` §9.3 proposed it.

**Value hypothesis**: `/constellation:metrics` reports how often each
workflow pauses and for how long.

**Parked because**: the append-only `events.jsonl` already holds
`PauseHold`, `PauseReleased` and `PauseDenied`. They answer the 026
success metric. A second log adds a second write path in the hook.
