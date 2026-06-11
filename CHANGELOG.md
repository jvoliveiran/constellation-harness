# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
