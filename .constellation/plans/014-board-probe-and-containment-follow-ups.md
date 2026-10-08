---
status: approved
task: 014-board-probe-and-containment-follow-ups.md
date-created: 08-10-2026
last-edit: 08-10-2026
---
# Board probe and containment follow-ups (tasks 014 and 008)

## Overview

**Problem**: Gate 1 of tasks 002 and 013 left eleven small findings open.
This batch closes them.

- Task 014, items 1, 2, 4, and 5. Item 3 shipped in task 013.
- Task 008, items 4 to 10. Items 1 to 3 shipped in task 013. The open
  question of task 008 moved to spike task 017.

The findings fall into four groups:

1. **Probe output.** The probe prints a directory that a process on
   another UID controls (014-1). A port above 65535 crashes the probe with
   a stack trace (014-2). A non-200 reply can still pass as a board, and
   `board.md` lists only a prefix of the foreign verdict (014-5).
2. **Containment.** A committed `.constellation` symlink can point the
   board at `$HOME` (014-4). `config.json` and `tracks.json` still go
   through `readFileSync`, so a symlink to `/dev/zero` hangs the board at
   start (008-10). The open of a work item does not refuse a symlink swap
   after the real-path check (014-5).
3. **Server.** No SSE client cap (008-4). No `nosniff` and no CSP (008-8).
4. **Correctness and hygiene.** Plan-link precedence (008-5), repeated
   errors (008-6), prototype-chain glyph lookups (008-7), and a stale file
   header (008-9).

**Impact**: A hostile clone can no longer make the board read outside the
project or hang it at start. A process on another UID can no longer put
free text into Claude's context through the probe. The page gets standard
browser hardening. Two plans for one task get a warning that names the
real problem.

**Scope**:

- In: every item listed above, in `board.mjs`, `board.test.mjs`, and
  `board.md`. Release 1.3.3, which also rolls in the `[Unreleased]` entry
  of tasks 015 and 006.
- Out: task 017 (monitor start before workspace trust); task 004
  (automatic port selection); task 016 (CI Node pin); a bounded or
  contained read of `metrics/events.jsonl` (see "Follow-up"); any change to
  `selftest.sh`, `hooks.json`, `log-event.sh`, or the portfolio commands.

**Blocks**: the close of tasks 008 and 014, and release 1.3.3.
**Blocked By**: nothing. Release 1.3.2 and PR #33 are on `main`.

**Track**: purely technical work on internal harness tooling. No PM pairing.

**Version**: 1.3.3, a patch release. See "Release notes for the Technical
Writer".

## Acceptance Criteria

The task file holds the BDD criteria. This section repeats them and adds
technical notes.

1. **Root outside the project.** Given a project whose `.constellation` is
   a symlink, and its real path lies outside the real project directory and
   is not a directory named `.constellation`, when the board refreshes,
   then the snapshot lists no work item, reads no file under that path, and
   `errors` holds exactly `.constellation resolves outside the project`.
   - Note: decision D1. `loadSnapshot` returns `emptySnapshot` with that
     one error. `readJson`, `scanWorkItems`, and `readTail` do not run.
2. **Shared root kept.** Given a project whose `.constellation` is a
   symlink to a directory named `.constellation` elsewhere, or to any
   directory inside the project, when the board refreshes, then the board
   reads its files as in 1.3.2.
   - Note: the current test "a symlinked .constellation directory still
     reads its files" covers the first case with no edit.
3. **Silent monitor on a hostile root or config.** Given a project whose
   `.constellation` resolves outside the project as in criterion 1, or
   whose `config.json` resolves outside `.constellation` or is not a
   regular file, when the monitor runs `board.mjs --quiet`, then the
   process exits 0, prints nothing, and opens no port.
   - Note: decision D4. A `config.json` that is a contained regular file
     still starts the board, also when it fails to parse or exceeds 1 MB.
     The page then shows the error.
4. **Bounded JSON reads.** Given `config.json` or `tracks.json` as a
   symlink to `/dev/zero` or to a file outside `.constellation`, when the
   board refreshes, then the refresh completes and `errors` holds
   `<name>: unreadable: outside .constellation`. Given either file larger
   than 1 MB, then `errors` holds `<name>: exceeds 1 MB` and the board does
   not parse it. Given a rejected or capped `config.json`, then the
   snapshot keeps `initialized: true`.
   - Note: `current-workflow.json` uses the same `readJson`, so it gets the
     same rules. Its errors keep the current `stale` behavior.
   - Note: every contained read opens the resolved path with `O_NOFOLLOW`.
     A swap of the final component to a symlink after the real-path check
     then fails with `unreadable: ELOOP`. A real race is not testable in a
     deterministic way, so no automated test covers it.
5. **Another project's board.** Given a board of another project on port
   4411 whose `projectDir` is a directory that the user owns and that holds
   `.constellation/config.json`, when the user runs `/constellation:board`,
   then the output is `Port 4411 serves the board of another project:
   <dir>` and the manual command for port 4412. Given any other
   `projectDir` that passes the character filter, then the output is
   `Port 4411 serves the board of another project.` and the manual command
   for port 4412, and no part of the reported directory.
   - Note: decision D2.
