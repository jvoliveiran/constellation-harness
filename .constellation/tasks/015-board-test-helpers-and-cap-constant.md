---
status: in-progress
type: debt
source: dx-analyst
related: 013-board-hardening-before-rollout.md
date-created: 07-10-2026
last-edit: 08-10-2026
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

## Batch with task 006

Request: "go with 006 and 015 in a batch". This workflow runs on task 015
and includes task 006 in full: add one `waitFor(predicate, timeoutMs)`
helper, and replace the fixed `sleep(100)` and `sleep(600)` waits in the
standby tests with polls. Both tasks close with the same commit.

## Acceptance criteria

1. The board suite reports 103 tests, and all pass.
2. No test asserts after a fixed `sleep`. Waits go through `waitFor`.
3. The `/dev/zero` test runs in the test process. Only the FIFO test uses a child.
4. One table-driven test covers the drip and the flood probe.
5. Selftest step 11b is gone. A board test checks that `board.md` runs `--probe` and has no `curl`.
6. `CAP_WARNING` keeps the value `front-matter exceeds 64 KB`, built from `READ_CAP_BYTES`.
7. Each changed test fails under the mutation that the plan lists for it.
