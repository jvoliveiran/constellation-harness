---
name: terraform-module-design
description: Designing reusable Terraform modules as composable building blocks — interface conventions, file layout, versioning, composition roots, validation, and testing — so software engineers can pick and wire blocks instead of designing infrastructure.
---

# Terraform Module Design (Reusable Building Blocks)

## Scope

Apply this skill whenever creating or reviewing a Terraform module intended for reuse, or a composition root that consumes such modules. The goal is a **module catalog**: each module owns one capability, exposes a small documented interface, and composes with the others — a developer deploying a backend service picks `docker-host` + `postgres`, not a bespoke design.

## One module, one capability

A module is a building block, not a bundle. Good module boundaries:

- `network` — VCN/VPC, subnets, gateways, base security rules
- `docker-host` — a VM that runs containers (compute + cloud-init + reserved IP + volume)
- `postgres` / `autonomous-db` — one database, its storage, its backup policy
- `secrets` — vault/secret container + the secrets an app consumes
- `dns-record`, `object-bucket`, `registry`, `load-balancer` — one each

If a module description needs "and", split it. Cross-capability wiring (the app host reading the DB endpoint) happens in the **composition root** via outputs → variables, never by one module reaching into another's resources.

## Standard layout

```
modules/<name>/
├── main.tf          → resources (split into logical files if >~150 lines: compute.tf, network.tf …)
├── variables.tf     → the input contract
├── outputs.tf       → the output contract
├── versions.tf      → terraform + provider version constraints (required_providers, NO provider blocks)
├── README.md        → what it provisions, a copy-pasteable usage example, inputs/outputs table
└── examples/basic/  → a minimal root that actually plans — doubles as documentation and test fixture
```

Composition roots (per project × environment) are thin: backend + provider config, `module` calls with pinned versions, locals for naming. See the `terraform-environments` skill for their layout.

## Interface rules

**Variables — the smaller the surface, the better the block:**
- Few required variables (the genuinely per-consumer facts: name, compartment/VPC id, image). Everything else has a **safe, free-tier-friendly default**.
- Every variable has `description` and `type` (use `object()` types for cohesive groups rather than 10 loose scalars).
- Use `validation` blocks for values with known-bad shapes (CIDRs, shape names, retention days) — fail at plan, not at apply.
- Secrets are `sensitive = true` and preferably not passed at all — pass a secret **OCID/ARN reference** and let the consumer fetch it (see `cloud-accessory-services`).
- No variable that switches the module into "a different module" (`create_database = true` inside a compute module) — that's a missing block.

**Outputs — the contract downstream blocks consume:**
- Output every attribute a sibling block plausibly needs: ids, endpoints, security-group/NSG ids, connection hosts. Missing outputs force consumers to fork the module.
- Mark outputs derived from secrets `sensitive = true`.
- Names describe the thing, not the resource type: `db_endpoint`, not `oci_database_autonomous_database_connection_strings_0`.

**Providers:**
- Reusable modules declare `required_providers` with a **version constraint** (`~>`) and never contain `provider` blocks — provider config (region, auth, aliases) belongs to the root. This is what keeps a module usable across environments and accounts.

## Versioning & distribution

- Modules live in a dedicated git repo (or `modules/` in a mono-repo) and are consumed by **git source with a pinned ref**:
  ```hcl
  module "db" {
    source = "git::https://github.com/<owner>/<modules-repo>.git//modules/postgres?ref=v1.2.0"
  }
  ```
- Tag releases semver: **MAJOR** = breaking interface change (variable removed/renamed, output removed, resource replacement), **MINOR** = new optional variable/output/capability, **PATCH** = fix with no interface change.
- A change that causes Terraform to **replace a stateful resource** is breaking regardless of the HCL diff — call it out in the release notes with the migration path (usually `moved` blocks or state `mv`).
- Environments pin different refs — that's how a module change promotes dev → prod (see `terraform-environments`).

## Naming & tagging

- Consistent resource naming from a single local: `"${var.name_prefix}-<capability>"`; the prefix carries project + environment.
- Every module applies a common tag/freeform-tag map (`project`, `environment`, `managed-by = terraform`, `module`) via a merged `var.tags` — cost attribution and orphan hunting depend on it.

## Validation & testing (in order, cheapest first)

1. `terraform fmt -check` and `terraform validate` — on every change.
2. `tflint` with the provider ruleset — catches invalid shapes/regions that validate misses.
3. `terraform plan` against `examples/basic` — the example root is the module's smoke test; keep it planning with placeholder-but-shaped values.
4. Native `terraform test` (`tests/*.tftest.hcl`) for modules with real logic — variable validation, conditionals, count/for_each arithmetic. Prefer `command = plan` assertions; reserve `apply`-mode tests for a disposable sandbox compartment.

A module whose example has never planned is a draft, not a deliverable.

## Anti-patterns

- **Über-module**: one module, 40 resources, conditional everything → split into blocks.
- **Pass-through sprawl**: root re-exposes every module variable "just in case" → the root's job is to *decide*, not forward.
- **Fork-per-project**: copying a module to tweak one default → add the optional variable upstream and pin the new minor version.
- **Unpinned sources**: `ref=main` in production roots → every apply is a lottery.
- **Provider config in modules** → module can't be reused across accounts/regions.
- **Outputs hoarding**: exposing nothing but the id → consumers `data`-lookup everything and couple to internals anyway.
