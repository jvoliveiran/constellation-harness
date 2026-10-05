---
status: done
commit: 7adbce5f534fca1d5e19e29038a054316324ce13
type: feature
source: user
date-created: 03-10-2026
last-edit: 05-10-2026
---
# Board phase 1 — live workflow panel on localhost

A read-only page on localhost that shows the one in-flight Constellation
workflow in real time: the track steps with the current pointer, fix-loop
and waiting-on-user modifiers, elapsed time, token delta, and a live feed
of which specialist agent runs right now.

The page renders only the state file and the track map. It parses no
markdown. The live feed comes from a new hook that appends one JSON line
per agent event with a real timestamp. The same change fixes the invented
timestamps in the metrics log.

## Why

The terminal shows the progress banner only at save points, and each
`/constellation:status` call costs tokens. Between save points nothing is
visible. A page fed by hooks shows agent activity the model never writes.

## Acceptance criteria

1. Given an initialized project with a workflow in flight, when the user
   opens the page, then the page shows every step of the active track with
   completed, current, and pending markers that match the progress banner.
2. Given the orchestrator saves the state file, then the page updates
   within 2 seconds without a manual reload.
3. Given a subagent starts or stops, then the feed shows the agent type and
   a timestamp taken from the system clock within 2 seconds.
4. Given no state file exists, then the page shows "No workflow in flight"
   and keeps watching.
5. Given the orchestrator writes a timestamp into the state file or the
   metrics log, then the value comes from a shell clock, not from memory.
6. The page never modifies any file under `.constellation/`.
