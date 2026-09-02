---
description: Portfolio overview of all tasks in .constellation/tasks/ — status, type, source, feature link, plan pairing — flagging the inbox queue and the in-flight task.
argument-hint: "[--type <t>] [--status <s>] [--archived to include archived tasks]"
---

# /constellation:tasks

Read-only overview of every task in the project. Never modifies tasks, plans, state, or metrics.

The **task is the unit of work** (artifact model v1): every workflow starts on a task filed at intake and ends on that task. This command shows the pipeline — what is queued, what is in flight, what shipped. For the full hierarchy (epics → features → tasks), use `/constellation:backlog`.

## Task front-matter convention

Every file in `.constellation/tasks/NNN-<slug>.md` carries the front-matter defined in the orchestrator's `references/artifact-model.md`:

```markdown
---
status: inbox            # inbox | refined | in-progress | done | dropped | parked
type: feature            # feature | fix | refactor | debt | spike | discovery
source: user             # user | dx-analyst | codex | <agent/tool/person>
feature: F001-user-onboarding.md   # optional
related: 009-old-fix.md  # optional
revisit: <trigger>       # required when parked
commit: <sha>            # set on done
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
---
```

Links point up only: the task carries `feature:`; the plan carries `task:`. Neither parent points back.

## Procedure

1. Glob `.constellation/tasks/*.md`; when `$ARGUMENTS` contains `--archived`, also glob
   `.constellation/tasks/archive/*.md`. No task files at all → report "No tasks yet —
   the orchestrator files one at intake for every workflow (see the orchestrator's
   artifact model)." and stop.
2. For each task, parse the front-matter. A file without parseable front-matter is
   listed with status `⚠️ malformed` — never skipped silently.
3. **Resolve the plan pairing.** A plan for task `NNN-<slug>.md` is
   `.constellation/plans/NNN-<slug>.md` (then `plans/archive/`) — same number and slug.
   When it exists, render its maturity inline (📝 draft / 👍 approved).
4. If `.constellation/state/current-workflow.json` exists and its `task` field matches a
   listed file, mark that task **▶ in flight** with the state's `currentStep`.
5. Apply `--type <t>` / `--status <s>` filters from `$ARGUMENTS` when present (keep the
   totals line unfiltered).
6. Sort by status group — `inbox` first (the actionable queue), then `refined`,
   `in-progress`, `parked`, `done`, `dropped`, malformed — and within each group by
   task number ascending. Archived tasks, when included, render in a separate section.
7. Render the table, a one-line summary of counts per status, and the actionable
   signals.

## Status vocabulary

| Status | Render |
|---|---|
| `inbox` | 📥 inbox |
| `refined` | 📋 refined (+ ` · plan 📝/👍` when the paired plan exists) |
| `in-progress` | 🔨 in-progress (+ `▶ <currentStep>` when in flight) |
| `done` | ✅ done (+ short `commit` SHA) |
| `dropped` | 🚫 dropped |
| `parked` | 🅿️ parked — `<revisit trigger>` |
| archived (in `archive/`) | 📦 archived |
| unparseable front-matter | ⚠️ malformed |

## Output format

```
Tasks — 5 active (2 inbox · 1 refined · 1 in-progress · 1 done) · 1 parked

  #    Task                   Status                            Type      Source      Created
  014  fix-cursor-pagination  📥 inbox                          fix       codex       20-07-2026
  016  dedupe-error-mappers   📥 inbox                          debt      dx-analyst  22-07-2026
  013  export-csv             📋 refined · plan 👍              feature   user        18-07-2026
  012  rate-limit-login       🔨 in-progress ▶ parallel-gate-1  feature   user        16-07-2026
  011  add-audit-log          ✅ done (e57e8de)                 feature   user        12-07-2026
  015  dark-mode-toggle       🅿️ parked — 100+ active users     feature   user        21-07-2026

→ 2 inbox tasks awaiting pickup — 016 is debt-sized, say "tweak: dedupe-error-mappers"
```

- Task name = filename without the `NNN-` prefix and `.md` suffix; `#` = the number.
- Omit the Archived section entirely when `--archived` was not passed; instead append
  `(N archived — rerun with --archived to include)` to the summary line when
  `archive/` is non-empty.
- Actionable signals, listed under the table when present:
  - `→ N inbox tasks awaiting pickup` (name debt/fix ones that are tweak-sized)
  - `→ <task> is parked and its revisit trigger may have fired — review it`
  - `→ <task> links <feature> which does not exist — fix its feature: field`
  - `→ N dx-analyst debt tasks in the same category — a recurring theme worth a combined tweak`

This command reports; it never refines, drops, or archives anything.
