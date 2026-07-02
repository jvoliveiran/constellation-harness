---
description: Summarize the workflow telemetry (.constellation/metrics/workflow-log.jsonl) into a decision-ready report with actionable signals.
---

# /constellation:metrics

Turn the write-only telemetry into decisions. Read
`.constellation/metrics/workflow-log.jsonl`; if missing or empty, report that and stop.

## 1. Compute (jq over the JSONL)

```bash
LOG=.constellation/metrics/workflow-log.jsonl

# Workflows per track
jq -rs 'map(select(.event=="workflow-start")) | group_by(.track) | map({track: .[0].track, count: length})' "$LOG"

# Review loops: average + max (gate1 events carry reviewLoops)
jq -rs '[.[] | select(.event=="gate1-pass" or .event=="gate1-blocked") | .data.reviewLoops // 0] | {avg: (add/length), max: max}' "$LOG"

# Blockers by gate
jq -rs '{gate1: [.[] | .data.gate1Blockers // 0] | add, gate2: [.[] | .data.gate2Blockers // 0] | add}' "$LOG"

# Lint-gate catch rate (fails caught before reviewers)
jq -rs '[.[] | select(.event=="lint-gate-fail")] | length' "$LOG"

# Escalations
jq -rs '[.[] | select(.event=="gate1-escalated")] | length' "$LOG"

# Cross-model agreement (when enabled): confirmed vs unconfirmed blockers
jq -rs '{blockers: [.[] | .data.crossModelBlockers // 0] | add, escalated: [.[] | .data.crossModelEscalated // 0] | add, skipped: [.[] | .data.crossModelSkipped // 0] | add}' "$LOG"

# Ship outcomes
jq -rs '[.[] | select(.event=="workflow-shipped")] | {shipped: length, auto: [.[] | select(.data.merge=="auto")] | length, verifyFails: [.[] | select(.data.postMergeVerify=="fail")] | length}' "$LOG"
```

Also compute per-track averages where sample size allows (≥3 workflows).

## 2. Report

Present one compact table (metric, value, sample size) followed by a **Signals** section.
Only fire a signal when its threshold is met — no padding:

| Signal | Threshold | Suggested action |
|---|---|---|
| High review loops | avg > 2 | Review `review-patterns.md` quality; check Engineer self-check step is running |
| Lint gate earning its keep | lint-gate-fail > 0 | None — confirmation the cheap gate is saving Opus tokens |
| Frequent escalations | > 1 per 5 workflows | Loop cap or rubric may be miscalibrated; inspect escalated blockers |
| Cross-model noise | escalated > 0, none accepted by user | Consider disabling or switching model — the A/B decision rule (spike §18) |
| Cross-model signal | any escalated blocker user-accepted | Genuine defect Opus missed — evidence for keeping it on |
| Infra skipping often | crossModelSkipped / workflows > 0.3 | Raise `timeoutSec` or check opencode auth/model |
| Post-merge verify failures | any | Investigate immediately — gates passed but main broke: gap in gate coverage |

## 3. A/B reporting mode (`/constellation:metrics ab`)

Group workflows by whether cross-model was active (crossModel fields present in gate1
events) and print the spike §18 table: loops, blockers, escalations, genuine-defect
column (the user fills adjudication outcomes), flag-on vs flag-off averages.

Read-only command: never modify the log; no timestamps invented — report what's recorded.
