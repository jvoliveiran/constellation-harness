---
status: inbox
type: fix
source: code-reviewer, security-analyst
related: 024-board-backlog-table-filters-and-detail-views.md
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board: list polish from the task 024 review

Raised at Gate 1 of task 024 on 21-10-2026. No item blocked the merge.

1. Cached bodies keep the link rewrite of reply time until the file changes. Add a comment, or re-render links on a tree change.
2. `div.tbl-wrap` has no CSS rule. Remove it or give it `overflow-x: auto`.
3. Give the `toggleBacklogRoute` asserts their own test name.
4. The isolation test runs `renderMarkdown` with a stub factory, so `link_open` never runs in the vm. Pass the vendored library there.
5. Add a cheap Back test: set the hash back to the filtered list and check the rows and `#q`.
6. Make the 500-task timing test best of 3, so a loaded CI runner cannot flake it.
7. Security analyst: the `open-task` and `view-plan` click handlers write the hash without a local `parseRoute` check. This is not exploitable, but `onBacklogClick` checks, so align the pattern.

**Effort**: S
