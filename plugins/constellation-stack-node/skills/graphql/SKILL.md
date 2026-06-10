---
name: graphql
description: How to use graphql with Nestjs and Typescript on a code-first approach
---

# GraphQL Skill

## Scope

Apply this skill for any task involving GraphQL schema design, resolver implementation, performance patterns, authorization, or testing. This skill assumes the implementation stack is **NestJS + TypeScript** using the `@nestjs/graphql` module with `ApolloDriver`.

**The code-first approach is mandatory.** The GraphQL schema is always generated from TypeScript code — decorators on classes and fields drive the schema. Never write `.graphql` SDL files by hand. Never use the schema-first approach. The source of truth is the TypeScript code; the generated schema file is an output artifact, not an input.

For federation-specific concerns (subgraphs, entities, `@key`, `@extends`, `@requires`, Apollo Router), load `agentic/skills/graphql-federation/SKILL.md` in addition to this file.

---

## Code-First Approach

### What Code-First Means

In code-first, the GraphQL schema is an **artifact generated from TypeScript classes and decorators** — not a document you author and maintain separately. NestJS reads the decorator metadata at startup and emits a valid `schema.graphql` file automatically.

This keeps a single source of truth: the TypeScript code. Types, fields, nullability, descriptions, and deprecations are all declared once in code and reflected in the schema. You never have to keep a `.graphql` file and a TypeScript class in sync.

### Module Configuration

```typescript
// graphql.module.ts
GraphQLModule.forRoot<ApolloFederationDriverConfig>({
  driver: ApolloFederationDriver,
  autoSchemaFile: {
    path: join(process.cwd(), 'src/schema.gql'), // generated — do not edit manually
    federation: 2,
  },
  sortSchema: true,       // deterministic output — avoids noisy diffs in version control
  buildSchemaOptions: {
    dateScalarMode: 'timestamp', // consistent DateTime serialization
  },
}),
```

The generated `schema.gql` file must be committed to version control so that schema diffs are visible in pull requests. It must never be edited by hand — any manual edit will be overwritten on the next application start.

Add a CI check that regenerates the schema and fails if the committed file differs from the generated output:

```bash
# In CI — verifies the committed schema matches the code
npx ts-node src/generate-schema.ts
git diff --exit-code src/schema.gql
```

### The Decorator Vocabulary

Every GraphQL construct has a corresponding NestJS decorator. Use the right decorator for the right purpose — never approximate with a close-enough one.

| Construct | Decorator | Usage |
|---|---|---|
| Output type | `@ObjectType()` | Classes returned from resolvers |
| Input type | `@InputType()` | Classes received as mutation/query arguments |
| Enum | `registerEnumType()` | TypeScript enums exposed in the schema |
| Interface | `@InterfaceType()` | Abstract types implemented by multiple object types |
| Union | `createUnionType()` | Result types with multiple possible shapes |
| Field on a type | `@Field()` | Properties on `@ObjectType` or `@InputType` classes |
| Query | `@Query()` | Read operations on a `@Resolver` class |
| Mutation | `@Mutation()` | Write operations on a `@Resolver` class |
| Subscription | `@Subscription()` | Real-time operations on a `@Resolver` class |
| Field resolver | `@ResolveField()` | Computed or related fields resolved separately |
| Resolver arg | `@Args()` | Individual arguments on a query, mutation, or field resolver |
| Parent object | `@Parent()` | The parent object in a `@ResolveField` |
| Context | `@Context()` | The GraphQL context object (use sparingly — prefer `@CurrentUser()`) |

### Declaring Types

**Object types** — every field must have an explicit `@Field()` decorator with an explicit type function. Never rely on type inference for the schema — always declare the type explicitly:

```typescript
@ObjectType({ description: 'Represents a finalized customer invoice.' })
export class Invoice {
  @Field(() => ID, { description: 'Unique identifier for the invoice.' })
  id: string;

  @Field(() => String, { description: 'Human-readable invoice reference number.' })
  invoiceNumber: string;

  @Field(() => Int, { description: 'Invoice total in the smallest currency unit (e.g. cents).' })
  totalAmountInCents: number;

  @Field(() => InvoiceStatus)
  status: InvoiceStatus;

  @Field(() => Date)
  createdAt: Date;

  // Nullable field — explicitly documented why
  @Field(() => Date, {
    nullable: true,
    description: 'The date this invoice was paid. Null if payment has not been received.',
  })
  paidAt: Date | null;
}
```

**The `() => Type` arrow function syntax is mandatory** — do not use the shorthand `@Field()` without a type function, as TypeScript metadata reflection is unreliable for complex types, arrays, and nullable values:

```typescript
// Wrong — relies on metadata reflection, breaks for arrays and nullable types
@Field()
invoiceNumber: string;

// Correct — explicit, reliable, always generates the expected schema type
@Field(() => String)
invoiceNumber: string;

// Correct — arrays require the wrapper syntax
@Field(() => [LineItem])
lineItems: LineItem[];

// Correct — nullable fields declare their base type inside the arrow function
@Field(() => Date, { nullable: true })
paidAt: Date | null;
```

**Input types** — mirror the object type pattern but use `@InputType()`. Input types and object types are never the same class — they have different validation, nullability, and shape requirements:

```typescript
@InputType()
export class CreateInvoiceInput {
  @Field(() => ID)
  @IsUUID()
  customerId: string;

  @Field(() => [CreateLineItemInput])
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLineItemInput)
  lineItems: CreateLineItemInput[];
}
```

**Descriptions are mandatory on all public types and fields.** The generated schema is consumed by client teams and tooling — undescribed fields force readers to trace the implementation to understand intent:

```typescript
// Wrong — no description
@Field(() => Int)
totalAmountInCents: number;

// Correct
@Field(() => Int, {
  description: 'Invoice total expressed in the smallest currency unit. Divide by 100 for display in major units.',
})
totalAmountInCents: number;
```

### Deprecating Fields

Use the `deprecationReason` option to mark fields for removal — this propagates into the generated schema and is surfaced by client tooling:

```typescript
@Field(() => Float, {
  deprecationReason: 'Use totalAmountInCents instead. Will be removed in API version 3.',
})
totalAmount: number;
```

### Custom Scalars

Register custom scalars for types that have no native GraphQL equivalent. Define them once and reference them consistently:

```typescript
// scalars/date.scalar.ts
@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> {
  description = 'A UTC timestamp represented as milliseconds since Unix epoch.';

  parseValue(value: number): Date {
    return new Date(value);
  }

  serialize(value: Date): number {
    return value.getTime();
  }

  parseLiteral(ast: ValueNode): Date {
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10));
    }
    throw new Error('Date scalar expects an integer timestamp.');
  }
}
```

Register in the module and reference in types:

```typescript
@Field(() => Date) // Uses the registered DateScalar
createdAt: Date;
```

---

## Schema Design

The schema is a public contract. Every type, field, and argument you expose is a promise to every consumer. Design it deliberately — schemas are painful to change once clients depend on them.

### Naming Conventions

- Types are `PascalCase` nouns that represent domain concepts: `Invoice`, `CustomerProfile`, `PaymentMethod`
- Fields are `camelCase` and named for what they **mean**, not what they store: `totalAmountInCents` not `amount`, `isEligibleForDiscount` not `eligible`
- Query fields are named after what they return: `invoice(id: ID!)`, `invoicesByCustomer(customerId: ID!)`
- Mutation fields are named after the action performed: `createInvoice`, `cancelSubscription`, `updatePaymentMethod`
- Subscription fields describe the event: `invoiceStatusChanged`, `paymentProcessed`
- Enum values are `SCREAMING_SNAKE_CASE`: `PaymentStatus { PENDING, PROCESSING, COMPLETED, FAILED }`
- Input types are suffixed with `Input`: `CreateInvoiceInput`, `UpdatePaymentMethodInput`

