# Constellation Harness — Improvement Roadmap

Backlog from the v0.5.1 harness evaluation (2026-06-10). Tier 1 (hard enforcement) was implemented in v0.6.0:
loop caps with user escalation, `guard-git.sh` PreToolUse hook, shell-less Code Reviewer, malformed-contract
rule, and the CI parity template. Tiers 2 and 3 below are documented for future iterations.

---

## Tier 2 — Close the SDLC loop

### 2.1 Post-PR phase (address review comments → merge → verify)
**Problem**: the workflow ends at "PR created". Human review comments, merge, and post-merge verification have no flow.
**Proposal**: a re-entry path in the orchestrator — `gh pr view --comments` → Engineer implements fixes (TDD) → Lint Gate → re-trigger Gate 1 with the fix delta → push. Optionally a `/constellation:ship` command that merges (squash) after CI is green and verifies the main branch builds post-merge.
**Done when**: a PR with human comments can be driven to merged + verified entirely through the harness.

### 2.2 Iteration review trigger (`/constellation:iterate <prd>`)
**Problem**: PRDs define a primary metric, threshold, and decision rule — but nothing operationalizes "the judgment period ended". The PM "re-enters when data arrives" only if the user remembers.
**Proposal**: `/constellation:iterate` command — PM loads the PRD, ingests the data the user provides (or instrumentation output), applies the decision rule, updates `roadmap.md` (Shipped section with the outcome) and the parking lot (fired triggers), and opens the next Discovery cycle.
**Done when**: a shipped PRD can be judged and the next cycle started with one command.

### 2.3 Metrics dashboard (`/constellation:metrics`)
**Problem**: `workflow-log.jsonl` is write-only — the harness never learns from its own telemetry.
**Proposal**: a command that summarizes the log: workflows per track, average review loops, blocker counts by gate, lint-gate catch rate, escalations. Surface actionable signals (e.g., "Gate 1 averages 2.8 loops — review the engineer skills or the review-patterns memory").
**Done when**: one command turns the JSONL into a decision-ready summary.

---

## Tier 3 — Robustness & operability

### 3.1 State validation on resume
**Problem**: `/constellation:resume` trusts `current-workflow.json` blindly.
**Proposal**: validate shape (required keys, known `currentStep`) and freshness before resuming — branch still exists and is checked out, plan file still present, HEAD consistent with `preFixSha` when set. Offer cleanup for stale state.

### 3.2 Harness self-test (`scripts/selftest.sh`)
**Problem**: the harness has no tests for itself; contract drift between agent files and the orchestrator is the most likely silent failure.
**Proposal**: a script that runs `bash -n` on all scripts, `jq empty` on all JSON, `claude plugin validate` on the marketplace and every plugin, and greps that each gate agent's output contract section matches the orchestrator's expected contract markers (VERDICT/BLOCKERS/etc.). Run it in this repo's CI on every push.

### 3.3 Cost bounding for gate reviewers
**Problem**: gate reviewers have no turn limit; a confused Opus reviewer exploring the repo is the most expensive failure mode.
**Proposal**: `maxTurns: 15` frontmatter on code-reviewer and security-analyst (legitimate reviews fit comfortably); measure first via 2.3 metrics if unsure.

### 3.4 Versioned distribution
**Problem**: the marketplace is a local path — installs track whatever is on disk.
**Proposal**: push this repo to GitHub; cut releases with `claude plugin tag` (`<name>--v<version>`); pin marketplace entries by `ref`/`sha`; install via `/plugin marketplace add <owner>/constellation-harness`. Any machine then gets reproducible, versioned installs.

### 3.5 Stronger secret-staging guard
**Problem**: `guard-git.sh` blocks `git add` of named secret files, but `git add -A` can sweep secrets in without naming them.
**Proposal**: on `git add -A`/`git add .`, run a quick `git status --porcelain` scan for secret-pattern files before allowing; or integrate a lightweight secret scanner (e.g. gitleaks) in the CI template.

### 3.6 Reviewer hardening, phase 2
**Problem**: Security Analyst still has Bash (needed for `npm audit`).
**Proposal**: investigate agent-scoped PreToolUse hooks (or a `bin/audit-only` wrapper) so its shell is limited to audit commands; alternatively pre-run the audit in the orchestrator and pass results in the prompt, dropping Bash like the Code Reviewer.

---

## Parked (no current need)

- Multi-workflow concurrency per project (worktree-isolated state files) — single-developer assumption holds for now
- Additional stack packs (Python, Go) — add when a project needs one
- Hook-enforced TDD checkpoint verification (commit message ↔ test-run evidence) — revisit if RED-gate discipline drifts
