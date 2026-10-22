#!/usr/bin/env bash
# Constellation Harness — PreToolUse hook for the board Pause (task 026, spec §9).
# While the board pause is in force, this hook holds every tool call of the session and
# its subagents. Resume (the board deletes state/control.json) releases the call. When
# the hold window ends, the hook denies the call, and the model must stop.
#
# A pause is in force only while the board process that wrote the file still runs
# (the owner gate). A stale or committed control file does nothing: exit 0 at once.
#
# No stdout except the deny JSON. Exit 0 always. No `set -e`: any error means "allow".
# Hold window: CONSTELLATION_HOLD_SECONDS, an integer from 1 to 590 (default 540). The
# cap keeps the deadline 10 s under the 600 s hook timeout, where Claude Code runs the tool.

HOLD_DEFAULT=540
HOLD_MAX=590
CONTROL_MAX_BYTES=1024
START_TOLERANCE=2   # seconds: etime has a 1 s resolution

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
C="$PROJECT_DIR/.constellation"
CONTROL="$C/state/control.json"

# Fast path: three file tests, before any jq, cat, or ps (criterion 9).
[ -f "$C/config.json" ] || exit 0
[ -f "$C/state/current-workflow.json" ] || exit 0
[ -f "$CONTROL" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# Owner gate. Prints the board pid and returns 0 only when the pause is in force: a regular
# file of at most 1 KB, paused true, by board, an integer pid of a live process whose command
# line holds board.mjs, a since that is not in the future, and a process that started at or
# before since. The start rule binds the pause to the board that wrote it: a committed file
# predates any board that started after the clone. etime is [[dd-]hh:]mm:ss on macOS and Linux.
etime_seconds() {
  local t="$1" days=0 a b c
  case "$t" in *-*) days=${t%%-*}; t=${t#*-} ;; esac
  IFS=: read -r a b c <<< "$t"
  if [ -n "$c" ]; then echo $((10#$days * 86400 + 10#$a * 3600 + 10#$b * 60 + 10#$c))
  else echo $((10#$days * 86400 + 10#$a * 60 + 10#$b)); fi
}

board_owner_pid() {
  local fields pid since_epoch etime command now started
  [ -f "$CONTROL" ] && [ ! -L "$CONTROL" ] || return 1
  [ "$(wc -c < "$CONTROL" 2>/dev/null | tr -d ' ')" -le "$CONTROL_MAX_BYTES" ] 2>/dev/null || return 1
  fields=$(jq -r 'select(.paused == true and .by == "board") | [(.pid | select(type == "number" and . > 1 and . == floor)), (.since | fromdateiso8601)] | @tsv' "$CONTROL" 2>/dev/null)
  pid=${fields%%$'\t'*}
  since_epoch=${fields##*$'\t'}
  case "$pid$since_epoch" in ''|*[!0-9]*) return 1 ;; esac
  kill -0 "$pid" 2>/dev/null || return 1
  read -r etime command <<< "$(ps -p "$pid" -o etime=,command= 2>/dev/null)"
  case "$command" in *board.mjs*) ;; *) return 1 ;; esac
  [[ "$etime" =~ ^([0-9]+-)?([0-9]+:)?[0-9]+:[0-9]+$ ]] || return 1
  now=$(date +%s)
  started=$((now - $(etime_seconds "$etime")))
  [ "$since_epoch" -le $((now + START_TOLERANCE)) ] && [ "$started" -le $((since_epoch + START_TOLERANCE)) ] || return 1
  printf '%s' "$pid"
}

board_owner_pid > /dev/null || exit 0

INPUT=$(cat 2>/dev/null)
IDS=$(printf '%s' "$INPUT" | jq -c 'def s: if type == "string" then . else null end;
  { session_id: (.session_id | s), agent_id: (.agent_id | s), agent_type: (.agent_type | s), tool_name: (.tool_name | s) }' 2>/dev/null)
[ -n "$IDS" ] || IDS='{}'

HOLD="${CONSTELLATION_HOLD_SECONDS:-}"
case "$HOLD" in
  ''|*[!0-9]*) HOLD=$HOLD_DEFAULT ;;
  *) { [ "$HOLD" -ge 1 ] && [ "$HOLD" -le "$HOLD_MAX" ]; } 2>/dev/null || HOLD=$HOLD_DEFAULT ;;
esac

NOW=$(date +%s)
SINCE_RAW=$(jq -r '.since | if type == "string" then .[0:40] else "unknown" end' "$CONTROL" 2>/dev/null)
# The reason reaches the model: only an exact UTC timestamp enters it.
[[ "$SINCE_RAW" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || SINCE_RAW=unknown
SINCE_EPOCH=$(jq -r '.since | fromdateiso8601' "$CONTROL" 2>/dev/null)
# One deadline per pause. A since in the future or unparsable counts as now, so a
# crafted since cannot extend a hold.
START=$NOW
case "$SINCE_EPOCH" in
  ''|*[!0-9]*) ;;
  *) [ "$SINCE_EPOCH" -gt 0 ] && [ "$SINCE_EPOCH" -le "$NOW" ] && START=$SINCE_EPOCH ;;
esac
DEADLINE=$((START + HOLD))

# log_event <event> [heldSec] [reason]: one jq call, one line, field order of log-event.sh.
log_event() {
  mkdir -p "$C/metrics" 2>/dev/null || return 0
  jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg event "$1" --argjson ids "$IDS" \
    --arg held "${2:-}" --arg reason "${3:-}" '
    ({ ts: $ts, event: $event } + $ids
     + { heldSec: (if $held == "" then null else ($held | tonumber) end),
         reason: (if $reason == "" then null else $reason end) })
    | with_entries(select(.value != null))' >> "$C/metrics/events.jsonl" 2>/dev/null
  return 0
}

deny() { # deny <heldSec>
  log_event PauseDenied "$1"
  jq -nc --arg since "$SINCE_RAW" '{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: ("Constellation board paused this workflow at " + $since + ". Do not run more tools. If you are a subagent, put this sentence in your final report and end your run. Report the last save point to the user and end the turn. The user clicks Resume on the board, then types /constellation:resume.") } }'
  exit 0
}

[ "$NOW" -lt "$DEADLINE" ] || deny 0

log_event PauseHold
T0=$NOW
while true; do
  sleep 1
  HELD=$(($(date +%s) - T0))
  if [ ! -f "$CONTROL" ]; then
    log_event PauseReleased "$HELD" resume
    exit 0
  fi
  if ! board_owner_pid > /dev/null; then
    log_event PauseReleased "$HELD" board-stopped
    exit 0
  fi
  [ "$(date +%s)" -lt "$DEADLINE" ] || deny "$HELD"
done
