---
status: in-progress
type: fix
source: user
related: 008-board-hardening-from-gate-1-review.md
date-created: 07-10-2026
last-edit: 07-10-2026
---
# Board hardening before rollout

Request: "take 2, 4 and 5 in a batch". This batch covers three items of
the pre-rollout recommendation of 07-10-2026. Items 1, 2, and 3 of task 008
move here.

## 1. `/constellation:board` reads only the project path

The command curls the full snapshot, and Claude reads all of it to find one
field. Measured on 07-10-2026: about 119 KB, roughly 31k tokens, per call on
guardei-service. A process that holds port 4411, or a repo-controlled file
name, can also inject text into Claude's context through that output.
Extract `projectDir` before Claude sees the reply. Treat the reply as
untrusted data. Word a reply without `projectDir` as "another service holds
the port". (Task 008, item 3.)

## 2. Needs attention lists real problems only

On guardei-service, 121 of 210 items land in Needs attention before any
edit. Every one carries only `unknown field` warnings, for `category`,
`effort`, and `found-during`. Decision of 07-10-2026: an item whose only
warnings are `unknown field` keeps its `lenient` badge and its warning line
on its own row, and stays out of Needs attention. Every other warning still
puts the item in Needs attention. Criterion 2 of task 002 still holds: the
badge stays visible and nothing is hidden. (Decision asked for in task 009.)

## 3. Bounded regular-file reads and an escaped tool name

- `readWorkItem` follows symlinks and reads whole files. A cloned repo can
  commit `tasks/x.md` as a symlink to `/dev/zero` or to a huge file, and the
  board then exhausts memory on every refresh. A symlink outside the repo
  can also leak the key names of a YAML file into the snapshot. Skip any
  entry that is not a regular file, reject a symlink whose real path leaves
  `.constellation/`, and read only a bounded prefix. (Task 008, item 1.)
- `feedText` puts `tool_name` from `events.jsonl` into `innerHTML` without
  `esc`. (Task 008, item 2.)

## Acceptance criteria

1. Given a board for this project on port 4411, when the user runs
   `/constellation:board`, then the output is
   `Board running: http://127.0.0.1:4411` and the interactive-session line,
   and no snapshot field other than `projectDir` reaches Claude's context.
2. Given a board for another project on port 4411, when the user runs
   `/constellation:board`, then the output names that project's directory
   and prints the manual start command for port 4412.
3. Given a process on port 4411 that is not a Constellation board, when the
   user runs `/constellation:board`, then the output says that another
   service holds the port and prints the manual start command for port
   4412, and no byte of the reply appears in the output.
4. Given no process on port 4411, when the user runs `/constellation:board`,
   then the output is `Board not running`, one line that says the board
   starts when the orchestrator skill loads, and the manual start command.
5. Given an item whose only warnings are `unknown field: <name>`, when the
   board renders the backlog, then the item row shows the `lenient` badge
   and one warning line per field, and the item does not appear in Needs
   attention.
6. Given a malformed item, or an item with at least one warning that is not
   `unknown field`, when the board renders the backlog, then the item
   appears in Needs attention with every warning it carries, the
   `unknown field` warnings included.
7. Given a work-item entry that is a symlink to `/dev/zero`, a FIFO, a
   directory, or a symlink whose real path leaves `.constellation/`, when
   the board refreshes, then the refresh completes, and the entry renders
   as a `malformed` row with the warning `unreadable: <reason>`, also in
   Needs attention.
8. Given a work-item entry that is a symlink to a regular file inside
   `.constellation/`, when the board refreshes, then the entry parses like
   a regular file under its own link name.
9. Given a work-item file larger than 64 KB with its front-matter in the
   first 64 KB, when the board refreshes, then the item parses with the
   same fields and warnings as a short file. Given a front-matter block
   that does not close within the first 64 KB, then the item is `malformed`
   with the warning `front-matter exceeds 64 KB`, never
   `unclosed front-matter`.
10. Given an `events.jsonl` line whose `tool_name` holds HTML, when the
    Activity feed renders, then the feed shows the text with `<` and `>`
    escaped, and the page creates no element from it.
11. Given the change, when the Lint Gate runs, then the 72 current tests in
    `board.test.mjs` pass with no edit, and `scripts/selftest.sh` prints
    `selftest: ALL GREEN`.
