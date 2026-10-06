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
