#!/usr/bin/env bash
# Constellation Harness — cross-model review adapter (opencode).
#
# Runs a second-family model over a diff/plan via the local `opencode` CLI and
# prints its raw review text to stdout. Contract normalization is the caller's
# (cross-model-reviewer subagent) job — this script only bridges to opencode and
# returns a clean exit code.
#
# Usage:
#   opencode-review.sh <input-file> <prompt-file> [model] [effort] [timeoutSec]
#
#   <input-file>   file whose content is reviewed (a unified diff, or a plan)
#   <prompt-file>  file containing the review instructions + output contract
#   model          opencode "provider/model" id (default: google/gemini-3-flash-preview)
#   effort         reasoning effort -> opencode --variant (default: unset)
#   timeoutSec     hard cap on the opencode call (default: 180). Reasoning/codex
#                  models can be slow or provider-throttled — a too-low cap just
#                  infra-skips (exit 3), never blocks. Tune per project.
#
# Exit codes:
#   0  success — assistant text on stdout
#   2  usage error (bad args / missing input files)
#   3  INFRA failure — opencode missing, error event, timeout, or empty output.
#      The caller MUST treat this as "cross-model review skipped", never a blocker.
#
# Design notes (verified against opencode 1.17.12):
#   - The reviewed content is INLINED into the message (not attached via -f) so the
#     model needs no tool call to see it — it can answer in a single shot.
#   - Runs in a throwaway --dir so any stray tool use cannot touch the real repo
#     (isolation is the real safety net; we don't depend on a read-only agent).
#   - `--format json` emits JSONL; assistant text is on `type:"text"` events at
#     `.part.text`; provider errors are `type:"error"` events.
#   - `--variant` sets reasoning effort. Codex/reasoning models can still be slow or
#     provider-throttled; the timeout below turns that into a clean infra-skip.

set -uo pipefail

INPUT_FILE="${1-}"
PROMPT_FILE="${2-}"
MODEL="${3:-google/gemini-3-flash-preview}"
EFFORT="${4-}"
TIMEOUT="${5:-180}"

[ -n "$INPUT_FILE" ] && [ -n "$PROMPT_FILE" ] || {
  echo "usage: opencode-review.sh <input-file> <prompt-file> [model] [effort] [timeoutSec]" >&2
  exit 2
}
command -v opencode >/dev/null 2>&1 || { echo "opencode not found on PATH" >&2; exit 3; }
command -v jq       >/dev/null 2>&1 || { echo "jq not found on PATH" >&2; exit 3; }
[ -f "$INPUT_FILE" ]  || { echo "input file not found: $INPUT_FILE" >&2; exit 2; }
[ -f "$PROMPT_FILE" ] || { echo "prompt file not found: $PROMPT_FILE" >&2; exit 2; }

WORKDIR="$(mktemp -d)"
OUT="$(mktemp)"
trap 'rm -rf "$WORKDIR" "$OUT"' EXIT

# Inline the reviewed content into the message so the model needs no tools to see it.
FULL_PROMPT="$(cat "$PROMPT_FILE")

--- BEGIN CONTENT UNDER REVIEW ---
$(cat "$INPUT_FILE")
--- END CONTENT UNDER REVIEW ---"

timeout "$TIMEOUT" opencode run "$FULL_PROMPT" \
  -m "$MODEL" \
  ${EFFORT:+--variant "$EFFORT"} \
  --format json \
  --dir "$WORKDIR" \
  >"$OUT" 2>/dev/null
rc=$?

if [ "$rc" -eq 124 ]; then
  echo "opencode timed out after ${TIMEOUT}s" >&2
  exit 3
fi

# Any error event is an infrastructure failure (e.g. model_not_found), never a verdict.
if jq -e 'select(.type=="error")' "$OUT" >/dev/null 2>&1; then
  msg="$(jq -rc 'select(.type=="error") | .error.data.message' "$OUT" 2>/dev/null | head -c 300)"
  echo "opencode error event: ${msg:-unknown}" >&2
  exit 3
fi

TEXT="$(jq -rc 'select(.type=="text") | .part.text' "$OUT" 2>/dev/null)"
if [ -z "$TEXT" ]; then
  echo "no assistant text in opencode output (rc=$rc)" >&2
  exit 3
fi

printf '%s\n' "$TEXT"
exit 0
