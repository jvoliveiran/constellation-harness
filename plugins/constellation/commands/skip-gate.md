---
description: Skip the current Constellation quality gate (after explicit confirmation) — e.g. when the user already reviewed the code manually.
disable-model-invocation: true
---

# /constellation:skip-gate

Skip the current gate in the running workflow.

1. If no workflow is in progress or the workflow is not currently at a gate (Lint Gate, Parallel Gate 1, or Parallel Gate 2), report that there is no gate to skip and stop.
2. Ask for explicit confirmation before skipping: *"Are you sure you want to skip [gate name]? This bypasses [reviewer/security/test] checks."* Do not proceed without a clear yes.
3. On confirmation:
   - Append `{ "event": "gate-skipped", "gate": "<name>", ... }` to `.constellation/metrics/workflow-log.jsonl`.
   - Update `.constellation/state/current-workflow.json` marking the gate as skipped.
   - Proceed to the next step of the workflow per the orchestrator protocol.
