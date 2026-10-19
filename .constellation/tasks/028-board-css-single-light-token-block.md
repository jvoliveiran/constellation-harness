---
status: inbox
type: debt
source: dx-analyst
related: 022-board-ui-source-split-and-layout.md
date-created: 19-10-2026
last-edit: 19-10-2026
---
# Board CSS: one light token block, no repeated chip rules

**Evidence**: `plugins/constellation/scripts/board-ui/page.css` holds the 10 light values twice: in `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) }` and in `:root[data-theme="light"]`. `.chip.s-inbox`, `.chip.s-parked`, `.chip.s-other` and `.chip.p-draft` set `color: var(--muted)`, which the base `.chip` already sets. `.chip.s-refined` repeats `.chip.accent`.

**Simplification**: set `data-theme` at script start from the stored choice or `matchMedia`, then delete the `@media` block and the OS-light branch of `effectiveTheme()`. This can cause a first-paint flash. If the flash is not acceptable, keep both blocks. Delete the repeated chip rules in either case.

**Effort**: S — **Category**: duplication
