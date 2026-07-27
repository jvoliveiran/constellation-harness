---
description: Initialize the Constellation Harness in the current project — generates .constellation/ (config, project map, plans, memory, state) by scanning the codebase.
argument-hint: "[--refresh to regenerate the project map only]"
disable-model-invocation: true
---

# /constellation:init

Initialize (or refresh) the Constellation Harness for the current project. Until this command is run, the harness stays dormant in this project — the SessionStart hook injects nothing.

## Arguments

`$ARGUMENTS` — if it contains `--refresh`, only regenerate `.constellation/project-map.md` and re-copy the canonical plugin files — `tracks.json`, `scripts/statusline.sh`, and `scripts/sync-artifacts.sh` always (never user-edited, so plugin updates propagate), `scripts/opencode-review.sh` when missing (keep config and all other files untouched). Also backfill any scaffold directories from step 3 that are missing (e.g. `tasks/` in repos initialized before it existed) — directories only, never overwriting files. Also re-run the **Remote transport** check from step 2 (SSH remotes predating the HTTPS policy get the conversion offer on refresh, not just on first init).

## Procedure

### 1. Guard

- If `.constellation/config.json` already exists and `--refresh` was NOT passed, ask the user whether to overwrite the config or only refresh the project map.
- Confirm the current directory is a git repository (`git rev-parse --git-dir`). If not, warn that branch/PR workflows require git and ask whether to continue.

### 2. Detect project facts

