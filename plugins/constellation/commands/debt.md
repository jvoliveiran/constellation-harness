---
description: List every code-metrics budget violation in the project — including the ones hidden behind baseline suppressions — by re-running ESLint with inline directives ignored and dependency-cruiser without its known-violations filter, tagged baselined vs new.
argument-hint: "[--new to show only non-baselined violations]"
---

# /constellation:debt

Read-only inventory of the project's code-metrics debt. Never modifies code, configs, improvements, state, or metrics.

Adopted projects enforce the `code-metrics` budgets at the Lint Gate, but baselined pre-existing violations are suppressed inline and therefore invisible to a normal `npm run lint`. This command makes the whole debt visible again: it re-runs the linters in "ignore suppressions" mode, filters to the six budget rules, and tags each finding as 🧾 baselined (tracked debt) or 🆕 new (should not exist — the gate would catch it on the next change).

## Preconditions

1. `.constellation/config.json` must exist. Missing → report "Not a Constellation-initialized project — run /constellation:init first." and stop.
2. The project must have adopted the code-metrics budgets: its ESLint config declares at least one of the six budget rules (`max-params`, `max-lines-per-function`, `max-lines`, `complexity`, `max-depth`, `sonarjs/cognitive-complexity`). Not adopted → report "code-metrics budgets are not adopted here — there is nothing to inventory. Adopt them per the `constellation:code-metrics` skill (a dedicated tweak, never bolted onto a feature branch)." and stop.

## Procedure

1. **Determine the ESLint invocation** from the project's existing lint script in `package.json` (strip any `--fix` and any chained `depcruise` step; for Next.js projects use `npx next lint -- <flags>`). Re-run it with `--no-inline-config --format json`, writing the JSON to a scratch file — never to the repo.
2. **Filter to the six budget rules only.** `--no-inline-config` resurrects every suppressed rule in the project, including ones unrelated to code metrics — discard all findings whose `ruleId` is not one of the six. Never report non-metric rules here.
3. **dependency-cruiser** (only if `.dependency-cruiser.cjs` exists): run `npx depcruise <src> --output-type json` WITHOUT `--ignore-known`, so known-violations baselines resurface. Collect rule name, from, to per violation.
4. **Tag each finding.** A finding is 🧾 **baselined** when a suppression comment containing `baseline: pre-existing at code-metrics adoption` exists at/above the reported line (ESLint), or when the violation appears in `.dependency-cruiser-known-violations.json` (dependency-cruiser). Everything else is 🆕 **new**.
5. **Cross-reference tracking**: if `.constellation/improvements/` contains a code-metrics baseline improvement, note its path and status; flag any 🧾 finding NOT listed in it as `⚠️ untracked baseline`.
6. With `--new`, drop the 🧾 rows from the table (keep them in the totals line).

## Output

```
## Code-Metrics Debt — <project>

| File:Line | Rule | Status |
|---|---|---|
| src/users/users.service.ts:214 | max-lines-per-function | 🧾 baselined |
| src/auth/auth.resolver.ts:31 | max-params | 🆕 new |
…

**Totals**: N violations — N baselined, N new. Per rule: max-params N, max-lines-per-function N, …
**dependency-cruiser**: N violations (N known/baselined, N new) — or "clean".
**Tracked in**: .constellation/improvements/NNN-….md (status) — or "⚠️ no baseline improvement on file".
```

Close with at most three signals, only when true:
- 🆕 violations exist → "New violations predate no one — they slipped past the gate or were written before adoption of rule X; fix or justify them now, they will fail the next Lint Gate that touches those files."
- The baseline improvement is missing or out of sync with the 🧾 set → name the delta.
- A single file or module concentrates ≥ 5 findings → name it as the highest-leverage refactor target.

## Hard rules

- Read-only: run linters with output to stdout/scratch only; never write, fix, or commit anything in the project.
- `--no-inline-config` output is an inventory, not a gate result — never present it as the Lint Gate failing.
- Filter strictly to the six budget rules; unrelated resurrected rules are out of scope.
