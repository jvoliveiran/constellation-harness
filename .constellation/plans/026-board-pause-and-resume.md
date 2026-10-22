---
status: approved
task: 026-board-pause-and-resume.md
scope-approved-by: product-manager, software-architect
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board UI: pause and resume a workflow from the page (task 026)

## Overview

**Problem**: The user watches the board and sees a step go wrong. The user
has no way to stop the session from the page. Claude Code has no external
pause and no prompt injection.

**Impact**: A Pause click stops the session at its next tool call. A Resume
click within the hold continues the session with no typing. The user
reads output or edits a file in the gap.

**Scope in**: the `pause-guard.sh` PreToolUse hook and its `hooks.json`
entry; the control file `state/control.json`; `POST /api/control`; the
Pause and Resume controls, the toast, and the `● live` item on the page;
the `⏸ paused` statusline modifier; the orchestrator rule and command
row; a note in `commands/resume.md`; the README, spec, and CHANGELOG
updates; the tests.

**Scope out**: a resume after a denied hold with no typing (task 043);
the `workflow-paused` metrics event (task 044); tasks 041 and 042 (session
reader); any other write from the board; a version bump; the merge of the
PR. The user validates F001 and starts the 1.4.0 release later.

## Ground truth: the hook contract (checked on 21-10-2026)

Claude Code 2.1.285 at `/opt/homebrew/Caskroom/claude-code/2.1.285/`. Two
sources: the hooks reference at https://code.claude.com/docs/en/hooks, and
a headless probe in the scratchpad (`hookprobe/`, `claude -p --model
haiku --settings <file>` with a logging hook on `PreToolUse`, matcher
`""`).

| Fact | Source | Result |
|---|---|---|
| A PreToolUse command hook runs synchronously. The tool waits for the hook. | docs: "PreToolUse runs synchronously and blocks tool execution"; probe: hook 615→620 s, tool ran at 631 s | A sleep in the hook holds the call. |
| Default `timeout` of a command hook | docs: 600 s. `timeout` is in seconds, per hook entry. | We set `"timeout": 600` explicitly. |
| A PreToolUse hook that times out | docs: "a timed-out command … hook doesn't block the tool call"; probe: `timeout: 3`, sleep 10 → the tool ran | **The tool runs at the timeout.** The hold must end, with a deny, before 600 s. |
| Deny contract | docs + probe | Exit 0 and stdout `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`. The tool does not run. The model receives the reason text verbatim. |
| Subagents | docs: "Tool events (PreToolUse …) fire the same hooks as the main conversation"; probe: the subagent `Bash` call reached the hook with `agent_id` and `agent_type`; the parent `Agent` call reached it with `agent_id: null` | One hook covers the session and its subagents. Each held call is a separate hook process. |
| Matching hooks of one event | docs: "its matching hooks run in parallel" | `guard-git.sh` and `pause-guard.sh` run side by side on Bash. A deny from either one blocks. |
| Matcher `""` | probe: matched `Bash` and `Agent` | The existing `hooks.json` convention works. |
| External pause or prompt injection | docs: none | Confirms the limit in the task. |
| Esc during a held hook | not documented | Manual check B9 records the behavior. No criterion depends on it. |

## Feasibility answer to the PM questions

- **Criterion 8 (deny at once when the file is older than
  `HOLD_SECONDS`)**: trivial. D3 anchors the hold deadline on the pause
  time (`since`), not on the call time. A call that arrives after the
  deadline gets a hold of zero seconds, which is the deny at once. One
  rule covers criteria 7 and 8. It also enforces the guardrail "no
  session waits more than one hold for one pause": every call of every
  session and subagent ends its hold at the same instant.
- **Known limit (subagent work after the last save point reruns)**:
  accepted. A denied subagent ends its run with partial edits in the work
  tree. `/constellation:resume` re-runs the current step in full (resume
  step 6). The checkpoint commits of the engineer keep the loss to one
  step. No mechanism in this task.

## Acceptance Criteria

The PM criteria 1 to 22 stay verbatim in
`/Users/joaooliveira/study/constellation-harness/.constellation/tasks/026-board-pause-and-resume.md`.
This plan adds technical notes under each group, and one safety
criterion (23) that the orchestrator brief asked for. Criterion 1 needs a
one-word PM text update (see note C1).

### Pause and resume on the page (1 to 4)

- C1: the file holds `paused: true`, `since`, `by: "board"`, **and
  `pid`** (the board process id). `pid` is the owner proof of criterion
  23. The task text "exactly `paused: true`, `since` and `by`" must read
  "exactly `paused`, `since`, `by` and `pid`". The tests pin the four
  keys.
- `since` is UTC with seconds and `Z`, from the server clock
  (`2026-10-21T14:02:11Z`). The chip shows `hh:mm` in local time.
- The header changes only through the next snapshot (the watcher, about
  150 ms). The page makes no optimistic change, so a 403 or 409 leaves
  the header as it was (criterion 3).
- The toast is new (spec §4.2): one line, bottom right, 4 s,
  `role="status"`.

### Hook `pause-guard.sh` (5 to 9)

- The hook holds only when the file passes the owner gate of criterion
  23. A file that fails the gate counts as no file: exit 0 at once.
- "Within 2 seconds" (6): the hold polls the file every 1 s.
- `HOLD_SECONDS` is read from `CONSTELLATION_HOLD_SECONDS` (a plain
  `HOLD_SECONDS` can collide with a user variable). A value that is not
  an integer from 1 to 590 falls back to 540. 590 keeps the hold 10 s
  under the 600 s timeout, where the tool runs (Ground truth).
- The deadline is `min(since, now) + HOLD_SECONDS` (D3). A `since` in the
  future, or unparsable, counts as `now`. No crafted `since` extends a
  hold.
- Criterion 9 timing: the fast path is three `test -f` checks before any
  `jq` or `cat`. The test measures the wall time with `perl`
  (`Time::HiRes`), and skips the timing assert when `perl` is absent.

### Orchestrator (10 to 11)

- The deny reason holds the marker sentence `Constellation board paused
  this workflow` and asks a subagent to put the sentence in its final
  report. This is how the marker reaches the orchestrator through an
  agent report (10).
- A selftest check pins the marker in the hook, the skill, and the spec,
  so the three never drift.

### Limits of the write (12 to 16)

- A request without `Origin` gets 403. A browser always sends `Origin`
  on a `fetch` POST.
- Status codes for criterion 13: 413 (body over 1024 bytes), 415 (media
  type other than `application/json`; a `charset` parameter is allowed),
  400 (not JSON, or an action other than `pause` and `resume`).
- `pause` while this board, or another live board, owns the file gets
  409 (`already paused`). A file whose owner is gone does not count: a
  pause replaces it.
- `GET /api/control` gets 405 with `allow: POST`.
- No field of the body reaches the file. A test sends `since` and `by`
  in the body and finds the server values in the file.