- **Package manager & commands**: read the project manifest (`package.json`, `pyproject.toml`, `go.mod`, …). For Node: extract real `lint`, `build`, `test` script names; detect npm/pnpm/yarn from lockfiles. For other ecosystems, use their conventional equivalents. If no lint/build/test commands can be detected, ask the user for them.
- **GitHub account**: run `gh api user --jq .login` (fall back to asking the user if `gh` is not authenticated). If `gh auth status` shows **multiple accounts**, ask the user which one this project should use — the configured `github.account` is what every agent switches to (`gh auth switch`) before any remote operation.
- **Remote transport**: all GitHub operations run through the gh CLI over HTTPS (gh's credential helper routes them to the configured account). Check `git remote get-url origin` — if it is SSH (`git@…` or `ssh://…`), offer to convert it: `git remote set-url origin https://github.com/OWNER/REPO.git`, then ensure `gh auth setup-git` and `gh config set git_protocol https`. Always pin the repo to the configured account — `git config credential.username <account>` — so git pushes route to that account's token even when the machine's daily-default gh account is a different one. If the user declines the conversion, warn that pushes will use SSH keys outside gh's account control and `github.account` will not apply to git pushes.
- **Main branch**: `git remote show origin` (HEAD branch) or default `main`.
- **Schema artifact**: look for a generated API schema (e.g. `src/schema.gql`, `schema.graphql`, `openapi.yaml`). Set `schemaPath` if found, else `null`.
- **Stack**: detect frameworks from dependencies and map to available stack skill names. Only list skills whose technology is actually present:
  - Backend Node (from `constellation-stack-node`): `typescript`, `nestjs`, `graphql`, `graphql-federation`, `prisma-migrations`, `observability`, `error-handling`, `security-checklist`, `schema-compatibility`
  - Frontend (from `constellation-stack-frontend`): `frontend-design` — include when the project is a web UI (react, vue, next, vite, tailwind, etc.). Frontend projects also typically get `typescript` and `graphql` when those are present.

### 3. Scaffold `.constellation/`

Create this structure in the project root (templates live in `${CLAUDE_PLUGIN_ROOT}/templates/`):

```
.constellation/
├── config.json              ← from templates/config.json, filled with detected values
├── project-map.md           ← from templates/project-map.md, sections generated (step 4)
├── tracks.json              ← from templates/tracks.json, verbatim; canonical step map for the Progress HUD
├── memory/review-patterns.md ← from templates/review-patterns.md, verbatim
├── plans/archive/.gitkeep
├── tasks/archive/.gitkeep      ← task-spec inbox (other agents/tools file work here; refined into plans)
├── improvements/.gitkeep       ← DX Analyst findings (complexity-reduction backlog)
├── spikes/.gitkeep
├── adrs/.gitkeep
├── designs/.gitkeep            ← design rationale docs from ui-ux-designer (frontend projects)
├── product/                    ← product-manager artifacts
│   ├── prds/.gitkeep
│   ├── roadmap.md              ← from templates/roadmap.md, verbatim
│   └── parking-lot.md          ← from templates/parking-lot.md, verbatim
├── scripts/
│   ├── opencode-review.sh    ← from templates/opencode-review.sh, verbatim (chmod +x); cross-model review adapter
│   ├── statusline.sh         ← from templates/statusline.sh, verbatim (chmod +x); Progress HUD statusline renderer
│   └── sync-artifacts.sh     ← from templates/sync-artifacts.sh, verbatim (chmod +x); artifact-only commit helper (the one sanctioned commit on main)
├── state/.gitkeep
├── metrics/.gitkeep
└── .gitignore               ← from templates/gitignore, verbatim
```

`config.json` includes a `crossModelValidation` block (from the template) that is
**disabled by default** — the harness behaves exactly as before until a user opts in.

### 4. Generate the project map

Fill the placeholder sections of `project-map.md` by scanning the repository:
- **Project Structure**: an annotated tree of source directories (one line per module/file group with a short "→ purpose" note, under ~120 lines). Derive purposes from file names, module declarations, and the README — do not read every file.
- **File Naming Conventions**: a table of observed patterns (e.g. `*.service.ts` → business logic).
- **Finding Tests**: glob patterns for the project's unit/integration/e2e tests.
- **Schema / Data Model**: where the source-of-truth schema lives, or "not applicable".

### 5. CI parity (optional, recommended)

If the project's remote is GitHub and `.github/workflows/` has no equivalent quality workflow, offer to install one:
- Copy `${CLAUDE_PLUGIN_ROOT}/templates/github-actions-ci.yml` to `.github/workflows/constellation-ci.yml`
- Replace the lint/build/test steps and branch name with the values detected in step 2
- Recommend enabling branch protection on the main branch requiring this check — so a red PR cannot merge even outside harness sessions

### 5b. Cross-model validation readiness (optional)

`crossModelValidation` is scaffolded **disabled**. Only if the user asks to enable it:
- Copy `templates/opencode-review.sh` → `.constellation/scripts/opencode-review.sh` and
  `chmod +x` it (also do this whenever the file is missing on `--refresh`).
- **Live-probe the configured model** — auth presence is NOT sufficient; entitlement is
  per-model. Run a trivial call and check for a text response, not a `model_not_found`
  error:
  ```
  opencode run "reply with the single word OK" -m "<model>" --format json \
    | jq -e 'select(.type=="text")' >/dev/null   # success = model is callable
  ```
  If `opencode` is absent, or the probe returns `model_not_found` / no text, **warn the
  user** and leave `enabled:false` — the gate would only ever infra-skip otherwise.
- Recommend a model the project can actually call and a generous `timeoutSec`
  (reasoning/codex models can be slow or throttled). Recommended starting model:
  **`google/gemini-3-flash-preview`** — free via the Google AI Studio tier (no card;
  ~1,500 req/day), a genuine second family, and needs no `effort` value. Requires
  `opencode auth login` → Google with an AI Studio key first; fallbacks if the preview id
  is not callable: `google/gemini-3.5-flash`, `google/gemini-2.5-flash`. See the
  multi-llm spike §17 for alternatives (opencode Zen free models, paid GPT).
- `steps` defaults to `["code-review"]` (Gate 1 only). Adding `"plan-review"` also runs a
  cross-model critique of each plan before branching — mention it exists, but do not add
  it unless the user asks.

### 5c. Statusline — Workflow Progress HUD (optional, recommended)

The scaffold already placed `.constellation/scripts/statusline.sh` (it reads the workflow
state + `tracks.json` and renders a one-line HUD: current SDLC step, progress `n/N`, loop
and escalation modifiers, branch). Offer to wire it into the project's
`.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": ".constellation/scripts/statusline.sh" } }
```

- Create the file or merge the key into the existing JSON.
- If a `statusLine` is already configured, show the current value and ask before
  replacing it — never overwrite silently.
- If the user declines, skip — the Progress Banner and `/constellation:status` still
  provide the HUD; the script stays available to wire later.
- The script prints nothing while no workflow is running, so outside workflows the
  statusline is simply empty.

### 6. Report

- Summarize the generated config (commands, account, main branch, stack skills).
- If a stack was detected, recommend installing/enabling the matching stack plugin (`constellation-stack-node` for backend Node, `constellation-stack-frontend` for web UIs) if it isn't already.
- Remind the user: the harness activates in this project on the next session start (or immediately for the rest of this session — treat the orchestrator routing policy as active from now on).
- **Commit the scaffolding**: run `.constellation/scripts/sync-artifacts.sh`. It stages only `.constellation/` (the gitignored `state/` and `metrics/` stay out), commits `chore(constellation): sync harness artifacts` — allowed even on the main branch, the git guard's one sanctioned exception — and on main pushes only when that is provably artifact-only. Never leave the scaffold untracked; if the push is rejected (branch protection), tell the user the commit is local and offer a chore PR.