6. **Port range.** Given `--port` outside 1 to 65535, when `board.mjs`
   starts in any mode, then it exits 1 and stderr is exactly
   `board: --port must be an integer from 1 to 65535`, with no stack trace.
7. **Status code.** Given a reply with a status other than 200 on the
   port, when the probe runs, then the output is the foreign verdict, also
   when the body holds this project's `projectDir`.
8. **Exact verdicts in `board.md`.** Given `board.md`, then it lists the
   exact first line of each of the five verdicts that `probeText` prints
   for port 4411.
9. **SSE cap.** Given 32 open `/events` clients, when a 33rd client
   connects, then it receives 503, and the 32 clients stay connected. When
   one client closes, then the next connection receives 200.
10. **Plan precedence.** Given two plans whose `task:` links name the same
    task, when the board builds the tree, then the first plan in file order
    attaches, and the second plan goes to "plans without task" with the
    warning `duplicate plan for task: <task file>`, never
    `plan without task`, and attaches to no other task. Given a plan whose
    `task:` link is empty or names no task, then the plan attaches to the
    task with its own file name when that task has no plan.
11. **Errors once.** Given a loader that fails with the same message on
    consecutive refreshes, when the board refreshes, then `errors` holds
    that message once.
12. **Own-property glyphs.** Given a plan with `status: constructor` or
    `status: __proto__`, when the backlog renders, then the row shows 📝,
    and the HTML holds no function source text and no `[object Object]`.
13. **Headers.** Given any response of the board server, then it carries
    `X-Content-Type-Options: nosniff`. Given the page, then it carries a
    `Content-Security-Policy` whose `script-src` and `style-src` hashes
    match the inline script and style, with `default-src 'none'`,
    `connect-src 'self'`, `img-src data:`, and `frame-ancestors 'none'`,
    and with no `'unsafe-inline'`. In a browser, the page renders, updates
    over SSE, shows the favicon, and logs no CSP violation.
    - Note: decision D3.
14. **Header comment.** Given `board.mjs`, then its file header names no
    phase, and its usage line equals the usage line of `--help`.
15. **No regression.** Given the change, when the Lint Gate runs, then the
    102 unchanged current tests, the one changed test, and the 19 new tests
    in `board.test.mjs` pass, and `scripts/selftest.sh` prints
    `selftest: ALL GREEN`.

## Design decisions

### D1 — Symlinked `.constellation` root: contain it, keep shared roots

Choice: a third option. Resolve `realpath(projectDir)` and
`realpath(projectDir/.constellation)`. Accept the root when one of these
is true:

- The real root lies under the real project directory.
- The basename of the real root is `.constellation`.

Refuse every other root. `loadSnapshot` then returns `emptySnapshot` with
`errors: ['.constellation resolves outside the project']` and reads
nothing under the root. The `--quiet` gate exits 0 (D4).

Threat and use, weighed:

- Threat: a crafted clone commits `.constellation` as a symlink to `$HOME`,
  to `../../..`, or to `/`. The board then lists `tasks/*.md` and the like
  of that directory on the local page. Only names and field keys reach
  the page. The page binds to 127.0.0.1 and checks the `Host` header. The
  impact is low. The fix is still cheap, and it removes a read of
  directories that the user never chose.
- Use: a shared `.constellation`, for example one state directory that two
  clones of one repo share. The target of such a link is another project's
  `.constellation` directory. The basename rule keeps that case.
- The basename rule lets a crafted clone point at another project's
  `.constellation`. That exposes another Constellation backlog on the
  local page, which is the data that the board shows anyway. The harness
  keeps no global `~/.constellation`, so `$HOME` itself fails the rule.

Rejected options:

- Strict containment (option A). It breaks the 1.3.2 decision D1 and the
  test "a symlinked .constellation directory still reads its files". That
  test then has to assert the rejection instead. It removes the shared
  root, and the extra protection over the basename rule is small.
- Read and warn (option B). It keeps every read outside the project. A
  warning line does not stop the listing, so the item stays open in all
  but name.

**What a user loses**: a `.constellation` symlink to a directory outside
the project with another name, for example `~/shared/harness-state`. That
board shows no work items and one error line, and the monitor stays
silent. Open question Q1 asks the user to confirm this.

Test changes: none. The current symlinked-root test targets
`<tmp>/.constellation`, so the basename rule accepts it. It becomes the
mutation guard for that rule.

### D2 — Foreign directory in the probe: print it only after a check

Choice: print the directory only when all three checks pass. Otherwise
print the fixed line `Port 4411 serves the board of another project.`.

1. The reply `projectDir` passes `SAFE_DIR` (unchanged, in
   `classifyProbe`).
2. `fs.statSync(dir).uid === process.getuid()`.
3. `fs.statSync(dir/.constellation/config.json).isFile()`.

Reasons:

- Task 004 is open, so every project uses port 4411. Two projects collide
  often. The directory tells the user which session holds the port. The
  fixed text loses that.
- A process on another UID can bind 127.0.0.1:4411. With the checks, it
  can only name a directory that the user owns and that holds a
  Constellation config, that is, one of the user's own projects. It
  cannot create such a directory, so it cannot choose the words.
- A process on the same UID can already write to the user's files. The
  check does not try to stop it.
- On Windows, `process.getuid` does not exist. The probe then prints the
  fixed line.
