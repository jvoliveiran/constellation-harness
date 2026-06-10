---
name: dependency-management
description: npm dependency evaluation, security auditing, update strategy, and lockfile hygiene.
---

# Dependency Management Skill

## Scope

Apply this skill when adding, removing, or updating npm dependencies, auditing for vulnerabilities, or evaluating new packages. (For non-npm ecosystems, apply the same evaluation criteria with the ecosystem's equivalents.)

---

## Adding Dependencies

### Evaluation Criteria

| Criterion | Check |
|---|---|
| **Necessity** | Can this be achieved with existing dependencies or a small utility function? |
| **Maintenance** | Actively maintained? Last publish within 12 months? |
| **Size** | Install size and dependency tree depth? Use `npm pack --dry-run`. |
| **License** | Compatible? (MIT, Apache-2.0, ISC are safe. GPL requires legal review.) |
| **Security** | Known vulnerabilities? Check `npm audit` after install. |
| **Downloads** | Widely adopted? Check weekly downloads on npm. |
| **TypeScript** | Ships types or has `@types/*` available? |

### Rules

- Prefer packages with zero or few transitive dependencies
- Prefer packages that are part of the project's existing ecosystem (e.g., framework-family packages over generic alternatives)
- Never add a dependency for something achievable in under 20 lines of code
- Always install with an exact version or a caret range — never `*` or `latest`

### Production vs Development

```bash
npm install <package>              # runtime dependency
npm install --save-dev <package>   # build/test/lint only
```

`devDependencies`: test frameworks, `@types/*`, linters/formatters, build tools, CLI-only tooling.
`dependencies`: runtime libraries.

---

## Security Auditing

```bash
npm audit              # all
npm audit --omit=dev   # production only
```

### Severity Response

| Severity | Action | Timeline |
|---|---|---|
| **Critical** | Fix immediately — update, patch, or replace | Same day |
| **High** | Fix urgently — update or assess exploitability | Within 1 week |
| **Moderate** | Plan fix — next maintenance cycle | Within 1 month |
| **Low** | Track — update when convenient | Next major update |

### Fixing Vulnerabilities

```bash
npm audit fix                          # automatic
npm audit --json | jq '.vulnerabilities'  # identify affected package
npm update <package>                   # targeted update
# Transitive dependency? Use "overrides" in package.json
```

---

## Update Strategy

- **Patch** (x.x.PATCH): apply freely
- **Minor** (x.MINOR.x): apply after reading the changelog
- **Major** (MAJOR.x.x): plan and test — may break

```bash
npm outdated
npm update <package>
npm install <package>@latest   # new major
```

After updating: run the project's lint, build, and test commands; review the changelog for breaking changes.

---

## Lockfile Hygiene

- `package-lock.json` is always committed
- Never delete the lockfile to "fix" installs — diagnose the root cause
- Never manually edit the lockfile
- Use `npm ci` in CI for reproducible installs
- Lockfile merge conflicts: resolve `package.json` first, then run `npm install`

---

## Hard Rules

- Never add a dependency without evaluating necessity, maintenance, size, and license
- Never use `*` or `latest` as a version range
- Never ignore critical or high severity audit findings
- Always commit the lockfile alongside manifest changes
- Always run tests after updating dependencies
- Always use `npm ci` in CI pipelines
- Never add a production dependency for a development-only tool
