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

# 6. Track-map drift — every step id the orchestrator saves must exist in tracks.json
#    (as a track step or an extraSteps key), and every tracks.json id must be saved
#    somewhere in the orchestrator. Otherwise the Progress HUD renders lies.
TRACKS="$ROOT/plugins/constellation/templates/tracks.json"
SKILL_IDS="$(grep -oE 'step: "[a-z0-9-]+"' "$ORCH" | sed 's/step: "//; s/"//' | sort -u)"
MAP_IDS="$(jq -r '[.tracks[][].id, (.extraSteps | keys[])] | .[]' "$TRACKS" 2>/dev/null | sort -u)"
[ -n "$MAP_IDS" ] || fail "tracks.json yields no step ids"
for id in $SKILL_IDS; do
  printf '%s\n' "$MAP_IDS" | grep -qx "$id" || fail "orchestrator step '$id' missing from tracks.json"
done
for id in $MAP_IDS; do
  printf '%s\n' "$SKILL_IDS" | grep -qx "$id" || fail "tracks.json step '$id' never saved by the orchestrator"
done
say "6. track-map drift checked"

# 7. Statusline fixture render — the mechanical HUD must render a known state correctly
#    and stay silent (exit 0, no output) when there is no workflow.
SL="$ROOT/plugins/constellation/templates/statusline.sh"
SLTMP="$(mktemp -d)"
mkdir -p "$SLTMP/.constellation/state"
cp "$TRACKS" "$SLTMP/.constellation/tracks.json"
cat > "$SLTMP/.constellation/config.json" <<'EOF'
{ "crossModelValidation": { "enabled": true, "steps": ["code-review", "plan-review"] } }
EOF
cat > "$SLTMP/.constellation/state/current-workflow.json" <<'EOF'
{
  "track": "planned",
  "branch": "feat/011-audit-log",
  "currentStep": "parallel-gate-1",
  "completedSteps": ["architect", "plan-review", "devops-branch", "engineer", "lint-gate"],
  "reviewLoopCount": 1,
  "waitingOn": null,
  "lastUpdatedAt": "2026-07-03T10:00:00Z"
}
EOF
SLOUT="$(printf '{"workspace":{"current_dir":"%s"}}' "$SLTMP" | bash "$SL")" || fail "statusline exited non-zero on fixture"
case "$SLOUT" in *"▶🔍 Review Gate 6/10"*) : ;; *) fail "statusline fixture render: got '$SLOUT'" ;; esac
case "$SLOUT" in *"🔁 1/3"*) : ;; *) fail "statusline loop modifier: got '$SLOUT'" ;; esac
SLOUT2="$(printf '{"workspace":{"current_dir":"%s"}}' "$SLTMP/nonexistent" | bash "$SL")" || fail "statusline exited non-zero without state"
[ -z "$SLOUT2" ] || fail "statusline should print nothing without a state file: got '$SLOUT2'"
rm -rf "$SLTMP"
say "7. statusline fixture render checked"

# 8. sync-artifacts fixture — the artifact committer must commit .constellation/ only,
#    respect the state/metrics gitignore, be idempotent, and refuse mixed staging.
SA="$ROOT/plugins/constellation/templates/sync-artifacts.sh"
SATMP="$(mktemp -d)"
(
  set -e
  cd "$SATMP"
  git init -q -b main .
  git config user.email selftest@constellation && git config user.name selftest
  mkdir -p .constellation/plans .constellation/state
  printf 'state/\nmetrics/\n' > .constellation/.gitignore
  echo '{}' > .constellation/config.json
  echo plan > .constellation/plans/001-x.md
  echo state > .constellation/state/wf.json
  echo code > app.ts
  bash "$SA" >/dev/null 2>&1                                            || exit 1  # first sync commits
  git ls-files --error-unmatch .constellation/plans/001-x.md >/dev/null 2>&1 || exit 2  # plan committed
  ! git ls-files --error-unmatch .constellation/state/wf.json >/dev/null 2>&1 || exit 3  # state stays out
  ! git ls-files --error-unmatch app.ts >/dev/null 2>&1                 || exit 4  # code stays out
  N1="$(git rev-list --count HEAD)"
  bash "$SA" >/dev/null 2>&1                                            || exit 5  # clean rerun ok
  [ "$(git rev-list --count HEAD)" = "$N1" ]                            || exit 6  # …and no-op
  git add app.ts
  echo more > .constellation/plans/002-y.md
  ! bash "$SA" >/dev/null 2>&1                                          || exit 7  # mixed staging refused
) ; SARC=$?
case "$SARC" in
  0) : ;;
  1) fail "sync-artifacts: first run did not commit" ;;
  2) fail "sync-artifacts: plan file not committed" ;;
  3) fail "sync-artifacts: gitignored state/ was committed" ;;
  4) fail "sync-artifacts: file outside .constellation/ was committed" ;;
  5) fail "sync-artifacts: clean rerun exited non-zero" ;;
  6) fail "sync-artifacts: clean rerun created an empty commit" ;;
  7) fail "sync-artifacts: mixed staging was not refused" ;;
  *) fail "sync-artifacts: fixture setup failed (rc=$SARC)" ;;