### Live indicator and terminal (17 to 18)

- `● live` is `connected` of the page (the `EventSource` state), never
  `snap.at`. Both live sources (watch plus 1.5 s poll, and the 5 s
  session poll) arrive as SSE frames on the same connection, so no source
  needs its own rule (carry-over 025 item 2).
- The statusline applies the same owner gate as the hook. A stale or
  crafted file shows no `⏸ paused`.

### Docs, tests, changelog (19 to 22)

- The count line reads `138 to <N> (#022, #023, #024, #025, #026), plus
  26 session-reader tests`, with `<N>` from the final `node --test` run.

### 23. Safety: a stale or committed control file is harmless (added by the architect)

**Given** `state/control.json` names a `pid` that is not a live process
whose command line holds `board.mjs`, or has no integer `pid`, or is not
`paused: true` with `by: "board"`, or is over 1 KB, or is a symlink,
**when** the session makes a tool call, **then** the hook exits 0 at
once and logs nothing, and the statusline shows no `⏸ paused`.

Why: a repository can commit `.constellation/state/control.json` with
`git add -f` (the `state/` ignore rule does not stop a tracked file). A
user can also close the board while paused. Without this gate, either
case holds every tool call of every session in the project for 9
minutes, then denies every call at once (criterion 8). The model then
cannot even delete the file, because its Bash call is denied too. With
the gate, the pause is in force only while the board that wrote it runs.
A crafted file cannot guess the pid of a board that the user runs, and a
closed board releases the session.

## Design decisions

### D1 — The control file and the owner gate

`.constellation/state/control.json`, written by the board only:

```json
{ "paused": true, "since": "2026-10-21T14:02:11Z", "by": "board", "pid": 48213 }
```

The owner gate (hook and statusline, bash):

```bash
# board_owner_alive <control-file> -> prints the pid and exits 0 when the gate passes
[ -f "$F" ] && [ ! -L "$F" ] || return 1
[ "$(wc -c < "$F" | tr -d ' ')" -le 1024 ] || return 1
PID=$(jq -r 'select(.paused == true and .by == "board") | .pid | select(type == "number" and . > 1 and . == floor)' "$F" 2>/dev/null)
[ -n "$PID" ] && kill -0 "$PID" 2>/dev/null || return 1
ps -p "$PID" -o command= 2>/dev/null | grep -q 'board\.mjs' || return 1
```

The board side (D6) uses `process.kill(pid, 0)` only, with no `ps`. Its
`owner` is `this` (`pid === process.pid`), `other` (a live process), or
`gone`. The page shows the paused state for `this` and `other`.

Rejected alternatives: "ignore a file that git tracks" covers the
commit case only, not a closed board, and costs a `git` process per tool
call. "Board token in the file" puts a secret in a file that every local
process can read, and the hook has no copy to compare with. "Delete the
file on board shutdown" fails on a crash and on a committed file.

### D2 — Hook `pause-guard.sh`

New file
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/pause-guard.sh`.
About 90 lines. No stdout except the deny JSON. Exit 0 always.

```
PROJECT_DIR = ${CLAUDE_PROJECT_DIR:-$(pwd)}; C = $PROJECT_DIR/.constellation
1. [ -f C/config.json ] || exit 0
2. [ -f C/state/current-workflow.json ] || exit 0
3. [ -f C/state/control.json ] || exit 0              # fast path, criterion 9
4. command -v jq || exit 0
5. owner gate (D1) fails -> exit 0                     # criterion 23
6. INPUT=$(cat); SID, AID, ATYPE, TOOL from INPUT (jq, nulls allowed)
7. HOLD = CONSTELLATION_HOLD_SECONDS if integer 1..590, else 540
   NOW = date +%s; SINCE = since | fromdateiso8601 (empty on error)
   START = SINCE when 0 < SINCE <= NOW, else NOW;  DEADLINE = START + HOLD
8. NOW >= DEADLINE -> log PauseDenied heldSec 0; print deny; exit 0   # criterion 8
9. log PauseHold; T0 = NOW
10. loop: sleep 1
      control file gone           -> log PauseReleased reason "resume";        exit 0
      kill -0 PID fails           -> log PauseReleased reason "board-stopped"; exit 0
      date +%s >= DEADLINE        -> log PauseDenied heldSec; print deny;     exit 0
```

Event lines go to `C/metrics/events.jsonl` (`mkdir -p` first), one `jq
-nc` call each, with the field order of `log-event.sh`:

| Event | Fields |
|---|---|
| `PauseHold` | `ts`, `event`, `session_id`, `agent_id`, `agent_type`, `tool_name` |
| `PauseReleased` | the same, plus `heldSec`, `reason` (`resume` or `board-stopped`) |
| `PauseDenied` | the same, plus `heldSec` (0 for the deny at once) |

`heldSec` makes the success metric exact: count `PauseReleased` with
`reason: "resume"` against `PauseDenied` with `heldSec > 0`. Null fields
are dropped, as in `log-event.sh`.

The deny reason (spec §9.2, plus one sentence for subagents):

```
Constellation board paused this workflow at <since>. Do not run more tools. If you are a subagent, put this sentence in your final report and end your run. Report the last save point to the user and end the turn. The user clicks Resume on the board, then types /constellation:resume.
```

The JSON is built with `jq -nc --arg r "$REASON"`, never by string
concatenation, so a `since` with a quote cannot break it.

Process notes: the hold loop uses `sleep 1` in the foreground. When
Claude Code kills the hook (Esc, or a timeout that the 590 cap prevents),
bash ends and the orphan `sleep` ends within 1 s. No `trap`.

### D3 — The deadline anchored on `since`

One deadline per pause, shared by every call. A call that starts 100 s
after the pause holds at most 440 s. A call after the deadline holds 0 s
(criterion 8). Parallel subagents all deny at the same second, so the
orchestrator gets one batch of denials, not a stagger over 9 minutes.

### D4 — `hooks.json`

Add a second entry to the `PreToolUse` array in
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/hooks/hooks.json`:

```json
{
  "matcher": "",
  "hooks": [
    { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/pause-guard.sh\"", "timeout": 600 }
  ]
}
```

The `guard-git.sh` entry stays as it is. Cost per tool call outside a
pause: one bash start and up to three `test -f` (criterion 9 bound: 100
ms; measured budget about 10 ms).

### D5 — Route `POST /api/control` (`board.mjs`)

`serve` gains a fifth parameter `control = null`, an object `{ token,
act(action) }`. With `control` null the route answers 405, so every
existing `serve(...)` call and test keeps its behavior.

`runServer` mints `token = crypto.randomBytes(32).toString('hex')` once.
`serve` adds `csrf: token` to every snapshot it sends (`/api/snapshot`
and each SSE frame) when `control` is set. The snapshot object in memory
does not hold the token.

