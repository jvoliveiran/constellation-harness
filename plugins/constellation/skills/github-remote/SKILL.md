---
name: github-remote
description: Safe remote GitHub operations via the gh CLI — account verification and switching, cloning, pushing, and PR creation against the right account.
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

`gh` manages authentication via the credential helper set up by `gh auth setup-git`. Switch accounts before pushing:

```bash
gh auth switch --user <account>
git push origin BRANCH_NAME
```

If the credential helper is not configured, run once per account (after switching to it):

```bash
gh auth setup-git
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

### `gh auth switch` — account not found

The account is not authenticated. Run `gh auth login --hostname github.com`, then verify with `gh auth status` and retry.

---

## Hard Rules

- **Always switch to the configured account before any remote operation** — never assume the active account is correct
- **Always verify the switch** with `gh api user --jq '.login'` before the intended command
- **Never hardcode tokens or credentials** — `gh` manages authentication
- **Never run `gh repo clone`, `git push`, or `gh pr create` before confirming the active account**
