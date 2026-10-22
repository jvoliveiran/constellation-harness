---
status: inbox
type: fix
source: code-reviewer, security-analyst
related: 025-board-session-reader-tokens-and-agent-output.md
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board session reader: test gaps and hardening from the task 025 review

Raised at Gate 1 of task 025 on 21-10-2026. No item blocked the merge.

1. Code reviewer: no test covers a replaced or truncated transcript (`readAppended`, inode or size change). Assert that the sum resets and that `bytesRead` grows by the new size only.
2. Code reviewer: no test covers a partial line over the cap (`consume` drops it and calls `cutPending`). With a 1 KB cap, append more than 1 KB without a newline, then a valid line, and assert that only the valid line counts.
3. Code reviewer: the test `page: a done step opens #/step/<id>` accepts nearly any dialog. Assert the exact header text of `renderStepDialog`.
4. Code reviewer: `readMeta` caches only a successful parse, so a meta file that is too large or not valid JSON is read again on every 5 s poll. Cache a null result per `agent_id`.
5. Security analyst: `safeRefresh` puts `e.message` into the snapshot `errors`. If the session reader ever throws past its own try blocks, an fs message with a path reaches the page. Map exceptions from `session.sync` to a fixed `transcript: unreadable: error`.

**Effort**: S
