# Artifact Model v1 — Epic / Feature / Task / Plan

Status: draft
Date: 31-08-2026
Replaces: plans + tasks + improvements + parking lot (artifact model v0)

## 1. Purpose

The v0 model has five overlapping containers: plans, tasks, improvements, the
debt report, and the product parking lot. Users cannot tell when to use each.

The v1 model has one hierarchy and one document type:

- **Epic → Feature → Task → Plan** — containment, largest to smallest.
- **Artifact** — any markdown document, optionally linked to one node above.

The **task is the unit of work**. Every workflow starts on a task and ends on
a task. The plan is the detailed refinement of a task, produced as the first
work output of a planned task. Improvements and the parking lot merge into
tasks. The debt command stays a derived report.

## 2. Concepts

| Concept | Definition | Created by |
|---|---|---|
| Epic | The purpose of a major effort (an MVP, a new user journey). Groups features. | PM, during Discovery |
| Feature | The description of what a capability must add at the end. Groups tasks. | PM, during Discovery or refinement |
| Task | One change to apply, described from a product perspective. One task = one workflow. | Orchestrator, at intake |
| Plan | The implementation detail of one task. Written by the Architect. | Architect, as first work output |
| PRD | An artifact of kind `prd`, linked to an epic. | PM |
| Artifact | A markdown document: spike findings, discovery notes, any finding worth keeping. | Any agent |

Existence rules:

- A feature can exist without an epic.
- A task can exist without a feature. Tweaks and hotfixes stay feature-less.
- A plan cannot exist without a task.
- Child constraints apply at **activation**, not at creation (see §5).

## 3. Directory layout

```
.constellation/
├── epics/          E01-mvp-launch.md
├── features/       F001-user-onboarding.md
├── tasks/          014-export-csv.md
│   └── archive/
├── plans/          014-export-csv.md        # same number and slug as its task
│   └── archive/
├── artifacts/      prd-E01-mvp-launch.md
│                   spike-graphql-federation.md
├── memory/         review-patterns.md        # unchanged
├── metrics/        workflow-log.jsonl        # unchanged, gitignored
└── state/          current-workflow.json     # unchanged, gitignored
```

Documentation directories are **out of scope**: `adrs/`, `runbooks/`,
`designs/`, and `memory/` persist unchanged where projects have them. The v1
model restructures work tracking, not documentation.

Layout decisions:

- Flat files per type, links in front-matter. A directory-per-task layout was
  considered and rejected: it breaks every glob in the commands and scripts
  for no information gain.
- **Tasks own the number sequence.** Plans inherit the number and slug of
  their task. There is no separate plan sequence.
- Epics use the `E<NN>` prefix. Features use the `F<NNN>` prefix. This keeps
  the three sequences visually distinct in links and branches.
- Artifacts have no sequence. Name them `<kind>-<slug>.md`.
- `improvements/`, `product/`, and `spikes/` directories are retired (see §11).

## 4. Front-matter schemas

Links always point **up** (child → parent). Parents never list children.
Portfolio commands derive the tree by scanning child front-matter.

### Epic

```markdown
---
status: draft            # draft | active | done | dropped
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
---
# <Title>
<Purpose of the effort. What "done" means for the whole epic.>
```

### Feature

```markdown
---
status: draft            # draft | active | done | dropped
epic: E01-mvp-launch.md  # optional
order: 2                 # optional — roadmap position inside the epic
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
---
# <Title>
<What this feature must add at the end. Acceptance from a user perspective.>
```

### Task

```markdown
---
status: inbox            # inbox | refined | in-progress | done | dropped | parked
type: feature            # feature | fix | refactor | debt | spike | discovery
source: user             # user | dx-analyst | codex | <agent/tool/person>
feature: F001-user-onboarding.md   # optional
order: 1                 # optional — roadmap position inside the feature
related: 009-old-fix.md  # optional — see §7 rule 2
revisit: <trigger>       # required when status is parked
commit: <sha>            # set when status becomes done
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
---
# <Title>
<Base description: what to change and why, product perspective only.>
<PM refinement adds BDD acceptance criteria here. The task owns WHAT.>
```

### Plan

```markdown
---
status: draft            # draft | approved
task: 014-export-csv.md  # required
scope-approved-by: product-manager, software-architect   # product-scoped plans only
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
---
# <Title>
<Implementation steps, design, risks, validation. The plan owns HOW.>
```

The plan carries document maturity only. Work state (`in-progress`, `done`)
lives on the task. This removes the v0 double bookkeeping where the Architect
closed the plan and the task in two edits.

### Artifact

```markdown
---
kind: prd                # prd | spike-findings | discovery-notes | note
linked: E01-mvp-launch.md   # optional — any epic/feature/task file
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
---
```

A PRD (`kind: prd`) links to an epic. Other kinds link to any node or to
nothing. ADRs are not an artifact kind — they stay in `adrs/` under the
existing Technical Writer convention (see §3, documentation is out of scope).

