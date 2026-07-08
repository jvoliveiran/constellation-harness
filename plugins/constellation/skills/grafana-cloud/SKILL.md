---
name: grafana-cloud
description: Grafana Cloud as the observability backend — free-tier budget, the OpenTelemetry pipeline (OTLP direct or via Grafana Alloy) shipping logs, metrics, and traces from backend services, Loki as the primary distributed-logging store, signal correlation, and cardinality/volume best practices.
---

# Grafana Cloud + OpenTelemetry

## Scope

Apply this skill when wiring a backend service's telemetry to its backend — where logs, metrics, and traces *go*, how they get there, and how to stay inside the free tier. **Grafana Cloud is the primary observability platform, and Loki (its log store) is the primary tool for distributed logging.** This skill owns the pipeline and platform; *what* to log (levels, structured fields, correlation IDs) is owned by the project's stack observability skill (e.g. `constellation-stack-node:observability`) — the two compose.

## The platform in one table

Grafana Cloud is a hosted bundle of the Grafana OSS stack — one account, one endpoint family, all signals:

| Signal | Backend | Query language | Role |
|---|---|---|---|
| Logs | **Loki** | LogQL | **Primary distributed logging** — all services ship here |
| Metrics | Mimir (Prometheus-compatible) | PromQL | RED/USE dashboards, alerting |
| Traces | Tempo | TraceQL | Distributed tracing, log↔trace correlation |
| Profiles | Pyroscope | — | Optional, continuous profiling |
| UI / alerting | Grafana + Alerting + IRM/OnCall | — | Dashboards, alert rules, on-call |

## Free-tier budget (design inside this; verify current limits at grafana.com/pricing)

| Resource | Free allotment (monthly) |
|---|---|
| Metrics | ~10k active series (Prometheus/OTLP) |
| Logs | ~50 GB ingest |
| Traces | ~50 GB ingest |
| Profiles | ~50 GB ingest |
| Retention | ~14 days (logs/traces/metrics) |
| Users | Small fixed number of active users |
| k6 / synthetics | Small testing allotment |

The free tier comfortably runs several small backend services **if cardinality and volume are managed** (rules below). The budget levers, in impact order: metric label cardinality, debug-level log shipping, and trace sampling rate. When a design will exceed the tier, say so explicitly with the driver (e.g. "per-user metric label → series explosion").

## Pipeline: OpenTelemetry end to end

Everything speaks **OTLP** — no vendor SDKs, no Grafana-specific instrumentation in app code. Two supported shapes:

