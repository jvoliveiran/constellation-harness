---
status: inbox
type: debt
source: dx-analyst
related: 002-board-backlog-tree-and-packaging.md
date-created: 06-10-2026
last-edit: 06-10-2026
---
# Board standby interval as a CLI flag, not a hidden env var

**Evidence**: `BOARD_STANDBY_MS` is the only env var in the plugin scripts. `board.mjs` is its only reader and the tests are its only writers. No README or command file documents it.
**Evidence**: `BOARD_PROBE_TIMEOUT_MS` follows the same pattern; fix both together.
**Simplification**: Replace it with an optional `--standby-ms <n>` argument next to `--port` and `--quiet`, so `--help` shows it and the tests pass it through `args`. If the env var stays, add a one-line "test only" comment where it is read.
**Effort**: S — **Category**: env-vars
