---
name: typescript
description: Rules to follow when writting typescript code
---

# TypeScript Skill

## Scope

Apply this skill for any task involving TypeScript code — type definitions, generics, utility types, narrowing, or type-safe patterns. These rules apply across the entire codebase regardless of framework or layer.

---

## Core Rules

These are non-negotiable. Every rule below is a hard constraint, not a preference.

1. **`type` over `interface`** — always use `type` for defining shapes. `interface` is only acceptable when extending third-party interfaces that require it (e.g. declaration merging for module augmentation).
2. **No `any`** — never. Use `unknown` when the type is genuinely unknown and narrow it explicitly. Use generics when the type varies but is knowable at the call site.
3. **No inline type definitions** — never define types anonymously inside function signatures, variable declarations, or return types. Every shape has a name and lives in a dedicated type file.
4. **`satisfies` over type assertions** — use `satisfies` to validate an expression conforms to a type while preserving the most specific inferred type. Never use `as SomeType` to paper over a type mismatch.
5. **No type duplication** — if two types share structure, derive one from the other using utility types. Never copy-paste type shapes.
6. **Prefer small, focused files** — types, classes, and modules are split across many focused files rather than consolidated into god files. A file that does one thing is a file that is easy to find, test, and change.

---

## Types Over Interfaces

`type` is used for everything: object shapes, unions, intersections, mapped types, and conditional types. `interface` is reserved exclusively for cases where declaration merging is required.

```typescript
// ✅ Correct
type Invoice = {
  id: string;
  customerId: string;
  totalAmountInCents: number;
  status: InvoiceStatus;
  createdAt: Date;
};

// ❌ Wrong — use type instead
interface Invoice {
  id: string;
  customerId: string;
}
```

**Why**: `type` is more expressive — it supports unions, intersections, mapped types, and conditional types that `interface` cannot express. Using both in the same codebase creates inconsistency. Picking one eliminates the decision entirely.

---

## No Inline Type Definitions

Every type shape is named and lives in a type file. Inline definitions are anonymous, undiscoverable, and non-reusable.

```typescript
// ❌ Wrong — inline object shape in function signature
function createInvoice(data: { customerId: string; lineItems: LineItem[] }): Invoice { }

// ❌ Wrong — inline shape in variable declaration
const config: { apiKey: string; timeout: number } = { ... };

// ✅ Correct — named types, defined separately
type CreateInvoiceInput = {
  customerId: string;
  lineItems: LineItem[];
};

function createInvoice(data: CreateInvoiceInput): Invoice { }
```

```typescript
// ❌ Wrong — anonymous return type shape
function getPaginationMeta(): { total: number; page: number; pageSize: number } { }

// ✅ Correct
type PaginationMeta = {
  total: number;
  page: number;
  pageSize: number;
};

function getPaginationMeta(): PaginationMeta { }
```

---

## `satisfies` for Type Checking

Use `satisfies` to validate that a value conforms to a type without widening it to that type. This preserves the literal types and specific inferred structure of the value while still catching mismatches at the definition site.

```typescript
// ❌ Wrong — type annotation widens literal types, loses specificity
const httpStatusMessages: Record<number, string> = {
  200: 'OK',
  404: 'Not Found',
  500: 'Internal Server Error',
};
// httpStatusMessages[200] is `string`, not `'OK'`

// ✅ Correct — satisfies validates the shape, preserves literal types
const httpStatusMessages = {
  200: 'OK',
  404: 'Not Found',
  500: 'Internal Server Error',
} satisfies Record<number, string>;
// httpStatusMessages[200] is still `'OK'`
```

```typescript
// ❌ Wrong — type assertion bypasses type checking entirely
const appConfig = {
  port: 3000,
  environment: 'production',
} as AppConfig;

// ✅ Correct — satisfies validates without losing the literal type structure
const appConfig = {
  port: 3000,
  environment: 'production',
} satisfies AppConfig;
```

`satisfies` is the right tool for:
- Configuration objects that must conform to a known shape
- Lookup maps and dictionaries where literal key/value types matter
- Constants that must satisfy a contract while remaining narrowly typed
- Default values for typed configuration structures

---

## Utility Types — Derive, Never Duplicate

