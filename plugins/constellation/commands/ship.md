---
description: Merge the current workflow's PR (squash) after mechanical preconditions pass, then verify the main branch post-merge.
---

# /constellation:ship

Manually invoke the orchestrator's **Ship step** for the current branch's PR — e.g. after
a human-gate pause in a previous session, or to ship a PR whose workflow state still
exists.

1. Load the `constellation:orchestrator` skill if not already loaded.
2. Determine the PR:
   - `.constellation/state/current-workflow.json` exists → use its `prNumber` / `branch`.
   - No state → `gh pr view` for the current branch. No PR either → report and stop.
3. If unresolved review threads exist → run the **Post-PR Phase** first (orchestrator
   protocol); do not merge over unanswered feedback.
4. Run the **Ship step** preconditions (CI green, threads resolved, branch up to date,
   fix policy satisfied). Any failure → report exactly what failed and stop.
5. Merge decision: this command is itself the human's instruction to ship, so **merge
   without a further confirmation prompt** regardless of `hadBlockers` — but if
   `hadBlockers: true`, print the blocker history summary BEFORE merging so the record is
   visible.
6. Squash-merge (delete branch), post-merge verify (checkout main + pull + configured
   `build`/`test`), report the result. Verify failure → failing output + revert
   guidance (`git revert -m 1 <sha>`), never auto-revert.
7. Delete the state file; log `workflow-shipped` with `merge: "confirmed"`.
