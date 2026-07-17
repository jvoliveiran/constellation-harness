#!/usr/bin/env bash
# Constellation Harness — artifact sync.
# Commits harness artifacts (.constellation/ minus the gitignored state/ and
# metrics/) in a scoped commit that may run on ANY branch, including main.
# This is the harness's one sanctioned commit-on-main path: it stages nothing
# outside .constellation/ and refuses to run while unrelated changes are staged,
# so it can never be used to smuggle code past the branch/PR workflow.
# On the main branch it also pushes — but only when every commit ahead of
# upstream touches .constellation/ exclusively. On a feature branch it never
# pushes: the artifact commit rides the workflow's PR.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "sync-artifacts: not a git repository" >&2; exit 1; }
cd "$ROOT"
[ -d .constellation ] || { echo "sync-artifacts: no .constellation/ directory" >&2; exit 1; }

# Refuse to mix in unrelated work someone already staged.
STAGED_OUTSIDE="$(git diff --cached --name-only | grep -v '^\.constellation/' || true)"
if [ -n "$STAGED_OUTSIDE" ]; then
  echo "sync-artifacts: unrelated changes are already staged — commit or unstage them first:" >&2
  printf '%s\n' "$STAGED_OUTSIDE" >&2
  exit 1
fi

git add -- .constellation
if git diff --cached --quiet; then
  echo "sync-artifacts: nothing to commit — artifacts are clean."
  exit 0
fi

git commit -m "chore(constellation): sync harness artifacts"
echo "sync-artifacts: committed $(git diff-tree --no-commit-id --name-only -r HEAD | wc -l | tr -d ' ') artifact file(s)."

MAIN_BRANCH="$(jq -r '.branching.mainBranch // "main"' .constellation/config.json 2>/dev/null || echo main)"
[ -n "$MAIN_BRANCH" ] && [ "$MAIN_BRANCH" != "null" ] || MAIN_BRANCH=main
BRANCH="$(git branch --show-current)"

if [ "$BRANCH" != "$MAIN_BRANCH" ]; then
  echo "sync-artifacts: on '$BRANCH' — no push, the commit rides the workflow's PR."
  exit 0
fi

if ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  echo "sync-artifacts: no upstream for '$BRANCH' — commit created, push skipped."
  exit 0
fi

# Push only when everything ahead of upstream is artifact-only — never carry
# stray local commits onto the main branch.
AHEAD_OUTSIDE="$(git log '@{u}..HEAD' --name-only --format= | grep -v -e '^$' -e '^\.constellation/' || true)"
if [ -n "$AHEAD_OUTSIDE" ]; then
  echo "sync-artifacts: local '$MAIN_BRANCH' is ahead of upstream with non-artifact changes — push skipped:" >&2
  printf '%s\n' "$AHEAD_OUTSIDE" | sort -u >&2
  exit 0
fi

if git push; then
  echo "sync-artifacts: pushed to '$MAIN_BRANCH'."
else
  echo "sync-artifacts: push failed (branch protection or no permission?) — the commit is local; open a chore PR to sync artifacts." >&2
fi