The route handler, before the global GET-only check:

| # | Check | Reply |
|---|---|---|
| 0 | Host (the existing global check) | 403 |
| 1 | method is `POST` | 405, `allow: POST` |
| 2 | `Origin` equals `http://127.0.0.1:<port>` or `http://localhost:<port>` | 403 `origin` |
| 3 | `Sec-Fetch-Site` absent or `same-origin` | 403 `fetch site` |
| 4 | `x-board-token` equals the token (`crypto.timingSafeEqual` on equal-length buffers) | 403 `token` |
| 5 | media type of `content-type` is `application/json` | 415 |
| 6 | `content-length` and the streamed bytes are at most 1024 | 413; stop reading |
| 7 | body parses as JSON and `action` is `pause` or `resume` | 400 |
| 8 | `control.act(action)` | 204, or its 403 or 409 |

Every reply body is a short `text/plain` reason, which the toast shows.
No reply holds a path.

`act` in `runServer` calls two new functions in `board.mjs`:

- `writeControl(projectDir, now = new Date())`: `resolveRoot` →
  `stateDir = root/state`; `lstat(stateDir)` must be a directory and not
  a symlink, and `realpath(stateDir) === root + '/state'`, else 403
  `state dir refused`. 409 `no workflow in flight` when
  `state/current-workflow.json` is not a regular file. 409 `already
  paused` when the current file has a live owner (D1, board side).
  Write `{"paused":true,"since":…,"by":"board","pid":process.pid}` to
  `state/.control-<pid>-<8 hex>.tmp` with `O_CREAT | O_EXCL | O_WRONLY |
  O_NOFOLLOW`, mode `0o600`, then `renameSync` onto `control.json`. On
  any error after the open, unlink the temp file. `rename` replaces a
  symlink at `control.json` and never follows it.
- `clearControl(projectDir)`: the same state-dir check (403), then
  `unlinkSync(state/control.json)`. `ENOENT` gives 409 `not paused`.
  `EISDIR` or `EPERM` gives 409 `control file is not a file`.

Every other route keeps the GET-only rule and its 405 (criterion 16).

### D6 — Snapshot: `control` and `controlView` (`board-model.mjs`)

New pure export `controlView(raw, events, { selfPid, alive })`:

- `raw` null, or not `paused: true` with `by: "board"` and an integer
  `pid` → `{ paused: false, since: null, owner: null, phase: null }`.
- `owner`: `this` when `pid === selfPid`; else `other` when `alive(pid)`;
  else `gone`. `gone` → `paused: false`.
- `phase`: the last event with `ts >= since` among `PauseHold`,
  `PauseReleased`, `PauseDenied` decides. `PauseHold` → `holding`;
  `PauseDenied` → `stopped`; none or `PauseReleased` → `paused`.

`loadSnapshot` reads `state/control.json` through `readJson` (contained,
`O_NOFOLLOW`, capped), passes all parsed `events` (not the window), and
sets `snapshot.control`. `alive` in `board.mjs` is `(pid) => { try {
process.kill(pid, 0); return true; } catch (e) { return e.code ===
'EPERM'; } }`. `emptySnapshot` gains `control: { paused: false, … }`.

`signature()` adds the control path to its stamped files, so the 1.5 s
poll sees a pause when `fs.watch` misses it. The `state/` watcher
already covers the fast path.

### D7 — Render (`board-render.mjs`)

New export `renderPauseControl(view, esc)`. `view = { state, control,
hhmm }`. Add it to `ISOLATION_ARGS`. `renderNow` calls it at the end of
its header row (`<div class="meta mb12">`).

| State | Markup |
|---|---|
| no `state` | `''` (criterion 4) |
| not paused | `<button class="btn secondary" data-action="pause">⏸ Pause</button>` |
| `phase: paused` | chip `⏸ paused since hh:mm` + `<button class="btn primary" data-action="resume">▶ Resume</button>` |
| `phase: holding` | the same, plus chip warn `holding — resume continues at once` |
| `phase: stopped` | the same, plus chip danger `session stopped — type /constellation:resume after you resume` |

### D8 — Page runtime (`board-ui/page.js`, `page.html`, `page.css`)

- `page.html`: add `<div id="toast" class="toast" role="status"
  aria-live="polite" hidden></div>` before the dialog.
- `page.js`, the `#now` click handler: a `[data-action="pause"]` or
  `[data-action="resume"]` click calls `sendControl(action, button)`.
- `sendControl`: return when a request is in flight (one flag). Disable
  the button. `fetch('/api/control', { method: 'POST', headers: {
  'content-type': 'application/json', 'x-board-token': snap.csrf },
  body: JSON.stringify({ action }) })`. On 204, the toast says `Paused.
  The session stops at its next tool call.` or `Resumed. A held tool
  call continues at once.` On another status, the toast says `<status>:
  <reply text>`. On a network error, the toast says `network error`.
  Clear the flag. The next snapshot repaints the header.
- `showToast(text)`: set the text, show it, hide it after 4 s (one
  timer; a new toast resets it).
- `renderMeta`: when `connected`, add `<span class="chip ok
  live">● live</span>` before `updated hh:mm`. The `disconnected since`
  chip stays as it is.
- `page.css`: `.toast` (fixed, bottom 16 px, right 16 px, max-width
  `calc(100vw - 32px)`, surface, border, shadow, z-index over the
  dialog). No new color token.

The CSP stays: `connect-src 'self'` allows the POST. The script and
style hashes change with the text, as today.

### D9 — Statusline (`templates/statusline.sh`)

Add the owner gate of D1 before the `jq` call. Pass `--argjson paused
true|false`. Put the modifier first in `$mods`:

```
(if $paused then "\($t.modifiers.aborted.emoji // "⏸") \($t.modifiers.aborted.label // "paused")" else empty end)
```

Output example: `🌌 planned │ ✓✓✓✓✓ ▶🔍 Review Gate 6/10 │ ⏸ paused │ 🔁 1/3 │ feat/x`.
Projects get the new statusline with `/constellation:init --refresh`.

### D10 — Orchestrator skill and commands

`/Users/joaooliveira/study/constellation-harness/plugins/constellation/skills/orchestrator/SKILL.md`:

- Basic Rules, a new bullet: "**ALWAYS** stop when a tool denial or an
  agent report carries `Constellation board paused this workflow`. End
  the turn with the pause message and the last save point (`currentStep`
  and `lastUpdatedAt` of the state file you last wrote). Do not save
  state. Do not retry. Do not spawn agents. The user clicks Resume on the
  board, then types `/constellation:resume`."
- Commands table, a row right after `/constellation:abort`: "Board
  **Pause** / **Resume** (page buttons) | Pause holds the next tool call
  of the session and its subagents for up to 9 minutes. Resume within
  the hold continues with no typing. After the hold, the call is denied
  and the turn ends: click Resume, then type `/constellation:resume`.
  Unlike `/constellation:abort`, it saves nothing."
