---
name: branching-strategy
description: Git branching conventions, branch creation, PR workflow, and merge strategy for a structured development lifecycle.
---

# Branching Strategy Skill

## Scope

Apply this skill whenever creating branches, preparing commits, creating pull requests, or merging code. The integration branch is `branching.mainBranch` in `.constellation/config.json` (default `main`) — referred to as "main" below.

---

## Branch Naming

All work happens on feature branches. Never commit directly to main.

### Format

```
<type>/<task-number>-<short-description>
```

### Type Mapping

| Work Type | Branch Prefix |
|---|---|
| New feature | `feat/` |
| Bug fix | `fix/` |
| Refactoring | `refactor/` |
| Test additions | `test/` |
| Documentation | `docs/` |
| Chore / tooling | `chore/` |
| Hotfix (emergency) | `hotfix/` |
| Spike / exploration | `spike/` |

### Examples

| Scenario | Branch Name |
|---|---|
| Plan `010-create-role-mutation.md` | `feat/010-create-role-mutation` |
| Tweak: fix login validation | `fix/login-validation` |
| Hotfix: auth token expiry | `hotfix/auth-token-expiry` |
| Spike: evaluate caching | `spike/evaluate-caching` |

### Rules

- Lowercase only, hyphens for word separation
- Include the plan number when a plan exists
- Keep descriptions under 5 words
- No special characters or spaces

---

## Branch Lifecycle

### Creation

```bash
git checkout main
git pull origin main
git checkout -b <type>/<description>
```

### During Work

- Commit early and often on the feature branch
- Keep the branch focused on a single plan or task
- Rebase on main if the branch falls behind (before PR creation only)

### After Commit

1. Push the branch to remote
2. Create a pull request against main

---

## Pull Request Conventions

### PR Title

Same format as the commit message: `<type>: <description>` — e.g. `feat: create role mutation`

### PR Description

```markdown
## Summary
- Brief description of what was implemented
- Key architectural decisions made
- Plan reference: `.constellation/plans/XXX-description.md`

## Changes
- List of files changed and why

## Testing
- [ ] Unit tests pass
- [ ] Lint passes
- [ ] Build passes
- [ ] New tests added for: [list scenarios]

## Plan Reference
Plan: `XXX-description.md` (if applicable)
```

### PR Rules

- One PR per plan or task — never bundle unrelated work
- PR title matches the commit message
- PR description references the plan file when applicable
- All CI checks must pass before merge
- Squash merge into main to keep a clean history

---

## Merge Strategy

- **Squash and merge** feature branches into main — a single clean commit
- **Never force push** to main
- **Delete the branch** after merge
- **Rebase before PR** if the branch is behind main — resolve conflicts locally

---

## Workflow Integration

### For Planned Work
1. Software Architect creates the plan
2. DevOps Engineer creates `feat/<task-number>-<description>`
3. Software Engineer implements on the feature branch
4. All subsequent agents (Code Reviewer, Security Analyst, SDET) work on the same branch
5. After the final commit, DevOps Engineer pushes and creates the PR

### For Tweaks
1. Branch `fix/<description>` or `refactor/<description>`
2. Work proceeds on the branch
3. After the final commit, push and create the PR

### For Hotfixes
1. Branch `hotfix/<description>` from latest main
2. Abbreviated review
3. After commit, push and create the PR immediately

### For Spikes
1. Branch `spike/<description>` (optional)
2. Exploratory work — no commit or PR required
3. Output is a markdown document, not production code
4. Branch is deleted after findings are documented

---

## Hard Rules

- Never commit directly to main — all changes go through feature branches and PRs
- Never force push to main or shared branches
- Always create the branch from the latest main
- Always squash merge PRs into main
- Always delete feature branches after merge
- Branch names must follow the naming convention — no freeform names