- The check lives in a new impure `ownsProject(dir)` that `runProbe` calls.
  `classifyProbe` and `probeText` stay pure, and the current
  `classifyProbe` tests stay green.

### D3 — CSP: hash sources computed once at module load

Choice: hashes, not a nonce. `default-src 'none'` with a `sha256` hash for
the one inline script and the one inline style.

Reasons:

- The page is one static string. A hash computed once covers every
  response. A nonce needs a page built per request for no gain.
- A hash also fails closed: an edit of the script text without the matching
  hash breaks the page at once, and the test sees it.
- `style-src` with a hash blocks `style="..."` attributes. The page has
  three: line 813 (`section`), line 842 (`div.meta`), and line 886 (`h2`).
  Move them to two classes, `.mt16 { margin-top:16px; }` and
  `.mb12 { margin-bottom:12px; }`. Then no `'unsafe-inline'` and no
  `'unsafe-hashes'` is necessary.

Construction:

1. Split `PAGE` into `PAGE_STYLE` (the exact text between `<style>` and
   `</style>`) and `PAGE_SCRIPT` (the exact text between `<script>` and
   `</script>`). `PAGE` composes them. Do not extract them from `PAGE` with
   a regular expression.
2. `cspHash(text)` returns `'sha256-<base64>'` of the UTF-8 bytes.
3. `PAGE_CSP` is the string below, joined with `; `:

```
default-src 'none'
script-src 'sha256-<PAGE_SCRIPT>'
style-src 'sha256-<PAGE_STYLE>'
connect-src 'self'
img-src data:
base-uri 'none'
form-action 'none'
frame-ancestors 'none'
```

- `connect-src 'self'` covers the `EventSource('/events')` connection on
  both `127.0.0.1:<port>` and `localhost:<port>`.
- `img-src data:` covers the data-URI favicon.
- The page loads no font, frame, or other resource, so `default-src
  'none'` blocks nothing in use.

Headers:

- `content-security-policy: <PAGE_CSP>` on `/` only.
- `x-content-type-options: nosniff` on every response. Set it with
  `res.setHeader` as the first statement of the request handler, before
  the `Host` check. `writeHead` merges it into every status: 200, 403,
  404, 405, and 503.

### D4 — Bounded `readJson`, and what a rejected config means

Choice: `readJson(root, file)` reads through `readPrefix` with a second
module buffer of `JSON_CAP_BYTES = 1024 * 1024`. All three JSON files use
it: `config.json`, `tracks.json`, and `current-workflow.json`. One read
path for the three is simpler than two, and the state file gets the same
protection for no cost.

| Input | `readJson` result | Snapshot effect |
|---|---|---|
| Root refused (D1) or root missing | not called / `missing: true` | as today for a missing root |
| `ENOENT` | `missing: true` | as today |
| Outside `.constellation`, not a regular file, `EISDIR`, `ELOOP` | `error: 'unreadable: <code>'` | `errors` holds `<name>: unreadable: <code>` |
| Larger than 1 MB | `error: 'exceeds 1 MB'`, no parse | `errors` holds `<name>: exceeds 1 MB` |
| Invalid JSON | `error: 'parse: <message>'` | as today |

`initialized`: stays `!configR.missing`. A rejected or capped
`config.json` is present, so the snapshot keeps `initialized: true`. The
page badge "not initialized — no .constellation/config.json" then does not
make a false claim, and the `errors` line names the real cause.
`resolveSteps` gets `config: null` and treats cross-model validation as
off.

`--quiet` gate: replace `fs.existsSync(config)` with
`hasHarness(projectDir)`. It returns true only when the root passes D1 and
`config.json` resolves inside the real root to a regular file. It does not
read the file. Reasons:

- The monitor starts the board in every session after the orchestrator
  skill loads. A hostile clone then gets no board and no port. Task 017
  studies whether that start can happen before workspace trust.
- A legitimate project with a broken `config.json` still gets a board that
  shows the parse error. That helps the user fix it.
- Without `--quiet`, the start check stays as it is: a `.constellation`
  directory must exist. The page then shows any refusal in `errors`.

### D5 — Probe hardening: status 200 only, `O_NOFOLLOW` on the resolved path

- `probe`: in the response callback, call `finish({ kind: 'foreign' })`
  when `res.statusCode !== 200`, before any body read.
- Open flags in `readPrefix`:
  `O_RDONLY | (O_NONBLOCK ?? 0) | (O_NOFOLLOW ?? 0)`.

Choice: `O_NOFOLLOW`, not a `dev` and `ino` comparison. Reasons:

- `readPrefix` opens `real`, the output of `realpathSync`, not the entry
  name. An internal symlink is already resolved, so its final component is
  never a symlink at open time. `O_NOFOLLOW` does not break internal
  symlinks. The tests "a symlink to a file inside .constellation parses
  normally" and "a symlinked .constellation directory still reads its
  files" prove this with no edit.
- A symlink at the final component of `real` at open time means a swap
  after the check, which is the race in question. The open then fails with
  `ELOOP`, and the item shows `unreadable: ELOOP`.
- A `dev` and `ino` comparison of `fstat(fd)` with `stat(real)` needs a
  second path lookup, which can race too, because `stat` follows
  symlinks. It costs more code for the same final-component case.