- The `events.jsonl` paragraph (line about 605) adds: "`pause-guard.sh`
  appends `PauseHold`, `PauseReleased`, and `PauseDenied`."

`/Users/joaooliveira/study/constellation-harness/plugins/constellation/commands/resume.md`,
a new step 0: "If a tool call is denied with `Constellation board paused
this workflow`, tell the user to click Resume on the board first, and
stop."

No `workflow-paused` metrics row (task 044).

### D11 — Selftest (`scripts/selftest.sh`)

- Step 7: two statusline cases. A fake board process (a shell script
  named `board.mjs` that runs `sleep 30`) owns a control file → output
  holds `⏸ paused`. A control file with a dead pid → no `⏸`. Kill the
  fake process at the end of the step.
- Step 11: run `pause-guard.test.sh` (it self-skips without `jq`, as
  `log-event.test.sh` does). Add a marker check: `grep -F 'Constellation
  board paused this workflow'` passes on `pause-guard.sh`, the
  orchestrator `SKILL.md`, and `docs/specs/board-ui-v2.md`.
- Step 1 takes the new `.sh` files through its `find`. Step 2 checks
  `hooks.json`.

### D12 — Spec deltas (Technical Writer)

`/Users/joaooliveira/study/constellation-harness/docs/specs/board-ui-v2.md`:

- §2 and §9.1: the file holds `pid`; the owner gate of D1; the pause is
  in force only while the board that wrote it runs.
- §9.2: the steps of D2; the deadline of D3; `PauseReleased` with
  `reason` and `heldSec`; the deny at once; `CONSTELLATION_HOLD_SECONDS`
  (1 to 590, default 540); the reason text with the subagent sentence.
- §9.3: remove the `workflow-paused` paragraph; name task 044.
- §9.4: the check table of D5, the 400, 413, 415, and 405 codes, `Origin`
  required, 409 `already paused`.
- §9.5: the `● live` item reflects the SSE connection only.
- §10: the `/api/control` row adds "Origin required, owner pid in the
  file"; a new row `pause-guard.sh`: owner gate, 1 KB cap, no symlink.
- §11: the test lists of this plan.

## Implementation

All paths are under
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/`
unless given in full.

### Files

| File | Change | Lines (about) |
|---|---|---|
| `scripts/pause-guard.sh` | New. D1, D2. | +90 |
| `scripts/pause-guard.test.sh` | New. H1 to H13. | +170 |
| `hooks/hooks.json` | D4. | +9 |
| `scripts/board-model.mjs` | `controlView`; `emptySnapshot.control`. | +35 |
| `scripts/board.mjs` | `paths().control`; `loadSnapshot` control; `signature`; `writeControl`, `clearControl`, `alive`; `serve` route and `csrf`; token and `act` in `runServer`; `--help` text drops "Read-only". | +130 |
| `scripts/board-render.mjs` | `renderPauseControl`; `renderNow` header. | +30 |
| `scripts/board-ui/page.js` | `sendControl`, `showToast`, `#now` branch, `● live`. | +40 |
| `scripts/board-ui/page.html` | `#toast`. | +1 |
| `scripts/board-ui/page.css` | `.toast`, `.live`. | +12 |
| `scripts/board.test.mjs` | M1 to M4, C1 to C14, R1 to R4, G1 to G6; `ISOLATION_ARGS`; `bootPage` gains `fetch` POST stubs and `#toast`. | +450 |
| `templates/statusline.sh` | D9. | +12 |
| `skills/orchestrator/SKILL.md` | D10. | +4 |
| `commands/resume.md` | D10. | +1 |
| `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh` | D11. | +25 |
| `/Users/joaooliveira/study/constellation-harness/README.md` | Release notes below. Technical Writer. | ±3 |
| `/Users/joaooliveira/study/constellation-harness/docs/specs/board-ui-v2.md` | D12. Technical Writer. | +30 |
| `/Users/joaooliveira/study/constellation-harness/CHANGELOG.md` | `[Unreleased]`. Technical Writer. | +35 |

No change to `log-event.sh`, `board-session.mjs`, `board-vendor/`,
`plugin.json`, `marketplace.json`, `templates/gitignore`, or
`templates/tracks.json` (its `aborted` modifier already reads `⏸
paused`).

### Existing tests that change

- **E1**: `serve: POST with a correct Host returns 405` and the 405 rows
  of the method tables (lines about 1037, 1080, 1101, 2235) stay green:
  they use `serve` without `control` or a path other than
  `/api/control`. No edit expected.
- **E2**: the snapshot fixtures that deep-equal `emptySnapshot` gain
  `control`.
- **E3**: the `ISOLATION_ARGS` entry of `renderNow` gains a `control` in
  its view.
- **E4**: tests that pin the `renderNow` header markup gain the Pause
  button.
- **E5**: the CSP hash test keeps its shape (two script hashes, one
  style hash).

The engineer lists each edit in the commit body of its step.

### Order, with checkpoint commits

Each step ends GREEN, then VERIFY per
`constellation:test-verified-development` (mutation variant, named per
test below), then one commit. The commit body records the VERIFY
evidence. The branch `feat/026-board-pause-and-resume` exists.

1. **Hook.** D1, D2, D4, selftest step 11 hook line. Tests H1 to H13.
   Commit: `feat: pause-guard.sh holds tool calls while the board pause is in force (task 026)`.
2. **Snapshot.** D6. Tests M1 to M4; E2.
   Commit: `feat: board snapshot reports the pause state and its hold phase (task 026)`.
3. **Route.** D5. Tests C1 to C14.
   Commit: `feat: board writes and deletes state/control.json through POST /api/control (task 026)`.
4. **Render and page.** D7, D8. Tests R1 to R4, G1 to G6; E3, E4, E5.
   Commit: `feat: board page shows Pause, Resume, the hold phase, a toast, and the live item (task 026)`.
5. **Statusline and skill.** D9, D10, D11 (step 7 and the marker check).
   Commit: `feat: statusline shows paused and the orchestrator ends the turn on a board pause (task 026)`.
6. **Manual checks A and B** (Validation). Fix what they find, then
   commit under `fix:` when a fix was needed.

The Technical Writer does D12, the README, and the CHANGELOG at Gate 2.

### Data flow

- Pause: click → `sendControl('pause')` → `POST /api/control` → checks
  0 to 7 → `writeControl` → temp file + rename → `fs.watch(state/)` →
  `refresh` → `loadSnapshot` → `controlView` → SSE frame → `render` →
  chip and Resume. Toast on 204.
- Hold: the session calls a tool → Claude Code runs `pause-guard.sh` and
  `guard-git.sh` (Bash only) in parallel → gate → `PauseHold` line →
  watcher → snapshot `phase: holding`.
