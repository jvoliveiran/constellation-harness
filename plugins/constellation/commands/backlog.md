---
description: Tree view of the work hierarchy — epics → features → tasks — with status, type, and plan presence, derived from child front-matter links.
argument-hint: "[--epic <E..>] [--feature <F..>] [--type <t>] [--status <s>]"
---

# /constellation:backlog

Read-only tree view of the whole work hierarchy (artifact model v1). Never modifies anything.

Links point up only (task → feature → epic), so this command **derives** the tree by scanning child front-matter — parents never list children.

## Procedure

1. Glob `.constellation/epics/*.md`, `.constellation/features/*.md`,
   `.constellation/tasks/*.md`. Nothing at all → report "Backlog is empty — the
   orchestrator files tasks at intake; epics and features come from Discovery." and
   stop.
2. Parse front-matter of every file. Malformed files render `⚠️ malformed`, never
   skipped silently.
3. Build the tree: attach each feature to its `epic:`, each task to its `feature:`.
   Features without an epic and tasks without a feature render under
   `(no epic)` / `(standalone tasks)`. A link target that matches no file renders
   `(⚠️ missing)`.
4. For each task, check the plan pairing (`plans/NNN-<slug>.md`, same number and slug)
   and render its maturity when present. If the state file's `task` matches, mark
   **▶ in flight**.
5. Order: epics by number, features inside an epic by `order:` (then number), tasks
   inside a feature by `order:` (then number). Apply any `--epic` / `--feature` /
   `--type` / `--status` filters from `$ARGUMENTS`.
6. Render the tree, per-level status glyphs, and the signals.

## Rendering

Reuse the status vocabularies of /constellation:tasks (tasks) and these for grouping
levels: 🌱 draft / 🚀 active / ✅ done / 🚫 dropped.

```
Backlog — 1 epic · 2 features · 6 tasks (2 inbox · 1 in-progress · 2 done · 1 parked)

🚀 E01 mvp-launch
├── 🚀 F001 user-onboarding (order 1)
│   ├── ✅ 011 add-audit-log (feature) — plan 👍
│   ├── 🔨 012 rate-limit-login (feature) — plan 👍 ▶ parallel-gate-1
│   └── 📥 014 fix-cursor-pagination (fix)
└── 🌱 F002 billing (order 2)
    └── 📥 017 stripe-integration (feature)

(standalone tasks)
├── ✅ 013 export-csv (feature) — plan 👍
├── 🅿️ 015 dark-mode-toggle (feature) — revisit: 100+ active users
└── 📥 016 dedupe-error-mappers (debt · dx-analyst)

→ E01 is active with 2/3 F001 tasks done — F001 nearly complete
→ 🌱 F002 has a task attached — it can go active
```

- Signals, when true:
  - `→ 🌱 <epic/feature> has a child attached — it can go active` (activation rule met)
  - `→ 🚀 <feature> has all tasks done/dropped — confirm done with the PM`
  - `→ <child> links <parent> which does not exist — fix the link`
  - `→ <task> is parked and its revisit trigger may have fired`

This command reports; it never activates, closes, or files anything.
