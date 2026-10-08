---
status: done
commit: 1b9d53b4725584b58a863ada83cf4e1d89a1172e
type: fix
source: security-analyst, code-reviewer
related: 002-board-backlog-tree-and-packaging.md
date-created: 06-10-2026
last-edit: 08-10-2026
---
# Board hardening from the task 002 review gate

Gate 1 of task 002 passed with no blockers. These suggestions stayed open
under the default fix policy. Each one is small.

1. **Bounded regular-file reads.** Moved to task 013 on 07-10-2026.
2. **Escape `tool_name` in the feed.** Moved to task 013 on 07-10-2026.
3. **`/constellation:board` shows only the fields it needs.** Moved to task 013 on 07-10-2026.
4. **Cap SSE clients.** The `/events` client set has no limit. Fix: cap at 32 and reply 503 above it.
5. **Plan link precedence in `attachPlans`.** When the linked task already has a plan, a second plan falls back to the task with its own file name, against its `task:` link. Fix: use the same-name fallback only when the link is empty or names no task. Otherwise send the plan to `orphanPlans` with the warning `duplicate plan for task: <file>`, not `plan without task`, so the message names the real problem. The architect confirmed at verification that this does not break plan 002, because two plans for one task is already invalid under the artifact model.
6. **Cap `errors` in `safeRefresh`.** Each failed refresh appends to the previous error list, so the list grows while loads keep failing. Fix: skip a message already in the list.
7. **Own-property glyph lookups.** `PLAN_GLYPHS[status]` reads the prototype chain, so `status: constructor` renders function source text. Not XSS. Fix: `Object.prototype.hasOwnProperty.call`.
8. **Hardening headers.** Add `X-Content-Type-Options: nosniff` to every response and a strict `Content-Security-Policy` with `frame-ancestors 'none'` to the page.
9. **Stale header comment.** The file header of `board.mjs` still says "phase 1", and its usage line omits `--quiet`.
10. **Bounded reads for `config.json` and `tracks.json`.** `readJson` reads both committed files with `readFileSync`. A cloned repo can make either one a symlink to `/dev/zero`, and the board then hangs at start. Fix: read both through the `readPrefix` helper of task 013, with a 1 MB cap. Raised by the architect while planning task 013 on 07-10-2026.

Moved to task 017 on 08-10-2026. Open question from the security review: find out whether Claude Code starts plugin monitors before the workspace-trust prompt of a newly cloned repo. If it does, items 1 and 3 need no user consent to trigger.
