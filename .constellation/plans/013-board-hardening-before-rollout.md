---
status: approved
task: 013-board-hardening-before-rollout.md
date-created: 07-10-2026
last-edit: 07-10-2026
---
# Board hardening before rollout

## Overview

**Problem**: Three defects block the rollout of the board to more projects.

1. `/constellation:board` curls the full snapshot into Claude's context.
   On guardei-service the reply is 122 KB, about 31k tokens, per call. A
   process that holds port 4411 can also inject text through that reply.
2. Needs attention lists 121 of 210 items on guardei-service. Each one
   carries only `unknown field` warnings. The real problems drown.
3. `readWorkItem` follows any symlink and reads the whole file. A cloned
   repo can commit `tasks/x.md` as a symlink to `/dev/zero`, and the board
   exhausts memory on every refresh. `feedText` writes `tool_name` into
   `innerHTML` without `esc`.

**Impact**: The command costs a few tokens and carries no untrusted text.
Needs attention shows only items that need a fix. A hostile repo cannot
hang the board, and a hostile event line cannot inject HTML.

**Scope**:

- In: a `--probe` mode in `board.mjs` and a rewrite of `board.md` around
  it; a new Needs attention rule in `buildTree`; a bounded, regular-file
  read in `readWorkItem`; a cap-aware verdict in `parseFrontMatter`;
  `feedText` as an exported pure function with `esc` on `tool_name`; one
  selftest check on `board.md`.
- Out: items 4 to 9 of task 008 (SSE client cap, plan link precedence,
  `errors` cap, own-property glyph lookups, hardening headers, the stale
  header comment); unbounded reads in `readJson` and `readTail` (see
  "Follow-up" below); any change to `log-event.sh`, `hooks.json`, or the
  portfolio commands; a count of lenient items in `counts`.

**Blocks**: the wider rollout of the board, and the manual checks of task
009, which depend on a usable Needs attention group.
**Blocked By**: nothing. Phase 2 shipped in 1.3.0, the monitor fix in 1.3.1.

**Track**: purely technical work on internal harness tooling. No PM pairing.

**Version**: 1.3.2, a patch release. The Technical Writer bumps
`plugins/constellation/.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json`, and `CHANGELOG.md`.

## Acceptance Criteria

The task file holds the BDD criteria. This section repeats them and adds
technical notes.

1. **This project's board.** Given a board for this project on port 4411,
   when the user runs `/constellation:board`, then the output is
   `Board running: http://127.0.0.1:4411` and the interactive-session line,
   and no snapshot field other than `projectDir` reaches Claude's context.
   - Note: `board.mjs --probe` reads the reply and prints a fixed verdict.
     Claude never sees the reply body. The probe compares `projectDir` with
     the real path of its working directory, which equals `pwd -P`.
2. **Another project's board.** Given a board for another project on port
   4411, when the user runs `/constellation:board`, then the output names
   that project's directory and prints the manual start command for port
   4412.
   - Note: the probe prints the directory only when it matches
     `SAFE_DIR`, an absolute path of at most 256 characters from a fixed
     character set. Any other value is a foreign reply.
3. **A foreign service or garbage.** Given a process on port 4411 that is
   not a Constellation board, when the user runs `/constellation:board`,
   then the output says that another service holds the port and prints the
   manual start command for port 4412, and no byte of the reply appears in
   the output.
   - Note: foreign means one of these: no JSON, no string `projectDir`, a
     `projectDir` outside `SAFE_DIR`, a reply over 8 MB, or no complete
     reply within 1 second.
4. **No listener.** Given no process on port 4411, when the user runs
   `/constellation:board`, then the output is `Board not running`, one line
   that says the board starts when the orchestrator skill loads, and the
   manual start command.
5. **Unknown fields only.** Given an item whose only warnings are
   `unknown field: <name>`, when the board renders the backlog, then the
   item row shows the `lenient` badge and one warning line per field, and
   the item does not appear in Needs attention.
   - Note: on guardei-service this rule moves Needs attention from 121
     items to 0, measured on 07-10-2026 against the current snapshot.
