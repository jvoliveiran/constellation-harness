# Artifact Model v1 — full rules

Loaded on demand by the orchestrator whenever a workflow creates, refines, or
closes an epic, feature, task, or plan (see the stubs in SKILL.md). Spec:
`docs/specs/artifact-model-v1.md` in the harness repo.

The hierarchy is **Epic → Feature → Task → Plan** plus free-form **Artifacts**.
The **task is the unit of work**: every workflow starts on a task and ends on
a task. The plan is the detailed refinement of one task.

Links always point **up** (child → parent). Parents never list children.
Portfolio commands derive the tree by scanning child front-matter.

## Directories

```
.constellation/
├── epics/          E01-mvp-launch.md
├── features/       F001-user-onboarding.md
├── tasks/          014-export-csv.md          (+ archive/)
├── plans/          014-export-csv.md          (+ archive/)  ← same number + slug as its task
└── artifacts/      prd-E01-mvp-launch.md, spike-<slug>.md, …
```

Tasks own the number sequence. Plans inherit the number and slug of their
task — there is no separate plan sequence. Epics use the `E<NN>` prefix,
features the `F<NNN>` prefix. Artifacts have no sequence: `<kind>-<slug>.md`.

Documentation directories (`adrs/`, `runbooks/`, `designs/`, `memory/`) are
outside this model — do not restructure them.

## Front-matter schemas

### Epic — `epics/E<NN>-<slug>.md`

```markdown
---
status: draft            # draft | active | done | dropped
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
---
# <Title>
<Purpose of the effort. What "done" means for the whole epic.>
```

### Feature — `features/F<NNN>-<slug>.md`

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

### Task — `tasks/NNN-<slug>.md`

```markdown
---
status: inbox            # inbox | refined | in-progress | done | dropped | parked
type: feature            # feature | fix | refactor | debt | spike | discovery
source: user             # user | dx-analyst | codex | <agent/tool/person>
feature: F001-user-onboarding.md   # optional
order: 1                 # optional — roadmap position inside the feature
related: 009-old-fix.md  # optional — follow-up link, see Workflow binding
revisit: <trigger>       # required when status is parked
commit: <sha>            # set when status becomes done
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
---
# <Title>
<Base description: what to change and why, product perspective only.>
<PM refinement adds BDD acceptance criteria here. The task owns WHAT.>
```

### Plan — `plans/NNN-<slug>.md`

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

The plan carries document maturity only (`draft → approved`). Work state
lives on the task. The Architect never sets a plan "completed" — completion
is the task moving to `done`.

### Artifact — `artifacts/<kind>-<slug>.md`

```markdown
---
kind: prd                # prd | spike-findings | discovery-notes | note
linked: E01-mvp-launch.md   # optional — any epic/feature/task file
date-created: DD-MM-YYYY
last-edit: DD-MM-YYYY
---
```

A PRD (`kind: prd`) links to an epic. ADRs are not an artifact kind — they
stay in `adrs/` under the Technical Writer convention.

## Lifecycles

### Epic and Feature: `draft → active → done | dropped`

- Create in `draft` with no children — brainstorms capture first.
- Before the transition to `active`: verify at least one child points to the
  file (a feature with `epic:` for epics, a task with `feature:` for
  features). If none exists, refuse the transition.
- Set `done` when every linked child is `done` or `dropped`. This check is
  manual — the PM confirms; no automatic roll-up.

### Task: `inbox → refined → in-progress → done | dropped | parked`

- `inbox` — filed at intake. Title and base description only.
- `refined` — enriched and ready for pickup. Product tasks: the PM adds BDD
  acceptance criteria. Technical tasks: the Architect adds context. Tweaks
  and hotfixes skip this state.
- `in-progress` — a workflow picked the task up. Set at branch creation, or
  at workflow start for branchless tracks.