### Type Design

**Prefer specific types over generic ones**

```graphql
# Bad — caller must know the string format
type Invoice {
  createdAt: String!
  totalAmount: String!
}

# Good — intent is explicit
type Invoice {
  createdAt: DateTime!
  totalAmountInCents: Int!
  currency: CurrencyCode!
}
```

**Non-null by default, nullable by exception**

A field is non-null (`!`) unless there is a deliberate reason it may be absent. Document why a field is nullable — it is a contract that the client must handle a missing value.

```typescript
@ObjectType()
export class Invoice {
  @Field(() => ID)
  id: string;

  @Field(() => String)
  invoiceNumber: string;

  // Nullable — draft invoices have no due date until they are finalized
  @Field(() => Date, { nullable: true })
  dueDate: Date | null;
}
```

**Use enums for constrained value sets**

```typescript
registerEnumType(PaymentStatus, {
  name: 'PaymentStatus',
  description: 'Represents the lifecycle state of a payment attempt.',
  valuesMap: {
    PENDING:    { description: 'Payment has been initiated but not yet processed.' },
    PROCESSING: { description: 'Payment is being processed by the payment provider.' },
    COMPLETED:  { description: 'Payment was successfully processed.' },
    FAILED:     { description: 'Payment was declined or encountered an error.' },
  },
});
```

**Model errors as part of the schema, not as exceptions**

Business errors are not exceptional — they are expected outcomes. Model them explicitly using a union return type rather than relying on GraphQL errors:

```typescript
@ObjectType()
export class InvoiceNotFoundError {
  @Field(() => String)
  message: string;

  @Field(() => ID)
  requestedInvoiceId: string;
}

export const CreateInvoiceResult = createUnionType({
  name: 'CreateInvoiceResult',
  types: () => [Invoice, InvoiceNotFoundError, ValidationError] as const,
});

@Mutation(() => CreateInvoiceResult)
async createInvoice(@Args('input') input: CreateInvoiceInput): Promise<typeof CreateInvoiceResult> {
  return this.invoiceService.create(input);
}
```

### Input Validation

Validate inputs at the resolver boundary — never let invalid data reach the service layer. Use `class-validator` decorators on Input types, which NestJS integrates with the `ValidationPipe`:

```typescript
@InputType()
export class CreateInvoiceInput {
  @Field(() => ID)
  @IsUUID()
  customerId: string;

  @Field(() => [LineItemInput])
  @ArrayMinSize(1, { message: 'An invoice must contain at least one line item.' })
  @ValidateNested({ each: true })
  @Type(() => LineItemInput)
  lineItems: LineItemInput[];

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
```

---

## Resolvers

### Resolver Responsibilities

A resolver has exactly one job: translate a GraphQL operation into a domain action and map the result back to a GraphQL type. It does not contain business logic.

```typescript
@Resolver(() => Invoice)
export class InvoiceResolver {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Query(() => Invoice, { nullable: true })
  async invoice(@Args('id', { type: () => ID }) invoiceId: string): Promise<Invoice | null> {
    return this.invoiceService.findById(invoiceId);
  }

  @Mutation(() => CreateInvoiceResult)
  async createInvoice(
    @Args('input') input: CreateInvoiceInput,
    @CurrentUser() requestingUser: AuthenticatedUser,
  ): Promise<typeof CreateInvoiceResult> {
    return this.invoiceService.create(input, requestingUser);
  }
}
```

### Field Resolvers

Use `@ResolveField()` for fields that require their own resolution logic — computed fields, fields that require an additional data fetch, or fields that load related entities:

```typescript
@Resolver(() => Invoice)
export class InvoiceResolver {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly customerService: CustomerService,
  ) {}

  // Resolved separately — customer lives in another service or requires its own fetch
  @ResolveField(() => Customer)
  async customer(@Parent() invoice: Invoice): Promise<Customer> {
    return this.customerService.findById(invoice.customerId);
  }

  // Computed field — not stored, derived from line items
  @ResolveField(() => Int)
  totalAmountInCents(@Parent() invoice: Invoice): number {
    return invoice.lineItems.reduce(
      (runningTotal, lineItem) => runningTotal + lineItem.unitPriceInCents * lineItem.quantity,
      0,
    );
  }
}
```

### N+1 Problem — DataLoader Pattern

Every `@ResolveField` that fetches a related entity is a potential N+1 query. Solve this with DataLoader — batch and cache individual lookups into a single query per request.

**Never resolve related entities in a `@ResolveField` without a DataLoader when the parent can be a list.**

```typescript
// dataloader/customer.loader.ts
@Injectable()
export class CustomerLoader {
  private readonly loader: DataLoader<string, Customer>;

  constructor(private readonly customerRepository: CustomerRepository) {
    this.loader = new DataLoader<string, Customer>(
      async (customerIds: readonly string[]) => {
        const customers = await this.customerRepository.findByIds([...customerIds]);
        const customerMap = new Map(customers.map(c => [c.id, c]));
        // Return in the same order as the input keys — DataLoader requirement
        return customerIds.map(id => customerMap.get(id) ?? new Error(`Customer ${id} not found`));
      },
      { cache: true }, // Cache within a single request lifecycle
    );
  }

  load(customerId: string): Promise<Customer> {
    return this.loader.load(customerId);
  }
}

// In the resolver
@ResolveField(() => Customer)
async customer(@Parent() invoice: Invoice): Promise<Customer> {
  return this.customerLoader.load(invoice.customerId);
}
```

Scope `DataLoader` instances to the **request lifecycle** — register the loader provider with `Scope.REQUEST` to ensure the cache does not leak between requests:

```typescript
@Injectable({ scope: Scope.REQUEST })
export class CustomerLoader { ... }
```

---

## Authentication and Authorization

### Authentication

Attach the authenticated user to the GraphQL context in the Apollo driver configuration. Resolvers access it via a `@CurrentUser()` decorator — never from a global or ambient source.

```typescript
// graphql.module.ts
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  context: ({ req }) => ({ user: req.user }), // populated by AuthGuard
}),
```

```typescript
// decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (_, context: ExecutionContext): AuthenticatedUser => {
    const graphqlContext = GqlExecutionContext.create(context).getContext();
    return graphqlContext.user;
  },
);
```

### Authorization

Apply authorization at the resolver level using Guards. Never rely on business logic inside services to enforce access control — that is the resolver's boundary responsibility.

```typescript
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Mutation(() => Invoice)
async cancelInvoice(
  @Args('id', { type: () => ID }) invoiceId: string,
  @CurrentUser() requestingUser: AuthenticatedUser,
): Promise<Invoice> {
  return this.invoiceService.cancel(invoiceId, requestingUser);
}
```

For field-level authorization (hiding specific fields from certain roles), use a custom `FieldMiddleware`:

```typescript
const sensitiveFieldMiddleware: FieldMiddleware = async (ctx, next) => {
  const { info, context } = ctx;
  if (!context.user?.roles.includes(UserRole.FINANCE)) {
    return null; // Field is hidden for non-finance users
  }
  return next();
};

@Field(() => Int, { middleware: [sensitiveFieldMiddleware] })
internalCostInCents: number;
```

---

## Performance

### Query Complexity and Depth Limits