When two types share structure, one is derived from the other. Utility types are the vocabulary for expressing type relationships. Duplicating a type shape is always a type design error.

### `Partial<T>` — All fields optional

```typescript
type Invoice = {
  id: string;
  invoiceNumber: string;
  totalAmountInCents: number;
  status: InvoiceStatus;
};

// ❌ Wrong — manually re-declared optional shape
type UpdateInvoiceInput = {
  invoiceNumber?: string;
  totalAmountInCents?: number;
  status?: InvoiceStatus;
};

// ✅ Correct — derived from the canonical type
type UpdateInvoiceInput = Partial<Omit<Invoice, 'id'>>;
```

### `Required<T>` — All fields required

```typescript
type InvoiceConfig = {
  dueDateOffsetDays?: number;
  reminderIntervalDays?: number;
  lateFeeRatePercent?: number;
};

// A validated config where all values have been resolved from defaults
type ResolvedInvoiceConfig = Required<InvoiceConfig>;
```

### `Pick<T, K>` — Select specific fields

```typescript
type Invoice = {
  id: string;
  customerId: string;
  invoiceNumber: string;
  totalAmountInCents: number;
  internalCostBreakdown: CostBreakdown; // Should not be exposed publicly
};

// ✅ Public-facing response shape — picks only what clients should see
type InvoiceResponse = Pick<Invoice, 'id' | 'customerId' | 'invoiceNumber' | 'totalAmountInCents'>;
```

### `Omit<T, K>` — Exclude specific fields

```typescript
// Input type excludes server-generated fields
type CreateInvoiceInput = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>;

// Update type excludes identity and audit fields, makes the rest optional
type UpdateInvoiceInput = Partial<Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>>;
```

### `Record<K, V>` — Key-value maps

```typescript
// ❌ Wrong — inline shape used as a map
type StatusLabels = { [key: string]: string };

// ✅ Correct — Record expresses intent clearly
type InvoiceStatusLabel = Record<InvoiceStatus, string>;

const invoiceStatusLabels: InvoiceStatusLabel = {
  DRAFT: 'Draft',
  PENDING: 'Awaiting Payment',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
} satisfies InvoiceStatusLabel;
```

### `Readonly<T>` — Immutable shapes

```typescript
// Configuration objects and value types should be immutable
type DatabaseConfig = Readonly<{
  host: string;
  port: number;
  databaseName: string;
  maxConnections: number;
}>;
```

### `ReturnType<T>` and `Parameters<T>` — Derive from functions

```typescript
async function fetchInvoice(invoiceId: string, requestingUser: AuthenticatedUser): Promise<Invoice> { ... }

// Derive types from the function — single source of truth
type FetchInvoiceParams = Parameters<typeof fetchInvoice>;
type FetchInvoiceResult = Awaited<ReturnType<typeof fetchInvoice>>;
```

### `Awaited<T>` — Unwrap Promise types

```typescript
type InvoiceServiceResult = ReturnType<typeof invoiceService.create>;
// InvoiceServiceResult is Promise<Invoice>

type ResolvedInvoice = Awaited<InvoiceServiceResult>;
// ResolvedInvoice is Invoice
```

### Combining Utility Types

Utility types compose. Express complex type relationships by combining them:

```typescript
type Invoice = {
  id: string;
  customerId: string;
  lineItems: LineItem[];
  totalAmountInCents: number;
  status: InvoiceStatus;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Create: everything except server-generated fields
type CreateInvoiceInput = Omit<Invoice, 'id' | 'paidAt' | 'createdAt' | 'updatedAt'>;

// Update: optional version of mutable fields only
type UpdateInvoiceInput = Partial<Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>>;

// Summary: only identity and status fields for list views
type InvoiceSummary = Pick<Invoice, 'id' | 'customerId' | 'totalAmountInCents' | 'status' | 'createdAt'>;

// Response: exclude internal fields for API consumers
type InvoiceResponse = Omit<Invoice, 'updatedAt'>;
```

---

## `unknown` Instead of `any`

`any` disables type checking. `unknown` preserves it. When you don't know the type, use `unknown` and narrow it explicitly before use.