6. **Real problems.** Given a malformed item, or an item with at least one
   warning that is not `unknown field`, when the board renders the backlog,
   then the item appears in Needs attention with every warning it carries,
   the `unknown field` warnings included.
7. **Hostile entries.** Given a work-item entry that is a symlink to
   `/dev/zero`, a FIFO, a directory, or a symlink whose real path leaves
   `.constellation/`, when the board refreshes, then the refresh completes,
   and the entry renders as a `malformed` row with the warning
   `unreadable: <reason>`, also in Needs attention.
   - Note: reasons are `outside .constellation`, `not a regular file`, and
     `EISDIR`. A dangling symlink stays hidden, as in 1.3.1.
8. **Internal symlinks.** Given a work-item entry that is a symlink to a
   regular file inside `.constellation/`, when the board refreshes, then
   the entry parses like a regular file under its own link name.
9. **Large files.** Given a work-item file larger than 64 KB with its
   front-matter in the first 64 KB, when the board refreshes, then the
   item parses with the same fields and warnings as a short file. Given a
   front-matter block that does not close within the first 64 KB, then the
   item is `malformed` with the warning `front-matter exceeds 64 KB`, never
   `unclosed front-matter`.
10. **Escaped tool name.** Given an `events.jsonl` line whose `tool_name`
    holds HTML, when the Activity feed renders, then the feed shows the
    text with `<` and `>` escaped, and the page creates no element from it.
11. **No regression.** Given the change, when the Lint Gate runs, then the
    72 current tests in `board.test.mjs` pass with no edit, and
    `scripts/selftest.sh` prints `selftest: ALL GREEN`.

## Design decisions

### D1 — Symlink policy: allow internal symlinks after a real-path check

Choice: resolve the entry with `fs.realpathSync`. Accept it only when the
real path lies under the real path of `.constellation/`. Then open the real
path with `O_RDONLY | O_NONBLOCK` and accept it only when `fstatSync`
reports a regular file.

Reasons:

- The task text asks for this rule: "reject a symlink whose real path
  leaves `.constellation/`". An `lstat` rule that rejects every symlink
  breaks the legitimate internal case for two more lines of saving.
- The real-path check also handles a `.constellation/` directory that is
  itself a symlink. `lstat` on the entry does not see that case.
- `fstat` on the open descriptor is the authority for the file type. It
  sees the object that the read uses, so a swap between check and read
  cannot pass a device.
- `O_NONBLOCK` makes the open of a FIFO return at once. Without it,
  `openSync` on a FIFO blocks the event loop until a writer appears. The
  flag has no effect on a regular file. On Windows the constant is
  undefined; the code uses `?? 0`.
- `/dev/zero` fails the containment check, so the board never opens it.
  A device inside the project fails the `fstat` check.

Rejected entries become `malformed` nodes, not skipped entries. Criterion
2 of task 002 says that the board never hides a file that the user put
there. The warning is `unreadable: <reason>`, the same family as the
current `unreadable: EISDIR`, so the existing directory test stays green.

| Entry | Warning |
|---|---|
| Real path outside `.constellation/` | `unreadable: outside .constellation` |
| FIFO, character or block device, socket | `unreadable: not a regular file` |
| Directory | `unreadable: EISDIR` (unchanged text) |
| Dangling symlink | none; the entry stays hidden (unchanged, `ENOENT`) |
| Symlink loop | `unreadable: ELOOP` (from `realpathSync`) |

Accepted residual risk: a local process can swap a symlink between
`realpathSync` and `openSync`. The threat in scope is a committed repo,
not a local attacker with write access.

### D2 — Read cap: 64 KB, with a distinct warning at the cap

Choice: `READ_CAP_BYTES = 64 * 1024`. Read with `openSync`, `readSync`
into one module-level `Buffer` of that size, and `closeSync` in `finally`.
Report `truncated` when `fstat` size is larger than the bytes read.

Reasons:

- The parser looks at most at 50 lines plus the closing fence: the opening
  `---` in lines 1 to 10, the closing `---` in the 40 lines after it.
  64 KB allows an average of 1300 bytes per line over those 50 lines.
  Real front-matter is under 1 KB.
- 64 KB per file costs nothing. One shared buffer avoids 210 allocations
  per refresh. The scan is synchronous, so no two reads share the buffer.
