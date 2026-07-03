# Constellation Harness — Improvement Roadmap

Backlog from the v0.5.1 harness evaluation (2026-06-10). Tier 1 (hard enforcement) was implemented in v0.6.0:
loop caps with user escalation, `guard-git.sh` PreToolUse hook, shell-less Code Reviewer, malformed-contract
rule, and the CI parity template. Tiers 2–4 below are documented for future iterations;
Tier 4 comes from the end-to-end autonomy gap analysis (2026-07-02).

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

### 2.4 Workflow Progress HUD — ✅ built (2026-07-03)
Plan: [`docs/plans/001-workflow-progress-hud.md`](docs/plans/001-workflow-progress-hud.md).
One canonical step map (`templates/tracks.json`, copied to `.constellation/tracks.json`)
rendered three ways: Progress Banner after every state save, opt-in `statusline.sh`
(mechanical HUD wired by init), and a visual `/constellation:status`. Step ids normalized
across all five tracks; new `waitingOn` state field renders `⛔ awaiting your decision`
(foundation for 4.5 park semantics); selftest checks 6 (track-map drift) and 7
(statusline fixture render).

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

### 3.4 Versioned distribution — ✅ built (2026-07-02)
Repo published to `jvoliveiran/constellation-harness`; releases tagged
`constellation--v<version>` (first: `constellation--v0.7.0`); install via
`/plugin marketplace add jvoliveiran/constellation-harness`.

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

## Tier 4 — End-to-end autonomy (happy path)

From the SDLC gap analysis (2026-07-02): the harness is fully autonomous from classified
request to merged PR, but autonomy breaks at intake (live prompt only), at mid-pipeline
seams (CI failure, session death, blocker-history merges, unattended escalations), and at
exit (nothing after merge). Ordered by leverage.

### 4.1 Plan-driven entry point (`/constellation:run <plan>`)
**Problem**: work only enters via a live conversational prompt. An approved plan in `.constellation/plans/` (or a Discovery PRD the Architect already signed) cannot start a workflow by itself — a human must re-describe the work, and ambiguous requests trigger the "tweak or plan?" question, which is fatal unattended.
**Proposal**: `/constellation:run <plan-file>` starts the Planned Work track directly from an approved plan — the plan *is* the classification, so planning and track questions are skipped; the workflow enters at the DevOps branch step. Reject `draft` plans with the open questions listed. Discovery output gains a pointer: "run with `/constellation:run <plan>`".
**Done when**: an approved plan executes to PR with zero conversational input beyond the command.

### 4.2 CI-failure self-heal loop at Ship
**Problem**: the Ship step waits on `gh pr checks --watch` but only the green path is specified — on red, DevOps "reports and stops". The lint gate already has the exact loop shape needed (errors → Engineer → re-run, capped at 3), but CI red strands the workflow instead of reusing it.
**Proposal**: on CI failure, fetch the failing job log (`gh run view --log-failed`), hand the errors to the Engineer, re-run Lint Gate, push, re-watch. Same 3-retry cap and user escalation as the lint gate. Log `{ event: "ci-fail-loop", attempt: N }`.
**Done when**: a flaky-test or env-drift CI red heals without human input, and a persistent red escalates with the failing log after 3 attempts.

### 4.3 Merge policy judges the final gate pass, not blocker history
**Problem**: `hadBlockers: true` disables auto-merge even when the blocker was fixed in loop 1 and the final Gate 1 pass was clean. One review loop is the *normal* case, so most real workflows end at a human merge prompt — the autonomy the Ship step promises rarely fires.
**Proposal**: add `merge.policy: "auto-unless-unresolved"` — auto-merge when the **final** gate pass was clean and `reviewLoopCount <= 2`; ask only when blockers survived to escalation, a gate was skipped, or loops hit the cap. Keep `"auto-unless-blockers"` and `"always-ask"` for conservative repos. Gate summary comment still records the full blocker history either way.
**Done when**: a workflow with one fixed-and-re-reviewed blocker merges autonomously; a workflow with a skipped gate or surviving blocker still asks.

