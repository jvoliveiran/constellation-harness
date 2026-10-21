---
status: approved
task: 024-board-backlog-table-filters-and-detail-views.md
scope-approved-by: product-manager, software-architect
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board UI: backlog table, search, filters, epic and feature detail views (task 024)

## Overview

**Problem**: The backlog card shows a nested tree of epics, features, and
tasks with glyphs, badges, and collapsed groups. The user called it
"extremely convoluted and difficult to read". The user cannot search,
cannot filter, and cannot open an epic or a feature to see its children.

**Impact**: The user finds a task in a flat table with search, Status and
Type chips, and a Kind control. Feature and Epic are columns. One click on
a Feature or Epic cell opens a detail view with the rendered body and a
table of the children. Links inside a body open the linked task or plan.
The Now panel gets an Open task button.

**Scope**:

- In: the 43 criteria of the task (criterion 43, the row count, came in
  the PM round 2). That is the Tasks, Features, and Epics
  tables; search; Status chips with counts; Type chips; the Kind control;
  the Attention banner and toggle; `Reset`; the epic, feature, and task
  detail views with breadcrumb; `/api/item` kinds `epic` and `feature`;
  the internal link rewrite; the Open task button; the phone-width columns;
  task 030 (six items, criteria 33 to 38); task 031 (two items, criteria
  39 and 40); one CHANGELOG entry under `[Unreleased]`; the README board
  sentence; one line in spec §6.2 and §4.4 that names the deferrals.
- Out: sortable headers and the `sort=` hash key, the `Plan` select, and
  the `/` shortcut (parked in task 032); the `● live` item (026); the
  Stepper restyle and the running-row pulse (025); a live refresh of an
  open plan dialog (parked in 023); a `Referenced by` list (product
  suggestion, not in scope). The watch, the probe, the event tail, and the
  filesystem rules of 1.3.4 do not change.

**Blocks**: task 025 (it reuses the `<dialog>`, the route table, and the
fetch slots) and task 026 (it adds a button to the Now actions).
**Blocked By**: nothing. Task 023 is on `main` at 1a8f708. The branch
`feat/024-board-backlog-table-filters-and-detail-views` is checked out.

**Track**: Planned Work, product-scoped. PM × Architect pairing converged
(both `AGREED`; see the Feasibility Result at the end).

**Version**: no bump. The Technical Writer adds the entry under
`## [Unreleased]`. Task 026 cuts 1.4.0.

**Tasks 030 and 031**: the PR of task 024 ships all their items as
criteria 33 to 40. Task 033 (`Referenced by`) is parked, not in this PR. The squash commit of that PR is the `commit:` of tasks
024, 030, and 031. The chore PR that closes 024 flips all three to `done`
with the same merge commit, by the convention of this repo (the 023 close
did the same for 029).

## Acceptance Criteria

The task file holds the BDD criteria. This section repeats them verbatim
and adds technical notes. "D<n>" points to the design decisions below.
"T<n>" points to the tests in the Validation section. "E<n>" points to an
existing test that changes.

### Backlog table

1. Given 40 tasks under 5 features under 3 epics, when the page renders
   `#/`, then the backlog card shows a table with the columns ID, Title,
   Type, Status, Feature, Epic, Plan, Updated.
   - Note: D3 (`backlogRows`), D4 (`renderTable`). T13 pins the header row.
     The fixture `table40()` in the test file builds exactly that tree.
     Updated is the `last-edit` value of the file (D1), or `—`.
2. Given that table, when it renders with no filter in the hash, then rows
   sort by status group (inbox, refined, in-progress, parked, other, done,
   dropped), then by id descending, and done and dropped rows are hidden.
   - Note: D3 (`sortRows`, `filterRows`), D2 (default route). T10, T11, E7.
3. Given a task with no `feature:` link, when the table renders, then its
   Feature and Epic cells show `—`.
   - Note: D3. The feature and epic come from the tree structure, not from
     the raw link, so a task with a broken link also shows `—`. T8, T13.
4. Given a task file with no H1, when the table renders, then the Title
   cell shows the slug with dashes replaced by spaces.
   - Note: D3 (`displayTitle` inside `backlogRows`). T8.
5. Given an in-flight task, when the table renders, then its row shows
   `▶ <step label>` after the status chip and an accent left border.
   - Note: D4. The row gets the class `inflight`; the CSS draws the border
     with `var(--accent)`. The step label is `task.currentStep`, as the
     tree shows it today. T13, T45.
6. Given 2 plans without a task, when the table renders, then one line
   under the table reads `2 plans without task` and names both files.
   - Note: D4 (`renderBacklog`). One plan gives `1 plan without task`. T16.

### Search and filters

7. Given the table, when the user types `board` in the search, then within
   200 ms only rows whose id, title, file name, type, status, feature title,
   or epic title contains `board`, case-insensitive, remain.
   - Note: D3, D6. The input debounces 100 ms, then writes `q` with
     `replaceState` and re-renders the list. T9 (the seven fields), T38
     (the page path).
8. Given a search that matches no row, when the table renders, then it shows
   `No items match` and a Reset link.
   - Note: D4. The Reset link is a `button` with the class `link` and
     `data-action="reset"`. T16.
9. Given active filters and a search, when the user clicks Reset, then the
   default filters return and the search is empty.
   - Note: D6. Reset writes `#/` with `replaceState` and clears `#q`. T39.
10. Given the toolbar, when it renders, then each task status chip shows the
    count of that status from `tree.counts`.
    - Note: D4 (`renderToolbar`). The chips are the seven task groups in the
      sort order. The count is `tree.counts[group]`, not the filtered row
      count. T15.
11. Given the default filters, when the user toggles the `done` chip, then
    done rows appear and the hash holds `status=…,done`.
    - Note: D2, D6. The full value is
      `#/backlog?status=inbox,refined,in-progress,parked,other,done`. T36.
12. Given a hash with `status=…,done&q=board`, when the page reloads, then
    the same filters and search apply.
    - Note: D2, D6. On boot and on `hashchange` the page copies `q` into
      `#q`. T6, T7, T37.
13. Given the Type chips, when the user leaves only `fix` on, then only fix
    tasks remain.
    - Note: D2, D3. No `type=` key means no type filter: tasks with any or
      no type show. With a `type=` key, a task whose type is not in the list
      (or is empty) hides. T10.
14. Given the Kind control set to Features, when the table renders, then it
    lists every feature with the columns ID, Title, Status, Epic, Tasks,
    Updated, and the Tasks cell shows one count chip per task status present.
    - Note: D3, D4. "Every feature": the Status and Type chips hide for this
      kind and do not filter it; search and Attention apply. T14, T15.
15. Given the Kind control set to Epics, when the table renders, then it
    lists every epic with the columns ID, Title, Status, Features, Tasks,
    Updated.
    - Note: D3, D4. Features and Tasks are plain counts. T14.

### Attention

16. Given one malformed task file, when the table renders, then its row
    shows a danger dot, the row `title` attribute lists the warnings, and a
    banner above the toolbar reads `1 item needs attention`.
    - Note: D4. The dot shows on every row with a flag (`malformed` or
      `lenient`), as the tree badge did. The banner counts
      `tree.attention`, the list that the tree block used (the 023 rule:
      unknown fields alone do not count). Two items read
      `2 items need attention`. T16, E3, E4, E6.
17. Given that banner, when the user clicks its button, then the Attention
    toggle turns on and only that row remains.
    - Note: D2 (`attn=1`), D3. The toggle keeps the rows whose
      `kind/file` is in `tree.attention`, so the banner count and the
      toggle use one rule. The toggle also clears the status filter for
      the click, so a malformed task with status `done` still shows. T10,
      T40.

### Detail views

18. Given the table, when the user clicks a Feature cell, then the hash
    becomes `#/item/feature/<file>` and the backlog card shows a breadcrumb,
    a header (id, title, status chip, `date-created`, `last-edit`), the
    rendered body without front matter and first H1, and a Tasks table of
    its children. Now and Agents stay visible.
    - Note: D5, D6. The Feature cell is an `<a href="#/item/feature/<file>">`,
      so the browser pushes the history entry. T17, T34.
19. Given the table, when the user clicks an Epic cell, then the detail view
    shows a Features table of its features and a Tasks table of every task
    under those features.
    - Note: D5. Children tables show every child, in the default order,
      with no filter. T18.
20. Given the table, when the user clicks a task row, then the detail view
    shows the task body, its type and plan chips, a View plan button, and
    its `related:` files as chips that open `#/item/task/<file>`.
    - Note: D1 (`related`), D5. A related name that the tree does not hold
      renders as an inert chip with a `title` that says why. T19, T42.
21. Given a feature detail view, when the user clicks the epic level of the
    breadcrumb, then the epic detail view opens.
    - Note: D5. Each level is an anchor. T17 pins the epic href.
22. Given a detail view opened from a filtered table, when the user presses
    the browser Back button, then the table returns with the same filters.
    - Note: D6. Filter and search edits use `replaceState`; item links push.
      Back from the item lands on the filtered list hash. T36 pins the
      `replaceState` path. Manual step 6 pins the Back button.
23. Given a detail view, when a new snapshot arrives, then the view stays
    open and its children table shows the new statuses.
    - Note: D6. The route decides the view on every render; the body comes
      from the item slot, so a snapshot does not refetch it unless the file
      `mtime` changes. T34.
24. Given `#/item/feature/<name>` with a name outside the tree or outside
    the §4.4 name rule, when the page loads, then the overview renders.
    - Note: D2, D6. The hash stays, as for the plan route. T5, T35.
25. Given `/api/item?kind=epic&file=<file>` or `kind=feature` for a file in
    the tree, when the board serves it, then the response is 200 with the
    raw text. Given a name outside the tree, then the response is 404.
    - Note: D7. T2, T3.
26. Given an `/api/item` reply with an error, when the detail view renders,
    then the body area shows `body unavailable`, and the header and the
    children table still render.
    - Note: D5, D6. The text is `body unavailable (<status>)`. T20, T43.

