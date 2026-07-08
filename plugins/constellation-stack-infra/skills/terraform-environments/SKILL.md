---
name: terraform-environments
description: Multi-environment Terraform — remote state backends (OCI Object Storage or S3), directory-per-environment layout, tfvars layering, module version pinning as the promotion mechanism, and plan/apply discipline.
---

# Terraform Environments & State

## Scope

Apply this skill when laying out the Terraform side of a project (where do roots, tfvars, and state live), adding an environment, or wiring remote state. It pairs with `terraform-module-design`: that skill defines the blocks, this one defines how per-environment roots compose and promote them.

## Layout: directory per environment

Environments are separate composition roots — separate state, separate blast radius:

```
infra/
├── modules/                    → only in a mono-repo; otherwise a shared modules repo
└── envs/
    ├── dev/
    │   ├── main.tf             → module calls, pinned refs (may lag/lead prod)
    │   ├── backend.tf          → this env's state location
    │   ├── providers.tf        → region/auth/aliases — the ONLY place provider blocks live
    │   ├── variables.tf
    │   └── terraform.tfvars    → env-specific values (committed; NO secrets — see below)
    └── prod/                   → same shape, different pins and tfvars
```

- **Do not use Terraform workspaces to separate environments.** Workspaces share one backend, one set of credentials, and one root — one wrong `terraform workspace select` away from planning prod with dev intent. Workspaces are acceptable only for ephemeral same-shape copies (PR previews) inside one non-prod environment.
- Environments differ by **tfvars and module version pins only** — never by divergent HCL in the root. If roots drift structurally, extract the difference into a module variable.
- On OCI, give each environment its **own compartment** (dev/staging/prod), with IAM policies scoped to it — compartments are OCI's cheap, first-class isolation boundary. On AWS, prefer separate accounts (or at minimum separate IAM roles + tag guardrails).

## Promotion = moving a version pin

```hcl
# envs/dev/main.tf
module "app_host" {
  source = "git::https://github.com/<owner>/infra-modules.git//modules/docker-host?ref=v1.3.0"
}
# envs/prod/main.tf — still on v1.2.x until dev has soaked
module "app_host" {
  source = "git::https://github.com/<owner>/infra-modules.git//modules/docker-host?ref=v1.2.4"
}
```

A module change reaches prod by bumping the ref in `envs/prod/` in a reviewed PR whose plan output is part of the review. Never edit prod first.

## Remote state

State is production data: it contains resource ids, endpoints, and often secret material. Before the first shared apply:

- **OCI**: use Object Storage. Terraform ≥ 1.12 has a native `oci` backend; on older versions use the `s3` backend against OCI's S3-compatible endpoint (`https://<namespace>.compat.objectstorage.<region>.oraclecloud.com` with the path-style/skip-checks flags the compat API requires). Either way: **versioned bucket, private, one state object per environment** (`envs/prod/terraform.tfstate`).
- **AWS**: `s3` backend, versioned + encrypted bucket, and state locking (S3 native lockfile on Terraform ≥ 1.10, DynamoDB table on older).
- Bootstrap chicken-and-egg: the state bucket itself comes from a tiny one-time `bootstrap/` root with local state (commit its outputs into the backend blocks), same pattern as the service pack's `terraform-deploy` skill.
- Never commit `terraform.tfstate`, `.terraform/`, or plan files; `.gitignore` them from day one.
- `terraform_remote_state` data sources create hard coupling between roots — prefer passing shared values (VCN id, DNS zone) via explicit variables or a small read-only data lookup; if you do use remote state reads, they are read-only by definition and must never gate prod on dev's state.

## Secrets and tfvars

- Committed `terraform.tfvars` hold **shape, not secrets**: sizes, counts, CIDRs, image tags, feature flags.
- Secret values enter via `TF_VAR_*` environment variables at plan/apply time, or better, never touch Terraform at all — the root passes a secret *reference* (OCID/ARN) and the workload fetches the value at runtime (see `cloud-accessory-services`).
- Remember: a secret used in a resource attribute lands **in state** even when marked `sensitive` — which is why the state bucket is private and versioned, and why references beat values.

## Plan/apply discipline

- `terraform plan -out=tfplan` → review → `terraform apply tfplan`, per environment, from the environment's directory. The reviewed artifact is the plan, not the diff.
- Read plans for the three destructive verbs: **destroy**, **replace** (`-/+`), and forced re-creation of stateful resources (DBs, volumes, buckets). Any of these on a stateful resource requires explicit human confirmation, whatever the environment.
- Refactors that move resources between modules use `moved` blocks (or `terraform state mv`) so the plan shows *moves*, not destroy/create pairs.
- Pin the provider (`~>` in `versions.tf`) and commit `.terraform.lock.hcl` — upgrades are deliberate PRs (`terraform init -upgrade`), not side effects.
- CI shape when the project has it: fmt + validate + tflint on every PR; plan posted to the PR for the touched environments; apply only from the main branch with the environment's own credentials.