## 5. Lifecycles and constraints

### Epic: `draft → active → done | dropped`

- Create an epic in `draft` with no children. Brainstorms capture first.
- Before the transition to `active`, verify that at least one feature points
  to the epic. If none exists, refuse the transition.
- Set `done` when every linked feature is `done` or `dropped`. This check is
  manual — the PM confirms, no automatic roll-up.

### Feature: `draft → active → done | dropped`

- Create a feature in `draft` with no children.
- Before the transition to `active`, verify that at least one task points to
  the feature. If none exists, refuse the transition.
- Set `done` when every linked task is `done` or `dropped`. Manual check.

### Task: `inbox → refined → in-progress → done | dropped | parked`

- `inbox` — filed at intake (§6). Title and base description only.
- `refined` — enriched and ready for pickup. Product tasks: the PM adds BDD
  acceptance criteria. Technical tasks: the Architect adds context. Small
  tweaks can skip this state and go straight to `in-progress`.
- `in-progress` — a workflow picked the task up. Set at branch creation, or
  at workflow start for branchless tracks.
- `done` — the workflow shipped. Record the merge commit in `commit:`.
- `dropped` — deliberately not pursued. Append a one-line reason to the body.
- `parked` — deferred with an explicit `revisit:` trigger. This replaces the
  v0 product parking lot.
- Archive: tasks `done`/`dropped` for 30+ days move to `tasks/archive/`,
  together with their plan file. Same sweep as v0 (Technical Writer).

### Plan: `draft → approved`

- The Architect sets `draft` on creation.
- Set `approved` when open questions are resolved. Product-scoped plans also
  require the PM × Architect pairing to converge (`scope-approved-by`).

## 6. Intake — every workflow starts on a task

The orchestrator files the task. No subagent is spawned for intake — task
filing is clerical, like the v0 improvement files the orchestrator already
wrote itself.

1. Classify the track (unchanged v0 procedure).
2. If the request enters a track (planned, tweak, hotfix, spike, discovery):
   write `tasks/NNN-<slug>.md` with `status: inbox`, a `type`, `source`, a
   title, and the request as base description. Do not summarize the request.
3. If the request is a pure question or conversation: do not file a task.
   The track classifier is the gate.
4. Refinement, when the track needs it:
   - Product-scoped work → the PM refines the task (WHAT: value, BDD
     criteria), then the Architect writes the plan (HOW). The pairing loop
     applies: feasibility pushback edits the task, design stays in the plan.
   - Purely technical planned work → the Architect refines and plans alone.
   - Tweaks and hotfixes → no refinement. The task stays minimal.
5. Set the task `in-progress` when the workflow starts real work.

Type mapping at intake: feature request → `feature`; bug → `fix`;
restructure → `refactor`; DX/debt finding → `debt`; exploration → `spike`;
product brainstorm → `discovery`.

DX Analyst findings: the orchestrator files them as tasks
(`type: debt` or `refactor`, `source: dx-analyst`, `status: inbox`) instead
of v0 improvement files. They stay advisory: a backlog, never a gate.

## 7. Workflow binding

One task ↔ one workflow. All steps of a workflow — lint loops, review fix
passes, gate re-runs — are internal to that one task. Never file tasks for
workflow-internal work.

Edge rules:

1. **Post-PR feedback before ship = same task.** PR comment rounds are steps
   of the still-open workflow.
2. **Anything after ship = new task.** A bug in shipped work is a new
   `type: fix` task with an optional `related:` link. Never reopen a `done`
   task — it breaks per-task cost accounting.
3. **Abort/resume = same task.** The task stays `in-progress` across
   sessions. The state file carries the task id as the resume anchor.

Branch naming: `feat/<task-number>-<slug>` (and `fix/`, `hotfix/` per the
branching skill). The task number replaces the v0 plan number.

State file: `current-workflow.json` gains `"task": "014-export-csv.md"` as
the primary reference. The `plan` field remains for planned tracks and holds
the same number.

Metrics: every event carries `task`. Token cost per task rolls up to features
and epics through the front-matter links.

## 8. Command changes

| Command | Verdict | Change |
|---|---|---|
| `/constellation:backlog` | **New** | Tree view: epics → features → tasks, with status, type, plan presence. Flags the in-flight task. Filters: `--type`, `--status`, `--feature`, `--epic`. |
| `/constellation:tasks` | Remains | Flat pipeline list. Gains `type` column and the same filters. Inbox queue first. |
| `/constellation:plans` | Remains | Lists plans with their task pairing (same number). Status column shows plan maturity + task work state. |
| `/constellation:improvements` | **Removed** | Improvements are tasks now. No alias — an alias preserves the confusion. |
| `/constellation:debt` | Remains | Still a derived lint report. Cross-reference target changes: the code-metrics baseline is tracked in a `type: debt` task, not an improvement file. |
| `/constellation:status` | Remains | Shows the task id in the banner line. |
| `/constellation:init` | Updated | Scaffolds the v1 directories. Writes `"artifactModel": 1` to `config.json`. |
| `/constellation:metrics` | Updated | Reports cost per task; rolls up per feature/epic via links. |
| `/constellation:resume`, `/abort`, `/skip-gate`, `/ship`, `/dry-run` | Unchanged | Workflow-state commands, orthogonal to the artifact model. |