### Links and the Now panel

27. Given a body link `[x](014-x.md)` or `[x](../tasks/014-x.md)` and a tree
    that holds task `014-x.md`, when the body renders, then the link opens
    `#/item/task/014-x.md`. A link to a plan in the tree opens
    `#/plan/<file>`. Test 13 changes from `<a>b</a>` to the rewritten link.
    - Note: D8 (`internalHref`). E13, T21, T22.
28. Given a body link to a `.md` file that the tree does not hold, when the
    body renders, then the link renders without `href`.
    - Note: D8. T21, T22.
29. Given an in-flight task in the tree, when the user clicks Open task in
    the Now panel, then the hash becomes `#/item/task/<file>` and the task
    detail view opens.
    - Note: D9. The click also scrolls the backlog card into view, because
      at 1280 px the card sits under the Now card. T23, T41.
30. Given an in-flight task that the tree does not hold, when the Now panel
    renders, then Open task is disabled and its `title` gives the reason.
    - Note: D9. The reason is `task <file> is not in .constellation/tasks/`.
      T23.

### Layout and performance

31. Given a viewport of 390 px, when the table renders, then the Epic, Plan,
    and Updated columns are hidden and the page has no horizontal scroll.
    - Note: D10. T44 pins the rules. Manual step 9 measures it with CDP
      device emulation, not with the `documentElement` width proxy: that
      proxy does not fire media queries.
32. Given 500 generated tasks, when a unit test runs `filterRows`,
    `sortRows`, and `renderTable` once, then the run takes under 100 ms. The
    manual browser check at 500 tasks goes in the PR description.
    - Note: T12. Manual step 10.

### Folded from task 030

33. Given the isolation test, when it runs, then every `board-render.mjs`
    export, the new ones included, runs in a `vm` context that holds only the
    prelude. The header comment of `board-render.mjs` says: an export may
    call another export, and nothing else.
    - Note: D11. T25.
34. Given a failed task-body fetch, when the next snapshot or an SSE
    reconnect arrives, then the page fetches the body again.
    - Note: D6 (`syncBody`, `failed`). T28.
35. Given a change of the in-flight task, when the new body is not yet
    loaded, then `#desc` shows a muted `loading` line, not the old body.
    - Note: D6. An `mtime` change of the same task keeps the old body until
      the reply, so the region does not flash. T29.
36. Given two fetches, when the older reply arrives after the newer one,
    then the page ignores the older reply. One deferred-reply test each for
    `taskSeq`, `dialogSeq`, and the detail-view sequence.
    - Note: D6. `taskSeq` becomes `taskSlot.seq`; the detail-view sequence
      is `itemSlot.seq`; `dialogSeq` keeps its name. T30, T31, T32.
37. Given a request for the page, when the board serves it, then the
    response carries `referrer-policy: no-referrer`.
    - Note: D7. The header goes on every response, next to `nosniff`. T4.
38. Given the code, when the change lands, then both BOM regexes use the
    escape form `﻿`, a test covers the `[data-action="close-dialog"]`
    click, and `onDialogClose` records why it replaces the hash when the
    plan leaves the tree.
    - Note: D11. "Both": the regex in `renderMarkdown` (a literal U+FEFF
      today) and the literal in the `extractTitle` test fixture. The model
      already uses `﻿`. T27 (no literal U+FEFF in `board-render.mjs`
      and `page.js`), T33.

### Folded from task 031

39. Given a fixture set (BOM, CRLF, no front matter, `# ` inside a code
    fence), when a parity test runs both rules, then `extractTitle` returns
    the same line that `renderMarkdown` drops.
    - Note: D11. T26. The fence case pins today's accepted behavior (023
      D3): both rules take the fenced line.
40. Given the code, when the change lands, then one top-level
    `chipClass(prefix, allowed, value)` in `board-render.mjs` picks the chip
    class for the table, the detail header, and the plan dialog.
    - Note: D11. T24.

### Gate

41. Given the change, when the suite runs, then `parseBacklogRoute`,
    `filterRows`, `sortRows`, `renderTable`, and `renderItemView` have
    tests, the suite grows from 192 tests, and `scripts/selftest.sh` prints
    `selftest: ALL GREEN`.
    - Note: 46 new tests (T1 to T46); 15 existing tests change their body
      (E1 to E15); none is deleted. The count goes from 192 to 238.
42. Given the change, when the PR opens, then CHANGELOG `[Unreleased]` lists
    #024 with #030 and #031, and the test count line gives the new total.
    - Note: Release notes section.

### Row count (added in the PM round 2, 21-10-2026)

43. Given active filters or a search, when the table renders, then a count
    next to the Kind control reads `<shown> of <total>` for the current
    kind, for example `12 of 40`.
    - Note: D4 (`renderToolbar`). `total` is the row count of
      `backlogRows(tree, kind)`; `shown` is the count after `filterRows`.
      The count renders for every list route, the default included: the
      default hides done and dropped, so it is a filter too. T46.

## Design decisions

### D1 — Model: three node fields, three group-node fields

`board-model.mjs`, `toNode` adds:

```js
created: fields['date-created'] || null,
edited: fields['last-edit'] || null,
related: (fields.related || '').split(',').map((s) => s.trim()).filter(Boolean),
```

`groupNode` adds `mtime`, `created`, and `edited`, so epics, features, and
orphan plans carry them. Tasks carry every node field already.

- `mtime` on a group node lets the page refetch an epic or feature body
  when the file changes (D6).
- `related` keeps the raw names. The page checks each name with
  `treeHolds` before it builds a link (D5). The artifact model writes
  `related:` as one inline value; a comma list also works. The YAML list
  form (`- a.md` lines) gives `[]`, because the line parser skips lines
  without a colon. Accepted: no task uses it.
- No date parsing. Updated shows `edited` as written (`DD-MM-YYYY`).
  Sort by Updated is parked (032), so the column needs no parse.

Rejected: the file `mtime` as Updated. A checkout or a pull rewrites it,
so it does not say when the author edited the item.

### D2 — Routes: `parseRoute` gains the item view; the list state is its own route

Two pure exports in `board-render.mjs`.

`parseRoute(hash)`:

| Hash | Result |
|---|---|
| `#/plan/<file>` | `{ view: 'plan', file }` (unchanged) |
| `#/item/<kind>/<file>`, kind in `epic`, `feature`, `task` | `{ view: 'item', kind, file }` |
| anything else | `{ view: 'overview' }` (unchanged shape) |

`<file>` passes the §4.4 name rule in the regex. Tree membership is the
page's check (`treeHolds`), as for the plan route.

`parseBacklogRoute(hash)` returns the list state:

```js
{ kind: 'task' | 'feature' | 'epic', status: [group, ...], type: [type, ...] | null, q: '', attention: false }
```

- `#/`, `''`, and every hash that is not `#/backlog?…` give the defaults:
  `kind: 'task'`, `status: ['inbox','refined','in-progress','parked','other']`,
  `type: null`, `q: ''`, `attention: false`.
- `#/backlog?kind=feature&status=inbox,done&type=fix&q=board&attn=1`:
  each key is optional; a missing key keeps its default. Values outside
  the fixed lists (`TASK_GROUPS`, `TYPES`, `KINDS`, inside the function)
  drop out. An empty `status=` gives `[]` (no status passes). `q` goes
  through `decodeURIComponent` inside `try/catch`; a bad escape gives `''`.
- Parsing uses `split`, not `URLSearchParams`. The isolation test (D11)
  runs every export in a bare `vm` context, which holds the ECMAScript
  built-ins only. `URLSearchParams` and `performance` are not there.

`formatBacklogRoute(route)` is the inverse. The default route gives `#/`.
Any other route gives `#/backlog?` plus only the keys that differ from the
default, in the fixed order `kind`, `status`, `type`, `q`, `attn`. `q` goes
through `encodeURIComponent`. `parseBacklogRoute(formatBacklogRoute(r))`
deep-equals `r` for every valid `r` (T7).

The plan dialog route keeps the list or detail view behind it: while the
route is `#/plan/<file>`, the backlog card renders the hash in
`routeBefore`, or `#/` when there is none (a reload on the plan route).

Rejected: one parser for both. `parseRoute` has a pinned `deepEqual`
shape in the 023 tests, and the list state is a different concern.

### D3 — Rows: `backlogRows`, `filterRows`, `sortRows`

All three are pure exports.

`backlogRows(tree, kind)` flattens the tree for one kind. It walks
`tree.epics[].features[].tasks` and `tree.orphanFeatures[].tasks` to map
each task file to its feature and epic. The raw `links.feature` is not
used: a broken link leaves the task standalone, so its cells show `—`.

Row shape (one shape for all kinds; unused keys are null):

```js
{ kind, file, id, title, type, status, group, edited, flags, warnings,
  plan,                       // tasks: { file, status } or null
  inFlight, currentStep,      // tasks
  feature, epic,              // { file, title } or null
  taskCounts,                 // features and epics: { group: n } for groups present
  featureCount, taskCount }   // epics
```

- `title` is `node.title`, else `node.name` with every `-` replaced by a
  space (criterion 4).
- `group` is `task.group` for tasks. For features and epics it is the
  status when it is one of the seven task groups, else `other`.
- An epic counts its features and every task under them.

`filterRows(rows, route, attention)`:

- Search: `route.q` trimmed and lower-cased; empty passes all. The
  haystack is `id`, `title`, `file`, `type`, `status`, `feature.title`,
  `epic.title`, joined with `\n`, lower-cased. `includes`, no regex.
- Status: for `kind: 'task'` only, `route.status` must hold `row.group`.
- Type: for `kind: 'task'` only, when `route.type` is not null, it must
  hold `row.type`.
- Attention: when `route.attention`, the row's `kind + '/' + file` must be
  in the set built from `attention` (the `tree.attention` array). The
  status filter does not apply then (criterion 17 note).

