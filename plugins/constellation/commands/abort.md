---
description: Stop the current Constellation workflow immediately, saving state for later resume. Branch and changes are preserved.
disable-model-invocation: true
---

# /constellation:abort

Stop the current workflow immediately.

1. If no workflow is in progress (no in-memory workflow and no `.constellation/state/current-workflow.json`), report that there is nothing to abort and stop.
2. Save the current state to `.constellation/state/current-workflow.json` — track, plan, branch, original request, current step, completed steps, gate results, review loop count, preFixSha, model profile, timestamps.
3. Do NOT commit. Do NOT push. Keep the branch and all working-directory changes exactly as they are.
4. Append `{ "event": "workflow-aborted", ... }` to `.constellation/metrics/workflow-log.jsonl`.
5. Report: what was completed, what remains, and that `/constellation:resume` will continue from the saved step.
