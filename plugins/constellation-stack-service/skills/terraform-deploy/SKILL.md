---
name: terraform-deploy
description: Deploying a constellation-service–derived backend to AWS ECS Fargate with Terraform — state bootstrap, ECR image flow, secrets, and migrations-on-boot implications.
---

# Terraform Deploy (AWS ECS Fargate)

## Scope

Apply this skill for deployment and infrastructure work in a project scaffolded from the **constellation-service** boilerplate: first deploys, releasing a new image, changing task sizing, secrets, or DNS. The heavy lifting lives in the shared **constellation-infra** Terraform module — this repo's `terraform/` is a thin consumer of it.

## Layout

```
terraform/
├── bootstrap/            → one-time: S3 state bucket (versioned, encrypted, public-access blocked)
├── main.tf               → S3 backend config + the constellation_service module (from constellation-infra)
├── variables.tf          → app_image, db_* (db_password is sensitive), task_cpu/memory,
│                           skip_ecs_deployment, health_check_path, …
├── outputs.tf            → ecr_repository_url, app_url, database_endpoint, service_name, …
├── terraform.tfvars      → GITIGNORED — copy terraform.tfvars.example and fill in
└── terraform/README.md   → TF_VAR_app_secrets JSON shape, Grafana Cloud vars
```

Provisioned stack: ECS Fargate service (Spot-capable, default 50%), RDS PostgreSQL (`db.t3.micro`/5GB default), ECR repository, ALB + ACM cert + Route53 record, optional CloudWatch logs (off by default, 3-day retention when on).

## First deploy — order matters

1. **Bootstrap state** (once per project): `cd terraform/bootstrap && terraform init && terraform apply` → creates the S3 state bucket; its outputs feed the backend block in `terraform/main.tf`.
2. `cd terraform && terraform init` (against the S3 backend), copy `terraform.tfvars.example` → `terraform.tfvars`, fill values.
3. **First apply with `skip_ecs_deployment = true`** — this is the chicken-and-egg breaker: it creates the ECR repository (and RDS/ALB) *without* starting the ECS service, which would otherwise fail pulling an image that doesn't exist yet.
4. **Build and push the image** to the `ecr_repository_url` output (ECR login → `docker build` → tag → push). The Dockerfile is two-stage: `node:22` build, `node:22-alpine` runtime with prod-only deps and a fresh `prisma generate`.
5. Set `skip_ecs_deployment = false` (and `app_image` to the pushed tag), `terraform apply` again — ECS service starts, ALB health-checks `/health`.

Subsequent releases: push a new image tag, update `app_image`, `terraform plan` → `apply`. There is no CI push pipeline in the boilerplate — image publishing is manual unless the project added one.

## Secrets

App secrets (JWT secret, SES credentials, Grafana tokens, …) are passed as a JSON string via the `TF_VAR_app_secrets` environment variable and land in AWS Secrets Manager — never in `terraform.tfvars` and never committed. `db_password` is a sensitive variable; supply it via environment or prompt, not a tracked file. See `terraform/README.md` for the exact JSON shape.

## Migrations run on every container start

`docker-entrypoint.sh` executes `npx prisma migrate deploy` before starting the app. Two implications that shape how you write migrations:

- **Migrations must be backward compatible** with the previous image during a rolling deploy — the old task revision keeps serving while the new one migrates. Destructive changes (drop/rename column) need the expand–migrate–contract sequence from the `prisma-migrations` skill.
- **A failing migration blocks boot**: the new task crash-loops while the old revision keeps running. Diagnose via the task's logs (enable CloudWatch or check ECS stopped-task reasons); never "fix" it by editing an applied migration.

## Safety rules

- Always `terraform plan` and read the diff before `apply` — RDS and ALB changes can be destructive (replacements) even when the HCL diff looks small.
- **Never run `terraform destroy`, delete state, or apply a plan that replaces the RDS instance without explicit human confirmation** — that's data loss, not infrastructure hygiene.
- Cost levers when the environment is idle: `desired_count = 0` stops Fargate spend while keeping the stack; Spot percentage and task sizing are variables, not code edits.