- A byte cap can cut a front-matter block with long lines. The parser then
  sees no closing fence. Without a guard, that yields a false
  `unclosed front-matter`.

Behavior at the cap, in `parseFrontMatter(text, kind, truncated)`:

1. When `truncated` is true, drop the last line. It can be cut mid-way, and
   a cut `---x` line must not read as a fence.
2. When no opening fence is found and fewer than 10 complete lines exist,
   return `malformed: true` with `front-matter exceeds 64 KB`.
3. When no closing fence is found and fewer than `open + 1 + 40` complete
   lines exist, return `malformed: true` with the same warning. Keep a
   `title before front-matter` warning in front of it.
4. In every other case, the verdict is exact, because the full window was
   read. The parser returns its normal result.

`front-matter exceeds 64 KB` is a real problem, so the item goes to Needs
attention.

### D3 — Needs attention rule

Choice, in `buildTree`:

```js
const needsAttention = (n) =>
  n.flags.includes('malformed') || n.warnings.some((w) => !w.startsWith('unknown field: '));
```

- An item enters Needs attention when it is `malformed`, or when at least
  one warning is not an `unknown field` warning. That covers `title before
  front-matter`, `missing link`, `unknown status`, `no number in file
  name`, `task link mismatch`, `plan without task`, `unreadable`, and
  `front-matter exceeds 64 KB`.
- An item with only `unknown field` warnings keeps `flags: ['lenient']` and
  all its warnings. `renderBacklog` shows the badge and the warning lines on
  its row with no change.
- An attention entry keeps every warning of the item, the `unknown field`
  warnings included. The summary shape (`kind`, `file`, `flags`,
  `warnings`) does not change.
- `counts` does not change. It counts task groups and `malformed` nodes
  only, and neither depends on the attention list.
- No other output changes. `renderBacklog` already renders the attention
  block only when the list is not empty.

### D4 — `/constellation:board`: a `--probe` mode in `board.mjs`, no jq

Choice: add `--probe` to `board.mjs`. `board.md` runs
`node "${CLAUDE_PLUGIN_ROOT}/scripts/board.mjs" --probe` and prints the
output verbatim. The command runs no `curl` and no `jq`.

Reasons for Node over the suggested jq pipeline:

- Node is always present where the board runs. jq is a dependency of this
  repo's selftest, not of a consumer machine, so a jq pipeline needs a
  second, Node fallback. The probe is one code path.
- The probe is unit-testable with the existing `spawnBoard` and
  `withBlocker` helpers. A pipeline inside Markdown is not.
- The Bash tool runs the user's shell, here zsh. A pipeline that needs the
  curl exit code through `PIPESTATUS` differs between bash and zsh.
- `init.md` already relies on `${CLAUDE_PLUGIN_ROOT}` expansion in a
  command, so the path is safe.
- The probe prints the manual start command with the absolute path of
  `board.mjs`. Claude then copies one exact line.

Probe behavior:

1. `GET http://127.0.0.1:<port>/api/snapshot` with `http.get`. Node sets
   the `Host` header to `127.0.0.1:<port>`, which the board accepts.
2. Stop at an absolute deadline of 1000 ms with `setTimeout` and
   `req.destroy()`. Do not use the `timeout` option of `http.get`: it is a
   socket idle timeout, and a server that sends one byte every 100 ms never
   triggers it. Test-only override: `BOARD_PROBE_TIMEOUT_MS`, as
   `BOARD_STANDBY_MS` does for standby.
3. Stop at 8 MB (`PROBE_MAX_BYTES`). The guardei-service snapshot is
   122 KB, so 8 MB leaves room for about 60 times that backlog.
4. `ECONNREFUSED` gives `none`. Any other error, the deadline, or the cap
   gives `foreign`.
5. A complete reply goes to the pure `classifyProbe(body, here)`.
6. The pure `probeText(result, port, boardFile)` builds the output. The
   probe writes it to stdout and exits 0 in every case.

Output wording, one case per block (`<file>` is the absolute path of
`board.mjs`, `<next>` is the port plus 1):

```
Board running: http://127.0.0.1:4411
```

