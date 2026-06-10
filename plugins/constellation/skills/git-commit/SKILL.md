---
name: git-commit
description: Create a single conventional commit for all staged changes, deriving the message from the plan file name or user request.
---

# Git Commit Skill

## Purpose

Create a single, well-structured commit for all changes produced during a workflow run. The commit message follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

---

## Conventional Commits Format

```
<type>: <description>
```

### Type Mapping

| Work Nature | Commit Type |
|---|---|
| New feature, new endpoint, new module | `feat` |
| Bug fix, correction | `fix` |
| Refactoring, restructuring (no behavior change) | `refactor` |
| Performance improvement | `perf` |
| Adding or updating tests only | `test` |
| Documentation only | `docs` |
| Build, CI, tooling | `chore` |
| Code style, formatting (no logic change) | `style` |

### Deriving the Description

**For planned work:**
- Use the plan file name as the base for the description.
- Strip the numeric prefix (`XXX-`) and convert hyphens to spaces.
- Example: `010-create-role-mutation.md` → `feat: create role mutation`

**For tweaks:**
- Summarize the original user request in a short, lowercase phrase.
- Example: user asked "fix the login validation bug" → `fix: login validation bug`

---

## Commit Procedure

1. **Verify branch**: run `git branch --show-current` to confirm you are on a feature branch, NOT the main branch (`branching.mainBranch` in `.constellation/config.json`). If on main, **STOP** and report the error.
2. **Stage changes**: run `git add -A`, then review with `git diff --cached --stat` and exclude any files that should not be committed (`.env`, credentials, large binaries).
3. **Verify staged changes**: `git diff --cached --stat`.
4. **Create the commit**: `git commit -m "<type>: <description>"`.
5. **Verify success**: `git log --oneline -1`.

---

## Rules

- **Single commit**: all changes from the workflow MUST be in a single commit.
- **Feature branch only**: never commit directly to the main branch.
- **No push**: pushing is handled by the DevOps Engineer.
- **No amend**: always create a new commit.
- **Lowercase description**, **no trailing period**, **max 72 characters** total.
- **Verify before commit**: ensure the project's lint, build, and test commands (`.constellation/config.json` → `commands`) all pass first.
- **Sensitive files**: never stage `.env`, credentials, API keys, or secrets — unstage them if present.
