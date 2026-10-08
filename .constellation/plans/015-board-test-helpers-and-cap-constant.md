---
status: approved
task: 015-board-test-helpers-and-cap-constant.md
date-created: 08-10-2026
last-edit: 08-10-2026
---
# Board test helpers and the read-cap constant

## Overview

**Problem**: The board tests have five small defects in test strategy.

1. The standby tests wait a fixed time before they assert (task 006).
2. The `/dev/zero` test runs in a child process that it does not need.
3. Two probe tests repeat the same verdict, and `withEndlessServer` reads
   its interval from a property on a function.
4. Selftest step 11b greps `board.md` outside the Node test suite.
5. `CAP_WARNING` repeats "64 KB" next to `READ_CAP_BYTES`. The tests
   repeat the string four times and the size `70000` three times.

**Impact**: The tests fail only on real defects, not on slow runners. One
constant controls the cap and its warning text.

**Scope**:

- In: `board.test.mjs` helpers and the tests listed below; two `export`
  keywords and one template string in `board.mjs`; deletion of step 11b
  in `selftest.sh`; one evidence line in task 007.
- Out: any change in runtime behavior; the `BOARD_STANDBY_MS` and
  `BOARD_PROBE_TIMEOUT_MS` env vars (task 007); the `60000` size in the
  "fills most of the read cap" test; tasks 008 and 014 (next batch).

**Blocks**: nothing. **Blocked By**: nothing.
**Track**: purely technical. No PM pairing.
**Version**: no bump. The Technical Writer adds a CHANGELOG entry under
`## [Unreleased]`. The next batch (tasks 008 and 014) cuts 1.3.3.

## Acceptance Criteria

1. `node --test plugins/constellation/scripts/board.test.mjs` reports 103
   tests, 103 pass, 0 fail.
2. In `board.test.mjs`, `sleep(` has one caller: the `waitFor` helper.
3. The `/dev/zero` test calls `loadSnapshot` in the test process. The FIFO
   test is the only caller of `snapshotInChild`.
4. One test covers the drip and the flood probe. `withEndlessServer` takes
   `{ chunk, everyMs }`.
5. `scripts/selftest.sh` has no step 11b. A test in `board.test.mjs` reads
   `commands/board.md` and asserts `--probe` and no `curl`.
6. `CAP_WARNING` equals `'front-matter exceeds 64 KB'`, and the source
   builds it from `READ_CAP_BYTES`. The literal "64 KB" occurs once in
   the test assertions: in the assertion that pins the value.
7. Each changed test fails under its mutation (see "Mutation safety").
8. `bash scripts/selftest.sh` ends with `selftest: ALL GREEN`.

## Implementation

**Files**:

- `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs`
  — Modify, lines 28-29 only.
- `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs`
  — Modify.
- `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`
  — Modify: delete lines 216-221 (the 11b block and its blank line).
- `/Users/joaooliveira/study/constellation-harness/.constellation/tasks/007-board-standby-flag-not-env-var.md`
  — Modify: add one evidence line (see Decision D4).

### board.mjs

```js
export const READ_CAP_BYTES = 64 * 1024;
export const CAP_WARNING = `front-matter exceeds ${READ_CAP_BYTES / 1024} KB`;
```

No other line changes.

### board.test.mjs

1. **Import** `READ_CAP_BYTES` and `CAP_WARNING` from `./board.mjs`.
2. **`waitFor`**: define it next to `sleep`. Then `sleep` has one caller.
   ```js
   async function waitFor(predicate, timeoutMs, everyMs = 50) {
     const deadline = Date.now() + timeoutMs;
     for (;;) {
       const value = await predicate();
       if (value) return value;
       if (Date.now() >= deadline) return null;
       await sleep(everyMs);
     }
   }
   ```
   It returns the first truthy value of the predicate, or `null` at the
   deadline.
3. **`waitForSnapshot(port, ms)`**: rebuild it on `waitFor`. The predicate
   returns the parsed body when the status is 200 and the body has
   `projectDir`, else `null`.
4. **Standby test** ("--quiet on a taken port stands by, then takes over"):
   - Replace `sleep(600)` with a dwell:
     `const exited = await waitFor(() => run.child.exitCode !== null, 3 * 200);`
     Assert `exited === null`. The dwell waits the full window only when
     the child stays alive. It fails early when the child exits.
   - Keep the check that the port still answers `blocker`.
   - Release the blocker, then `waitForSnapshot(port, 5000)`. The old
     deadline of 2000 ms was the part that a slow runner can break.
   - Move the `stdout === ''` and `stderr === ''` asserts after the
     takeover. They then cover the whole standby period.
5. **Status-edit test**: replace the `while` loop with `waitFor`. The
   predicate calls `waitForSnapshot(port, 500)` and returns the snapshot
   when `transitions.length > 0`. Keep the 3000 ms deadline.
6. **`/dev/zero` test**: replace `snapshotInChild(dir)` with
   `loadSnapshot(dir).tree`. Update the comment above `snapshotInChild`:
   only a FIFO can hang the loader.
7. **Cap tests**: replace each `'front-matter exceeds 64 KB'` with
   `CAP_WARNING`. Replace each `70000` with `READ_CAP_BYTES + 1`. In the
   first cap test, add `assert.equal(CAP_WARNING, 'front-matter exceeds 64 KB');`.
   This pin is the one literal that stays. Change "64 KB" in the two test
   names to "the read cap".
8. **`withEndlessServer({ chunk, everyMs }, fn)`**: the server writes
   `chunk` every `everyMs`.
