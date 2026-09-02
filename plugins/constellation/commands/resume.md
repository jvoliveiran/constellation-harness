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
   - **Task**: the `task` file (when set) still exists in `.constellation/tasks/`.
     State written by artifact model v0 has no `task` field — do not fail on it.
   - **Plan**: for planned work, the `plan` file still exists in `.constellation/plans/`.
   - **History consistency**: when `preFixSha` is set, it is an ancestor of the branch
     HEAD (`git merge-base --is-ancestor <preFixSha> <branch>`).
   - **PR freshness**: when `prNumber` is set, the PR is still open (`gh pr view`).
     Already merged → the workflow finished outside the harness: offer to run only the
     post-merge verify + state cleanup instead of resuming.
3. Load the `constellation:orchestrator` skill if not already loaded.
4. Report where the workflow left off: print the Progress Banner (orchestrator skill § Progress Banner), then task, track, plan, branch, completed steps, current step, review loop count. If `waitingOn` is `"user"`, re-present the pending question before continuing — that is what the workflow stopped for.
5. **Fold token accounting across the session boundary** (orchestrator skill § Token accounting): when the state carries a `tokens` object, set `tokens.accumulated += tokens.sessionStart − tokens.lastKnownRemaining`, then reset `sessionStart` and `lastKnownRemaining` to the current remaining-budget value. State written before token accounting existed has no `tokens` object — seed one fresh; never block the resume on it.
6. Continue the workflow from `currentStep` following the orchestrator protocol — including re-running any gate that was mid-flight (a gate with partial results re-runs in full).
7. Keep updating the state file at each milestone as usual.
