---
status: inbox
type: fix
source: code-reviewer, security-analyst
related: 022-board-ui-source-split-and-layout.md
date-created: 19-10-2026
last-edit: 19-10-2026
---
# Board page: markup guards from the task 022 review

Raised at Gate 1 of task 022 on 19-10-2026. No item blocked the merge. Task 023 touches the same code, so fold this in there when it fits.

**Evidence and fix**:
1. Code reviewer: test 5 counts `<script>` tags only. It does not prove that `page.js`, the `board-render.mjs` export sources and `page.css` hold no `</script>`, `<!--` or `</style>`. Add three direct asserts.
2. Code reviewer: the Show all click handler in `page.js` reads `ev.target` only. A child element in the button (an icon) breaks it. Use `ev.target.closest('[data-action="show-all"]')`.
3. Security analyst: `renderBacklog` writes the escaped status into a class name (`chip s-<status>`). A status with spaces adds other existing classes. The effect is cosmetic only. Map the status through a fixed allow-list, as `glyph()` does.
4. Security analyst: `renderAgents` calls `.replace` on `agent_type`. A non-string value from `events.jsonl` throws and stops the Agents card for that snapshot. This existed before 022. Use `String(a.agent_type || 'agent')`.

**Effort**: S
