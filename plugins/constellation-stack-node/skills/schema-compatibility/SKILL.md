---
name: schema-compatibility
description: Detect breaking vs safe changes in the auto-generated GraphQL schema to prevent downstream consumer breakage
---

# Schema Compatibility Skill

## Scope

Apply this skill after the Software Engineer completes implementation and before the review gate. It detects whether the GraphQL schema changes introduced by the current work are safe (additive) or breaking (destructive).

---

## How It Works

The generated schema artifact (path configured as `schemaPath` in `.constellation/config.json`, e.g. `src/schema.gql`) is the public API contract. Changes to this file fall into two categories:

### Safe Changes (Additive)

These can be shipped without coordination with consumers:

- New types added
- New fields added to existing types
- New enum values added
- New queries or mutations added
- New input types added
- Description changes on existing fields
- Deprecation annotations added (`@deprecated`)

### Breaking Changes (Destructive)

These require consumer coordination and must be flagged as blockers:

- Fields removed from existing types
- Fields renamed (appears as remove + add)
- Field types changed (e.g., `String` to `Int`, nullable to non-nullable)
- Enum values removed
- Queries or mutations removed
- Input fields added as required (non-nullable) to existing input types
- Type renamed or removed

---

## Detection Procedure

### Step 1: Capture the Pre-Change Schema

Before the Engineer starts (or from the base branch):

```bash
git show <mainBranch>:<schemaPath> > /tmp/schema-before.gql
```

### Step 2: Regenerate the Schema

After the Engineer completes implementation:

```bash
npx ts-node -e "
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('./src/app.module');
  async function bootstrap() {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    await app.close();
  }
  bootstrap();
"
```

Or simply rely on the schema that was generated during `npm run build`.

### Step 3: Diff the Schemas

```bash
diff /tmp/schema-before.gql <schemaPath>
```

### Step 4: Classify Changes

Parse the diff output and classify each change:

| Diff Pattern | Classification |
|---|---|
| Lines only added (`>`) with new type/field definitions | Safe |
| Lines only removed (`<`) with type/field definitions | Breaking |
| Lines changed (removed + added for same field) | Breaking (type change or rename) |
| Only `@deprecated` annotations added | Safe |
| Only description strings changed | Safe |
| New enum value added | Safe |
| Enum value removed | Breaking |
| New required field on an input type | Breaking |
| New optional field on an input type | Safe |

---

## Output Format

```
## Schema Compatibility Result

### Safe Changes
- Added field `auditLog` to type `User`
- Added type `AuditLogEntry`
- Added query `auditLogs`

### Breaking Changes
- Removed field `legacyRole` from type `User`
- Changed type of `User.createdAt` from `String` to `DateTime`
- Added required field `reason` to input `UpdateUserInput`

### Verdict: SAFE | BREAKING
```

---

## Integration

This check runs automatically as part of the **Lint Gate** (between Engineer and Parallel Gate 1). If the verdict is `BREAKING`:

1. Flag the breaking changes as 🔴 blockers
2. The Engineer must either:
   - Add `@deprecated` to the old field and keep it alongside the new one (non-breaking migration)
   - Confirm with the user that the breaking change is intentional and accepted
3. Only proceed to the review gate after breaking changes are resolved or explicitly accepted

---

## Hard Rules

- Never ship a breaking schema change without explicit acknowledgment
- Always prefer additive changes (add new + deprecate old) over destructive changes (remove old)
- Always run schema compatibility check when any file under `src/` with `@ObjectType`, `@InputType`, `@Query`, or `@Mutation` decorators is modified
- The schema artifact at `schemaPath` must be regenerated and committed — stale schemas hide breaking changes
