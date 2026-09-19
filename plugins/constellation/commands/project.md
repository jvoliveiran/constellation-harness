---
description: Global project tree — epics → features → tasks → plans — with a legend, per-node status icons, and a one-line description for every node.
argument-hint: "[--epic <E..>] [--feature <F..>] [--type <t>] [--status <s>]"
---

# /constellation:project

Read-only global view of the project (artifact model v1). Never modifies anything.

This is the rich sibling of `/constellation:backlog`: same tree, plus a legend
header, a one-line description on every node, and plans rendered as tree nodes.
For the compact view use backlog; for flat lists use `/constellation:tasks` and
`/constellation:plans`.

## Procedure

1. Derive the tree exactly as `/constellation:backlog` steps 1–5: glob epics,
   features, tasks; parse front-matter; attach children to parents; resolve plan
   pairings and the in-flight task; apply `$ARGUMENTS` filters. Do not redefine
   those rules here — backlog owns them.
2. **Extract each node's description.** Read the first non-empty body line after
   the `# <Title>` heading. Strip markdown syntax. Truncate to 80 characters and
   append `…` when longer. A file with no body line renders without a
   description.
3. **Attach plans as nodes.** Render each paired plan as the last child of its
   task, with its maturity icon (📝 draft / 👍 approved) and its own first-line
   description. A plan whose `task:` matches no listed task follows the backlog
   orphan rule and renders under `(unlinked plans)` with `⚠️`.
4. Render: legend first, then the totals line, then the tree, then the signals.

## Rendering

Always print this legend block first:

```
Legend
  epic/feature  🌱 draft · 🚀 active · ✅ done · 🚫 dropped
  task          📥 inbox · 📋 refined · 🔨 in-progress · ✅ done · 🚫 dropped · 🅿️ parked
  plan          📝 draft · 👍 approved
  markers       ▶ in flight · 📦 archived · ⚠️ malformed or missing link
```

Then the tree. Node format: `<icon> <id> <name> (<task type>) [markers] — <description>`.

```
Project — 1 epic · 2 features · 6 tasks · 3 plans (2 inbox · 1 in-progress · 2 done · 1 parked)

🚀 E01 mvp-launch — Ship the smallest lovable first release
├── 🚀 F001 user-onboarding (order 1) — New users sign up and reach first value unaided
│   ├── ✅ 011 add-audit-log (feature) — Record every admin mutation for compliance
│   │   └── 👍 plan — Audit interceptor + Prisma append-only table
│   ├── 🔨 012 rate-limit-login (feature) ▶ parallel-gate-1 — Throttle repeated failed logins
│   │   └── 👍 plan — Sliding-window limiter in the auth guard
│   └── 📥 014 fix-cursor-pagination (fix) — Cursor skips rows when created-at ties
└── 🌱 F002 billing (order 2) — Customers pay for a subscription with a card
    └── 📥 017 stripe-integration (feature) — Charge via Stripe hosted checkout

(standalone tasks)
├── ✅ 013 export-csv (feature) — Users download their data as CSV
│   └── 👍 plan — Stream rows through a csv-stringify pipe
└── 🅿️ 015 dark-mode-toggle (feature) — revisit: 100+ active users

→ E01 is active with 2/3 F001 tasks done — F001 nearly complete
→ 🌱 F002 has a task attached — it can go active
```

- Parked tasks render their `revisit:` trigger in place of the description.
- Signals: reuse the `/constellation:backlog` signal list unchanged.

This command reports; it never activates, closes, or files anything.