**1. Direct-to-cloud (default for the free-tier single-host platform).** The service's OTel SDK exports OTLP/HTTP straight to the Grafana Cloud OTLP gateway:

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-<region>.grafana.net/otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(instanceID:token)>
```

Auth is HTTP Basic: username = the stack's **instance ID**, password = a **Cloud Access Policy token** scoped to write-only for the needed signals (`metrics:write`, `logs:write`, `traces:write`). The token is a secret — route it through the secrets flow (`cloud-accessory-services` in infra-pack projects), never into compose files or tfvars.

**2. Via Grafana Alloy (the OTel-collector distribution) when there's a host to run it on.** Apps export OTLP to a local Alloy container; Alloy batches, enriches (host/resource attributes), optionally tail-samples, and forwards to the gateway. Choose Alloy when you need host metrics, scraping of non-instrumented targets (Postgres exporter, node exporter), log collection from container stdout, or centralized credentials (apps then hold no cloud token at all). On the OCI docker-host platform, Alloy is one more compose service.

Start with direct-to-cloud; introduce Alloy when a second service lands on the host or host-level telemetry is wanted — it's a pipeline change, zero app-code change. That indirection is the point of OTLP.

## Non-negotiable resource attributes

Set these on every service (env var, not code):

```
OTEL_SERVICE_NAME=user-service
OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=prod,service.namespace=<project>,service.version=<image tag>
```

`service.name` + `deployment.environment.name` are what make one Grafana stack serve dev and prod without mixing signals — every dashboard, LogQL query, and alert filters on them. Follow OTel **semantic conventions** for everything else (`http.*`, `db.*`); invented attribute names break the prebuilt correlations.

## Distributed logging on Loki (the primary signal)

- Ship logs through the **OTel logs pipeline** (SDK log appender/bridge → OTLP), not a separate Loki client — one exporter, and the SDK stamps `trace_id`/`span_id` onto every log line emitted inside a span automatically.
- **Labels vs. structured metadata — the cardinality rule.** Loki labels (indexed) are for low-cardinality stream selectors only: `service_name`, `deployment_environment`, `level`. High-cardinality values (`userId`, `correlationId`, `trace_id`, paths) stay in the JSON body / structured metadata and are queried with LogQL filters. A `userId` label is the classic free-tier killer: streams explode, ingest throttles.
- Keep app logs **structured JSON** (per the stack observability skill) so LogQL's `| json` gives every field for free.
- Free-tier volume discipline: ship `info` and above from prod; `debug` stays local or dev-only (an env-var switch, e.g. `OTEL_LOG_LEVEL`/logger level per environment).

## Correlation — the reason all three signals share one platform

The payoff to enforce in every setup:
- **Logs → trace**: `trace_id` on log lines (automatic via the OTel appender) + the Loki data source's *derived field* pointing at Tempo = click from a log line to its full distributed trace.
- **Trace → logs**: Tempo's *trace-to-logs* link back to Loki, filtered on `service_name` + time window.
- **Metrics → traces**: exemplars on histograms link a latency spike to sample traces.
- W3C `traceparent` propagation across service calls is on by default in OTel SDKs — don't disable it, and pass it through queues/jobs explicitly where async breaks context.

Wire the two data-source links once per stack; they're configuration, not code (and are Terraform-able via the Grafana provider — below).

## Metrics & traces guardrails

- Metrics: RED per service (rate, errors, duration histogram) + the runtime metrics the SDK gives free. Every label must be bounded: route *template* (`/users/:id`) not raw path, status *class* where possible, never IDs. ~10k series ≈ a handful of services × a few dozen metrics × bounded labels — budget it.
- Traces: 100% sampling is fine at low traffic and the best debugging value; under load move to `parentbased_traceidratio` head sampling (`OTEL_TRACES_SAMPLER`), or tail sampling in Alloy (keep all errors + slow, sample the rest) when it's in the pipeline.
- Batch exporters always (SDK default `BatchSpanProcessor`/batch log processor) — per-request exports melt both the app and the gateway quota.

## Alerting & dashboards

- Start with three alerts per service, not thirty: error-rate above threshold, p95 latency above SLO, absence-of-telemetry (the service stopped reporting — catches dead pipelines that "no errors" hides).
- Dashboards and alert rules are code: the **Grafana Terraform provider** manages data sources, dashboards, alert rules, and contact points — in infra-pack projects this is a natural `observability` building block alongside the others; click-built dashboards don't survive stack re-creation.
- Grafana Cloud's OTLP path fits **Application Observability** prebuilt views — check them before hand-building service dashboards.

## Setup checklist (per project)

1. Grafana Cloud account (free) → note stack **region**, **instance IDs**, create a write-only **Cloud Access Policy token**.
2. Token into the secrets flow; `OTEL_*` env vars into service config (endpoint, headers, service name, resource attributes).
3. OTel SDK in the service: traces + metrics + logs bridge, batch processors, OTLP/HTTP exporter (the stack observability skill owns the in-code details).
4. Verify each signal in Grafana Explore (Loki/Mimir/Tempo) from a dev deploy — before writing any dashboard.
5. Wire Loki↔Tempo derived-field/trace-to-logs correlation.
6. Baseline alerts (error rate, p95, telemetry absence) + contact point.
7. Confirm the ingest/series usage view after a day of traffic — free-tier surprises show up there first.