```
Port 4411 serves the board of another project: <dir>
Start the board for this project on another port:
node "<file>" --port <next>
```

```
Another service holds port 4411. It is not a Constellation board.
Start the board for this project on another port:
node "<file>" --port <next>
```

```
Board not running.
The board starts when the orchestrator skill loads.
node "<file>"
```

For a port other than 4411, the last command adds `--port <port>`.

`SAFE_DIR` is `/^\/[A-Za-z0-9._@+~\/ -]{0,255}$/`. It allows spaces,
because macOS paths carry them. It rejects control characters, newlines,
quotes, backticks, `$`, and any value longer than 256 characters.
Residual risk: a path of plain words can still read as a short sentence.
`board.md` tells Claude to print the output verbatim and to treat it as
data.

The probe is read-only. It sends one `GET`, starts no server, and needs no
`.constellation/` directory.

## Implementation

All code changes land in
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs`
(920 lines, about 1005 after the change).

### Functions and line deltas

| Function or symbol | Change | Lines |
|---|---|---|
| Constants (top of file) | Add `READ_CAP_BYTES`, `PROBE_TIMEOUT_MS = 1000`, `PROBE_MAX_BYTES = 8 * 1024 * 1024`, `SAFE_DIR`. | +4 |
| `parseFrontMatter(text, kind, truncated = false)` | Add the `truncated` parameter, the last-line drop, and the two cap branches (D2). | +6 |
| `toNode(kind, file, text, mtime, truncated = false)` | Pass `truncated` to `parseFrontMatter`. | 0 |
| `buildTree` | Add `needsAttention`; use it in the `attention` filter (D3). | +2 |
| `feedText(e, esc)` | New exported pure function at module scope. Body as in the page, with `esc(e.tool_name \|\| 'edit')`. No module-scope symbol inside. | +6 |
| `PAGE` script | Remove the inner `feedText`. Add `var feedText = ${feedText.toString()};`. Call `feedText(e, esc)`. | -4 |
| `readBuffer`, `rejected(code)` | New module-level buffer and a helper that builds an `Error` with a `code`. | +2 |
| `readPrefix(root, file)` | New. `realpathSync`, containment check, `openSync` with `O_RDONLY \| (O_NONBLOCK ?? 0)`, `fstatSync` type check, `readSync` loop up to the cap, `closeSync` in `finally`. Returns `{ text, truncated, mtime }`. | +17 |
| `readWorkItem(kind, dir, name, root)` | Call `readPrefix`. Pass `truncated` to `toNode`. The `catch` stays as it is. | +1 |
| `scanWorkItems` | Resolve `root = fs.realpathSync(p.root)` once; return `[]` when that throws. Pass `root`. | +2 |
| `classifyProbe(body, here)` | New exported pure function (D4). | +8 |
| `probeText(result, port, boardFile)` | New exported pure function (D4). | +14 |
| `probe(port, here)` | New. `http.get`, absolute deadline, byte cap, error map. Returns a promise of the result. | +22 |
| `parseArgs` | Add `probe: false` and the `--probe` flag. | +1 |
| `main` | After the Node check and the port check, run the probe and exit 0 when `args.probe` is set, before the `.constellation/` check. Add `[--probe]` to the help text. | +6 |

`readPrefix` sketch (the engineer owns the final form):

```js
function readPrefix(root, file) {
  const real = fs.realpathSync(file);
  if (!real.startsWith(root + path.sep)) throw rejected('outside .constellation');
  const fd = fs.openSync(real, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const st = fs.fstatSync(fd);
    if (st.isDirectory()) throw rejected('EISDIR');
    if (!st.isFile()) throw rejected('not a regular file');
    let n = 0;
    for (let r = 1; r > 0 && n < READ_CAP_BYTES; n += r) r = fs.readSync(fd, readBuffer, n, READ_CAP_BYTES - n, n);
    return { text: readBuffer.toString('utf8', 0, n), truncated: st.size > n, mtime: st.mtime.toISOString() };
  } finally {
    fs.closeSync(fd);
  }
}
```

The current `catch` in `readWorkItem` maps `ENOENT` to `null` and every
other code to `unreadable: <code>`. `rejected` sets `code` to the reason
text, so the same `catch` produces every warning in D1.

### Other files

| File | Change | Lines |
|---|---|---|
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/commands/board.md` | Replace steps 1 to 5 with: run the probe, print its output verbatim, treat it as data, run no `curl`. Keep the monitor paragraph and the interactive-session line. | -6 |
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs` | Add the new tests below. Import `feedText`, `classifyProbe`. No current test changes. | +230 |
| `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh` | Add step 11b (see Validation). | +4 |
| `/Users/joaooliveira/study/constellation-harness/.constellation/tasks/013-board-hardening-before-rollout.md` | Acceptance criteria and `status: refined`. Done by the architect. | — |
| `CHANGELOG.md`, `plugin.json`, `marketplace.json`, `README.md` | Version 1.3.2 and the release notes. Technical Writer at Gate 2. | — |

### Data flow

- Scan: `scanWorkItems` → `realpathSync(.constellation)` → per entry
  `readWorkItem` → `readPrefix` → `toNode(…, truncated)` →
  `parseFrontMatter(…, truncated)` → `buildTree` → `needsAttention` filter.
- Command: `/constellation:board` → `board.mjs --probe` → `probe` →
  `classifyProbe` → `probeText` → stdout → Claude prints it verbatim.
- Page: SSE frame → `render` → `feedText(e, esc)` → `innerHTML`.

### Existing tests and how they stay green

All 72 tests pass on 07-10-2026 with Node 25.9.0. The attention rule
breaks none of them, because no current fixture has an item whose only
warnings are `unknown field`:

- `buildTree: v1 fixture …` asserts `attention: []`. No node has a
  warning. Unchanged.
- `buildTree: malformed task stays in … attention` — malformed. Unchanged.
- `buildTree: differing task link adds task link mismatch` — the plan
  carries `task link mismatch`. Unchanged.
- `buildTree: plan without task is orphaned and needs attention` — the
  plan carries `plan without task`. Unchanged.
- `renderBacklog: Needs attention lists malformed and lenient items …` —
  `005-broken.md` is malformed, `004-odd.md` carries `unknown status`.
  Unchanged.
- `parseFrontMatter: unknown field is lenient with the field name` tests
  the parser only. Unchanged.

The read change keeps three I/O tests green:

- `loadSnapshot: dangling symlinks and lock files do not throw` —
  `realpathSync` throws `ENOENT` on a dangling link, so the entry stays
  hidden.
- `loadSnapshot: an unreadable entry is malformed with its code` — the
  directory passes containment, opens, and fails the `fstat` check with
  `EISDIR`.
- `serve: the page script compiles and embeds the backlog renderer` — the
  page still compiles with the injected `feedText`.

Tests to change: none.

## Validation

Follow `constellation:test-verified-development`. Every test imports from
`board.mjs`, so use the per-function mutation variant: apply the mutation
in the table, run the file, confirm that the named test fails for the
intended reason, then restore the code.

- Run: `node --test /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs`
- Lint Gate: `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`
- Mocking: none. Fixtures are inline strings, temporary directories, real
  symlinks and FIFOs, real local sockets, and child processes.
- Hang safety: a test whose mutation can block the event loop (the
  `/dev/zero` and FIFO tests) runs `loadSnapshot` in a child process with
  `spawnSync` and `timeout: 5000`. Add the helper `snapshotInChild(dir)`:
  it runs `node --input-type=module -e` with an import of `board.mjs` and
  prints `JSON.stringify(loadSnapshot(dir).tree)`. A killed child fails the
  test, and the runner does not hang.
- Platform skips: the `/dev/zero` test skips when `/dev/zero` does not
  exist. The FIFO test skips on `win32` or when `mkfifo` is not on `PATH`.
  Use the `skip` option of `test()`.

**Automated Test**: parser cap — `parseFrontMatter`

| Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|
| `parseFrontMatter: front-matter cut by the read cap warns exceeds 64 KB` | `'---\nstatus: inbox\nnote: ' + 'a'.repeat(70000)` with `truncated` gives `malformed` and exactly `['front-matter exceeds 64 KB']`. | Remove the cap branch for the closing fence. | 9 |
| `parseFrontMatter: a truncated read with full windows keeps the real verdict` | `'---\n' + 'order: 1\n'.repeat(60) + 'cut'` with `truncated` gives `['unclosed front-matter']`. | Return the cap warning whenever `truncated` is true. | 9 |
| `parseFrontMatter: a cut last line is not a closing fence` | `'---\nstatus: inbox\n---'` with `truncated` gives the cap warning, not a parse. | Remove the last-line drop. | 9 |

**Automated Test**: bounded reads — `loadSnapshot`, `readPrefix`

| Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|
| `loadSnapshot: a file larger than the read cap parses its front-matter` | A 1 MB task with valid front-matter at the top gives `status: inbox`, `warnings: []`, `flags: []`. | Report every truncated read as `front-matter exceeds 64 KB`. | 9 |
| `loadSnapshot: front-matter that crosses the read cap is malformed` | `status: inbox`, then a 70 KB `note:` line, then `---`, gives `malformed`, `['front-matter exceeds 64 KB']`, and an attention entry. | Replace the bounded read with `readFileSync` (the item then parses). | 9, 6 |
| `loadSnapshot: a symlink to /dev/zero is rejected without a read` | In a child process: the refresh completes, and the node carries `['unreadable: outside .constellation']` and `malformed`. Skips without `/dev/zero`. | Remove the containment check (the warning becomes `not a regular file`). With the `fstat` check also removed, the child hangs and the timeout fails the test. | 7 |
| `loadSnapshot: a symlink outside .constellation is rejected and leaks no key` | A link to an outside file with `status: inbox` and `secret-key: 1` gives `['unreadable: outside .constellation']`, and `JSON.stringify(tree)` holds no `secret-key`. | Remove the containment check. | 7 |
| `loadSnapshot: a symlink to a file inside .constellation parses normally` | `tasks/007-link.md` → `../shared/007.md` with `status: refined` gives file `007-link.md`, `status: refined`, `flags: []`. | Reject every symlink with `lstatSync`. | 8 |
| `loadSnapshot: a symlinked .constellation directory still reads its files` | A project whose `.constellation` is a symlink to another directory gives the task with no warning. | Compare with the unresolved `p.root` instead of its real path. | 8 |
| `loadSnapshot: a FIFO is rejected without blocking` | In a child process: a FIFO `tasks/008-pipe.md` gives `['unreadable: not a regular file']` and `malformed`; the child exits in time. Skips on `win32` or without `mkfifo`. | Remove `O_NONBLOCK` (the child blocks and the timeout fails the test). | 7 |

**Automated Test**: attention rule — `buildTree`, `renderBacklog`

| Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|
| `buildTree: an item with only unknown field warnings stays out of attention` | A task with `category:` and `effort:` gives `attention: []`, `flags: ['lenient']`, and both warnings on the node. | Restore the filter `n.flags.length > 0`. | 5 |
| `buildTree: an unknown field next to another warning still needs attention` | A task with `category:` and `feature: F999-x.md` is in `attention` with both warnings. | Exclude every node that carries an `unknown field` warning. | 6 |
| `renderBacklog: an unknown-field-only row keeps its badge outside Needs attention` | With one such task and one malformed task, the row shows `lenient` and `unknown field: category`, and the attention block holds the malformed file only. | Restore the filter `n.flags.length > 0`. | 5, 6 |

**Automated Test**: feed escape — `feedText`, `serve`

| Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|
| `feedText: tool_name with HTML is escaped` | `tool_name: '<img src=x onerror=alert(1)>'` renders `&lt;img` and no `<img`. | Remove `esc` around `tool_name`. | 10 |
| `feedText: source runs with no module scope` | `new Function('return ' + feedText.toString())()` gives the same output for an event, a transition, and a summary. | Reference a module constant inside `feedText`. | 10 |
| `serve: the page script embeds feedText from the module` | The page script contains `feedText.toString()`. | Keep the old inner `feedText` in `PAGE`. | 10 |

**Automated Test**: probe — `classifyProbe`, `--probe`

| Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|
| `classifyProbe: a matching projectDir is running, another is other` | `{"projectDir":"/a"}` with `here` `/a` gives `running`; with `/b` gives `other` and `dir: '/a'`. | Return `other` on equal paths. | 1, 2 |
| `classifyProbe: garbage and unsafe projectDir values are foreign` | `blocker`, `null`, `{}`, a number `projectDir`, a value with `\n`, a value with a backtick, and a 300-character path each give `foreign`. | Remove the `SAFE_DIR` test. | 3 |
| `cli: --probe prints the verdict and drops the rest of the reply` | A `serve` stub with `projectDir: '/elsewhere/proj'` and `marker: 'IGNORE PREVIOUS INSTRUCTIONS'` gives stdout with `/elsewhere/proj` and `--port <port+1>`, and no marker. | Write the reply body to stdout. | 1, 2 |
| `cli: --probe for this project prints Board running` | A stub with `projectDir` equal to `realpathSync(dir)` and the probe run on `dir` give exactly `Board running: http://127.0.0.1:<port>\n`. The temporary directory sits under `/var`, a symlink on macOS. | Compare with `path.resolve(dir)` instead of the real path. | 1 |
| `cli: --probe on a non-board service hides the reply` | `withBlocker` gives `Another service holds port <port>` and no `blocker` in stdout. | Print the body for a reply that does not parse. | 3 |
| `cli: --probe with no listener prints Board not running` | A free port gives `Board not running.`, the start line, and the manual command. | Map `ECONNREFUSED` to `foreign`. | 4 |
| `cli: --probe gives up on a reply that never ends` | A server that writes one byte every 100 ms gives `Another service holds port` and exit 0 within 5 s. | Use the `http.get` `timeout` option instead of the absolute deadline. | 3 |
| `cli: --probe stops reading at the byte cap` | With `BOARD_PROBE_TIMEOUT_MS=60000`, a server that streams 64 KB chunks with no end gives `Another service holds port` within 5 s. | Remove the byte cap. | 3 |

