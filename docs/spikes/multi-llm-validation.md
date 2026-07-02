---
title: Multi-LLM Validation (opencode) — Design Spike
status: phase-1+2-built (live A/B eval pending on Google auth) — see §14, §17
author: João Oliveira
date-created: 2026-07-01
last-edit: 2026-07-01
supersedes: n/a
relates-to: ROADMAP.md (Tier 2/3), orchestrator skill (Gate 1)
---

# Multi-LLM Validation via local opencode — Design Spike

## 1. Summary

Add an **optional, off-by-default cross-model review** to the Constellation quality
gates. When enabled, the harness runs a second-family model (GPT, via the user's
local **`opencode`** CLI) over the *same* changes the Opus reviewers see, and merges
its findings into the gate using a **blocking** policy with **escalate-on-disagreement**.

The single supported backend is **local `opencode`**. There is no codex integration
and no other provider bridge. If `opencode` is not installed/authenticated, the
feature simply stays inert.

First delivery target: **code review (Gate 1)** only. Plan review is a documented
phase 2, out of scope for the first cut.

---

## 2. Motivation

Two Opus reviewers agreeing (code-reviewer + security-analyst) is weaker evidence than
two *different model families* agreeing. A cross-model pass:

- catches defects a single family is systematically blind to (different training,
  different failure modes);
- turns "one model's opinion" into "cross-validated finding" when models agree;
- surfaces genuine judgment disagreements to a human instead of hiding them.

The cost — extra latency, extra API spend, and a more complex merge — is why it is
**opt-in per repo** and defaults to off.

---

## 3. Goals / Non-goals

### Goals
- One config flag turns cross-model validation on/off per repo.
- Backend is **local `opencode`** only, invoked headlessly.
- Cross-model reviewer returns the **existing** Review Result contract — no new format.
- Blocking merge policy with escalate-on-unconfirmed (defined in §7).
- **Zero behavioral change** for repos that don't enable it.
- Infrastructure failures (opencode down/timeout/unauthed) never block the pipeline.

### Non-goals (explicitly out of scope)
- **Codex / any non-opencode backend.** Removed from the design entirely.
- Plan-review integration in the first cut (phase 2 — §11).
- Multi-model validation of Gate 2 (SDET / Technical Writer).
- Auto-tuning of models or reasoning effort.
- Running more than one external model per gate (single external reviewer only).

---

## 4. Decisions locked (from design discussion)

| Decision | Choice | Rationale |
|---|---|---|
| Backend | **local `opencode` only** | Simplicity; single CLI the harness controls; codex dropped |
| Model family | **GPT via opencode** — superseded by **Gemini free tier** (§17) | Only OpenAI was authed at design time; §17 moves the recommendation to a free model |
| Merge policy | **Blocking** | External 🔴 gates the pipeline like an Opus 🔴 |
| Disagreement | **Escalate to user** | A cross-model-only blocker is human-adjudicated, never auto-looped |
| Review lens | **Same ground** as Opus code-reviewer | Maximizes agreement signal; makes "unconfirmed" meaningful |
| First step | **Code review (Gate 1)** | Concrete diff, existing contract, easy to A/B |
| Default | **Disabled** | No impact on existing repos |
| Infra failure | **Skip + log, never block** | One flaky API call must not halt delivery |

---

## 5. Where it plugs in

Only **Parallel Gate 1 (Review)** changes. Today:

```
Lint Gate → [ code-reviewer (Opus) + security-analyst (Opus) ]  (single message, parallel)
```

With the feature enabled:

```
Lint Gate → [ code-reviewer (Opus) + security-analyst (Opus) + cross-model-reviewer (GPT/opencode) ]
             └──────────────── all spawned in one message, run concurrently ────────────────┘
```

The third reviewer runs **concurrently** with the two Opus reviewers: it is a
Bash-enabled subagent whose Bash call to `opencode run` blocks until GPT responds, so
wall-clock ≈ the slowest of the three, not the sum. Gate 2, hotfix flow, spikes, and
discovery are untouched.

---

## 6. Components

### 6.1 Config block — `.constellation/config.json`

