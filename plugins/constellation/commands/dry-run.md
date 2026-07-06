---
description: Preview the full Constellation workflow for a request without executing — agents, models, skills, and gates. No files are modified.
argument-hint: "<the request to trace>"
---

# /constellation:dry-run

Trace the workflow that WOULD run for the request in `$ARGUMENTS` — without invoking any agent or modifying any file.

1. Load the `constellation:orchestrator` skill if not already loaded.
2. Classify the request: workflow track (planned / tweak / hotfix / spike) per the decision tree, and the starting agent per the routing rules.
3. Estimate the complexity profile (small / medium / large) from the request to derive model assignments.
4. Present the trace and STOP — do not execute anything:

```
Track: <track>
Steps: <pipeline, e.g. Architect → DevOps → Engineer → Lint Gate → Gate 1 (Reviewer+Security+DX advisory) → Gate 2 (SDET+Writer) → Architect verify → Commit → DevOps PR>
Model profile: <Small|Medium|Large> (<reason>)
Agents: <each agent with its assigned model>
Skills: <stack skills from .constellation/config.json that agents would load>
Gates: <Lint Gate; Parallel Gate 1; Parallel Gate 2 — as applicable; note schema-compatibility check if config.schemaPath is set>
```

If `$ARGUMENTS` is empty, ask the user what request to trace.