- Residual risk, unchanged from plan 013: a swap of an intermediate
  directory component. The threat in scope is a committed repo, not a
  local process with write access.

`board.md`: list the exact first line of each verdict for port 4411:

- `Board running: http://127.0.0.1:4411`
- `Port 4411 serves the board of another project: <dir>`
- `Port 4411 serves the board of another project.`
- `Another service holds port 4411. It is not a Constellation board.`
- `Board not running.`

### D6 — Items with fixed specs

- **008-4, SSE cap.** `export const SSE_CLIENT_CAP = 32`. In `/events`,
  after the `Host` and method checks: when `clients.size >=
  SSE_CLIENT_CAP`, reply `503` with `content-type: text/plain`,
  `retry-after: 5`, and the body `too many board clients`, then return.
  The `close` handler that deletes the client stays as it is. A browser
  `EventSource` does not retry after a non-200 reply, so that tab shows the
  "disconnected" badge.
- **008-5, plan precedence.** In `attachPlans`:
  1. `linkedTask = linked ? taskByFile.get(linked) : undefined`.
  2. `target = linkedTask ?? taskByFile.get(plan.file)`. The same-name
     fallback applies only when the link is empty or names no task.
  3. Keep `task link mismatch` when `linked && linked !== plan.file`.
  4. When `target` exists and has no plan, attach.
  5. When `target` exists and has a plan, add
     `duplicate plan for task: ${target.file}` and push the plan to the
     orphans.
  6. When no `target` exists, add `plan without task` and push the plan to
     the orphans, as today.
  - `<file>` in the warning is the task file name. Step 5 also covers a
    same-name fallback whose task already has a plan, because the problem
    is the same.
  - `needsAttention` already includes every warning that is not
    `unknown field`, so the duplicate plan enters Needs attention.
- **008-6, errors once.** In `safeRefresh`: build the message, then return
  `base.errors.includes(msg) ? base.errors : [...base.errors, msg]`. Do not
  change `prev`.
- **008-7, own-property glyphs.** Inside `renderBacklog` (no module
  scope), add
  `function glyph(map, key, fallback) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback; }`.
  Use it at the three lookups: `GLYPHS[t.group]`, `PLAN_GLYPHS[t.plan.status]`,
  and `PLAN_GLYPHS[p.status]`.
- **008-9, header comment.** Lines 2 to 8 become:

```js
// Constellation Harness — board: live workflow panel and backlog tree on localhost.
//
// Read-only. Watches .constellation/ of one project: state/, metrics/, and the epics/,
// features/, tasks/, and plans/ directories. Resolves the active track against
// .constellation/tracks.json with the same rules as the statusline, and serves one HTML
// page that updates over Server-Sent Events.
//
//   node board.mjs [projectDir] [--port N] [--quiet] [--probe]
```

- **014-2, port range.** In `main`: `if (!Number.isInteger(args.port) ||
  args.port < 1 || args.port > 65535)`, print
  `board: --port must be an integer from 1 to 65535` and exit 1. The check
  already runs before the probe and the server, so both modes get it. In
  `runProbe`: `probe(port, here).catch(() => ({ kind: 'foreign' }))`
  before the `then`. The range check removes the known trigger, so the
  `.catch` is a guard with no reachable trigger and no automated test.

## Implementation

