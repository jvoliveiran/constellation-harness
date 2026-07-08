---
name: oci-container-platform
description: Running Docker containers and databases on OCI inside the Always Free tier — the AWS Lightsail equivalent built from Terraform blocks (Ampere A1 docker-host, network, database, registry), with the free-tier budget, arm64, capacity, and reclamation gotchas.
---

# OCI Container Platform (Always Free)

## Scope

Apply this skill when designing or provisioning the platform that runs containerized apps on OCI — the harness's default target. The reference architecture is the **AWS Lightsail equivalent at $0**: one Ampere A1 VM running Docker Compose behind a reserved public IP, plus a database — composed from the module blocks below (interfaces per `terraform-module-design`).

## The Always Free budget (design inside this by default)

| Resource | Always Free allotment (verify against current OCI docs) |
|---|---|
| Arm compute | Ampere **A1 Flex: 4 OCPUs + 24 GB RAM total**, splittable across up to 4 VMs |
| x86 compute | 2× `VM.Standard.E2.1.Micro` (1/8 OCPU, 1 GB) — too small for real apps; use for utilities |
| Block storage | **200 GB total** across boot + data volumes (min boot volume ~47 GB → budget ~4 volumes) |
| Object Storage | ~10 GB standard (+ ~10 GB infrequent access, ~10 GB archive) — also backs OCIR images |
| Autonomous Database | **2 databases, ~20 GB storage each** (Oracle 23ai; JSON + MongoDB-compatible API) |
| Load balancer | 1 flexible LB (10 Mbps) + 1 network LB — usually unnecessary for a single host |
| Egress | 10 TB/month |
| Vault | Software-protected keys and a modest secrets allotment (see `cloud-accessory-services`) |

**Not free:** OCI Container Instances (the Fargate-alike) and the managed PostgreSQL / MySQL HeatWave services are paid — that's why the free-tier database answer is *containerized Postgres on the A1 host* or *Autonomous DB*, below.

## Reference architecture (Lightsail equivalent)

```
internet → reserved public IP → NSG (22, 80, 443)
             │
        [docker-host]  Ampere A1 (e.g. 2 OCPU / 12 GB), Docker + Compose via cloud-init
             ├── caddy (TLS, reverse proxy)          ← certificates: cloud-accessory-services
             ├── app container(s)   (arm64 images from OCIR)
             └── postgres container ── block volume (data survives instance replacement)
        [autonomous-db]  alternative managed option, still $0
```

Splitting the A1 budget: one 2 OCPU/12 GB host for app+db and headroom for a second environment is the usual default; a single 4/24 host is fine for one-environment projects.

## The module catalog

| Block | Provisions | Key outputs |
|---|---|---|
| `network` | VCN, public subnet, internet gateway, route table, NSG (22/80/443 by default) | `vcn_id`, `subnet_id`, `nsg_id` |
| `docker-host` | A1 Flex instance (OCPUs/RAM as variables), cloud-init installing Docker + Compose plugin, **reserved** public IP, attached block volume mounted for data | `public_ip`, `instance_id`, `data_volume_id` |
| `postgres` | Compose definition for Postgres pinned major, data on the block volume, nightly `pg_dump` to Object Storage | `connection_host` (private), `backup_bucket` |
| `autonomous-db` | Always Free Autonomous Database, wallet/connection secrets into Vault | `connection_string_secret_id` |
| `registry` | OCIR repo + IAM policy/auth-token flow for push/pull | `repo_url` |

A developer deploying a new backend service composes `network` + `docker-host` + one database block in their environment root — nothing bespoke.

## Gotchas that shape designs (not incident reviews)

- **arm64 only.** A1 is Arm — images must be built multi-arch (`docker buildx build --platform linux/arm64,linux/amd64`). CI that only builds amd64 produces images that pull and then crash-loop.
- **A1 capacity.** Free-tier accounts frequently hit "Out of host capacity" for A1 in popular ADs. Mitigations: try each availability domain, retry (capacity churns), and — the reliable fix — **upgrade the account to Pay As You Go**: Always Free resources stay $0, but capacity and reclamation rules improve.
- **Idle reclamation.** On pure Free Tier (never-upgraded) accounts, Oracle may stop idle Always Free compute. PAYG upgrade removes this; otherwise keep utilization above the idle thresholds or accept restarts.
- **`user_data` changes replace the instance.** Cloud-init is for host bootstrap (Docker install, volume mount, firewall) only. App deploys must NOT ride user_data — deliver compose changes by SSH from CI (`docker compose pull && docker compose up -d`) or a pull-based updater, so a new image tag never destroys the host.
- **Both firewalls.** NSG rules AND the instance OS firewall (Oracle Linux ships iptables/firewalld rules; Ubuntu images are open) — an unreachable port is usually the one you forgot.
- **Reserved IP, always.** An ephemeral public IP dies with the instance; DNS should point at a reserved IP output by the `network`/`docker-host` block.
- **Block volume ≠ boot volume.** App/database data lives on an attached, separately-lifecycled block volume so `terraform` replacing the instance never touches data. Backup policy (free tier includes basic volume backups) is part of the block, not an afterthought.

## Database decision

| | Containerized Postgres on the A1 host | Always Free Autonomous DB |
|---|---|---|
| Engine | Real Postgres — matches most app stacks (Prisma etc.) | Oracle 23ai (SQL + JSON/Mongo API) |
| Ops | Yours: volume, backups to Object Storage, upgrades | Managed: patching, backups included |
| Cost path | Stays free until the host outgrows A1 | Stays free within 20 GB; paid tier is a big jump |
| Default | **Yes — when the app stack expects Postgres** | When zero DB ops is worth the engine constraint |

## Scale-up path (state it in every design)

When a workload outgrows the single host: OCI Container Instances (serverless containers, paid, per-second) for bursty single containers → OKE with the **free control plane + A1 free-tier worker nodes** for real orchestration → paid A1/E-series capacity. The module interfaces are the migration seam: the app keeps its image, registry, secrets, and DNS blocks; only the runtime block swaps.