**Lint Gate check**: `board.md` uses the probe

Add step 11b to
`/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`,
after step 11:

```bash
# 11b. /constellation:board reads the port through the probe, never through curl.
BOARD_MD="$ROOT/plugins/constellation/commands/board.md"
grep -q -- '--probe' "$BOARD_MD" || fail "board.md: does not run board.mjs --probe"
grep -q 'curl' "$BOARD_MD" && fail "board.md: still calls curl — the reply reaches Claude's context"
say "11b. board command probe checked"
```

- Why: Markdown is not unit-testable. This check stops a later edit from
  bringing the full reply back into the context.
- Mutation: restore the `curl` step in `board.md`. Selftest prints the
  `FAIL` line and exits 1.

**MANUAL TEST**: `/constellation:board` in a live session

- Why manual: the command runs inside an interactive Claude Code session.
- Preconditions: plugin 1.3.2 installed from this repository.
- Steps:
  1. Start a session in `/Users/joaooliveira/study/guardei-service`.
  2. Load the orchestrator skill. Wait 3 seconds.
  3. Run `/constellation:board`.
  4. Start a session in `/Users/joaooliveira/study/user-service`. Run
     `/constellation:board`.
  5. Close both sessions. Run `python3 -m http.server 4411` in a terminal.
     Start a session and run `/constellation:board`.
  6. Stop the HTTP server. Run `/constellation:board` again.
