---
status: refined
type: feature
source: user
feature: F001-board-ui-overhaul.md
order: 1
date-created: 14-10-2026
last-edit: 14-10-2026
---
# Board UI: source split, design system, layout, bounded Agents panel

Phase 1 of `docs/specs/board-ui-v2.md` (§3, §4, §6.1). The page text moves
out of `board.mjs` into `board-ui/` files, the page gets a design system
with light and dark themes, and the Agents panel stops growing past the
viewport.

User feedback, 14-10-2026: "The right side bar with the agents execution
is extremely and unnecessarily long. Make it not that long and add a
vertical scroll on overflow." And: "Items must be better readable and UI
must match modern UI designs."

## Acceptance criteria

1. Given the board runs, when the user opens the page, then the HTML, CSS,
   and JS come from `board-ui/page.html`, `page.css`, and `page.js`, and
   the CSP header holds the hash of the served script and style text.
2. Given `board.mjs` after the split, then it exports the same functions
   as before from `board-model.mjs` and `board-render.mjs` through
   re-exports, and the 133 current tests pass with import path changes
   only.
3. Given 60 agent events in the log, when the page renders, then the
   Agents card is no taller than `calc(100vh - 96px)`, the card body
   scrolls, running agents stay pinned at the top, and the finished list
   shows 20 rows plus a `Show all (n)` button.
4. Given a viewport of 1280 px, then Now and Agents sit side by side and
   the Agents card is sticky. Given 390 px, then the cards stack, the
   Agents card is not sticky, and the page has no horizontal scroll.
5. Given the OS theme is light, then the page renders the light tokens.
   Given the user clicks the theme toggle, then the page switches and
   keeps the choice after a reload.
6. Given the design tokens of spec §4.1, then every color on the page
   comes from a token, and the status chips use the colors of §4.2.
7. Given the change, when the Lint Gate runs, then `scripts/selftest.sh`
   prints `selftest: ALL GREEN`.
