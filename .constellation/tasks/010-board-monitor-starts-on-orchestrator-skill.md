---
status: done
commit: a18dc728949875cb5f42b26ad94b8a2a4a4d6173
type: fix
source: user
related: 002-board-backlog-tree-and-packaging.md
date-created: 07-10-2026
last-edit: 07-10-2026
---
# Board monitor starts on the orchestrator skill, not at session start

Request: "Implement a fix to Start the monitor when the orchestrator skill
loads instead of at session start"

## Problem

Since 1.3.0 the `experimental.monitors` entry uses `when: "always"`. The
plugin is enabled at user scope, so the monitor runs in every interactive
session of every project. In a project without `.constellation/config.json`,
`board.mjs --quiet` exits 0 with no output, as criterion 5 of task 002
requires. Claude Code then shows this notice at session start:

    Monitor "Constellation board on http://127.0.0.1:4411" ended without producing output (exit 0)

The plugin rule is that it stays invisible outside initialized projects.
This notice breaks that rule.

## Fix

Start the monitor when the `constellation:orchestrator` skill is invoked.
Projects that are not initialized never load that skill, so no process
starts and no notice appears. In an initialized project, the board starts
when a workflow begins. This changes criterion 4 of task 002: the board no
longer starts at session start.
