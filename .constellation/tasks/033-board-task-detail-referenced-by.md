---
status: parked
type: feature
source: software-architect
feature: F001-board-ui-overhaul.md
related: 024-board-backlog-table-filters-and-detail-views.md
revisit: the user asks which tasks point to a task, or follows related chips backward by hand, at the 024 verification or in a later board session
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board task detail: "Referenced by" chips

Proposed by the Software Architect in the task 024 pairing, round 2, 21-10-2026.

**Value hypothesis**: a user on a task detail view sees which tasks name this task in their `related:` field, and opens them in one click.

**Parked because**: the 024 loop is find an item, open its feature or epic, see its children. The reverse `related:` link is not part of that loop, and no user feedback asks for it. The 024 snapshot carries `related`, so the cost stays low when the trigger fires.

**Scope when the trigger fires**: the task detail view shows a `Referenced by` chip list of every task whose `related:` names this task. Each chip opens `#/item/task/<file>`. No chips: the list does not render.

**Effort**: S
