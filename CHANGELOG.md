# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
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