`sortRows(rows)`: group index in
`['inbox','refined','in-progress','parked','other','done','dropped']`,
then id descending. Ids compare by `localeCompare(…, undefined, { numeric:
true })`, so `F010` sorts after `F009` and `100` after `99`. A null id
sorts last. Returns a new array. The `route` argument of spec §6.2 is
dropped: sort is fixed until task 032.

### D4 — Render: `chipClass`, `renderTable`, `renderToolbar`, `renderBacklog`

`chipClass(prefix, allowed, value)`: `allowed.indexOf(value) >= 0 ? prefix
+ value : prefix + 'other'`. `indexOf` on an array, so `constructor` and
`__proto__` give `other` (T24). The table, the detail header, and
`renderPlanDialog` call it.

`renderTable(rows, kind, esc)` returns
`<div class="tbl-wrap"><table class="tbl">…</table></div>`.

| Kind | Columns (class on `th` and `td`) |
|---|---|
| task | `col-id`, `col-title`, `col-type`, `col-status`, `col-feature`, `col-epic`, `col-plan`, `col-updated` |
| feature | `col-id`, `col-title`, `col-status`, `col-epic`, `col-tasks`, `col-updated` |
| epic | `col-id`, `col-title`, `col-status`, `col-features`, `col-tasks`, `col-updated` |

- Each `tr` holds `data-href="#/item/<kind>/<file>"` and, for a row with
  flags, `title="<warnings joined by '; '>"`. The in-flight task row has
  the class `inflight`.
- The ID cell: a flagged row starts with
  `<span class="dot" aria-label="needs attention"></span>`. Then the id,
  or `—`.
- The Title cell: `<a href="#/item/<kind>/<file>">title</a>`. The anchor
  makes the row reachable by keyboard.
- Status: `<span class="chip s-<group>">status</span>`, then
  ` <span class="run">▶ step</span>` for the in-flight row.
- Feature and Epic: `<a href="#/item/feature/<file>">id title</a>`, or `—`.
- Plan: `<span class="chip p-<status>">status</span>`, or `—`.
- Tasks (feature, epic): one `<span class="chip s-<group>">group n</span>`
  per group with `n > 0`, in group order. Features (epic): the number.
- Updated: `edited`, or `—`.
- Every text goes through `esc`. File names in `href` and `data-href`
  passed the tree scan only, not the name rule, so they go through `esc`
  too. A name outside the name rule makes a hash that `parseRoute`
  refuses; the detail view then does not open, which is safe.

`renderToolbar(view, esc)`, `view = { route, tree }`. `counts` is
`tree.counts`.

- Kind control: three
  `<button type="button" class="seg" data-action="kind" data-value="task" aria-pressed="true">Tasks</button>`.
- Row count (criterion 43), right after the Kind control:
  `<span class="muted count" aria-live="polite">12 of 40</span>`.
  `total = backlogRows(tree, route.kind).length`;
  `shown = filterRows(rows, route, tree.attention).length`. Both are
  exports, so the call is legal in the prelude (D11). The second pass over
  the rows costs well under 1 ms at 500 tasks; the page does not share the
  filtered array between `renderToolbar` and `renderBacklog`, so each
  export stays self-contained. A null tree gives no count.
- For `kind: 'task'` only: seven Status chips
  `<button type="button" class="chip s-<group> toggle" data-action="status" data-value="<group>" aria-pressed="…">group n</button>`
  with `n` from `counts`; six Type chips (`data-action="type"`); one
  Attention toggle (`data-action="attention"`).
- For features and epics: the Attention toggle only.
- One `<button type="button" class="link" data-action="reset">Reset</button>`.

`renderBacklog(view, esc)`, `view = { tree, route }`. It keeps the 1.3.4
export name, so the test `board.mjs: re-exports every 1.3.4 name` and the
test `serve: the page script compiles and embeds the backlog renderer`
stay green. The signature changes from `(tree, esc)`; no caller outside
`page.js` and the tests exists (checked with `grep`).

- `!view.tree` or a tree with no node: `<div class="empty">No work items</div>`.
- Else: `backlogRows` → `filterRows` → `sortRows` → `renderTable`. No row
  left: `<div class="empty">No items match <button type="button" class="link" data-action="reset">Reset</button></div>`.
- Then, when `tree.orphanPlans.length`, one line
  `<p class="muted orphans">2 plans without task: <code>a.md</code>, <code>b.md</code></p>`.
- The attention banner is a separate export, `renderAttention(tree, esc)`:
  `''` when `tree.attention` is empty, else
  `<div class="attn">1 item needs attention <button type="button" class="btn secondary" data-action="show-attention">Show</button></div>`.

The tree code of `renderBacklog` (glyphs, `details`, `badge`, `warn-line`)
goes away. `page.css` loses `.badge`, `.warn-line`, `details summary`,
`.task`, `.grp`, `.epic`, and the old `.attn` rule. `.gh` stays: the
Agents card uses it.

### D5 — Detail view: `findItem` and `renderItemView`

`findItem(tree, kind, file)` returns `{ node, feature, epic }` or null.
For a task, `feature` and `epic` are its parents through the tree
structure; for a feature, `epic`; for an epic, both null. It returns null
when `treeHolds(tree, kind, file)` is false. The page uses it for the
`mtime`; `renderItemView` uses it for the header and the breadcrumb.

`renderItemView(view, esc)`, `view = { kind, file, tree, body, backHash }`.
`body` is HTML that the page built (D6), or null while it loads.

```
<nav class="crumbs"><a href="<backHash>">Backlog</a> › <a href="#/item/epic/E01.md">E01 Title</a> › <a …>F001 Title</a> › <span>014 Title</span></nav>
<div class="item-head">
  <span class="item-title">014 Title</span> <span class="chip s-…">status</span>
  [task] <span class="chip">type</span> <span class="chip p-…">plan status</span>
  <span class="muted">created DD-MM-YYYY</span> <span class="muted">edited DD-MM-YYYY</span>
  [flags] <ul class="warns"><li>warning</li>…</ul>
</div>
[task] <div class="actions"> View plan button </div> <div class="related"> chips </div>
<div id="item-body" class="md">body or <p class="muted">loading</p></div>
[feature] <h3>Tasks</h3> renderTable(tasks of the feature)
[epic]    <h3>Features</h3> renderTable(features) <h3>Tasks</h3> renderTable(tasks under them)
```

- A missing parent skips its level. The last level is text, not a link.
- `backHash` is the last list hash the page showed, or `#/`.
- View plan, task detail: enabled
  `<button type="button" class="btn primary" data-action="view-plan" data-file="<plan>">View plan</button>`
  when the task has a plan; else disabled with `title="no plan for this task"`.
- Related: a name that `treeHolds(tree, 'task', name)` accepts gives
  `<a class="chip" href="#/item/task/<name>">name</a>`; any other name gives
  `<span class="chip" title="not in .constellation/tasks/">name</span>`.
- Children tables: `sortRows(backlogRows(tree, kind)` filtered to the
  child files`)`, no status filter.
- The function is about 60 lines with its children section. Split the
  header into a nested `head()` function to keep each part short.

### D6 — Page runtime

`board-ui/page.html`, the backlog card:

```html
<section class="card mt16" id="backlog-card"><h2>Backlog</h2>
  <div id="bl-list">
    <div id="bl-banner"></div>
    <div class="toolbar"><input id="q" type="search" placeholder="Search" aria-label="Search the backlog" autocomplete="off" spellcheck="false"><div id="bl-chips" class="chips"></div></div>
    <div id="backlog"></div>
  </div>
  <div id="bl-item" hidden></div>
</section>
```

The search input is static. A snapshot re-renders `#bl-chips`, `#backlog`,
and `#bl-banner`, never `#q`, so typing keeps focus and caret.

`page.js` state:

```js
function newSlot() { return { key: null, mtime: null, failed: false, seq: 0 }; }
var taskSlot = newSlot(), itemSlot = newSlot();
var itemBodyHtml = null;          // the rendered body of the open detail view
var lastListHash = '#/';          // the breadcrumb Backlog target
var searchTimer = null;
var dialogFile = null, dialogSeq = 0, routeBefore = null;   // unchanged
```

`syncBody(slot, kind, file, mtime, write)` replaces the body of
`syncTaskBody`:

```js
// Fetch a body once per file and mtime. A failed reply marks the slot, so the next render
// (a snapshot, or es.onopen after a reconnect) fetches again. Only the newest reply writes.
function syncBody(slot, kind, file, mtime, write) {
  var key = kind + '/' + file;
  if (slot.key === key && slot.mtime === mtime && !slot.failed) return false;
  var fileChanged = slot.key !== key;
  slot.key = key; slot.mtime = mtime; slot.failed = false;
  var seq = ++slot.seq;
  loadItem(kind, file).then(function (item) {
    if (seq !== slot.seq) return;
    if (item.error) slot.failed = true;
    write(item);
  });
  return fileChanged;
}
```

- Task body: `syncBody(taskSlot, 'task', s.task, mtime, writeDesc)`. When it
  returns `true`, `#desc` gets `<p class="muted">loading</p>` (criterion
  35). No state or no task: `taskSlot.seq++`, `taskSlot.key = null`.
- Item body: the slot key is `kind + '/' + file`, so a task and an epic
  with one name never share a body. When `syncBody` returns `true`,
  `itemBodyHtml` becomes null (the view shows `loading`). On reply, `itemBodyHtml` becomes
  `renderItemBody(item, window.markdownit, esc, snap.tree)` or
  `<p class="muted">body unavailable (<status>)</p>`, then
  `renderBacklogCard()` runs.
- A failed fetch sets `failed`. `es.onopen` calls `render()`, so a
  reconnect refetches (criterion 34). No fetch loop: a fetch starts only on
  `render()`, which runs per snapshot, reconnect, or disconnect.

`render()` order: `renderMeta`, `renderNowCard`, `renderBacklogCard`,
`renderAgentsCard`, `syncRoute`, `tick`.

