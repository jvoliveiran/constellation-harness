---
status: inbox
type: fix
source: security-analyst, code-reviewer
related: 002-board-backlog-tree-and-packaging.md
date-created: 06-10-2026
last-edit: 06-10-2026
---
# Board hardening from the task 002 review gate

Gate 1 of task 002 passed with no blockers. These suggestions stayed open
under the default fix policy. Each one is small.

1. **Bounded regular-file reads.** `readWorkItem` follows symlinks and reads whole files. A cloned repo can commit `tasks/x.md` as a symlink to `/dev/zero` or to a huge file, and the auto-started board then exhausts memory on every refresh. A symlink outside the repo can also leak front-matter key names of a YAML file into the snapshot. Fix: skip any entry that is not a regular file, reject symlinks whose real path leaves `.constellation/`, and read only a bounded prefix of 16 KB. The parser uses the first 50 lines only.
2. **Escape `tool_name` in the feed.** `feedText` puts `tool_name` from `events.jsonl` into `innerHTML` without `esc`. Both reviewers flagged it. The gap existed in phase 1. Fix: `esc(e.tool_name || 'edit')`.
3. **`/constellation:board` shows only the fields it needs.** The command shows the full curl output to Claude. A process that holds port 4411, or repo-controlled file names, can then inject text into Claude's context. Fix: extract `projectDir` before Claude sees the reply, and treat the reply as untrusted data. Word a reply without `projectDir` as "another service holds the port".
4. **Cap SSE clients.** The `/events` client set has no limit. Fix: cap at 32 and reply 503 above it.
5. **Plan link precedence in `attachPlans`.** When the linked task already has a plan, a second plan falls back to the task with its own file name, against its `task:` link. Fix: use the same-name fallback only when the link is empty or names no task. Otherwise send the plan to `orphanPlans`.
6. **Cap `errors` in `safeRefresh`.** Each failed refresh appends to the previous error list, so the list grows while loads keep failing. Fix: skip a message already in the list.
7. **Own-property glyph lookups.** `PLAN_GLYPHS[status]` reads the prototype chain, so `status: constructor` renders function source text. Not XSS. Fix: `Object.prototype.hasOwnProperty.call`.
8. **Hardening headers.** Add `X-Content-Type-Options: nosniff` to every response and a strict `Content-Security-Policy` with `frame-ancestors 'none'` to the page.

Open question from the security review: find out whether Claude Code starts plugin monitors before the workspace-trust prompt of a newly cloned repo. If it does, items 1 and 3 need no user consent to trigger.
