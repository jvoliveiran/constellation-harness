#!/usr/bin/env bash
# Tests for log-event.sh. Run from anywhere: plugins/constellation/scripts/log-event.test.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HERE/log-event.sh"
FAIL=0
fail() { printf 'FAIL: %s\n' "$*"; FAIL=1; }
pass() { printf 'ok: %s\n' "$*"; }

command -v jq >/dev/null 2>&1 || { echo "SKIP: jq not installed"; exit 0; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
LOG="$TMP/.constellation/metrics/events.jsonl"
TS_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'

run() { printf '%s' "$1" | CLAUDE_PROJECT_DIR="$TMP" "$HOOK"; }

# 1. Not initialized → silent, no file.
run '{"hook_event_name":"SubagentStart","session_id":"s1","agent_id":"a1","agent_type":"x"}'
[ $? -eq 0 ] || fail "exit code without config.json"
[ ! -e "$LOG" ] && pass "no log without config.json" || fail "log created without config.json"

mkdir -p "$TMP/.constellation" && echo '{}' > "$TMP/.constellation/config.json"

# 2. SubagentStart → one line, real timestamp, fields kept, nulls dropped.
OUT=$(run '{"hook_event_name":"SubagentStart","session_id":"s1","agent_id":"a1","agent_type":"constellation:sdet","cwd":"/x"}' 2>&1)
[ -z "$OUT" ] && pass "hook prints nothing" || fail "hook printed: $OUT"
[ "$(wc -l < "$LOG" | tr -d ' ')" = "1" ] && pass "one line appended" || fail "line count after SubagentStart"
TS=$(jq -r '.ts' "$LOG")
[[ "$TS" =~ $TS_RE ]] && pass "timestamp from the clock" || fail "bad ts: $TS"
[ "$(jq -r '.event' "$LOG")" = "SubagentStart" ] || fail "event field"
[ "$(jq -r '.agent_type' "$LOG")" = "constellation:sdet" ] || fail "agent_type field"
[ "$(jq -r 'has("file")' "$LOG")" = "false" ] && pass "null fields dropped" || fail "file key present on SubagentStart"

# 3. PostToolUse outside .constellation/ → ignored.
run "{\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$TMP/src/app.ts\"}}"
[ "$(wc -l < "$LOG" | tr -d ' ')" = "1" ] && pass "source edits ignored" || fail "source edit was logged"

# 4. PostToolUse under .constellation/ → logged with a project-relative path.
run "{\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/.constellation/state/current-workflow.json\"}}"
[ "$(wc -l < "$LOG" | tr -d ' ')" = "2" ] || fail "state write not logged"
[ "$(tail -1 "$LOG" | jq -r '.file')" = ".constellation/state/current-workflow.json" ] && pass "relative path recorded" || fail "file path: $(tail -1 "$LOG")"

# 5. Garbage stdin → exit 0, nothing appended.
printf 'not json' | CLAUDE_PROJECT_DIR="$TMP" "$HOOK"
[ $? -eq 0 ] || fail "exit code on garbage stdin"
[ "$(wc -l < "$LOG" | tr -d ' ')" = "2" ] && pass "garbage ignored" || fail "garbage appended a line"

[ $FAIL -eq 0 ] && echo "log-event.sh: all green" || echo "log-event.sh: FAILURES"
exit $FAIL
