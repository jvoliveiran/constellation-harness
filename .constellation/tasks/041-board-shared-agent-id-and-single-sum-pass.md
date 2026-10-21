---
status: inbox
type: debt
source: dx-analyst
related: 025-board-session-reader-tokens-and-agent-output.md
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board: one agent-id pattern, one description cap, one sum pass

**Evidence**:
- The pattern `/^[a-f0-9]{8,32}$/` is a separate constant or literal in `board-session.mjs` (`AGENT_ID`), `board-model.mjs` (`ATTRIBUTION_ID`), `board.mjs` (`AGENT_ID_PATTERN`) and `board-render.mjs` (`renderAgents`). The same shape is inside `AGENT_NAME`, `META_NAME` and the `parseRoute` agent regex. `DESCRIPTION_CAP = 200` is declared in `board-model.mjs` and in `board-session.mjs`.
- In `board-session.mjs`, `readMains` and `sync` sum usage in separate passes through `addSums`. `agentReply` runs `readFile` and the gate again for meta data that `readAgents` already read.

**Simplification**:
- Export `AGENT_ID` and `DESCRIPTION_CAP` from `board-session.mjs` and import them in `board-model.mjs` and `board.mjs`. The render functions cannot import, so add one test that checks their literals against `AGENT_ID.source`.
- Collect every read result into one list and call `sumUsage` once. Keep `{ description, model }` per id from `readAgents` and let `agentReply` read that map.

**Effort**: S — **Category**: duplication