```jsonc
"crossModelValidation": {
  "enabled": false,                 // master switch — default OFF
  "model": "google/gemini-3-flash-preview", // opencode "provider/model" — free-tier recommendation (§17); live-probed at init
  "effort": "",                     // opencode --variant (reasoning effort); GPT-oriented knob — leave unset for Gemini
  "steps": ["code-review"],         // phase 1: code-review only. "plan-review" = phase 2
  "reviewLens": "same",             // "same" = review the same scope as Opus code-reviewer
  "onUnconfirmedBlocker": "escalate", // "escalate" | "loop"
  "onInfraFailure": "skip",         // "skip" (log + proceed) — never "block"
  "timeoutSec": 180                 // hard cap on the opencode call
}
```

- Absent block or `enabled:false` → Gate 1 runs exactly as today.
- Per-repo: a backend repo may enable it while a frontend repo leaves it off.
- `provider` is intentionally omitted — the backend is always `opencode`.

### 6.2 opencode wrapper script — `plugins/constellation/scripts/opencode-review.sh`

A thin, testable shell adapter. Contract: **stdin/args in, review text on stdout,
non-zero exit on infra failure.**

Responsibilities:
1. Guard: `command -v opencode` present, else exit non-zero (→ orchestrator treats as
   infra-skip).
2. Write the diff to a temp file, attach with `-f`.
3. Invoke headlessly, read-only, machine-readable. **The message MUST come first** —
   `-f` is a greedy array flag that will swallow a trailing positional prompt (verified
   §16):
   ```
   timeout "${TIMEOUT}" opencode run "$PROMPT" \
     -m "$MODEL" \
     ${EFFORT:+--variant "$EFFORT"} \
     --agent review \
     --format json \
     -f "$DIFF_FILE"
   ```
4. Parse the **JSONL** event stream (one JSON object per line — verified §16):
   - assistant text = lines where **`.type=="text"`**, joined from `.part.text`;
   - any line where `.type=="error"` → **infra failure** (message is JSON-encoded under
     `.error.data.message`); exit non-zero so the orchestrator infra-skips.
   ```
   jq -rc 'select(.type=="text") | .part.text' "$OUT"          # assistant text
   jq -e  'select(.type=="error")' "$OUT" >/dev/null && exit 3 # infra fail
   ```
5. Never pass `--auto` (no auto-approve).

The script does **not** parse the review contract — it returns raw model text and a clean
exit code. Contract normalization is the subagent's job (§6.3).

### 6.3 New subagent — `constellation:cross-model-reviewer`

```markdown
---
name: cross-model-reviewer
description: Runs a cross-model (GPT via local opencode) code review over the same
  changes as the Opus code-reviewer, returning the standard Review Result contract.
  Used only inside Parallel Gate 1 when crossModelValidation.enabled is true.
model: sonnet            # the Claude wrapper is cheap; the reasoning happens in opencode
tools: [Bash, Read]      # needs Bash to call opencode — unlike the shell-less Opus reviewers
---
```

Behavior:
1. Receive: the diff (or its path), the plan/request reference, the review-memory
   content, and the config (`model`, `effort`, `timeoutSec`).
2. Build the review prompt = strict blocker rubric (§8) + the Review Result contract
   template + the diff + review memory.
3. Call `opencode-review.sh`.
4. Normalize the returned text into the **Review Result** contract. If it can't parse a
   `VERDICT`, re-request once; still malformed → return an `INFRA_SKIP` sentinel (not a
   blocker — see §9).
5. Return the contract to the orchestrator.

> This is the one reviewer with Bash access **by design**. The Opus code-reviewer stays
> shell-less; this subagent's whole purpose is to shell out to opencode.

### 6.4 opencode `review` agent (read-only)

**Verified (§16):** opencode uses a **permission-array** model — each agent carries a
list of `{ "permission": <tool>, "action": "allow"|"ask"|"deny", "pattern": "*" }`.
Built-in agents include a read-only **`plan`** primary and an **`explore`** subagent.

The harness ships its **own** `review` agent (config `agent` key, or a markdown file in
`~/.config/opencode/agent/review.md`) rather than depending on `plan`'s defaults — belt
and suspenders. It **denies** `edit`, `write`, `patch`, and `bash`, and **allows** `read`,
so opencode reviews but cannot touch the repo — mirroring how the native Opus
code-reviewer has no shell. Referenced via `--agent review`. Installing this agent config
is part of the build (and something `/constellation:init` can offer to write).

### 6.5 Orchestrator changes — `skills/orchestrator/SKILL.md`