### 4.4 Auto-resume from valid state
**Problem**: state survives session death on disk, but `session-start.sh` only *offers* `/constellation:resume` — an interrupted workflow stays in limbo until a human returns and types it. Long workflows will outlive sessions.
**Proposal**: opt-in `resume.policy: "auto"` in config — at session start, if the state file passes the 3.1 validation, resume from `currentStep` automatically (announce what is being resumed and why); invalid state falls back to today's report-and-offer. Default stays `"ask"`.
**Done when**: killing a session mid-Gate-1 and starting a new one continues the workflow with no human input, in a repo that opted in.

### 4.5 Escalation notifications + park semantics
**Problem**: every escalation (loop caps, schema breaks, CI red after retries, post-merge failure) is "present to the user and wait" — unattended, that is a silent hang with no signal that a decision is needed.
**Proposal**: a `notify` config hook (shell command template, e.g. Slack webhook / `gh issue comment` / mail) the orchestrator invokes on every escalation with a one-line summary + the state file path. On escalation the workflow is **parked**: state saved with `currentStep: "escalated"` and the pending question embedded, so `/constellation:resume` (or 4.4 auto-resume) re-presents the question and continues once answered.
**Done when**: an unattended run that hits a loop cap produces an external notification, and answering the question in a later session resumes the pipeline where it stopped.

### 4.6 Post-merge extension: release → deploy → smoke (config-gated)
**Problem**: the SDLC ends at "merged + build/test on main". No target-project version/tag/release, no deploy, and nothing ever *runs* the app — a feature can ship having never executed once end-to-end.
**Proposal**: three optional config commands, each skipped when null: `commands.release` (version bump + tag + GitHub release, fed by the CHANGELOG entry), `commands.deploy` (project-owned script/CI dispatch), `commands.smoke` (post-deploy health check). DevOps runs them in order after post-merge verify; smoke failure alerts with rollback guidance (never auto-rollback, consistent with the post-merge rule). Log `{ event: "workflow-deployed", smoke: "pass"|"fail" }`.
**Done when**: a repo with all three configured goes request → merged → tagged → deployed → smoke-verified with no human input on the happy path.

### 4.7 Assumption mode for plan open questions (opt-in)
**Problem**: any open question hard-blocks the pipeline (Engineer refuses `draft` plans; PM×Architect non-convergence and cross-model plan disputes escalate). Correct interactively, but a full stop unattended even for low-stakes questions.
**Proposal**: opt-in `planning.onOpenQuestions: "assume"` — the Architect resolves each open question with the most reversible default, records an **Assumptions** section in the plan, marks it `approved-with-assumptions`, and the PR description lists them prominently. High-stakes categories (schema breaks, auth, data deletion) always escalate regardless.
**Done when**: a plan with one low-stakes open question reaches PR unattended with the assumption documented in plan + PR.

### 4.8 Environment preflight before Engineer starts
**Problem**: no agent owns environment setup — the Engineer merely "confirms dependencies are available". A fresh clone or lockfile change fails into the lint-gate escalation path for something entirely self-fixable.
**Proposal**: DevOps branch step gains a preflight: install dependencies (`npm ci` or detected equivalent), verify the toolchain (node version vs `engines`/`.nvmrc`), and run a no-op lint to prove the env works — fix or escalate *before* any code is written. Log `{ event: "preflight", result: "pass"|"fixed"|"fail" }`.
**Done when**: a workflow started on a fresh clone reaches the Engineer with a working environment, without burning lint-gate retries on setup issues.

### 4.9 Mechanical gate-completion guard before PR
**Problem**: only git safety and push-gating are mechanically enforced; gate invocation, state saving, and loop counting are prompt-level. Over long autonomous runs the model may drift — nothing physically stops a PR whose gates never ran.
**Proposal**: extend `guard-git.sh`'s existing step check — block `gh pr create` (and the push at `devops-pr`) unless the state file records `gate1Results` and, for planned work, `gate2Results`. Same deny-message pattern as push gating; `/constellation:skip-gate` already writes the skip into state, so legitimate skips pass.
**Done when**: deleting `gate1Results` from a mid-workflow state file makes PR creation mechanically fail with a clear message.

---

## Parked (no current need)

- Multi-workflow concurrency per project (worktree-isolated state files) — single-developer assumption holds for now
- Additional stack packs (Python, Go) — add when a project needs one
- Hook-enforced TDD checkpoint verification (commit message ↔ test-run evidence) — revisit if RED-gate discipline drifts