```typescript
// ❌ Wrong — any bypasses all type safety
function parseApiResponse(response: any): Invoice {
  return response.data;
}

// ✅ Correct — unknown forces explicit narrowing
function parseApiResponse(response: unknown): Invoice {
  if (!isInvoiceResponse(response)) {
    throw new InvalidApiResponseError(response);
  }
  return response.data;
}

// Type guard — explicit, testable, reusable
function isInvoiceResponse(value: unknown): value is ApiResponse<Invoice> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    isInvoice((value as ApiResponse<unknown>).data)
  );
}
```

### Common `unknown` Narrowing Patterns

```typescript
// Narrowing error types in catch blocks
try {
  await processPayment(paymentId);
} catch (error: unknown) {
  if (error instanceof PaymentDeclinedError) {
    // Handle declined payment
  } else if (error instanceof Error) {
    this.logger.error(error.message, { stack: error.stack });
  } else {
    this.logger.error('Unknown error', { error: String(error) });
  }
}
```

---

## Discriminated Unions

Use discriminated unions to model types that can take multiple distinct shapes. This produces exhaustive type narrowing and eliminates the class of bugs where the wrong shape is accessed.

```typescript
// ❌ Wrong — optional fields leave ambiguous state
type PaymentResult = {
  success: boolean;
  transactionId?: string;   // Only present if success
  errorCode?: string;       // Only present if not success
  errorMessage?: string;    // Only present if not success
};

// ✅ Correct — discriminated union — each branch is unambiguous
type PaymentResult =
  | { status: 'success'; transactionId: string }
  | { status: 'declined'; errorCode: string; errorMessage: string }
  | { status: 'error'; cause: Error };

// TypeScript narrows correctly in each branch
function handlePaymentResult(result: PaymentResult): void {
  switch (result.status) {
    case 'success':
      recordTransaction(result.transactionId); // transactionId is string, not string | undefined
      break;
    case 'declined':
      notifyCustomer(result.errorMessage); // errorMessage is string, not string | undefined
      break;
    case 'error':
      reportError(result.cause);
      break;
  }
}
```

```typescript
// Async state — the canonical discriminated union pattern
type AsyncState<TData> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: TData }
  | { status: 'error'; error: Error };
```

---

## Generics

Use generics when a type is parameterized — when the shape is fixed but the contained type varies at the call site. Generics eliminate duplication across types that share structure but differ in a single type variable.

```typescript
// ❌ Wrong — duplicated structure for different data types
type InvoiceApiResponse = {
  data: Invoice;
  meta: ResponseMeta;
  errors: ApiError[];
};

type UserApiResponse = {
  data: User;
  meta: ResponseMeta;
  errors: ApiError[];
};

// ✅ Correct — generic captures the varying part
type ApiResponse<TData> = {
  data: TData;
  meta: ResponseMeta;
  errors: ApiError[];
};

type InvoiceApiResponse = ApiResponse<Invoice>;
type UserApiResponse = ApiResponse<User>;
```

```typescript
// Generic with constraint — TId must be a valid identifier type
type EntityById<TId extends string | number, TEntity> = {
  id: TId;
  entity: TEntity;
  fetchedAt: Date;
};

// Generic async result — eliminates the need for multiple result types
type Result<TValue, TError extends Error = Error> =
  | { success: true; value: TValue }
  | { success: false; error: TError };
```

### Generic Constraints

Always constrain generics when the type parameter has known requirements:

```typescript
// ❌ Wrong — unconstrained generic — TEntity could be anything
function findById<TEntity>(id: string, repository: Repository<TEntity>): Promise<TEntity> { }

// ✅ Correct — constrained to types that have an id field
function findById<TEntity extends { id: string }>(
  id: string,
  repository: Repository<TEntity>,
): Promise<TEntity> { }
```

---

## Type Guards and Narrowing

Write explicit type guards for narrowing `unknown` values and union types. Type guards are named, reusable, and testable — they are not inlined.

```typescript
// Named type guard — reusable across the codebase
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

// Domain type guard
function isInvoice(value: unknown): value is Invoice {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'customerId' in value &&
    'status' in value
  );
}
```

### Exhaustiveness Checking

Use a `never` assertion to ensure all union branches are handled:

```typescript
function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unhandled case: ${JSON.stringify(value)}`);
}