- Resume: click → `clearControl` → unlink → the hook sees no file within
  1 s → `PauseReleased` → exit 0 → the tool runs.
- Expiry: the deadline passes → `PauseDenied` → deny JSON → the model
  gets the reason → the orchestrator ends the turn (D10). Later calls
  deny at once until Resume.

## Validation

Follow `constellation:test-verified-development`. Every new test has a
named mutation: apply it, run the file, confirm that the named test fails
for that reason, restore the code.

- Run: `node --test /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/*.test.mjs`
- Hook: `bash /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/pause-guard.test.sh`
- Lint Gate: `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`
- Mocking: none at the logic level. The hook tests use a temp project, a
  fake board process (a shell script named `board.mjs` that runs `sleep
  60`, started in the background and killed by a `trap`), and
  `CONSTELLATION_HOLD_SECONDS=2`. HTTP tests use real local sockets and
  temp projects. Page tests use the existing `vm` sandbox with a `fetch`
  stub.

Baseline: 276 tests in `board.test.mjs` and 26 in
`board-session.test.mjs` pass on the branch at 3efa9ac.

**Automated Test**: hook (`pause-guard.test.sh`; criteria 5 to 9, 23)

| # | Case | Proves | Mutation that must fail it |
|---|---|---|---|
| H1 | No `config.json`, a valid control file | Exit 0, no stdout, no log, under 100 ms. | Move the config check after the control read. |
| H2 | Config, no `current-workflow.json`, a valid control file | Exit 0 at once, no log. | Remove check 2. |
| H3 | Config and state, no control file | Exit 0, no stdout, no log, under 100 ms. | Read stdin with `cat` before check 3 and add `sleep 0.2`. |
| H4 | Control file with a dead pid | Exit 0 at once, no log (23). | Drop the `kill -0` check. |
| H5 | Control file with the pid of the test shell (`$$`, not `board.mjs`) | Exit 0 at once (23). | Drop the `ps` command check. |
| H6 | `by: "x"`, or `paused: false`, or a 2 KB file, or a symlink to a valid file | Exit 0 at once for each (23). | Drop the `-L` check (symlink case). |
| H7 | Hold, then `rm` the file after 1 s (HOLD 5) | Exit 0 within 2 s of the `rm`; no stdout; `PauseHold` then `PauseReleased` with `reason: "resume"`, `heldSec` 1 or 2 (5, 6). | Poll every 3 s. |
| H8 | Hold to expiry (HOLD 2) | Stdout parses with `jq`; `permissionDecision == "deny"`; reason holds `Constellation board paused this workflow` and the `since` value; `PauseHold` then `PauseDenied` with `heldSec >= 2` (7). | Print the deny with `exit 2` and no JSON. |
| H9 | `since` 10 s ago, HOLD 2 | Deny within 1 s; one `PauseDenied` with `heldSec: 0`; no `PauseHold` (8). | Anchor the deadline on the call time. |
| H10 | `since` 1 hour in the future, HOLD 2 | Deny after about 2 s, not later (D3). | Use `since` with no `min(since, now)`. |
| H11 | `CONSTELLATION_HOLD_SECONDS=9999` and `since` 600 s ago | Deny at once (the default 540 applies). | Accept any integer. |
| H12 | Kill the fake board during a hold | Exit 0 within 2 s; `PauseReleased` with `reason: "board-stopped"`. | Remove the `kill -0` in the loop. |
| H13 | Input with `agent_id` and `agent_type` (a subagent call) | The `PauseHold` line carries both, and `tool_name` (5). | Drop `agent_id` from the log object. |

**Automated Test**: snapshot (`board.test.mjs`; criteria 1, 5, 7)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| M1 | `controlView: owner this, other, and gone` | `selfPid` match → `this`; stub `alive` true → `other`; false → `gone` and `paused: false`. | Treat `gone` as paused. |
| M2 | `controlView: the last pause event since the pause sets the phase` | Hold → `holding`; hold then deny → `stopped`; a deny before `since` → `paused`. | Compare with `ts > since`. |
| M3 | `controlView: a malformed file is not a pause` | `null`, `paused: "true"`, no `pid`, `pid: 1.5`, `by: "x"` → `paused: false`. | Accept a string `pid`. |
| M4 | `loadSnapshot: control comes from state/control.json and a symlink is refused` | A real file → `control.paused` true; a symlinked file → false with no throw. | Read the file with `fs.readFileSync`. |

**Automated Test**: route (`board.test.mjs`; criteria 1, 2, 12 to 16)

Helper `withControlServer(fn)`: a temp project with config, state,
tracks; `serve` with `control = { token, act }` from the real
`writeControl` and `clearControl`; a `post(port, { headers, body })`
helper with a valid Host, Origin, and token by default.

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| C1 | `/api/control: pause writes the server-built file` | 204; keys exactly `paused`, `since`, `by`, `pid`; `pid === process.pid`; `since` matches `^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$`; mode `0o600`; no `.tmp` left. | Spread the body into the file. |
| C2 | `/api/control: the body never reaches the file` | Body `{action:"pause",since:"x",by:"evil",pid:7}` → server values only. | Same as C1. |
| C3 | `/api/control: resume deletes the file` | 204; no `control.json`. | Make resume a no-op that returns 204. |
| C4 | `/api/control: 403 without a token, with a wrong token, and with a token of the wrong length` | 403 each; file unchanged (12). | Compare only the token prefix. |
| C5 | `/api/control: 403 for a foreign Origin, a missing Origin, and Sec-Fetch-Site cross-site` | 403 each; file unchanged (12). | Allow a missing Origin. |
| C6 | `/api/control: 403 for a foreign Host` | 403; file unchanged (12). | Move the route before the Host check. |
| C7 | `/api/control: 413, 415, and 400` | 1025-byte body → 413; `text/plain` → 415; `application/json; charset=utf-8` accepted; `{"action":"stop"}` and `nope` → 400; file unchanged (13). | Raise the cap to 4096. |
| C8 | `/api/control: 409 for pause with no workflow, resume with no file, and a second pause` | 409 each; file unchanged (14). | Drop the workflow check. |
| C9 | `/api/control: pause replaces a file whose owner is gone` | A file with a dead pid → 204 and the new pid. | Return 409 for any existing file. |
| C10 | `/api/control: a symlinked state dir is refused` | `state` → a dir inside the root, and → a dir outside the project: 403; nothing written in the target (15). | Use `stat` in place of `lstat`. |
| C11 | `/api/control: only state/control.json changes` | A recursive listing of `.constellation/` with sizes and mtimes before and after pause, and after resume: only `state/control.json` differs (16). | Leave the temp file in place. |
| C12 | `serve: every other route still answers 405 to a non-GET method` | `POST /api/snapshot`, `PUT /`, `DELETE /api/item`, `GET /api/control` → 405 (16). | Accept POST on every path. |
| C13 | `serve: the snapshot carries a 64-hex csrf only when control is set` | With control → `csrf` matches `^[0-9a-f]{64}$` on `/api/snapshot` and the first SSE frame; without → no `csrf`. | Put the token on the shared snapshot object. |
| C14 | `watch: a new control file fires a refresh through the poll` | The signature differs when `state/control.json` appears. | Remove the control path from `signature`. |

