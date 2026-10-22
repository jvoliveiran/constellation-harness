#!/usr/bin/env bash
# Constellation Harness — statusline renderer (Workflow Progress HUD).
# Reads the Claude Code statusline JSON on stdin and renders a one-line HUD from
# .constellation/state/current-workflow.json + .constellation/tracks.json:
#
#   🌌 planned │ ✓✓✓✓✓ ▶🔍 Review Gate 6/10 │ ⏸ paused │ 🔁 1/3 │ feat/011-audit-log │ ⏱ 12m
#
# The ⏸ paused item shows while a board Pause is in force (see board_pause_in_force).
#
# Prints nothing (exit 0) whenever anything is missing or malformed — a statusline
# must never break a session. Wire via .claude/settings.json:
#   { "statusLine": { "type": "command", "command": ".constellation/scripts/statusline.sh" } }
#
# Testing: --state <file> overrides the state-file path (tracks/config still resolve
# from the workspace dir on stdin).

set -u
command -v jq >/dev/null 2>&1 || exit 0

STATE_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --state) STATE_OVERRIDE="${2:-}"; shift 2 || break ;;
    *) shift ;;
  esac
done

INPUT="$(cat 2>/dev/null || true)"
DIR="$(printf '%s' "$INPUT" | jq -r '.workspace.current_dir // .cwd // empty' 2>/dev/null)"
[ -n "$DIR" ] || DIR="$(pwd)"

STATE="${STATE_OVERRIDE:-$DIR/.constellation/state/current-workflow.json}"
TRACKS="$DIR/.constellation/tracks.json"
CONFIG="$DIR/.constellation/config.json"
[ -f "$STATE" ] && [ -f "$TRACKS" ] || exit 0

# A board pause is in force only while the board that wrote state/control.json runs: a regular
# file, at most 1 KB, paused true, by board, the integer pid of a live board.mjs process, a since
# that is not in the future, and a process that started at or before since. The hook
# scripts/pause-guard.sh applies the same gate. Keep the two copies and ownsPause in
# scripts/board.mjs in sync. etime is [[dd-]hh:]mm:ss on macOS and Linux.
CONTROL="$DIR/.constellation/state/control.json"
START_TOLERANCE=2
etime_seconds() {
  local t="$1" days=0 a b c
  case "$t" in *-*) days=${t%%-*}; t=${t#*-} ;; esac
  IFS=: read -r a b c <<< "$t"
  if [ -n "$c" ]; then echo $((10#$days * 86400 + 10#$a * 3600 + 10#$b * 60 + 10#$c))
  else echo $((10#$days * 86400 + 10#$a * 60 + 10#$b)); fi
}
board_pause_in_force() {
  local fields pid since_epoch etime command now started
  [ -f "$CONTROL" ] && [ ! -L "$CONTROL" ] || return 1
  [ "$(wc -c < "$CONTROL" 2>/dev/null | tr -d ' ')" -le 1024 ] 2>/dev/null || return 1
  fields=$(jq -r 'select(.paused == true and .by == "board") | .pid as $p | (.since | select(type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\\z")) | fromdateiso8601) as $s | select($p | type == "number" and . > 1 and . == floor) | [$p, $s] | @tsv' "$CONTROL" 2>/dev/null)
  pid=${fields%%$'\t'*}
  since_epoch=${fields##*$'\t'}
  case "$pid$since_epoch" in ''|*[!0-9]*) return 1 ;; esac
  kill -0 "$pid" 2>/dev/null || return 1
  read -r etime command <<< "$(ps -p "$pid" -o etime= -o command= 2>/dev/null)"
  case "$command" in *board.mjs*) ;; *) return 1 ;; esac
  [[ "$etime" =~ ^([0-9]+-)?([0-9]+:)?[0-9]+:[0-9]+$ ]] || return 1
  now=$(date +%s)
  started=$((now - $(etime_seconds "$etime")))
  [ "$since_epoch" -le $((now + START_TOLERANCE)) ] && [ "$started" -le $((since_epoch + START_TOLERANCE)) ]
}
PAUSED=false
board_pause_in_force && PAUSED=true

CFG_JSON='{}'
if [ -f "$CONFIG" ]; then
  CFG_JSON="$(jq -c . "$CONFIG" 2>/dev/null)" || CFG_JSON='{}'
fi

OUT="$(jq -rn \
  --slurpfile st "$STATE" \
  --slurpfile tr "$TRACKS" \
  --argjson cfg "$CFG_JSON" \
  --argjson paused "$PAUSED" \
  --argjson now "$(date +%s)" '
  ($st[0]) as $s | ($tr[0]) as $t
  | ($s.track // "?") as $track
  | ($s.currentStep // "") as $cur
  | ($cfg.crossModelValidation // {}) as $cmv
  | (($cmv.enabled == true) and ((($cmv.steps // []) | index("plan-review")) != null)) as $planReviewOn
  | (($t.tracks[$track] // [])
     | map(select((.optionalIf == null) or (.optionalIf == "plan-review" and $planReviewOn)))) as $base
  # post-pr is an extra step rendered after devops-pr, only while current
  | (if $cur == "post-pr" and ($t.extraSteps["post-pr"] != null)
     then (($base | map(.id) | index("devops-pr")) // (($base | length) - 1)) as $i
        | $base[:$i+1] + [($t.extraSteps["post-pr"] + {id: "post-pr"})] + $base[$i+1:]
     else $base end) as $steps
  | ($steps | map(.id)) as $ids
  | ($steps | length) as $N
  | ((($s.completedSteps // []) | map(. as $c | (($ids | index($c)) // -1)) | max) // -1) as $doneMax
  | (($ids | index($cur)) // -1) as $curIdx
  | ([$doneMax, $curIdx] | max) as $anchor
  | ([ (if $paused then "\($t.modifiers.aborted.emoji // "⏸") \($t.modifiers.aborted.label // "paused")" else empty end),
       (if ($s.waitingOn // null) == "user" then "⛔ awaiting decision" else empty end),
       (if (($s.reviewLoopCount // 0) > 0) then "🔁 \($s.reviewLoopCount)/3" else empty end)
     ]) as $mods
  | ((try (($s.lastUpdatedAt | fromdateiso8601) as $ts | $now - $ts) catch null)) as $age
  | (if $age != null and $age > 600
     then (if $age >= 3600 then "⏱ \(($age / 3600) | floor)h" else "⏱ \(($age / 60) | floor)m" end)
     else null end) as $stale
  | (if $N == 0
     then ["🌌 \($track)", "▶ ⚙️ \($cur)"]
     elif $curIdx < 0 and $cur != ""
     # unknown current step (older/newer state shape) — render it raw, never fail
     then ["🌌 \($track)",
           ((("✓" * ($doneMax + 1)) // "") + (if $doneMax >= 0 then " " else "" end) + "▶⚙️ \($cur)")]
     else ["🌌 \($track)",
           ((("✓" * $anchor) // "") + (if $anchor > 0 then " " else "" end)
            + "▶\($steps[$anchor].emoji) \($steps[$anchor].label) \($anchor + 1)/\($N)")]
     end) as $head
  | ($head + $mods
     + [($s.branch // empty)]
     + [$stale // empty])
  | join(" │ ")
' 2>/dev/null)" || exit 0

[ -n "$OUT" ] && printf '%s\n' "$OUT"
exit 0
