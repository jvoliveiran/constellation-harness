---
status: inbox
type: debt
source: dx-analyst
related: 024-board-backlog-table-filters-and-detail-views.md
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board: one list vocabulary, one title fallback, one parent walk

**Evidence**:
- `board-render.mjs` repeats the status group list (`inbox` … `dropped`) in `renderTable`, `renderToolbar`, `parseBacklogRoute`, `toggleBacklogRoute`, `backlogRows`, `sortRows` and `renderItemView`. The type list and the kind list are copied three times each. The tests hold four more copies, and `board-model.mjs` holds `TASK_STATUSES`. A new status needs about ten edits, and a missed edit fails silently.
- The title fallback `node.title || String(node.name).replace(/-/g, ' ')` is in `backlogRows` and in `renderItemView`. The task-to-feature-to-epic parent walk is in `backlogRows` and in `findItem`.

**Simplification**:
- Add one export, for example `listVocab()`, that returns `{ groups, types, kinds, defaultStatus }`. An export may call another export, so every function and the tests use it.
- Let `renderItemView` and `findItem` take the label and the parents from `backlogRows`.

**Effort**: S — **Category**: duplication
