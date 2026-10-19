---
status: draft
date-created: 14-10-2026
last-edit: 14-10-2026
---
# Board UI overhaul

The board page is readable at a glance, shows what the workflow works on,
and gives the user control over a run.

At the end of this feature:

1. The Agents panel fits the viewport and scrolls inside its card.
2. The Now panel renders the in-flight task description from markdown and
   opens the plan in a dialog.
3. The tokens spent fact shows the real spend, read from the session
   transcripts.
4. A Pause button holds the workflow, and a Resume button releases it.
5. Each completed step, and each finished agent, opens the full output of
   that agent.
6. The backlog is a table with search, filters, and Feature and Epic
   columns. A click on a feature or an epic shows that item and its
   children.

Design: `docs/specs/board-ui-v2.md`. Six problems, five phases, one task
per phase (022 to 026). Phases 025 and 026 can run in parallel after 023.
