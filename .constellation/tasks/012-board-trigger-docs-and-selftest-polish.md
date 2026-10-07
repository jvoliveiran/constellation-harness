---
status: inbox
type: debt
source: dx-analyst, code-reviewer, security-analyst
related: 010-board-monitor-starts-on-orchestrator-skill.md
date-created: 07-10-2026
last-edit: 07-10-2026
---
# Board trigger: docs and selftest polish from the task 010 review

Gate 1 of task 010 passed with no blockers. These items stayed open under
the default fix policy.

1. **One source for the start condition.** "The board starts when the orchestrator skill loads" appears in the README Board bullet, the README command table, `commands/board.md`, and the CHANGELOG. Keep the full text in the Board bullet and in `board.md`. Reduce the command-table row to "Prints the board URL or the start command. Read-only."
2. **Version drift check.** Add one `jq` equality check to selftest step 3b: the version in `plugins/constellation/.claude-plugin/plugin.json` equals the constellation entry in `.claude-plugin/marketplace.json`.
3. **Name the trigger in `/constellation:board`.** The "Board not running" branch says the board starts when the orchestrator skill loads, but not how to load it. Print "Run /constellation:orchestrator or start any workflow". Tell an initialized project before the skill loads apart from a project with no `.constellation/config.json`.
4. **Say that a plain chat may never start the board.** No hook loads the orchestrator skill. A session that only chats never starts the board. Add one sentence to the README and the CHANGELOG.
5. **Mark plan 002 as superseded on the trigger.** Plan 002 still records `when: "always"` as a resolved decision. Add a one-line note that points at task 010.
6. **Selftest step 3b message for a missing `when`.** A monitor with no `when` defaults to `always`, but the step reports `when '' must match ...`. Print "when is missing (defaults to 'always')".

Checked and closed at review time: step 3b cannot fail open on a malformed `plugin.json` or a missing `jq`, because selftest step 2 already fails the run in both cases. Verified on 07-10-2026.
