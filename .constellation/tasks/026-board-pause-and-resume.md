---
status: in-progress
type: feature
source: user
feature: F001-board-ui-overhaul.md
order: 5
date-created: 14-10-2026
last-edit: 21-10-2026
---
# Board UI: pause and resume a workflow from the page

Phase 5 of `docs/specs/board-ui-v2.md` (§9). A Pause button writes
`state/control.json`. A new `PreToolUse` hook holds the next tool call
while the file exists, and tells the model to stop when the hold expires.
A Resume button deletes the file. This is the first write the board makes.

User feedback, 14-10-2026: "There should be a pause button on the left
area and also a resume (play button)."

Limit: Claude Code has no external pause or prompt injection. A resume
within the hold continues the session with no typing. A resume after the
hold expired needs `/constellation:resume` in the terminal, and the page
says so.

Depends on task 022.

## Value loop

The user watches the board → sees a step go wrong → clicks Pause → the
session stops at its next tool call → the user reads the output or edits
a file → clicks Resume → the session continues with no typing. Every
criterion below serves one link of this loop, or limits the new write.

## Decision: the board writes one file

The board was read-only until now. A Pause button on the page cannot work
without a write, and the user asked for the button. So the write is in
scope, with these limits. They are criteria 6 to 9.

- Who: only a same-origin page on the loopback address. The server binds
  127.0.0.1 only. The route checks Host, Origin, `Sec-Fetch-Site` and a
  per-process token. A cross-origin page cannot read the token, because
  the snapshot has no CORS header.
- What: exactly one path, `.constellation/state/control.json`. The server
  builds the content, with the board `pid`. No field from the request body reaches the file.
- How: Pause writes a temp file in `state/` and renames it. Resume
  unlinks the file. Nothing else in `.constellation/` becomes writable.
- Effect: the hook holds tool calls. The orchestrator ends the turn on a
  denial. The hook and the orchestrator never write `control.json`.

## Acceptance criteria

### Pause and resume on the page

1. **Given** a workflow in flight and no control file, **when** the user
   clicks Pause in the Now header, **then** `state/control.json` exists
   with exactly `paused: true`, `since`, `by: "board"` and `pid`, the header
   shows a `⏸ paused since hh:mm` chip and Resume, and a toast confirms.
2. **Given** the control file exists, **when** the user clicks Resume,
   **then** the file is gone, the header shows Pause again, and a toast
   confirms.
3. **Given** a 403 or a 409 reply, **when** the user clicks Pause or
   Resume, **then** the toast shows the reason and the header does not
   change.
4. **Given** no workflow in flight, **then** the Now header shows neither
   Pause nor Resume.

### Hook `pause-guard.sh`

5. **Given** the control file exists and is younger than `HOLD_SECONDS`,
   **when** the session or a subagent makes a tool call, **then** the hook
   appends `PauseHold` to `events.jsonl`, the call waits, and the page
   chip says `holding — resume continues at once`.
6. **Given** a held call, **when** the user clicks Resume, **then** the
   hook appends `PauseReleased`, the call runs within 2 seconds, and the
   session continues with no terminal input.
7. **Given** a held call, **when** the time reaches `min(since, now) +
   HOLD_SECONDS`, **then** the hook appends `PauseDenied`, denies the call
   with the reason of spec §9.2, and the page chip says `session stopped —
   type /constellation:resume after you resume`. One deadline covers
   the whole pause, not each call. `HOLD_SECONDS` comes from
   `CONSTELLATION_HOLD_SECONDS` (1 to 590, default 540), so the deny
   comes before the 600 s hook timeout lets the tool run.
8. **Given** the control file is older than `HOLD_SECONDS`, **when** the
   session makes a tool call, **then** the hook denies at once with the
   same reason and does not hold. A stale pause never costs a second
   9-minute wait.
9. **Given** no `.constellation/config.json` or no `current-workflow.json`,
   **then** the hook exits 0 at once, with or without a control file.
   **Given** no control file, **then** the hook exits 0 within 100 ms.

### Orchestrator

10. **Given** a tool denial or an agent report that carries `Constellation
    board paused this workflow`, **when** the orchestrator reads it,
    **then** it ends the turn with the pause message and the last save
    point, and it does not save and does not retry.
11. **Given** the orchestrator skill after the change, **then** it holds
    the rule of criterion 10, and the command table mentions the board
    pause next to `/constellation:abort`.

### Limits of the write

