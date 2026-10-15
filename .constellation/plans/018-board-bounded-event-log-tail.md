---
status: approved
task: 018-board-bounded-event-log-tail.md
date-created: 15-10-2026
last-edit: 15-10-2026
---
# Board reads the event log with a bounded, contained tail (task 018)

## Overview

**Problem**: Two reads in `board.mjs` still follow a path that a committed
repo controls.

1. `readTail` reads `metrics/events.jsonl` with `readFileSync`. There is
   no containment and no size cap. A committed `events.jsonl` symlink to
   `/dev/zero` hangs the board at start. Plan 014 listed this as a known
   limitation of release 1.3.3.
2. `scanWorkItems` lists each work directory as given. A committed
   `.constellation/tasks` (or `epics`, `features`, `plans`) symlink to
   `$HOME` or `/` lists that directory. Each `*.md` name then shows on the
   local page with `unreadable: outside .constellation`. `signature` lists
   the same directory every 1.5 s, and `watch.arm` puts an `fs.watch` on
   it.

**Impact**: A hostile clone can no longer hang the board through the event
log, and can no longer make the board list, stat, or watch a directory
outside `.constellation`. The page shows one error line per refused path.

**Scope**:

- In: `readTail`, a shared opener for `readPrefix` and `readTail`,
  `scanWorkItems`, `signature`, `watch.arm`, `loadSnapshot`, and their
  tests. One CHANGELOG entry under `[Unreleased]`.
- Out: task 019 (`openEvents` helper and the per-read buffer of
  `readPrefix`); task 020 (`ownsProject` owner walk, release 1.3.4); task
  017; any change to `selftest.sh`, `board.md`, or the page script; the
  four file stamps in `signature` (see D5).

**Blocks**: the close of task 018. Task 020 follows in its own workflow.
**Blocked By**: nothing. Task 016 is on `main` at 647b6d2.

**Track**: purely technical work on internal harness tooling. No PM
pairing.

**Version**: no bump. The Technical Writer adds the entry under
`## [Unreleased]`. Task 020 cuts 1.3.4.

## Acceptance Criteria

The task file holds the BDD criteria. This section repeats them and adds
technical notes.

1. **Contained event log.** Given `.constellation/metrics/events.jsonl` as
   a symlink to `/dev/zero` or to a file outside `.constellation`, or
   `.constellation/metrics` as a symlink to a directory outside
   `.constellation`, when the board refreshes, then the refresh completes,
   `errors` holds `events.jsonl: unreadable: outside .constellation`, and
   `agents` and `activity` are empty.
   - Note: D1 and D3. `containedReal` resolves the full file path, so a
     `metrics` directory symlink fails the same check as a file symlink.
     No separate rule for `metrics` is necessary.
2. **Regular file only.** Given an `events.jsonl` that is a directory or a
   FIFO, when the board refreshes, then the refresh completes and `errors`
   holds `events.jsonl: unreadable: EISDIR` or
   `events.jsonl: unreadable: not a regular file`.
   - Note: D1. The shared opener gives the event log the same `fstat`
     checks as the work items. `O_NONBLOCK` keeps a FIFO from a block.
3. **Bounded window.** Given an `events.jsonl` larger than 256 KB, when the
   board refreshes, then the board reads only the last 256 KB, drops the
   first line of that window because the window cuts it, and shows the
   newest events. The snapshot holds no error and no warning for the size.
   - Note: D2. A cut is normal for a tail. The head reads warn on a cut
     because a cut there loses data that the page needs. A cut tail loses
     only old events that `EVENT_TAIL` drops anyway.
4. **Small files unchanged.** Given an `events.jsonl` of at most 256 KB,
   when the board refreshes, then every line of the file shows, the first
   line included. Given no `events.jsonl`, then `errors` holds no entry for
   it.
   - Note: D2. The first-line drop applies only when the read starts after
     offset 0. `ENOENT` stays silent, as in `readJson`.
5. **Contained work directories.** Given `.constellation/tasks`, `epics`,
   `features`, or `plans` as a symlink to a directory outside
   `.constellation`, when the board refreshes, then the tree holds no item
   from that directory, no file name from that directory appears anywhere
   in the snapshot, and `errors` holds `<dir>: unreadable: outside
   .constellation` once per directory.
   - Note: D4. `<dir>` is the base name: `tasks`, `epics`, `features`, or
     `plans`. The order in `errors` is the `WORK_DIRS` order, after the
     file errors.
