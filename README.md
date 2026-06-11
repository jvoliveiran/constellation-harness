# Constellation Harness

A multi-agent software delivery workflow for [Claude Code](https://code.claude.com), packaged as plugins. An orchestrator classifies every request, routes it through specialist persona agents (architect → engineer → parallel reviewers → SDET/writer → devops), and enforces quality gates, workflow state, and review memory along the way.

Extracted from a markdown-based `.agentic` workflow system and reworked to use native Claude Code plugin primitives: subagents, skills, commands, and hooks.

---

## Repository Layout

```
constellation-harness/                 (plugin marketplace)
├── .claude-plugin/marketplace.json
└── plugins/
    ├── constellation/                 CORE — universal harness
    │   ├── agents/                    10 persona subagents
    │   ├── commands/                  /constellation:* workflow commands
    │   ├── skills/                    orchestrator + generic delivery skills
    │   ├── templates/                 files scaffolded by /constellation:init
    │   ├── hooks/ + scripts/          SessionStart activation (gated per project)
    │   └── .claude-plugin/plugin.json
    ├── constellation-stack-node/      OPT-IN — Node/NestJS/GraphQL/Prisma skills
    │   ├── skills/
    │   └── .claude-plugin/plugin.json
    └── constellation-stack-frontend/  OPT-IN — frontend design skills
        ├── skills/
        └── .claude-plugin/plugin.json
```

---

## Installation

```
# 1. Add the marketplace (local path or GitHub once published)
/plugin marketplace add /path/to/constellation-harness
# or: /plugin marketplace add <github-owner>/constellation-harness

# 2. Install the core harness
/plugin install constellation@constellation

# 3. (Node/NestJS/GraphQL/Prisma projects) install the backend stack pack
/plugin install constellation-stack-node@constellation

# 4. (Web UI projects) install the frontend stack pack
/plugin install constellation-stack-frontend@constellation
```

### Per-project activation (two gates)

The harness never takes over sessions globally:

1. **Plugin enablement** — installing makes the plugins available, but you choose the scope: enable them per project in the project's `.claude/settings.json` (`enabledPlugins`), or user-wide if you prefer.
2. **Project initialization** — even when enabled, the SessionStart hook stays **silent** until the project contains `.constellation/config.json`. Run `/constellation:init` once per project to opt in.

A project without `.constellation/` behaves exactly like vanilla Claude Code.

---

## Onboarding a Project

```
/constellation:init
```

Scans the project and generates:

```
.constellation/
├── config.json          lint/build/test commands, branching, GitHub account, stack skills
├── project-map.md       generated codebase map (agents read this instead of exploring blind)
├── memory/review-patterns.md   recurring review blockers (self-learning)
├── plans/ (+archive/)   implementation plans
├── spikes/  adrs/       research docs and decision records
├── state/  metrics/     workflow resume state + JSONL telemetry (gitignored)
└── .gitignore
```

Commit `.constellation/` (state/metrics are gitignored) so teammates share the configuration. Re-run with `--refresh` to regenerate the project map.

---

## How It Works

```
User Request
     │
     ▼
SessionStart hook → injects compact routing policy (only in initialized projects)
     │
     ▼
Orchestrator (constellation:orchestrator skill)
     ├── classifies the request → workflow track
     ├── selects models by change complexity
     ├── saves/resumes workflow state
     └── routes to agents
          ├── Sequential: Architect, DevOps, Engineer
          └── Parallel gates (single-message Agent spawns):
               ├── Gate 1: Code Reviewer + Security Analyst   (read-only, enforced)
               └── Gate 2: SDET + Technical Writer            (may modify files)
```

### Workflow tracks

| Track | Pipeline | Trigger |
|---|---|---|
| **Discovery** | PM (brainstorm → narrow → PRD/roadmap) → Architect feasibility pass → product artifacts in `.constellation/product/` | product ideas, PRDs, roadmaps, prioritization, or `discovery: …` |
| **Planned Work** | [PM × Architect pairing]* → DevOps branch → Engineer → Lint Gate → [Reviewer + Security] → [SDET + Writer] → Architect verify → Commit → PR | 3+ files / new module / architecture, or `plan: …` |
| **Tweak** | DevOps branch → Engineer → Lint Gate → [Reviewer + Security] → SDET → Commit → PR | bounded 1-2 file change, or `tweak: …` |
| **Hotfix** | DevOps branch → Engineer → Lint Gate → Reviewer → SDET → Commit → PR | production broken, or `hotfix: …` |
| **Spike** | Architect → Engineer → findings doc in `.constellation/spikes/` | research, or `spike: …` |

\* Product-scoped work only: the Product Manager drives scope (MLP slice, BDD criteria, metrics) and the Architect pairs on feasibility — a bounded convergence loop (max 3 rounds); the plan is approved only when both sign. Purely technical work skips the pairing and the Architect plans alone.

### Quality machinery

- **TDD as the engineering process** — both engineer agents follow the `tdd-workflow` skill: RED (validated failing test) → GREEN (minimal implementation) → REFACTOR, with checkpoint commits on the feature branch. Production code is never written before a failing test. Integration/E2E coverage stays with SDET in Gate 2.
- **Lint Gate** — project lint + build (+ schema compatibility when `schemaPath` is configured) runs before any reviewer, so expensive Opus reviewers never see code that doesn't compile.
- **Parallel gates** — reviewers are spawned concurrently in a single message; blockers from both are merged into one fix list.
- **Incremental review** — fix passes send reviewers only the fix delta plus the original blocker list, not the whole diff again.
- **Review memory** — recurring blocker patterns accumulate in `.constellation/memory/review-patterns.md`; the Engineer self-checks against them before each gate, reducing loops over time.
- **State & resume** — every milestone is saved to `.constellation/state/current-workflow.json`; interrupted workflows resume with `/constellation:resume`.
- **Metrics** — every event appends to `.constellation/metrics/workflow-log.jsonl` for pattern analysis.

---

## Agents

| Agent | Model | Role | Gate-mode tools |
|---|---|---|---|
| `product-manager` | opus | MLP scope, value loop, PRDs, roadmaps, parking lot — drives the planning phase | full |
| `software-architect` | opus | Plans with acceptance criteria, risks, validation — pairs with PM on feasibility | full |
| `software-engineer` | sonnet | Implements backend/service plans and changes, test-first (TDD) | full |
| `frontend-engineer` | sonnet | Implements UI work test-first (TDD) — components, state, accessibility, design quality | full |
| `ui-ux-designer` | opus | Design-led frontend work — dashboards, landing pages, redesigns | full |
| `code-reviewer` | opus | Correctness/maintainability/performance review | **read-only, no shell** |
| `security-analyst` | opus | OWASP, auth/authz, data exposure, dependency audit | **read-only** |
| `sdet` | sonnet | Test strategy, implementation, suite audits | full |
| `devops-engineer` | sonnet | Branches, pushes, PRs, CHANGELOG | full |
| `technical-writer` | sonnet | README, CHANGELOG, ADRs, API docs | full |

Models are reassigned dynamically per change complexity (small → all Sonnet; medium/large → Opus for Architect/Reviewer/Security). Auth-touching changes always get Opus security review.

## Commands

| Command | Effect |
|---|---|
| `/constellation:init` | Onboard the current project (generate `.constellation/`) |
| `/constellation:status` | Show workflow state — track, step, gates, loops |
| `/constellation:dry-run <request>` | Trace agents/models/gates without executing |
| `/constellation:abort` | Stop now, save state, keep branch + changes |
| `/constellation:resume` | Continue from saved state |
| `/constellation:skip-gate` | Skip the current gate (with confirmation, logged) |

## Skills

**Core (`constellation`)**: `orchestrator`, `tdd-workflow`, `git-commit`, `branching-strategy`, `release-notes`, `dependency-management`, `github-remote`.
**Stack pack (`constellation-stack-node`)**: `typescript`, `nestjs`, `graphql`, `graphql-federation`, `prisma-migrations`, `observability`, `error-handling`, `security-checklist`, `schema-compatibility`.
**Stack pack (`constellation-stack-frontend`)**: `frontend-design` (distinctive, production-grade UI aesthetics — typography, color, motion, composition).

Agents load stack skills dynamically based on `config.stack` — the core stays stack-agnostic.

---

## Extending

### Add an agent
1. Create `plugins/constellation/agents/<name>.md` with frontmatter (`name`, `description` with routing signal phrases, `model`, optional `tools` restriction, optional `skills`).
2. Add it to the routing table in `skills/orchestrator/SKILL.md` and to the session-start policy in `scripts/session-start.sh`.
3. Wire it into the workflow tracks where appropriate.

### Add a skill
1. Create `skills/<name>/SKILL.md` (in the core or a stack pack) with `name` + `description` frontmatter.
2. Reference it from agent frontmatter (`skills:`) for always-on loading, or list it in a project's `config.stack` for dynamic loading.

### Add a stack pack
Copy the `constellation-stack-node` structure, swap in skills for the new stack (e.g. Python/Django, Go), and register it in `marketplace.json`.

---

## Hard Enforcement

Beyond the prompt-level rules, the harness mechanically enforces its git safety policy via a `PreToolUse` hook (`scripts/guard-git.sh`, active only in initialized projects): no commits or pushes to the main branch, no `--no-verify`, no staging of `.env`/credential files. Fix loops (lint gate, review gates) are capped at 3 — beyond that the orchestrator escalates to you instead of looping. The Code Reviewer has no shell access at all; the diff is supplied in its prompt.

## Roadmap

See [ROADMAP.md](ROADMAP.md) — Tier 2 (close the SDLC loop: post-PR flow, `/constellation:iterate`, `/constellation:metrics`) and Tier 3 (robustness: state validation, harness self-test, cost bounds, versioned distribution).

## License

MIT
