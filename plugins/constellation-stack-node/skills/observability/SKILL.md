---
name: observability
description: Logging, tracing, and monitoring standards using Winston and OpenTelemetry in a NestJS + TypeScript backend
---

# Observability Skill

## Scope

Apply this skill for any task involving logging, tracing, monitoring, health checks, or error reporting. This project uses **Winston** for structured logging, **OpenTelemetry** for distributed tracing, and **correlation IDs** for request tracking.

---

## Logging Standards

### Log Levels

Use log levels consistently across the codebase:

| Level | When to Use | Example |
|---|---|---|
| `error` | Operation failed, requires attention, may affect users | Database connection lost, external API 5xx, unhandled exception |
| `warn` | Unexpected but recoverable situation, degraded behavior | Deprecated endpoint called, rate limit approaching, retry succeeded |
| `info` | Significant business events, operation milestones | User created, role assigned, password reset requested, login successful |
| `debug` | Diagnostic detail useful during development or troubleshooting | Query parameters, computed values, cache hit/miss, function entry/exit |

### Structured Log Format

All logs must be structured JSON. Never use string interpolation for log data — use the metadata object:

```typescript
// Wrong — unstructured, hard to query
this.logger.info(`User ${userId} logged in from ${ipAddress}`);

// Correct — structured, queryable
this.logger.info('User logged in', { userId, ipAddress, method: 'password' });
```

### Required Log Fields

Every log entry must include these fields (most are injected automatically by middleware):

| Field | Source | Description |
|---|---|---|
| `correlationId` | Correlation ID middleware | Request-scoped unique ID for tracing |
| `timestamp` | Winston default | ISO 8601 timestamp |
| `level` | Logger call | Log level |
| `message` | Logger call | Human-readable description |
| `service` | App config | The service's name (from app configuration) |

### Context-Specific Fields

Add these fields when available:

| Context | Fields |
|---|---|
| User action | `userId`, `action`, `targetResource` |
| Authentication | `userId`, `method` (password, token, oauth), `success` (boolean) |
| Authorization | `userId`, `requiredPermission`, `granted` (boolean) |
| Database operation | `operation` (create, update, delete), `model`, `recordId` |
| External API call | `service`, `endpoint`, `statusCode`, `durationMs` |
| Error | `errorCode`, `errorMessage`, `stack` (debug only), `userId` (if available) |

### What to Log

**Always log:**
- Authentication attempts (success and failure) with user ID
- Authorization denials with user ID and required permission
- Resource creation, update, and deletion with actor ID
- Error handler invocations with full error context
- External service calls with duration and status
- Application startup and shutdown events

**Never log:**
- Passwords, tokens, API keys, or secrets — even partially
- Full request/response bodies in production (use debug level only)
- Personal data beyond user IDs (no emails, names, addresses in info logs)
- Health check requests (too noisy, no signal)

### Error Logging

Error handlers must log the full error context:

```typescript
this.logger.error('Failed to assign role to user', {
  userId,
  roleId,
  errorCode: error.code,
  errorMessage: error.message,
  stack: error.stack,
  correlationId,
});
```

---

## Correlation ID

### How It Works

The `correlation-id.middleware.ts` generates a unique ID for each incoming request and attaches it to the request context. All logs within that request lifecycle include this ID, enabling end-to-end request tracing.

### Propagation Rules

- Incoming requests: read `x-correlation-id` header if present, generate a new UUID if absent
- Outgoing HTTP calls: forward the correlation ID in the `x-correlation-id` header
- Queue messages: include `correlationId` in the message metadata
- Log entries: always include `correlationId` in the log metadata

---

## OpenTelemetry Tracing

### Trace Setup

The tracer is configured in `src/monitoring/tracer.ts`. It instruments:
- HTTP incoming requests (NestJS)
- HTTP outgoing requests
- Database queries (Prisma)
- Queue operations (BullMQ)

### Span Naming Conventions

| Operation | Span Name Format |
|---|---|
| GraphQL resolver | `graphql.{query\|mutation}.{operationName}` |
| Service method | `{ServiceName}.{methodName}` |
| Repository method | `{RepositoryName}.{methodName}` |
| External HTTP call | `http.{method}.{serviceName}` |
| Queue publish | `queue.publish.{queueName}` |
| Queue process | `queue.process.{queueName}` |

### Custom Spans

Add custom spans for operations that are not auto-instrumented:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service'); // your service's name

async function assignRoleToUser(userId: string, roleId: string) {
  return tracer.startActiveSpan('RbacService.assignRole', async (span) => {
    try {
      span.setAttribute('user.id', userId);
      span.setAttribute('role.id', roleId);
      const result = await this.repository.assignRole(userId, roleId);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

---

## Health Checks

### Conventions

The health endpoint at `GET /health` reports the status of all critical dependencies:

| Dependency | Check | Unhealthy When |
|---|---|---|
| PostgreSQL | `SELECT 1` query | Query fails or times out (>2s) |
| Redis | `PING` command | Connection refused or timeout (>1s) |
| BullMQ | Queue connection check | Redis connection unhealthy |

### Health Check Rules

- Health checks must not log at info level — they are called every few seconds by load balancers
- Health checks must complete within 5 seconds total
- A failing health check must include which dependency is unhealthy
- Health checks must not require authentication

---

## Hard Rules

- Never log secrets, tokens, passwords, or API keys — even partially masked
- Always include `correlationId` in log metadata when available
- Always include `userId` in log metadata when the action is performed by or affects a user
- Always use structured JSON logging — never string interpolation for log data
- Always log both success and failure for authentication and authorization
- Never log health check requests at info level
- Always propagate correlation IDs to outgoing HTTP calls and queue messages
