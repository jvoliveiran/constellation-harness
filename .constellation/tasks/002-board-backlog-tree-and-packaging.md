---
status: inbox
type: feature
source: user
related: 001-board-live-workflow-panel.md
date-created: 03-10-2026
last-edit: 03-10-2026
---
# Board phase 2 — backlog tree, transition witness, and packaging

Follow-up of task 001. Extend the localhost page with the work hierarchy
(epics → features → tasks → plans) read from markdown front-matter, record
task status transitions with real timestamps, and let the plugin start the
server by itself.

## Why

Phase 1 shows the one workflow in motion. It does not show what is queued,
what is parked, or what shipped. Today that view costs a model call per
`/constellation:tasks` or `/constellation:backlog` invocation. A shared
parser gives the page and the commands one deterministic source.

## Acceptance criteria

1. Given tasks, features, and epics exist, when the user opens the page,
   then the page shows the tree with status, type, and plan maturity, and
   the in-flight task carries the current step.
2. Given a file has a title line before its front-matter or carries unknown
   fields, then the page lists it with a visible malformed or lenient badge
   and never hides it.
3. Given a task file changes status, then the feed shows the old and new
   status with the hook timestamp within 2 seconds.
4. Given the plugin is enabled in an initialized project, when a session
   starts, then the server starts without a user command and prints its URL
   through `/constellation:board`.
5. Given the project is not initialized, then the server exits silently and
   leaves no process behind.
6. The page stays read-only.
