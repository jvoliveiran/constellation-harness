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

## Addition from the task 014 review (08-10-2026)

**Contain the work-item directory listings too.** D1 of task 014 contains the `.constellation` root only. A crafted clone can still commit `.constellation/tasks` (or `epics`, `features`, `plans`, `metrics`) as a symlink to `$HOME` or `/`. `scanWorkItems` then lists that directory, and each `*.md` name shows on the local page as `unreadable: outside .constellation`. Only names leak, never content. Fix: resolve each listed directory with `realpathSync` and skip it, with one `errors` entry, unless it lies under the real root. Apply the same rule in `signature` and in `watch.arm`.
