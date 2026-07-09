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

# Subcommand anchor: `git`, its global options (`-C <path>`, `-c k=v`, `--paginate`, …),
# then whitespace before the subcommand. Prepend this to `<subcmd>` so the rules match the
# subcommand POSITION only — not the word appearing in a branch name, path, or -m message
# (e.g. `git branch feat/record-merge-commit` is not a commit; `git checkout x-push` is not
# a push). Option tokens and their optional argument stop at command separators (| ; &).
GIT_SUB='git([[:space:]]+-[^[:space:]|;&]+([[:space:]]+[^-][^[:space:]|;&]*)?)*[[:space:]]+'

deny() {
  echo "constellation guard: $1" >&2
  exit 2
}

# Resolve the repo a `git commit` actually targets, so the commit-on-main rule checks the
# right branch instead of always the session project. Honors a global `git -C <dir>` and a
# leading `cd <dir>`; only trusts ABSOLUTE paths (a relative path can't be resolved without
# the tool's live cwd) and otherwise falls back to PROJECT_DIR — the conservative default.
# The prefix is cut at the `commit` subcommand token so commit's own `-C <commit>`
# (message reuse) is never mistaken for a directory.
commit_target_dir() {
  local cmd="$1" prefix d
  prefix=$(printf '%s' "$cmd" | sed -E 's/[[:space:]]+commit([[:space:];|&].*|$)//')
  d=$(printf '%s' "$prefix" | grep -oE -- '-C[[:space:]]+[^[:space:]|;&]+' | tail -n1 | sed -E 's/^-C[[:space:]]+//')
  if [ -z "$d" ]; then
    d=$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^[:space:]|;&]+).*/\1/p')
  fi
  # Strip one layer of surrounding quotes so a literal quoted path resolves; an unexpanded
  # variable (e.g. "$H") survives as a non-absolute string and falls through to the default.
  d=${d#[\"\']}; d=${d%[\"\']}
  case "$d" in
    /*) printf '%s' "$d" ;;
    *)  printf '%s' "$PROJECT_DIR" ;;
  esac
}

# Rule: never bypass hooks
if printf '%s' "$CMD" | grep -Eq "${GIT_SUB}(commit|push)\b[^|;&]*--no-verify"; then
  deny "--no-verify is not allowed — fix the underlying issue instead of bypassing hooks."
fi

# Rule: never push to the main branch (incl. force push)
if printf '%s' "$CMD" | grep -Eq "${GIT_SUB}push\b[^|;&]*[[:space:]:]${MAIN_BRANCH}([[:space:]]|\$)"; then
  deny "pushing directly to '${MAIN_BRANCH}' is not allowed — all changes go through feature branches and PRs."
fi

# Rule: gates before remote — while a workflow is mid-pipeline, pushing is allowed only
# at the steps that come after the quality gates. TDD checkpoint commits stay local.
# Fail-open on unreadable state (resume's validation owns that problem).
STATE="$PROJECT_DIR/.constellation/state/current-workflow.json"
if printf '%s' "$CMD" | grep -Eq "${GIT_SUB}push([[:space:]]|\$)" && [ -f "$STATE" ]; then
  STEP=$(jq -r '.currentStep // empty' "$STATE" 2>/dev/null)
  case "$STEP" in
    devops-pr|ship|post-pr|"") ;;
    *) deny "workflow in progress (step: ${STEP}) — push is allowed only after the gates pass (steps devops-pr/post-pr/ship). Finish the gates, or /constellation:abort." ;;
  esac
fi

# Rule: never commit on the main branch (of the repo the commit actually targets)
if printf '%s' "$CMD" | grep -Eq "${GIT_SUB}commit([[:space:]]|\$)"; then
  TARGET_DIR=$(commit_target_dir "$CMD")
  CURRENT_BRANCH=$(git -C "$TARGET_DIR" branch --show-current 2>/dev/null)
  if [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" = "$MAIN_BRANCH" ]; then
    deny "committing on '${MAIN_BRANCH}' is not allowed — create a feature branch first (branching-strategy skill)."
  fi
fi

# Rule: never stage secrets
if printf '%s' "$CMD" | grep -Eq "${GIT_SUB}add([[:space:]]|\$)"; then
  if printf '%s' "$CMD" | grep -Eq '\.env(\.[A-Za-z0-9_-]+)?\b' \
     && ! printf '%s' "$CMD" | grep -Eq '\.env\.(example|sample|template|test)\b'; then
    deny "staging .env files is not allowed — secrets never enter version control."
  fi
  if printf '%s' "$CMD" | grep -Eq '(id_rsa|id_ed25519|\.pem\b|credentials\.json|service-account.*\.json)'; then
    deny "staging credential/key files is not allowed."
  fi
  # Sweep staging (git add -A / --all / .) can pull in secrets without naming them —
  # scan what would actually be staged before allowing.
  if printf '%s' "$CMD" | grep -Eq "${GIT_SUB}add\b[^|;&]*(-[A-Za-z]*A|--all\b|[[:space:]]\.([[:space:]]|\$))"; then
    SUSPECTS=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null | cut -c4- \
      | grep -E '(^|/)\.env(\.[A-Za-z0-9_-]+)?$|id_rsa|id_ed25519|\.pem$|credentials\.json$|service-account.*\.json$' \
      | grep -Ev '\.env\.(example|sample|template|test)$')
    if [ -n "$SUSPECTS" ]; then
      deny "sweep-staging would include secret-pattern files: $(printf '%s' "$SUSPECTS" | tr '\n' ' ')— stage files explicitly or gitignore them."
    fi
  fi
fi

exit 0