6. **Not watched, not polled.** Given such a symlink, when a new `*.md`
   file appears in its target directory, then the board does not refresh
   because of it: the server neither watches that directory nor lists it
   in the poll signature.
   - Note: D5.
7. **Internal symlinks kept.** Given a work directory symlink to a
   directory inside `.constellation`, when the board refreshes, then its
   files parse as in 1.3.3, with no warning and no error.
   - Note: D4. The rule is the real path, not the link type.
8. **No regression.** Given the change, when the Lint Gate runs, then the
   125 current tests in `board.test.mjs` pass with no edit, the 7 new tests
   pass, and `scripts/selftest.sh` prints `selftest: ALL GREEN`.

## Design decisions

### D1 — One opener for the head read and the tail read

Choice: extract the open sequence of `readPrefix` into
`openContained(root, file)`. It returns `{ fd, st }`. The caller closes
`fd` in `finally`.

```js
/**
 * Open one contained regular file for a bounded read. The real path must stay inside the real
 * .constellation/ root, and the open descriptor must be a regular file. O_NONBLOCK keeps the open
 * of a FIFO from blocking the event loop. O_NOFOLLOW makes a swap of the final component to a
 * symlink after the real-path check fail with ELOOP. Throws an Error whose code names the reason.
 * The caller owns fd and closes it.
 */
function openContained(root, file) {
  const real = containedReal(root, file);
  const fd = fs.openSync(real, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const st = fs.fstatSync(fd);
    if (st.isDirectory()) throw rejected('EISDIR');
    if (!st.isFile()) throw rejected('not a regular file');
    return { fd, st };
  } catch (e) {
    fs.closeSync(fd);
    throw e;
  }
}
```

`readPrefix` keeps its signature and its read loop. It calls
`openContained` in place of its own open and `fstat` lines. The current
work-item tests for `EISDIR`, the FIFO, and `/dev/zero` then guard the
opener for both readers.

Reasons:

- The containment, the flags, and the two `fstat` checks are one rule. A
  copy in `readTail` is a second place to get it wrong.
- Task 019 changes the buffer argument of `readPrefix`, not its open. The
  two changes do not touch the same lines.

Rejected: a `readTail` that calls `readPrefix` with a large buffer. It
reads the head, so a file above the cap loses the newest events, which
are the ones the page shows.

### D2 — Tail read: positional reads of the last `TAIL_CAP_BYTES`

Constant: `export const TAIL_CAP_BYTES = 256 * 1024;` next to
`JSON_CAP_BYTES`. The export lets the tests build a file around the exact
boundary, as `READ_CAP_BYTES` does for the front-matter tests.

Relation to the other caps: three constants bound three different things.
`READ_CAP_BYTES` (64 KB) bounds a work item and feeds `CAP_WARNING`.
`JSON_CAP_BYTES` (1 MB) bounds a JSON document. `TAIL_CAP_BYTES` (256 KB)
bounds a window of event lines. A change to one must not move another, so
no constant derives from another. `EVENT_TAIL` (200 lines) stays the line
cap after the byte cap. A typical event line is under 200 bytes, so the
window holds more than 1000 lines, well above `EVENT_TAIL`.

New `readTail(root, file, maxLines)` returns `{ text, error }`:

| Input | Result |
|---|---|
| `root` is `null` | `{ text: '', error: null }` |
| `openContained` throws `ENOENT` | `{ text: '', error: null }` |
| `openContained` throws another code | `{ text: '', error: 'unreadable: <code>' }` |
| Regular file, size 0 | `{ text: '', error: null }` |
| Regular file, size at most the cap | all lines, then the last `maxLines` as today |
| Regular file, size above the cap | the last cap bytes, minus the first line of the window, then the last `maxLines` |

Read sketch (the engineer owns the final form):