`renderBacklogCard()`:

```
var route = parseRoute(location.hash)
var listHash = route.view === 'plan' ? (routeBefore || '#/') : location.hash
var shown = parseRoute(listHash)
if shown.view === 'item' and treeHolds(snap.tree, shown.kind, shown.file):
    #bl-list hidden, #bl-item shown
    found = findItem(...); if syncBody(itemSlot, kind, file, found.node.mtime, onItem) returned true: itemBodyHtml = null
    #bl-item.innerHTML = renderItemView({ kind, file, tree, body: itemBodyHtml, backHash: lastListHash }, esc)
else:
    #bl-item hidden, #bl-list shown, itemSlot reset (seq++, key = null)
    b = parseBacklogRoute(listHash); lastListHash = listHash || '#/'
    #bl-banner = renderAttention(tree, esc); #bl-chips = renderToolbar({ route: b, tree: snap.tree }, esc); #backlog = renderBacklog({ tree, route: b }, esc)
```

Event wiring (all delegated, all with `closest`, no inline handler):

- `#backlog-card` click:
  - `[data-action="status"|"type"|"kind"|"attention"]` → toggle that value
    in `parseBacklogRoute(location.hash)` → `writeList(route)`.
  - `[data-action="show-attention"]` → `attention: true`, `status` default
    → `writeList`.
  - `[data-action="reset"]` → `#q.value = ''` → `writeList(default)`.
  - `[data-action="view-plan"]` → `routeBefore = location.hash || '#/'`,
    `location.hash = '#/plan/' + file` (the 023 path).
  - Else, inside `a[href]`: do nothing; the browser follows the anchor.
  - Else, `tr[data-href]`: when `parseRoute(href).view === 'item'`, set
    `location.hash = href`.
- `writeList(route)`: `history.replaceState(null, '', formatBacklogRoute(route))`,
  then `renderBacklogCard()`. `replaceState` fires no `hashchange`, so
  the call is explicit. Filter edits add no history entry (criterion 22).
- `#q` `input`: clear `searchTimer`; after 100 ms, `writeList({ ...route, q: #q.value })`.
  The route is read again from `location.hash` at that time.
- `#now-actions` click: `view-plan` (unchanged), and `open-task` →
  `location.hash = '#/item/task/' + file`, then
  `document.getElementById('backlog-card').scrollIntoView({ block: 'start' })`
  when the method exists.
- `hashchange` → `onRoute()`: copy `parseBacklogRoute(location.hash).q`
  into `#q.value` when the route is a list route; then
  `renderBacklogCard()`; then `syncRoute()`. Boot runs the same copy once.
- `onDialogClose` keeps its logic. Its comment gains the reason (criterion
  38): when the plan leaves the tree, `syncRoute` closes the dialog while
  the hash still names the plan; the handler replaces the hash, so the
  route never names a plan that the tree does not hold, and the plan does
  not reopen by itself when the file returns.
- Links inside a body: `#/item/…` and `#/plan/…` anchors change the hash;
  the existing `hashchange` path opens the view. An item link inside the
  plan dialog changes the route away from `plan`; `syncRoute` closes the
  dialog and `onDialogClose` leaves the new hash alone.

Rejected: a router library, or `pushState` with real paths. The server
serves `/` only; hash routes need no server change. Rejected: a history
entry per filter edit. Back would step through every chip click before it
leaves the list.

### D7 — Server: `/api/item` kinds and the referrer policy

`board.mjs`:

```js
const ITEM_DIRS = { epic: 'epicsDir', feature: 'featuresDir', task: 'tasksDir', plan: 'plansDir' };
```

`serve`, next to `nosniff`:

```js
res.setHeader('referrer-policy', 'no-referrer');
```

`treeHolds` in `board-render.mjs` adds:

```js
if (kind === 'epic') return tree.epics.some(function (e) { return e.file === file; });
if (kind === 'feature') return tree.orphanFeatures.some(match) || tree.epics.some(function (e) { return e.features.some(match); });
```

The route needs no other change: `treeHolds` is the gate, `readItem` maps
the kind to the directory, and every refusal is the 023 404.

### D8 — Internal links: `internalHref(href, tree)`

A pure export. It returns a hash or null.

1. Null when `href` is empty or holds `:` (a scheme), or when the tree is
   null.
2. Drop a `#…` fragment and a `?…` query.
3. Split on `/`. The last part is the name; it must pass the name rule.
   The part before it is the directory, or `''`.
4. Directory map: `tasks` → `task`, `features` → `feature`, `epics` →
   `epic`, `plans` → `plan`.
   - A mapped directory: that kind only. `plan` gives `#/plan/<name>`;
     the others give `#/item/<kind>/<name>`. Only when `treeHolds` agrees.
   - No directory or an unmapped one: try `task`, `feature`, `epic`, then
     `plan`, in that order, and take the first that `treeHolds` accepts.
     A task and its plan share one name; a bare name means the task.
5. Else null.

`renderMarkdown(text, markdownit, esc, tree)` and
`renderItemBody(item, markdownit, esc, tree)` gain the `tree` argument.
The `link_open` rule becomes:

```js
var internal = internalHref(href, tree);
if (internal) token.attrSet('href', internal);
else if (isRemote(href)) { token.attrSet('rel', 'noopener noreferrer'); token.attrSet('target', '_blank'); }
else if (token.attrIndex('href') >= 0) token.attrs.splice(token.attrIndex('href'), 1);
```

- An internal link gets no `target`; it stays on the page.
- markdown-it escapes the attribute value. The hash holds only name-rule
  characters, so no escape is needed, but the library applies it anyway.
- The image rule does not change: an image is never internal.
- The body caches stay keyed by `mtime` (D6). A link whose target appears
  later in the tree rewrites at the next body change. Accepted.
- `renderPlanDialog` passes `view.tree` through to `renderItemBody`; the
  page adds `tree: snap.tree` to its view.

### D9 — Now actions: Open task

`renderNowActions(view, esc)` returns two buttons: View plan (unchanged)
then Open task:

- No `state.task`: disabled, `title="no task in the workflow state"`.
- `treeHolds(tree, 'task', state.task)` false: disabled,
  `title="task <file> is not in .constellation/tasks/"`.
- Else `<button type="button" class="btn secondary" data-action="open-task" data-file="<file>">Open task</button>`.

### D10 — Styles

Append to `page.css` before the `@media (min-width: 1100px)` block, every
color a `var()`:

```css
/* Backlog: toolbar, table, detail */
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
#q { flex: 1 1 220px; min-width: 0; height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font: inherit; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
button.chip, .seg { cursor: pointer; font: inherit; font-size: 12px; }
.chip[aria-pressed="false"], .seg[aria-pressed="false"] { opacity: .5; }
.seg { height: 26px; padding: 0 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); border-radius: 8px; }
.seg[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
.link { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; cursor: pointer; text-decoration: underline; }
.attn { display: flex; gap: 10px; align-items: center; border: 1px solid var(--danger); color: var(--danger); border-radius: 8px; padding: 6px 10px; margin-bottom: 10px; font-size: 13px; }
.tbl { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 13px; }
.tbl th { position: sticky; top: 0; background: var(--surface-2); color: var(--muted); font-weight: 600; text-align: left; font-size: 12px; }
.tbl th, .tbl td { padding: 8px; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; vertical-align: top; }
.tbl tbody tr { cursor: pointer; }
.tbl tbody tr:nth-child(even) { background: color-mix(in srgb, var(--surface-2) 50%, transparent); }
.tbl tbody tr:hover { background: var(--surface-2); }
.tbl tr.inflight td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
.tbl a { color: var(--text); } .tbl td.col-feature a, .tbl td.col-epic a { color: var(--accent); }
.col-id { width: 64px; } .col-type { width: 76px; } .col-status { width: 120px; } .col-plan { width: 84px; } .col-updated { width: 96px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); margin-right: 4px; }
.crumbs { font-size: 13px; color: var(--muted); margin-bottom: 10px; } .crumbs a { color: var(--accent); }
.item-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.item-title { font-size: 16px; font-weight: 600; }
.related { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
#bl-item h3 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin: 18px 0 8px; }

@media (max-width: 640px) {
  .col-epic, .col-plan, .col-updated { display: none; }
}
```

- `table-layout: fixed` with `width: 100%` keeps the table inside its card
  at any width. Cells wrap with `overflow-wrap: anywhere`. No horizontal
  scroll region, so the sticky header sticks to the page.
- The phone breakpoint is 640 px. Criterion 31 names 390 px; 640 px also
  covers large phones. The 1100 px block does not change.
- `.tbl-wrap` gets no rule. It is a hook for task 032.
- The 022 test `page.css: every color outside the token blocks is a
  var()` covers the new rules with no edit.

### D11 — Folded task 030 and 031 items

- Header comment of `board-render.mjs`: "Every export is a function whose
  body uses no module-scope symbol and no import. An export may call
  another export, because the page defines every export at top level.
  Nothing else is in scope."
- `renderMarkdown`: `/^﻿/`. Test fixture at the `extractTitle` test:
  `'﻿---…'`.
- `chipClass` (D4) replaces the inline allow-lists in `renderPlanDialog`
  and the old `header()`.
- Isolation (T25): build the prelude as `board.mjs` builds it; run
  `vm.runInNewContext(prelude + '\n;({' + names + '})', {})`; call each
  export with the args in a fixture table `ISOLATION_ARGS` (one entry per
  export name); assert that each call returns the same value as the
  module function. The test first asserts that `ISOLATION_ARGS` has a key
  for every export, so a new export without fixture fails the suite.
  Formatters (`hhmm`, `fmtDur`, …) and `esc` pass in through the args, as
  the page passes them.
- Parity (T26): fixtures `bom`, `crlf`, `no front matter`, `fence first`.
  For each: `extractTitle(t)` gives title `x`; `renderMarkdown(t,
  stubFactory(rec), esc)` hands the stub a body; the stub input does not
  hold the line `# x`, and the original text after the front matter does.

