---
name: graphql-federation
description: How to build a graphql federated API approach, composing a supergraph based on subgraph graphql servers
---

# GraphQL Federation Skill

## Scope

Apply this skill for any task involving Apollo Federation — subgraph design, entity ownership, cross-subgraph type extension, federation directives, Apollo Router configuration, or schema composition. This skill assumes **NestJS + TypeScript** using `@nestjs/graphql` with `ApolloFederationDriver` and **Federation 2 spec**.

This skill is a complement to the `graphql` skill in this plugin — load both when working on a federated subgraph. Load only the base skill for standalone (non-federated) GraphQL work.

---

## Architecture Model

Federation composes a single unified **supergraph** from multiple independently deployable **subgraphs**. Each subgraph owns a slice of the schema and its underlying data. The **Apollo Router** routes incoming operations across subgraphs and stitches results together into a single response.

```
Client
  │
  ▼
[Apollo Router]
  │
  ├──► [Subgraph: customers-service]   owns: Customer, Address
  ├──► [Subgraph: orders-service]      owns: Order, LineItem — extends: Customer
  └──► [Subgraph: payments-service]    owns: Payment, Invoice — extends: Order
```

**Core principle**: a subgraph owns its types. No two subgraphs define the same type independently — they either own it or extend it. Ownership is declared with `@key`; extension is declared with `@extends` + `@external`.

---

## NestJS Subgraph Setup

Every subgraph uses `ApolloFederationDriver` and declares `federation: 2` in the schema file options:

```typescript
// graphql.module.ts — subgraph configuration
GraphQLModule.forRoot<ApolloFederationDriverConfig>({
  driver: ApolloFederationDriver,
  autoSchemaFile: {
    path: join(process.cwd(), 'src/schema.gql'),
    federation: 2,
  },
  sortSchema: true,
}),
```

The generated schema includes the Federation 2 `@link` directive automatically. Never manually add or edit federation directives in the schema file — they are derived from the code.

---

## Entities — The Federation Contract

An **entity** is a type that has an identity across the supergraph — it can be referenced by other subgraphs and resolved by its owning subgraph from a key alone. Entities are the primary mechanism for cross-subgraph data composition.

### Declaring an Entity (Owning Subgraph)

```typescript
// customers-service — owns the Customer entity
@ObjectType({ description: 'A registered customer account.' })
@Directive('@key(fields: "id")')
export class Customer {
  @Field(() => ID)
  id: string;

  @Field(() => String)
  emailAddress: string;

  @Field(() => String)
  fullName: string;
}
```

### Implementing `@ResolveReference`

The owning subgraph must implement `@ResolveReference()` — this is called by the Router whenever another subgraph references a `Customer` by its key. It must reconstruct the full entity from the key fields alone:

```typescript
@Resolver(() => Customer)
export class CustomerResolver {
  constructor(private readonly customerService: CustomerService) {}

  @ResolveReference()
  async resolveReference(
    reference: { __typename: string; id: string },
  ): Promise<Customer> {
    return this.customerService.findById(reference.id);
  }
}
```

**`@ResolveReference` must always be present on the owning resolver.** If it is missing, the Router cannot resolve the entity when another subgraph requests it — this causes runtime query failures, not schema composition failures, making it easy to miss until production.

### Compound Keys

Entities can be identified by multiple fields when no single field is unique:

```typescript
@Directive('@key(fields: "orderId lineItemIndex")')
export class LineItem {
  @Field(() => ID)
  orderId: string;

  @Field(() => Int)
  lineItemIndex: number;

  @Field(() => String)
  productName: string;
}

@ResolveReference()
async resolveReference(
  reference: { orderId: string; lineItemIndex: number },
): Promise<LineItem> {
  return this.lineItemService.findByOrderAndIndex(
    reference.orderId,
    reference.lineItemIndex,
  );
}
```

---

## Extending Entities Across Subgraphs

A subgraph that does not own an entity can contribute additional fields to it. The extending subgraph declares the entity's key fields as `@external` (owned elsewhere) and adds its own fields:

```typescript
// orders-service — extends Customer with order history
@ObjectType()
@Directive('@key(fields: "id")')
@Directive('@extends')
export class Customer {
  @Field(() => ID)
  @Directive('@external')
  id: string; // Owned by customers-service — declared here only to satisfy the @key

  @Field(() => [Order])
  orderHistory: Order[]; // Owned by orders-service
}

@Resolver(() => Customer)
export class CustomerOrdersResolver {
  constructor(private readonly orderService: OrderService) {}

  @ResolveReference()
  resolveReference(reference: { id: string }): Pick<Customer, 'id'> {
    // Return only the key — the router supplies owned fields from the origin subgraph
    return { id: reference.id };
  }

  @ResolveField(() => [Order])
  async orderHistory(@Parent() customer: Customer): Promise<Order[]> {
    return this.orderService.findByCustomerId(customer.id);
  }
}
```

---

## Shareable Types

Value types that have no identity (no `@key`) but are used across multiple subgraphs must be marked `@shareable`. This explicitly signals to the Router that multiple subgraphs may return instances of this type and they are interchangeable:

```typescript
@ObjectType({ description: 'A monetary value with currency.' })
@Directive('@shareable')
export class Money {
  @Field(() => Int, { description: 'Amount in the smallest currency unit (e.g. cents).' })
  amountInCents: number;

  @Field(() => String, { description: 'ISO 4217 currency code.' })
  currencyCode: string;
}
```

