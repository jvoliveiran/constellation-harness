#!/usr/bin/env bash
# Constellation Harness — statusline renderer (Workflow Progress HUD).
# Reads the Claude Code statusline JSON on stdin and renders a one-line HUD from
# .constellation/state/current-workflow.json + .constellation/tracks.json:
#
#   🌌 planned │ ✓✓✓✓✓ ▶🔍 Review Gate 6/10 │ 🔁 1/3 │ feat/011-audit-log │ ⏱ 12m
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

CFG_JSON='{}'
if [ -f "$CONFIG" ]; then
  CFG_JSON="$(jq -c . "$CONFIG" 2>/dev/null)" || CFG_JSON='{}'
fi

OUT="$(jq -rn \
  --slurpfile st "$STATE" \
  --slurpfile tr "$TRACKS" \
  --argjson cfg "$CFG_JSON" \
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
  | ([ (if ($s.waitingOn // null) == "user" then "⛔ awaiting decision" else empty end),
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
