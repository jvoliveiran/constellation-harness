# Task Lifecycle — full rules

Loaded on demand by the orchestrator when a workflow touches a task spec
(see the stub in SKILL.md).

Front-matter (lightweight, so `/constellation:tasks` can list mechanically):

```markdown
---
status: inbox            # inbox | refined | done | dropped
source: codex            # optional — agent/tool/person that filed it
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
plan: 003-export-csv.md  # required once refined — the plan this task became
---
```

1. Anyone files a task with `status: inbox`. The body is free-form context; only the front-matter is required.
2. The ideal flow is **task → plan**: when Planned Work or Discovery picks a task up, the Architect writes the plan as usual and, in the same step, updates the task to `status: refined` with `plan: <plan filename>`. The task ↔ plan link lives on the task side only — plans never point back.
3. When the Architect marks the linked plan `completed`, flip the task to `done` in the same edit.
4. Tasks deliberately not pursued get `dropped`, with a one-line reason appended to the body.
5. Tasks `done`/`dropped` for 30+ days move to `.constellation/tasks/archive/` (Technical Writer, same sweep as plan archiving).
