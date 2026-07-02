#!/usr/bin/env bash
# Constellation Harness — self-test (ROADMAP 3.2).
# Catches the harness's most likely silent failures: broken scripts, invalid JSON,
# plugin-manifest errors, and contract drift between gate agents and the orchestrator.
# Run from the repo root: scripts/selftest.sh   (exit 0 = all green)

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0
say()  { printf '%s\n' "$*"; }
fail() { say "FAIL: $*"; FAIL=1; }

# 1. Shell syntax
while IFS= read -r -d '' f; do
  bash -n "$f" 2>/dev/null || fail "bash -n $f"
done < <(find "$ROOT" -name '*.sh' -not -path '*/node_modules/*' -print0)
say "1. shell syntax checked"

# 2. JSON validity
while IFS= read -r -d '' f; do
  jq empty "$f" 2>/dev/null || fail "invalid JSON: $f"
done < <(find "$ROOT" -name '*.json' -not -path '*/node_modules/*' -print0)
say "2. JSON validity checked"

# 3. Plugin validation (skipped when the claude CLI is unavailable, e.g. bare CI)
if command -v claude >/dev/null 2>&1; then
  claude plugin validate "$ROOT" >/dev/null 2>&1 || fail "claude plugin validate $ROOT"
  say "3. plugin validation checked"
else
  say "3. plugin validation SKIPPED (claude CLI not on PATH)"
fi

# 4. Contract drift — every gate agent's output contract must carry the markers the
#    orchestrator parses, and the orchestrator must reference each contract heading.
ORCH="$ROOT/plugins/constellation/skills/orchestrator/SKILL.md"
require_markers() { # file, contract-name, markers...
  local f="$1" name="$2"; shift 2
  for m in "$@"; do
    grep -q "$m" "$f" || fail "$name: '$m' missing in $(basename "$f")"
  done
  grep -q "$name" "$ORCH" || fail "orchestrator does not reference contract '$name'"
}
AG="$ROOT/plugins/constellation/agents"
require_markers "$AG/code-reviewer.md"        "Review Result"                  "VERDICT" "BLOCKERS" "SUGGESTIONS" "NITS" "PATTERNS"
require_markers "$AG/security-analyst.md"     "Security Review Result"         "VERDICT" "BLOCKERS" "SUGGESTIONS" "NITS" "DEPENDENCY_AUDIT" "PATTERNS"
require_markers "$AG/cross-model-reviewer.md" "Cross-Model Review Result"      "VERDICT" "BLOCKERS" "SUGGESTIONS"
require_markers "$AG/cross-model-reviewer.md" "Cross-Model Plan Review Result" "VERDICT" "BLOCKERS"
require_markers "$AG/sdet.md"                 "Test Assessment Result"         "VERDICT"
require_markers "$AG/technical-writer.md"     "Documentation Result"           "FILES_UPDATED" "CHANGELOG_ENTRY"
say "4. contract drift checked"

# 5. Orchestrator ↔ config template coherence: every config key the orchestrator
#    documents exists in the template.
TPL="$ROOT/plugins/constellation/templates/config.json"
for key in commands branching schemaPath stack review merge crossModelValidation github; do
  jq -e --arg k "$key" 'has($k)' "$TPL" >/dev/null 2>&1 || fail "config template missing key: $key"
done
say "5. config template coherence checked"

[ "$FAIL" -eq 0 ] && say "selftest: ALL GREEN" || say "selftest: FAILURES ABOVE"
exit "$FAIL"
