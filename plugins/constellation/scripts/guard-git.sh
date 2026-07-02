#!/usr/bin/env bash
# Constellation Harness — PreToolUse guard for the Bash tool.
# Mechanically enforces the harness's git safety rules in initialized projects.
# Exit 0 = allow, exit 2 = block (stderr is shown to Claude).

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CONFIG="$PROJECT_DIR/.constellation/config.json"
[ -f "$CONFIG" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$CMD" ] || exit 0
case "$CMD" in *git*) ;; *) exit 0 ;; esac

MAIN_BRANCH=$(jq -r '.branching.mainBranch // "main"' "$CONFIG" 2>/dev/null)
[ -n "$MAIN_BRANCH" ] && [ "$MAIN_BRANCH" != "null" ] || MAIN_BRANCH=main

deny() {
  echo "constellation guard: $1" >&2
  exit 2
}

# Rule: never bypass hooks
if printf '%s' "$CMD" | grep -Eq 'git[^|;&]*\b(commit|push)\b[^|;&]*--no-verify'; then
  deny "--no-verify is not allowed — fix the underlying issue instead of bypassing hooks."
fi

# Rule: never push to the main branch (incl. force push)
if printf '%s' "$CMD" | grep -Eq "git[^|;&]*\bpush\b[^|;&]*[[:space:]:]${MAIN_BRANCH}([[:space:]]|\$)"; then
  deny "pushing directly to '${MAIN_BRANCH}' is not allowed — all changes go through feature branches and PRs."
fi

# Rule: gates before remote — while a workflow is mid-pipeline, pushing is allowed only
# at the steps that come after the quality gates. TDD checkpoint commits stay local.
# Fail-open on unreadable state (resume's validation owns that problem).
STATE="$PROJECT_DIR/.constellation/state/current-workflow.json"
if printf '%s' "$CMD" | grep -Eq 'git[^|;&]*\bpush\b' && [ -f "$STATE" ]; then
  STEP=$(jq -r '.currentStep // empty' "$STATE" 2>/dev/null)
  case "$STEP" in
    devops-pr|ship|post-pr|"") ;;
    *) deny "workflow in progress (step: ${STEP}) — push is allowed only after the gates pass (steps devops-pr/post-pr/ship). Finish the gates, or /constellation:abort." ;;
  esac
fi

# Rule: never commit on the main branch
if printf '%s' "$CMD" | grep -Eq 'git[^|;&]*\bcommit\b'; then
  CURRENT_BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null)
  if [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" = "$MAIN_BRANCH" ]; then
    deny "committing on '${MAIN_BRANCH}' is not allowed — create a feature branch first (branching-strategy skill)."
  fi
fi

# Rule: never stage secrets
if printf '%s' "$CMD" | grep -Eq 'git[^|;&]*\badd\b'; then
  if printf '%s' "$CMD" | grep -Eq '\.env(\.[A-Za-z0-9_-]+)?\b' \
     && ! printf '%s' "$CMD" | grep -Eq '\.env\.(example|sample|template|test)\b'; then
    deny "staging .env files is not allowed — secrets never enter version control."
  fi
  if printf '%s' "$CMD" | grep -Eq '(id_rsa|id_ed25519|\.pem\b|credentials\.json|service-account.*\.json)'; then
    deny "staging credential/key files is not allowed."
  fi
  # Sweep staging (git add -A / --all / .) can pull in secrets without naming them —
  # scan what would actually be staged before allowing.
  if printf '%s' "$CMD" | grep -Eq 'git[^|;&]*\badd\b[^|;&]*(-[A-Za-z]*A|--all\b|[[:space:]]\.([[:space:]]|$))'; then
    SUSPECTS=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null | cut -c4- \
      | grep -E '(^|/)\.env(\.[A-Za-z0-9_-]+)?$|id_rsa|id_ed25519|\.pem$|credentials\.json$|service-account.*\.json$' \
      | grep -Ev '\.env\.(example|sample|template|test)$')
    if [ -n "$SUSPECTS" ]; then
      deny "sweep-staging would include secret-pattern files: $(printf '%s' "$SUSPECTS" | tr '\n' ' ')— stage files explicitly or gitignore them."
    fi
  fi
fi

exit 0