## 9. Orchestrator skill changes

- Replace `references/task-lifecycle.md` with `references/artifact-model.md`
  containing §4–§7 of this spec.
- Add the intake step (§6) to every track, before the first agent handoff.
- Rewrite Merging-results rule 10: file `type: debt` tasks instead of
  improvement files.
- Delete the Plan Lifecycle section's work states; keep `draft → approved`.
- Task Lifecycle section: point to the new reference.
- Progress banner and state persistence: add the task id.
- Discovery track output: epic (+ PRD artifact) instead of loose files in
  `product/`. Parking-lot review becomes a scan of `status: parked` tasks
  with fired `revisit:` triggers.
- Spike track output: `artifacts/spike-<slug>.md` linked to the spike task.

## 10. Agent and template changes

- `dx-analyst.md`: output contract unchanged (advisory findings); the
  orchestrator writes tasks from it. Update the wording that names
  improvement files.
- `product-manager.md`: Discovery outputs are epics, features, and PRD
  artifacts. Parking decisions become `parked` tasks with `revisit:`.
- `software-architect.md`: plan front-matter per §4; task refinement duty
  per §6.4; on completion set the **task** to `done` with the commit sha.
- `technical-writer.md`: archive sweep covers `tasks/` + paired plans.
- Templates: retire `parking-lot.md` and `roadmap.md` (the backlog view
  derives the roadmap from `order:` fields). Keep `project-map.md`,
  `review-patterns.md`, `tracks.json`.
- `sync-artifacts.sh`: unchanged (stages `.constellation/` — covers the new
  directories automatically).

## 11. Backwards compatibility and migration

### Compatibility policy

- **No dual-format runtime.** V1 commands and skills read v1 front-matter
  only. The harness logic is LLM-interpreted markdown; two live schemas
  double the ambiguity that v1 exists to remove. Migration is the
  compatibility mechanism, not format tolerance.
- **Version guard.** `"artifactModel": 1` in `config.json` marks a migrated
  project. The plugin updates globally, but projects migrate individually —
  a v1 plugin will meet unmigrated projects.
- **Unmigrated-project window.** When the orchestrator starts a workflow in
  a project without the marker: offer the migration first (one mechanical
  session, see below). If the user declines, stop — do not run a v1 workflow
  over v0 artifacts. Exception: the Hotfix track proceeds without task
  filing; production speed outranks bookkeeping.
- **Migration is lossless.** Every v0 file maps to a v1 file. Git history
  keeps the originals. Nothing is deleted except empty directories.
- **Frozen history stays frozen.** `plans/archive/` and `tasks/archive/`
  are not migrated. Archives are read-only history; commands treat them as
  inert. New archive sweeps write v1 files alongside old v0 files — both are
  terminal states, no command parses archived front-matter.
- **Documentation is untouched.** `adrs/`, `runbooks/`, `designs/`,
  `memory/` keep their v0 layout and conventions (see §3).

### Migration procedure

Run once per project, then write `"artifactModel": 1` to `config.json`:

1. Create `epics/`, `features/`, `artifacts/`.
2. For each **active** plan without a backing task: create the task with the
   plan's number, slug, and status mapping — plan `completed` → task `done`
   (copy `commit:`), `in-progress` → `in-progress`, else `refined`. Add
   `task: <file>` to the plan; strip work states from the plan front-matter.
3. For each v0 task: assign the next free number if the file has none; add
   `type:` (infer from the body; default `feature`). Map `refined` →
   `refined`, keep other statuses.
4. For each improvement: create a task — `type: debt` (or `refactor`),
   `source: dx-analyst`, status `open` → `inbox`, `promoted` →
   `in-progress`, `done`/`dropped` unchanged. Delete `improvements/`.
5. Move `product/` and `spikes/` files to `artifacts/` with a `kind:`.
   PRDs get `kind: prd`; create a `draft` epic for a PRD when the effort it
   describes is still live, and link it. Parking-lot entries become `parked`
   tasks with `revisit:`. Delete the emptied directories.
6. Continue the task number sequence from
   `max(existing task numbers, existing plan numbers) + 1`.
7. Commit with `.constellation/scripts/sync-artifacts.sh`.

Reference inventory (01-09-2026): the largest adopted project (user-service)
holds 11 active plans, ~16 improvements, 3 product docs + PRDs, 1 spike, and
an empty task inbox. The harness repo holds 1 unnumbered task. Migration is
a single-session job.

## 12. Out of scope

- Automatic status roll-up (feature auto-done when tasks close). Manual only.
- Multiple workflows per task, task reopening.
- Cross-repo epics.
