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
    │   ├── agents/                    11 persona subagents
    │   ├── commands/                  /constellation:* workflow commands
    │   ├── skills/                    orchestrator + generic delivery skills
    │   ├── templates/                 files scaffolded by /constellation:init
    │   ├── hooks/ + scripts/          SessionStart activation (gated per project)
    │   └── .claude-plugin/plugin.json
    ├── constellation-stack-node/      OPT-IN — Node/NestJS/GraphQL/Prisma skills
    │   ├── skills/
    │   └── .claude-plugin/plugin.json
    ├── constellation-stack-frontend/  OPT-IN — frontend design skills
    │   ├── skills/
    │   └── .claude-plugin/plugin.json
    ├── constellation-stack-service/   OPT-IN — constellation-service boilerplate recipes
    │   ├── skills/                    (layers on top of constellation-stack-node)
    │   └── .claude-plugin/plugin.json
    └── constellation-stack-infra/     OPT-IN — cloud infrastructure (Terraform, OCI/AWS)
        ├── agents/                    cloud-architect persona subagent
        ├── skills/
        └── .claude-plugin/plugin.json
```

---

## Installation

The mental model: **install once per machine, then enable + init once per repo.** Installing a plugin only makes it *available* — it does nothing until you enable it in a project and run `/constellation:init` there.

### Prerequisites

- **`jq`** — the git-guard hook (`guard-git.sh`) uses it to enforce git safety (no commits/pushes to main, no `--no-verify`, no staging secrets). **Without `jq` the hook silently no-ops** — no error, just no protection. Install it: `brew install jq` (macOS) / `apt install jq` (Debian).
- **`gh` (GitHub CLI), authenticated** — all GitHub operations run through it, over **HTTPS with gh's credential helper** (`gh auth setup-git`), never SSH. `/constellation:init` uses it to detect your GitHub account, and the DevOps agent uses it to push and open PRs. With multiple gh accounts, `.constellation/config.json` → `github.account` decides which one each project uses (agents `gh auth switch` before every remote operation). Verify with `gh auth status`.

### 1. Install (once per machine)

```
# Add the marketplace (GitHub — versioned, reproducible)
/plugin marketplace add jvoliveiran/constellation-harness
# or from a local clone: /plugin marketplace add /path/to/constellation-harness

# Core harness (always)
/plugin install constellation@constellation

# Backend stack pack — Node/NestJS/GraphQL/Prisma repos
/plugin install constellation-stack-node@constellation

# Frontend stack pack — web UI repos
/plugin install constellation-stack-frontend@constellation

# Boilerplate pack — repos scaffolded from the constellation-service template
/plugin install constellation-stack-service@constellation

# Infrastructure pack — cloud architecture + reusable Terraform modules (OCI-first, AWS)
/plugin install constellation-stack-infra@constellation
```

Installing all of them is harmless — a plugin stays dormant until enabled in a project, so machine-wide install costs nothing.

### 2. Activate per repo (two gates)

The harness never takes over sessions globally. Each repo opts in with two steps:

**a. Enable the plugins** — in the repo's `.claude/settings.json`, enable **core + only the one stack that repo uses** (not both). Note this is `.claude/settings.json`, distinct from the `.constellation/config.json` that `init` generates in step b.

```jsonc
// Backend repo — .claude/settings.json
{ "enabledPlugins": { "constellation@constellation": true, "constellation-stack-node@constellation": true } }
```
```jsonc
// Frontend repo — .claude/settings.json
{ "enabledPlugins": { "constellation@constellation": true, "constellation-stack-frontend@constellation": true } }
```
```jsonc
// Repo scaffolded from the constellation-service boilerplate — .claude/settings.json
// (ships pre-configured in the template; the boilerplate pack layers on the node pack)
{
  "enabledPlugins": {
    "constellation@constellation": true,
    "constellation-stack-node@constellation": true,
    "constellation-stack-service@constellation": true
  }
}
```
```jsonc
// Repo that owns cloud infrastructure (Terraform modules / environments) — .claude/settings.json
// Composable: add the infra pack alongside a stack pack in repos that carry both app and infra code.
{ "enabledPlugins": { "constellation@constellation": true, "constellation-stack-infra@constellation": true } }
```

**b. Initialize** — even when enabled, the SessionStart hook stays **silent** until the repo contains `.constellation/config.json`. Run `/constellation:init` once per repo to opt in. It scans the codebase and **auto-detects the stack**, writing `config.stack` for you (verify it once on the first repo).

A repo without `.constellation/` behaves exactly like vanilla Claude Code.

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
├── tracks.json          canonical SDLC step map per track (emojis, labels) — Progress HUD source of truth
├── memory/review-patterns.md   recurring review blockers (self-learning)
├── tasks/ (+archive/)   the unit of work — one task per workflow, filed at intake (artifact model v1)
├── plans/ (+archive/)   implementation detail of planned tasks (same number + slug)
├── epics/  features/    work hierarchy above tasks (created during Discovery)
├── artifacts/  adrs/    PRDs/spike findings/notes, and decision records
├── scripts/             opencode-review.sh (cross-model adapter), statusline.sh (Progress HUD)
├── state/  metrics/     workflow resume state + JSONL telemetry (gitignored)
└── .gitignore
```