All code changes land in
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs`
(1036 lines, about 1120 after the change).

### Functions and line deltas

| Function or symbol | Change | Lines |
|---|---|---|
| File header (lines 2 to 8) | New text (D6, 008-9). | +2 |
| Imports | Add `import crypto from 'node:crypto';`. | +1 |
| Constants | Add `JSON_CAP_BYTES`, `export const SSE_CLIENT_CAP = 32`, `ROOT_OUTSIDE = '.constellation resolves outside the project'`. | +3 |
| `attachPlans` | Precedence and duplicate warning (D6, 008-5). | +5 |
| `safeRefresh` | Skip a message already in the list (008-6). | +2 |
| `renderBacklog` | Add the local `glyph` helper; use it at three lookups (008-7). | +1 |
| `probeText` | Fixed line when `result.dir` is absent (D2). | +1 |
| `jsonBuffer` | New 1 MB module buffer next to `readBuffer`. | +1 |
| `containedReal(root, file)` | New. `realpathSync`, then the `root + path.sep` check; throws `rejected('outside .constellation')`. Shared by `readPrefix` and `hasHarness`. | +5 |
| `resolveRoot(projectDir)` | New. Returns `{ root, error }`: `ENOENT` gives `{ root: null, error: null }`; another `realpath` error gives `.constellation: unreadable: <code>`; a refused root gives `ROOT_OUTSIDE` (D1). | +11 |
| `readPrefix(root, file, buffer = readBuffer)` | Call `containedReal`; cap is `buffer.length`; add `O_NOFOLLOW` (D5). | +1 |
| `scanWorkItems(p, root)` | Take the resolved root from the caller; return `[]` when it is `null`. | -1 |
| `readJson(root, file)` | Route through `readPrefix(root, file, jsonBuffer)`; map the results in the D4 table. | +6 |
| `loadSnapshot` | Call `resolveRoot` first; on `error`, return `{ ...emptySnapshot(projectDir), errors: [error] }`; pass `root` to `readJson` and `scanWorkItems`. | +4 |
| `serve` | `nosniff` on every response; CSP on `/`; the SSE cap with 503 (D3, D6). | +7 |
| `PAGE_STYLE`, `PAGE_SCRIPT`, `PAGE` | Split the literal; move three `style=` attributes to `.mt16` and `.mb12` (D3). | +6 |
| `cspHash(text)`, `PAGE_CSP` | New (D3). | +12 |
| `probe` | `statusCode !== 200` gives `foreign` (D5). | +1 |
| `ownsProject(dir)` | New. `getuid` check, owner UID, and `config.json` as a regular file; `false` on any throw (D2). | +7 |
| `runProbe` | `.catch` to `foreign`; drop `dir` when `ownsProject` fails. | +2 |
| `hasHarness(projectDir)` | New. `resolveRoot`, then `containedReal` and `statSync().isFile()` on `config.json` (D4). | +7 |
| `main` | Port range and message (014-2); `--quiet` gate calls `hasHarness`. | 0 |

`resolveRoot` sketch (the engineer owns the final form):

```js
function resolveRoot(projectDir) {
  let project, root;
  try {
    project = fs.realpathSync(projectDir);
    root = fs.realpathSync(path.join(projectDir, '.constellation'));
  } catch (e) {
    return { root: null, error: e.code === 'ENOENT' ? null : `.constellation: unreadable: ${e.code ?? 'error'}` };
  }
  const inside = root.startsWith(project + path.sep);
  if (!inside && path.basename(root) !== '.constellation') return { root: null, error: ROOT_OUTSIDE };
  return { root, error: null };
}
```

Note: `watch` and `signature` still arm and `stat` paths under a refused
root. They read no file content, and a refresh then returns the error
snapshot. No change.

### Other files

| File | Change | Lines |
|---|---|---|
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/commands/board.md` | Replace the four-verdict list with the five exact first lines from D5 and their meaning. Say that the directory appears only for a project of this user. | +2 |
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs` | One changed test, 19 new tests, two helper changes (below). Import `SSE_CLIENT_CAP`. | +330 |
| `/Users/joaooliveira/study/constellation-harness/.constellation/tasks/014-board-probe-and-containment-follow-ups.md` | Acceptance criteria and `status: refined`. Done by the architect. | — |
| `CHANGELOG.md`, `plugin.json`, `marketplace.json` | Release 1.3.3. Technical Writer at Gate 2. | — |

`scripts/selftest.sh` needs no change. Step 11 already runs every
`*.test.mjs` file.

### Data flow

- Scan: `loadSnapshot` → `resolveRoot` → refused: error snapshot; accepted:
  `readJson(root, …)` ×3 → `readPrefix(…, jsonBuffer)` and
  `scanWorkItems(p, root)` → `readPrefix(…, readBuffer)`.
- Monitor: `main --quiet` → `hasHarness` → false: exit 0; true:
  `runServer`.
- Command: `board.mjs --probe` → port range check → `probe` (status 200
  only) → `classifyProbe` → `ownsProject` → `probeText` → stdout.
- Page: `GET /` → `nosniff` + `PAGE_CSP` → browser runs the hashed script
  → `EventSource('/events')` → cap check → SSE frames.

### Current tests that change

All 103 tests pass on `main` at 2169415.

| Test | Change | Reason |
|---|---|---|
| `cli: --probe prints the verdict and drops the rest of the reply` | Assert that stdout starts with `Port <port> serves the board of another project.\n`, holds `--port <port+1>`, and holds neither `/elsewhere/proj` nor the marker. | D2: `/elsewhere/proj` does not exist, so `ownsProject` fails, and the probe prints the fixed line. This test becomes the guard for "an unchecked directory is never printed". |

Helper changes, with no change to any assertion:

- `httpRequest` also resolves `headers: res.headers`.
- New `openEvents(port, host)`: opens `GET /events` with `agent: false`,
  resolves `{ status, headers, req, res }` on the response, and leaves the
  stream open. The caller destroys `req`.

Tests that stay green with no edit, and why:

- `loadSnapshot: a symlinked .constellation directory still reads its
  files`: the target basename is `.constellation` (D1).
- `loadSnapshot: a symlink to a file inside .constellation parses
  normally`: `readPrefix` opens the resolved path, so `O_NOFOLLOW` does not
  apply (D5).
- `loadSnapshot: an unreadable entry is malformed with its code`: a
  directory opens with `O_NOFOLLOW` and fails the `fstat` check as today.
- `loadSnapshot: truncated state file keeps the previous snapshot and
  flags stale`: the error text still starts with `current-workflow.json:`.
- `buildTree: plan task link wins over the file name`: the linked task
  `014-b.md` has no plan, so the plan attaches there, as today.
- `classifyProbe` tests: `classifyProbe` does not change.
- `serve: the page script compiles …` and `… embeds feedText …`: the page
  still holds one `<script>` element with the same text.

## Validation

Follow `constellation:test-verified-development`. Use the per-function
mutation variant: apply the mutation, run the file, confirm that the named
test fails for the intended reason, then restore the code.

- Run: `node --test /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs`
- Lint Gate: `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`
- Mocking: none. Fixtures are temporary directories, real symlinks, real
  local sockets, and child processes.
- Hang safety: the `/dev/zero` config test runs in-process, as the
  work-item `/dev/zero` test does since task 015. Containment refuses
  `/dev/zero` before the open. When you run a mutation that removes the
  read bound, run the file under `timeout 30`.

**Automated Test**: containment of the root — `resolveRoot`, `loadSnapshot`, `hasHarness`

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 1 | `loadSnapshot: a .constellation symlink that leaves the project is refused with one error` | Project with `.constellation` → `<tmp>/home-like` (holds `tasks/001-a.md`, `config.json`, `tracks.json`): `tree` is `null`, `errors` is exactly `['.constellation resolves outside the project']`, `hasTracks` is `false`. | Remove the containment check in `resolveRoot`. | 1 |
| 2 | `loadSnapshot: a .constellation symlink to a directory inside the project reads its files` | `.constellation` → `harness/` inside the project: the task parses with `warnings: []`, `errors: []`. | Keep only the basename rule in `resolveRoot`. | 2 |
| 3 | `cli: --quiet stays silent when the root or config.json leaves its container` | Table: (a) `.constellation` → outside directory with `config.json`; (b) `config.json` → a file outside `.constellation`. Each exits 0 with empty stdout and stderr. | Restore `fs.existsSync(config)` as the gate (the child then serves and the exit wait times out). | 3 |

The current test `a symlinked .constellation directory still reads its
files` is the guard for the basename rule. Mutation: remove the basename
rule; that test fails.

**Automated Test**: bounded JSON — `readJson`

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 4 | `loadSnapshot: config.json and tracks.json as symlinks to /dev/zero are refused without a read` | Skips without `/dev/zero`. `errors` holds `config.json: unreadable: outside .constellation` and `tracks.json: unreadable: outside .constellation`; `initialized` is `true`; `hasTracks` is `false`. | Read `config.json` with `readFileSync` again (the run hangs; the `timeout` kills it). | 4 |
| 5 | `loadSnapshot: a tracks.json over 1 MB is an error, not a parse` | A valid 1.1 MB `tracks.json` gives `errors` with exactly `tracks.json: exceeds 1 MB` and `hasTracks: false`. | Parse the truncated prefix (the error becomes `parse: …`). | 4 |
| 6 | `loadSnapshot: a config.json under 1 MB parses` | A valid 900 KB `config.json` with `crossModelValidation` on, and a `planned` state file, give `errors: []` and the `plan-review` step in `progress`. | Read JSON with the 64 KB `readBuffer`. | 4 |

**Automated Test**: probe — `probeText`, `ownsProject`, `probe`, `main`

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 7 | `cli: --probe names another project only when it is the user's own Constellation project` | Table: (a) stub `projectDir` = `realpathSync(tmpProject())` prints `Port <port> serves the board of another project: <dir>`; (b) stub `projectDir` = a user-owned temporary directory with no `.constellation` prints the fixed line and no `<dir>`. | (a) Always drop `dir`. (b) Remove the `config.json` check. | 5 |
| 8 | `probeText: another project with no checked directory prints the fixed line` | `probeText({ kind: 'other' }, 4411, '/p/board.mjs')` equals `Port 4411 serves the board of another project.\nStart the board for this project on another port:\nnode "/p/board.mjs" --port 4412\n`. | Print `: ${result.dir}` with no guard (gives `: undefined`). | 5 |
| 9 | `cli: --port outside 1 to 65535 exits 1 with one line and no stack` | Table: `--probe --port 70000`, `--probe --port 65536`, `--port 0`. Each exits 1; stderr equals `board: --port must be an integer from 1 to 65535\n`. | Remove the upper bound. | 6 |
| 10 | `cli: --probe calls a non-200 reply foreign` | A server that replies 500 with `{"projectDir":"<realpath of dir>"}` gives `Another service holds port <port>`. | Remove the status check. | 7 |
| 11 | `board.md: lists the exact first line of every probe verdict` | For `running`, `other` with `dir: '<dir>'`, `other` with no `dir`, `foreign`, and `none`, the first line of `probeText(…, 4411, …)` appears in `board.md`. | Change one word of the foreign text in `probeText`. | 8 |

