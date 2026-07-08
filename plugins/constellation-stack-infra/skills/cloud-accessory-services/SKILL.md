---
name: cloud-accessory-services
description: The services around the app — secrets (OCI Vault / AWS Secrets Manager), TLS certificates, DNS, container registries, backups, and baseline monitoring — with the AWS↔OCI service mapping and the patterns that keep credentials out of Terraform code and state.
---

# Cloud Accessory Services (Secrets, Certificates, DNS & Friends)

## Scope

Apply this skill whenever a design or module touches the services *around* the workload: secret storage, TLS, DNS, image registries, backups, email, monitoring. No infrastructure design is complete with "TODO: secrets" — these are specified in the same plan as compute and database, because they're where naive designs leak credentials or break at renewal time.

## AWS ↔ OCI mapping (translate designs, don't redesign)

| Capability | AWS | OCI | Free-tier note (OCI) |
|---|---|---|---|
| Simple app host | Lightsail | Ampere A1 compute + Docker | Always Free (see `oci-container-platform`) |
| Serverless containers | ECS Fargate | Container Instances | **Paid** on OCI |
| Kubernetes | EKS | OKE | Basic control plane free; A1 free workers |
| Relational DB | RDS | DB with PostgreSQL / MySQL HeatWave / Autonomous DB | Only Autonomous is Always Free |
| Object storage | S3 | Object Storage | ~10 GB standard free |
| Secrets | Secrets Manager / SSM Parameter Store | Vault (KMS + secrets) | Software keys + modest secrets free |
| Certificates | ACM | Certificates service | Or Let's Encrypt on-host (see below) |
| DNS | Route 53 | OCI DNS zones | Small per-zone cost — external free DNS common |
| Registry | ECR | OCIR | Storage billed as Object Storage (free allotment) |
| LB | ALB/NLB | Load Balancer / NLB | 1 flexible 10 Mbps LB free |
| Metrics/logs | CloudWatch | Monitoring + Logging | Free ingestion allotments |
| Email | SES | Email Delivery | Small free sends allotment |
| IAM boundary | Account / IAM roles | **Compartment** + IAM policies | Compartments are free and first-class |

## Secrets — the one rule and three patterns

**The rule: secret *values* never appear in `.tf` files, committed tfvars, or module defaults — and remember anything Terraform touches lands in state.** Design so Terraform handles *references*, workloads fetch *values*.

1. **Runtime fetch (preferred).** Terraform creates the Vault secret (or Secrets Manager entry) and outputs its **OCID/ARN**; the app or a small entrypoint script fetches the value at boot using the instance's identity — **instance principals** on OCI (a dynamic group matching the compartment + a policy allowing `read secret-family`), an instance/task role on AWS. No secret ever transits Terraform.
2. **Deploy-time injection.** CI reads the secret (`oci secrets secret-bundle`, `aws secretsmanager get-secret-value`) and injects it as an env var into the compose deploy. Acceptable for the single-host platform; the secret still never enters state.
3. **Terraform-managed value (last resort).** A secret set via `TF_VAR_*` because a provider requires it inline (e.g. a DB admin password at creation). Mark it `sensitive = true`, rotate it right after creation where possible, and rely on the private, versioned state bucket being the real control.

Populate secret values out-of-band (console/CLI once, or CI from its own secret store); Terraform manages the container, IAM, and references. On OCI, note Vault deletion quirks: vaults have a scheduled-deletion window (days), so `destroy` on a vault is slow and deliberate — model vaults per environment, not per app.

## TLS certificates

- **Single-host platform (the free-tier default): Let's Encrypt on the host, via Caddy.** Caddy as the reverse-proxy container gets/renews certs automatically (HTTP-01) with zero Terraform beyond opening 80/443 and pointing DNS at the reserved IP. This is the boring, reliable choice.
- **OCI Certificates / ACM** when a managed LB terminates TLS: the cert lives in the cloud service, renewal is managed, and the LB module takes the certificate id as a variable. On OCI this pairs with the (free) flexible LB; on AWS, ACM + ALB is the standard pair.
- Never hand-manage cert files through Terraform (`tls_` resources for real traffic, cert PEMs in variables) — renewal becomes a human problem with a 90-day fuse.

## DNS

- The design contract: modules output a stable target (reserved IP or LB hostname); a `dns-record` block maps names onto it. Apps never reference raw IPs.
- Provider choice is pragmatic: OCI DNS zones (small per-zone cost, native Terraform), Route 53 (AWS estates), or an external free provider (e.g. Cloudflare) with its Terraform provider — all fine; pick where the domain already lives and keep records in code.
- Per-environment names as data: `api.dev.example.com` / `api.example.com` from the same block with env-prefixed tfvars.

## Registry (images)

- OCIR on OCI: repo path `<region>.ocir.io/<namespace>/<repo>`; auth via a user **auth token** (not the console password) or better, CI-scoped credentials. Storage counts against the Object Storage free allotment — prune old tags (retention policy in the registry block).
- ECR on AWS. Either way the registry block outputs `repo_url` and the docker-host's pull credentials flow via the secrets patterns above — never baked into cloud-init.
- Images are multi-arch (arm64 for A1) — enforce in CI, per `oci-container-platform`.

## Backups & baseline monitoring (the forgettable two)

- **Backups are part of the block that owns the data**: block-volume backup policy in `docker-host`, `pg_dump`-to-Object-Storage sidecar/cron in `postgres`, automatic backups already included in Autonomous DB. State the restore path in the module README — an untested restore is a hope, not a backup.
- **Baseline monitoring ships with the platform, not later**: OCI Monitoring alarm on instance CPU/memory + an uptime check against the public endpoint (or CloudWatch equivalents), notifying a real channel (email topic). Two alarms beat zero dashboards.
- **Application observability (logs/metrics/traces) goes to Grafana Cloud**, not the cloud provider's APM — see the core `constellation:grafana-cloud` skill for the free tier, the OTLP pipeline, and the write-only token that flows through the secrets patterns above. In module terms it's an `observability` block: Grafana Terraform provider managing data-source correlation, dashboards, and baseline alerts.

## Multi-environment wiring

Accessory services follow the environment boundary (see `terraform-environments`): one Vault, DNS sub-zone/prefix, registry namespace or tag-prefix, and alarm topic **per environment/compartment**, provisioned by the same blocks with env tfvars. Sharing a prod secret container with dev is how dev leaks prod credentials.
