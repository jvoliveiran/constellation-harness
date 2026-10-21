---
status: inbox
type: fix
source: code-reviewer
related: 024-board-backlog-table-filters-and-detail-views.md
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board: attention banner and type filter match what the table can show

Raised at Gate 1 of task 024 on 21-10-2026. These items change criteria that the PM approved, so the PM decides them.

**Evidence and options**:
1. The Attention banner counts `tree.attention`, which holds plans ("plan without task"), features and epics. Show does not change the Kind, so the default Tasks table can show "No items match" under a banner that says "2 items need attention". Options: Show switches the Kind to one that holds attention items; the banner counts the current kind only; or the banner lists the files of kinds that the table cannot show.
2. Under a Type filter, a task with no type or a type outside the six chips (`chore`, `docs`) hides, and no chip brings it back except Reset. Options: let unknown types pass, or add an `other` type chip. The current repo has no untyped task, so this is latent.
3. While Attention is on, the Status chips still toggle but change no rows. Disable them or mark them.
4. Unknown-field-only rows show the danger dot, but the Attention toggle excludes them (criterion 16 overrides spec §6.2 on purpose). Align the dot or the spec.

**Effort**: S
