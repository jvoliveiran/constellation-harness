---
description: Show the current Constellation workflow state — track, step, gates passed, review loops.
---

# /constellation:status

Show the current workflow state without interrupting anything.

1. Read `.constellation/state/current-workflow.json`.
2. If it does not exist: report "No workflow in progress." and stop.
3. If it exists, render the **Progress Banner** (defined in the `constellation:orchestrator` skill, from `.constellation/tracks.json`) followed by the vertical step table — one row per step of the track, `✓` done / `▶` current / `·` pending, with per-step detail from state:

```
🌌 planned 6/10 │ 📐✓ 🔭✓ 🌿✓ 🔨✓ 🧹✓ ▶🔍 Review Gate · · · · │ feat/011-audit-log

  📐 Plan          ✓  plan: 011-add-audit-log.md
  🔭 Plan Review   ✓  cross-model: PASS
  🌿 Branch        ✓  feat/011-audit-log
  🔨 Implement     ✓
  🧹 Lint Gate     ✓
  🔍 Review Gate   ▶  loop 1/3 — reviewer: BLOCKED (2), security: PASS
  🧪 QA Gate       ·
  🧭 Verify        ·
  🚀 PR            ·
  🚢 Ship          ·
```

   Per-step details come from existing state fields: `plan` (Plan), `planReviewResult` (Plan Review), `branch` (Branch), `gate1Results` + `reviewLoopCount` (Review Gate), `gate2Results` (QA/Tests), `prNumber` (PR), `hadBlockers` (Ship). `waitingOn: "user"` → append `⛔ awaiting your decision` to the banner and name the pending question.
4. Below the table, report: track and original request, model profile, started / last updated timestamps.

Follow the banner's rendering rules from the orchestrator skill (optional-step filtering, fix-loop anchoring, `post-pr` as an extra step, unknown ids as `⚙️ <raw-id>`).

This command never modifies state and never resumes the workflow — it only reports. To continue an interrupted workflow, use `/constellation:resume`.
