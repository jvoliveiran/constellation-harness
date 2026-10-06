---
status: inbox
type: debt
source: dx-analyst
related: 002-board-backlog-tree-and-packaging.md
date-created: 06-10-2026
last-edit: 06-10-2026
---
# Board standby tests poll instead of fixed sleeps

**Evidence**: The standby tests in `board.test.mjs` assert after `sleep(100)` and `sleep(600)` against `BOARD_STANDBY_MS=200`. Fixed waits on elapsed time are flaky on slow CI runners.
**Simplification**: Add one `waitFor(predicate, timeoutMs)` helper of about five lines. Poll for "child alive and port still unanswered", then poll for "snapshot returns 200". Keep the spawned-process tests, because they cover the real CLI contract.
**Effort**: S — **Category**: test-strategy
