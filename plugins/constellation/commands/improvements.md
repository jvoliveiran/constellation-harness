---
description: Portfolio overview of all DX improvements in .constellation/improvements/ — status, category, effort, source, age — grouped by category to surface recurring complexity themes, flagging promoted ones with their task/plan/branch.
argument-hint: "[--flat to sort by age instead of grouping by category]"
---

# /constellation:improvements

Read-only overview of every DX improvement in the project. Never modifies improvements, tasks, plans, state, or metrics.

Improvements are the **complexity-reduction backlog** filed by the orchestrator from DX Analyst findings (Gate 1, advisory). They are a backlog, not a queue — an improvement may sit `open` indefinitely without that being a smell. The value of this view is thematic: several findings in the same category or module are a signal one gate pass can't see.

## Improvement front-matter convention

Every file in `.constellation/improvements/NNN-<slug>.md` carries the front-matter defined in the orchestrator skill (§ Merging results, rule 10):

```markdown
---
status: open                      # open | promoted | done | dropped
category: duplication | dependencies | env-vars | local-setup | test-strategy
effort: S | M | L
source: <plan file or branch that surfaced it>
date-created: DD-MM-YYYY
promoted-to: <task/plan file or branch>   # required once promoted
---
```

The improvement ↔ follow-up link lives **on the improvement side only** (`promoted-to:`); tasks and plans never point back.

## Procedure

1. Glob `.constellation/improvements/*.md`. No files → report "No improvements yet —
   the DX Analyst files them during Gate 1 (or via an ad-hoc DX review)." and stop.
2. For each improvement, parse the front-matter: `status`, `category`, `effort`,
   `source`, `date-created`, `promoted-to`. A file without parseable front-matter is
   listed with status `⚠️ malformed` — never skipped silently. A missing `status`
   (files predating the lifecycle) renders as `open`.
3. **Resolve `promoted-to` links.** A `.md` value → look it up in
   `.constellation/tasks/` then `.constellation/plans/` (and their `archive/`) and
   render the target's own status inline, reusing the /constellation:tasks and
   /constellation:plans vocabularies. A non-`.md` value is a branch name — render it
   verbatim. A `.md` value that matches no file renders `(⚠️ missing)`.
4. Order: group by `category` (largest group first — recurring themes on top), and
   within each group `open` before `promoted` before `done`/`dropped`, then ascending
   by `date-created`. With `--flat` in `$ARGUMENTS`, skip grouping and sort the whole
   table by `date-created` ascending.
5. Render the table, a one-line summary of counts per status, and the actionable
   signals.

## Status vocabulary

| Status | Render |
|---|---|
| `open` | 💡 open |
| `promoted` | 🔗 promoted → `<target>` (`<target status>`) |
| `done` | ✅ done → `<target>` |
| `dropped` | 🚫 dropped |
| unparseable front-matter | ⚠️ malformed |

## Output format

```
Improvements — 5 total (3 open · 1 promoted · 1 done)

  duplication (2)
  #    Improvement              Status                                   Effort  Source                Created
  003  extract-pagination-util  💡 open                                  S       feat/011-audit-log    20-07-2026
  005  dedupe-error-mappers     💡 open                                  M       012-rate-limit.md     28-07-2026

  test-strategy (2)
  001  drop-nested-mock-chain   🔗 promoted → 013-test-refactor (📝 draft) L      007-export-csv.md     12-07-2026
  004  flaky-e2e-retry-loop     ✅ done → tweak/e2e-retries              S       feat/009-bulk-import  22-07-2026

  dependencies (1)
  002  remove-unused-lodash     🚫 dropped                               S       005-dark-mode.md      15-07-2026

→ duplication has 2 open findings — a recurring theme worth a combined tweak
→ 2 open S-effort improvements are tweak-sized — pick one and say "tweak: <title>"
```

- Improvement name = filename without the `NNN-` prefix and `.md` suffix; `#` = the
  `NNN` prefix.
- Actionable signals, listed under the table when present:
  - `→ <category> has N open findings — a recurring theme worth a combined tweak` (N ≥ 2)
  - `→ N open S-effort improvements are tweak-sized — pick one and say "tweak: <title>"`
  - `→ <improvement> was promoted to <target> which is ✅ completed — flip it to done`
  - `→ <improvement> points at <target> which does not exist — fix its promoted-to: field`

This command reports; it never promotes, drops, or files anything.