The UID check of `ownsProject` has no automated test: a test needs a
directory of another user. Manual test 2 covers the code path.

**Automated Test**: server — `serve`

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 12 | `serve: the page CSP hashes match the inline script and style` | Fetch `/`. Extract the text of `<script>` and `<style>`. `sha256` base64 of each appears as `'sha256-…'` in `script-src` and `style-src`. The header holds `default-src 'none'`, `connect-src 'self'`, `img-src data:`, and `frame-ancestors 'none'`, and no `unsafe-inline`. | Hash `PAGE_SCRIPT.trim()` instead of the exact text. | 13 |
| 13 | `serve: the page has no inline style attribute` | The body of `/` holds no `style="`. | Restore `style="margin-top:16px"` on the Backlog section. | 13 |
| 14 | `serve: every response carries nosniff` | Table: `/` 200, `/api/snapshot` 200, `/events` 200 (through `openEvents`), `/nope` 404, `POST /` 405, foreign `Host` 403. Each has `x-content-type-options: nosniff`. | Set the header on the page route only. | 13 |
| 15 | `serve: the 33rd events client gets 503 and a closed client frees a slot` | Open `SSE_CLIENT_CAP` clients: each 200. The next gets 503 with `nosniff`. Destroy one client; `waitFor` a new client with 200 within 2 s. | (a) Remove the cap check. (b) Remove `clients.delete` on `close`. | 9 |