### D12 — Test harness growth

- `bootPage` sandbox gains: a `setTimeout`/`clearTimeout` stub with a
  manual queue (`page.runTimers()`), `#q` with `value`, `#bl-item`,
  `#bl-list`, `#bl-banner`, `#bl-chips`, `#backlog-card` with
  `scrollIntoView` that records calls, and a `deferred` fetch mode:
  `fetch` returns a promise that the test resolves by URL and order
  (`page.resolve(url, item)`). The 023 tests keep their default mode.
- `table40()` fixture: 3 epics, 5 features, 40 tasks across all seven
  groups, 2 flagged, one in flight, 2 orphan plans. T13, T15, T16 use it.
- `tasks500()` builds 500 task nodes for T12.

## Implementation

All paths are under
`/Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/`
unless given in full.

### Files

| File | Change | Lines (about) |
|---|---|---|
| `board-model.mjs` | `created`, `edited`, `related` in `toNode`; `mtime`, `created`, `edited` in `groupNode` (D1). | +6 |
| `board-render.mjs` | Header comment; BOM escape; `chipClass`, `parseRoute` item view, `parseBacklogRoute`, `formatBacklogRoute`, `backlogRows`, `filterRows`, `sortRows`, `renderTable`, `renderToolbar`, `renderAttention`, `renderBacklog` (rewritten), `findItem`, `renderItemView`, `internalHref`; `tree` argument on `renderMarkdown`, `renderItemBody`, `renderPlanDialog`; `treeHolds` kinds; Open task in `renderNowActions` (D2 to D5, D7 to D9, D11). | +330, -60 |
| `board-ui/page.html` | The backlog card structure (D6). | +8, -1 |
| `board-ui/page.css` | D10; remove the tree rules and `.badge`. | +45, -12 |
| `board-ui/page.js` | `newSlot`, `syncBody`, item view, `writeList`, toolbar and row handlers, search debounce, `onRoute`, Open task, `onDialogClose` comment (D6). | +130, -30 |
| `board.mjs` | `ITEM_DIRS` kinds; `referrer-policy` (D7). | +2 |
| `board.test.mjs` | T1 to T46; E1 to E15; `bootPage` growth; `table40`, `tasks500`, `ISOLATION_ARGS` (D12). | +950 |
| `/Users/joaooliveira/study/constellation-harness/CHANGELOG.md` | Entry under `[Unreleased]`. Technical Writer at Gate 2. | — |
| `/Users/joaooliveira/study/constellation-harness/README.md` | Line 214: "the backlog tree" becomes "the backlog table with search, filters, and detail views". Technical Writer. | ±1 |
| `/Users/joaooliveira/study/constellation-harness/docs/specs/board-ui-v2.md` | §6.2 and §4.4: one line each that defers sortable headers, `sort=`, the `Plan` select, and `/` to task 032. §6.2: the counts strip folds into the Status chips. Technical Writer. | +4 |

No change to `selftest.sh`, `board-vendor/`, `board.md`, `plugin.json`,
`marketplace.json`, `hooks.json`, `log-event.sh`, or `templates/`.

### Order, with checkpoint commits

Each step ends GREEN, then VERIFY per
`constellation:test-verified-development` (mutation variant, named per
test below), then one commit. The commit body records the VERIFY evidence.

1. **Folded 030 and 031 groundwork.** Header comment, BOM escape,
   `chipClass` in `renderPlanDialog` and `renderBacklog`, `referrer-policy`,
   the `onDialogClose` comment. Tests T4, T24, T25, T26, T27, T33.
   Commit: `refactor: board render exports share chipClass, the isolation test runs every export, BOM escape, no-referrer (tasks 030, 031)`.
2. **Model and item kinds.** D1, D7 (`ITEM_DIRS`, `treeHolds`), `findItem`.
   Tests T1, T2, T3.
   Commit: `feat: board snapshot carries dates and related links, /api/item serves epics and features (task 024)`.
3. **Routes and rows.** `parseRoute` item view, `parseBacklogRoute`,
   `formatBacklogRoute`, `backlogRows`, `filterRows`, `sortRows`. Tests T5
   to T12; E14.
   Commit: `feat: board parses backlog routes and filters and sorts backlog rows (task 024)`.
4. **Table, toolbar, banner.** `renderTable`, `renderToolbar`,
   `renderAttention`, `renderBacklog`; the D10 styles; remove the tree
   styles, the row count. Tests T13 to T16, T44, T45, T46; E1 to E12, E15.
   Commit: `feat: board backlog renders as a table with status, type, and kind filters (task 024)`.
5. **Detail views and links.** `internalHref`, the `tree` argument,
   `renderItemView`, Open task. Tests T17 to T23; E13.
   Commit: `feat: board renders epic, feature, and task detail views and rewrites internal links (task 024)`.
6. **Page runtime.** `page.html`, `page.js` (D6), `bootPage` growth (D12).
   Tests T28 to T43.
   Commit: `feat: board page routes the backlog list and detail views through the hash (tasks 024, 030)`.
7. **Manual browser check** (Validation). Fix what it finds, then commit
   under `fix:` when a fix was needed.

### Data flow

- Snapshot: `toNode` (`created`, `edited`, `related`) → `buildTree`
  (`groupNode` with `mtime`, `created`, `edited`).
- List: `location.hash` → `parseBacklogRoute` → `backlogRows(tree, kind)`
  → `filterRows(rows, route, tree.attention)` → `sortRows` → `renderTable`
  → `#backlog`; `renderToolbar` → `#bl-chips`; `renderAttention` →
  `#bl-banner`.
- Edit: chip click or debounced input → new route → `formatBacklogRoute`
  → `replaceState` → `renderBacklogCard`.
- Item: anchor or row click → `location.hash = '#/item/…'` (push) →
  `hashchange` → `onRoute` → `renderBacklogCard` → `treeHolds` →
  `findItem` → `syncBody(itemSlot)` → `GET /api/item?kind=<kind>` →
  `renderItemBody(item, markdownit, esc, tree)` (→ `internalHref` per link)
  → `itemBodyHtml` → `renderItemView`.
- Server: `/api/item` → `treeHolds` (four kinds) → `readItem` →
  `ITEM_DIRS[kind]` → `readPrefix` with the 512 KB buffer.

## Validation

Follow `constellation:test-verified-development`. Every new test has a
named mutation: apply it, run the file, confirm the named test fails for
that reason, restore the code.

- Run: `node --test /Users/joaooliveira/study/constellation-harness/plugins/constellation/scripts/board.test.mjs`
- Lint Gate: `/Users/joaooliveira/study/constellation-harness/scripts/selftest.sh`
- Mocking: none at the logic level. Fixtures are in-memory trees,
  temporary directories, real local sockets, the `vm` page sandbox with
  stub DOM objects, a stub `markdownit` factory, and the vendored library
  in `vm` for the link tests.

All 192 current tests pass on `main` at 1a8f708.

**Automated Test**: model and server (criteria 20, 25, 37)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T1 | `toNode: a node carries created, edited, and related; group nodes carry mtime and the dates` | `related: a.md, b.md` → `['a.md','b.md']`; no field → `[]`; `date-created`/`last-edit` → `created`/`edited`; `buildTree` epic, feature, and orphan plan carry `mtime`, `created`, `edited`. | Drop `mtime` from `groupNode`. |
| T2 | `treeHolds: epics and features by kind, with the name rule` | An epic → true as `epic`, false as `feature`; a feature under an epic and an orphan feature → true as `feature`; `../F001.md` → false. | Return false for `feature` under an epic. |
| T3 | `serve: /api/item serves epic and feature bodies and refuses names outside the tree` | Temporary project with one epic, one feature: 200 with `text` equal to the file; `kind=feature&file=F999-x.md` → 404. | Remove `feature` from `ITEM_DIRS`. |
| T4 | `serve: every response carries referrer-policy no-referrer` | `GET /`, `/api/snapshot`, and a 404 hold the header. | Remove the header. |

**Automated Test**: routes and rows (criteria 2 to 4, 7, 11 to 13, 17, 24, 32)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T5 | `parseRoute: #/item/<kind>/<file> opens a detail view for epic, feature, and task only` | Three kinds → `{ view: 'item', kind, file }`; `#/item/plan/x.md`, `#/item/task/../x.md`, `#/item/task/` → overview. | Accept any kind text. |
| T6 | `parseBacklogRoute: defaults, each key, and unknown values` | `#/`, `''`, `#/plan/x.md` → defaults; each key parses; `status=done,bogus` → `['done']`; `kind=plan` → `task`; `q=%E0` → `''`; `status=` → `[]`. | Keep unknown status values. |
| T7 | `formatBacklogRoute: the default is #/ and every route round-trips` | Default → `#/`; five routes round-trip through `parseBacklogRoute`; `q: 'a&b c'` encodes. | Skip `encodeURIComponent`. |
| T8 | `backlogRows: tasks carry feature and epic from the tree, a slug title without H1, and standalone dashes` | Feature and epic titles for a linked task; a task with a broken `feature:` link → `feature: null`; no H1 → slug with spaces; feature rows carry `taskCounts`; epic rows `featureCount`, `taskCount`. | Use `links.feature` for the feature. |
| T9 | `filterRows: the search matches the seven fields, case-insensitive` | Seven rows, each matching `BoArD` in one field only, plus one row with no match → seven rows remain. | Drop `epic.title` from the haystack. |
| T10 | `filterRows: status, type, and attention filters` | Default status hides done and dropped; `type: ['fix']` keeps fix only and hides a null type; `type: null` keeps all; `attention: true` keeps only attention rows, a `done` one included. | Ignore `route.type`. |
| T11 | `sortRows: status group order, then id descending, numeric aware` | Mixed groups and ids `099`, `100`, `F009`, `F010`, null → the expected order; the input array is unchanged. | Sort ids ascending. |
| T12 | `filterRows, sortRows, and renderTable handle 500 tasks in under 100 ms` | `tasks500()`; one run of the three timed with `process.hrtime.bigint()`; under 100 ms; 500 `<tr` with every status on. | Add a 150 ms busy loop in `renderTable`. |