Common candidates for `@shareable`: `Money`, `Address`, `Coordinates`, `DateRange`, `PageInfo`.

---

## Federation 2 Directives Reference

| Directive | Applied to | Purpose |
|---|---|---|
| `@key(fields: "...")` | `@ObjectType` | Declares an entity and its identifying fields |
| `@extends` | `@ObjectType` | Marks a type as extending an entity owned by another subgraph |
| `@external` | `@Field` | Marks a field as owned by another subgraph (required on key fields in extensions) |
| `@requires(fields: "...")` | `@Field` | Declares that a field resolver needs non-key fields from the owning subgraph |
| `@provides(fields: "...")` | `@Field` | Declares that this subgraph can resolve specific fields of a related entity without a router round-trip |
| `@shareable` | `@ObjectType` or `@Field` | Allows a non-entity type or field to be defined in multiple subgraphs |
| `@inaccessible` | Any | Hides a field or type from the public supergraph schema |
| `@override(from: "...")` | `@Field` | Migrates a field's ownership from one subgraph to this one |

---

## The `@requires` Directive

Use `@requires` when a field resolver in an extending subgraph needs fields from the owning subgraph beyond the entity key. The Router fetches those fields from the owner first, then calls the extending resolver with them populated:

```typescript
// shipping-service — needs Customer.shippingRegion to estimate shipping cost
@ObjectType()
@Directive('@key(fields: "id")')
@Directive('@extends')
export class Customer {
  @Field(() => ID)
  @Directive('@external')
  id: string;

  @Field(() => String)
  @Directive('@external')
  shippingRegion: string; // Owned by customers-service; fetched before this resolver runs

  @Field(() => Money)
  @Directive('@requires(fields: "shippingRegion")')
  estimatedShippingCost: Money; // Owned by shipping-service; needs shippingRegion to compute
}

@ResolveField(() => Money)
async estimatedShippingCost(@Parent() customer: Customer): Promise<Money> {
  // customer.shippingRegion is populated by the Router via @requires — treat it as available
  return this.shippingRateCalculator.estimateForRegion(customer.shippingRegion);
}
```

**`@requires` has a performance cost** — it causes the Router to make an additional fetch to the owning subgraph before the extending resolver can run. Every `@requires` adds a network round-trip to the query plan. Use it only when there is no alternative, and always profile its impact on query latency.

---

## The `@provides` Directive

Use `@provides` as the counterpart to `@requires` — it tells the Router that this subgraph can already supply certain fields of a related entity without a separate fetch. This eliminates a Router round-trip when those fields are requested:

```typescript
// orders-service — can provide Product.name without a separate products-service call
@ObjectType()
export class LineItem {
  @Field(() => Product)
  @Provides('name') // orders-service stores product name locally on the line item
  product: Product;
}
```

Use `@provides` when your subgraph stores a denormalized copy of fields from another entity and can serve them without fetching from the owner.

---

## Subgraph Design Rules

**Subgraph boundaries map to domain boundaries** — a subgraph is a bounded context. The schema boundary and the service boundary should align. Types that are always fetched together, managed by the same team, and share the same deployment lifecycle belong in the same subgraph.

**Avoid over-federation** — not every microservice needs its own subgraph. A subgraph boundary makes sense when the type is referenced by other subgraphs or when the service has an independent deployment lifecycle that other services should not depend on. An internal service that no other subgraph references does not belong in the federation.

**Entities must be resolvable from their key fields alone** — `@ResolveReference` receives only the key fields declared in `@key`. If the entity cannot be fetched from those fields alone, the key is wrong. Composite keys that require joining across services are a schema design error, not an implementation problem.

**Prefer domain identifiers over database IDs as keys** — `@key(fields: "orderNumber")` is more stable and meaningful than `@key(fields: "id")` when `orderNumber` is the natural domain identifier. Database IDs are implementation details; domain identifiers are contracts.

**Do not put shared infrastructure types in a subgraph** — types like `PageInfo`, `Money`, and `SortDirection` that are used across subgraphs are either `@shareable` value types or should live in a dedicated shared schema package consumed at build time, not resolved at runtime.

---

## Schema Composition and the Apollo Router

The Apollo Router composes the supergraph schema from all subgraph schemas at startup (managed mode) or from a pre-composed supergraph SDL (self-hosted mode). Composition fails fast if any of these conditions are violated:

- An entity is declared with `@key` in a subgraph but has no `@ResolveReference` implementation
- Two subgraphs define the same type without `@shareable` or federation extension directives
- A field marked `@external` in an extending subgraph does not exist in the owning subgraph
- An `@override` migration references a subgraph that no longer exists

**Always run schema composition locally before pushing a subgraph change** using the Rover CLI:

```bash
rover subgraph check my-graph@prod \
  --schema ./src/schema.gql \
  --name customers-service \
  --routing-url https://customers.internal/graphql
```

---

## Common Pitfalls

- **Never define the same entity in two subgraphs without federation directives** — this causes schema composition to fail at the Router level
- **Never forget `@ResolveReference` on an entity resolver** — its absence causes silent runtime failures when the Router tries to resolve references from other subgraphs
- **Never use `@requires` without profiling the query plan** — each `@requires` adds a network hop to the Router's query execution
- **Never declare `@external` on fields that the extending subgraph actually owns** — `@external` means "this field is owned elsewhere"; misusing it produces incorrect query plans
- **Never ship a subgraph schema change without running `rover subgraph check`** — composition errors discovered in production are significantly more expensive than those caught locally