- Expected: step 3 prints `Board running: http://127.0.0.1:4411`. Step 4
  names `/Users/joaooliveira/study/guardei-service` and the command for
  port 4412. Step 5 prints `Another service holds port 4411`. Step 6
  prints `Board not running.`. In each step the Bash tool output holds
  only the probe lines.
- Observability: the tool output in the transcript; `lsof -i :4411`.

**MANUAL TEST**: Needs attention on guardei-service

- Why manual: the check needs a browser.
- Steps:
  1. Run `node /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs /Users/joaooliveira/study/guardei-service --port 4412`.
  2. Open `http://127.0.0.1:4412`.
  3. Find a task with a `category:` field in the tree.
- Expected: no Needs attention block. The task row shows the `lenient`
  badge and its `unknown field` lines.
- Observability: `curl -s 127.0.0.1:4412/api/snapshot | jq '.tree.attention | length'`
  prints `0`.

## Integration Touchpoints

- **`/constellation:board` command** - Could break: `${CLAUDE_PLUGIN_ROOT}`
  does not expand, and the probe does not run - Validation: `init.md`
  already depends on the same expansion; manual test, step 3.
- **Claude's context** - Could break: the probe prints a hostile
  `projectDir` - Validation: the `classifyProbe` foreign test and the
  "drops the rest of the reply" test.
