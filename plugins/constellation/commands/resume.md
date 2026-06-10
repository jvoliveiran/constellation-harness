---
description: Resume a previously aborted/interrupted Constellation workflow from its saved state.
---

# /constellation:resume

Resume an interrupted workflow.

1. Read `.constellation/state/current-workflow.json`. If it does not exist, report that there is no workflow to resume and stop.
2. Load the `constellation:orchestrator` skill if not already loaded.
3. Report where the workflow left off: track, plan, branch, completed steps, current step, review loop count.
4. Verify the environment still matches the state: the branch exists and is checked out (offer to check it out if not), and the plan file exists (for planned work).
5. Continue the workflow from `currentStep` following the orchestrator protocol — including re-running any gate that was mid-flight (a gate with partial results re-runs in full).
6. Keep updating the state file at each milestone as usual.
