---
status: inbox
type: debt
source: dx-analyst
related: 014-board-probe-and-containment-follow-ups.md
date-created: 08-10-2026
last-edit: 08-10-2026
---
# Board test helper and read-buffer cleanup

**Evidence**:
- `openEvents` in `board.test.mjs` repeats the request options, timeout, and error handling of `httpRequest`. It differs only in that it resolves on the response headers and returns `req` and `res`.
- `readPrefix(root, file, buffer = readBuffer)` makes each caller pick the right shared module buffer.

**Simplification**:
- Give `httpRequest` an `{ open: true }` option that resolves at the response and returns `{ status, headers, req }`. Delete `openEvents`.
- Change `readPrefix` to take a byte cap, `readPrefix(root, file, cap = READ_CAP_BYTES)`, and allocate per read. This removes the shared-buffer hazard. The cost is a short-lived allocation for three small reads per refresh.

**Effort**: S — **Category**: duplication