**Automated Test**: render and page (`board.test.mjs`; criteria 1 to 4, 17)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| R1 | `renderPauseControl: no workflow, not paused, paused, holding, stopped` | The five rows of D7, exact texts; `''` with no state (4). | Show Pause with no state. |
| R2 | `renderPauseControl: the since time is escaped and cut to hh:mm` | `<script>` in `since` is escaped; `14:02`. | Skip `esc`. |
| R3 | `renderNow: the header holds the pause control` | Pause button in the header row. | Drop the call from `renderNow`. |
| R4 | `board-render.mjs: every export runs in a vm context that holds only the prelude` (existing) | The new `renderPauseControl` entry. | Call a non-exported helper. |
| G1 | `page: Pause posts the action with the token and shows the toast` | One `POST /api/control`, headers `content-type` and `x-board-token` = `snap.csrf`, body `{"action":"pause"}`; toast text; header unchanged until a snapshot (1). | Send no token header. |
| G2 | `page: a 403 or 409 reply shows the reason and keeps the header` | Toast `403: token`; `409: not paused`; same header HTML (3). | Repaint the header on any reply. |
| G3 | `page: a second click during a request sends nothing` | One fetch for two clicks. | Remove the in-flight flag. |
| G4 | `page: Resume posts resume` | Body `{"action":"resume"}` (2). | Hard-code `pause`. |
| G5 | `page: live shows while connected and goes away on error` | `onopen` → `● live`; `onerror` → no `● live`, a `disconnected since` chip (17). | Show live from `snap.at`. |
| G6 | `page: live stays with an old snapshot time` | `connected` with `snap.at` an hour old → `● live` (17). | Hide live when `snap.at` is older than 60 s. |

**Automated Test**: statusline and contract (`selftest.sh`; criteria 11, 18)

- Step 7: the fake board case shows `⏸ paused`; the dead pid case shows
  no `⏸`. Mutation: drop the `kill -0` in the statusline gate → the dead
  pid case fails.
- Step 11: the marker check. Mutation: change one word of the marker in
  `SKILL.md` → the step fails.

**MANUAL TEST A**: the page in a browser (criteria 1 to 4, 17; spec §11)

- **Why manual**: real Chrome, the CSP, the fetch with the real token,
  the toast, focus, and the 390 px layout. The project adds no browser
  dependency.
- **Preconditions**: the branch at step 5 or later. Chrome. The CDP
  driver `<scratchpad>/cdp-025.mjs` copied to `<scratchpad>/cdp-026.mjs`
  (it takes a JS expression and `--width 390`). `<scratchpad>` is
  `/private/tmp/claude-501/-Users-joaooliveira-study-constellation-harness/1dda0709-05d7-492d-93e1-c206b58a887f/scratchpad`.
  Use the real path under `/private/tmp`.
- **Fixture**: `<scratchpad>/board-fixture/build-026.sh`:

```bash
#!/usr/bin/env bash
# Task 026 fixture: a scratch initialized project with a workflow in flight.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd -P)"
FIX="$HERE/project026"
TPL=/Users/joaooliveira/study/constellation-harness/plugins/constellation/templates
rm -rf "$FIX"
mkdir -p "$FIX/.constellation/state" "$FIX/.constellation/metrics" "$FIX/.constellation/tasks" "$FIX/.constellation/plans"
echo '{}' > "$FIX/.constellation/config.json"
cp "$TPL/tracks.json" "$FIX/.constellation/"
cp "$TPL/gitignore" "$FIX/.constellation/.gitignore"
printf -- '---\nstatus: in-progress\ntype: feature\n---\n# Pause fixture\n\nBody.\n' > "$FIX/.constellation/tasks/026-fixture.md"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "$FIX/.constellation/state/current-workflow.json" <<EOF
{ "track": "planned", "branch": "feat/026-fixture", "task": "026-fixture.md", "currentStep": "engineer", "completedSteps": ["architect","devops-branch"], "reviewLoopCount": 0, "startedAt": "$NOW", "lastUpdatedAt": "$NOW" }
EOF
echo "node /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs \"$FIX\" --port 4497"
```

- **Steps**:
  1. Run `build-026.sh`. Start the printed command. Open
     `http://127.0.0.1:4497` with the CDP driver. Expect `● live` in the
     top bar, `⏸ Pause` in the Now header, and no CSP error in the log.
  2. CDP: `document.querySelector('[data-action="pause"]').click()`.
     Expect a toast, then the chip `⏸ paused since hh:mm` and `▶ Resume`.
     `jq -S . project026/.constellation/state/control.json` shows the
     four keys and the board pid.
  3. `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type:
     application/json' -H 'Origin: http://127.0.0.1:4497' --data
     '{"action":"resume"}' http://127.0.0.1:4497/api/control` prints
     `403` (no token). The file stays.
  4. Append a `PauseHold` line with the current `ts` to `events.jsonl`.
     Within 2 s the chip `holding — resume continues at once` shows.
     Append a `PauseDenied` line. The chip `session stopped — type
     /constellation:resume after you resume` shows.
  5. Click Resume. Expect a toast, then `⏸ Pause` again. The file is
     gone.
  6. Run the CDP driver at 1280 px and with `--width 390`, dark and
     light, in the paused state. Expect `scrollWidth === clientWidth`
     and the toast inside the viewport.
  7. Keyboard only: Tab to Pause, press Enter. The focus stays on the
     control after the repaint (it becomes Resume, keyed by
     `data-action`; record where the focus lands).
  8. Stop the board. The page drops `● live` and shows `disconnected
     since`.
- **Expected**: each step as written.
- **Observability**: the snapshot `control`; `events.jsonl`; the CDP
  state line; screenshots `026-*.png` in the scratchpad.

**MANUAL TEST B**: a real hook run in a scratch initialized project (criteria 5 to 10, 18, 23)

- **Why manual**: only a real Claude Code session proves the hold, the
  release, the deny, and the model reaction. It costs API calls, so it
  is not in the selftest.
