---
description: Resume a previously aborted/interrupted Constellation workflow from its saved state.
---

# /constellation:resume

Resume an interrupted workflow.

1. Read `.constellation/state/current-workflow.json`. If it does not exist, report that there is no workflow to resume and stop.
2. **Validate the state before trusting it** — check ALL of the following; on any failure,
   report exactly what is invalid and offer two options: archive the stale state (move to
   `.constellation/state/archive/<startedAt>.json`) and start fresh, or fix the
   environment and retry. **Never resume from state that fails validation.**
   - **Shape**: required keys present (`track`, `currentStep`, `startedAt`); `track` is a
     known track; `currentStep` is a known step for that track.
   - **Branch**: `branch` (when set) still exists (`git rev-parse --verify <branch>`).
     Exists but not checked out → offer to check it out. Deleted → stale state.
   - **Plan**: for planned work, the `plan` file still exists in `.constellation/plans/`.
   - **History consistency**: when `preFixSha` is set, it is an ancestor of the branch
     HEAD (`git merge-base --is-ancestor <preFixSha> <branch>`).
   - **PR freshness**: when `prNumber` is set, the PR is still open (`gh pr view`).
     Already merged → the workflow finished outside the harness: offer to run only the
     post-merge verify + state cleanup instead of resuming.
3. Load the `constellation:orchestrator` skill if not already loaded.
4. Report where the workflow left off: print the Progress Banner (orchestrator skill § Progress Banner), then track, plan, branch, completed steps, current step, review loop count. If `waitingOn` is `"user"`, re-present the pending question before continuing — that is what the workflow stopped for.
5. Continue the workflow from `currentStep` following the orchestrator protocol — including re-running any gate that was mid-flight (a gate with partial results re-runs in full).
6. Keep updating the state file at each milestone as usual.