- **Gate 1 spawn**: if `crossModelValidation.enabled && steps includes "code-review"`,
  add `constellation:cross-model-reviewer` to the single-message parallel spawn.
- **Merge**: apply the §7 verdict table.
- **State**: extend `gate1Results` with a `crossModel` slot.
- **Metrics**: log `crossModelBlockers`, `crossModelEscalations`, `crossModelSkipped`.
- All existing rules (incremental diff on fix passes, review memory in reviewer prompts,
  loop cap of 3) apply unchanged to the third reviewer.

---

## 7. Merge semantics (blocking + escalate-on-unconfirmed)

Because the cross-model reviewer covers the **same ground** as the Opus code-reviewer, a
cross-model-only blocker is meaningful: Opus looked at that exact code and did not raise
it.

| 🔴 Blocker raised by | Interpretation | Action |
|---|---|---|
| Cross-model **and** an Opus reviewer | Confirmed — models agree | **Loop** Engineer (normal fix flow) |
| Opus reviewer only | Authoritative (unchanged from today) | **Loop** Engineer |
| **Cross-model only** (no Opus confirmation) | Disagreement / unconfirmed | **Escalate to user** — do NOT auto-loop |

Definition of **"unconfirmed"**: the cross-model reviewer flagged a 🔴 that no Opus
reviewer flagged (semantically the same issue). Escalation presents both positions and
waits for the user (accept risk / send back to Engineer / abort) — it does not spin the
loop counter.

This preserves today's Opus behavior **exactly** and makes the cross-model reviewer's
*marginal* blockers always human-adjudicated. The loop cap of 3 still backstops confirmed
and Opus-only blockers.

`onUnconfirmedBlocker: "loop"` is available as an override for users who want the strict
version (cross-model-only blockers loop the Engineer directly), but `escalate` is the
default and the recommended setting.

---

## 8. Cross-model reviewer prompt rubric

Blocking mode lives or dies on the external reviewer's **false-positive rate on 🔴**.
The prompt must enforce a strict severity rubric:

- **🔴 BLOCKER** — only concrete correctness or security defects, each with **file, line,
  and a specific fix**. No style, preference, or "consider maybe".
- **🟡 SUGGESTION / 💭 NIT** — everything softer. These never block.
- Output **must** match the Review Result contract verbatim (VERDICT / BLOCKERS /
  SUGGESTIONS / NITS / PATTERNS).
- Reviewer receives the **review-memory** file so it aligns with accumulated patterns.
- Same incremental-diff discipline: on fix passes it gets only the fix delta + the
  original blocker list.

---

## 9. Failure handling — verdict vs infrastructure

The critical distinction in blocking mode:

- **A parsed cross-model 🔴** → a real verdict → participates in the merge (§7).
- **opencode timed out / crashed / OpenAI error / not authed / unparseable after one
  re-request** → **infrastructure failure, NOT a verdict** → `onInfraFailure: skip`:
  log `crossModelSkipped` with the reason, and proceed on the Opus reviews alone.

Rule of thumb: **only a real, parsed cross-model verdict can block; the absence of one
never can.** An opencode outage must degrade the gate to today's two-reviewer behavior,
not halt delivery.

---

## 10. Backward compatibility

- New config key with a safe default (`enabled:false`) → existing repos unaffected.
- Orchestrator reads the flag at Gate 1 only; every other track/gate is byte-for-byte
  unchanged.
- New subagent and script are inert unless the flag is on.
- No change to the Review Result contract → existing merge/report code still applies.

---

## 11. Phase 2 — plan review — ✅ BUILT (2026-07-01)

Enabled by adding `"plan-review"` to `crossModelValidation.steps`:

- After the Architect writes the plan (and after PM × Architect convergence for
  product-scoped work), the cross-model reviewer runs a **plan critique** via the same
  opencode adapter (the wrapper was already content-agnostic — no adapter change needed).
- Reviews feasibility gaps, missed edge cases, risky assumptions — not a diff.
- Softer contract: `Cross-Model Plan Review Result` — blockers as
  `<plan section/step> — <gap or risk> — <concrete change>`, no file/line, no NITS.

**Design decisions locked at build time:**

