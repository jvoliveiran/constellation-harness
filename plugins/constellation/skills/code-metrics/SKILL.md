---
name: code-metrics
description: Numeric code-quality budgets (function/file size, params, complexity) enforced mechanically at the Lint Gate, plus structural boundary rules via dependency-cruiser and the exception-audit policy. Loaded by the engineer agents when writing code and referenced by the Code Reviewer when auditing suppressions.
---

# Code Metrics & Boundaries

Numeric budgets against the failure modes agent-written code drifts toward: god classes, long complex functions, files with no separation of concerns. The budgets live here; the **enforcement lives in the project's linter**, wired into `commands.lint` and run by the Lint Gate — rules in prompts drift, rules in gates hold.

## The Budgets

| Metric | Budget | ESLint rule |
|---|---|---|
| Function parameters | ≤ 3 | `max-params` |
| Function length | ≤ 50 lines (excl. blanks/comments) | `max-lines-per-function` |
| File length | ≤ 300 lines (excl. blanks/comments) | `max-lines` |
| Cyclomatic complexity | ≤ 10 | `complexity` |
| Cognitive complexity | ≤ 15 | `sonarjs/cognitive-complexity` |
| Nesting depth | ≤ 4 | `max-depth` |

All budgets are **errors, not warnings** — the Lint Gate treats a violation like any other lint failure. These are starting values, deliberately achievable; tighten per project once a baseline holds (record the decision in an ADR).

Design toward the budgets from the start — more than 3 parameters wants an options object with a named type; a function crossing 50 lines wants extraction *at a meaningful seam*, not shredding into fragments to satisfy the linter; a file crossing 300 lines is mixing concerns and wants a module split.

## ESLint Configuration (reference)

The config belongs to the target project. Flat-config layer to merge into `eslint.config.mjs`:

```js
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  {
    plugins: { sonarjs },
    rules: {
      'max-params': ['error', 3],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
  // React/JSX components may relax function length to 80 — markup inflates line
  // counts without inflating complexity. Complexity budgets stay unchanged.
  {
    files: ['**/*.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  // Test files: length budgets off — a thorough describe block is not a god function.
  // MUST be the last override: for a *.test.tsx file the last matching entry wins per
  // rule, so placing this before the *.tsx entry would re-enable the budget on tests.
  {
    files: ['**/*.test.*', '**/*.spec.*', '**/*.e2e-spec.*'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  },
];
```

## Boundary Rules (dependency-cruiser)

Size limits catch bloated units; **dependency-cruiser** catches the structural half — cross-boundary dependencies on concretions. Reference `.dependency-cruiser.cjs`, with path patterns adapted to the project layout in `.constellation/project-map.md`:

```js
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Circular dependencies are undeclared god modules',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-not-to-infrastructure',
      comment: 'Business logic depends on contracts, never on infrastructure concretions',
      severity: 'error',
      from: { path: '^src/[^/]+/(domain|services)/' },
      to: { path: '^src/(infra|database|prisma|clients)/' },
    },
    {
      name: 'no-cross-module-internals',
      comment: "Modules use each other's public surface (service/module), not internals",
      severity: 'error',
      from: { path: '^src/([^/]+)/' },
      to: {
        path: '^src/([^/]+)/.+\\.(repository|dto|entity)\\.',
        pathNot: '^src/$1/',
      },
    },
  ],
};
```

Wire it into the lint command so the Lint Gate runs it, e.g. `"lint": "eslint . && depcruise src"`.

## Contracts at Boundaries — Not Everywhere

The goal behind "depend on abstractions" is **no cross-boundary dependency on concretions** — not an interface for every class:

- **Require a named contract** (a `type`, or an abstract class where the DI container needs a runtime token) at: repository boundaries, external SDK/API adapters, and anything one module exposes for another to consume.
- **Do not** wrap single-implementation, module-internal collaborators in contracts — that is indirection without decoupling, and the DX Analyst will flag it as complexity.

## Exceptions — Visible and Justified

There are legitimate reasons to exceed a budget. The escape hatch is an inline suppression that is **narrow, named, and justified**:

```typescript
// eslint-disable-next-line max-lines-per-function -- exhaustive mapper over the 14 webhook event types; splitting would scatter one decision across files
export function mapWebhookEvent(event: WebhookEvent): DomainEvent {
```

- Narrowest scope only: `eslint-disable-next-line` with the specific rule — never file-level disables, never blanket `eslint-disable`
- The `--` justification is **required** and must state the reason, not restate the rule
- dependency-cruiser exceptions are rule-scoped entries in the config file with a comment, same standard
- **The Code Reviewer audits every suppression in the diff**: a metric suppression with no justification, or a justification the change context does not support, is a 🔴 blocker

## Adoption

Enforcement requires the rules in the target project's lint setup. When a project's `commands.lint` does not yet carry these rules, the engineer still designs within the budgets (they are hard limits on new code regardless), and the gap is filed as an improvement (`.constellation/improvements/`) or a tweak to adopt the config — **do not** bolt the lint config onto an unrelated feature branch. On adoption in a legacy codebase, baseline pragmatically: apply the rules to changed files first rather than mass-suppressing existing violations.