**Automated Test**: tree, refresh, and renderer — `attachPlans`, `safeRefresh`, `renderBacklog`

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 16 | `buildTree: a second plan for a linked task is a duplicate, not a fallback` | Tasks `014-b.md` and `099-a.md`; plans `014-b.md` and `099-a.md`, both with `task: 014-b.md`. `014-b.md` gets plan `014-b.md`. `099-a.md` has `plan: null`. Orphan plan `099-a.md` has warnings `['task link mismatch', 'duplicate plan for task: 014-b.md']` and is in `attention`. | Restore the `[linked, plan.file].find(…)` fallback. | 10 |
| 17 | `buildTree: a plan with no task link still attaches to its same-name task` | Task `020-x.md`; plan `020-x.md` with no `task:` field. The task gets the plan; `orphanPlans` is empty. | Remove the same-name fallback. | 10 |
| 18 | `safeRefresh: a repeated failure adds its message once` | Two throws of `boom` in a row from `prev` with `errors: ['old']` give `['old', 'refresh failed: boom']`. `prev.errors` stays `['old']`. | Remove the `includes` check. | 11 |
| 19 | `renderBacklog: a plan status that names an Object prototype key renders the default glyph` | A task plan with `status: constructor` and an orphan plan with `status: __proto__`: HTML holds 📝 twice in plan positions, and holds neither `function` nor `[object Object]`. | Restore `PLAN_GLYPHS[p.status]` in the orphan-plan row. | 12 |

Count: 19 new tests. `board.test.mjs` goes from 103 to 122 tests.

**MANUAL TEST**: the page under CSP in a browser

- Why manual: only a browser enforces CSP.
- Preconditions: the feature branch checked out.
- Steps:
  1. Run `node /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs /Users/joaooliveira/study/constellation-harness --port 4412`.
  2. Open `http://127.0.0.1:4412` in Chrome. Open the developer console.
  3. Edit the `last-edit` field of any task file and save it.
  4. Open `http://localhost:4412` in Firefox.
- Expected: no CSP violation in either console. The favicon shows. The
  Backlog section and the Activity heading keep their top margin. Step 3
  updates the page within 2 seconds with no reload.
- Observability: the console; `curl -sI 127.0.0.1:4412/` shows the CSP
  and `nosniff` headers.

**MANUAL TEST**: the probe with two projects

- Why manual: the UID check needs a real second project and a live
  session.
- Preconditions: plugin 1.3.3 installed from the feature branch.
- Steps:
  1. In `/Users/joaooliveira/study/guardei-service`, load the orchestrator
     skill and wait 3 seconds.
  2. In `/Users/joaooliveira/study/user-service`, run `/constellation:board`.
  3. Stop the guardei-service session. Run
     `python3 -c "import http.server as h; h.HTTPServer(('127.0.0.1',4411), type('H',(h.BaseHTTPRequestHandler,),{'do_GET':lambda s:(s.send_response(200),s.end_headers(),s.wfile.write(b'{\"projectDir\":\"/tmp\"}'))})).serve_forever()"`.
  4. Run `/constellation:board` again in user-service.
- Expected: step 2 prints
  `Port 4411 serves the board of another project: /Users/joaooliveira/study/guardei-service`.
  Step 4 prints `Port 4411 serves the board of another project.`, because
  `/tmp` holds no `.constellation/config.json`. Both print the command for
  port 4412.
- Observability: the Bash tool output in the transcript.

## Integration Touchpoints

- **Work-item scan** - Could break: a legitimate shared `.constellation`
  reads as refused - Validation: the current symlinked-root test (basename
  rule) and new test 2 (inside rule); open question Q1.
- **Plugin monitor (`--quiet`)** - Could break: an initialized project
  stays silent - Validation: `hasHarness` uses the same root rule; every
  current CLI test with `tmpProject` starts a board; new test 3.
- **JSON reads** - Could break: a real `tracks.json` or `config.json`
  exceeds 1 MB - Validation: the template `tracks.json` is about 3 KB; new
  test 6 parses 900 KB.
- **Claude's context through the probe** - Could break: a hostile
  directory still reaches the output - Validation: the changed probe test
  and new test 7.
- **`/constellation:board` text** - Could break: `board.md` and
  `probeText` drift apart - Validation: new test 11.
- **Browser page** - Could break: CSP blocks the script, the style, the
  SSE connection, or the favicon - Validation: new tests 12 and 13; manual
  test 1.
- **SSE clients** - Could break: a tab gets 503 in normal use -
  Validation: 32 tabs is far above one user's use; new test 15.
- **Backlog tree** - Could break: a plan that attached in 1.3.2 now shows
  as a duplicate - Validation: two plans for one task are invalid under
  the artifact model, confirmed at task 002 verification; new tests 16 and
  17.

## Risks

1. **A user relies on a `.constellation` symlink to a directory with
   another name outside the project** - Impact: M - Likelihood: L -
   Mitigation: the basename rule keeps the common shared case. The error
   line names the cause. Q1 asks the user before the plan is approved.