| Decision | Choice | Rationale |
|---|---|---|
| Who confirms a plan 🔴 | **The Architect adjudicates** (accept → revise / dispute → escalate) | No second Opus plan reviewer exists; Architect acceptance is the analog of two models agreeing on a diff blocker |
| Disputed blockers | Per `onUnconfirmedBlocker` — default **escalate**, joining the plan's existing open-questions step | Reuses the one human-decision-point mechanism, same as §15.2 |
| Critique passes | **Exactly one** — the revised plan is not re-critiqued | Avoids plan ping-pong; accepted blockers are addressed, disputed ones went to the user |
| Loop counter | Untouched — plan review never increments the Gate 1 review loop count | Separate concerns; the 3-loop cap protects the code loop |
| Tracks | **Planned Work only** | Plans only exist there; spikes/discovery produce throwaway or product artifacts |
| Infra failure | Same `onInfraFailure: skip` — `SKIPPED` verdict proceeds with the plan as-is | Same load-bearing rule as §9 |

---

## 12. Known-unknowns → resolved, and remaining risks

### Resolved by verification (§16)
1. ~~opencode read-only agent config~~ → **resolved.** Permission-array model; ship a
   dedicated `review` agent that denies edit/write/patch/bash (§6.4).
2. ~~JSON event parsing~~ → **resolved.** `--format json` is **JSONL**; text lives in
   `part`/`text` events, errors in `error` events (§6.2, §16).
3. **Contract conformance** → mechanism known (subagent normalizes; re-request once; else
   infra-skip). Actual GPT drift rate is only measurable once a callable model exists
   (see risk 0).

### Remaining risks
0. **Model entitlement ≠ auth (NEW).** `opencode auth list` showing a provider does **not**
   mean a given model is callable — entitlement is a **per-model allow-list**. On this
   machine, OpenAI is authed and `openai/gpt-5.2-codex` works, but ~9 other catalog models
   (`gpt-4o`, `gpt-5`, `gpt-5.4`, `gpt-5.3-codex`, …) return `model_not_found` (§16).
   **Consequence:** pick a model the project can actually call (here: `gpt-5.2-codex`), and
   have `init` **live-probe the exact configured model**, not just check auth (§13).
1. **Latency.** High-effort GPT can be slow; `timeoutSec` trades a slow gate against
   losing the cross-check on that pass (→ infra-skip). Tune per repo.
2. **Cost.** One extra external API call per Gate 1 pass (and per fix loop). Incremental
   diffs on fix passes keep it bounded.
3. **Single-family today.** Only OpenAI is authed in opencode, so "multi-model" currently
   means Claude + GPT. A third family (Gemini/DeepSeek/local) just means authing another
   provider in opencode — the config's `model` already accommodates it. **Update
   (2026-07-01):** the recommended default is now the free-tier **Gemini** option — see §17.

---

## 13. Prerequisites & init integration

- **`opencode` installed AND the configured model actually callable.** Auth presence is
  necessary but **not sufficient** — verified §16 (authed provider, zero accessible
  models). Readiness = a real 1-token test call succeeds, not `opencode auth list`.
- `/constellation:init` should:
  - detect whether `opencode` is on PATH;
  - if a repo sets `crossModelValidation.enabled:true`, **live-probe** the configured
    `model` with a trivial `opencode run "ok" -m <model> --format json` and check for a
    `text` part (not a `model_not_found` error). Warn at init if it fails, rather than
    failing silently at the first gate;
  - install the read-only `review` agent config (§6.4) if missing;
  - leave `enabled:false` in the generated config (opt-in stays explicit).

---

## 14. Implementation checklist

### Phase 1 — code review — ✅ BUILT (commit `e57e8de`, 2026-07-01)
- [x] Verify opencode `--format json` event shape + agent model. (§16)
- [x] `plugins/constellation/templates/opencode-review.sh` (guard, invoke, parse, timeout).
- [x] `plugins/constellation/agents/cross-model-reviewer.md` (Bash+Read, contract
      normalization, re-request-once).
- [x] Orchestrator: conditional third spawn at Gate 1; §7 merge table; state + metrics.
- [x] Config template (`crossModelValidation` block, `enabled:false`).
- [x] `init`: scaffold the wrapper + per-model live-probe readiness.
- [x] README + CHANGELOG (feature is opt-in, opencode-only).
- [ ] **A/B evaluation — still pending.** Blocked on a callable model: `gpt-5.2-codex`
      became provider-throttled during build testing, so no full successful review was
      captured. Run once throttling clears — flag on vs off across real diffs; record
      extra loops, escalations, and genuine defects Opus missed. (Non-model paths —
      usage/missing-opencode/timeout→infra-skip — and JSONL parsing ARE verified.)
      **Update (2026-07-01):** the free-tier Gemini option (§17) removes this blocker —
      1,500 requests/day is ample for the A/B run.
