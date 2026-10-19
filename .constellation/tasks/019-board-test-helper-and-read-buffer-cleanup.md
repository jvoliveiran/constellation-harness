---
status: inbox
type: debt
source: dx-analyst
related: 014-board-probe-and-containment-follow-ups.md
date-created: 08-10-2026
last-edit: 19-10-2026
---
# Board test helper and read-buffer cleanup

**Evidence**:
- `openEvents` in `board.test.mjs` repeats the request options, timeout, and error handling of `httpRequest`. It differs only in that it resolves on the response headers and returns `req` and `res`.
- `readPrefix(root, file, buffer = readBuffer)` makes each caller pick the right shared module buffer.

**Simplification**:
- Give `httpRequest` an `{ open: true }` option that resolves at the response and returns `{ status, headers, req }`. Delete `openEvents`.
- Change `readPrefix` to take a byte cap, `readPrefix(root, file, cap = READ_CAP_BYTES)`, and allocate per read. This removes the shared-buffer hazard. The cost is a short-lived allocation for three small reads per refresh.

**Effort**: S — **Category**: duplication

## Addition from the task 018 review (15-10-2026)

**Share one read loop.** `readPrefix` and the new `readTail` hold the same fill-the-buffer loop. They differ only in the file position (`n` against `start + n`). Add `readFully(fd, buffer, start = 0)` that holds the loop once and returns the byte count. Do this in the same edit as the `readPrefix` cap change, because both touch the same lines.

## Addition from the task 023 review (19-10-2026)

**One prelude builder.** `board.mjs` builds the render prelude from `Object.entries(render)`. `board.test.mjs` repeats the same loop in `bootPage` and in three other places. Export the prelude (or `PAGE_SCRIPT`) from `board.mjs` and import it in the tests, so `bootPage` runs the exact script that the board serves.
