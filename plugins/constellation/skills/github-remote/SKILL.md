---
name: github-remote
description: Safe remote GitHub operations via the gh CLI — account verification and switching, cloning, pushing, PR creation, reading/answering PR feedback, CI checks, and merging against the right account.
---

# GitHub Remote Skill

## Scope

Apply this skill whenever a task requires accessing, cloning, pushing to, or creating pull requests against remote GitHub repositories using the `gh` CLI:

- Identifying the correct GitHub account before any remote operation
- Switching accounts with `gh auth switch` before acting
- Cloning private repos, pushing branches, and creating PRs
- Verifying authentication state before acting

This skill does **not** cover local-only git operations (commits, branching, merging) — those require no account switching.

## The Target Account

The account to use is defined in the project's `.constellation/config.json` under `github.account`. Referred to as `<account>` below. If the config is missing or empty, ask the user which account to use — never guess.

---

## Transport — HTTPS via gh, never SSH

All GitHub operations go through the `gh` CLI, and all git remote operations (clone,
push, pull, fetch) go over **HTTPS authenticated by gh's credential helper**. Never SSH.

Why: the credential helper serves the credentials of the **currently active gh account**,
so `gh auth switch` + HTTPS routes every operation to the account the project configured.
SSH keys and per-account host aliases (`git@github.com-work:…`) sit outside gh entirely —
they silently ignore `github.account` and break when keys rotate.

**Transport preflight** — run once before the first remote git operation of a session:

```bash
# 1. Remote must be HTTPS — convert if it is SSH (git@… or ssh://…)
git remote get-url origin
git remote set-url origin https://github.com/OWNER/REPO.git   # only when SSH

# 2. Pin the repo to the configured account (git pushes route to <account>'s
#    token regardless of which gh account is currently active)
git config credential.username <account>

# 3. gh must own git credentials (idempotent; per machine)
gh auth setup-git

# 4. gh-created clones/remotes default to HTTPS
gh config set git_protocol https
```

`gh repo clone` and `gh pr checkout` already produce HTTPS remotes once `git_protocol`
is `https` — the conversion in step 1 is only needed for repos cloned by other means.

**The pin (step 2) covers git; `gh` commands still follow the active account.** With the
pin set, `git push`/`pull`/`fetch` always act as `<account>` even if the user's daily
default is a different gh account. `gh pr *` / `gh api` calls do NOT read the pin — they
use the active account, which is why Switch-Then-Act below stays mandatory for every gh
command. If the account was switched during a workflow on a machine whose daily default
is a different account, mention at workflow end that the active gh account was left on
`<account>` (`gh auth switch` restores it).

---

## Verifying Authentication State

Before any remote operation:

```bash
gh auth status
```

To see just the currently active username:

```bash
gh api user --jq '.login'
```

---

## Switch-Then-Act Pattern

Every remote operation follows this exact sequence:

```bash
# Step 1 — switch to the configured account
gh auth switch --user <account>

# Step 2 — verify the switch succeeded
gh api user --jq '.login'   # must print <account>

# Step 3 — execute the intended operation
gh repo clone OWNER/REPO
```

Never skip step 2. A failed switch produces no error by default — verifying the active user confirms the switch succeeded before the operation runs against the wrong account.

---

## Core Operations

### Cloning a Repository

```bash
gh auth switch --user <account>
gh api user --jq '.login'
gh repo clone OWNER/REPO [path/to/local/directory]
```

`gh repo clone` configures the remote using the authenticated account's credentials automatically — no manual token handling.

### Viewing / Listing

```bash
gh repo view OWNER/REPO [--web]
gh repo list [OWNER --limit 50]
```

### Pushing Changes

`gh` manages authentication via the credential helper set up by `gh auth setup-git` (see
Transport preflight). Switch accounts before pushing — the helper serves the active
account's credentials:

```bash
gh auth switch --user <account>
git push origin BRANCH_NAME
```

### Creating a Pull Request

Run from inside the repo directory — `gh` detects the remote context:

```bash
gh auth switch --user <account>

gh pr create \
  --title "feat: add invoice pagination" \
  --body "Adds cursor-based pagination to the invoice list endpoint." \
  --base main \
  --head BRANCH_NAME
```

Draft: `gh pr create --draft --title "WIP: …" --base main`

### Listing and Viewing PRs

```bash
gh pr list [--author "@me"]
gh pr view PR_NUMBER [--web]
gh pr checks PR_NUMBER
gh pr checkout PR_NUMBER
```

### Reading PR Feedback

```bash
# Issue-level comments + reviews, flattened (quick read)
gh pr view PR_NUMBER --comments

# Review threads with resolution state (the source of truth for "unresolved")
gh api graphql -f query='
  query($owner:String!, $repo:String!, $pr:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$pr) {
        reviewThreads(first:100) { nodes {
          id isResolved path line
          comments(first:20) { nodes { author { login } body } }
        } }
      }
    }
  }' -f owner=OWNER -f repo=REPO -F pr=PR_NUMBER \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)'
```

### Writing PR Feedback

```bash
# Top-level PR comment (e.g. the gate summary)
gh pr comment PR_NUMBER --body "..."

# Reply to a specific review comment
gh api repos/OWNER/REPO/pulls/PR_NUMBER/comments/COMMENT_ID/replies -f body="..."

# Resolve a review thread (after the fix is pushed and the reply posted)
gh api graphql -f query='
  mutation($thread:ID!) {
    resolveReviewThread(input:{threadId:$thread}) { thread { isResolved } }
  }' -f thread=THREAD_ID
```

### Waiting on CI and Merging

```bash
gh pr checks PR_NUMBER --watch      # blocks until all checks complete; non-zero exit on failure

gh pr merge PR_NUMBER --squash --delete-branch
```

Never merge with `--admin` (bypasses branch protection) and never use `--auto` without the
orchestrator's merge-policy preconditions being verified first.

---

## Troubleshooting

### Verify accounts are authenticated

`gh auth status` — if the configured account doesn't appear:

```bash
gh auth login --hostname github.com
```

### Permission denied on clone or push

Usually the wrong account is active:

```bash
gh api user --jq '.login'                      # shows wrong user?
gh auth switch --hostname github.com --user <account>
git push origin BRANCH_NAME                    # retry
```

### `Permission denied (publickey)`

The remote is SSH — gh credentials never enter the picture. Run the Transport preflight:
convert the remote to HTTPS (`git remote set-url origin https://github.com/OWNER/REPO.git`),
ensure `gh auth setup-git`, then retry.

### `gh auth switch` — account not found

The account is not authenticated. Run `gh auth login --hostname github.com`, then verify with `gh auth status` and retry.

---

## Hard Rules

- **Always switch to the configured account before any remote operation** — never assume the active account is correct
- **Always verify the switch** with `gh api user --jq '.login'` before the intended command
- **Never hardcode tokens or credentials** — `gh` manages authentication
- **Never run `gh repo clone`, `git push`, or `gh pr create` before confirming the active account**
- **Never operate over SSH remotes** — HTTPS via the gh credential helper only; convert SSH remotes before pushing (Transport preflight)
- **Never call the GitHub HTTP API directly** (`curl https://api.github.com/…`) — use `gh api` / the dedicated `gh` subcommands, which authenticate as the switched account