- [x] Free-model option researched and documented; recommendation and config default
      switched to `google/gemini-3-flash-preview` (§17).

**Design changes made during the build (differ from earlier sections):**
- The wrapper **inlines the diff into the prompt** and runs in a throwaway `--dir`,
  instead of attaching via `-f` and relying on a read-only `--agent`. Reason: the
  built-in `plan` agent (denied `plan_enter`) risks hanging, and inlining means the model
  needs no tool call — `--dir` isolation is the real safety net. (§6.2/§6.4 describe the
  earlier `-f` + `review`-agent approach; the shipped script supersedes them.)
- Default `timeoutSec` is **180** (was 150) — observed `gpt-5.2-codex` latency/throttling.
- The shipped wrapper lives at `templates/opencode-review.sh` and `init` copies it to
  `.constellation/scripts/opencode-review.sh` (project-local, stable path for the agent).

### Phase 2 — plan review — ✅ BUILT (2026-07-01)
- [x] Adapter already content-agnostic (generic `CONTENT UNDER REVIEW` markers) — no change.
- [x] `cross-model-reviewer` agent: `plan-review` mode (critique prompt, softer
      `Cross-Model Plan Review Result` contract, mode-aware normalization).
- [x] Orchestrator: Planned Work step 1b (conditional critique before branching),
      Architect-adjudicated merge table, `planReviewResult` state slot, `plan-review`
      metrics event. Design decisions in §11.
- [ ] Live exercise — same blocker as the phase 1 A/B eval: needs a callable model
      (Google auth pending, see §17).

---

## 15. Open questions — RESOLVED

1. **Normalization owner → split, deterministic in the script, fuzzy in the subagent.**
   The `opencode-review.sh` wrapper does the **mechanical** JSONL→text extraction and
   emits a clean exit code (this is fully deterministic — verified §16). The
   `cross-model-reviewer` **subagent** maps that free-form text into the Review Result
   contract, because contract conformance is the fuzzy part: a Claude subagent can absorb
   model drift, re-request once, and fall back to infra-skip. We do **not** rely on GPT
   emitting strict JSON itself (unreliable across models, and you'd need the fallback
   anyway). Rationale: keep the fragile step where retries are natural (the LLM subagent),
   keep the mechanical step where it's cheap and testable (the shell script).

2. **Escalation UX → inline, reusing existing open-question handling.** A cross-model-only
   (unconfirmed) blocker is surfaced **in-session** exactly like an Architect open
   question — present both positions, pause, wait for the user's decision (accept risk /
   send back to Engineer / abort). No separate file. It does **not** touch the loop
   counter. Metrics still record `crossModelEscalations`. Rationale: consistency with the
   harness's one existing human-decision-point mechanism; a file-based async flow would be
   a second, divergent pattern for the same job.

3. **Model/effort → no hard default; required config + documented recommendation +
   live-probe validation.** `model` is **required** when `enabled:true` (no baked-in
   default), because model entitlement varies per OpenAI project and is not knowable ahead
   of time — verified §16, where entitlement was a per-model allow-list. The docs
   **recommend** `openai/gpt-5.2-codex` (verified accessible on this machine and already in
   manual use here; code-tuned, a different family from Opus) as the starting model, and
   `effort: "high"` for a blocking reviewer, but nothing is pinned. `init` live-probes
   whatever the user set (§13). Rationale: a hardcoded default would silently break on any
   project without that entitlement — the exact failure the other 9 models exhibit here.
   **Update (2026-07-01):** the documented recommendation moved to the free-tier
   `google/gemini-3-flash-preview` — see §17. The live-probe rationale is unchanged and
   applies identically to Gemini.

---

## 16. Verification findings (2026-07-01, opencode 1.17.12)

Empirical results from probing the local opencode install — these promote §12's
known-unknowns to settled facts and surfaced one blocking issue.

**Invocation**
- `opencode run` takes the message as a **leading positional**. `-f/--file` is an **array**
  flag that greedily consumes a trailing positional prompt → put the message **first**,
  flags (incl. `-f`) after. (First attempt failed: `Error: File not found: <prompt text>`.)