9. **Merged probe test** "cli: --probe calls a reply foreign when it never
   ends or never stops". It loops over a table of two rows:
   - drip: `{ chunk: 'x', everyMs: 100, env: {} }`. Only the absolute
     deadline ends the read.
   - flood: `{ chunk: 'x'.repeat(64 * 1024), everyMs: 1, env: { BOARD_PROBE_TIMEOUT_MS: '60000' } }`.
     Only the byte cap ends the read.
   For each row, assert `code === 0` and the `Another service holds port`
   verdict. Put the row name in the assertion message.
10. **`board.md` test** "board.md: the command runs the probe and never
    curl". It reads `path.join(here, '..', 'commands', 'board.md')` and
    asserts `includes('--probe')` and `!includes('curl')`. Put it in the
    probe section.

### Decisions

- **D1. The dwell stays a fixed window.** No signal shows that the child
  hit `EADDRINUSE`, because `--quiet` prints nothing. A poll for "child
  alive" is true at once and cannot catch an early exit. The dwell fails
  only when the child exits, which is the defect. A slow runner cannot
  make it red. The takeover poll gets a 5000 ms deadline.
- **D2. `/dev/zero` in-process is safe under mutation.** With the
  containment check removed, `fstat` rejects the character device before
  any read. With both checks removed, the read stops at `READ_CAP_BYTES`.
  No mutation can hang the test process.
- **D3. The test count stays 103.** The merge removes one test. The
  `board.md` test adds one.
- **D4. `BOARD_PROBE_TIMEOUT_MS` stays.** The flood row needs the deadline
  off, or the 1 s deadline hides a missing byte cap. The test-only env
  var has the same shape as `BOARD_STANDBY_MS`. Add one evidence line to
  task 007: "`BOARD_PROBE_TIMEOUT_MS` follows the same pattern; fix both
  together." Do not change `board.mjs` for it in this batch.
- **D5. The `board.md` check now runs only with Node 20+.** The board
  needs Node, so a skip without Node loses nothing.

## Mutation safety

Apply each mutation, run the board tests, confirm the named test fails,
and revert.

| Changed test | Mutation | Expected failure |
|---|---|---|
| standby, then takes over | Quiet mode exits on `EADDRINUSE` | dwell returns `true` |
| standby, then takes over | Remove the standby `setTimeout` retry | snapshot is `null` |
| standby, then takes over | Quiet mode writes to stderr on standby | `stderr` not empty |
| status edit reaches the feed | `diffStatuses` returns `[]` | `transitions.length` is 0 |
| `/dev/zero` symlink | Remove the `outside .constellation` check | warning is `not a regular file` |
| merged probe, drip row | Remove the absolute deadline `setTimeout` | exit code `timeout` |
| merged probe, flood row | Remove the `PROBE_MAX_BYTES` check | exit code `timeout` |
| cap tests (4) | `truncated` ignored in `parseFrontMatter` | warning differs from `CAP_WARNING` |
| cap pin | Template becomes `${READ_CAP_BYTES} B` | pin assert fails |
| `board.md` test | Add a `curl` line to `board.md` | `curl` assert fails |
| `board.md` test | Remove `--probe` from `board.md` | `--probe` assert fails |

## Validation

**Automated Test**: board suite
- **File**: `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs`
- **Run**: `node --test plugins/constellation/scripts/board.test.mjs`
- **Covers**: criteria 1 to 7
- **Mocking**: none. Real sockets, real child processes, real files.
- **Expected**: 103 tests, 103 pass.

**Automated Test**: selftest
- **Run**: `bash scripts/selftest.sh`
- **Expected**: `selftest: ALL GREEN`, and no `11b` line.

**Automated Test**: static checks
- **Run**: `grep -c 'sleep(' plugins/constellation/scripts/board.test.mjs`
  returns 1: the call in `waitFor`.
- **Run**: `grep -n "64 KB" plugins/constellation/scripts/board.test.mjs`
  returns the pin line only.

No manual test. The change has no user-visible surface.

## Integration Touchpoints

- **`board.mjs` exports**: Could break: the page script embeds module code.
  Validation: the "page script compiles" test stays green. The constants
  are not in the page script.
- **`CAP_WARNING` text on the board**: Could break: a changed string in
  Needs attention. Validation: the pin assertion.
- **`selftest.sh`**: Could break: a dangling reference to step 11b.
  Validation: `grep -n 11b scripts/selftest.sh` returns nothing, and the
  selftest is green.

## Risks

1. **Risk**: The dwell catches no defect on a very slow runner, because
   the child has not tried to listen yet. Impact: L. Likelihood: L.
   Mitigation: the takeover poll still fails when standby retries break.
2. **Risk**: The flood row holds memory in the child for up to 5 s if the
   cap breaks. Impact: L. Likelihood: L. Mitigation: unchanged from the
   current test; the child is killed with SIGKILL.
3. **Risk**: An export of a constant reads as a public API. Impact: L.
   Likelihood: L. Mitigation: `board.mjs` already exports its test
   surface; no other module imports these constants.

## Logging

No change. Quiet mode stays silent. No new runtime path.

## Technical Writer

Add one entry under `## [Unreleased]` in `CHANGELOG.md`, under `### Changed`
(tests only). Do not bump the version in `plugin.json` or
`marketplace.json`. Mention: polls replace fixed waits in the standby
tests, `CAP_WARNING` is built from `READ_CAP_BYTES`, and the `board.md`
check moved from selftest step 11b into `board.test.mjs`.

## Open Questions

None.
