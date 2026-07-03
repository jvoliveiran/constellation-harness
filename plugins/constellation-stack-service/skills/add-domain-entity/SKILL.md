---
name: add-domain-entity
description: Playbook for adding a new domain entity to a constellation-service–derived backend — Prisma model, exemplar module layout, cursor pagination, federation types, audit wiring, and test coverage, in the right order.
---

# Add a Domain Entity

## Scope

Apply this skill when creating a new domain concept (a new Prisma model with its own GraphQL surface) in a project scaffolded from the **constellation-service** boilerplate. For changes to an *existing* entity, only the relevant steps apply.

**Drift warning.** This playbook describes the boilerplate's conventions. The project may have renamed or evolved the exemplar module (`src/person/` at scaffold time — `.constellation/project-map.md` marks the current one). Before writing anything, read the exemplar **as it exists in this repo** and mirror *it*, not this document, wherever they disagree.

**Process.** This skill defines the order of concerns, not the process — TDD still governs (`tdd-workflow` skill): each step's logic gets its failing test first. Stack conventions come from `nestjs`, `graphql`, `graphql-federation`, and `prisma-migrations` — this playbook only adds the boilerplate-specific wiring.

## Step 0 — Read the exemplar

Skim the exemplar module's files and note the naming: `<entity>.module.ts`, `.resolver.ts`, `.service.ts`, `.repository.ts`, `.consumer.ts`, `.types.ts`, `.dto.ts`, `dto/`, `mappers/`. Every new entity reproduces this layout — a missing layer (usually the repository or mappers) is a standing review blocker in this codebase.

## Step 1 — Prisma model + migration

In `prisma/schema.prisma`:

- Snake-case column mapping via `@map` (`createdAt DateTime @default(now()) @map("created_at")`), table mapping via `@@map` when the model name isn't the table name.
- **Composite index for cursor pagination** — required on any listed entity:
  `@@index([createdAt(sort: Desc), id(sort: Desc)])`
- Create the migration: `npm run prisma:migration -- add-<entity>` (never edit applied migrations; see `prisma-migrations`).
- Extend `prisma/seed.ts` following its `upsert`-loop pattern if the entity needs seed data.

## Step 2 — Module skeleton

`src/<entity>/<entity>.module.ts`:

- `imports: [PrismaModule]`, plus `BullModule.registerQueue({ name: '<entity>' })` **only if** the entity has async work (see Step 5).
- `providers`: repository, service, resolver (+ consumer if queued).
- Register the module in `src/app.module.ts` `imports` — the only root-module change an entity needs; guards, throttling, and correlation-id middleware are already global.

## Step 3 — GraphQL types (code-first, federated)

- Object type in `<entity>.types.ts`: `@ObjectType('<Entity>')` with `@Directive('@key(fields: "id")')` so other subgraphs can reference it.
- Paginated response: `class CursorPaginated<Entity>Response extends CursorPaginated(<Entity>)` using the factory in `src/common/dto/cursor-paginated-response.factory.ts` (`items`, `hasMore`, `endCursor`, `total`).
- Inputs in `<entity>.dto.ts`: `@InputType()` with class-validator rules (`@IsNotEmpty()`, `@Min()`, …) — validation errors surface through the global pipe as the `ValidationErrorResult` union member.
- Mutation results in `dto/`: `createUnionType()` of `<Action><Entity>Success | ValidationErrorResult` with a `resolveType` discriminator, mirroring `dto/create-person.result.ts`.

## Step 4 — Repository (the only Prisma caller)

Only repositories inject `PrismaService` — a service or resolver touching Prisma directly is a review blocker. For cursor-paginated lists, copy the exemplar repository's shape exactly:

- WHERE from a decoded cursor: `{ OR: [{ createdAt: { lt } }, { createdAt, id: { lt } }] }`
- `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` (matches the Step 1 index)
- Fetch `first + 1` rows; the extra row becomes `hasMore`. Return `{ items, hasMore }`.

## Step 5 — Service, mappers, and queue

- Service holds business logic; injects the repository and, for async work, `@InjectQueue('<entity>')`. Job defaults (retries, backoff) are configured globally in `app.module.ts`.
- Consumer: `@Processor('<entity>')` extending `WorkerHost` with `async process(job)`.
- Mappers in `mappers/` are pure functions: `mapPrisma<Entity>ToGraphql()` and `mapToCursorPaginated<Entity>Response()` (encodes `endCursor` from the last item via `encodeCursor(createdAt, id)` in `src/common/utils/cursor.utils.ts`). Each mapper gets a colocated `.spec.ts`.

## Step 6 — Resolver and auth

Guards are **global** (`GatewayAuthGuard`, `PermissionsGuard`, `GqlThrottlerGuard`), so the resolver's job is to *declare* the auth decision — every query/mutation is either:

- explicitly public: `@Public()`, or
- protected, optionally with `@RequirePermissions(...)` for fine-grained authz.

An unmarked resolver method is still guarded, but the decision must be visible — reviewers block on resolvers with no explicit auth stance. Add `@ResolveReference()` so the federation gateway can resolve `<Entity>` by key, and `@Throttle()` overrides where the global rate limit doesn't fit. Use `@CurrentUser()` / `@RequestMeta()` decorators (in `src/graphql/decorators/`) for user context and request metadata.

## Step 7 — Audit events on mutations

State-changing mutations emit audit events:

1. Add actions to the union in `src/audit/types/audit-action.types.ts` (`<ENTITY>_CREATED`, `<ENTITY>_UPDATED`, `<ENTITY>_DELETED` — follow the existing naming).
2. Inject `AuditService` in the service and call `auditService.log({ action, userId, targetType, targetId, metadata, correlationId, ... })`, sourcing request metadata from `@RequestMeta()` in the resolver. The correlation id originates from `correlation-id.middleware.ts` and must reach the audit entry.

Note: the scaffold-time exemplar predates this convention and may not demonstrate it — the audit module (`src/audit/`) is the reference, and review gates enforce it on new code regardless.

## Step 8 — Regenerate and commit the schema

`src/schema.gql` regenerates from the decorators on `npm run build` / `npm run dev`. Never hand-edit it; commit the regenerated file in the same change so the diff is reviewable. New entities are **additive** — if the diff shows removals or type changes to existing fields, stop and run the `schema-compatibility` check before proceeding.

## Step 9 — Tests

- **Unit (colocated `*.spec.ts`)**: mappers, cursor/validation utilities, guard-relevant logic, service behavior with mocked repository.
- **E2E** (`test/<entity>.e2e-spec.ts`): add a factory in `test/factory/<entity>.factory.ts` (creates rows via `PrismaService`), then cover at minimum: list with cursor pagination (first page → second page via `endCursor`), the mutation happy path, the validation-error union path, and one auth-rejection case. Follow the `e2e-harness` skill for setup and auth details.

## Definition of done

Prisma migration + committed regenerated `schema.gql` + full module layout mirroring the exemplar + explicit auth stance on every resolver method + audit events on mutations + colocated unit specs + e2e coverage. The review-gate seeds in `.constellation/memory/review-patterns.md` check exactly these.
