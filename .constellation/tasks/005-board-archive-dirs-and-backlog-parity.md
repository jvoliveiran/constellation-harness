---
status: inbox
type: feature
source: software-architect
related: 002-board-backlog-tree-and-packaging.md
date-created: 06-10-2026
last-edit: 06-10-2026
---
# Board archive directories and backlog parity

Deferred from task 002. Scan `tasks/archive/` and `plans/archive/` and show
archived items in a collapsed group. Match the `--all` rule and the
derived-completion check of `/constellation:backlog`, so the page and the
command show the same tree.

## Addition from the task 002 verification

- **One banner for an unmigrated v0 project.** Measured on 06-10-2026 on `user-service`, which has no `artifactModel` in its config. The project has no task files, so all 11 v0 plans land in Needs attention, each with `unknown field: commit`, `unknown field: version`, and `plan without task`. When `config.json` has no `artifactModel`, show one banner that names the migration, and stop the per-plan v0 warnings.
