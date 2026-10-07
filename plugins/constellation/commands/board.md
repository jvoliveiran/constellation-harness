---
description: Print the URL of the live Constellation board for this project, or the command that starts it.
---

# /constellation:board

Read-only. This command never starts and never stops a process.

The plugin monitor starts the board the first time the orchestrator skill loads in a session. The skill loads through the Skill tool or through a slash command. Before that, the board does not run. Monitors run in interactive sessions only. Under `-p` or when the Monitor tool is off, the board does not start by itself.

1. Run `curl -s -m 1 http://127.0.0.1:4411/api/snapshot`.
2. Run `pwd -P`.
3. If the reply parses as JSON and `projectDir` equals the `pwd -P` value, print `Board running: http://127.0.0.1:4411` and stop.
4. If the reply parses and `projectDir` differs, print the directory that holds the port. Then print the manual command for this project on another port:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board.mjs" --port 4412`
5. If there is no reply, print `Board not running`. Then print one line: the board starts when the orchestrator skill loads. Then print the manual command:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board.mjs"`

Add one line: the automatic start needs an interactive session and a loaded orchestrator skill.
