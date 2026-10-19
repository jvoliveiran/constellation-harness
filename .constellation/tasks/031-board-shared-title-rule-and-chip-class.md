---
status: inbox
type: debt
source: dx-analyst
related: 023-board-markdown-task-description-and-plan-dialog.md
date-created: 19-10-2026
last-edit: 19-10-2026
---
# Board: one front-matter and title rule, one chip-class picker

**Evidence**:
- `extractTitle` in `board-model.mjs` and `renderMarkdown` in `board-render.mjs` each repeat the BOM strip, the front-matter regex and the first `# ` rule. A comment says they drop the same line, but nothing enforces it. Task 024 adds epic and feature titles, so the copies can drift.
- `renderBacklog` (`STATUS_CLASSES`, `s-<status>`) and `renderPlanDialog` (`['draft','approved']`, `p-<status>`) repeat the same allow-list and `other` fallback.

**Simplification**:
- Add one parity test that runs a fixture set (BOM, CRLF, no front matter, `# ` inside a code fence) through both title rules. The render functions must stay free of imports, so a shared helper is not possible there.
- Add one top-level `chipClass(prefix, allowed, value)` in `board-render.mjs` and call it from both places.

**Effort**: S — **Category**: duplication
