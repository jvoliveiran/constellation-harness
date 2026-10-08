---
status: inbox
type: debt
source: dx-analyst
related: 013-board-hardening-before-rollout.md
date-created: 07-10-2026
last-edit: 07-10-2026
---
# Board test helpers and the read-cap constant

**Evidence**:
- The `/dev/zero` test runs in a child process, but containment rejects `/dev/zero` before any `open`, so it cannot hang. Only the FIFO test needs the child.
- The drip and flood probe tests assert the same verdict, and `withEndlessServer` takes its interval as a property on a function.
- `BOARD_PROBE_TIMEOUT_MS` exists only for tests.
- Selftest step 11b greps `board.md` prose, and it is skipped when Node is missing.
- `CAP_WARNING` repeats the literal "64 KB" next to `READ_CAP_BYTES`, and the tests repeat that string four times.

**Simplification**:
- Run the `/dev/zero` test in-process.
- Fold the drip and flood tests into one table-driven test that passes `{ chunk, everyMs }` as a plain object.
- Move the 11b check into `board.test.mjs` as one assertion that reads `board.md`.
- Build `CAP_WARNING` from `READ_CAP_BYTES`, export the constant, and use `READ_CAP_BYTES + 1` in the tests.

**Effort**: S — **Category**: test-strategy
