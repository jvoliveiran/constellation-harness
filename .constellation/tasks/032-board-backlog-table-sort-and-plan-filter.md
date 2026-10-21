---
status: parked
type: feature
source: product-manager
feature: F001-board-ui-overhaul.md
related: 024-board-backlog-table-filters-and-detail-views.md
revisit: the user names column sort, a plan filter, or a search shortcut as a gap at the 024 verification or in a later board session
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board backlog table: column sort, Plan filter, search shortcut

Parked by the task 024 scope pass on 21-10-2026. Spec `docs/specs/board-ui-v2.md` §6.2 and §4.4 list these controls.

**Value hypothesis**: a user with a large backlog sorts by Updated to see recent work, filters out tasks that already have a plan, and reaches the search without the mouse.

**Parked because**: the user feedback of 14-10-2026 asks for a table, search, filters, and Feature and Epic columns. A fixed default sort (status group, then id descending), the Status and Type chips, and the search cover that loop. These three controls add hash keys, header state, and tests without a reported need.

**Scope when the trigger fires**:
- Sortable headers: a click sorts by that column, a second click reverses, a direction glyph shows the state. The `sort=<col>:<dir>` hash key keeps it across reloads.
- `Plan` select (tasks only): any, has plan, no plan.
- `/` focuses the search input when the focus is not in a text field.

**Effort**: S
