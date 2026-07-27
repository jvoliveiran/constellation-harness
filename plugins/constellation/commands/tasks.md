---
description: Portfolio overview of all task specs in .constellation/tasks/ — status, source, dates, linked plan — flagging the inbox queue and the tasks already refined into plans.
argument-hint: "[--archived to include archived tasks]"
---

# /constellation:tasks

Read-only overview of every task spec in the project. Never modifies tasks, plans, state, or metrics.

Task specs are the harness inbox: work items captured by **other agents, tools, or humans before they are plans**. The ideal flow is task → plan (see the orchestrator's Task Lifecycle) — this command shows which tasks are still waiting and which already graduated into a plan.

## Task spec front-matter convention

Every file in `.constellation/tasks/*.md` carries this lightweight front-matter, so the listing is mechanical instead of forensic:

```markdown
---
status: inbox            # inbox | refined | done | dropped
source: codex            # optional — agent/tool/person that filed it
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
plan: 003-export-csv.md  # required once refined — the plan this task became
---
```

The body is free-form — whatever context the filing agent had. The task ↔ plan link lives **on the task side only** (`plan:`); plans never point back.

## Procedure

1. Glob `.constellation/tasks/*.md`; when `$ARGUMENTS` contains `--archived`, also glob
   `.constellation/tasks/archive/*.md`. No task files at all → report "No tasks yet —
   task specs land in .constellation/tasks/ with `status: inbox` front-matter (see the
   orchestrator's Task Lifecycle)." and stop.
2. For each task, parse the front-matter: `status`, `source`, `date-created`,
   `last-edit`, `plan`. A file without parseable front-matter is listed with status
   `⚠️ malformed` — never skipped silently.
3. **Resolve plan links.** For every task with a `plan:` field, look the file up in
   `.constellation/plans/` (then `plans/archive/`) and read the plan's own `status`
   front-matter. Render the link inline using the /constellation:plans status
   vocabulary. A `plan:` value that matches no file renders `(⚠️ missing)`.
4. Sort by status group — `inbox` first (it is the actionable queue), then `refined`,
   `done`, `dropped`, malformed — and within each group ascending by `date-created`.
   Task filenames are chosen by whoever files them, so name order carries no meaning.
   Archived tasks, when included, render in a separate section below the active ones.
5. Render the table, a one-line summary of counts per status, and the actionable
   signals.

## Status vocabulary

| Status | Render |
|---|---|
| `inbox` | 📥 inbox |
| `refined` | 🔗 refined → `<plan>` (`<plan status>`) |
| `done` | ✅ done → `<plan>` |
| `dropped` | 🚫 dropped |
| archived (in `archive/`) | 📦 archived |
| unparseable front-matter | ⚠️ malformed |

`<plan>` is the plan filename without `.md`; `<plan status>` reuses the
/constellation:plans rendering (📝 draft / 👍 approved / 🔨 in-progress / ✅ completed /
📦 archived).

## Output format

```
Tasks — 4 active (2 inbox · 1 refined · 1 done) · 1 dropped

  Task                     Status                                      Source   Created      Last edit
  fix-cursor-pagination    📥 inbox                                    codex    20-07-2026   20-07-2026
  bulk-user-import         📥 inbox                                    pm       22-07-2026   22-07-2026
  export-csv               🔗 refined → 003-export-csv (👍 approved)   user     18-07-2026   19-07-2026
  add-audit-log            ✅ done → 001-add-audit-log                 codex    12-07-2026   16-07-2026
  dark-mode-toggle         🚫 dropped                                  user     14-07-2026   15-07-2026

→ 2 inbox tasks awaiting refinement — pick one and ask for a plan (task → plan is the ideal flow)
```

- Task name = filename without the `.md` suffix (and without a `NNN-` prefix when one
  is present).
- `Source` column from `source:`; blank when absent.
- Omit the Archived section entirely when `--archived` was not passed; instead append
  `(N archived — rerun with --archived to include)` to the summary line when
  `archive/` is non-empty.
- Actionable signals, listed under the table when present:
  - `→ N inbox tasks awaiting refinement — pick one and ask for a plan (task → plan is the ideal flow)`
  - `→ <task> links <plan> which is ✅ completed — flip the task to done`
  - `→ <task> links <plan> which does not exist — fix its plan: field`

This command reports; it never refines, drops, or archives anything.
