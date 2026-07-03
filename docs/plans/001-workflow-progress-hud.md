---
status: completed
date-created: 03-07-2026
last-edit: 03-07-2026
version: 001
---

# Plan 001 — Workflow Progress HUD

Ambient, consistent visibility of which SDLC step a Constellation workflow is in and how
far along the pipeline it is — rendered as emoji + step name in three places: a progress
banner in the transcript, the statusline, and `/constellation:status`.

## Problem

The orchestrator already persists everything needed (`currentStep`, `completedSteps`,
`track`, `reviewLoopCount` in `.constellation/state/current-workflow.json`), but
visibility is pull-only (`/constellation:status`) or buried in handoff narration that
scrolls away. During long autonomous runs the user cannot glance at the screen and answer
"where in the SDLC are we, and how much is left?". Escalations ("present to the user and
wait") are especially invisible — a silent hang.

**This feature adds no new tracking. It renders existing state, ambiently, from one
source of truth.**

## Goals

1. A canonical, machine-readable map of every track's step sequence (ids, emojis, labels).
2. A one-line **progress banner** printed in the transcript at every state save.
3. A **statusline** renderer (mechanical — does not depend on the model remembering).
4. `/constellation:status` renders the same visual progression (zoom-in view).
5. Consistent `currentStep` ids across ALL tracks (today only Planned Work and Discovery
   have explicit save-point ids).

## Non-goals

- No new workflow state machine, no orchestration behavior changes.
- No notification/park semantics (ROADMAP 4.5) — but the `waitingOn` field added here is
  its foundation.
- No per-subagent live progress inside a gate (the banner names the spawned agents; that
  is enough).

---

## Design

### One source of truth: `tracks.json`

Master copy: `plugins/constellation/templates/tracks.json`. Copied verbatim to
`.constellation/tracks.json` by `/constellation:init` (and re-copied on `--refresh`, same
precedent as `opencode-review.sh`). All three renderers read the project copy; the
selftest guards the master against drift with the orchestrator SKILL.

```json
{
  "modifiers": {
    "fixLoop":   { "emoji": "🔁", "label": "fix loop" },
    "escalated": { "emoji": "⛔", "label": "awaiting your decision" },
    "aborted":   { "emoji": "⏸", "label": "paused" }
  },
  "extraSteps": {
    "post-pr": { "emoji": "💬", "label": "PR Feedback" }
  },
  "tracks": {
    "planned": [
      { "id": "architect",        "emoji": "📐", "label": "Plan" },
      { "id": "plan-review",      "emoji": "🔭", "label": "Plan Review", "optionalIf": "plan-review" },
      { "id": "devops-branch",    "emoji": "🌿", "label": "Branch" },
      { "id": "engineer",         "emoji": "🔨", "label": "Implement" },
      { "id": "lint-gate",        "emoji": "🧹", "label": "Lint Gate" },
      { "id": "parallel-gate-1",  "emoji": "🔍", "label": "Review Gate" },
      { "id": "parallel-gate-2",  "emoji": "🧪", "label": "QA Gate" },
      { "id": "architect-verify", "emoji": "🧭", "label": "Verify" },
      { "id": "devops-pr",        "emoji": "🚀", "label": "PR" },
      { "id": "ship",             "emoji": "🚢", "label": "Ship" }
    ],
    "tweak": [
      { "id": "devops-branch",   "emoji": "🌿", "label": "Branch" },
      { "id": "engineer",        "emoji": "🔨", "label": "Implement" },
      { "id": "lint-gate",       "emoji": "🧹", "label": "Lint Gate" },
      { "id": "parallel-gate-1", "emoji": "🔍", "label": "Review Gate" },
      { "id": "sdet",            "emoji": "🧪", "label": "Tests" },
      { "id": "devops-pr",       "emoji": "🚀", "label": "PR" },
      { "id": "ship",            "emoji": "🚢", "label": "Ship" }
    ],
    "hotfix": [
      { "id": "devops-branch", "emoji": "🌿", "label": "Branch" },
      { "id": "engineer",      "emoji": "🚑", "label": "Fix" },
      { "id": "lint-gate",     "emoji": "🧹", "label": "Lint Gate" },
      { "id": "review-gate",   "emoji": "🔍", "label": "Review" },
      { "id": "sdet",          "emoji": "🧪", "label": "Tests" },
      { "id": "devops-pr",     "emoji": "🚀", "label": "PR" },
      { "id": "ship",          "emoji": "🚢", "label": "Ship" }
    ],
    "discovery": [
      { "id": "product-manager",       "emoji": "💡", "label": "Discovery" },
      { "id": "architect-feasibility", "emoji": "📐", "label": "Feasibility" }
    ],
    "spike": [
      { "id": "architect", "emoji": "📐", "label": "Frame" },
      { "id": "engineer",  "emoji": "🔬", "label": "Explore" },
      { "id": "findings",  "emoji": "📄", "label": "Findings" }
    ]
  }
}
```

Rules all renderers share:

- **Denominator** = steps in the track minus optional steps not enabled in config.
  `optionalIf: "plan-review"` → include only when `crossModelValidation.enabled` is true
  AND its `steps` contains `"plan-review"`.
- **Loops never move the pointer backward.** While `reviewLoopCount > 0` and
  `currentStep` is `engineer`/`lint-gate` with `parallel-gate-1` (or `review-gate`)
  already in `completedSteps`' trajectory, the display stays anchored on the gate step
  with the `🔁 loop N/3` modifier. Concretely: the anchor step is the **furthest** step
  reached (max index over `completedSteps ∪ {currentStep}`); the modifier tells the rest.
- **`post-pr`** is not in any track sequence — when `currentStep` is `post-pr`, render it
  from `extraSteps` appended after `devops-pr` (denominator +1 for that render).
- **Unknown step id** (future steps, e.g. a later `escalated` park state) → render
  `▶ ⚙️ <raw-id>` and never fail. Renderers must be forward-compatible.
- **`waitingOn: "user"`** in state → append `⛔ awaiting your decision`.

### State schema addition (the only one)

`waitingOn: null | "user"` — set whenever the orchestrator presents open questions,
escalated blockers, loop-cap escalations, or a merge confirmation and stops; cleared when
the user answers. Purely presentational today; ROADMAP 4.5 park semantics will build on it.

### Renderer 1 — progress banner (transcript, prompt-level)

New orchestrator SKILL section **"Progress Banner"**, and one rule change: every
**"→ Save state"** is now "save state, then print the banner rendered from what you just
saved". Coupling the banner to the already-mandatory save is what keeps it reliable —
no independently forgettable step.

Format (one line, code-span so it survives markdown rendering):

```
🌌 <track> <n>/<N> │ <done: emoji✓ each> ▶<emoji> <Label> <pending: · each> │ <modifiers> │ <branch>
```

Examples:

```
🌌 planned 6/10 │ 📐✓ 🔭✓ 🌿✓ 🔨✓ 🧹✓ ▶🔍 Review Gate · · · · │ feat/011-audit-log
🌌 planned 6/10 │ 📐✓ 🔭✓ 🌿✓ 🔨✓ 🧹✓ ▶🔍 Review Gate · · · · │ 🔁 loop 1/3 — 2 blockers → 🔨 fixing │ feat/011-audit-log
🌌 tweak 4/7 │ 🌿✓ 🔨✓ 🧹✓ ▶🔍 Review Gate · · · │ fix/typo-in-readme
🌌 planned 9/10 │ … ▶💬 PR Feedback │ ⛔ awaiting your decision │ feat/011-audit-log
```

`<n>` is the 1-based index of the anchor step; done/pending glyph counts always sum to
`<N>`. When spawning gate agents, the handoff sentence (already mandatory) follows the
banner and names agents + models — the banner does not duplicate that.

### Renderer 2 — statusline (mechanical anchor)

`plugins/constellation/templates/statusline.sh` → copied to
`.constellation/scripts/statusline.sh` (chmod +x) by init. Wired opt-in into the
project's `.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": ".constellation/scripts/statusline.sh" } }
```

Behavior spec:

1. Read the statusline JSON from stdin; resolve the project dir from
   `.workspace.current_dir // .cwd`. Accept `--state <file>` override (used by selftest).
2. No `.constellation/state/current-workflow.json`, or `jq` missing → print nothing,
   exit 0 (inert outside workflows; a default statusline can be chained by the user).
3. Otherwise render the compact HUD from state + `.constellation/tracks.json`:

```
🌌 planned │ ✓✓✓✓✓ ▶🔍 Review Gate 6/10 │ 🔁 1/3 │ feat/011-audit-log │ ⏱ 12m
```

   - Done steps compress to a run of `✓` (width discipline — statusline is one line).
   - `🔁 R/3` only when `reviewLoopCount > 0`; `⛔ awaiting decision` when
     `waitingOn == "user"` (place it first, it is the highest-value signal).
   - `⏱ <age>` from `lastUpdatedAt`, shown only when older than 10 minutes (staleness
     hint, not noise).
   - Same anchor-step/optional-step/unknown-id rules as the banner.
4. Any parse error → print nothing, exit 0. The statusline must never break a session.

### Renderer 3 — `/constellation:status` (zoom-in)

Replace the prose bullet list in `commands/status.md` with: the banner line first, then a
vertical step table —

```
🌌 planned 6/10 │ 📐✓ 🔭✓ 🌿✓ 🔨✓ 🧹✓ ▶🔍 Review Gate · · · · │ feat/011-audit-log

  📐 Plan          ✓  plan: 011-add-audit-log.md
  🔭 Plan Review   ✓  cross-model: PASS
  🌿 Branch        ✓  feat/011-audit-log
  🔨 Implement     ✓
  🧹 Lint Gate     ✓  1 retry
  🔍 Review Gate   ▶  loop 1/3 — reviewer: BLOCKED (2), security: PASS
  🧪 QA Gate       ·
  🧭 Verify        ·
  🚀 PR            ·
  🚢 Ship          ·
```

Details per step come from existing state fields (`gate1Results`, `gate2Results`,
`planReviewResult`, `prNumber`, `hadBlockers`). Keep the existing footer (model profile,
timestamps).

### Step-id normalization (prerequisite for honest rendering)

Today only Planned Work and Discovery list explicit save-point ids. The orchestrator
SKILL gains explicit **→ Save state** ids for the remaining tracks, matching
`tracks.json` exactly:

- **Tweak**: `devops-branch`, `engineer`, `lint-gate`, `parallel-gate-1`, `sdet`,
  `devops-pr`, `ship` (step 1 currently jumps straight to `engineer`; add
  `devops-branch` first).
- **Hotfix**: `devops-branch`, `engineer`, `lint-gate`, `review-gate`, `sdet`,
  `devops-pr`, `ship`.
- **Discovery**: `product-manager` (exists), add `architect-feasibility`.
- **Spike**: `architect`, `engineer`, `findings` — spikes currently save no state; add
  the saves (state file deleted at completion, as with every track). Harmless, and the
  HUD works during long spikes.

---

## Implementation steps

### Phase 1 — foundation (no behavior change)

1. **`plugins/constellation/templates/tracks.json`** — new file, content as designed
   above.
2. **`scripts/selftest.sh`** — add **check 6: track map drift**:
   - Extract every `step: "<id>"` occurrence from the orchestrator SKILL
     (`grep -oE 'step: "[a-z-]+"'`, strip to ids, sort -u).
   - Every extracted id must exist in `templates/tracks.json` (as a track step id or an
     `extraSteps` key). Every id in `tracks.json` must appear in the SKILL. Either
     direction missing → `fail`.
   - Existing checks 1–2 already cover the new files (bash -n, jq empty) for free.

### Phase 2 — transcript + status (immediate value, prompt-level only)

3. **`plugins/constellation/skills/orchestrator/SKILL.md`**:
   - New section **"Progress Banner"** (after "Workflow State Persistence"): format spec,
     the four rendering rules (anchor step, optional steps, post-pr, unknown id),
     modifiers, and the rule *"every state save is immediately followed by the banner
     rendered from the state just written"*.
   - Add the missing per-track **→ Save state** ids (normalization list above).
   - State schema block: add `"waitingOn": null`; document when it is set/cleared
     (open questions, escalations, merge confirmation ↔ user answers).
   - "Basic Rules": add *"ALWAYS print the progress banner after every state save."*
   - "What You Must Never Do": add *"Save state without printing the progress banner"*.
4. **`plugins/constellation/commands/status.md`** — replace the presentation section with
   the banner + vertical step table spec (Renderer 3).
5. **`plugins/constellation/commands/resume.md`** — after validation passes, announce the
   resumed workflow *with the banner* (one-line change to the report step).
6. **`plugins/constellation/scripts/session-start.sh`** — extend the unfinished-workflow
   notice: "…report the saved state **as the progress banner defined in the orchestrator
   skill** and offer /constellation:resume…".

### Phase 3 — statusline (mechanical anchor)

7. **`plugins/constellation/templates/statusline.sh`** — new script per the Renderer 2
   spec. Pure bash + jq; no other dependencies; every failure path exits 0 silently.
8. **`plugins/constellation/commands/init.md`**:
   - Step 3 scaffold: add `tracks.json` (verbatim copy) and
     `scripts/statusline.sh` (verbatim, chmod +x) to the tree.
   - `--refresh`: always re-copy both (canonical files, never user-edited — same rule as
     `opencode-review.sh`, but unconditional so plugin updates propagate).
   - New **step 5c — Statusline (optional, recommended)**: offer to wire
     `.claude/settings.json` → `statusLine` (create file or merge key; if a `statusLine`
     already exists, show it and ask before replacing). Skip silently if the user
     declines; the other two renderers still work.
9. **`scripts/selftest.sh`** — add **check 7: statusline fixture render**: run
   `templates/statusline.sh --state <fixture>` with a here-doc fixture state
   (`track: planned`, `currentStep: parallel-gate-1`, `reviewLoopCount: 1`, five
   completed steps) piping `{"workspace":{"current_dir":"<tmpdir>"}}` on stdin, with the
   fixture tmpdir containing a copy of `templates/tracks.json`; assert the output
   contains `▶🔍 Review Gate 6/10` and `🔁 1/3`. Also assert the no-state-file case
   prints nothing and exits 0.

### Phase 4 — docs + release

10. **`README.md`** — feature blurb (HUD: banner, statusline, status), the init statusline
    opt-in, and the per-repo `--refresh` note now also refreshing `tracks.json` +
    `statusline.sh`.
11. **`ROADMAP.md`** — record as built (sibling of 2.3), note the `waitingOn` field as the
    4.5 foundation.
12. **`CHANGELOG.md`** + version bump per the maintainer release checklist.

## Acceptance criteria

1. `scripts/selftest.sh` → `ALL GREEN`; deleting one step id from `tracks.json` (or
   renaming a `step:` id in the SKILL) makes check 6 fail with a named id.
2. Statusline fixture (check 7) renders `🌌 planned │ ✓✓✓✓✓ ▶🔍 Review Gate 6/10 │ 🔁 1/3 │ …`;
   with no state file it prints nothing and exits 0.
3. In a scratch project: `/constellation:init` scaffolds `tracks.json` +
   `scripts/statusline.sh`, offers the settings wiring, and `--refresh` re-copies both.
4. A dry tweak-track run through the orchestrator prints a banner after every state save,
   with `n/7` progressing monotonically and the Review Gate loop rendering `🔁 loop 1/3`
   anchored on the gate (never a shrinking bar).
5. `/constellation:status` mid-workflow shows the banner + vertical table with gate
   verdicts; with no state file it still reports "No workflow in progress."
6. A plan open-question stop sets `waitingOn: "user"` and both banner and statusline show
   `⛔ awaiting your decision`; answering clears it.

## Verification plan

- **Mechanical**: selftest checks 6–7 (drift + fixture render) run in this repo's CI.
- **Live**: scratch-repo exercise — init (accept statusline), run one tweak with a
  deliberately review-blocked change (to force a 🔁 loop), observe banner cadence,
  statusline updates, `/constellation:status`, and an abort/resume cycle (banner on
  resume announce).

## Risks & mitigations

- **Emoji width/rendering varies by terminal** → all formats degrade to plain text
  meaningfully (labels carry the information; emojis are accents). No box-drawing, no ANSI
  color in v1.
- **Statusline freshness = state-save freshness** → saves are already mandatory at every
  milestone; the `⏱` staleness hint surfaces drift instead of hiding it.
- **Prompt-level banner can drift over long runs** → acceptable: the statusline is the
  mechanical anchor; the selftest pins the vocabulary; the banner rides the mandatory
  save ritual.
- **Project copy of `tracks.json` outdated after plugin update** → unconditional re-copy
  on `--refresh`, called out in README's update instructions.

## Out of scope (parked)

- Escalation notifications + full park semantics → ROADMAP 4.5 (builds on `waitingOn`).
- Per-agent live progress inside parallel gates.
- Rendering gate summary/history into the PR description (already covered by the gate
  summary comment).
