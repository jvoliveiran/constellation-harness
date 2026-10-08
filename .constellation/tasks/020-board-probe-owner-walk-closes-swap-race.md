---
status: inbox
type: fix
source: security-analyst
related: 014-board-probe-and-containment-follow-ups.md
date-created: 08-10-2026
last-edit: 08-10-2026
---
# Board probe: an owner walk of every path component closes the swap race

Raised at the Gate 1 fix re-review of task 014 on 08-10-2026.

**Evidence**: `ownsProject` checks `realpathSync(dir) === dir`, then calls `lstatSync(dir)` and `hasHarness(dir)`. Each call resolves the path again. A process on another UID can own an intermediate component, for example `/private/tmp/<words>`. It can swap that component atomically between a real directory and a symlink to the user's parent directory. On macOS, `renamex_np` with `RENAME_SWAP` does this. If the swap wins the window between the calls, the attacker's words print into Claude's context.

**Risk**: Low to moderate. There is one try per `/constellation:board` run, inside a window of microseconds. The attack needs a second local UID and a project with the same basename. `SAFE_DIR` limits the payload to one line of plain ASCII words.

**Fix**:
1. Walk every prefix of `dir` with `lstatSync`. Require each prefix to be a directory that is not a symlink, owned by `process.getuid()` or by root (uid 0). The final component must be owned by the user. The walk replaces the realpath equality check, because no other UID then owns a component it can rename.
2. Correct the `ownsProject` docstring. It cites decision D5 of plan 014 as the acceptance of this race, but D5 accepts the race for a committed repo, not for a local process on another UID.

**Effort**: S