```js
function readTail(root, file, maxLines) {
  if (!root) return { text: '', error: null };
  let fd, st;
  try {
    ({ fd, st } = openContained(root, file));
  } catch (e) {
    return { text: '', error: e.code === 'ENOENT' ? null : `unreadable: ${e.code ?? 'error'}` };
  }
  try {
    const start = Math.max(0, st.size - TAIL_CAP_BYTES);
    const buffer = Buffer.alloc(Math.min(st.size, TAIL_CAP_BYTES));
    let n = 0;
    for (let r = 1; r > 0 && n < buffer.length; n += r) r = fs.readSync(fd, buffer, n, buffer.length - n, start + n);
    let text = buffer.toString('utf8', 0, n);
    if (start > 0) {
      const nl = text.indexOf('\n');
      text = nl < 0 ? '' : text.slice(nl + 1);
    }
    const lines = text.split('\n');
    return { text: lines.slice(Math.max(0, lines.length - maxLines - 1)).join('\n'), error: null };
  } finally {
    fs.closeSync(fd);
  }
}
```

Rules in the sketch:

- The read is positional. The fifth argument of `readSync` is
  `start + n`, so the loop never moves the file offset and never reads
  the head.
- The buffer size is `min(size, cap)`. A small log allocates a small
  buffer. The loop stops at the buffer end or at a zero read, so a file
  that grows after `fstat` cannot overflow, and a file that shrinks ends
  the loop early.
- When `start > 0`, the first line of the window is a cut line, or a
  whole line by chance. The reader cannot tell which, so it drops the
  window up to and after the first `\n`. A window with no `\n` is one cut
  line, so it becomes empty. A read at offset 0 drops nothing.
- The cut can also land inside a multi-byte UTF-8 character. The dropped
  first line carries that character, so the kept text is valid.
- The line slice is the current one. `parseEventLines` skips the empty
  last element that the final newline leaves.
- The buffer is allocated per read, not shared at module level. Task 019
  names the shared buffer as a hazard. One allocation of at most 256 KB
  per refresh is cheap: refreshes are debounced at 150 ms. This does not
  block task 019, which can later give `readPrefix` the same shape.

### D3 — Event-log errors follow the `readJson` table

`loadSnapshot`:

```js
const eventsR = readTail(root, p.events, EVENT_TAIL);
if (eventsR.error) errors.push(`events.jsonl: ${eventsR.error}`);
const { agents, activity, helperStops } = pairEvents(parseEventLines(eventsR.text));
```

The page already renders `errors` in its `.errs` block, so a refused
event log names its cause instead of a silent "No events yet". A missing
file stays silent, because a project with no events is normal. The push
comes after the `current-workflow.json` error and before the directory
errors of D4, so `errors` has a fixed order: `tracks.json`,
`config.json`, `current-workflow.json`, `events.jsonl`, then the work
directories.

### D4 — Directory containment: `containedReal` accepts the root itself

Choice: no new containment helper. `containedReal(root, file)` gains one
case: the real path may equal `root`.

```js
/** The real path of an entry, file or directory, that lies at or under the real .constellation/ root. */
function containedReal(root, file) {
  const real = fs.realpathSync(file);
  if (real !== root && !real.startsWith(root + path.sep)) throw rejected('outside .constellation');
  return real;
}
```

Reasons:

- The rule for a directory is the rule for a file: resolve, then require
  the real root as a prefix. One function, one rule.
- `watch.arm` arms `p.root` itself. Without the equality case, the root
  would fail its own check.
- The equality case is harmless for file callers. `readPrefix` and
  `openContained` run `fstat` after the open, and a root passed as a file
  fails with `EISDIR`. `hasHarness` passes `config.json`, which never
  equals the root. Task 020 changes `ownsProject`, which calls
  `hasHarness`; it does not depend on the strict prefix.

`scanWorkItems(p, root)` returns `{ nodes, errors }`:

```js
function scanWorkItems(p, root) {
  const nodes = [];
  const errors = [];
  if (!root) return { nodes, errors };
  for (const [kind, key] of WORK_DIRS) {
    let dir, names;
    try {
      dir = containedReal(root, p[key]);
      names = fs.readdirSync(dir).sort();
    } catch (e) {
      if (e.code !== 'ENOENT') errors.push(`${path.basename(p[key])}: unreadable: ${e.code ?? 'error'}`);
      continue;
    }
    for (const name of names.filter(isWorkFile)) {
      const node = readWorkItem(kind, dir, name, root);
      if (node) nodes.push(node);
    }
  }
  return { nodes, errors };
}
```

- `readdirSync` lists the real path, as `readPrefix` opens the real path.
  `readWorkItem` gets the real directory. The per-file `containedReal` in
  `readPrefix` stays as the second check.
