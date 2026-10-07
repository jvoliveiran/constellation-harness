---
status: inbox
type: debt
source: dx-analyst
related: 010-board-monitor-starts-on-orchestrator-skill.md
date-created: 07-10-2026
last-edit: 07-10-2026
---
# Plugin dev install that does not expose feature branches to every session

**Evidence**: The `constellation` marketplace on this machine is a `directory` source that points at the repo working tree. Every Claude Code session on the machine runs the branch that is checked out here, including unreviewed feature branches. During task 002 and task 010, every new session loaded the feature branch. The README offers `/plugin marketplace add /path/to/constellation-harness` and does not name this risk.
**Simplification**: Add three README lines. Day-to-day sessions install from GitHub with `/plugin marketplace add jvoliveiran/constellation-harness`. Branch testing uses `claude --plugin-dir <clone>/plugins/constellation`, which scopes the branch to one session. Treat the `directory` marketplace as a dev setup only. Then switch this machine's marketplace to the GitHub source.
**Effort**: S — **Category**: local-setup