- Read-only is achievable via `--agent`; opencode ships read-only `plan` (primary) and
  `explore` (subagent). Agents use a **permission array**
  (`{permission, action: allow|ask|deny, pattern}`). We'll ship a dedicated `review` agent
  denying edit/write/patch/bash.

**Output shape (`--format json`)**
- It is **JSONL** (one JSON object per line), not a single array. Envelope:
  `{ "type", "timestamp", "sessionID", "part"|"error", ... }`.
- Assistant text → envelope **`type:"text"`**, with the string at **`.part.text`**
  (confirmed against a real `gpt-5.2-codex` response returning `"OK"`). Extract with
  `select(.type=="text") | .part.text` — NOT `.type=="part"` (that filter matches nothing).
- Step boundaries → `type:"step_start"` and `type:"step_finish"` (the latter carries
  `tokens` + `cost`, handy for metrics).
- Errors → `type:"error"`; the provider error is JSON-encoded under `.error.data.message`.

**Model access (a per-model allow-list — the model you use manually works)**
- `opencode models` lists the full catalog opencode *knows* (many `openai/*`, `gpt-5.4`,
  `gpt-5.3-codex`, …) — **not** what the authed project can call.
- The OpenAI project `proj_cIkVq3Y9MepHPeAiAS74kmbS` has a **restricted allow-list**:
  - **✅ `openai/gpt-5.2-codex` — ACCESSIBLE** (billed a real response; the model this
    machine already uses manually). **The feature can run here today with this model.**
  - **❌ NOT accessible** (all returned `invalid_request_error / model_not_found`):
    `gpt-4o`, `gpt-4o-mini`, `gpt-5`, `gpt-5-mini`, `gpt-5.4`, `gpt-4.1`, `gpt-4.1-mini`,
    `gpt-3.5-turbo`, `gpt-5.3-codex`.
- **Implication:** `opencode auth list` (or even "this is a current model") tells you
  nothing about a *specific* model's callability — entitlement is per-model. This is why
  readiness must be a **live probe of the exact configured model**, why the config carries
  no hard-coded default, and why `onInfraFailure: skip` is load-bearing (`model_not_found`
  arrives as a normal `error` event and must degrade to the two-reviewer flow, never block
  delivery).

---

## 17. Addendum (2026-07-01) — free-model option: Gemini via Google AI Studio

The design is model-agnostic by construction (§15.3: required `model`, no baked-in
default, live-probe at init), so switching away from a paid GPT model is a config-only
change. This addendum records the research into **free** models callable through
opencode, and moves the documented recommendation to Gemini.

### Recommendation — `google/gemini-3-flash-preview`

- **Cost:** Google AI Studio free tier — no credit card. As of mid-2026: ~10 req/min,
  1,500 req/day for Gemini 3 Flash, with the 1M context window. Gate 1 uses one call per
  review pass plus up to 3 fix loops — orders of magnitude below the quota. It also
  unblocks the pending A/B evaluation (§14), which was stalled on `gpt-5.2-codex`
  throttling.
- **Family:** Gemini ≠ Claude ≠ GPT — a genuine second family, which is the whole point
  (§2). Quality is strong enough for a *blocking* reviewer, where the false-🔴 rate
  matters (§8); `onUnconfirmedBlocker: "escalate"` remains the safety valve for the
  marginal blockers a Flash-class model will raise more often than a codex-class one.
