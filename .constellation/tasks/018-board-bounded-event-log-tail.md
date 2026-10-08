---
status: inbox
type: fix
source: software-architect
related: 014-board-probe-and-containment-follow-ups.md
date-created: 08-10-2026
last-edit: 08-10-2026
---
# Board reads the event log with a bounded, contained tail

Found by the architect while planning task 014 on 08-10-2026.

**Evidence**: `readTail` reads `.constellation/metrics/events.jsonl` with `readFileSync`, with no containment and no size cap. A crafted repo controls its own `.gitignore`, so it can commit `events.jsonl` as a symlink to `/dev/zero`. The board then hangs at start.

**Fix**: Read only the last 256 KB of the file, through the same containment and regular-file rules as `readPrefix`. This needs its own design, because `readPrefix` reads the start of a file, not the end.

**Effort**: S