**Automated Test**: table, toolbar, banner (criteria 1, 3, 5, 6, 8, 10, 14 to 16, 31)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T13 | `renderTable: the task table has the eight columns, links, chips, dashes, and the in-flight row` | `table40()`: header cells in order with their `col-` classes; Feature and Epic anchors to `#/item/…`; `—` for a standalone task; plan chip `p-approved`; `tr class="inflight"` with `▶ engineer` after the status chip; a flagged row has the dot and the `title`. | Drop the `—` fallback. |
| T14 | `renderTable: the feature and epic tables have their columns and counts` | Feature table: six columns; Tasks cell holds `done 2` and no chip for an absent group. Epic table: six columns; Features and Tasks numbers. | Render only the task total. |
| T15 | `renderToolbar: status chips show tree.counts, pressed by route, and hide for features` | `counts.done === 3` while the rows hold no done row → `done 3`; `aria-pressed="false"` on done by default; six type chips; kind `feature` → no `data-action="status"`. | Count from the filtered rows. |
| T16 | `renderBacklog: no match shows Reset, orphan plans show one line, the banner counts attention` | `q: 'zzz'` → `No items match` and `data-action="reset"`; two orphan plans → `2 plans without task` with both names; one → `1 plan without task`; `renderAttention` → `1 item needs attention` and `2 items need attention`; `{ tree: null }` → `No work items`. | Drop the orphan line. |
| T44 | `page.css: the phone width hides the Epic, Plan, and Updated columns and the table stays inside its card` | A `max-width` media block holds `.col-epic`, `.col-plan`, `.col-updated` with `display: none`; `.tbl` holds `table-layout: fixed` and `width: 100%`; `.tbl td` holds `overflow-wrap: anywhere`. | Remove `.col-plan` from the block. |
| T45 | `page.css: the in-flight row has an accent border and the tree styles are gone` | `.tbl tr.inflight td:first-child` uses `var(--accent)`; no rule for `.badge`, `.warn-line`, `.grp`. | Keep the `.badge` rule. |
| T46 | `renderToolbar: the row count reads shown of total for the current kind` | `table40()`, default route → `<shown> of 40` with `shown` equal to the non-done, non-dropped task count; `q: 'zzz'` → `0 of 40`; kind `feature` → `5 of 5`; `q` matching one feature → `1 of 5`. | Take `total` from the filtered rows. |

**Automated Test**: detail views, links, Now actions, folded items (criteria 18 to 21, 26 to 30, 33, 38 to 40)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T17 | `renderItemView: a feature shows breadcrumb, header, body, and its Tasks table` | Breadcrumb `Backlog` → `backHash`, epic level `href="#/item/epic/E01-a.md"`, the feature as text; header id, title, `s-` chip, `created`, `edited`; `id="item-body"` holds the given body; one `<table` with the feature's tasks only, done ones included. | Drop the epic level. |
| T18 | `renderItemView: an epic shows a Features table and a Tasks table of every task under them` | Two features with two tasks each → Features table with 2 rows, Tasks table with 4 rows. | Take the tasks of the first feature only. |
| T19 | `renderItemView: a task shows type and plan chips, View plan, and related chips` | Type chip, `p-approved`, enabled `data-action="view-plan"`; a task without plan → disabled, `no plan for this task`; a related name in the tree → `href="#/item/task/<name>"`; one outside → no `href`, `title`; a standalone task → breadcrumb `Backlog › <task>`. | Link a related name without `treeHolds`. |
| T20 | `renderItemView: a loading or failed body keeps the header and the children` | `body: null` → `<p class="muted">loading</p>`; `body: '<p class="muted">body unavailable (404)</p>'` → that text; the header and the children table render in both. | Return `''` when `body` is null. |
| T21 | `internalHref: names, directories, and kinds resolve through the tree` | `014-x.md`, `../tasks/014-x.md`, `./014-x.md#h` → `#/item/task/014-x.md`; `../plans/014-x.md` → `#/plan/014-x.md`; `../features/F001-a.md` → feature; an orphan plan by bare name → plan; `zzz.md`, `https://x/014-x.md`, `mailto:a`, `../tasks/../x.md`, null tree → null. | Ignore the directory part. |
| T22 | `renderMarkdown with the vendored library and a tree: internal links get a hash and no target` | `[t](../tasks/014-x.md)` → `<a href="#/item/task/014-x.md">t</a>`; `[p](../plans/014-x.md)` → `#/plan/…`; `[z](zzz.md)` → `<a>z</a>`; no `target` on internal links. | Remove the rewrite branch. |
| T23 | `renderNowActions: Open task is enabled only when the tree holds the in-flight task` | Tree holds the task → `data-action="open-task"`, `data-file`; not in tree → disabled with `task 023-x.md is not in .constellation/tasks/`; no task → `no task in the workflow state`. | Ignore the tree. |
| T24 | `chipClass: the allow-list picks the class, anything else is other` | `('s-', [...], 'done')` → `s-done`; `'weird'`, `'constructor'`, `'__proto__'`, `null` → `s-other`. | Use the `in` operator on an object. |
| T25 | `board-render.mjs: every export runs in a vm context that holds only the prelude` | `ISOLATION_ARGS` covers every export; each call in the bare context equals the module call. | Move the `TASK_GROUPS` array of `sortRows` to module scope. |
| T26 | `extractTitle and renderMarkdown drop the same line for BOM, CRLF, no front matter, and a fenced H1` | Per fixture: the stub input lacks `# <title>`; the source after the front matter holds it. | Remove the BOM strip in `renderMarkdown`. |
| T27 | `board-render.mjs and page.js hold no literal U+FEFF` | `!text.includes('﻿')` for both files. | Put the literal back in the regex. |

**Automated Test**: page runtime (criteria 7, 9, 11, 12, 17, 18, 20, 22 to 24, 26, 29, 34 to 36, 38)

| # | Test name | Proves | Mutation that must fail it |
|---|---|---|---|
| T28 | `page.js: a failed task body is fetched again on the next snapshot and on reconnect` | Reply 500 → `task body unavailable (500)`; the same snapshot again → a second fetch; then `es.onopen()` after an OK reply → no third fetch; a new failure then `onopen` → a fetch. | Leave `failed` false on error. |
| T29 | `page.js: a new in-flight task shows loading until its body arrives` | Deferred fetch; switch the state task → `#desc` holds `loading` and not the old body; an `mtime` change of one task keeps the old body. | Skip the loading write. |
| T30 | `page.js: an older task body reply after a newer one is ignored` | Two deferred task fetches; resolve the second, then the first → `#desc` shows the second. | Remove the `seq` check in `syncBody`. |
| T31 | `page.js: an older plan reply after a newer one is ignored` | `#/plan/a.md`, then `#/plan/b.md`; resolve b, then a → the dialog shows b. | Remove the `dialogSeq` check. |
| T32 | `page.js: an older detail body reply after a newer one is ignored` | `#/item/task/a.md`, then `#/item/task/b.md`; resolve b, then a → `#bl-item` holds b's body. | Use a fresh counter per call. |
| T33 | `page.js: the close button closes the dialog and restores the route` | Open a plan from `#/other`; dispatch a click whose `closest('[data-action="close-dialog"]')` matches → dialog closed, hash `#/other`. | Remove the dialog click listener. |
| T34 | `page.js: a feature route shows the detail view and a new snapshot updates its children` | `#/item/feature/F001-a.md` → `#bl-list` hidden, `#bl-item` shows the Tasks table; a snapshot with a child status changed → the new chip; one body fetch only. | Render the list on every snapshot. |
| T35 | `page.js: an item route outside the tree shows the list and keeps the hash` | `#/item/feature/F999-x.md` → `#bl-item` hidden, `#backlog` holds a table, hash unchanged, no fetch. | Skip `treeHolds` in `renderBacklogCard`. |
| T36 | `page.js: a status chip click replaces the hash and shows done rows` | Click `data-action="status" data-value="done"` → `replaced` ends with `#/backlog?status=inbox,refined,in-progress,parked,other,done`; no `hashchange`; `#backlog` holds a done row. | Assign `location.hash` in `writeList`. |
| T37 | `page.js: a reload on a filter hash applies the filters and fills the search` | Boot with `#/backlog?status=inbox,refined,in-progress,parked,other,done&q=board` → `#q.value === 'board'`; rows match. | Skip the boot copy of `q`. |
| T38 | `page.js: typing in the search filters the rows after 100 ms and writes q` | Set `#q.value = 'BOARD'`, fire `input`; before the timer, rows unchanged; `runTimers()` → only matches remain, hash holds `q=BOARD`. | Write the route without `q`. |
| T39 | `page.js: Reset returns the default filters and empties the search` | From a filter hash with `q`, click `data-action="reset"` → hash `#/`, `#q.value === ''`. | Keep `q` on reset. |
| T40 | `page.js: the attention banner turns the toggle on and leaves only attention rows` | One malformed task → banner; click `show-attention` → hash holds `attn=1`; one `<tr` in the body. | Toggle without writing the route. |
| T41 | `page.js: Open task opens the task detail view and scrolls to the backlog` | Click `open-task` → hash `#/item/task/023-x.md`, `#bl-item` shown, `scrollIntoView` called once. | Skip the hash write. |
| T42 | `page.js: View plan from a task detail view returns to that view on close` | `#/item/task/023-x.md`, click `view-plan` in `#backlog-card` → dialog open, `#bl-item` still shown; close → hash `#/item/task/023-x.md`. | Do not set `routeBefore` in the backlog handler. |
| T43 | `page.js: a failed detail body shows body unavailable with the header and children` | Reply 404 for the item → `#bl-item` holds `body unavailable (404)`, the header, and the Tasks table. | Write nothing on error. |