2. **The CSP blocks part of the page in one browser** - Impact: M -
   Likelihood: L - Mitigation: hashes over the exact composed text, test
   12, and manual test 1 in two browsers.
3. **The 1 MB JSON buffer adds memory** - Impact: L - Likelihood: L -
   Mitigation: one module-level buffer, allocated once.
4. **SSE test with 33 sockets is slow or flaky** - Impact: L -
   Likelihood: L - Mitigation: `agent: false`, local sockets, `waitFor`
   with a 2 s deadline, and cleanup in `finally`.
5. **The probe hides the directory of a real project** - Impact: L -
   Likelihood: L - A project whose board runs from a path that the user
   does not own gets the fixed line. Mitigation: the fixed line still
   prints the command for the next port.

## Logging

The board has no log file. Its observability is the snapshot and the page.

- A refused root: one `errors` line, `.constellation resolves outside the project`.
- A refused or capped JSON file: `<name>: unreadable: <code>` or
  `<name>: exceeds 1 MB` in `errors`.
- A work item swapped to a symlink at open time: `unreadable: ELOOP` on
  its row.
- A repeated refresh failure: one `refresh failed: <message>` line.
- A duplicate plan: `duplicate plan for task: <file>` on the plan row and
  in Needs attention.
- The probe prints one fixed verdict and nothing else, by design.
- `--quiet` prints nothing on a refused root or config, by design: the
  monitor runs in every session.
- No user IDs exist in this local, single-user tool.

## Release notes for the Technical Writer

Release 1.3.3, at Gate 2:

1. In `/Users/joaooliveira/study/constellation-harness/CHANGELOG.md`, turn
   `## [Unreleased]` into `## [1.3.3] - <ship date>`. Keep the entries of
   tasks 015 and 006. Add this batch's entries under the same heading.
2. Bump `"version"` to `1.3.3` in
   `/Users/joaooliveira/study/constellation-harness/plugins/constellation/.claude-plugin/plugin.json`
   and in
   `/Users/joaooliveira/study/constellation-harness/.claude-plugin/marketplace.json`.
3. Write each behavior change as its own bullet, marked
   **Behavior change**:
   - D1: a `.constellation` symlink whose target lies outside the project
     and is not named `.constellation` shows no work items and the error
     `.constellation resolves outside the project`. The monitor stays
     silent for that project. Name the layout that stops: a symlink to a
     directory with another name outside the project.
   - D4: `config.json`, `tracks.json`, and `current-workflow.json` must
     resolve inside `.constellation/`, be regular files, and be at most
     1 MB. A refused file shows `<name>: unreadable: <reason>` or
     `<name>: exceeds 1 MB`. A refused `config.json` keeps the project
     "initialized" on the page. The `--quiet` monitor starts only when
     `config.json` is a contained regular file.
   - D2: the probe names another project's directory only when the user
     owns it and it holds `.constellation/config.json`. Otherwise it
     prints `Port 4411 serves the board of another project.`.
   - 014-2: `--port` outside 1 to 65535 exits 1 with
     `board: --port must be an integer from 1 to 65535`. The old text was
     `--port must be a positive integer`.
   - 008-4: a 33rd `/events` client gets 503.
   - 008-5: a second plan for a linked task warns
     `duplicate plan for task: <file>` and no longer attaches to its
     same-name task.
4. Under `### Security`: CSP with hashes and `frame-ancestors 'none'`;
   `nosniff` on every response; status 200 only in the probe;
   `O_NOFOLLOW` on contained reads; the bounded JSON reads.
5. Under `### Fixed`: errors once per message; own-property glyph
   lookups; the file header and usage line.
6. Test count: 103 to 122.
7. Under `### Known limitations`: `metrics/events.jsonl` is still read in
   full and is not contained (see "Follow-up"). Task 017 is open.
8. Close the plan reference: `.constellation/plans/014-board-probe-and-containment-follow-ups.md`.

## Follow-up (not in this plan)

- `readTail` reads `metrics/events.jsonl` with `readFileSync`, with no
  containment. The harness gitignores `metrics/`, but a crafted repo
  controls its own `.gitignore`. It can commit
  `.constellation/metrics/events.jsonl` as a symlink to `/dev/zero`, and
  the board then hangs at start. Recommendation: a new task for a
  contained tail read of the last 256 KB with `readSync` at
  `size - cap`. It needs its own design, because `readPrefix` reads the
  head of a file, not the tail.

## Open Questions

- [x] **Q1 (decision D1).** The board refuses a `.constellation` symlink
  whose target lies outside the project and is not a directory named
  `.constellation`. It also refuses a `config.json` symlink outside
  `.constellation/`, and the monitor then stays silent. A user with such a
  layout loses the board for that project. Confirm D1 as written, or
  choose strict containment (also refuses a shared `.constellation`
  elsewhere, and the current symlinked-root test changes to assert the
  refusal), or warn only (keeps every read). Recommendation: D1 as
  written. When the user confirms, set `status: approved`.

  Resolved on 08-10-2026: the user confirmed D1 as written (allow a root
  inside the project, or a target named `.constellation`; refuse all
  other outside roots).
