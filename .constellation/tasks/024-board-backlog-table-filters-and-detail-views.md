---
status: refined
type: feature
source: user
feature: F001-board-ui-overhaul.md
order: 3
date-created: 14-10-2026
last-edit: 19-10-2026
---
# Board UI: backlog table, search, filters, epic and feature detail views

Phase 3 of `docs/specs/board-ui-v2.md` (§4.4, §6.2, §6.3). The backlog
tree becomes a table with a search bar and filters. Feature and Epic are
columns. A click on an epic, a feature, or a task opens a detail view with
the rendered body and a table of its children.

User feedback, 14-10-2026: "Backlog area is extremely convoluted and
difficult to read. Items should be listed on a table view with some
filters and a search bar at the top. Features and epics must be a column
on that list. When clicking on an epic or feature, show that item on
another view and a list of their child items."

Depends on task 023.

## Acceptance criteria

1. Given 40 tasks under 5 features under 3 epics, when the page renders,
   then the backlog is a table with the columns ID, Title, Type, Status,
   Feature, Epic, Plan, Updated, sorted by status group then id
   descending, with done and dropped rows hidden by default.
2. Given the user types `board` in the search, then within 200 ms the
   table shows only rows whose id, title, file name, type, status,
   feature title, or epic title contains `board`, case-insensitive.
3. Given the user toggles the `done` status chip, then done rows appear,
   and the hash holds `status=…,done`. Given a reload of that URL, then
   the same filter applies.
4. Given the Kind control set to Features, then the table lists features
   with the columns of spec §6.2, and the Tasks cell shows one count chip
   per task status.
5. Given a click on a Feature cell, then the backlog card shows the
   feature detail view: breadcrumb, header with status chip and dates,
   the rendered body, and a Tasks table of its children. Now and Agents
   stay visible.
6. Given a click on an Epic cell, then the detail view shows a Features
   table and a Tasks table of every task under those features.
7. Given a click on a task row, then the detail view shows the task body,
   a View plan button, and `related:` chips. A body link to `014-x.md`
   opens `#/item/task/014-x.md`.
8. Given a malformed task file, then its row shows a danger dot, the title
   attribute lists the warnings, the banner says `1 item needs attention`,
   and the Attention toggle shows that row alone.
9. Given a backlog of 500 generated tasks, then one snapshot renders the
   table in under 100 ms in the browser.
10. Given a viewport of 390 px, then the table hides the Epic, Plan, and
    Updated columns and the page has no horizontal scroll.
11. Given the change, then `filterRows`, `sortRows`, `parseBacklogRoute`,
    and `renderTable` have tests, and `scripts/selftest.sh` prints
    `selftest: ALL GREEN`.

## Scope notes from the task 023 scope pass (19-10-2026)

- Task 023 moved here: the Open task button in the Now panel, the `#/item/...` route, `/api/item` kinds `epic` and `feature`, and the internal link rewrite. In 023, a relative link renders as text.
- Task 023 ships the snapshot node `title`. The Title column uses it.
