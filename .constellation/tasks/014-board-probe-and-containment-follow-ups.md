---
status: in-progress
type: fix
source: security-analyst, code-reviewer
related: 013-board-hardening-before-rollout.md
date-created: 07-10-2026
last-edit: 08-10-2026
---
# Board probe and containment follow-ups from the task 013 review

Gate 1 of task 013 passed with no blockers. These suggestions stayed open
under the default fix policy.

1. **Print no foreign directory in the probe.** `SAFE_DIR` blocks markup and control characters, but it allows letters, spaces, `.`, `-`, `~`, `/`, and `_`. A local process on another UID can bind 127.0.0.1:4411 without privilege, and it can put up to 256 characters of plain-language instruction into `projectDir`. That text reaches Claude's context word for word. Fix: print the fixed text "Port 4411 serves the board of another project." and drop the directory. Alternative: print the directory only when it exists, holds `.constellation/config.json`, and has the user's own UID.
2. **Bound the probe port.** `main` accepts any positive integer. With `--probe --port 70000`, `net` throws `ERR_SOCKET_BAD_PORT` inside the Promise executor, so the probe exits 1 with a stack trace, against decision D4. Fix: reject ports above 65535 when parsing arguments, and add a `.catch` in `runProbe` that prints the foreign verdict.
3. **Pin the sibling-prefix containment with a test.** Done in task 013 at Gate 2: the SDET added the regression test and proved it by mutation.
4. **Contain a symlinked `.constellation` root.** A cloned repo can commit `.constellation` as a symlink to `$HOME`, and the board then lists `$HOME/tasks/*.md` and the like. Only names and field keys reach the local page. Fix: require `realpath(.constellation)` to lie under `realpath(projectDir)`, or add an entry to `errors` when it does not.
5. **Small probe hardening.** Accept only `statusCode === 200` replies. Add `O_NOFOLLOW` to the open flags, or compare the `dev` and `ino` from `fstat` with those from `stat(real)`. Print the exact foreign verdict text in `board.md`, which today lists only a prefix.

## Batch with task 008

Request: "go with 006 and 015 in a batch. Once done, take 008 and 014 in
another batch". This workflow runs on task 014 and includes items 4 to 10
of task 008. Item 3 of this task is already done. The open question of task
008 moves to task 017. Tasks 008 and 014 close with the same commit. This
batch cuts release 1.3.3, which rolls in the `[Unreleased]` entry of tasks
015 and 006.

## Acceptance criteria

Plan: `.constellation/plans/014-board-probe-and-containment-follow-ups.md`.
The criteria cover items 1, 2, 4, and 5 of this task and items 4 to 10 of
task 008.

1. Given a project whose `.constellation` is a symlink, and its real path
   lies outside the real project directory and is not a directory named
   `.constellation`, when the board refreshes, then the snapshot lists no
   work item, reads no file under that path, and `errors` holds exactly
   `.constellation resolves outside the project`. (Item 4.)
2. Given a project whose `.constellation` is a symlink to a directory named
   `.constellation` elsewhere, or to any directory inside the project, when
   the board refreshes, then the board reads its files as in 1.3.2.
   (Item 4.)
3. Given a project whose `.constellation` resolves outside the project as in
   criterion 1, or whose `config.json` resolves outside `.constellation` or
   is not a regular file, when the monitor runs `board.mjs --quiet`, then
   the process exits 0, prints nothing, and opens no port. (Item 4, task
   008 item 10.)
4. Given `config.json` or `tracks.json` as a symlink to `/dev/zero` or to a
   file outside `.constellation`, when the board refreshes, then the refresh
   completes and `errors` holds `<name>: unreadable: outside .constellation`.
   Given either file larger than 1 MB, then `errors` holds
   `<name>: exceeds 1 MB` and the board does not parse it. Given a rejected
   or capped `config.json`, then the snapshot keeps `initialized: true`.
   (Task 008 item 10.)
5. Given a board of another project on port 4411 whose `projectDir` is a
   directory that the user owns and that holds `.constellation/config.json`,
   when the user runs `/constellation:board`, then the output is
   `Port 4411 serves the board of another project: <dir>` and the manual
   command for port 4412. Given any other `projectDir` that passes the
   character filter, then the output is
   `Port 4411 serves the board of another project.` and the manual command
   for port 4412, and no part of the reported directory. (Item 1.)
6. Given `--port` outside 1 to 65535, when `board.mjs` starts in any mode,
   then it exits 1 and stderr is exactly
   `board: --port must be an integer from 1 to 65535`, with no stack trace.
   (Item 2.)
7. Given a reply with a status other than 200 on the port, when the probe
   runs, then the output is the foreign verdict, also when the body holds
   this project's `projectDir`. (Item 5.)
8. Given `board.md`, then it lists the exact first line of each of the five
   verdicts that `probeText` prints for port 4411. (Item 5.)
9. Given 32 open `/events` clients, when a 33rd client connects, then it
   receives 503, and the 32 clients stay connected. When one client closes,
   then the next connection receives 200. (Task 008 item 4.)
10. Given two plans whose `task:` links name the same task, when the board
    builds the tree, then the first plan in file order attaches, and the
    second plan goes to "plans without task" with the warning
    `duplicate plan for task: <task file>`, never `plan without task`, and
    attaches to no other task. Given a plan whose `task:` link is empty or
    names no task, then the plan attaches to the task with its own file name
    when that task has no plan. (Task 008 item 5.)
11. Given a loader that fails with the same message on consecutive
    refreshes, when the board refreshes, then `errors` holds that message
    once. (Task 008 item 6.)
12. Given a plan with `status: constructor` or `status: __proto__`, when the
    backlog renders, then the row shows 📝, and the HTML holds no function
    source text and no `[object Object]`. (Task 008 item 7.)
13. Given any response of the board server, then it carries
    `X-Content-Type-Options: nosniff`. Given the page, then it carries a
    `Content-Security-Policy` whose `script-src` and `style-src` hashes
    match the inline script and style, with `default-src 'none'`,
    `connect-src 'self'`, `img-src data:`, and `frame-ancestors 'none'`, and
    with no `'unsafe-inline'`. In a browser, the page renders, updates over
    SSE, shows the favicon, and logs no CSP violation. (Task 008 item 8.)
14. Given `board.mjs`, then its file header names no phase, and its usage
    line equals the usage line of `--help`. (Task 008 item 9.)
15. Given the change, when the Lint Gate runs, then the 102 unchanged
    current tests, the one changed test, and the 19 new tests in
    `board.test.mjs` pass, and `scripts/selftest.sh` prints
    `selftest: ALL GREEN`.
