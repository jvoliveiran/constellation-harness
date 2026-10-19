---
status: inbox
type: debt
source: dx-analyst
related: 022-board-ui-source-split-and-layout.md
date-created: 19-10-2026
last-edit: 19-10-2026
---
# Board CSS tests pin behavior, not copied values

**Evidence**: the task 022 block of `plugins/constellation/scripts/board.test.mjs` repeats the CSS. `TOKENS` copies all 10 hex pairs of `page.css` and checks each pair in three blocks. `CHIP_TOKENS` copies the chip-to-token map. The bounded-card and 390 px tests grep rule text such as `max-height: calc(100vh - 96px)` and `repeat(auto-fill, minmax(88px, 1fr))`. Each token or layout change needs two edits, and the tests prove only that the two copies match.

**Simplification**: keep the two guards that catch real drift: no color literal outside the `:root` blocks, and no `style=` in `page.js` or the render output. Delete the `TOKENS`, `CHIP_TOKENS`, bounded-card and 390 px value tests, and the helpers that only they use (`ruleBodies`, `escapeRegExp`). Verify layout in the manual browser check.

**Effort**: S — **Category**: test-strategy