**Existing tests that change their body (none is deleted)**

| # | Test | Change |
|---|---|---|
| E1 | `renderBacklog: every task file appears, including malformed and other` | Call `renderBacklog({ tree, route })` with every status on; `data-href` for each file; `▶ engineer`; plan chip. |
| E2 | `renderBacklog: file names are escaped` | New signature. |
| E3 | `renderBacklog: Needs attention lists malformed and lenient items with warnings` | Rename `renderAttention and the table: attention items are counted and their rows carry the warnings in title`. |
| E4 | `renderBacklog: an unknown-field-only row keeps its badge …` | `<span class="badge warn">lenient</span>` becomes the `dot` span; the two `warn-line` divs become one `title` with both warnings; the row stays out of the banner count. |
| E5 | `renderBacklog: warning text built from front-matter keys and links is escaped` | New signature; the `title=` assert holds. |
| E6 | `renderBacklog: a task row shows its own warnings right under it` | Rename `… shows its own warnings in its title`; `badge warn` becomes the `dot`; `warn-line` becomes `title`. |
| E7 | `renderBacklog: done and dropped collapse in details with counts` | Rename `… done and dropped rows hide by default and show with their chip`. |
| E8 | `renderBacklog: parked and dropped tasks stay visible, dropped inside a collapsed group` | Rename `… parked shows by default, dropped shows with its chip`. |
| E9 | `renderBacklog: names in epic, feature, and plan rows are escaped` | Through the Epics and Features kinds and the orphan line. |
| E10 | `renderBacklog: a plan status that names an Object prototype key renders the default glyph` | Rename `… renders the p-other chip`. |
| E11 | `renderBacklog: source runs with no module scope` | New signature. |
| E12 | `renderBacklog: a status outside the allow-list gets the class s-other only` | Through the Features kind row. |
| E13 | `renderMarkdown with the vendored library: raw HTML is text, …` (test 13 of 023) | Pass a tree that holds `014-x.md`; `[b](014-x.md)` → `<a href="#/item/task/014-x.md">b</a>`; the final regex becomes `!/href="(javascript|014|#top)/`. Rename `…, relative links outside the tree lose href, …`. |
| E14 | `parseRoute: #/plan/<file> opens the plan dialog and every other hash is the overview` | `#/item/task/x.md` leaves the overview list (T5 covers it). |
| E15 | `board-render.mjs: every export is a function that runs with no module scope` (022) | `renderBacklog(null, esc)` becomes `renderBacklog({ tree: null }, esc)`. |

The `bootPage` helper grows (D12); the 023 runtime tests keep their
calls. Count: 46 new tests; the suite goes from 192 to 238.

**MANUAL TEST**: the table, the filters, the detail views, and the links in a browser (spec §11, once per phase)

- **Why manual**: the 390 px layout, the Back button, focus while typing,
  the sticky header, and the 500-task feel need a real browser. `node
  --test` has none, and the project adds no browser dependency.
- **Preconditions**: the branch at step 6 or later; Chrome; the fixture
  built by
  `/private/tmp/claude-501/-Users-joaooliveira-study-constellation-harness/1dda0709-05d7-492d-93e1-c206b58a887f/scratchpad/board-fixture/build.sh`
  with the additions below; the board on port 4499 against the fixture.
  The orchestrator drives Chrome with the CDP driver
  `<scratchpad>/cdp-shot.mjs`. A plain `--screenshot` fires before the
  async fetches, so it cannot show a detail view or a dialog. Copy the
  driver to `<scratchpad>/cdp-024.mjs` and extend it:
  - an optional third argument, a JS expression to `Runtime.evaluate`
    after load (clicks, `location.hash = …`, `input` events), then a
    second wait of 1 s before the screenshot;
  - an optional `--width 390` flag that sends
    `Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true })`
    before `Page.navigate`. Device emulation sets the layout viewport, so
    the media query fires. Headless Chrome clamps a window near 500 px,
    and the `documentElement.style.width` proxy of 022 and 023 does not
    fire media queries, so neither can prove criterion 31.
  - print `document.documentElement.scrollWidth`,
    `document.documentElement.clientWidth`, and `location.hash` in the
    state line.
- **Fixture additions** (append to `build.sh` after the 023 block):

```bash
# Task 024 additions: 2 epics, 4 features, tasks across every status, a related link, a malformed file, 2 orphan plans.
mkdir -p "$FIX/.constellation/epics"
printf -- '---\nstatus: active\n---\n# Board UI\n\nThe board epic. See [the plan](../plans/%s).\n' "$S23" > "$FIX/.constellation/epics/E01-board.md"
printf -- '---\nstatus: active\n---\n# Harness core\n' > "$FIX/.constellation/epics/E02-core.md"
printf -- '---\nstatus: active\nepic: E01-board.md\n---\n# Feature a\n' > "$FIX/.constellation/features/F001-a.md"
printf -- '---\nstatus: active\nepic: E01-board.md\ndate-created: 14-10-2026\nlast-edit: 21-10-2026\n---\n# Backlog table\n\nLinks: [task 101](101-search.md) · [missing](999-nope.md)\n' > "$FIX/.constellation/features/F002-table.md"
printf -- '---\nstatus: active\nepic: E02-core.md\n---\n# Hooks\n' > "$FIX/.constellation/features/F003-hooks.md"
printf -- '---\nstatus: active\n---\n# Orphan feature\n' > "$FIX/.constellation/features/F004-loose.md"
i=100
for st in inbox inbox refined refined in-progress parked done done dropped; do
  for f in F002-table.md F003-hooks.md; do
    i=$((i+1)); ty=$([ $((i%3)) -eq 0 ] && echo fix || echo feature)
    printf -- '---\nstatus: %s\ntype: %s\nfeature: %s\nrelated: 101-search.md\ndate-created: 14-10-2026\nlast-edit: 2%d-10-2026\n---\n# Task %d about the board search\n\nBody of task %d. See [the feature](../features/F002-table.md).\n' "$st" "$ty" "$f" $((i%2)) "$i" "$i" > "$FIX/.constellation/tasks/$i-search.md"
  done
done
printf -- '---\nstatus: inbox\ntype: spike\n---\nno title here\n' > "$FIX/.constellation/tasks/130-no-title-standalone.md"
printf 'no front matter at all\n' > "$FIX/.constellation/tasks/131-malformed.md"
printf -- '---\nstatus: draft\ntask: 900-gone.md\n---\n# Orphan plan one\n' > "$FIX/.constellation/plans/900-gone.md"
printf -- '---\nstatus: approved\n---\n# Orphan plan two\n' > "$FIX/.constellation/plans/901-loose.md"
```

  The `F001-a.md` line rewrites the 022 feature under `E01`. For
  step 10, a second fixture `project500` gets 500 tasks from a loop of
  the same shape (`build.sh 500`, or a copy of the script with `n=500`).

- **Steps**:
  1. Open `#/` at 1280 px. Confirm: the attention banner reads
     `1 item needs attention` (or the count of `tree.attention`); the
     toolbar shows Tasks pressed, seven Status chips with counts, `done`
     and `dropped` not pressed; the table has the eight columns; the
     in-flight 023 row has `▶` and the accent border; `130` shows the
     title `no title standalone` with `—` in Feature and Epic; the line
     `2 plans without task` names `900-gone.md` and `901-loose.md`. The
     console shows no `Refused to` line.
  2. Type `board` in the search. Confirm the rows filter within 200 ms, the
     input keeps focus and caret, the URL holds `q=board`, and the count
     next to the Kind control reads `<shown> of <total>`. Type `zzz`.
     Confirm the count `0 of <total>`.
     Confirm `No items match` and Reset. Click Reset. Confirm `#/` and an
     empty input.
  3. Click the `done` chip. Confirm done rows and the URL
     `#/backlog?status=inbox,refined,in-progress,parked,other,done`. Reload.
     Confirm the same state. Leave only `fix` in Type. Confirm fix rows
     only.
  4. Click Features, then Epics. Confirm the six columns of each and the
     count chips in the Tasks cell of the feature table.
  5. Click the banner button. Confirm only `131-malformed.md` remains and
     its dot `title` lists `no front-matter`.
  6. From the filtered table of step 3, click a Feature cell (`F002`).
     Confirm the breadcrumb `Backlog › E01 Board UI › F002 Backlog table`,
     the header with `created 14-10-2026` and `edited 21-10-2026`, the
     body, and the Tasks table. Click `E01` in the breadcrumb. Confirm
     the Features and Tasks tables. Press Back twice. Confirm the feature
     view, then the filtered table of step 3.
  7. In the F002 body, click `task 101`. Confirm `#/item/task/101-search.md`.
     Hover `missing`: no `href`. In the task view, confirm the type and
     plan chips, View plan disabled with `no plan for this task`, and the
     related chip `101-search.md`. Open `E01`; click `the plan`. Confirm
     the plan dialog opens; Esc returns to the epic view.
  8. In the Now panel, click Open task. Confirm the page scrolls to the
     backlog card and the 023 task detail view shows. Click View plan
     there; close; confirm the task view stays.
  9. Run the driver with `--width 390` on `#/` and on
     `#/item/feature/F002-table.md`. Confirm `scrollWidth === clientWidth`
     (390), and the Epic, Plan, and Updated columns are absent from the
     screenshot.
  10. Start a second board on `project500` (port 4498). Open `#/` and type
      in the search. Confirm the table re-renders with no visible lag. In
      DevTools (or the driver), time one `renderBacklogCard()` call through
      a `performance.now()` pair around a `#q` input dispatch; record the
      number in the PR description.
  11. Toggle the theme. Confirm the table, the chips, the banner, the
      breadcrumb, and the detail view follow the tokens in both themes.
  12. Set `#/item/feature/zzz.md` and reload. Confirm the list view, no
      console error, and the hash unchanged.
