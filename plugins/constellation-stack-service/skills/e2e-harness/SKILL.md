---
name: e2e-harness
description: Running and writing end-to-end tests in a constellation-service–derived backend — dockerized test infra, .env.test, jest e2e config, supertest GraphQL patterns, and auth in test mode.
---

# E2E Test Harness

## Scope

Apply this skill when running, writing, or debugging e2e tests (`test/*.e2e-spec.ts`) in a project scaffolded from the **constellation-service** boilerplate. Unit tests (colocated `src/**/*.spec.ts`) need none of this — plain `npm run test`.

## Running e2e tests

E2E tests hit a real Postgres and Redis, isolated from the dev stack:

```bash
npm run test:e2e:up      # docker compose -f docker-compose.test.yml up -d --wait
npm run test:e2e         # DOTENV_CONFIG_PATH=.env.test jest --runInBand ... --config ./test/jest-e2e.json
npm run test:e2e:down    # tears down AND wipes volumes (-v)
```

Test infra facts:

- **Offset ports** — Postgres on `5433`, Redis on `6380` — so the dev stack (`npm run dev:up`, ports 5432/6379) can stay running. Don't "fix" connection errors by pointing tests at the dev ports.
- Postgres uses **tmpfs** — no persistence; every `up` starts clean. State that must exist is created by the specs (factories/seeds), never assumed.
- Config comes from the git-tracked **`.env.test`** (`NODE_ENV=test`, test DB URL, `FEDERATION_ENABLED=false`, `LOG_LEVEL=error`, OTEL disabled). `DOTENV_CONFIG_PATH=.env.test` in the npm script is what selects it — running jest with the e2e config directly, without that env var, loads the wrong environment.
- `--runInBand` is required: specs share one database and truncate tables in setup — parallel workers would corrupt each other. `--forceExit` / `--detectOpenHandles` cover lingering Redis/queue handles; if a new module makes `--forceExit` load-bearing (test process won't exit without it), fix the dangling handle rather than relying on it.
- Migrations: the test DB is empty on first `up` — apply migrations before the run if the suite errors on missing tables (`npx prisma migrate deploy` with the test `DATABASE_URL`; CI does exactly this).

## Writing e2e specs

Pattern (see the exemplar `test/person.e2e-spec.ts` and `test/factory/`):

- Boot the real app via `createTestModule()` from `test/factory/create-test-module.ts` — it builds `AppModule` in a `TestingModule`, applies the production `ValidationPipe`, and returns `init`/`close` plus `app` and `prisma` handles. **No guard overrides** — production auth guards run.
- Drive GraphQL over HTTP with supertest: `request(app.getHttpServer()).post('/graphql').send({ query, variables })`.
- **Auth in test mode**: `.env.test` sets `FEDERATION_ENABLED=false`, so the service validates a bearer JWT directly instead of the gateway's user-context header. Sign a token with the app's `JwtService` (`jwtService.sign({ sub, username, ... })`) and send it as the bearer header the exemplar spec uses. Cover at least one request *without* the token to assert the 401/unauthorized path.
- **Data setup**: truncate the entity's tables in `beforeAll`/`beforeEach`, then create rows through the entity factory (`test/factory/<entity>.factory.ts`). Factories insert via `PrismaService` — keep them dumb (no assertions, no GraphQL).
- Clean up with the factory module's `close()` in `afterAll` — leaked Nest apps are the usual cause of hanging test runs.

## What belongs in e2e (vs unit)

E2E specs are expensive (`--runInBand`, real infra) — keep them at the resolver surface:

- list query with cursor pagination (first page → second page via `endCursor`)
- mutation happy path + the validation-union error path
- one auth-rejection case per protected surface
- throttling only when the resolver overrides the global limit

Business-logic permutations, mapper edge cases, and cursor encoding belong in colocated unit specs.

## CI parity

`.github/workflows/ci.yml` runs the same suite against GitHub Actions **service containers** (Postgres + Redis) with hardcoded env — not via `docker-compose.test.yml`. Consequences:

- Image versions are declared **twice** (compose file and workflow). When bumping Postgres/Redis, change both.
- CI runs `prisma migrate deploy` before tests, plus a schema-freshness check and rover federation validation — a locally green e2e run can still fail CI on a stale committed `schema.gql`.
- New required env vars must be added to `.env.test` **and** the workflow's `env` block, or the suite passes locally and fails in CI.
