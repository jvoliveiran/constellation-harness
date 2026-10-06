---
status: inbox
type: feature
source: software-architect
related: 002-board-backlog-tree-and-packaging.md
date-created: 06-10-2026
last-edit: 06-10-2026
---
# Board parser CLI for the portfolio commands

Deferred from task 002. Extract the front-matter parser and the tree builder
from `board.mjs` into one module with a CLI that prints the tree as JSON.
Then let `/constellation:tasks`, `/constellation:backlog`,
`/constellation:plans`, and `/constellation:project` read that JSON instead
of parsing front-matter with a model call.

## Why

Each portfolio command costs one model call that derives the tree again.
One deterministic parser gives the page and the commands the same answer.

## DX additions from the task 002 review gate

- **One source for the status glyphs.** `board.mjs` holds `GLYPHS` and `PLAN_GLYPHS`, and `commands/backlog.md` holds the same mapping as prose. Define the glyphs once in the extracted module, add one test that every glyph appears in `backlog.md`, and replace the inline `|| '📝'` fallbacks with one `planGlyph(status)` helper. Effort S.
- **Move the page string out of `board.mjs`.** The file is about 980 lines and mixes parser, tree, differ, server, watcher, CLI, and an HTML page in a string. Move the page to `board.page.html`, read once at startup. No bundler, no template library. Effort M.
