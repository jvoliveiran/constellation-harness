---
description: Show the current Constellation workflow state — track, step, gates passed, review loops.
---

# /constellation:status

Show the current workflow state without interrupting anything.

1. Read `.constellation/state/current-workflow.json`.
2. If it does not exist: report "No workflow in progress." and stop.
3. If it exists, present:
   - Track (planned / tweak / hotfix / spike) and plan file (if any)
   - Branch
   - Current step and completed steps
   - Gate results so far and review loop count
   - Model profile
   - Started / last updated timestamps

This command never modifies state and never resumes the workflow — it only reports. To continue an interrupted workflow, use `/constellation:resume`.
