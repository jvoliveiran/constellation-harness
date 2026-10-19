---
status: refined
type: feature
source: user
feature: F001-board-ui-overhaul.md
order: 2
date-created: 14-10-2026
last-edit: 14-10-2026
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

Depends on task 022.

## Acceptance criteria

1. Given a workflow in flight on task `018-…md`, when the page renders,
   then the Now panel shows the task body as rendered markdown, without
   the front matter and without the first H1, in a region that scrolls
   past 50vh.
2. Given the task file changes on disk, then the description updates
   within 2 seconds without a reload.
3. Given the state holds `plan`, when the user clicks View plan, then a
   dialog opens with the plan rendered from markdown, the plan status
   chip, and the route changes to `#/plan/<file>`. Esc closes it and
   restores the previous route.
4. Given the state holds no plan, then View plan is disabled and its
   title says why.
5. Given `GET /api/item?kind=task&file=../x.md`, or a name not in the
   tree, then the response is 404. Given a task file of 600 KB, then the
   response carries the first 512 KB and `truncated: true`, and the page
   ends the body with `truncated at 512 KB`.
6. Given a task body with raw HTML, a `javascript:` link, and a remote
   image, then the HTML renders as text, the link has no `href`, and the
   image renders as a link with its alt text.
7. Given `board-vendor/VERSION`, then it records the markdown-it version,
   the source URL, and the sha256 of `markdown-it.min.js`, and
   `scripts/selftest.sh` fails when the file and the recorded sha differ.
8. Given the vendor file is missing at start, then the board logs one line
   and the page shows bodies in `<pre>`.
9. Given the change, then the CSP header lists two script hashes and one
   style hash, and `scripts/selftest.sh` prints `selftest: ALL GREEN`.