- One rule for failures, the same as `readJson`: `ENOENT` is silent, and
  every other code names itself. A refused symlink gives
  `tasks: unreadable: outside .constellation`. This also reports a
  `tasks` entry that is a regular file (`ENOTDIR`) or unreadable
  (`EACCES`), which 1.3.3 skips in silence. The CHANGELOG names this.
- Behavior change for a work directory symlink that leaves
  `.constellation`: 1.3.3 lists each name with
  `unreadable: outside .constellation` on its row. Now the directory
  yields no row and one error line. A symlink to a directory inside the
  project but outside `.constellation` already fails per file in 1.3.3,
  so no working layout stops.

`loadSnapshot`:

```js
const scan = scanWorkItems(p, root);
errors.push(...scan.errors);
const tree = buildTree(scan.nodes, state);
```

### D5 — `watch` and `signature` take the live root

`fathomDir` takes the root and uses `containedReal`:

```js
/** True when dir resolves to a directory at or under the root. Missing, outside, or not a directory gives false. */
function fathomDir(root, dir) {
  if (!root) return false;
  try { return fs.statSync(containedReal(root, dir)).isDirectory(); } catch { return false; }
}
```

In `watch`:

- `const liveRoot = () => resolveRoot(projectDir).root;`
- `arm(root, dir)` returns early on `!fathomDir(root, dir)`. The
  `watchers` map stays keyed by the path text, so a symlink that later
  points inside the root arms on the next `armAll`.
- `armAll(root = liveRoot())` passes the root to each `arm`. The watch
  callbacks call `armAll()` with no argument.
- The poll body resolves the root once:
  `const root = liveRoot(); armAll(root); const next = signature(p, root);`.
  The initial `sig` uses `signature(p, liveRoot())`.

In `signature(p, root)`, `dirStamp(dir)` returns `'-'` when
`!fathomDir(root, dir)`, before the `readdirSync`. The four file stamps
(`state`, `events`, `tracks`, `config`) stay as they are: `statSync` reads
metadata only, never content, and those stamps are what lets the poll
notice a root that changes from refused to accepted. A root that
`resolveRoot` refuses arms nothing and stamps every directory as `'-'`;
the poll still runs.

Cost: `resolveRoot` (two `realpathSync`) plus seven `realpathSync` and
seven `statSync` per 1.5 s poll tick. Negligible.

## Implementation