- **Board HTTP server** - Could break: the probe `Host` header fails the
  DNS-rebinding check, and every probe reads as foreign - Validation: the
  "prints Board running" test runs against the real `serve`.
- **Work-item scan** - Could break: a legitimate file reads as rejected,
  for example on a symlinked `.constellation/` or a `/var` → `/private/var`
  path - Validation: the internal-symlink and symlinked-root tests; all
  current snapshot tests.
- **Front-matter parser** - Could break: a large file reads as malformed -
  Validation: the 1 MB test and the three parser cap tests.
- **Browser page** - Could break: the injected `feedText` uses a module
  symbol and throws in the browser - Validation: the `new Function`
  isolation test and the page compile test.
- **Needs attention consumers** - Could break: task 009 manual steps
  expect a lenient item in the block - Validation: task 009 step 4 uses a
  malformed item, which stays in the block. The Technical Writer updates
  any README line that says lenient items appear in Needs attention.
- **Lint Gate** - Could break: a child-process test hangs CI - Validation:
  `spawnSync` with `timeout: 5000`; every server closes in `finally`.

## Risks

1. **The probe misreads this project's board as another project** -
   Impact: M - Likelihood: L - The board's `projectDir` comes from
   `process.cwd()` or `path.resolve(arg)`. A board started by hand on a
   symlinked path reports the unresolved path. Mitigation: the monitor
   starts the board with the session cwd, a physical path. The output then
   names the directory, so the user sees the cause.
