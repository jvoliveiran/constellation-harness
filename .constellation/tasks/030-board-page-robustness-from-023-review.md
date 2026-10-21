---
status: inbox
type: fix
source: code-reviewer, security-analyst
related: 023-board-markdown-task-description-and-plan-dialog.md
date-created: 19-10-2026
last-edit: 19-10-2026
---
# Board page: robustness items from the task 023 review

Raised at Gate 1 of task 023 on 19-10-2026. No item blocked the merge. Task 024 touches the same code, so fold this in there when it fits.

**Evidence and fix**:
1. Code reviewer: the isolation test compiles each `board-render.mjs` export alone but runs only three of them. An export that calls a non-exported helper passes and breaks only on the page. Run `renderNow`, `renderNowActions`, `renderPlanDialog` and `renderItemBody` in a `vm` context that holds only the prelude. Reword the header comment of `board-render.mjs`: an export may call another export, and nothing else.
2. Code reviewer: `syncTaskBody` in `page.js` keeps the file and mtime after a failed fetch. The panel then shows `task body unavailable` until the file changes, also after an SSE reconnect. Reset `taskBody.mtime` on `item.error`, or reset `taskBody` in `es.onopen`.
3. Code reviewer: no test makes an older fetch reply arrive after a newer one. Add one deferred-reply test each for `taskSeq` and `dialogSeq`.
4. Code reviewer: when `state.task` changes, `#desc` shows the old body until the new reply arrives. Clear it or show a muted `loading` line.
5. Security analyst: add `referrer-policy: no-referrer` to the page response, as defense in depth for links.
6. Nits: use the escape form of the BOM in both regexes; add a test for the `[data-action="close-dialog"]` click; record in `onDialogClose` why it replaces the hash when the plan leaves the tree.

**Effort**: S
