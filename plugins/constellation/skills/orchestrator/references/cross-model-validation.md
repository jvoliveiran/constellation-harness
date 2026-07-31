# Cross-Model Validation — full protocol

Loaded on demand by the orchestrator when `crossModelValidation.enabled` is `true`
(see the stub in SKILL.md). `constellation:cross-model-reviewer` bridges to a
different model family (e.g. Gemini or GPT via the local `opencode` CLI) at the steps
listed in `crossModelValidation.steps`:

- `"code-review"` → Gate 1 gains an **additional blocking reviewer** over the **same diff**
  the Claude code-reviewer sees. Spawn it in the **same message** as the other gate agents
  (§Parallel Execution → Gate 1).
- `"plan-review"` → the Architect's drafted plan gets a **cross-model critique** before
  the branch is created (Planned Work step 1b; rules below).

## The cross-model verdict can be PASS, BLOCKED, or SKIPPED

- **SKIPPED** = infrastructure failure (opencode missing, `model_not_found`, timeout,
  unparseable output). Treat as **no cross-model signal this pass** — proceed on the Claude
  reviews exactly as if the cross-model reviewer were not configured. **Never a blocker.** Log
  `crossModelSkipped` with the reason. This is `onInfraFailure: skip` and is load-bearing:
  a slow/throttled model must never block delivery.
- **PASS / BLOCKED** = a real verdict → feed into the merge below.

## Merge rules (blocking, with escalate-on-unconfirmed)

The Claude reviewers remain authoritative and behave exactly as today. The cross-model
reviewer covers the **same ground**, so its blockers are classified by confirmation:

| 🔴 Blocker raised by | Meaning | Action |
|---|---|---|
| Cross-model **and** a Claude reviewer (same issue) | Confirmed | **Loop** Engineer (normal fix flow) |
| A Claude reviewer only | Authoritative (unchanged from today) | **Loop** Engineer |
| **Cross-model only** — no Claude reviewer raised it | Unconfirmed / disagreement | Per `onUnconfirmedBlocker`: **`escalate`** (default) → present to the user as an open question, do NOT auto-loop, do NOT increment the loop counter; **`loop`** → treat like a confirmed blocker |

**Escalation** presents the unconfirmed blocker(s) inline as open questions (both
positions — what the cross-model flagged and that no Claude reviewer confirmed it) and waits
for the user: accept risk / send back to Engineer / abort. Reuse the same inline
open-question flow as Architect open questions. Log `crossModelEscalated`.

Confirmed and Claude-only blockers loop through the Engineer + Lint Gate as usual and honor
the **3-loop cap**. On fix passes, the cross-model reviewer gets the **incremental diff**
plus the original blocker list, same as the Claude reviewers.

## Plan review (`steps` include `"plan-review"`) — Planned Work only

Runs at step 1b of Planned Work, after the plan is drafted (and, for product-scoped work,
after PM × Architect convergence). Spawn `constellation:cross-model-reviewer` with:
the plan content + the original request + the config (`model`, `effort`, `timeoutSec`) +
*"Subagent mode: plan-review — critique the plan, return the contract."* The expected
contract is the `Cross-Model Plan Review Result` (defined in the agent).

There is no second Claude plan reviewer, so confirmation works differently from Gate 1:
the **Architect adjudicates** each cross-model 🔴 (agreement = Architect accepts, the
analog of two models agreeing on a diff blocker):

| Cross-model plan 🔴 | Meaning | Action |
|---|---|---|
| Architect **accepts** | Confirmed gap | Architect **revises the plan** to address it |
| Architect **disputes** | Disagreement | Per `onUnconfirmedBlocker`: **`escalate`** (default) → joins the plan's open questions at step 2 (both positions presented; user decides: adopt the change / keep the plan as written / abort); **`loop`** → Architect must revise to address it anyway |
| VERDICT `SKIPPED` | No cross-model signal | Proceed with the plan as-is; log `crossModelSkipped` |

- **Single pass**: the revised plan is NOT re-critiqued — the revision addressed accepted
  blockers and disputes went to the user; re-critiquing invites plan ping-pong.
- SUGGESTIONS go to the Architect to incorporate or ignore — they never block and never
  escalate.
- Plan review never touches the review loop counter — that belongs to Gate 1.

## Metrics

Append to `gate1Results.crossModel` (code review) and `planReviewResult` (plan review) in
state. Log `crossModelBlockers`, `crossModelEscalated`, `crossModelSkipped` counts in the
`gate1-pass` / `gate1-blocked` events, and `planReviewBlockers`, `planReviewEscalated`,
`planReviewSkipped` in a `plan-review` event.