- **Model id:** the models.dev catalog (opencode's source) has **no plain
  `gemini-3-flash`** — the id is **`gemini-3-flash-preview`**. Stable fallbacks if the
  preview id stops resolving: `google/gemini-3.5-flash`, `google/gemini-2.5-flash`. The
  init live-probe (§13) settles which one is callable — same mechanism as before.
- **`effort`:** leave unset. `--variant` is a GPT/reasoning-effort knob; the wrapper
  already omits it when empty.

**Setup (one-time, per machine):**
1. Create an API key at Google AI Studio (aistudio.google.com) on a **billing-free**
   project.
2. `opencode auth login` → Google → paste the key. (`opencode models` only lists
   providers with credentials — `google/*` appears after this step.)
3. Set `crossModelValidation.model` and run the init live-probe.

**Verified callable (2026-07-02, after Google auth):**
- Live probe: `opencode run "reply with the single word OK" -m google/gemini-3-flash-preview
  --format json` → clean `text` event with `OK`, no `error` events. Same JSONL shape as §16.
- **End-to-end wrapper run** (first full success on any model — gpt-5.2-codex was throttled
  during the phase-1 build): `opencode-review.sh` over a synthetic diff with a planted
  security defect returned a contract-conformant `VERDICT: BLOCKED` with correct file:line
  and fix (flagged card-number/CVV logging), and correctly did **not** flag an
  arithmetic-looking red herring (`total * pct / 100` is precedence-equivalent) — no false
  positive.
- **Latency is variable**: one run timed out at 120s (exercising the timeout→exit-3
  infra-skip path live), the next completed in ~80s. The 180s default `timeoutSec` stands.

**Caveats:**
- Since April 2026 the free tier covers **Flash / Flash-Lite only** — Pro models are
  paid-only.
- Enabling billing on the Google Cloud project **deletes the free tier for that
  project** (unlike most GCP services) — keep the key on a project with billing off.
- Google may use free-tier traffic for training; diffs are sent to the endpoint. Same
  class of caveat as every free option below — do not enable on repos where that is
  unacceptable.

### Alternatives considered

| Option | Models | Verdict |
|---|---|---|
| **opencode Zen free tier** | `opencode/deepseek-v4-flash-free`, `opencode/nemotron-3-ultra-free`, `opencode/big-pickle`, `opencode/mimo-v2.5-free`, `opencode/north-mini-code-free` (verified in the local catalog) | Lowest friction (native `/connect`), but beta/promo models that rotate without notice, train on submitted data, and Zen signup asks for billing details. Fine as a fallback; `model_not_found` → infra-skip already absorbs rotation. |
| **OpenRouter `:free`** | rotating `:free` suffix models (~20 req/min, ~200 req/day) | Roster churns too fast for a standing gate dependency (e.g. Qwen3-Coder's free endpoint vanished June 2026). Experimentation only. |
| **Local (Ollama / LM Studio)** | any local model | Truly free and private, but not installed on this machine; laptop-class models raise the false-🔴 rate §8 warns about and strain `timeoutSec` on large diffs. Only worth it when data privacy is a hard requirement. |

### What changed where

- `templates/config.json` — `crossModelValidation.model` default →
  `google/gemini-3-flash-preview` (still `enabled:false`).
- `templates/opencode-review.sh` — fallback model id updated to match.
- `commands/init.md` §5b — free-tier Gemini named as the recommended starting model.
- README — "e.g. GPT" mentions widened to "e.g. Gemini or GPT".
- §4, §12.3, §14, §15.3 above — update notes pointing here. §16's GPT entitlement
  findings remain valid history and still motivate the live-probe.

---

## 18. A/B evaluation protocol (defined 2026-07-02 — data collection pending)

Answers the open question from §14: does the second model family catch real defects the
Opus reviewers miss, and at what cost? This is the **go/no-go gate for Phase 3** (voting
mode, more providers): no measured signal → Phase 3 stays parked.

### Method

- **Test bed**: a real repo with `.constellation/` initialized and
  `crossModelValidation.enabled: true`, `model: google/gemini-3-flash-preview`
  (free tier — quota is not a constraint). Candidate: user-service (needs
  `/constellation:init` — it currently has the older `.agentic/` layout).
- **Sample**: 6–10 real changes through Planned Work or Tweaks, alternating the flag
  **on/off per workflow** (odd workflows on, even off — no cherry-picking).
- **Source of truth**: `.constellation/metrics/workflow-log.jsonl` — no manual notes
  except the defect-attribution column.

### Record per workflow

| # | Flag | Track | reviewLoops | gate1Blockers | crossModelBlockers | confirmed / unconfirmed | escalations | genuine defect Opus missed? | wall-clock Gate 1 |
|---|---|---|---|---|---|---|---|---|---|

"Genuine defect Opus missed" = an **unconfirmed** cross-model blocker that the human
adjudicated as *real* (accepted → sent to Engineer). This is the entire value signal.

### Decision rule

- **≥1 genuine defect caught** across the sample AND escalation noise ≤ ~1 per workflow →
  keep enabled, consider Phase 3 (voting to cut the noise further).
- **0 genuine defects** and escalations > 0 → the second family adds friction without
  signal at this sample size: leave off by default, revisit with a stronger free model.
- Latency/cost are secondary: infra-skip already bounds the worst case.

Results land here as §18.1 once collected.
