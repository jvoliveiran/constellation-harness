# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