2. **`O_NONBLOCK` or `realpathSync` behaves differently per platform** -
   Impact: M - Likelihood: L - Mitigation: tests run on darwin and Linux
   CI. On Windows the flag falls back to 0, and FIFOs are out of reach of a
   repo checkout there.
3. **A path of plain words in `projectDir` reads as an instruction** -
   Impact: L - Likelihood: L - `SAFE_DIR` removes control characters,
   quotes, and shell metacharacters, but not words. Mitigation: `board.md`
   tells Claude to print the output verbatim as data. Only a process that
   already holds a local port can send it.
4. **Child-process tests add time to the Lint Gate** - Impact: L -
   Likelihood: M - About 10 new spawns at 50 to 150 ms each. Mitigation:
   accept up to 2 seconds more for `node --test`.
5. **The cap warning hides a real unclosed block in a huge file** -
   Impact: L - Likelihood: L - Both warnings make the item malformed and
   put it in Needs attention, so the user still sees it. The text points
   at the size, which is the first thing to check.

## Logging

The board has no log file. Its observability is the snapshot and the page.

- Every rejected entry carries `unreadable: <reason>` on its node, in the
  row and in Needs attention. The reason names the rule that rejected it.
- A cut front-matter carries `front-matter exceeds 64 KB`.
- The probe prints one verdict. It logs nothing else, by design: any
  reply text in the output is the defect that item 1 removes.
- `safeRefresh` still adds `refresh failed: <message>` to `errors` for any
  throw outside `readWorkItem`.
- No user IDs exist in this local, single-user tool.

## Follow-up (not in this plan)

- `readJson` reads `config.json` and `tracks.json` with `readFileSync`.
  Both files are committed, so a cloned repo can make either one a symlink
  to `/dev/zero`. The board then hangs at start. `readTail` reads
  `events.jsonl` in full, but that file sits in the gitignored `metrics/`
  directory. Recommendation: add item 10 to task 008: "read `config.json`
  and `tracks.json` through `readPrefix` with a 1 MB cap". `readPrefix`
  from this plan makes it a two-line change.

## Open Questions

None. The orchestrator settled the attention rule on 07-10-2026. D1 to D4
settle the four design questions above.