esac
rm -rf "$SATMP"
say "8. sync-artifacts fixture checked"

# 9. git guard artifact hygiene — push must be blocked while .constellation artifacts
#    sit uncommitted, and allowed again once they are committed.
GG="$ROOT/plugins/constellation/scripts/guard-git.sh"
GGTMP="$(mktemp -d)"
(
  set -e
  cd "$GGTMP"
  git init -q -b main .
  git config user.email selftest@constellation && git config user.name selftest
  mkdir -p .constellation
  echo '{}' > .constellation/config.json
  echo plan > .constellation/untracked-plan.md
)
GGIN='{"tool_input":{"command":"git push origin feat/x"}}'
printf '%s' "$GGIN" | CLAUDE_PROJECT_DIR="$GGTMP" bash "$GG" >/dev/null 2>&1
[ $? -eq 2 ] || fail "guard: push not blocked with uncommitted .constellation artifacts"
( cd "$GGTMP" && git add .constellation && git commit -qm 'chore: artifacts' )
printf '%s' "$GGIN" | CLAUDE_PROJECT_DIR="$GGTMP" bash "$GG" >/dev/null 2>&1
[ $? -eq 0 ] || fail "guard: push blocked even though artifacts are committed"
rm -rf "$GGTMP"
say "9. git guard artifact hygiene checked"

# 10. git guard destructive-discard rules — work-discarding commands must be blocked
#     while the tree is dirty (the rogue-'git checkout -- .' incident) and allowed
#     when clean; branch switches and --staged restores stay allowed even when dirty.
GDTMP="$(mktemp -d)"
(
  cd "$GDTMP"
  git init -q -b main . && git config user.email selftest@constellation && git config user.name selftest
  mkdir -p .constellation && echo '{}' > .constellation/config.json
  git add -A && git commit -qm init
)
gd() { printf '{"tool_input":{"command":"%s"}}' "$1" | CLAUDE_PROJECT_DIR="$GDTMP" bash "$GG" >/dev/null 2>&1; echo $?; }
[ "$(gd 'git checkout -- .')" = 0 ] || fail "guard: discard blocked on a CLEAN tree"
echo dirty > "$GDTMP/f.txt"
[ "$(gd 'git checkout -- .')" = 2 ]              || fail "guard: 'checkout -- .' not blocked on dirty tree"
[ "$(gd 'git reset --hard')" = 2 ]               || fail "guard: 'reset --hard' not blocked on dirty tree"
[ "$(gd 'git clean -fd')" = 2 ]                  || fail "guard: 'clean -fd' not blocked on dirty tree"
[ "$(gd 'git restore src/app.ts')" = 2 ]         || fail "guard: worktree 'restore' not blocked on dirty tree"
[ "$(gd 'git restore --staged f.txt')" = 0 ]     || fail "guard: 'restore --staged' (unstage only) was blocked"
[ "$(gd 'git checkout -b feat/x')" = 0 ]         || fail "guard: branch creation blocked on dirty tree"
[ "$(gd 'git checkout main')" = 0 ]              || fail "guard: branch switch blocked on dirty tree"
rm -rf "$GDTMP"
say "10. git guard destructive-discard checked"

[ "$FAIL" -eq 0 ] && say "selftest: ALL GREEN" || say "selftest: FAILURES ABOVE"
exit "$FAIL"