Unprotected GraphQL APIs are vulnerable to deeply nested queries that produce exponential database load. Apply complexity and depth limits:

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  validationRules: [
    depthLimit(10),
    createComplexityRule({
      maximumComplexity: 1000,
      estimators: [
        fieldExtensionsEstimator(),
        simpleEstimator({ defaultComplexity: 1 }),
      ],
    }),
  ],
}),
```

Annotate expensive fields with their complexity cost:

```typescript
@Field(() => [LineItem], {
  complexity: (options) => options.args.limit * options.childComplexity,
})
lineItems(@Args('limit', { defaultValue: 20 }) limit: number): LineItem[] { ... }
```

### Persisted Queries

For production, use **Automatic Persisted Queries (APQ)** to reduce request payload size and enable CDN caching of query strings.

### Pagination

Never return unbounded lists. Every field that returns a collection is paginated. Use **cursor-based pagination** (the Relay Connection spec) for stable ordering and efficient large dataset traversal:

```typescript
@ObjectType()
export class InvoiceEdge {
  @Field(() => String)
  cursor: string;

  @Field(() => Invoice)
  node: Invoice;
}

@ObjectType()
export class InvoiceConnection {
  @Field(() => [InvoiceEdge])
  edges: InvoiceEdge[];

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}

@Query(() => InvoiceConnection)
async invoices(
  @Args() paginationArgs: ConnectionArgs,
  @CurrentUser() user: AuthenticatedUser,
): Promise<InvoiceConnection> {
  return this.invoiceService.findPaginated(paginationArgs, user);
}
```

Use offset pagination only for admin interfaces where jumping to a specific page is required.

---

## Testing GraphQL in NestJS

### Unit Testing Resolvers

Resolvers are thin — test the service layer, not the resolver. When you do test a resolver directly, test that it correctly delegates to its service and maps the result:

```typescript
describe('InvoiceResolver', () => {
  let resolver: InvoiceResolver;
  let invoiceService: DeepMocked<InvoiceService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        InvoiceResolver,
        { provide: InvoiceService, useValue: createMock<InvoiceService>() },
      ],
    }).compile();

    resolver = module.get(InvoiceResolver);
    invoiceService = module.get(InvoiceService);
  });

  describe('invoice query', () => {
    it('returns the invoice when it exists', async () => {
      const existingInvoice = buildInvoice({ id: 'inv_123' });
      invoiceService.findById.mockResolvedValue(existingInvoice);

      const result = await resolver.invoice('inv_123');

      expect(result).toEqual(existingInvoice);
    });

    it('returns null when the invoice does not exist', async () => {
      invoiceService.findById.mockResolvedValue(null);

      const result = await resolver.invoice('inv_does_not_exist');

      expect(result).toBeNull();
    });
  });
});
```

### Integration Testing the Full GraphQL Stack

Test through the full NestJS GraphQL stack using a real in-memory server — this catches schema mismatches, middleware issues, and auth failures that unit tests miss:

```typescript
describe('Invoice GraphQL API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(InvoiceRepository)
      .useValue(createMock<InvoiceRepository>())
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());

  it('returns a 200 with invoice data for an authenticated request', async () => {
    const query = `
      query GetInvoice($id: ID!) {
        invoice(id: $id) {
          id
          invoiceNumber
          totalAmountInCents
        }
      }
    `;

    const response = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${generateTestToken()}`)
      .send({ query, variables: { id: 'inv_123' } })
      .expect(200);

    expect(response.body.data.invoice).toMatchObject({
      id: 'inv_123',
      invoiceNumber: expect.any(String),
      totalAmountInCents: expect.any(Number),
    });
  });

  it('returns an UNAUTHENTICATED error for requests without a valid token', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `query { invoice(id: "inv_123") { id } }` })
      .expect(200); // GraphQL always returns 200; errors are in the body

    expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });
});
```

---

## Common Pitfalls

- **Never return raw ORM entities from resolvers** — map to GraphQL types explicitly. Leaking persistence models into the schema couples your schema to your database structure.
- **Never use `any` for resolver return types** — type every resolver return precisely. `Promise<Invoice | null>` not `Promise<any>`.
- **Never ignore the N+1 problem** — every `@ResolveField` on a type that appears in a list needs a DataLoader.
- **Never use offset pagination for large datasets** — cursors are stable under concurrent writes; page numbers are not.
- **Never expose internal error messages to clients** — catch infrastructure errors at the resolver boundary and return domain-appropriate messages.