- `done` — the workflow shipped. Record the merge commit in `commit:`.
- `dropped` — deliberately not pursued. Append a one-line reason to the body.
- `parked` — deferred with an explicit `revisit:` trigger (this replaces the
  v0 product parking lot). Review parked tasks for fired triggers during
  Discovery.
- Archive: tasks `done`/`dropped` for 30+ days move to `tasks/archive/`,
  together with their plan file (Technical Writer sweep).

### Plan: `draft → approved`

- The Architect sets `draft` on creation, `approved` when open questions are
  resolved. Product-scoped plans also require the PM × Architect pairing to
  converge (`scope-approved-by`).

## Intake — every workflow starts on a task

The orchestrator files the task itself. Task filing is clerical — never
spawn a subagent for it.

1. Classify the track (normal procedure).
2. If the request enters a track (planned, tweak, hotfix, spike, discovery):
   write `tasks/NNN-<slug>.md` with `status: inbox`, a `type`, `source`, a
   title, and the request as base description. Do not summarize the request.
3. If the request is a pure question or conversation: do not file a task.
   The track classifier is the gate.
4. Refinement, when the track needs it:
   - Product-scoped planned work → the PM refines the task (WHAT: value,
     BDD criteria), then the Architect writes the plan (HOW). Feasibility
     pushback from the pairing loop edits the task; design stays in the plan.
   - Purely technical planned work → the Architect refines and plans alone.
   - Tweaks and hotfixes → no refinement; the task stays minimal.
5. Set the task `in-progress` when the workflow starts real work.

Type mapping at intake: feature request → `feature`; bug → `fix`;
restructure → `refactor`; DX/debt finding → `debt`; exploration → `spike`;
product brainstorm → `discovery`.

## Workflow binding

One task ↔ one workflow. All steps of a workflow — lint loops, review fix
passes, gate re-runs — are internal to that one task. Never file tasks for
workflow-internal work.

1. **Post-PR feedback before ship = same task.** PR comment rounds are steps
   of the still-open workflow.
2. **Anything after ship = new task.** A bug in shipped work is a new
   `type: fix` task with an optional `related:` link. Never reopen a `done`
   task.
3. **Abort/resume = same task.** The task stays `in-progress` across
   sessions; the state file carries the task as the resume anchor.

Branch naming: `<type>/<task-number>-<slug>`. The task number replaces the
v0 plan number.

## v0 migration guard

`"artifactModel": 1` in `.constellation/config.json` marks a migrated
project. When the orchestrator starts a workflow in a project without the
marker (a v0 layout: `improvements/`, `product/`, unnumbered tasks): offer
the migration below first. If the user declines, stop — do not run a v1
workflow over v0 artifacts. Exception: the Hotfix track proceeds without
task filing; production speed outranks bookkeeping.

Migration (run once, then write `"artifactModel": 1` to `config.json`):

1. Create `epics/`, `features/`, `artifacts/`.
2. For each **active** plan without a backing task: create the task with the
   plan's number, slug, and status mapping — plan `completed` → task `done`
   (copy `commit:`), `in-progress` → `in-progress`, else `refined`. Add
   `task: <file>` to the plan; strip work states from the plan front-matter.
3. For each v0 task: assign the next free number if the file has none; add
   `type:` (infer from the body; default `feature`).
4. For each improvement: create a task — `type: debt` (or `refactor`),
   `source: dx-analyst`; status `open` → `inbox`, `promoted` →
   `in-progress`, `done`/`dropped` unchanged. Delete `improvements/`.
5. Move `product/` and `spikes/` files to `artifacts/` with a `kind:`.
   PRDs get `kind: prd`; create a `draft` epic for a PRD when the effort it
   describes is still live, and link it. Parking-lot entries become `parked`
   tasks with `revisit:`. Delete the emptied directories.
6. Continue the task number sequence from
   `max(existing task numbers, existing plan numbers) + 1`.
7. `plans/archive/` and `tasks/archive/` are NOT migrated — archives are
   read-only history. Documentation directories are untouched.
8. Commit with `.constellation/scripts/sync-artifacts.sh`.
