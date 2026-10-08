---
status: inbox
type: fix
source: security-analyst, code-reviewer
related: 013-board-hardening-before-rollout.md
date-created: 07-10-2026
last-edit: 07-10-2026
---
# Board probe and containment follow-ups from the task 013 review

Gate 1 of task 013 passed with no blockers. These suggestions stayed open
under the default fix policy.

1. **Print no foreign directory in the probe.** `SAFE_DIR` blocks markup and control characters, but it allows letters, spaces, `.`, `-`, `~`, `/`, and `_`. A local process on another UID can bind 127.0.0.1:4411 without privilege, and it can put up to 256 characters of plain-language instruction into `projectDir`. That text reaches Claude's context word for word. Fix: print the fixed text "Port 4411 serves the board of another project." and drop the directory. Alternative: print the directory only when it exists, holds `.constellation/config.json`, and has the user's own UID.
2. **Bound the probe port.** `main` accepts any positive integer. With `--probe --port 70000`, `net` throws `ERR_SOCKET_BAD_PORT` inside the Promise executor, so the probe exits 1 with a stack trace, against decision D4. Fix: reject ports above 65535 when parsing arguments, and add a `.catch` in `runProbe` that prints the foreign verdict.
3. **Pin the sibling-prefix containment with a test.** `readPrefix` correctly checks `real.startsWith(root + path.sep)`, but no test fails if the code drops `path.sep`. Add a test: a sibling `.constellation-evil/` directory, plus a task symlink into it, expects `unreadable: outside .constellation`.
4. **Contain a symlinked `.constellation` root.** A cloned repo can commit `.constellation` as a symlink to `$HOME`, and the board then lists `$HOME/tasks/*.md` and the like. Only names and field keys reach the local page. Fix: require `realpath(.constellation)` to lie under `realpath(projectDir)`, or add an entry to `errors` when it does not.
5. **Small probe hardening.** Accept only `statusCode === 200` replies. Add `O_NOFOLLOW` to the open flags, or compare the `dev` and `ino` from `fstat` with those from `stat(real)`. Print the exact foreign verdict text in `board.md`, which today lists only a prefix.