- **Preconditions**: manual test A passed. The fixture of A
  (`project026`), and the board of A running on port 4497. The session
  uses the plugin of the branch:
  `--plugin-dir /Users/joaooliveira/study/constellation-harness/plugins/constellation`.
  The user-scope `constellation@constellation` plugin is also enabled.
  Turn it off for these runs with `--settings
  '{"enabledPlugins":{"constellation@constellation":false}}'`, so each
  hook runs once. Before step 1, check with one `-p` run that the hooks
  of the branch copy still fire (a `SubagentStart` or `PostToolUse` line
  in `events.jsonl`). When the setting also drops the branch copy, run
  without `--settings`: `pause-guard.sh` exists only in the branch copy,
  and `log-event.sh` then writes duplicate lines, which this test
  ignores. No real project and no real state file is touched.
  The runs write transcripts under `~/.claude/projects/` in a folder
  named after the scratch path. Delete that folder at the end.
- **Command** (from `project026`; `$P` is the prompt):

```bash
CONSTELLATION_HOLD_SECONDS=$H claude -p --model haiku \
  --plugin-dir /Users/joaooliveira/study/constellation-harness/plugins/constellation \
  --settings '{"enabledPlugins":{"constellation@constellation":false}}' \
  --allowedTools "Bash,Agent" <<< "$P" > run.out 2>&1 &
```

- **Steps**:
  1. Pause from the page. `H=60`, `P="Run this Bash command once: date
     -u >> tool.log. Then reply DONE."`. Within 10 s `events.jsonl` has
     a `PauseHold` line with a `session_id`. `tool.log` does not exist.
     The page chip says `holding`.
  2. After 15 s, click Resume. Within 2 s `PauseReleased` with `reason:
     "resume"` appears, `tool.log` gets one line, and `run.out` ends
     with `DONE` (6).
  3. Pause again. `H=15`, the same `P`. After about 15 s `PauseDenied`
     appears, `tool.log` does not grow, and `run.out` holds the pause
     sentence or a report that the board paused the workflow (7).
  4. With the file still there (now older than 15 s), run step 3 again.
     The deny comes within 2 s. `events.jsonl` gets a `PauseDenied` with
     `heldSec: 0` and no `PauseHold` (8).
  5. Orchestrator rule: resume, then pause again. `H=15`, `P="Load the
     constellation:orchestrator skill. Then run the Bash command date
     -u."`. The skill load is a tool call, so it is denied at once (the
     file is older than 15 s after the first wait) or after the hold.
     Expect the reply to end the turn with the pause message and no
     retry (10). Record the text. When the model does not reach the
     skill, add the rule text of D10 to `P` and record that the model
     follows it.
  6. Subagent: resume. `H=60`, `P="Use the Agent tool (general-purpose)
     to spawn one subagent that runs the Bash command sleep 20, and then
     the Bash command date -u >> tool.log."`. When `events.jsonl` shows
     the `SubagentStart` line, click Pause (within the 20 s sleep).
     Expect a `PauseHold` line with an `agent_id` for the next subagent
     call. Click Resume. The subagent continues and `tool.log` grows
     (5, 6).
  7. Pause, then stop the board (Ctrl+C). Run step 1. The tool runs at
     once; no pause line (23). Run the statusline by hand: `printf
     '{"workspace":{"current_dir":"%s"}}' "$PWD" | bash
     /Users/joaooliveira/study/constellation-harness/plugins/constellation/templates/statusline.sh`.
     It shows no `⏸ paused`. Restart the board: the page shows `⏸
     Pause` (owner `gone`).
  8. Crafted file: write `{"paused":true,"since":"2020-01-01T00:00:00Z","by":"board","pid":1}`
     by hand. Run step 1. The tool runs at once (23).
  9. Esc: in an interactive `claude` (same flags, no `-p`), pause, ask
     for one Bash call, press Esc during the hold. Record what happens
     to the call and the hook process (`ps`). Information only.
  10. Cleanup: stop the board, `rm -rf` the fixture and the transcript
      folder of the scratch path.
- **Expected**: each step as written. A tool that runs while an owned
  control file exists fails the check (the success-metric guardrail).
- **Observability**: `events.jsonl`; `run.out`; `tool.log`; `ps -o
  pid,command` for hook processes; the board stderr.

## Integration Touchpoints

- **Claude Code hook runtime** - Could break: a version changes the
  timeout default, the timeout behavior, or the deny JSON - Validation:
  the explicit `timeout: 600`; the 590 cap; H8 pins the JSON shape; the
  manual test B re-checks on the installed version.
- **Every tool call in an initialized project** - Could break: a slow or
  buggy hook delays or blocks every call - Validation: H1 to H6 (fast
  exits); the hook exits 0 on every error path; the owner gate (23).
- **`guard-git.sh`** (same event, runs in parallel) - Could break: a
  conflict in decisions - Validation: either deny blocks; no shared
  state; selftest steps 9 and 10 stay green.
- **`events.jsonl`** (shared with `log-event.sh`, read by the board) -
  Could break: a malformed line from the hook; the feed shows new event
  names - Validation: `jq -nc` writes each line; `parseEventLines`
  skips bad lines; `feedText` prints the event name for unknown events.
- **`state/` directory** - Could break: the first board write under
  `.constellation/` - Validation: C10, C11; `O_EXCL | O_NOFOLLOW` temp
  file; rename; no `mkdir`.
- **HTTP server** - Could break: the GET-only rule, the Host check, the
  CSP - Validation: C6, C12, the CSP test, the existing 405 tests.
- **Snapshot consumers** (page, `--probe`) - Could break: the new
  `control` and `csrf` keys - Validation: E2, C13; the probe reads only
  `projectDir`.
- **Statusline in user projects** - Could break: the copied template is
  old - Validation: the old template ignores the file (no change of
  output); `/constellation:init --refresh` installs the new one.
- **Orchestrator skill** - Could break: the model retries after a deny,
  or saves state - Validation: the marker check in selftest; manual B5.

## Risks

1. **The hold is not a true pause** - Impact: M - Likelihood: H - The
   model call in flight finishes before the hold, and a held subagent
   keeps its context. A denied subagent leaves partial edits. -
   Mitigation: documented known limit; resume re-runs the step; the
   README states it.
2. **A hook bug blocks every tool call** - Impact: H - Likelihood: L -
   Mitigation: three `test -f` checks before any work; exit 0 on every
   error path; no `set -e`; the owner gate; the 590 s cap under the 600 s
   timeout; H1 to H6.
3. **A forged request writes the file** - Impact: M - Likelihood: L -
   Mitigation: loopback bind, Host, exact Origin, `Sec-Fetch-Site`, the
   token in a no-CORS snapshot, a fixed file content; C4 to C8. The
   worst effect is a pause, which the owner gate bounds to the life of
   the board.
4. **Owner gate false negative** (pid reuse by an unrelated process that
   has `board.mjs` in its command line) - Impact: L - Likelihood: L -
   Mitigation: Resume deletes the file; the board shows the file as
   paused for `other`.
5. **The model ignores the deny** - Impact: M - Likelihood: L - Every
   later call is denied at once (criterion 8), so the model cannot make
   progress. - Mitigation: the skill rule and the reason text; manual B5.

