---
status: inbox
type: fix
source: orchestrator
related: 026-board-pause-and-resume.md
date-created: 22-10-2026
last-edit: 22-10-2026
---
# Selftest: one run failed once with no failing line shown

**Evidence**: during the task 026 workflow on 22-10-2026, one `scripts/selftest.sh` run ended `selftest: FAILURES ABOVE`. The next six runs on the same tree were ALL GREEN. The captured output of the failed run was not kept, so the failing step is unknown.

Likely candidates are the timing-bound hook tests in `pause-guard.test.sh`: H1 to H3 allow 100 ms for the fast path, and H7 allows 1.6 s for a release. A loaded machine or CI runner can exceed these bounds.

**Fix**:
1. Make `selftest.sh` keep the output of the failing sub-test (for example, print the last lines of the `node --test` or hook-test output on failure), so the next flake names its step.
2. Make the timing-bound asserts robust: best of 3 runs, or wider bounds with a separate assert on the fast-path structure (no subprocess, no stdin read).

**Effort**: S
