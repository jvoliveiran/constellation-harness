---
status: inbox
type: debt
source: user
related: 002-board-backlog-tree-and-packaging.md
date-created: 06-10-2026
last-edit: 07-10-2026
---
# Board phase 2 — manual verification

Phase 2 shipped in 1.3.0 (PR #27, commit `1dbb9a9`). Automated tests cover
the logic. Four checks need a browser or an interactive Claude Code
session, so they stay open here as one pending action. The steps come from
the manual tests in `plans/002-board-backlog-tree-and-packaging.md`.

Already verified headless on 06-10-2026, so do not repeat: the status edit
reached the feed in 239–256 ms over 8 edits, and a snapshot of
guardei-service loads in about 15 ms.

## Before you start

- Install plugin version 1.3.1 in Claude Code. Checks 2, 3, and 4 need it.
- When the port check below shows a listener, close the sessions of the
  other initialized projects first. Since 1.3.0, the first initialized
  project that loads the orchestrator skill holds port 4411, and the
  others stand by.

```
lsof -i :4411
```

## 1. The page in a browser

Use a throwaway copy, so you can break files without harm to the real
project. guardei-service has 2 epics, 197 tasks, and 36 plans.

```
mkdir -p /tmp/board-check
cp -R /Users/joaooliveira/study/guardei-service/.constellation /tmp/board-check/
node /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.mjs /tmp/board-check --port 4412
```

1. Open `http://127.0.0.1:4412`.
2. Compare the tree with `/constellation:backlog --all` in guardei-service.
3. Open the done group. Wait 10 seconds.
4. Remove the front-matter from one task file in the copy.
5. With an editor, change `status: inbox` to `status: refined` in another
   task file.
6. Stop the server with Ctrl-C. Wait 10 seconds.

Expected:

- Step 2: grouping and glyphs match. The counts are inbox 24, refined 6,
  in-progress 1, parked 9, done 155, and dropped 2. Done and dropped
  start collapsed.
- Step 3: the group stays open across updates.
- Step 4: the task shows a `malformed` badge, appears in Needs attention,
  and the warning text is visible under its row.
- Step 5: within 2 seconds the feed shows `<file> inbox → refined` with
  the save time.
- Step 6: the badge reads `disconnected since HH:MM — showing last data`,
  and every elapsed and running timer stops.

Known observation, decide while you test: Needs attention lists 121 tasks
before any edit. Every one is an `unknown field` warning for `category`,
`effort`, or `found-during`, which the artifact model does not define. The
board follows the spec, but the flood can hide the malformed task of step 4.
Choose one: add these fields to the spec and to `KNOWN_FIELDS`, or keep
unknown-field-only items out of Needs attention and show the badge on the
row only. File the choice as a follow-up task.

## 2. The board starts when the orchestrator skill loads

1. Start a session in `/Users/joaooliveira/study/guardei-service`.
2. Run `/constellation:board`.
3. Run `/constellation:orchestrator`, or start any workflow.
4. Run `/constellation:board` again.
5. Open the URL that it prints.

Expected: step 2 prints `Board not running`. Step 4 prints
`Board running: http://127.0.0.1:4411` with no manual start. The page
header shows the guardei-service path.

## 3. A second session takes over the port

1. Keep the session of check 2 open. Start a second session in the same
   directory. Load the orchestrator skill in the second session.
2. Exit the first session.
3. Reload the page within 10 seconds.

Expected: the page loads again, served by the board of the second
session. The header still shows the guardei-service path.

## 4. No board process stays after the session ends

1. Exit the last guardei-service session.
2. Run the commands below.
3. Start a session in a directory without `.constellation/config.json`,
   for example `/tmp`.
4. Look at the task panel for any notice about the monitor exit. Expect no
   notice. The monitor starts only when the orchestrator skill loads, so it
   must not run here. A notice is a failure.
5. Run the commands below again.

```
lsof -i :4411
pgrep -fl board.mjs
```

Expected: steps 2 and 5 print nothing.

## Done when

- [ ] 1. The page in a browser
- [ ] 2. The board starts when the orchestrator skill loads
- [ ] 3. A second session takes over the port
- [ ] 4. No board process stays after the session ends

When a check fails, file a fix task with `related:` set to this file, and
add its file name to this task. When all four pass, set this task to `done`.
