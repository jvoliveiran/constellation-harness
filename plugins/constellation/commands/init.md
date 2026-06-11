---
description: Initialize the Constellation Harness in the current project — generates .constellation/ (config, project map, plans, memory, state) by scanning the codebase.
argument-hint: "[--refresh to regenerate the project map only]"
disable-model-invocation: true
---

# /constellation:init

Initialize (or refresh) the Constellation Harness for the current project. Until this command is run, the harness stays dormant in this project — the SessionStart hook injects nothing.

## Arguments

`$ARGUMENTS` — if it contains `--refresh`, only regenerate `.constellation/project-map.md` (keep config and all other files untouched).

## Procedure

### 1. Guard

- If `.constellation/config.json` already exists and `--refresh` was NOT passed, ask the user whether to overwrite the config or only refresh the project map.
- Confirm the current directory is a git repository (`git rev-parse --git-dir`). If not, warn that branch/PR workflows require git and ask whether to continue.

### 2. Detect project facts

- **Package manager & commands**: read the project manifest (`package.json`, `pyproject.toml`, `go.mod`, …). For Node: extract real `lint`, `build`, `test` script names; detect npm/pnpm/yarn from lockfiles. For other ecosystems, use their conventional equivalents. If no lint/build/test commands can be detected, ask the user for them.
- **GitHub account**: run `gh api user --jq .login` (fall back to asking the user if `gh` is not authenticated).
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
├── memory/review-patterns.md ← from templates/review-patterns.md, verbatim
├── plans/archive/.gitkeep
├── spikes/.gitkeep
├── adrs/.gitkeep
├── designs/.gitkeep            ← design rationale docs from ui-ux-designer (frontend projects)
├── product/                    ← product-manager artifacts
│   ├── prds/.gitkeep
│   ├── roadmap.md              ← from templates/roadmap.md, verbatim
│   └── parking-lot.md          ← from templates/parking-lot.md, verbatim
├── state/.gitkeep
├── metrics/.gitkeep
└── .gitignore               ← from templates/gitignore, verbatim
```

### 4. Generate the project map

Fill the placeholder sections of `project-map.md` by scanning the repository:
- **Project Structure**: an annotated tree of source directories (one line per module/file group with a short "→ purpose" note, under ~120 lines). Derive purposes from file names, module declarations, and the README — do not read every file.
- **File Naming Conventions**: a table of observed patterns (e.g. `*.service.ts` → business logic).
- **Finding Tests**: glob patterns for the project's unit/integration/e2e tests.
- **Schema / Data Model**: where the source-of-truth schema lives, or "not applicable".

### 5. Report

- Summarize the generated config (commands, account, main branch, stack skills).
- If a stack was detected, recommend installing/enabling the matching stack plugin (`constellation-stack-node` for backend Node, `constellation-stack-frontend` for web UIs) if it isn't already.
- Remind the user: the harness activates in this project on the next session start (or immediately for the rest of this session — treat the orchestrator routing policy as active from now on).
- Suggest committing `.constellation/` (minus the gitignored `state/` and `metrics/`) so teammates share the same configuration.
