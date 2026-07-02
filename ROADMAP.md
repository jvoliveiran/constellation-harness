# Constellation Harness — Improvement Roadmap

Backlog from the v0.5.1 harness evaluation (2026-06-10). Tier 1 (hard enforcement) was implemented in v0.6.0:
loop caps with user escalation, `guard-git.sh` PreToolUse hook, shell-less Code Reviewer, malformed-contract
rule, and the CI parity template. Tiers 2 and 3 below are documented for future iterations.

---

## Cross-Model Validation (opencode) — phased

Full design + verification: [`docs/spikes/multi-llm-validation.md`](docs/spikes/multi-llm-validation.md).

- **Phase 1 — code review at Gate 1**: ✅ built (commit `e57e8de`, opt-in, off by default).
  **A/B evaluation still pending** — recommended model is now the free-tier
  `google/gemini-3-flash-preview` (spike §17); waiting on Google auth in opencode.
- **Phase 2 — plan review**: ✅ built (2026-07-01, opt-in via `steps: ["plan-review"]`).
  Cross-model critique of the Architect's plan before branching; Architect adjudicates,
  disputes escalate. Live exercise pending on the same Google auth.
- **Phase 3 — ideas**: additional providers (DeepSeek/local via opencode), a `voting`
  merge mode (2-of-3), and metrics on cross-model agreement rate.

---

## Tier 2 — Close the SDLC loop

### 2.1 Post-PR phase (address review comments → merge → verify) — ✅ built (2026-07-02)
Post-PR re-entry (unresolved threads → classify → Engineer fixes → Lint → incremental
Gate 1 → push + thread replies), gate summary comment on every PR, Ship step with
`merge.policy: "auto-unless-blockers"` (clean-history PRs merge autonomously; blocker
history asks the user), post-merge verify, `/constellation:ship`. **Live end-to-end
exercise pending** (scratch-repo run per the plan's verification section).

### 2.2 Iteration review trigger (`/constellation:iterate <prd>`)
**Problem**: PRDs define a primary metric, threshold, and decision rule — but nothing operationalizes "the judgment period ended". The PM "re-enters when data arrives" only if the user remembers.
**Proposal**: `/constellation:iterate` command — PM loads the PRD, ingests the data the user provides (or instrumentation output), applies the decision rule, updates `roadmap.md` (Shipped section with the outcome) and the parking lot (fired triggers), and opens the next Discovery cycle.
**Done when**: a shipped PRD can be judged and the next cycle started with one command.

### 2.3 Metrics dashboard (`/constellation:metrics`) — ✅ built (2026-07-02)
Summarizes the JSONL (per-track counts, avg/max review loops, blockers by gate, lint-gate
catch rate, escalations, cross-model agreement, ship outcomes) with threshold-gated
signals; `/constellation:metrics ab` prints the spike §18 A/B table.

---

## Tier 3 — Robustness & operability

### 3.1 State validation on resume — ✅ built (2026-07-02)
`/constellation:resume` validates before trusting state: shape (required keys, known
track/step), branch existence, plan-file presence, `preFixSha` ancestry, PR freshness
(merged-outside-harness offers verify+cleanup). Failures offer archive-and-restart —
never resume from invalid state.

### 3.2 Harness self-test (`scripts/selftest.sh`) — ✅ built (2026-07-02)
Shell syntax, JSON validity, `claude plugin validate` (skips when CLI absent), gate-agent
↔ orchestrator contract-marker drift, config-template key coherence. Runs in this repo's
CI (`.github/workflows/selftest.yml`). Caught one real wrap-induced drift on first run.

### 3.3 Cost bounding for gate reviewers — deferred by design
Set `maxTurns` on code-reviewer/security-analyst **after** ~2 weeks of 2.3 metrics
establish the legitimate turn distribution (start at 15). Measuring before capping.

### 3.4 Versioned distribution — pending (needs a GitHub repo decision)
Push this repo to GitHub; cut releases with `claude plugin tag` (`<name>--v<version>`);
pin marketplace entries by `ref`/`sha`; install via `/plugin marketplace add
<owner>/constellation-harness`. Blocked only on choosing the owner/visibility.

### 3.5 Stronger secret-staging guard — ✅ built (2026-07-02)
`guard-git.sh` scans `git status --porcelain` on sweep staging (`git add -A`/`--all`/`.`)
and blocks when secret-pattern files would be included; optional gitleaks job added to the
CI template (commented block). Plus: **push gating** — while a workflow is mid-pipeline,
`git push` is blocked until the state reaches `devops-pr`/`post-pr`/`ship` (gates before
remote, mechanically; TDD checkpoint commits stay local).

### 3.6 Reviewer hardening, phase 2 — ✅ built (2026-07-02)
Security Analyst is shell-less (`tools: [Read, Grep, Glob]`); the orchestrator pre-runs
the dependency audit when the manifest/lockfile changed and pastes the output into the
prompt. The agent flags a missing audit as a 🟡 finding rather than skipping silently.

---

## Parked (no current need)

- Multi-workflow concurrency per project (worktree-isolated state files) — single-developer assumption holds for now
- Additional stack packs (Python, Go) — add when a project needs one
- Hook-enforced TDD checkpoint verification (commit message ↔ test-run evidence) — revisit if RED-gate discipline drifts