function getInvoiceStatusLabel(status: InvoiceStatus): string {
  switch (status) {
    case 'DRAFT':    return 'Draft';
    case 'PENDING':  return 'Awaiting Payment';
    case 'PAID':     return 'Paid';
    case 'CANCELLED': return 'Cancelled';
    default:         return assertNever(status); // Compile error if a case is missing
  }
}
```

---

## File Organisation

Types are co-located with the code they describe, or centralized in a `types/` directory when shared across the module. No file mixes unrelated concerns.

```
src/
└── invoices/
    ├── invoices.service.ts
    ├── invoices.repository.ts
    ├── invoices.controller.ts
    ├── types/
    │   ├── invoice.types.ts          # Core domain types: Invoice, InvoiceStatus
    │   ├── invoice-input.types.ts    # CreateInvoiceInput, UpdateInvoiceInput
    │   └── invoice-response.types.ts # InvoiceResponse, InvoiceSummary
    └── dto/
        └── create-invoice.dto.ts
```

**File size** — if a type file exceeds ~80 lines, it is mixing concerns. Split it. A file named `invoice.types.ts` should only contain types directly related to the `Invoice` entity.

**Barrel exports** — DO NOT use `index.ts` barrel files

---

## Const Enums and Literal Unions

Prefer **string literal unions** over `enum` for simple value sets. Enums have surprising runtime behavior (numeric enums, reverse mapping) and emit JavaScript code. Literal unions are pure types — they disappear at compile time.

```typescript
// ❌ Avoid — enum emits runtime code, numeric values are error-prone
enum InvoiceStatus {
  Draft = 'DRAFT',
  Pending = 'PENDING',
  Paid = 'PAID',
}

// ✅ Correct — literal union, pure TypeScript, no runtime overhead
type InvoiceStatus = 'DRAFT' | 'PENDING' | 'PAID' | 'CANCELLED';

// When you need the values as a runtime array (e.g. for validation):
const INVOICE_STATUSES = ['DRAFT', 'PENDING', 'PAID', 'CANCELLED'] as const;
type InvoiceStatus = typeof INVOICE_STATUSES[number];
```

**Exception**: use `const enum` or regular `enum` only when integrating with code that expects enum values (e.g. Prisma generated enums, external libraries).

---

## `as const` for Literal Inference

Use `as const` to infer the narrowest possible type for literal values. Combined with `typeof`, it produces reusable types from runtime constants.

```typescript
const PAGINATION_DEFAULTS = {
  defaultPageSize: 20,
  maxPageSize: 100,
  defaultSortDirection: 'DESC',
} as const;

// Type is inferred as the literal shape — no widening to number or string
// PAGINATION_DEFAULTS.defaultPageSize is 20, not number
// PAGINATION_DEFAULTS.defaultSortDirection is 'DESC', not string

type PaginationDefaults = typeof PAGINATION_DEFAULTS;
```

---

## Template Literal Types

Use template literal types to express string patterns with type safety:

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type ApiVersion = 'v1' | 'v2';

type ApiEndpoint = `/${ApiVersion}/${string}`;

type EventName<TEntity extends string, TAction extends string> =
  `${TEntity}.${TAction}`;

type InvoiceEvent = EventName<'invoice', 'created' | 'paid' | 'cancelled'>;
// 'invoice.created' | 'invoice.paid' | 'invoice.cancelled'
```

---

## Strict TypeScript Configuration

The project `tsconfig.json` must enable the full strict suite. These flags are non-negotiable:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

**`noUncheckedIndexedAccess`** — accessing an array element or record value returns `T | undefined`, not `T`. This forces explicit null handling and catches a large class of runtime errors at compile time.

**`exactOptionalPropertyTypes`** — distinguishes between `{ field?: string }` (field may be absent) and `{ field: string | undefined }` (field is present but may be undefined). These are different things and should be typed differently.

---

## Hard Limits

- Never use `any` — use `unknown` and narrow it
- Never define a type inline — every shape has a name
- Never duplicate a type shape — derive using utility types
- Never use `as SomeType` to satisfy the compiler — fix the types
- Never use `interface` where `type` works
- Never let a type file exceed ~80 lines without splitting it
- Never use numeric enums — use string literal unions
- Never use `// @ts-ignore` — fix the underlying type error
- Never use `// @ts-expect-error` without a comment explaining why it is unavoidable