#!/usr/bin/env bash
# Constellation Harness — hook event logger (board phase 1).
# Appends one JSON line per hook event to .constellation/metrics/events.jsonl, stamped
# with the system clock. The board (scripts/board.mjs) tails this file to show which
# specialist runs right now and when state/task files change.
#
# Registered in hooks/hooks.json on SubagentStart, SubagentStop, Stop, and PostToolUse
# (Write|Edit). PostToolUse lines are kept only for paths under .constellation/.
#
# Silent no-op outside initialized projects or without jq. Exit 0 always — this hook
# never blocks and never prints to stdout.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CONFIG="$PROJECT_DIR/.constellation/config.json"
[ -f "$CONFIG" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat 2>/dev/null) || exit 0
[ -n "$INPUT" ] || exit 0

EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null)
[ -n "$EVENT" ] || exit 0

FILE=""
if [ "$EVENT" = "PostToolUse" ]; then
  FP=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
  [ -n "$FP" ] || exit 0
  case "$FP" in
    "$PROJECT_DIR"/.constellation/*) FILE="${FP#"$PROJECT_DIR"/}" ;;
    .constellation/*)                FILE="$FP" ;;
    *) exit 0 ;;
  esac
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOG_DIR="$PROJECT_DIR/.constellation/metrics"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0

printf '%s' "$INPUT" | jq -c --arg ts "$TS" --arg file "$FILE" '{
  ts: $ts,
  event: .hook_event_name,
  session_id: (.session_id // null),
  agent_id: (.agent_id // null),
  agent_type: (.agent_type // null),
  tool_name: (.tool_name // null),
  file: (if $file == "" then null else $file end)
} | with_entries(select(.value != null))' >> "$LOG_DIR/events.jsonl" 2>/dev/null

exit 0
