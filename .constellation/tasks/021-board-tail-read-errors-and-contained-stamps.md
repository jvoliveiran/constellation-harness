---
status: inbox
type: fix
source: code-reviewer
related: 018-board-bounded-event-log-tail.md
date-created: 15-10-2026
last-edit: 15-10-2026
---
# Board: tail read errors stay local, and poll stamps follow containment

Raised at Gate 1 of task 018 on 15-10-2026. Neither item blocked the merge.

**Evidence**:
1. Code reviewer: in `readTail`, only `openContained` is inside the `try` that maps an error code to `unreadable: <code>`. A throw from `fs.readSync` (for example `EIO`) escapes `loadSnapshot`. `safeRefresh` then keeps the previous snapshot with `refresh failed: <message>`, instead of an empty feed. `readJson` keeps its read loop inside the catch.
2. Security analyst: `signature()` calls `stamp(f)` with `fs.statSync` on `p.state`, `p.events`, `p.tracks`, `p.config` and the work files, with no `containedReal`. A symlink to a file outside the project lets that file's mtime or size start a refresh. Nothing reaches the page or the `--quiet` output, so this is a timing signal only.

**Fix**:
1. Put the read block of `readTail` in the same `catch (e)`. Return `{ text: '', error: 'unreadable: <code>' }` and keep `fs.closeSync(fd)` in `finally`.
2. Make `stamp` return `'-'` when `containedReal(root, f)` throws, the same rule as `dirStamp`.

Also consider the reviewer nits: `fathomDir` can call `isDirectory(containedReal(root, dir))`; add doc comments to `isDirectory` and `signature`; note in the `arm` comment that a watcher armed before a later outside swap stays armed but leaks nothing.

**Effort**: S
