---
description: Portfolio overview of all plans in .constellation/plans/ — number, status, dates, commit — in plan-number order, flagging the one currently in flight.
argument-hint: "[--archived to include archived plans]"
---

# /constellation:plans

Read-only overview of every plan in the project. Never modifies plans, state, or metrics.

## Procedure

1. Glob `.constellation/plans/*.md`; when `$ARGUMENTS` contains `--archived`, also glob
   `.constellation/plans/archive/*.md`. No plan files at all → report "No plans yet —
   plans are created by the Software Architect during Planned Work or via Discovery."
   and stop.
2. For each plan, parse the front-matter: `status`, `version`, `date-created`,
   `last-edit`, `commit`, `scope-approved-by`. A file without parseable front-matter is
   listed with status `⚠️ malformed` — never skipped silently.
3. For `draft` plans, count the open items under an `## Open Questions` heading (if the
   section exists) — drafts are blocked on exactly those.
4. If `.constellation/state/current-workflow.json` exists and its `plan` field matches a
   listed file, mark that plan **▶ in flight** with the state's `currentStep`.
5. Sort by plan number ascending (the `NNN-` filename prefix — plan numbers are
   chronological, so this IS the logical sequence). Archived plans, when included, keep
   their number order but render in a separate section below the active ones.
6. Render the table and a one-line summary of counts per status.

## Status vocabulary

| Status | Render |
|---|---|
| `draft` | 📝 draft (+ `— N open questions` when any) |
| `approved` | 👍 approved |
| `in-progress` | 🔨 in-progress (+ `▶ <currentStep>` when it is the in-flight workflow) |
| `completed` | ✅ completed (+ short `commit` SHA) |
| archived (in `archive/`) | 📦 archived |
| unparseable front-matter | ⚠️ malformed |

## Output format

```
Plans — 4 active (1 draft · 1 approved · 1 in-progress · 1 completed) · 2 archived

  #    Plan                     Status                          Created      Last edit
  001  add-audit-log            ✅ completed (e57e8de)          28-06-2026   02-07-2026
  002  rate-limit-login         🔨 in-progress ▶ parallel-gate-1 01-07-2026  04-07-2026
  003  export-csv               👍 approved                     03-07-2026   03-07-2026
  004  dark-mode                📝 draft — 2 open questions     04-07-2026   04-07-2026

Archived (--archived):
  000  spike-cleanup            📦 archived                     10-06-2026   12-06-2026
```

- Plan name = filename without the `NNN-` prefix and `.md` suffix.
- Omit the Archived section entirely when `--archived` was not passed; instead append
  `(N archived — rerun with --archived to include)` to the summary line when
  `archive/` is non-empty.
- A `draft` plan whose open questions block the pipeline and a `completed` plan whose
  30-day archive window has passed (per the orchestrator's Plan Lifecycle) are the two
  actionable signals — mention them under the table when present:
  `→ 004-dark-mode is blocked on 2 open questions` /
  `→ 001-add-audit-log completed 30+ days ago — Technical Writer can archive it`.

This command reports; it never resumes, approves, or archives anything.
