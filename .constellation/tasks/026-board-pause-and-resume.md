---
status: refined
type: feature
source: user
feature: F001-board-ui-overhaul.md
order: 5
date-created: 14-10-2026
last-edit: 19-10-2026
---
# Board UI: pause and resume a workflow from the page

Phase 5 of `docs/specs/board-ui-v2.md` (§9). A Pause button writes
`state/control.json`. A new `PreToolUse` hook holds the next tool call
while the file exists and tells the model to stop when the hold expires.
A Resume button deletes the file. This is the first write the board makes.

User feedback, 14-10-2026: "There should be a pause button on the left
area and also a resume (play button)."

Limit: Claude Code has no external pause or prompt injection. A resume
within the hold continues the session with no typing. A resume after the
hold expired needs `/constellation:resume` in the terminal, and the page
says so.

Depends on task 022.

## Acceptance criteria

1. Given a workflow in flight and no control file, then the Now header
   shows Pause. Given a click, then `state/control.json` exists with
   `paused: true`, `since`, and `by: "board"`, the header shows `⏸ paused
   since hh:mm` and Resume, and a toast confirms.
2. Given the control file exists, when the session makes a tool call, then
   the hook appends `PauseHold` to the event log and the call waits. Given
   the user clicks Resume, then the file is gone, the call runs within 2
   seconds, and the session continues with no terminal input.
3. Given the hold reaches `HOLD_SECONDS`, then the hook appends
   `PauseDenied` and denies the call with the reason of spec §9.2, the
   orchestrator ends the turn with the last save point, and the page chip
   says `session stopped — type /constellation:resume after you resume`.
4. Given no `current-workflow.json`, then the hook exits 0 at once, with
   or without a control file. Given no control file, then the hook exits 0
   within 100 ms.
5. Given `POST /api/control` without `x-board-token`, or with a foreign
   `Origin`, or with `Sec-Fetch-Site: cross-site`, then the response is
   403 and no file changes. Given `pause` with no workflow, or `resume`
   with no control file, then the response is 409.
6. Given `state/` is a symlink outside `.constellation`, then pause
   responds 403 and writes nothing.
7. Given the control file exists, then the statusline shows `⏸ paused`,
   and the board shows the same chip.
8. Given the orchestrator skill after the change, then it holds the pause
   rule of spec §9.3, the command table mentions the board pause next to
   `/constellation:abort`, and the metrics table lists `workflow-paused`.
9. Given the README after the change, then the board section says the
   board writes `state/control.json` on Pause and deletes it on Resume,
   and nothing else.
10. Given the change, then `pause-guard.test.sh` covers criteria 2 to 4
    with a 2 s hold, `/api/control` has HTTP tests, and
    `scripts/selftest.sh` prints `selftest: ALL GREEN`.

## Scope notes from the task 023 scope pass (19-10-2026)

- F001 carry-over 1: the `● live` item in the top bar (spec §4.3) moves here. Pause and Resume need a live connection, so the live state belongs with them. The page already shows the `disconnected since` chip.
