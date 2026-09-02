---
description: Portfolio overview of all plans in .constellation/plans/ — maturity, task pairing, dates — in number order, flagging the one currently in flight.
argument-hint: "[--archived to include archived plans]"
---

# /constellation:plans

Read-only overview of every plan in the project. Never modifies plans, state, or metrics.

A plan is the implementation detail of one task (artifact model v1): same number and slug as its task, `task:` link in front-matter. Plans carry **document maturity only** (`draft → approved`); work state lives on the task. For the pipeline view use `/constellation:tasks`; for the hierarchy use `/constellation:backlog`.

## Procedure

1. Glob `.constellation/plans/*.md`; when `$ARGUMENTS` contains `--archived`, also glob
   `.constellation/plans/archive/*.md`. No plan files at all → report "No plans yet —
   plans are created by the Software Architect as the first work output of a planned
   task." and stop.
2. For each plan, parse the front-matter: `status`, `task`, `date-created`,
   `last-edit`, `scope-approved-by`. A file without parseable front-matter is listed
   with status `⚠️ malformed` — never skipped silently.
3. **Resolve the task.** Look the `task:` file up in `.constellation/tasks/` (then
   `tasks/archive/`) and read its `status` — render it inline using the
   /constellation:tasks vocabulary. A `task:` value that matches no file renders
   `(⚠️ missing)`; a plan without a `task:` field renders `⚠️ unlinked` (v0 leftover —
   run the migration).
4. For `draft` plans, count the open items under an `## Open Questions` heading (if the
   section exists) — drafts are blocked on exactly those.
5. If `.constellation/state/current-workflow.json` exists and its `plan` field matches a
   listed file, mark that plan **▶ in flight** with the state's `currentStep`.
6. Sort by number ascending. Archived plans, when included, keep their number order but
   render in a separate section below the active ones.
7. Render the table and a one-line summary of counts per status.

## Status vocabulary

| Status | Render |
|---|---|
| `draft` | 📝 draft (+ `— N open questions` when any) |
| `approved` | 👍 approved |
| archived (in `archive/`) | 📦 archived |
| unparseable front-matter | ⚠️ malformed |

The task column reuses the /constellation:tasks rendering (📥 📋 🔨 ✅ 🚫 🅿️).

## Output format

```
Plans — 4 active (1 draft · 3 approved) · 2 archived

  #    Plan                Status                       Task            Created      Last edit
  001  add-audit-log       👍 approved                  ✅ done         28-06-2026   02-07-2026
  002  rate-limit-login    👍 approved ▶ parallel-gate-1 🔨 in-progress 01-07-2026   04-07-2026
  003  export-csv          👍 approved                  📋 refined      03-07-2026   03-07-2026
  004  dark-mode           📝 draft — 2 open questions  📋 refined      04-07-2026   04-07-2026
```

- Plan name = filename without the `NNN-` prefix and `.md` suffix.
- Omit the Archived section entirely when `--archived` was not passed; instead append
  `(N archived — rerun with --archived to include)` to the summary line when
  `archive/` is non-empty.
- Actionable signals, mentioned under the table when present:
  `→ 004-dark-mode is blocked on 2 open questions` /
  `→ 001-add-audit-log's task is done 30+ days — Technical Writer can archive both` /
  `→ 005-legacy is ⚠️ unlinked — v0 plan, run the artifact-model migration`.

This command reports; it never resumes, approves, or archives anything.