- **Expected**: every confirmation above holds. Any `Refused to` line,
  any horizontal scroll at 390 px, or a Back press that lands on the
  default table in step 6 fails the test.
- **Observability**: the console; `location.hash`; `history.length`
  before and after chip clicks (no growth); the Network panel for
  `/api/item` (one request per item and `mtime`); the response headers of
  `/` (`referrer-policy: no-referrer`).

## Integration Touchpoints

- **Snapshot wire format** - Could break: a consumer that pins the node
  key set - Validation: `created`, `edited`, `related`, and group-node
  `mtime` are additions; T1; every `buildTree` test passes with no edit.
- **`/api/item`** - Could break: a new kind opens a directory outside the
  tree allow-list - Validation: `treeHolds` stays the one gate (T2, T3);
  the 023 refusal tests (26 to 29) stay green.
- **CSP** - Could break: a new inline handler or style - Validation: the
  022 tests (no `style=` in the render sources and `page.js`, no color
  literal) and the hash tests cover the new code with no edit; manual
  step 1 watches the console.
- **History and routes** - Could break: the plan dialog close lands on a
  wrong view; Back walks through filter edits - Validation: T36, T42,
  manual steps 6 to 8.
- **`renderBacklog` signature** - Could break: an outside caller - none
  exists (`grep` over the repo); the 1.3.4 name stays exported.
- **Current tests (192)** - Could break: 15 tests that pin the tree
  markup, the `parseRoute` overview list, or test 13 - Validation: E1 to
  E15 list each change.
- **Plugin packaging** - Could break: nothing; no new file.
- **README, spec, CHANGELOG** - Could break: the README still says
  "backlog tree"; the spec still lists sort and `/` as built - Validation:
  the Technical Writer edits (Release notes section).

## Risks

1. **Hash state and `replaceState` drift from the rendered view** -
   Impact: M - Likelihood: M - Mitigation: one function (`writeList`)
   writes list routes, and every write calls `renderBacklogCard`
   explicitly; T36 to T40 run the real `page.js` in `vm`.
2. **The page sandbox grows into a fragile DOM fake** - Impact: M -
   Likelihood: M - Mitigation: the logic sits in pure exports with direct
   tests (T5 to T27); the `vm` tests assert only wiring (which hash, which
   region, which fetch). D12 lists the stubs, and no test inspects stub
   internals beyond `innerHTML`, `hidden`, `value`, and the call logs.
3. **The 390 px check gives a false pass** - Impact: M - Likelihood: M
   (it happened in 022 and 023 with the width proxy) - Mitigation: CDP
   device emulation in the manual check; T44 pins the rules.
4. **PR size: about 330 lines of render code and 950 lines of tests** -
   Impact: M (review time) - Likelihood: H - Mitigation: six checkpoint
   commits, each one concern, each GREEN; the reviewer can read them in
   order. The PM's fallback (move 030 items 2 and 4 out) saves about 15
   lines and 2 tests only; the slot helper fixes them as a side effect,
   so the plan keeps them.
5. **An export calls a non-exported helper and breaks only on the page**
   - Impact: H - Likelihood: L - Mitigation: T25 runs every export in a
   prelude-only context and fails when an export has no fixture.

## Logging

The board has no log file. Its observability is the snapshot, the page,
stderr, and the process exit.

- `/api/item` for the new kinds: a refusal is the 404 `not found`, with
  no stderr line, as in 023.
- The page: a failed body fetch shows `task body unavailable (<status>)`
  in the Now card or `body unavailable (<status>)` in the detail view. A
  refetch follows on the next render.
- A bad route renders the list and keeps the hash; the console stays
  clean.
- No user IDs exist in this local, single-user tool.

## Release notes for the Technical Writer

Add to `## [Unreleased]` in
`/Users/joaooliveira/study/constellation-harness/CHANGELOG.md`. Do not
bump `plugin.json` or `marketplace.json`; task 026 cuts 1.4.0.

Under `### Added`:

- **The backlog is a table with search and filters** (#024). Columns:
  ID, Title, Type, Status, Feature, Epic, Plan, Updated. The search
  matches the id, title, file, type, status, feature title, and epic
  title. Status chips show the count per status; done and dropped start
  off. Type chips and a Kind control (Tasks, Features, Epics) narrow the
  list. A count next to the Kind control reads `<shown> of <total>`. A banner counts the items that need attention and filters to
  them. The filters and the search live in the URL hash, so a reload
  keeps them. At phone width the Epic, Plan, and Updated columns hide.
- **Epic, feature, and task detail views** (#024). A click on a row, a
  Feature cell, or an Epic cell opens `#/item/<kind>/<file>` with a
  breadcrumb, the header, the rendered body, and the children: the tasks
  of a feature, or the features and tasks of an epic. A task view shows
  its plan with View plan and its `related:` tasks as links. Browser Back
  returns to the filtered table.
- **Links between work items open inside the board** (#024). A body link
  to a task, feature, epic, or plan that the tree holds opens its view or
  the plan dialog. Any other relative link stays without `href`.
- **Open task in the Now panel** (#024). It opens the detail view of the
  in-flight task, or is disabled with the reason.
- `GET /api/item` also serves the kinds `epic` and `feature` (#024).
- Snapshot nodes carry `created`, `edited`, and `related`; epic, feature,
  and plan nodes carry `mtime` (#024).

Under `### Changed`:

- The backlog tree is gone. Its facts move to the table: the in-flight
  `▶ <step>` marker, the warnings in the row title, and one line for
  plans without a task (#024).
- Every response carries `referrer-policy: no-referrer` (#030).
- The test count line: "The board test count grows from 138 to 238
  (#022, #023, #024)". Use the count that the final run prints.

Under `### Fixed`:

- **Board page robustness from the task 023 review** (#030). A failed
  body fetch retries on the next snapshot or reconnect. A new in-flight
  task shows `loading` in place of the old body. An older fetch reply
  never replaces a newer one. A test runs every render export in an
  isolated context.
- **One title rule and one chip-class picker** (#031). A parity test
  holds the title rule of the model and of the renderer together, and
  one `chipClass` helper picks every status chip class.

README line 214: "It also shows the backlog tree and the status
transitions" becomes "It also shows the backlog as a table with search,
filters, and epic, feature, and task detail views, and the status
transitions".

Spec `docs/specs/board-ui-v2.md`: §6.2, after the toolbar list, add "Task
024 ships without sortable headers, the `Plan` select, and the `/`
shortcut; task 032 holds them. The counts strip folds into the Status
chips." §4.4, under the route table: "`sort=` arrives with task 032."

## Feasibility Result

- **VERDICT**: AGREED
- **FEASIBILITY**:
  - Tasks table with the eight columns, slug titles, `—` cells, in-flight
    row, orphan line: `moderate`. Pure row builder over the existing
    tree; no model change beyond three fields.
  - Search, Status chips with counts, Type chips, Kind control, Reset:
    `moderate`. Pure filter functions; the only runtime care is the static
    search input (focus) and `replaceState` (history).
  - Hash state (`parseBacklogRoute`, `formatBacklogRoute`): `trivial`,
    with one constraint: no `URLSearchParams` in render exports (bare
    `vm` context).
  - Features and Epics tables: `trivial` once rows exist.
  - Attention banner and toggle: `trivial`. One rule (`tree.attention`)
    for the count and the filter.
  - Epic, feature, task detail views with breadcrumb: `moderate`. One
    render export, one fetch slot, `findItem` for parents.
  - `/api/item` epic and feature: `trivial`. Two map entries and two
    `treeHolds` branches.
  - Internal link rewrite: `moderate`. One pure resolver; the rule order
    in `link_open` changes; test 13 changes.
  - Open task: `trivial`.
  - Phone columns: `trivial` in CSS; the check needs CDP emulation.
  - 500-task performance: `trivial`. String building over 500 rows takes
    a few milliseconds.
  - Task 030 items: `trivial` each. Items 2, 3, and 4 fall out of the
    shared `syncBody` slot that the detail view needs anyway.
  - Task 031 items: `trivial`.
- **SIMPLIFICATIONS** (no criterion changes):
  - `renderBacklog` keeps its name with a new signature. Two 022 tests
    and the 1.3.4 export list stay green with no edit.
  - `renderTable(rows, kind, esc)` drops the spec's `route` argument;
    sort is fixed until 032.
  - Status and Type chips apply to the Tasks kind only. The Features and
    Epics tables list every item (criterion 14 says "every feature").
  - Updated shows the `last-edit` text as written; no date parsing.
  - No split of the PR. The PM's fallback (move 030 items 2 and 4 out)
    saves about 15 lines and 2 tests; it is not worth a second PR.
- **PRODUCT_SUGGESTIONS** (for the PM to triage, not in this plan):
  - A `Referenced by` chip list in the task view: the tasks whose
    `related:` names this task. The snapshot carries `related` after this
    change, so the cost is one filter and one test. Round 2: the PM
    parked it as task 033.
  - A row count next to the Kind control (`12 of 40`). One line in
    `renderToolbar`. Round 2: the PM took it in scope as criterion 43.
- **RISKS**: see the Risks section. The top item is the hash and history
  wiring (M/M), covered by the `vm` runtime tests.
- **OPEN_QUESTIONS**: none blocking. Three interpretation notes are
  recorded under criteria 14, 16/17, and 38.

## Open Questions

None blocking. Notes for the PM, recorded as decisions:

- Criterion 14: the Status and Type chips do not apply to the Features
  and Epics kinds. Feature and epic statuses (`active`, …) are not task
  statuses, and the criterion asks for every feature.
- Criteria 16 and 17: the banner and the Attention toggle both use
  `tree.attention`. A row with only unknown fields shows the dot but is
  not counted, as the 023 tree did. The toggle shows attention rows of
  every status.
- Criterion 38, "both BOM regexes": the literal in `renderMarkdown` and
  the literal in the `extractTitle` test fixture. `board-model.mjs`
  already uses the escape form.
