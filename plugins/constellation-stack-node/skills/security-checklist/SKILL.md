---
name: security-checklist
description: Security review checklist covering OWASP Top 10, GraphQL-specific attacks, auth/authz validation, and dependency auditing for a NestJS + GraphQL backend
---

# Security Checklist Skill

## Scope

Apply this skill during security reviews of code changes. This checklist is tailored for a **NestJS + GraphQL + Prisma + TypeScript** backend that handles authentication, authorization (RBAC), and user data.

---

## OWASP Top 10 — Applied to This Stack

### 1. Injection

**GraphQL/Prisma context**: Prisma parameterizes all queries by default, but raw queries (`$queryRaw`, `$executeRaw`) bypass this.

- [ ] No use of `$queryRaw` or `$executeRaw` with string interpolation
- [ ] All user input passed through Prisma's parameterized API
- [ ] No dynamic field names derived from user input in queries
- [ ] No `eval()`, `new Function()`, or `child_process.exec()` with user input

### 2. Broken Authentication

- [ ] Passwords hashed with bcrypt (cost factor >= 10)
- [ ] JWT tokens have reasonable expiration (access: 15min, refresh: 7d)
- [ ] Refresh token rotation — old refresh tokens are invalidated on use
- [ ] Failed login attempts are rate-limited
- [ ] Password reset tokens are single-use and time-limited
- [ ] No credentials (passwords, tokens, API keys) in logs, responses, or error messages

### 3. Broken Access Control

- [ ] Every GraphQL resolver has appropriate auth guards (`@UseGuards(GqlAuthGuard)`)
- [ ] Public endpoints are explicitly marked with `@Public()` decorator
- [ ] Permission checks use `@RequirePermissions()` decorator for RBAC
- [ ] Users cannot access other users' data — verify ownership in service layer
- [ ] Admin-only operations verify admin role, not just authentication
- [ ] No horizontal privilege escalation — user A cannot modify user B's resources

### 4. Security Misconfiguration

- [ ] CORS is configured to allow only known origins — never `*` in production
- [ ] GraphQL introspection is disabled in production
- [ ] Debug/verbose error messages are not exposed in production responses
- [ ] Environment variables are validated at startup (Zod schema in `config.validation.ts`)
- [ ] Default credentials are not present in any configuration

### 5. Sensitive Data Exposure

- [ ] Passwords are never returned in GraphQL responses
- [ ] Email addresses are masked in logs (`mask-email.ts`)
- [ ] JWT secret is not hardcoded — sourced from environment variables
- [ ] No PII (emails, names, addresses) in info-level logs
- [ ] Database connection strings are not logged

### 6. Rate Limiting

- [ ] GraphQL endpoint has rate limiting via `GqlThrottlerGuard`
- [ ] Login endpoint has stricter rate limits than general queries
- [ ] Password reset has rate limiting to prevent abuse
- [ ] Rate limit headers are returned to clients

### 7. Cross-Site Scripting (XSS)

- [ ] GraphQL responses do not render user input as HTML
- [ ] Input validation strips or rejects HTML/script tags where inappropriate
- [ ] Content-Type headers are set correctly on all responses

---

## GraphQL-Specific Security

### Query Depth and Complexity

- [ ] Query depth limit is enforced (max 10 levels)
- [ ] Query complexity limit is enforced (max 1000 points)
- [ ] Expensive fields have complexity annotations
- [ ] No unbounded list queries — all collections are paginated

### Batching Attacks

- [ ] Batch queries are limited (no more than 5 operations per request)
- [ ] Alias-based attack prevention — same field with multiple aliases is counted toward complexity

### Schema Exposure

- [ ] Introspection is disabled in production
- [ ] Internal fields marked with `@inaccessible` in federation
- [ ] Error messages do not reveal schema structure or field names

### N+1 and Resource Exhaustion

- [ ] DataLoaders are used for all `@ResolveField` that can appear in lists
- [ ] No unbounded database queries (always use `take`/`limit`)
- [ ] Pagination enforces a maximum page size

---

## Authentication & Authorization Deep Checks

### JWT Validation

- [ ] JWT signature is verified on every request
- [ ] JWT expiration (`exp`) is checked
- [ ] JWT audience (`aud`) and issuer (`iss`) are validated if set
- [ ] Revoked tokens are rejected (check against refresh token store)

### RBAC Validation

- [ ] Permissions are checked at the resolver level, not just the client level
- [ ] Role assignments require admin permission
- [ ] Permission changes take effect immediately (no stale cache)
- [ ] Superadmin/system roles cannot be deleted or modified through the API

### Password Security

- [ ] Minimum password length enforced (>= 8 characters)
- [ ] Password is validated with Zod schema before hashing
- [ ] Old password is required for password change (not reset)
- [ ] Password reset does not reveal whether an email exists in the system

---

## Dependency Security

- [ ] `npm audit` reports no critical or high vulnerabilities
- [ ] No dependencies with known CVEs in production
- [ ] `package-lock.json` is committed and matches `package.json`
- [ ] No unnecessary permissions granted to dependencies

---

## Data Protection

### Database

- [ ] Prisma schema enforces `@unique` constraints where appropriate
- [ ] Cascade deletes are intentional and documented
- [ ] Sensitive fields (password hashes) are excluded from default selects
- [ ] Database credentials use least-privilege access

### Input Validation

- [ ] All GraphQL inputs are validated with Zod schemas
- [ ] String inputs have maximum length constraints
- [ ] Numeric inputs have range constraints where applicable
- [ ] Email inputs are validated with proper email regex
- [ ] UUID inputs are validated as proper UUIDs

---

## Review Output Format

Present security findings using the same priority system as the Code Reviewer:

```
🔴 **SECURITY: [Category]**
File: path/to/file.ts, Line XX
Description of the vulnerability and its impact.

**Risk**: What an attacker could do.
**Fix**: Specific remediation steps.
```

| Priority | Criteria |
|---|---|
| 🔴 Blocker | Exploitable vulnerability, data exposure, auth bypass |
| 🟡 Suggestion | Defense-in-depth improvement, hardening, best practice gap |
| 💭 Nit | Minor improvement, style preference, documentation gap |

---

## Hard Rules

- Every resolver must have an auth guard — `@Public()` is the explicit opt-out
- Never log credentials, tokens, or secrets
- Never return password hashes in API responses
- Never use `$queryRaw` with string interpolation
- Never disable CORS, rate limiting, or auth guards in production
- Always validate all user input at the resolver boundary
- Always run `npm audit` as part of the security review