Init also offers to wire `statusline.sh` into `.claude/settings.json` — a one-line workflow HUD in the statusline (see Quality machinery → Progress HUD).

Commit `.constellation/` (state/metrics are gitignored) so teammates share the configuration. Re-run with `--refresh` to regenerate the project map.

### 4. Update (when a new version is released)

Custom marketplaces do **not** auto-update by default — updating is a two-step pull, once per machine:

```
# 1. Refresh the marketplace metadata (pulls the latest git state)
/plugin marketplace update constellation

# 2. Update the installed plugin(s), then restart — or /reload-plugins to apply now
/plugin update constellation@constellation
```

Then, **once per repo**, re-run `/constellation:init --refresh` so files that init copies into `.constellation/` (e.g. `scripts/opencode-review.sh`, the CI template) pick up the new version — the plugin update alone does not touch them.

**Upgrading to 1.0 (artifact model v1)**: projects initialized before 1.0 run the v0 layout (`improvements/`, `product/`, plan-numbered work). The orchestrator detects the missing `"artifactModel": 1` marker in `config.json` and offers a one-shot, lossless migration before the next workflow (hotfixes run regardless). Archives and documentation directories (`adrs/`, `runbooks/`, `designs/`) are untouched. Full mapping: the orchestrator skill's `references/artifact-model.md` and [`docs/specs/artifact-model-v1.md`](docs/specs/artifact-model-v1.md).

Optional:
- **Auto-update**: `/plugin` → Marketplaces tab → constellation → enable auto-update (checks at session start).
- **Version pinning**: add the marketplace at a release tag for reproducible installs — `/plugin marketplace add jvoliveiran/constellation-harness#constellation--v0.7.0`. Pinned installs stay locked until you re-add at a newer tag; the unpinned form tracks `main`.

### Releasing a new version (maintainer)

1. Bump `version` in `plugins/constellation/.claude-plugin/plugin.json` **and** the matching entry in `.claude-plugin/marketplace.json` (stack packs likewise when they changed).
2. Cut `CHANGELOG.md`: `[Unreleased]` → `[x.y.z] - <date>`.
3. `scripts/selftest.sh` must be green.
4. Commit, tag `constellation--v<x.y.z>`, push `main` + the tag.

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
               │           + DX Analyst                       (read-only, advisory)
               └── Gate 2: SDET + Technical Writer            (may modify files)
