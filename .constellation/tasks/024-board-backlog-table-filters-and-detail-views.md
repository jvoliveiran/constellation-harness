---
status: in-progress
type: feature
source: user
feature: F001-board-ui-overhaul.md
order: 3
date-created: 14-10-2026
last-edit: 21-10-2026
---
# Board UI: backlog table, search, filters, epic and feature detail views

Phase 3 of `docs/specs/board-ui-v2.md` (§4.3, §4.4, §6.2, §6.3, §7 link
rewrite). The backlog tree becomes a table with a search bar and filters.
Feature and Epic are columns. A click on an epic, a feature, or a task opens
a detail view with the rendered body and a table of its children.

User feedback, 14-10-2026: "Backlog area is extremely convoluted and
difficult to read. Items should be listed on a table view with some
filters and a search bar at the top. Features and epics must be a column
on that list. When clicking on an epic or feature, show that item on
another view and a list of their child items."

Depends on task 023 (merged, PR #42).

## Value loop

arrive at the board → find an item in the table (search, status, type) →
click its Feature or Epic → see that item and its children → go back or
drill down. Every criterion below serves one step of this loop, keeps a
fact that the old tree shows, or comes from a folded task (030, 031).

## Scope pass, 21-10-2026

**In**: the Tasks table, search, Status chips with counts, Type chips, the
Kind control (Tasks, Features, Epics), the Attention banner and toggle,
`Reset`, the epic, feature, and task detail views with breadcrumb, `/api/item`
kinds `epic` and `feature`, the internal link rewrite, the Open task button,
the phone-width columns. The in-flight row keeps its `▶ <step>` marker and
the orphan plans line: the old tree shows both, so the table must too.

**Changed**: the spec §6.2 counts strip folds into the Status chips. Each
chip shows its count (`inbox 4`). One control, not two.

**Out, parked in task 032** (trigger in that task): sortable column headers
and the `sort=` hash key, the `Plan` select, the `/` keyboard shortcut. The
table keeps one fixed default sort. The technical writer adds a line to spec
§6.2 that names these deferrals.

**Folded in**: task 030 (all six items) and task 031 (both items). They
touch the same files, and 024 adds the code that they guard: new render
exports, a third fetch sequence, more chips, epic and feature titles. The
orchestrator closes 030 and 031 with the 024 commit.

## Acceptance criteria

### Backlog table

1. Given 40 tasks under 5 features under 3 epics, when the page renders
   `#/`, then the backlog card shows a table with the columns ID, Title,
   Type, Status, Feature, Epic, Plan, Updated.
2. Given that table, when it renders with no filter in the hash, then rows
   sort by status group (inbox, refined, in-progress, parked, other, done,
   dropped), then by id descending, and done and dropped rows are hidden.
3. Given a task with no `feature:` link, when the table renders, then its
   Feature and Epic cells show `—`.
4. Given a task file with no H1, when the table renders, then the Title
   cell shows the slug with dashes replaced by spaces.
5. Given an in-flight task, when the table renders, then its row shows
   `▶ <step label>` after the status chip and an accent left border.
6. Given 2 plans without a task, when the table renders, then one line
   under the table reads `2 plans without task` and names both files.

### Search and filters

7. Given the table, when the user types `board` in the search, then within
   200 ms only rows whose id, title, file name, type, status, feature title,
   or epic title contains `board`, case-insensitive, remain.
8. Given a search that matches no row, when the table renders, then it shows
   `No items match` and a Reset link.
9. Given active filters and a search, when the user clicks Reset, then the
   default filters return and the search is empty.
10. Given the toolbar, when it renders, then each task status chip shows the
    count of that status from `tree.counts`.
11. Given the default filters, when the user toggles the `done` chip, then
    done rows appear and the hash holds `status=…,done`.
12. Given a hash with `status=…,done&q=board`, when the page reloads, then
    the same filters and search apply.
13. Given the Type chips, when the user leaves only `fix` on, then only fix
    tasks remain.
14. Given the Kind control set to Features, when the table renders, then it
    lists every feature with the columns ID, Title, Status, Epic, Tasks,
    Updated, the Tasks cell shows one count chip per task status present, and
    the Status and Type chips are hidden. The Features and Epics lists show
    every item; the search still applies.
15. Given the Kind control set to Epics, when the table renders, then it
    lists every epic with the columns ID, Title, Status, Features, Tasks,
    Updated.
43. Given active filters or a search, when the table renders, then a count
    next to the Kind control reads `<shown> of <total>` for the current
    kind, for example `12 of 40`. (Added in pairing round 2; numbered 43 so
    that criteria 1–42 keep their plan mapping.)

### Attention

16. Given one malformed task file, when the table renders, then its row
    shows a danger dot, the row `title` attribute lists the warnings, and a
    banner above the toolbar reads `1 item needs attention`. The banner
    count and the Attention toggle use one rule: `tree.attention`.
17. Given that banner, when the user clicks its button, then the Attention
    toggle turns on and only that row remains, whatever its status. With
    the toggle on, the toggle shows done and dropped attention rows too.

### Detail views

18. Given the table, when the user clicks a Feature cell, then the hash
    becomes `#/item/feature/<file>` and the backlog card shows a breadcrumb,
    a header (id, title, status chip, `date-created`, `last-edit`), the
    rendered body without front matter and first H1, and a Tasks table of
    its children. Now and Agents stay visible.
19. Given the table, when the user clicks an Epic cell, then the detail view
    shows a Features table of its features and a Tasks table of every task
    under those features.
20. Given the table, when the user clicks a task row, then the detail view
    shows the task body, its type and plan chips, a View plan button, and
    its `related:` files as chips that open `#/item/task/<file>`.
21. Given a feature detail view, when the user clicks the epic level of the
    breadcrumb, then the epic detail view opens.
22. Given a detail view opened from a filtered table, when the user presses
    the browser Back button, then the table returns with the same filters.
23. Given a detail view, when a new snapshot arrives, then the view stays
    open and its children table shows the new statuses.
24. Given `#/item/feature/<name>` with a name outside the tree or outside
    the §4.4 name rule, when the page loads, then the overview renders.
25. Given `/api/item?kind=epic&file=<file>` or `kind=feature` for a file in
    the tree, when the board serves it, then the response is 200 with the
    raw text. Given a name outside the tree, then the response is 404.
26. Given an `/api/item` reply with an error, when the detail view renders,
    then the body area shows `body unavailable`, and the header and the
    children table still render.

### Links and the Now panel

27. Given a body link `[x](014-x.md)` or `[x](../tasks/014-x.md)` and a tree
    that holds task `014-x.md`, when the body renders, then the link opens
    `#/item/task/014-x.md`. A link to a plan in the tree opens
    `#/plan/<file>`. Test 13 changes from `<a>b</a>` to the rewritten link.
28. Given a body link to a `.md` file that the tree does not hold, when the
    body renders, then the link renders without `href`.
29. Given an in-flight task in the tree, when the user clicks Open task in
    the Now panel, then the hash becomes `#/item/task/<file>` and the task
    detail view opens.
30. Given an in-flight task that the tree does not hold, when the Now panel
    renders, then Open task is disabled and its `title` gives the reason.

### Layout and performance

31. Given a viewport of 390 px, when the table renders, then the Epic, Plan,
    and Updated columns are hidden and the page has no horizontal scroll.
32. Given 500 generated tasks, when a unit test runs `filterRows`,
    `sortRows`, and `renderTable` once, then the run takes under 100 ms. The
    manual browser check at 500 tasks goes in the PR description.

### Folded from task 030

33. Given the isolation test, when it runs, then every `board-render.mjs`
    export, the new ones included, runs in a `vm` context that holds only the
    prelude. The header comment of `board-render.mjs` says: an export may
    call another export, and nothing else.
34. Given a failed task-body fetch, when the next snapshot or an SSE
    reconnect arrives, then the page fetches the body again.
35. Given a change of the in-flight task, when the new body is not yet
    loaded, then `#desc` shows a muted `loading` line, not the old body.
36. Given two fetches, when the older reply arrives after the newer one,
    then the page ignores the older reply. One deferred-reply test each for
    `taskSeq`, `dialogSeq`, and the detail-view sequence.
37. Given a request for the page, when the board serves it, then the
    response carries `referrer-policy: no-referrer`.
38. Given the code, when the change lands, then the BOM literal in
    `renderMarkdown` and the BOM literal in the `extractTitle` test fixture
    use the escape form `\uFEFF` (the model already does), a test covers the `[data-action="close-dialog"]`
    click, and `onDialogClose` records why it replaces the hash when the
    plan leaves the tree.

### Folded from task 031

39. Given a fixture set (BOM, CRLF, no front matter, `# ` inside a code
    fence), when a parity test runs both rules, then `extractTitle` returns
    the same line that `renderMarkdown` drops.
40. Given the code, when the change lands, then one top-level
    `chipClass(prefix, allowed, value)` in `board-render.mjs` picks the chip
    class for the table, the detail header, and the plan dialog.

### Gate

41. Given the change, when the suite runs, then `parseBacklogRoute`,
    `filterRows`, `sortRows`, `renderTable`, and `renderItemView` have
    tests, the suite grows from 192 tests, and `scripts/selftest.sh` prints
    `selftest: ALL GREEN`.
42. Given the change, when the PR opens, then CHANGELOG `[Unreleased]` lists
    #024 with #030 and #031, and the test count line gives the new total.

## Success metric

- Primary: at the 024 verification, from a cold load at 1280 px and at
  390 px, the user finds a named task by search and opens its feature with
  its children in 3 interactions or fewer.
- Instrumentation: none. The board is a local tool without telemetry (spec
  §13). The user check at verification and the next two board sessions is
  the data.
- Decision rule: the user accepts the table and reports no missing control
  → close the phase and go to 025 and 026. The user names sort, the Plan
  filter, or the `/` shortcut as a gap → task 032 moves to `inbox`. The user
  still calls the backlog hard to read → re-scope before 025.
