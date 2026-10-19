---
status: in-progress
type: feature
source: user
feature: F001-board-ui-overhaul.md
order: 2
date-created: 14-10-2026
last-edit: 19-10-2026
---
# Board UI: markdown rendering, task description, plan dialog

Phase 2 of `docs/specs/board-ui-v2.md` (§5, §6.4, §7, §8.2). The Now
panel renders the body of the in-flight task from markdown, with a
vendored `markdown-it`, and a View plan button opens the plan in a dialog.

User feedback, 14-10-2026: "The left side area showing the task in
progress has a long blank area. Ideally, we should use this area to show
the task description, rendering from the markdown with the correct style
(using a library to properly render markdowns) and also the possibility to
link the plan, where users could click on it and see a modal with a full
plan description."

Depends on task 022 (merged, PR #41).

## Value loop

The user opens the board → reads what the workflow works on and why (the
task body) → opens the plan to see how → returns to the board on the next
step change, because the panel follows the in-flight task live.

## Scope — IN (product scope pass, 19-10-2026)

- Vendored `markdown-it` (`board-vendor/markdown-it.min.js`, `VERSION`,
  license file), served as a second inline script with its own CSP hash.
- `renderMarkdown(text, md)` in `board-render.mjs`: strip the front
  matter, drop the first H1, render with the §7 options and renderer rules.
- Snapshot nodes gain `title` (first `# ` line after the front matter).
  The Now header shows the task id and its title. Task 024 reuses `title`
  for its Title column.
- `GET /api/item` for the kinds `task` and `plan` (§8.2).
- Now panel: description region and the View plan button (§5).
- Plan dialog on the native `<dialog>` and the `#/plan/<file>` route.
  Every other hash renders the overview.
- `.md` prose styles (§7) and the Dialog component (§4.2).
- Task 029 folds in here (all four items, criteria 13 to 16). The
  orchestrator closes 029 with the commit of this task.

## Out of scope — assigned or parked

- **Open task button** and the `#/item/...` route — task 024. The detail
  view that it opens ships there (024 criterion 7).
- **Internal link rewrite** (`014-x.md` → `#/item/task/014-x.md`) — task
  024 (024 criterion 7). In 023, a relative link renders as text.
- **`/api/item` kinds `epic` and `feature`** — task 024, which needs them
  for its detail views.
- **Stepper restyle** (connector line, ring) — task 025. 025 makes done
  steps buttons, so the stepper changes there once.
- **Carry-over 1, `● live` item in the top bar** (§4.3) — task 026. The
  page already shows a `disconnected since` chip, so the user is not
  blind to a lost connection. 026 adds Pause and Resume, which need a
  live connection, so the positive live state belongs there.
- **Carry-over 2, running-row duration pulse in `--warn`** (§6.1) — task
  025. 025 changes the agent rows (description, finished row as a button).
- **Plan dialog live refresh while open** — parked inside this task.
  The dialog fetches the plan on each open, so `task.plan.mtime` is not
  needed. Revisit when the user reports a stale plan in an open dialog.

## Acceptance criteria

### Task description

1. Given a workflow in flight on task `018-…md`, when the page renders,
   then the Now header shows the task id and the title from the first H1.
2. Given a workflow in flight on task `018-…md`, when the page renders,
   then the Now panel shows the task body as rendered markdown, without
   the front matter and without the first H1.
3. Given a task body taller than half the viewport, when the page renders,
   then the description region stops at 50vh and scrolls inside itself.
4. Given the task file changes on disk, when 2 seconds pass, then the
   description shows the new text without a reload.

### Plan dialog

5. Given the state holds `plan` and the plan is in the tree, when the user
   clicks View plan, then a dialog opens with the plan rendered from
   markdown and the plan status chip, and the route is `#/plan/<file>`.
6. Given the plan dialog is open, when the user presses Esc, then the
   dialog closes and the previous route returns.
7. Given the user reloads the page on `#/plan/<file>`, when the snapshot
   arrives, then the plan dialog opens again.
8. Given the state holds no plan, or the plan is not in the tree, when the
   page renders, then View plan is disabled and its title says why.

### Route `/api/item`

9. Given `GET /api/item?kind=task&file=../x.md`, a name not in the tree,
   a kind other than `task` or `plan`, or a symlink whose target leaves
   `.constellation/` or is not a regular file, then the response is 404.
   Given a symlink to a regular file inside `.constellation/`, then the
   route reads it, as the tree scan does.
10. Given a task file of 600 KB, when the page requests it, then the
    response carries the first 512 KB and `truncated: true`, and the page
    ends the body with the muted line `truncated at 512 KB`.

### Markdown safety and vendor file

11. Given a task body with raw HTML, a `javascript:` link, a relative
    link, and a remote image, when the page renders it, then the HTML
    shows as text, the `javascript:` link and the relative link have no
    `href`, the image shows as a link with its alt text, and every `http(s)`
    link has `rel="noopener noreferrer"` and `target="_blank"`.
12. Given `board-vendor/VERSION`, then it records the markdown-it version,
    the source URL, the license, and the sha256 of `markdown-it.min.js`.
    Given a change of one byte in the vendor file, then
    `scripts/selftest.sh` fails.
13. Given the vendor file is missing at start, when the board starts, then
    it logs one line, the server serves the page, and the page shows
    bodies in `<pre>` as text.

### Task 029 items (folded in)

14. Given the served page, then a test asserts that `page.js` and each
    `board-render.mjs` export source hold no `</script` and no `<!--`,
    that the vendor file holds no `</script` and no `<script`
    (case-insensitive), and that `page.css` holds no `</style`. The vendor
    file keeps one `<!--` in a regex literal. Without a `<script` after
    it, the HTML parser does not leave the script element.
15. Given the Show all button holds a child element, when the user clicks
    the child, then the Agents card shows all rows
    (`closest('[data-action="show-all"]')`).
16. Given a backlog node with the status `done in-progress`, when the
    backlog renders, then its chip carries the class `s-other` only. The
    status maps through a fixed allow-list, as `glyph()` does.
17. Given an `events.jsonl` agent line with a non-string `agent_type`, when
    the Agents card renders, then the card shows the row and the other
    rows, and no error stops the render.

### Gate

18. Given the change, then the CSP header lists exactly two script hashes
    and one style hash, and the test that pins one script hash changes to
    two.
19. Given the change, then `renderMarkdown` (stub library: front matter
    strip, H1 drop, options passed) and the title extraction have unit
    tests, `/api/item` has HTTP tests for criteria 9 and 10, the suite
    holds more than the 160 tests of task 022 with no test deleted, and
    `scripts/selftest.sh` prints `selftest: ALL GREEN`.

## Success metric and decision rule

- **Primary metric**: in the verification step of tasks 024, 025, and 026,
  the board shows the in-flight task description and opens its plan.
  Target: 3 of 3 runs, with no user report of a blank Now panel.
- **Instrumentation**: none new. The verifier records the result in each
  task's verification notes.
- **Decision rule**: 3 of 3 → F001 continues with no change to this
  surface. A miss, or a user report of a blank or unreadable panel → open
  a fix task before the next F001 phase.
