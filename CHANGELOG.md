# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Git guard: destructive-discard rules.** The PreToolUse guard now blocks
  work-discarding git commands — `git checkout -- <pathspec>` / `git checkout .`,
  worktree `git restore`, `git reset --hard`, and `git clean -f` — **while the
  target repo has uncommitted changes**. On a clean tree they pass (nothing to
  lose), and branch switches, `restore --staged` (unstage only), and `clean -n`
  dry runs stay allowed even when dirty. Closes the gap where a subagent's
  `git checkout -- .` could wipe a parallel peer's uncommitted work (the incident
  that forced a full docs-task redo). Selftest gains a dedicated fixture (check 10).
- **Orchestrator: checkpoint before Gate 2.** Both Gate 2 agents (SDET +
  Technical Writer) write files concurrently, so the orchestrator now requires a
  clean tree (checkpoint commit) before spawning the gate, and the parallel-
  execution rules state the no-discard policy the guard enforces mechanically.

## [0.14.1] - 2026-07-30

### Changed
- **Token-consumption trims (no behavior change).** Two edits cut context weight
  without altering the workflow:
  - **Scoped stack-skill loading.** The Architect, Software Engineer, Frontend
    Engineer, SDET, and Code Reviewer previously loaded *every* skill listed in
    `config.stack` on each spawn (a Node project's `typescript` + `nestjs` +
    `graphql` + `prisma-migrations` ≈ 11k tokens). They now load **only the
    skill(s) whose domain the diff/plan actually touches** — e.g. `graphql` only
    when resolver/schema files change, `prisma-migrations` only for data-model
    work — mirroring the already-scoped `security-analyst`. Largest per-spawn
    saving in the harness.
  - **De-duplicated gate output contracts.** The orchestrator's `Output
    Contracts` block restated the six gate contracts verbatim; each contract's
    canonical copy already lives in its agent file (which the selftest enforces).
    The orchestrator now references them by name in a compact table — the same
    reference-by-name pattern the planning contracts already use — shrinking the
    per-workflow orchestrator load by ~40 lines. Selftest contract-drift check
    still green.

## [0.14.0] - 2026-07-27

### Added
- **`/constellation:tasks` + task-spec convention.** Task specs — work items filed
  by other agents, tools, or humans before they become plans — now have a home
  (`.constellation/tasks/`, scaffolded by init with an `archive/`) and a
  lightweight front-matter convention (`status: inbox | refined | done | dropped`,
  optional `source:`, and a `plan:` field linking the plan a task was refined
  into) so listing them is mechanical instead of forensic. The new
  `/constellation:tasks` command mirrors `/constellation:plans`: a read-only
  table sorted inbox-first, with refined tasks showing their linked plan and the
  plan's own lifecycle status inline, plus actionable signals (inbox queue
  awaiting refinement, tasks whose plan completed, broken plan links). A new
  orchestrator **Task Lifecycle** section makes the flow part of the protocol:
  the ideal path is task → plan — the Architect flips the task to `refined` when
  the plan is written and to `done` when the plan completes; the Technical
  Writer archives `done`/`dropped` tasks in the same 30-day sweep as plans.

## [0.13.0] - 2026-07-17

### Added
- **Artifact hygiene — harness artifacts can no longer sit untracked.** Harness
  markdown (plans, improvements, spikes, ADRs, product docs) was accumulating
  unstaged because it is often born on the main branch — where the git guard
  blocks both `git commit` and `git push` — and the only commit rule fired inside
  a feature-branch workflow. Three layers close the gap:
  - **`sync-artifacts.sh`** (new template, scaffolded to
    `.constellation/scripts/`, re-copied on `--refresh`): a scoped artifact
    committer and the one sanctioned commit-on-main path. It stages
    `.constellation/` exclusively (the gitignored `state/` and `metrics/` stay
    out), refuses to run while unrelated changes are staged, and on the main
    branch pushes only when every commit ahead of upstream is provably
    artifact-only — so it can never smuggle code past the branch/PR workflow.
  - **Git guard: artifact-hygiene push rule** — `git push` is mechanically
    denied while the target repo has untracked or modified `.constellation`
    files, with the fix (stage into the workflow commit, or run
    `sync-artifacts.sh`) in the deny message. The commit-on-main denial now
    points at the script for artifact-only commits. `commit_target_dir()` was
    generalized to `git_target_dir(cmd, subcommand)` so the push rule checks
    the repo the push actually targets.
  - **SessionStart artifact check** — the bootstrap hook now reports uncommitted
    `.constellation` files at session start and prompts a sync (or a
    `/constellation:init --refresh` when the script is not yet installed).
- **Selftest §8/§9** — fixture tests for `sync-artifacts.sh` (commits artifacts
  only, respects the state/metrics gitignore, idempotent, refuses mixed staging)
  and for the guard's artifact-hygiene push rule (blocked while dirty, allowed
  once committed).

### Changed
- **Orchestrator: branchless tracks now commit their artifacts.** Spike findings
  and Discovery product artifacts end with a `sync-artifacts.sh` run instead of
  being left untracked; DX improvement files filed outside a workflow get the
  same treatment. New Mandatory Workflow Rule 13 (artifact hygiene) and a
  matching "never do" entry; Rule 9 documents the sanctioned artifact-commit
  exception.
- **`/constellation:init`** scaffolds `scripts/sync-artifacts.sh` and finishes by
  actually committing the scaffold with it, instead of merely suggesting a
  commit.
- **git-commit skill**: harness artifacts created during the workflow are
  explicitly part of the final `git add -A` sweep — never unstaged.

## [0.12.1] - 2026-07-10

### Fixed
- **Git guard: anchor rules to the subcommand position** (#2) — the guard rules
  matched `git[^|;&]*\bSUB\b`, whose `[^|;&]*` greedily consumed everything between
  `git` and the keyword, so `commit`/`push`/`add` matched *anywhere* in a command
  (inside branch names, `-m` messages, paths) rather than only as the git subcommand —
  producing false denials such as blocking creation of a branch named
  `docs/002-record-merge-commit`. A shared `GIT_SUB` anchor now consumes `git` plus its
  global options (`-C <path>`, `-c k=v`, `--paginate`, …) up to the subcommand, applied
  to all six rules; real `git commit`/`push` on main and secret-staging protection are
  unchanged.
- **Git guard: check the target repo's branch in the commit-on-main guard** (#3) — the
  commit rule always resolved the current branch against `CLAUDE_PROJECT_DIR` (the
  session project), so a `git commit` aimed at a *different* repo (via `git -C <dir>` or
  a leading `cd <dir>`) was judged against the session project's branch — wrongly
  blocking a commit to another repo's feature branch while the session project sat on
  `main`. A new `commit_target_dir()` resolves the repo the commit actually targets
  (honoring `git -C` and a leading `cd`, trusting only absolute paths), and the rule
  checks that repo's branch. Plain `git commit` and `-C`/`cd` commits targeting a repo
  on `main` are still blocked.

## [0.12.0] - 2026-07-08

### Added
- **`grafana-cloud` core skill** — Grafana Cloud as the observability backend for all
  projects, with Loki as the primary distributed-logging store. Covers the free-tier
  budget (metrics series, logs/traces ingest, retention) and its levers, the
  OpenTelemetry pipeline (OTLP direct to the cloud gateway by default, Grafana Alloy
  when host-level telemetry or centralized credentials are wanted), non-negotiable
  resource attributes (`service.name`, `deployment.environment.name`), the Loki
  labels-vs-structured-metadata cardinality rule, log↔trace↔metric correlation wiring,
  sampling/batching guardrails, baseline alerting (error rate, p95, telemetry absence),
  and dashboards/alerts as code via the Grafana Terraform provider. Complements the
  stack packs' app-level observability skills (which own *what* to log); the infra
  pack's `cloud-accessory-services` now points application observability at it.
- **`constellation-stack-infra` plugin (0.1.0)** — new opt-in infrastructure pack, the
  first stack pack to ship its own agent. **Cloud Architect**
  (`constellation-stack-infra:cloud-architect`, Fable with Opus fallback): deep AWS + OCI
  experience, architects cloud solutions as a catalog of reusable Terraform modules that
  engineers compose like building blocks (container runtime + database + secrets +
  certificates + DNS), with OCI Always Free as the default provider target. Four skills:
  `terraform-module-design` (one-capability modules, contract variables/outputs, git-ref
  semver pinning, example-driven testing), `terraform-environments` (directory-per-env
  roots, OCI Object Storage / S3 remote state, promotion by moving version pins, no
  workspaces-as-environments), `oci-container-platform` (the Lightsail equivalent at $0:
  Ampere A1 docker-host + containerized Postgres or Always Free Autonomous DB, with the
  free-tier budget and arm64/capacity/reclamation/user_data gotchas), and
  `cloud-accessory-services` (secrets via reference-not-value patterns, TLS via Caddy or
  managed certs, DNS, OCIR/ECR, backups, AWS↔OCI service mapping). The core plugin's
  orchestrator routing table, session-start policy, and Fable-fallback rule gain the new
  agent, conditional on the pack being enabled.

## [0.11.0] - 2026-07-06

### Added
- **DX Analyst agent (`dx-analyst`)** — a read-only, advisory Developer Experience
  reviewer focused on reducing overall app complexity: duplicated code, unnecessary
  dependencies, redundant env vars, clone-to-running setup friction, and over-complicated
  test strategies (heavy mocking of cross-app dependencies where a fake/contract test
  would be simpler). Runs in Parallel Gate 1 alongside Code Reviewer + Security Analyst
  (first pass only, never on fix passes, skipped on hotfixes) and **never blocks**:
  findings are persisted by the orchestrator as markdown improvement files in
  `.constellation/improvements/NNN-<slug>.md` (front-matter: status/category/effort/
  source/date) — a backlog picked up later as Tweaks or Planned Work. A malformed or
  failed DX return logs `dxSkipped` and the gate proceeds. `/constellation:init` now
  scaffolds `.constellation/improvements/`; state gains `gate1Results.dx`; gate metrics
  gain `dxImprovements`.

## [0.10.0] - 2026-07-04

### Added
- **`/constellation:plans`** — portfolio overview of all plans in `.constellation/plans/`
  in plan-number order: lifecycle status per plan (📝 draft / 👍 approved / 🔨
  in-progress / ✅ completed / 📦 archived with `--archived`), open-question counts on
  drafts, the in-flight plan flagged with its current workflow step, and actionable
  signals (blocked drafts, completed plans past the 30-day archive window). Read-only.

### Changed
- **All GitHub operations standardized on the gh CLI over HTTPS** — git remote operations
  (clone/push/pull) authenticate via gh's credential helper, never SSH keys or raw HTTP
  API calls, so `.constellation/config.json` → `github.account` reliably controls which
  account acts even with multiple gh accounts. github-remote skill gains a Transport
  preflight (SSH→HTTPS remote conversion, per-repo account pin via
  `git config credential.username <account>` so git pushes route to the configured
  account regardless of the machine's active gh account, `gh auth setup-git`,
  `gh config set git_protocol https`), a `Permission denied (publickey)` troubleshooting
  entry, and two hard rules (no SSH remotes, no direct `curl` to the GitHub API);
  `/constellation:init` asks which account to use when gh has several and offers the
  SSH→HTTPS conversion + pin; DevOps agent hard rules updated to match.
- **Code Reviewer and Software Architect default to Fable** (agent front-matter +
  orchestrator model heuristic for medium/large scopes), falling back to Opus when Fable
  is unavailable on the account (respawn once with `model: opus`, never downgrade
  further). Security Analyst and Product Manager stay on Opus; small-scope changes stay
  all-Sonnet. Cross-model docs now say "Claude reviewers" instead of "Opus reviewers".

## [0.9.0] - 2026-07-03

### Added
- **Workflow Progress HUD (ROADMAP 2.4)** — ambient visibility of which SDLC step is
  running and how far along the pipeline is. One canonical per-track step map
  (`templates/tracks.json`: ids, emojis, labels — copied to `.constellation/tracks.json`
  by init and re-copied on `--refresh`) rendered three ways: a one-line **Progress
  Banner** the orchestrator prints after every state save
  (`🌌 planned 6/10 │ 📐✓ 🔭✓ 🌿✓ 🔨✓ 🧹✓ ▶🔍 Review Gate · · · · │ feat/011-audit-log`),
  an opt-in **statusline renderer** (`templates/statusline.sh`, mechanical — reads the
  state file directly, silent when no workflow is running; init offers to wire it into
  `.claude/settings.json`), and a visual **`/constellation:status`** (banner + per-step
  table with gate verdicts). Fix loops render `🔁 loop N/3` anchored on the gate —
  progress never moves backward; optional steps (cross-model plan review) are filtered
  from the denominator per config; unknown step ids render `⚙️ <raw-id>` instead of
  failing. Plan: `docs/plans/001-workflow-progress-hud.md`.
- **`waitingOn` state field** — set to `"user"` whenever the workflow stops for a user
  decision (open questions, escalated blockers, loop caps, merge confirmation); banner
  and statusline render `⛔ awaiting your decision`. Foundation for ROADMAP 4.5 park
  semantics.
- **Selftest checks 6 & 7** — track-map drift (every step id the orchestrator saves
  exists in `tracks.json` and vice versa) and a statusline fixture render (exact HUD
  output for a known state; silence without a state file).

### Changed
- **Step ids normalized across all five tracks** — Tweak, Hotfix, Spike, and Discovery
  now have explicit `→ Save state` ids (`devops-branch`, `engineer`, `lint-gate`,
  `parallel-gate-1`/`review-gate`, `sdet`, `devops-pr`, `ship`;
  `architect-feasibility`; `findings`); spikes and discovery now save (and clean up)
  state like every other track. Fix loops keep `currentStep` on the gate step.
- `/constellation:resume` announces the resumed workflow with the Progress Banner and
  re-presents the pending question when `waitingOn: "user"`; the session-start
  unfinished-workflow notice reports state as the banner.

## [0.8.0] - 2026-07-03

### Added
- **`constellation-stack-service` boilerplate pack (0.1.0)** — opt-in skill pack for
  backends scaffolded from the `constellation-service` template, layered on top of
  `constellation-stack-node`. Three recipe skills: `add-domain-entity` (Prisma model →
  exemplar module layout → federation types → cursor pagination → audit wiring → tests,
  with a drift warning to mirror the repo's actual exemplar), `e2e-harness` (dockerized
  test infra on offset ports, `.env.test`, supertest GraphQL patterns, bearer-JWT auth in
  test mode, CI parity gotchas), and `terraform-deploy` (state bootstrap, the
  `skip_ecs_deployment` first-apply flow, ECR image push, `TF_VAR_app_secrets`,
  migrations-on-boot implications, destroy safety). Registered in `marketplace.json`;
  the boilerplate repo enables it by default alongside the node pack.

## [0.7.0] - 2026-07-02

### Added
- **Cross-model validation (opencode) — phase 1, opt-in, off by default.** When
  `crossModelValidation.enabled` is set, Gate 1 gains a third reviewer
  (`cross-model-reviewer`) that runs a second model family (e.g. GPT via the local
  `opencode` CLI) over the same diff. Blocking merge with escalate-on-unconfirmed
  (a cross-model-only blocker escalates to the user instead of auto-looping);
  infrastructure failures (opencode missing/slow/`model_not_found`/timeout) skip and
  proceed on the Opus reviews, never blocking delivery. Includes the
  `templates/opencode-review.sh` adapter (JSONL parse, temp-dir isolation, inlined diff,
  timeout→infra-skip), the `cross-model-reviewer` agent, orchestrator Gate 1 wiring +
  merge rules, a `crossModelValidation` config block, and `/constellation:init`
  scaffolding with a per-model live-probe. Design + verification in
  `docs/spikes/multi-llm-validation.md`.
- Multi-LLM validation design spike (`docs/spikes/multi-llm-validation.md`).
- **Cross-model validation phase 2 — plan review (opt-in).** Adding `"plan-review"` to
  `crossModelValidation.steps` runs a cross-model critique of the Architect's plan before
  branching (feasibility gaps, missed edge cases, risky assumptions). The Architect
  adjudicates each blocker: accepted → plan revised; disputed → escalates to the user via
  the existing open-questions flow (`onUnconfirmedBlocker`). Single critique pass, never
  re-critiqued; infra failures skip as usual. New `plan-review` mode in the
  `cross-model-reviewer` agent with a softer `Cross-Model Plan Review Result` contract
  (no file/line); orchestrator Planned Work step 1b + `planReviewResult` state +
  `plan-review` metrics. The opencode adapter needed no changes (content-agnostic).

- **Closed SDLC loop — post-PR phase + Ship step (ROADMAP 2.1).** Every PR now gets a
  structured **gate summary comment** (per-reviewer verdicts, blockers found→fixed, loops,
  escalations). Human review comments re-enter the workflow: unresolved threads are
  fetched (GraphQL), change requests loop Engineer → Lint Gate → incremental Gate 1 →
  push + per-thread replies + thread resolution; question comments escalate to the user.
  New **Ship step**: `merge.policy: "auto-unless-blockers"` (default) squash-merges
  autonomously when CI is green, threads are resolved, and the review history had no 🔴
  blocker — otherwise asks the user (`"always-ask"` available). Post-merge verify runs
  the configured build+test on main (never auto-reverts). New `/constellation:ship`
  command, `hadBlockers`/`prNumber` state fields, `pr-comments-addressed` and
  `workflow-shipped` metrics events; github-remote skill gains comment read/write,
  thread resolution, checks watching, and squash-merge operations.
- **`review.fixPolicy`** — `"blockers"` (default) | `"blockers+suggestions"` (suggestions
  join the first fix pass only; a suggestions-only pass never increments the loop
  counter). **Nit piggyback rule**: nits are mandatory in the fix list when the first
  Gate 1 pass had any blocker/suggestion, otherwise Engineer's discretion — nits never
  trigger or block a loop.

- **Mechanical gate enforcement (ROADMAP 3.5 + 3.6 + push gating).** `guard-git.sh` now
  (a) blocks `git push` while a workflow is mid-pipeline — allowed only at
  `devops-pr`/`post-pr`/`ship` steps, so gates are enforced before anything reaches the
  remote (TDD checkpoint commits remain local; fail-open on unreadable state); (b) scans
  `git status --porcelain` on sweep staging (`git add -A`/`--all`/`.`) and blocks when
  secret-pattern files would be swept in. CI template gains an optional gitleaks job.
  Security Analyst is now shell-less (`tools: [Read, Grep, Glob]`) — the orchestrator
  pre-runs the dependency audit and supplies the output in the prompt.

- **Operability & robustness (ROADMAP 2.3, 3.1, 3.2).** `/constellation:metrics` turns
  `workflow-log.jsonl` into a decision-ready report with threshold-gated signals (plus an
  `ab` mode printing the spike §18 A/B table). `/constellation:resume` now validates
  state before trusting it (shape, branch existence, plan presence, `preFixSha`
  ancestry, PR freshness) and offers archive-and-restart on failure. New
  `scripts/selftest.sh` (shell syntax, JSON validity, plugin validation, gate-agent ↔
  orchestrator contract-drift check, config-template coherence) wired into this repo's
  CI via `.github/workflows/selftest.yml`.

### Changed
- Cross-model validation: recommended/default model switched from `openai/gpt-5.2-codex`
  to the free-tier `google/gemini-3-flash-preview` (Google AI Studio, no card, ~1,500
  req/day) — config template, wrapper fallback, init guidance, and spike updated; free
  alternatives (opencode Zen, OpenRouter `:free`, local) documented in the spike's §17
- README installation section reworked: added a **Prerequisites** subsection (`jq` for the git-guard hook, authenticated `gh`), an explicit "install once per machine / enable + init once per repo" scoping note, copy-paste `enabledPlugins` examples for backend vs. frontend repos, and clarified that `/constellation:init` auto-detects `config.stack`

## [0.6.0] - 2026-06-11

### Added
- `guard-git.sh` PreToolUse hook — mechanically blocks commits/pushes to the main branch, `--no-verify`, and staging of `.env`/credential files (active only in initialized projects)
- CI parity template (`templates/github-actions-ci.yml`) — `/constellation:init` offers to install a workflow mirroring the Lint Gate; recommend branch protection
- ROADMAP.md documenting Tier 2 (close the SDLC loop) and Tier 3 (robustness) improvements

### Changed
- All fix loops capped at 3 (lint gate retries, review-gate loops) — beyond that the orchestrator escalates to the user instead of looping indefinitely
- Malformed gate contracts (no parsable VERDICT) are re-requested once, then treated as BLOCKED — never as a pass
- Code Reviewer hardened: no Bash (`tools: [Read, Grep, Glob]`) — the orchestrator supplies the diff in the prompt

## [0.5.1] - 2026-06-10

### Changed
- PM × Architect pairing refined: the Architect can now propose product ideas, suggestions, and recommendations (new `PRODUCT_SUGGESTIONS` field in the Feasibility contract), but the PM leads product scope — every suggestion is triaged (scope / park / drop) like any other idea

## [0.5.0] - 2026-06-10

### Added
- `product-manager` agent (Opus) — Minimum Lovable Product mentality: value-loop scoping, ideas parking lot with revisit triggers, PRDs with BDD acceptance criteria and data plans, Now/Next/Later roadmaps
- **Discovery track** — PM-led brainstorm → narrow → PRD/roadmap pipeline with no branch/code/gates
- **PM × Architect pairing** for product-scoped Planned Work — bounded convergence loop (max 3 rounds) with axis ownership (PM: scope, Architect: feasibility); plans approved only with both signatures (`scope-approved-by`)
- `/constellation:init` now scaffolds `.constellation/product/` (prds/, roadmap.md, parking-lot.md) with templates

### Changed
- Routing split: product brainstorms/WHAT-to-build → product-manager; technical brainstorms/HOW-to-build → software-architect
- Architect gained a feasibility-review contract and MLP alignment rules (no gold-plating, flag disproportionate scope as parking-lot candidates)

## [0.4.1] - 2026-06-10

### Changed
- `tdd-workflow` skill enriched from the ECC tdd-guide: mandatory edge-case checklist (incl. race conditions, large data, special characters), weak-assertion anti-pattern, and a pre-handoff quality checklist. Deliberately not ported: integration/E2E scope, prompt-defense boilerplate, eval-driven addendum, and the standalone TDD agent (TDD is enforced inside the engineer agents instead).

## [0.4.0] - 2026-06-10

### Added
- `tdd-workflow` skill (core) — RED → GREEN → REFACTOR unit-level TDD with validated RED gate, checkpoint commits, and coverage verification (adapted from the ECC tdd-workflow skill, minus integration/E2E scope which belongs to SDET in Gate 2)

### Changed
- `software-engineer` and `frontend-engineer` now enforce TDD as their core development workflow (skill preloaded, RED-before-code hard limit)
- `git-commit` skill reconciled with TDD checkpoint commits: checkpoints stay on the branch, one final consolidating commit, squash happens at PR merge
- Orchestrator mandatory rules now include the TDD requirement for both engineers

## [0.3.0] - 2026-06-10

### Added
- `ui-ux-designer` agent (Opus) — design-led frontend specialist for dashboards and landing pages, extracted from guardei-ui and improved: project-convention-first stack selection, design rationale persisted to `.constellation/designs/`, workflow-gate integration, clarified division of labor with `frontend-engineer`
- `/constellation:init` now scaffolds `.constellation/designs/`

## [0.2.0] - 2026-06-10

### Added
- `frontend-engineer` agent in the core plugin — senior frontend persona (component architecture, state management, accessibility, design quality), extracted from the guardei-ui `.agentic` workflow
- `constellation-stack-frontend` skill pack with the `frontend-design` skill (distinctive, production-grade UI aesthetics)
- Orchestrator routing: engineer selection by project stack (frontend vs backend)

## [0.1.0] - 2026-06-10

### Added
- `constellation` core plugin extracted from the `.agentic` workflow system:
  - Orchestrator skill (workflow tracks, lint gate, parallel review/QA gates, state persistence, metrics, plan lifecycle, review memory)
  - 7 native subagents: software-architect, software-engineer, code-reviewer, security-analyst, sdet, devops-engineer, technical-writer
  - Commands: `/constellation:init`, `/constellation:status`, `/constellation:dry-run`, `/constellation:abort`, `/constellation:resume`, `/constellation:skip-gate`
  - SessionStart hook that activates the orchestrator only in `/constellation:init`-ed projects
  - Generic skills: git-commit, branching-strategy, release-notes, dependency-management, github-remote
- `constellation-stack-node` skill pack: typescript, nestjs, graphql, graphql-federation, prisma-migrations, observability, error-handling, security-checklist, schema-compatibility
