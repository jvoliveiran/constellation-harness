---
name: error-handling
description: Domain exception hierarchy, error codes, GraphQL error formatting, and error logging standards for a NestJS + GraphQL backend
---

# Error Handling Skill

## Scope

Apply this skill for any task involving error handling, exception design, error responses, or error logging. This project uses **NestJS** with **GraphQL** (code-first) and a global exception filter.

---

## Error Philosophy

Errors are not exceptional — they are expected outcomes that the system must handle gracefully. The error handling strategy has three goals:

1. **Clients receive actionable, consistent error responses** — never raw stack traces or framework errors
2. **Developers can diagnose issues quickly** — structured logs with full context
3. **The system fails safely** — invalid state is never persisted, partial operations are rolled back

---

## Domain Exception Hierarchy

### Base Exception

All domain exceptions extend a base `DomainException` that carries a machine-readable error code:

```typescript
export abstract class DomainException extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

### Naming Convention

Exception class names describe **what went wrong**, not what the system tried to do:

| Pattern | Example |
|---|---|
| `<Entity><Problem>Exception` | `UserNotFoundException` |
| `<Entity><Constraint>Exception` | `EmailAlreadyTakenException` |
| `<Action><Reason>Exception` | `LoginFailedInvalidCredentialsException` |
| `<Resource><State>Exception` | `TokenExpiredException` |

### Error Codes

Error codes are machine-readable strings in `SCREAMING_SNAKE_CASE`, prefixed by domain (the domains below are examples — adapt the prefixes to your project's domains):

| Domain | Code Pattern | Example |
|---|---|---|
| Auth | `AUTH_*` | `AUTH_INVALID_CREDENTIALS`, `AUTH_TOKEN_EXPIRED` |
| Users | `USER_*` | `USER_NOT_FOUND`, `USER_EMAIL_ALREADY_TAKEN` |
| RBAC | `RBAC_*` | `RBAC_ROLE_NOT_FOUND`, `RBAC_PERMISSION_DENIED` |
| Validation | `VALIDATION_*` | `VALIDATION_INVALID_INPUT` |
| System | `SYSTEM_*` | `SYSTEM_INTERNAL_ERROR`, `SYSTEM_SERVICE_UNAVAILABLE` |

---

## GraphQL Error Responses

### Error Format

GraphQL errors are returned in the standard `errors` array with structured extensions:

```json
{
  "errors": [
    {
      "message": "The email address is already associated with an account.",
      "extensions": {
        "code": "USER_EMAIL_ALREADY_TAKEN",
        "classification": "BUSINESS_ERROR"
      }
    }
  ]
}
```

### Error Classifications

| Classification | Meaning | HTTP Analogy |
|---|---|---|
| `BUSINESS_ERROR` | Valid request, but business rule prevents it | 409, 422 |
| `NOT_FOUND` | Requested resource does not exist | 404 |
| `UNAUTHORIZED` | Missing or invalid authentication | 401 |
| `FORBIDDEN` | Authenticated but lacking permission | 403 |
| `VALIDATION_ERROR` | Input failed validation | 400 |
| `INTERNAL_ERROR` | Unexpected system failure | 500 |

### Union Type Error Pattern

For mutations, prefer modeling expected errors as union return types rather than throwing exceptions:

```typescript
@ObjectType()
export class EmailAlreadyTakenError {
  @Field(() => String)
  message: string;

  @Field(() => String)
  email: string;
}

export const SignupResult = createUnionType({
  name: 'SignupResult',
  types: () => [UserResult, EmailAlreadyTakenError, ValidationError] as const,
});
```

This makes error cases explicit in the schema and forces clients to handle them.

### When to Throw vs Return Error Types

| Scenario | Approach |
|---|---|
| Expected business error (email taken, role not found) | Return as union type |
| Authentication/authorization failure | Throw — handled by guards and global filter |
| Validation failure | Throw — handled by ValidationPipe |
| Unexpected system error | Throw — caught by global exception filter |

---

## Global Exception Filter

The `global-exception.filter.ts` catches all unhandled exceptions and transforms them into consistent GraphQL error responses. It must:

1. Log the full error with stack trace, correlation ID, and user ID
2. Return a sanitized error to the client — never expose internal details
3. Map known exception types to appropriate error codes and classifications
4. Default to `SYSTEM_INTERNAL_ERROR` for unknown exceptions

### What the Client Sees vs What Gets Logged

| Aspect | Client Response | Server Log |
|---|---|---|
| Message | User-friendly, actionable | Technical, detailed |
| Stack trace | Never | Always (at error level) |
| Internal IDs | Never | Always (correlation ID, user ID) |
| Error code | Always | Always |

---

## Error Logging

Every caught error must be logged with full context before being transformed into a client response:

```typescript
this.logger.error('Failed to create user', {
  correlationId,
  userId: requestingUserId,
  errorCode: exception.code,
  errorMessage: exception.message,
  stack: exception.stack,
  input: { email: maskEmail(input.email) }, // Mask PII
});
```

### Rules

- Log at `error` level for 5xx-equivalent errors
- Log at `warn` level for 4xx-equivalent errors (client mistakes)
- Always include `correlationId` and `userId` when available
- Never log raw passwords, tokens, or secrets — even in error context
- Mask email addresses and PII in log metadata

---

## Validation Errors

Input validation uses Zod schemas at the service boundary. Validation errors must:

1. Include the field name that failed validation
2. Include a human-readable message explaining the constraint
3. Be collected and returned together (not fail on the first error)

```typescript
// Zod schema with descriptive messages
const createUserSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
});
```

---

## Hard Rules

- Never expose stack traces, internal paths, or database errors to clients
- Never swallow exceptions silently — always log and either handle or re-throw
- Never use generic `Error` — use domain-specific exception classes with error codes
- Always include `correlationId` and `userId` in error logs
- Always mask PII (emails, names) in log metadata
- Always return consistent error format through the global exception filter
- Never let validation errors leak past the service boundary — validate at the edge