## Logging

- Hook: `PauseHold`, `PauseReleased` (with `reason`, `heldSec`), and
  `PauseDenied` (with `heldSec`) in `events.jsonl`, each with
  `session_id`, `agent_id`, `agent_type`, `tool_name`. There is no user
  id in a local harness; `session_id` identifies the session. The hook
  logs nothing for an ignored file (23), so a crafted file cannot fill
  the log.
- Board, without `--quiet`: one stderr line per control action, `board:
  pause by the page` or `board: resume by the page`, and one line per
  refusal with the reason (`token`, `origin`, `state dir refused`), never
  the token and never a path. With `--quiet`: nothing.
- The success metric reads only `events.jsonl` (task 044 stays parked).

## Release notes for the Technical Writer

Add to `## [Unreleased]` in
`/Users/joaooliveira/study/constellation-harness/CHANGELOG.md`. Do not
bump `plugin.json` or `marketplace.json`. Do not cut `[1.4.0]`; the user
starts the release after validation.

Under `### Added`:

- **Pause and Resume on the board** (#026). A Pause button in the Now
  header holds the next tool call of the session and its subagents. A
  Resume click within 9 minutes continues the session with no typing.
  After 9 minutes the call is denied and the turn ends: click Resume,
  then type `/constellation:resume`. The header shows `⏸ paused since
  hh:mm`, and the hold phase (`holding`, `session stopped`). A toast
  confirms each action.
- **`pause-guard.sh`** (#026), a `PreToolUse` hook on every tool. It
  holds a call while the board pause is in force and logs `PauseHold`,
  `PauseReleased`, and `PauseDenied` to `events.jsonl`. It costs one
  file check per call when no pause is in force.
- **`POST /api/control`** (#026), with the action `pause` or `resume`.
- The top bar shows `● live` while the page has a live connection
  (#026).
- The statusline shows `⏸ paused` while the pause is in force (#026).
  Run `/constellation:init --refresh` to get the new statusline.

Under `### Changed`:

- The board writes one file, `state/control.json`, on a Pause click, and
  deletes it on Resume. It writes nothing else (#026).
- The orchestrator ends the turn when a tool denial or an agent report
  says `Constellation board paused this workflow`. It saves nothing and
  does not retry (#026).
- Update the existing count line in place. Make it "The board test count
  grows from 138 to `<N>` (#022, #023, #024, #025, #026), plus 26
  session-reader tests in `board-session.test.mjs` (#025)", with `<N>`
  from the final run. Do not add a second count line.
- Known limits (#026): Claude Code has no external pause, so the pause
  takes effect at the next tool call, not during a model reply. Work
  that a subagent did after the last save point runs again after
  `/constellation:resume`.

Under `### Security`:

- **`/api/control` accepts only the page of this board** (#026). It
  checks the Host, an exact `Origin`, `Sec-Fetch-Site`, and a
  per-process token that only the same-origin snapshot carries. The
  body is at most 1 KB and the server builds the file content. It
  writes through a temp file and a rename inside a real `state/`
  directory, and refuses a symlinked `state/`. Every other route stays
  GET-only.
- **A pause is in force only while the board that wrote it runs** (#026).
  The hook and the statusline ignore a control file whose `pid` is not a
  live board process, so a committed or stale `control.json` holds no
  tool call.

README, line 214: change the heading `**Board (localhost, read-only)**`
to `**Board (localhost)**`. Replace "It never writes to `.constellation/`."
with "It writes one file, `state/control.json`, on a Pause click, and
deletes it on Resume. It writes nothing else. A Pause holds the next
tool call of the session for up to 9 minutes; a Resume in that time
continues with no typing. After that, type `/constellation:resume`."
README line 215: add "`scripts/pause-guard.sh` adds `PauseHold`,
`PauseReleased`, and `PauseDenied`." after the first sentence.

Spec: the D12 deltas.

## Feasibility Result

- **VERDICT**: AGREED, with one safety addition (criterion 23) and the
  matching one-word change to criterion 1 (`pid` in the file). The
  orchestrator brief asked for this criterion.
- **FEASIBILITY**:
  - Page Pause and Resume (1 to 4): `moderate`. New toast, one route
    call, repaint through the snapshot.
  - Hook hold and release (5, 6): `moderate`. Verified on 2.1.285: the
    tool waits for the hook; subagent calls reach the hook with
    `agent_id`.
  - Expiry deny (7): `trivial`. The deny JSON is verified. The hold must
    end before the 600 s timeout, because at the timeout the tool runs.
  - Deny at once (8): `trivial` with D3.
  - Config gate and speed (9): `trivial`.
  - Orchestrator rule and command row (10, 11): `trivial`. The reason
    text adds one sentence for subagents.
  - Write limits (12 to 16): `moderate`. About 14 HTTP tests.
  - Live indicator (17): `trivial`.
  - Statusline (18): `trivial`, plus the owner gate.
  - Docs, tests, changelog (19 to 22): `moderate` by volume.
  - Safety gate (23): `trivial`. Two checks in bash, one in node.
- **SIMPLIFICATIONS** (no criterion changes):
  - One deadline per pause (D3) covers criteria 7 and 8 and the
    guardrail.
  - The pid owner gate replaces any token or git check in the hook.
  - The token goes into the served snapshot only, never into a file.
  - `serve` takes `control` as an optional fifth argument, so no
    existing test changes.
- **PRODUCT_SUGGESTIONS** (for the PM to triage, not in this plan):
  1. A keyboard shortcut for Pause (`p`) on the page. Cost: small.
  2. `/constellation:status` could print `⏸ paused (board)` from the
     same gate. Cost: one line in the command doc.
  3. A countdown on the `holding` chip (`resume within 7m 12s`) from
     `since` and the hold window. Cost: the snapshot needs the window
     (an env value of the hook, not known to the board), so a fixed 540
     s would show the wrong value under a custom window.
- **RISKS**: see Risks. The top item is the hold not being a true pause
  (M/H), accepted as a known limit.
- **OPEN_QUESTIONS**: none blocking.

## Open Questions

None blocking. Notes for the PM, recorded as decisions:

- Criterion 1 text: "exactly `paused: true`, `since` and `by:
  "board"`" becomes "exactly `paused: true`, `since`, `by: "board"` and
  `pid`" (the owner proof of criterion 23). The PM updates the task
  text; the tests pin four keys.
- Criterion 7: "when the hold reaches `HOLD_SECONDS`" is measured from
  the pause (`since`), not from the call (D3). A call that starts late
  holds for the rest of the window only.
- `HOLD_SECONDS` is the environment variable
  `CONSTELLATION_HOLD_SECONDS`, from 1 to 590, default 540.
- Esc during a hold is not documented by Claude Code. Manual B9 records
  the behavior for the README; no criterion depends on it.
