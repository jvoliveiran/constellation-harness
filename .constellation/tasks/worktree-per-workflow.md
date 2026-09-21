---
status: inbox
source: claude-code-session
date-created: 29-08-2026
last-edit: 21-09-2026
---

# Worktree-per-workflow isolation

> Spike: [docs/spikes/worktree-per-workflow/](../../docs/spikes/worktree-per-workflow/README.md)

## Problem

All Constellation agents share one working directory. Two sessions in the same
clone conflict on three resources:

- The checked-out branch — each workflow checks out its own feature branch.
- The dirty tree — one workflow's uncommitted files pollute the other's gates.
- `.constellation/state/current-workflow.json` — a singleton, so a second
  session overwrites the first session's state.

Result: one workflow at a time per clone. Parallelism exists only inside a
workflow (the review and QA gates).

## Proposal

Isolate per **workflow**, not per agent. The orchestrator creates one git
worktree when the workflow starts and removes it when the workflow closes.
Every agent of that workflow runs inside that worktree.

This matches the unit of isolation to the unit of conflict. Workflows conflict
with each other. Agents inside a workflow must share a tree — the Lint Gate,
reviewers, and SDET all read the Engineer's output. No agent definition
changes. No merge-back plumbing between steps.

## Design

1. **Branch step becomes branch + worktree.** At the `devops-branch` step, the
   orchestrator calls `EnterWorktree` with the new feature branch instead of a
   checkout in the shared clone. All later agents inherit the worktree as their
   working directory automatically.
2. **Middle of the workflow is untouched.** Engineer, Lint Gate, Parallel
   Gates 1 and 2, and checkpoint commits operate on the worktree as they
   operate on the clone today. Existing rules stay: clean tree before Gate 2,
   never discard uncommitted work.
3. **Workflow close.** After push and PR (and merge, per `mergeStrategy`):
   `ExitWorktree`, then `git worktree remove`. The branch survives on the
   remote. `/constellation:abort` keeps the worktree so work is not lost.
4. **State isolates for free.** The state file lives inside the worktree.
   Each session gets its own state and branch with no state-format change.

## Wrinkles to solve

- **Resume discovery.** A fresh session starts in the main clone, which has no
  state file. `/constellation:resume` must run `git worktree list`, check each
  worktree for `.constellation/state/current-workflow.json`, and re-enter the
  match. If several match, ask the user which workflow to resume. This is the
  largest protocol change and is contained to the resume command.
- **Bootstrap cost.** Gitignored files do not follow the worktree:
  `node_modules`, `.env`, generated clients. Add a per-project
  `worktree-setup` hook to `config.json` (install, generate, copy `.env`).
  The orchestrator runs it after `EnterWorktree` and before the Engineer.
- **Code conflicts between parallel workflows.** Parallel changes to the same
  code conflict regardless of isolation — worktrees only make the state easy
  to reach. Mitigate in three layers:
  1. *Prevention*: at workflow start, list in-flight worktrees, read each
     state file and plan, and compare touchpoints with the new plan. On
     overlap, warn the user and recommend serial execution.
  2. *Textual conflicts*: `/constellation:ship` already requires the branch
     up to date with main. First merged wins; the second workflow syncs and
     resolves. Known hotspots: Prisma migrations (order-sensitive), generated
     GraphQL schema artifacts, CHANGELOG,
     `.constellation/metrics/workflow-log.jsonl`.
  3. *Semantic conflicts*: a clean merge can still combine into wrong
     behavior. After a sync with main, re-run the Lint Gate and the SDET
     suite before ship. If the sync touched reviewed files, re-run Gate 1 on
     the delta. This is a new protocol step for the ship path.
- **Runtime collisions.** Worktrees isolate files, not ports. Collision
  occurs only when two worktrees run the app or the e2e Docker infra at the
  same time, which is not the expected usage. Document "one running app at a
  time"; do not parameterize ports for v1.
- **Git guard.** `scripts/guard-git.sh` blocks destructive git commands while
  the tree is dirty. Verify it resolves the repo root correctly from inside a
  worktree (`git rev-parse --git-common-dir` vs `--git-dir`).

## Affected surface

- `plugins/constellation/skills/orchestrator/SKILL.md` — `devops-branch` step,
  workflow close, state notes, Parallel Execution section.
- `plugins/constellation/commands/resume.md` — worktree discovery.
- `plugins/constellation/commands/ship.md` — post-sync re-verification
  (Lint Gate + SDET, Gate 1 on the delta when needed).
- `plugins/constellation/commands/abort.md` — state that the worktree is kept.
- `plugins/constellation/skills/orchestrator/references/post-pr.md` — worktree
  removal after merge.
- `plugins/constellation/agents/devops-engineer.md` — branch creation flow.
- `config.json` schema (init templates) — optional `worktree` block:
  `{ enabled, setupScript }`. Default `enabled: false` for backward
  compatibility.
- `plugins/constellation/scripts/guard-git.sh` — verify worktree behavior.
- `constellation:branching-strategy` skill — parallel-branch merge notes.

## Acceptance criteria (sketch — refine at plan time)

1. With `worktree.enabled: true`, a workflow runs start-to-finish inside a
   dedicated worktree and removes it after PR close.
2. Two sessions in the same clone run two workflows in parallel without
   touching each other's branch, tree, or state file.
3. `/constellation:resume` from a fresh session finds and re-enters an
   in-flight worktree workflow.
4. `/constellation:abort` preserves the worktree and reports its path.
5. A new workflow whose plan overlaps an in-flight workflow's touchpoints
   produces a warning before the branch step.
6. After a sync with main, ship is blocked until the Lint Gate and the SDET
   suite pass on the merged result.
7. With `worktree.enabled: false` (default), behavior is identical to today.