12. **Given** `POST /api/control` without `x-board-token`, or with a wrong
    token, or with a foreign `Origin`, or with `Sec-Fetch-Site:
    cross-site`, or with a foreign Host, **then** the reply is 403 and no
    file changes.
13. **Given** a body over 1 KB, a content type other than
    `application/json`, or an action other than `pause` or `resume`,
    **then** the reply is 4xx and no file changes.
14. **Given** `pause` with no workflow in flight, or `resume` with no
    control file, **then** the reply is 409 and no file changes.
15. **Given** `state/` is a symlink, or resolves outside `.constellation`,
    **then** pause replies 403 and writes nothing.
16. **Given** any route other than `POST /api/control`, **when** a client
    sends a method other than GET, **then** the reply is 405, as today.
    **Given** a pause and a resume, **then** the only path in
    `.constellation/` that changed is `state/control.json`.

### Live indicator and terminal

17. **Given** the SSE connection is open, **then** the top bar shows `●
    live`. **Given** the connection drops, **then** `● live` goes away and
    the `disconnected since` chip shows, as today. The indicator reflects
    the connection only, so a quiet `.constellation/` while transcripts
    grow never reads as stale.
18. **Given** a pause in force (criterion 23), **then** the statusline template
    shows `⏸ paused`, from the `aborted` modifier of `tracks.json`.

### Docs, tests, changelog

19. **Given** the README after the change, **then** the board section says
    that the board writes `state/control.json` on Pause, deletes it on
    Resume, and writes nothing else. The heading no longer says
    `read-only`.
20. **Given** spec §9 after the change, **then** it matches what ships:
    `PauseReleased`, the deny at once of criterion 8, and no
    `workflow-paused` metrics event (parked as task 044).
21. **Given** the change, **then** `pause-guard.test.sh` covers criteria 5
    to 9 and 23 with a 2 s hold, `/api/control` has HTTP tests for criteria 1, 2
    and 12 to 16, the board test count grows from 276, and
    `scripts/selftest.sh` prints `selftest: ALL GREEN`.
22. **Given** the CHANGELOG after the change, **then** `[Unreleased]`
    holds the #026 entry, and the one count line reads `138 to <new
    count>` plus the `board-session.test.mjs` count (26 today). The line
    is changed in place, and no second count line exists.

### Safety

23. **Given** a `control.json` that is stale or committed to the repo,
    **then** it does nothing: the hook exits 0 at once and the statusline
    shows no pause. A pause is in force only when the file is not a
    symlink, is at most 1 KB, has `paused: true` and `by: "board"`, and
    its `pid` is a live process whose command line holds `board.mjs`. So
    a pause lasts only while the board that wrote it runs.

## No release in this task

The user validates F001 before any release (21-10-2026). So this task
does not bump `plugin.json` or `marketplace.json`, and the CHANGELOG
entries stay under `[Unreleased]`. The workflow does not merge the PR.

The 1.4.0 release is a later step that the user starts after validation.
It cuts `[Unreleased]` into `[1.4.0]` with one count line (carry-over 025
item 1), bumps the versions, and then checks the 025 success metric in a
scratch project (carry-over 025 item 6).

## Success metric

- Primary: the share of pauses with a hold that end in `PauseReleased`,
  not `PauseDenied`, read from `events.jsonl`. Target 60 % or more.
  Judged after 10 pauses, or 4 weeks of workflows.
- Guardrail: no tool call runs while the control file exists (checked by
  hand at the user validation), and no session waits more than one hold
  for one pause.
- Decision rule: 60 % or more → the hold window is right, keep it. Less
  than 60 % → promote task 043. No pause in 4 weeks of workflows → ask
  the user if the buttons stay.

## Scope pass, 21-10-2026

- In: the `● live` item in the top bar (F001 carry-over 1, moved here at
  the task 023 pass).
- Added: `PauseReleased` (criterion 6) makes the success metric
  measurable. The deny at once (criterion 8) stops a stale pause from
  costing 9 minutes per turn.
- Parked: task 043 (resume after a denied hold with no typing), task 044
  (`workflow-paused` metrics event).
- Not folded in: tasks 041 and 042 stay in the inbox. They change the
  session reader, which this task does not touch.
- Pairing round 2 (Software Architect): criterion 23 and the single
  deadline of criterion 7 added. Both are safety, with no new scope.
- Known limit: work that a subagent did after the last save point runs
  again after `/constellation:resume`.