All code changes land in
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs`
(1146 lines, about 1195 after the change).

### Functions and line deltas

| Function or symbol | Change | Lines |
|---|---|---|
| Constants (line 34) | Add `export const TAIL_CAP_BYTES = 256 * 1024;` (D2). | +1 |
| `containedReal` (lines 533-538) | Accept `real === root`; comment names files and directories (D4). | +1 |
| `openContained(root, file)` | New, after `containedReal`. Open, `fstat`, both checks, close on throw (D1). | +18 |
| `readPrefix` (lines 569-588) | Call `openContained`; keep the loop and the result (D1). | -6 |
| `scanWorkItems` (lines 602-615) | `containedReal` before `readdirSync`; return `{ nodes, errors }` (D4). | +6 |
| `readTail` (lines 635-642) | Rewrite per D2: `(root, file, maxLines)` returns `{ text, error }`. | +18 |
| `loadSnapshot` (lines 672-673) | `eventsR` and its error; `scan.errors` and `scan.nodes` (D3, D4). | +4 |
| `watch` (lines 699-742) | `liveRoot`, `arm(root, dir)`, `armAll(root)`, poll body, `signature(p, root)` (D5). | +4 |
| `fathomDir` (lines 744-746) | `(root, dir)` through `containedReal` (D5). | +1 |
| `signature` (lines 748-759) | `(p, root)`; `dirStamp` returns `'-'` when not contained (D5). | +1 |

No change to `paths`, `readJson`, `resolveRoot`, `hasHarness`,
`readWorkItem`, `serve`, the page, the probe, or `main`.

### Other files

| File | Change | Lines |
|---|---|---|
| `/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs` | Import `TAIL_CAP_BYTES`. Seven new tests (below). No current test changes. | +120 |
| `/Users/joaooliveira/study/constellation-harness/.constellation/tasks/018-board-bounded-event-log-tail.md` | Acceptance criteria and `status: refined`. Done by the architect. | — |
| `/Users/joaooliveira/study/constellation-harness/CHANGELOG.md` | Entry under `[Unreleased]`. Technical Writer at Gate 2. | — |

`scripts/selftest.sh` needs no change. Step 11 already runs every
`*.test.mjs` file.

### Data flow

- Events: `loadSnapshot` → `readTail(root, p.events, EVENT_TAIL)` →
  `openContained` → `containedReal` + `O_NOFOLLOW` open + `fstat` →
  positional reads of the last cap bytes → first-line drop → line slice →
  `parseEventLines` → `pairEvents`. An error becomes
  `events.jsonl: unreadable: <code>`.
- Work items: `loadSnapshot` → `scanWorkItems(p, root)` → per directory
  `containedReal` → `readdirSync(real)` → `readWorkItem` →
  `readPrefix` → `openContained`. A refused directory becomes
  `<dir>: unreadable: outside .constellation`.
- Watch: `armAll(root)` → `fathomDir(root, dir)` → `fs.watch` on
  contained directories only. Poll: `signature(p, root)` → `dirStamp`
  returns `'-'` for a refused directory.

### Effect on task 020

Task 020 rewrites `ownsProject`, which calls `hasHarness`, which calls
`containedReal` on `config.json`. The equality case of D4 does not change
the result for a file path. Task 020 needs no adaptation. Task 020 should
not reuse `containedReal` for its owner walk: the walk needs `lstatSync`
per component, and `containedReal` resolves the whole path at once.

## Validation

Follow `constellation:test-verified-development`. Use the per-function
mutation variant: apply the mutation, run the file, confirm that the named
test fails for the intended reason, then restore the code.

- Run: `node --test /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs`
- Lint Gate: `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`
- Mocking: none. Fixtures are temporary directories, real symlinks, real
  local sockets, and one child process.
- Hang safety: the `/dev/zero` event-log test runs in-process. Containment
  refuses `/dev/zero` before the open. With containment removed, `fstat`
  refuses the character device. With both removed, `st.size` of
  `/dev/zero` is 0, so the read loop reads 0 bytes. No mutation of the new
  code can hang the test process. The one mutation that hangs is the
  restore of `readFileSync`; run that mutation under `timeout 30`.

All 125 current tests pass on `main` at 647b6d2.

**Automated Test**: the event-log tail — `readTail`, `openContained`

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 1 | `loadSnapshot: events.jsonl as a symlink to /dev/zero is refused without a read` | Skips without `/dev/zero`. `metrics/events.jsonl` → `/dev/zero`. `errors` is exactly `['events.jsonl: unreadable: outside .constellation']`; `agents` and `activity` are `[]`. | (a) Restore `readFileSync` (the run hangs; `timeout` kills it). (b) Remove `containedReal` from `openContained` (the error becomes `not a regular file`). | 1 |
| 2 | `loadSnapshot: events.jsonl keeps the last 256 KB and drops the cut first line` | File layout below. `agents` maps to `['new']` only. The file is above the cap, and the test pins the layout: `size - TAIL_CAP_BYTES` equals the offset of the cut line's `{`. | (a) Read from offset 0 (`old` appears). (b) Skip the first-line drop (`cut` appears). | 3 |
| 3 | `loadSnapshot: a metrics symlink that leaves the project reads no events` | `.constellation/metrics` → an outside directory that holds an `events.jsonl` with one `SubagentStart` line. `errors` is exactly `['events.jsonl: unreadable: outside .constellation']`; `agents` is `[]`. Runs on every platform. | Open `file` directly in `readTail` instead of through `openContained` (one agent appears). | 1 |
| 4 | `loadSnapshot: an events.jsonl directory is an error, not a feed` | `mkdir metrics/events.jsonl`. `errors` is exactly `['events.jsonl: unreadable: EISDIR']`; `agents` is `[]`. | Return `{ text: '', error: null }` on every throw, as 1.3.3 does (`errors` is `[]`). | 2 |

Layout for test 2, ASCII only, so bytes equal characters:

```js
const line = (ts, id) => `{"ts":"2026-10-03T10:00:0${ts}Z","event":"SubagentStart","agent_id":"${id}","agent_type":"x"}`;
const old = line(0, 'old');
const last = line(2, 'new');
const cutHead = '{"ts":"2026-10-03T10:00:01Z","event":"SubagentStart","agent_id":"cut","agent_type":"x","pad":"';
const cut = cutHead + 'p'.repeat(TAIL_CAP_BYTES - last.length - 2 - cutHead.length - 2) + '"}';
const file = `${old}\n${'x'.repeat(10)}${cut}\n${last}\n`;
assert.equal(Buffer.byteLength(file) - TAIL_CAP_BYTES, old.length + 1 + 10, 'layout: the window starts at the cut line');
```

The window is `cut\nlast\n`, exactly `TAIL_CAP_BYTES` bytes, and starts
at the `{` of `cut`. With the drop, the text is `last\n`. Without the
drop, `cut` parses as a valid event. Without the cap, `old` parses too.

Current tests that guard the tail with no edit:

- `loadSnapshot: tails events.jsonl and skips partial lines`: a file under
  the cap keeps its first line. Mutation: drop the first line at offset 0
  too; `agents.length` becomes 0.
- `loadSnapshot: no state file is a normal empty state`: no `events.jsonl`
  gives `errors: []`. Mutation: report `ENOENT`; the assertion fails.
- `loadSnapshot: an unreadable entry is malformed with its code` and
  `loadSnapshot: a FIFO is rejected without blocking`: the shared opener
  keeps `EISDIR` and `not a regular file` for work items.

**Automated Test**: directory containment — `scanWorkItems`, `watch`, `signature`

| # | Test name | Proves | Mutation that must fail it | Criterion |
|---|---|---|---|---|
| 5 | `loadSnapshot: a work directory symlink that leaves the project is skipped with one error` | In one project, `epics`, `features`, `tasks`, and `plans` each → its own outside directory that holds `001-a.md`. `tree.epics`, `tree.orphanFeatures`, `tree.tasks`, and `tree.orphanPlans` are `[]`. `errors` is exactly `['epics: unreadable: outside .constellation', 'features: …', 'tasks: …', 'plans: …']`. `JSON.stringify(snap)` does not hold `001-a.md`. | Call `readdirSync(p[key])` without `containedReal` (four rows appear with `unreadable: outside .constellation`, and `errors` is `[]`). | 5 |
| 6 | `loadSnapshot: a work directory symlink inside .constellation reads its files` | `tasks` → `<root>/archive/tasks`, which holds `001-a.md`. The node has `status: 'inbox'`, `warnings: []`; `errors` is `[]`. | Refuse any work directory whose `lstat` is a symlink (the node is gone, and `errors` has one entry). | 7 |
| 7 | `cli: a work directory that leaves the project is neither listed nor watched` | `tasks` → an outside directory with `001-a.md`. Start `--quiet` on a free port. The first snapshot has `errors` exactly `['tasks: unreadable: outside .constellation']`, `tree.tasks` `[]`, and no `001-a.md` in its JSON. Write `002-b.md` into the outside directory. `waitFor` a snapshot whose `at` differs from the first, with a 3000 ms deadline, returns `null`. | (a) Arm without `fathomDir(root, dir)` (`fs.watch` fires within 150 ms; `at` changes). (b) `dirStamp` lists without the check (the poll fires within 1650 ms; `at` changes). | 5, 6 |

Test 7 waits the full 3 s only when the server stays quiet, which is the
pass. That is the dwell pattern of plan 015, D1. The 3000 ms deadline
covers `POLL_MS` plus `DEBOUNCE_MS` plus the load with margin. The test
uses `spawnBoard`, `freePort`, `waitForSnapshot`, and `waitFor` as they
are. No new helper.

The current test
`cli: a task status edit reaches the snapshot feed with its timestamp` is
the positive guard: a contained directory still fires a refresh.

Count: 7 new tests. `board.test.mjs` goes from 125 to 132 tests.

**MANUAL TEST**: none. Every criterion has a deterministic automated test.
The board has no user-visible surface beyond the snapshot and the page,
and the page renders `errors` as before.

## Integration Touchpoints

- **Event feed on the page** - Could break: a real `events.jsonl` above
  256 KB shows fewer events than before - Validation: `EVENT_TAIL` keeps
  200 lines, and 256 KB holds more than 1000 typical lines; test 2 shows
  the newest line survives.
- **Work-item scan** - Could break: a project with a work directory
  symlink loses its rows - Validation: a symlink inside `.constellation`
  stays (test 6); one outside already failed per file in 1.3.3 (D4).
- **Error list order** - Could break: a test that pins `errors` with
  `deepEqual` sees a new entry - Validation: the new entries appear only
  on refused paths; the 125 current tests pass with no edit.
- **Watch and poll** - Could break: a contained directory no longer fires
  a refresh - Validation: the current status-edit CLI test; test 7 for
  the refused case.
- **Task 019** - Could break: both tasks edit `readPrefix` - Validation:
  D1 touches the open lines; task 019 touches the buffer argument. The
  plan for task 019 reads the merged `readPrefix` first.
- **Task 020** - Could break: the `containedReal` equality case changes
  `hasHarness` - Validation: `config.json` never equals the root; the
  current `--quiet` tests pass.

## Risks

1. **The byte-exact layout of test 2 drifts with an edit of the fixture
   lines** - Impact: L - Likelihood: M - Mitigation: the test pins the
   layout with its own assertion before it calls `loadSnapshot`, so a
   drift fails with a clear message.
2. **Test 7 is slow (3 s) or flaky** - Impact: L - Likelihood: L -
   Mitigation: nothing in the test touches `.constellation`, so no watcher
   fires on pass. The dwell is the accepted pattern of plan 015. The suite
   goes from about 5 s to about 8 s.
3. **A refresh allocates 256 KB** - Impact: L - Likelihood: L -
   Mitigation: the buffer is `min(size, cap)`, refreshes are debounced, and
   task 019 moves `readPrefix` in the same direction.
4. **A reported `ENOTDIR` or `EACCES` on a work directory surprises a
   user** - Impact: L - Likelihood: L - Mitigation: the line names the
   directory and the code; the CHANGELOG lists the change.
5. **`O_NOFOLLOW` or `O_NONBLOCK` is undefined on a platform** - Impact:
   L - Likelihood: L - Mitigation: the `?? 0` fallback stays, unchanged
   from 1.3.3.

## Logging

The board has no log file. Its observability is the snapshot and the page.

- A refused or capped event log: `events.jsonl: unreadable: <code>` in
  `errors`, rendered in the page `.errs` block.
- A refused work directory: `<dir>: unreadable: outside .constellation`
  in `errors`.
- A work directory that is a file or unreadable: `<dir>: unreadable:
  ENOTDIR` or `<dir>: unreadable: EACCES`.
- A missing event log or a missing work directory: silent, by design.
- A cut tail window: silent, by design (D2).
- `--quiet` stays silent on every refusal: the monitor runs in every
  session.
- No user IDs exist in this local, single-user tool.

## Release notes for the Technical Writer

Add to `## [Unreleased]` in
`/Users/joaooliveira/study/constellation-harness/CHANGELOG.md`. Do not
bump `plugin.json` or `marketplace.json`; task 020 cuts 1.3.4.

Under `### Security`:

- **The board reads the event log through a bounded, contained tail**
  (#018). `metrics/events.jsonl` must resolve inside `.constellation/` and
  be a regular file. The board reads at most the last 256 KB, with
  `O_NOFOLLOW`, and drops the first line of the window when the window
  cuts it. A refused file shows `events.jsonl: unreadable: <reason>` and
  an empty feed. This closes the 1.3.3 known limitation.
- **The board lists, polls, and watches only work directories inside
  `.constellation/`** (#018). `epics/`, `features/`, `tasks/`, and
  `plans/` must resolve inside the real root. A refused directory shows
  one line, `<dir>: unreadable: outside .constellation`, and none of its
  file names.

Under `### Changed`:

- **Behavior change: a work directory symlink that leaves
  `.constellation/` shows one error line instead of one row per file**
  (#018). 1.3.3 listed each name with `unreadable: outside
  .constellation`. A symlink to a directory inside `.constellation/` still
  works.
- **Behavior change: a work directory that is not a directory, or is
  unreadable, shows `<dir>: unreadable: <code>`** (#018). 1.3.3 skipped it
  in silence. A missing directory stays silent.
- The test count grows from 125 to 132.

Under `### Known limitations`, remove the `018-…` line from the list of
open follow-up tasks when the writer carries that list forward.

## Open Questions

None.
