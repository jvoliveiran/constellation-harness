---
name: release-notes
description: CHANGELOG generation, PR descriptions, and release documentation conventions.
---

# Release Notes Skill

## Scope

Apply this skill when creating pull request descriptions, generating CHANGELOG entries, or documenting releases.

---

## CHANGELOG Format

The project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. The file `CHANGELOG.md` lives in the project root.

### Structure

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- New features

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Removed
- Removed features

### Security
- Security-related changes

### Deprecated
- Features marked for future removal
```

### Entry Format

Each entry is a single line describing the change from the user's perspective:

```markdown
### Added
- Role-based access control with `createRole` and `assignRole` mutations
- Email verification flow with configurable token expiry

### Fixed
- Login validation no longer accepts empty password strings
```

### Rules

- Write entries from the user/consumer perspective, not the developer perspective
- One line per change — no multi-line descriptions
- Use present tense: "Add", "Fix", "Remove"
- Reference the plan number when applicable: `(#010)`
- Group changes under the correct category
- Keep `[Unreleased]` at the top — entries move to a versioned section on release

### Mapping from Commit Type

| Commit Type | CHANGELOG Section |
|---|---|
| `feat` | Added |
| `fix` | Fixed |
| `refactor` | Changed |
| `perf` | Changed |
| `docs` | (skip unless user-facing) |
| `test` | (skip — internal) |
| `chore` | (skip — internal) |
| `style` | (skip — internal) |
| security-related fix | Security |
| deprecation | Deprecated |
| removal | Removed |

---

## PR Description

### Template

```markdown
## Summary
Brief description of what was implemented and why.

## Changes
- List of significant changes with file references

## Plan Reference
Plan: `.constellation/plans/XXX-description.md` (if applicable)

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Lint passes
- [ ] Build passes
- [ ] Manual testing completed (if applicable)

## CHANGELOG
```markdown
### Added
- Description of new feature (#XXX)
```
```

### Rules

- PR title matches the commit message format: `<type>: <description>`
- Summary explains the "why", not just the "what"
- Changes section lists files and the reason for each change
- CHANGELOG section is pre-written so it can be copied into `CHANGELOG.md` on merge
- Testing section confirms all automated checks pass

---

## Hard Rules

- Every feature or fix PR must include a CHANGELOG entry
- Internal changes (tests, refactoring, chores) do not need CHANGELOG entries
- CHANGELOG entries describe user-visible impact, not implementation details
- The `[Unreleased]` section is always at the top of the file
- Never delete or modify entries in versioned sections