```

### Workflow tracks

| Track | Pipeline | Trigger |
|---|---|---|
| **Discovery** | PM (brainstorm → narrow → epics/features/PRD) → Architect feasibility pass → work hierarchy in `.constellation/` (epics, features, artifacts) | product ideas, PRDs, roadmaps, prioritization, or `discovery: …` |
| **Planned Work** | [PM × Architect pairing]* → DevOps branch → Engineer → Lint Gate → [Reviewer + Security + DX] → [SDET + Writer] → Architect verify → Commit → PR + gate summary → Ship (merge + verify) | 3+ files / new module / architecture, or `plan: …` |
| **Tweak** | DevOps branch → Engineer → Lint Gate → [Reviewer + Security + DX] → SDET → Commit → PR + gate summary → Ship | bounded 1-2 file change, or `tweak: …` |
| **Hotfix** | DevOps branch → Engineer → Lint Gate → Reviewer → SDET → Commit → PR + gate summary → Ship | production broken, or `hotfix: …` |
| **Spike** | Architect → Engineer → findings doc in `.constellation/artifacts/` | research, or `spike: …` |

\* Product-scoped work only: the Product Manager drives scope (MLP slice, BDD criteria, metrics) and the Architect pairs on feasibility — a bounded convergence loop (max 3 rounds); the plan is approved only when both sign. Purely technical work skips the pairing and the Architect plans alone.

### Quality machinery

- **Test-verified development as the engineering process** — both engineer agents follow the `test-verified-development` skill: test cases derived from acceptance criteria, implementation and tests landing together (GREEN), then a mandatory VERIFY gate that temporarily removes the change and proves every new test fails for the intended reason — with checkpoint commits carrying the evidence on the feature branch. No change ships on tests that never failed. Integration/E2E coverage stays with SDET in Gate 2.
- **Lint Gate** — project lint + build (+ schema compatibility when `schemaPath` is configured) runs before any reviewer, so expensive Opus reviewers never see code that doesn't compile.
- **Code-metrics budgets** — the `code-metrics` skill sets numeric quality budgets against god classes and sprawling functions (functions ≤ 50 lines / ≤ 3 params, files ≤ 300 lines, cyclomatic ≤ 10, cognitive ≤ 15, nesting ≤ 4), enforced as ESLint **errors** at the Lint Gate, plus dependency-cruiser boundary rules (no circulars, domain never imports infrastructure, no cross-module internals) for the structural half. Engineers design toward the budgets; a genuine exception is a narrow `eslint-disable-next-line` with a required justification, and the Code Reviewer blocks unjustified suppressions. Contracts are required at module boundaries only — single-implementation internals stay direct (the DX Analyst flags over-abstraction).
- **Parallel gates** — reviewers are spawned concurrently in a single message; blockers from both are merged into one fix list.
- **DX advisory pass** — the DX Analyst runs alongside Gate 1 (first pass only, skipped on hotfixes) hunting complexity: duplicated code, unnecessary dependencies, redundant env vars, local-setup friction, and over-mocked cross-app test setups. It never blocks — each finding is filed as a `type: debt` task in `.constellation/tasks/` (with category, evidence, simplification, effort) to be picked up later as a tweak or planned work.
- **Incremental review** — fix passes send reviewers only the fix delta plus the original blocker list, not the whole diff again.
- **Review memory** — recurring blocker patterns accumulate in `.constellation/memory/review-patterns.md`; the Engineer self-checks against them before each gate, reducing loops over time.
- **Fix policy** — `review.fixPolicy` controls what the Engineer must fix after review: `"blockers"` (default) or `"blockers+suggestions"` (suggestions join the first fix pass only). Nits piggyback: mandatory when the first pass had any blocker/suggestion, otherwise at the Engineer's discretion — they never trigger or block a loop.
- **Ship step (closed SDLC loop)** — every PR gets a structured gate summary comment (audit trail), then merges per `merge.policy`: `"auto-unless-blockers"` (default) squash-merges autonomously when the review history was clean — CI green, threads resolved — and asks you first only when a 🔴 blocker ever appeared; `"always-ask"` for conservative repos. Post-merge, the main branch is pulled and build+test verified (alert + revert guidance on failure, never auto-revert). Human PR comments re-enter the flow: change requests loop Engineer → Lint → incremental Gate 1 → push + thread replies; question comments escalate to you. `/constellation:ship` runs the merge step manually.
- **Cross-model validation (optional, off by default)** — when `crossModelValidation.enabled` is set, Gate 1 adds a third reviewer that runs a different model family (e.g. Gemini — free via Google AI Studio — or GPT, through the local [`opencode`](https://opencode.ai) CLI) over the same diff. Blocking merge: confirmed and Opus-only blockers loop as usual; a cross-model-only blocker **escalates to you** rather than auto-looping. With `"plan-review"` in `crossModelValidation.steps`, the Architect's plan also gets a cross-model critique before implementation — the Architect adjudicates each finding, disputes escalate to you. Infrastructure failures (opencode missing/slow/throttled) **skip and proceed** — they never block delivery. See [`docs/spikes/multi-llm-validation.md`](docs/spikes/multi-llm-validation.md).
- **State & resume** — every milestone is saved to `.constellation/state/current-workflow.json`; interrupted workflows resume with `/constellation:resume`.
- **Workflow Progress HUD** — always know which SDLC step is running and how far along the pipeline is. One canonical step map (`.constellation/tracks.json`) renders three ways: a one-line **Progress Banner** printed after every state save (`` 🌌 planned 6/10 │ 📐✓ 🔭✓ 🌿✓ 🔨✓ 🧹✓ ▶🔍 Review Gate · · · · │ feat/011-audit-log ``), an optional **statusline** renderer (`.constellation/scripts/statusline.sh`, mechanical — reads state directly, wired by init on request), and `/constellation:status` as the zoom-in view. Fix loops show `🔁 loop N/3` anchored on the gate (progress never moves backward); a workflow stopped on a user decision shows `⛔ awaiting your decision` (`waitingOn` state field).
- **Metrics** — every event appends to `.constellation/metrics/workflow-log.jsonl` for pattern analysis.

---

## Agents

| Agent | Model | Role | Gate-mode tools |
|---|---|---|---|
| `product-manager` | opus | MLP scope, value loop, epics, PRDs, roadmaps, parked tasks — drives the planning phase | full |
| `software-architect` | fable (opus fallback) | Plans with acceptance criteria, risks, validation — pairs with PM on feasibility | full |
| `software-engineer` | sonnet | Implements backend/service plans and changes with verified tests | full |
| `frontend-engineer` | sonnet | Implements UI work with verified tests — components, state, accessibility, design quality | full |
| `ui-ux-designer` | opus | Design-led frontend work — dashboards, landing pages, redesigns | full |
| `code-reviewer` | fable (opus fallback) | Correctness/maintainability/performance review | **read-only, no shell** |
| `cross-model-reviewer` | sonnet | Bridges Gate 1 to a second model family (e.g. Gemini or GPT via local opencode) — optional, off by default | Bash + Read (opencode only) |
| `security-analyst` | opus | OWASP, auth/authz, data exposure, dependency audit | **read-only** |
| `dx-analyst` | sonnet | Complexity reduction — duplication, dependencies, env vars, local setup, test-strategy simplicity; advisory, findings become `type: debt` tasks | **read-only, no shell** |
| `sdet` | sonnet | Test strategy, implementation, suite audits | full |
| `devops-engineer` | sonnet | Branches, pushes, PRs, CHANGELOG | full |
| `technical-writer` | sonnet | README, CHANGELOG, ADRs, API docs | full |
| `cloud-architect`* | fable (opus fallback) | Cloud solutions as reusable Terraform module building blocks — AWS + OCI, OCI Always Free first | full |

\* Ships in the `constellation-stack-infra` pack (subagent_type `constellation-stack-infra:cloud-architect`), not the core plugin — available only where that pack is enabled.

Models are reassigned dynamically per change complexity (small → all Sonnet; medium/large → Fable for Architect/Reviewer, Opus for Security/PM). The Architect and Code Reviewer default to Fable and fall back to Opus when Fable isn't available on the account. Auth-touching changes always get Opus security review.

## Commands

In SDLC order — project setup → previewing work → controlling a running workflow → shipping → learning from telemetry:

| Command | What it does & when to use it | Example |
|---|---|---|
| `/constellation:init` | Onboards the current repo: generates `.constellation/` (config, project map, review memory, scripts) and detects commands/stack/account. Run **once per repo** before anything else; re-run with `--refresh` after harness upgrades to update scaffolded files. | `/constellation:init` |
| `/constellation:dry-run` | Traces the exact workflow a request would trigger — track, agents, models, skills, gates — **without executing or modifying anything**. Use before committing to a large piece of work, or to sanity-check how a request will be classified. | `/constellation:dry-run add rate limiting to the login endpoint` |
| `/constellation:status` | Shows where the current workflow stands as the visual Progress HUD: banner + per-step table (track, step, gates passed, review loops). Use **mid-workflow** to orient yourself, or at session start to see what's in flight. | `/constellation:status` |
| `/constellation:backlog` | Tree view of the whole work hierarchy — epics → features → tasks — with a legend header, status, type, and plan presence, derived from child front-matter links. Done tasks are hidden by default (`--all` shows them); ✅ on an epic/feature requires all children complete. Use to see the roadmap, what can go active, and where work concentrates. | `/constellation:backlog --epic E01` |
| `/constellation:project` | Global project tree — epics → features → tasks → **plans as nodes** — with a legend header and a one-line description on every node. Same default visibility and completion rules as `backlog`. The rich sibling of `backlog`: use it to grasp the global state of the project at a glance. | `/constellation:project --all` |
| `/constellation:tasks` | Portfolio overview of **all** tasks in `.constellation/tasks/` — the unit of work, one per workflow (📥 inbox / 📋 refined / 🔨 in-progress / ✅ done / 🚫 dropped / 🅿️ parked), with type, source, and plan pairing. DX Analyst findings land here as `type: debt`. Use to see the pipeline and pick what to run next. | `/constellation:tasks --type debt` |
| `/constellation:plans` | Portfolio overview of **all** plans with document maturity (📝 draft / 👍 approved) and each plan's task state inline, in number order, flagging the in-flight one and drafts blocked on open questions. | `/constellation:plans --archived` |
| `/constellation:debt` | Inventory of **all** code-metrics budget violations in the project — including the ones hidden behind baseline suppressions (re-runs ESLint with `--no-inline-config` and dependency-cruiser without `--ignore-known`, filtered to the six budget rules), each tagged 🧾 baselined or 🆕 new, cross-checked against the baseline debt task. Use to size the debt or verify nothing slipped past the gate. Read-only. | `/constellation:debt --new` |
| `/constellation:skip-gate` | Skips the gate the workflow is currently blocked on (asks for confirmation, records the skip in metrics). Use **sparingly** — when a gate is stuck on something you've consciously decided to accept. | `/constellation:skip-gate` |
| `/constellation:abort` | Stops the workflow **now**, saving state and keeping the branch + changes intact. Use when priorities shift mid-workflow — nothing is lost, resume later. | `/constellation:abort` |
| `/constellation:resume` | Continues an interrupted workflow from saved state — after validating it (branch exists, plan present, PR still open); stale state is archived, never blindly trusted. Use at the start of a session when work was left unfinished. | `/constellation:resume` |
| `/constellation:ship` | Merges the workflow's PR (squash) once mechanical preconditions pass — CI green, review threads resolved — then verifies main builds post-merge. Use to ship a PR that paused at the human merge gate (blocker history), or any workflow PR left unmerged. | `/constellation:ship` |
| `/constellation:metrics` | Turns `.constellation/metrics/workflow-log.jsonl` into a decision-ready report: loops, blockers per gate, escalations, ship outcomes, with threshold-gated improvement signals. Use **periodically** to tune the harness; `ab` mode prints the cross-model A/B table. | `/constellation:metrics ab` |

## Skills

**Core (`constellation`)**: `orchestrator`, `test-verified-development`, `code-metrics`, `git-commit`, `branching-strategy`, `release-notes`, `dependency-management`, `github-remote`, `grafana-cloud` (Grafana Cloud free tier + OpenTelemetry pipeline for logs/metrics/traces — Loki as the primary distributed-logging store).
**Stack pack (`constellation-stack-node`)**: `typescript`, `nestjs`, `graphql`, `graphql-federation`, `prisma-migrations`, `observability`, `error-handling`, `security-checklist`, `schema-compatibility`.
**Stack pack (`constellation-stack-frontend`)**: `frontend-design` (distinctive, production-grade UI aesthetics — typography, color, motion, composition).
**Boilerplate pack (`constellation-stack-service`)**: `add-domain-entity`, `e2e-harness`, `terraform-deploy` — recipes for backends scaffolded from the [constellation-service](https://github.com/jvoliveiran/constellation-service) template. Layers on top of `constellation-stack-node`; enable both in derived repos.
**Infrastructure pack (`constellation-stack-infra`)**: `terraform-module-design` (reusable building-block modules with contract interfaces), `terraform-environments` (remote state, directory-per-env, promotion via version pins), `oci-container-platform` (Docker + databases on the OCI Always Free tier — the Lightsail equivalent at $0), `cloud-accessory-services` (secrets, certificates, DNS, registries, backups, AWS↔OCI mapping). Loaded by the pack's `cloud-architect` agent.

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
