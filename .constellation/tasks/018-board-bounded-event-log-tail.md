---
status: in-progress
type: fix
source: software-architect
related: 014-board-probe-and-containment-follow-ups.md
date-created: 08-10-2026
last-edit: 15-10-2026
---
# Board reads the event log with a bounded, contained tail

Found by the architect while planning task 014 on 08-10-2026.

**Evidence**: `readTail` reads `.constellation/metrics/events.jsonl` with `readFileSync`, with no containment and no size cap. A crafted repo controls its own `.gitignore`, so it can commit `events.jsonl` as a symlink to `/dev/zero`. The board then hangs at start.

**Fix**: Read only the last 256 KB of the file, through the same containment and regular-file rules as `readPrefix`. This needs its own design, because `readPrefix` reads the start of a file, not the end.

**Effort**: S

## Addition from the task 014 review (08-10-2026)

**Contain the work-item directory listings too.** D1 of task 014 contains the `.constellation` root only. A crafted clone can still commit `.constellation/tasks` (or `epics`, `features`, `plans`, `metrics`) as a symlink to `$HOME` or `/`. `scanWorkItems` then lists that directory, and each `*.md` name shows on the local page as `unreadable: outside .constellation`. Only names leak, never content. Fix: resolve each listed directory with `realpathSync` and skip it, with one `errors` entry, unless it lies under the real root. Apply the same rule in `signature` and in `watch.arm`.

## Refinement (15-10-2026)

Plan: `.constellation/plans/018-board-bounded-event-log-tail.md`. Purely
technical work on the board. No PM pairing. The entry goes under
`[Unreleased]`; task 020 cuts release 1.3.4.

Both parts have the same shape: a path under `.constellation` that a
committed repo controls, and a read that follows it. The fix for both is
the same rule that task 014 gave the JSON files: resolve the real path,
require it under the real root, and read only a regular file through a
bound.

## Acceptance criteria

1. Given `.constellation/metrics/events.jsonl` as a symlink to `/dev/zero`
   or to a file outside `.constellation`, or `.constellation/metrics` as a
   symlink to a directory outside `.constellation`, when the board
   refreshes, then the refresh completes, `errors` holds
   `events.jsonl: unreadable: outside .constellation`, and `agents` and
   `activity` are empty.
2. Given an `events.jsonl` that is a directory or a FIFO, when the board
   refreshes, then the refresh completes and `errors` holds
   `events.jsonl: unreadable: EISDIR` or
   `events.jsonl: unreadable: not a regular file`.
3. Given an `events.jsonl` larger than 256 KB, when the board refreshes,
   then the board reads only the last 256 KB, drops the first line of that
   window because the window cuts it, and shows the newest events. The
   snapshot holds no error and no warning for the size.
4. Given an `events.jsonl` of at most 256 KB, when the board refreshes,
   then every line of the file shows, the first line included. Given no
   `events.jsonl`, then `errors` holds no entry for it.
5. Given `.constellation/tasks`, `epics`, `features`, or `plans` as a
   symlink to a directory outside `.constellation`, when the board
   refreshes, then the tree holds no item from that directory, no file name
   from that directory appears anywhere in the snapshot, and `errors` holds
   `<dir>: unreadable: outside .constellation` once per directory.
6. Given such a symlink, when a new `*.md` file appears in its target
   directory, then the board does not refresh because of it: the server
   neither watches that directory nor lists it in the poll signature.
7. Given a work directory symlink to a directory inside `.constellation`,
   when the board refreshes, then its files parse as in 1.3.3, with no
   warning and no error.
8. Given the change, when the Lint Gate runs, then the 125 current tests in
   `board.test.mjs` pass with no edit, the 7 new tests pass, and
   `scripts/selftest.sh` prints `selftest: ALL GREEN`.
