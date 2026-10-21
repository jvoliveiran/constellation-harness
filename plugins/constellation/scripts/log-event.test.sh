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

lines() { wc -l < "$LOG" | tr -d ' '; }

# H1. SubagentStart keeps description, agent_transcript_path, transcript_path.
run '{"hook_event_name":"SubagentStart","session_id":"s1","agent_id":"a1","agent_type":"constellation:sdet","description":"Write tests","agent_transcript_path":"/t/agent-a1.jsonl","transcript_path":"/t/s1.jsonl"}'
[ "$(tail -1 "$LOG" | jq -c '[.description,.agent_transcript_path,.transcript_path]')" = '["Write tests","/t/agent-a1.jsonl","/t/s1.jsonl"]' ] && pass "H1 start fields logged" || fail "H1: $(tail -1 "$LOG")"

# H2. SubagentStop keeps agent_transcript_path and transcript_path.
run '{"hook_event_name":"SubagentStop","session_id":"s1","agent_id":"a1","agent_type":"constellation:sdet","agent_transcript_path":"/t/agent-a1.jsonl","transcript_path":"/t/s1.jsonl"}'
[ "$(tail -1 "$LOG" | jq -c '[.agent_transcript_path,.transcript_path]')" = '["/t/agent-a1.jsonl","/t/s1.jsonl"]' ] && pass "H2 stop fields logged" || fail "H2: $(tail -1 "$LOG")"

# H3. Each field absent -> no key.
run '{"hook_event_name":"SubagentStart","session_id":"s1","agent_id":"a1","agent_type":"x","agent_transcript_path":"/t/a.jsonl","transcript_path":"/t/s.jsonl"}'
[ "$(tail -1 "$LOG" | jq 'has("description")')" = "false" ] && pass "H3 no description key" || fail "H3 description: $(tail -1 "$LOG")"
run '{"hook_event_name":"SubagentStart","session_id":"s1","agent_id":"a1","agent_type":"x","description":"d","transcript_path":"/t/s.jsonl"}'
[ "$(tail -1 "$LOG" | jq 'has("agent_transcript_path")')" = "false" ] && pass "H3 no agent_transcript_path key" || fail "H3 agent path: $(tail -1 "$LOG")"
run '{"hook_event_name":"SubagentStart","session_id":"s1","agent_id":"a1","agent_type":"x","description":"d","agent_transcript_path":"/t/a.jsonl"}'
[ "$(tail -1 "$LOG" | jq 'has("transcript_path")')" = "false" ] && pass "H3 no transcript_path key" || fail "H3 main path: $(tail -1 "$LOG")"

# H4. PostToolUse and Stop keep transcript_path.
run "{\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Write\",\"transcript_path\":\"/t/s1.jsonl\",\"tool_input\":{\"file_path\":\"$TMP/.constellation/state/current-workflow.json\"}}"
[ "$(tail -1 "$LOG" | jq -r '.transcript_path')" = "/t/s1.jsonl" ] && pass "H4 PostToolUse transcript_path" || fail "H4 PostToolUse: $(tail -1 "$LOG")"
run '{"hook_event_name":"Stop","session_id":"s1","transcript_path":"/t/s1.jsonl"}'
[ "$(tail -1 "$LOG" | jq -r '.transcript_path')" = "/t/s1.jsonl" ] && pass "H4 Stop transcript_path" || fail "H4 Stop: $(tail -1 "$LOG")"

# H5. A non-string field or a field over its cap is omitted; hook prints nothing.
LONG=$(printf 'x%.0s' $(seq 1 1025))
BEFORE=$(lines)
OUT=$(run "{\"hook_event_name\":\"SubagentStart\",\"session_id\":\"s1\",\"agent_id\":\"a1\",\"agent_type\":\"x\",\"description\":{\"a\":1},\"agent_transcript_path\":\"/t/$LONG\",\"transcript_path\":\"/t/$LONG\"}" 2>&1)
RC=$?
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && pass "H5 exit 0 and silent" || fail "H5 rc=$RC out=$OUT"
[ "$(lines)" = "$((BEFORE + 1))" ] || fail "H5 line not appended"
[ "$(tail -1 "$LOG" | jq -c '[has("description"),has("agent_transcript_path"),has("transcript_path")]')" = "[false,false,false]" ] && pass "H5 bad fields omitted" || fail "H5: $(tail -1 "$LOG" | cut -c1-200)"

# H6. SubagentStop without agent_type (missing, null, empty) logs nothing; with agent_type logs one line.
BEFORE=$(lines)
for body in '{"hook_event_name":"SubagentStop","session_id":"s1","agent_id":"h1"}' \
            '{"hook_event_name":"SubagentStop","session_id":"s1","agent_id":"h1","agent_type":null}' \
            '{"hook_event_name":"SubagentStop","session_id":"s1","agent_id":"h1","agent_type":""}'; do
  OUT=$(run "$body" 2>&1); RC=$?
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] || fail "H6 rc=$RC out=$OUT"
done
[ "$(lines)" = "$BEFORE" ] && pass "H6 helper stops log nothing" || fail "H6 helper stop logged"
run '{"hook_event_name":"SubagentStop","session_id":"s1","agent_id":"h1","agent_type":"constellation:sdet"}'
[ "$(lines)" = "$((BEFORE + 1))" ] && pass "H6 stop with agent_type logged" || fail "H6 stop with agent_type not logged"

[ $FAIL -eq 0 ] && echo "log-event.sh: all green" || echo "log-event.sh: FAILURES"
exit $FAIL
