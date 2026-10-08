---
status: inbox
type: fix
source: security-analyst
related: 015-board-test-helpers-and-cap-constant.md
date-created: 08-10-2026
last-edit: 08-10-2026
---
# CI pins Node so the board guards cannot skip

**Evidence**: Task 015 moves the `board.md` probe guard from selftest step 11b into `board.test.mjs`. Selftest step 11 runs the board tests only on Node 20 or later. Otherwise it prints "SKIPPED" and still ends ALL GREEN. `.github/workflows/selftest.yml` has no `actions/setup-node` step, so CI uses whatever Node the `ubuntu-latest` image ships. That is Node 20 or later today. If a future image changes it, the curl guard and every 1.3.2 board guard switch off silently, and CI stays green.

**Fix**: Add `actions/setup-node@v4` with `node-version: 20` before `scripts/selftest.sh` in the workflow. As an alternative, make step 11 fail instead of skip when `CI=true`.

**Effort**: S
