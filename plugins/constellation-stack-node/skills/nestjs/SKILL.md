---
name: nestjs
description: Most recommended practices and modules to use alongside with NestJS framework for backend development
---

# NestJS Skill

## Scope

Apply this skill for any task involving NestJS application structure, module design, dependency injection, configuration, or integration with the project's core dependencies. The full tech stack this skill covers:

- **Framework**: NestJS + TypeScript
- **ORM**: Prisma
- **Queue / Cache**: Redis via BullMQ (`@nestjs/bullmq`)
- **Auth**: `jsonwebtoken` (JWT, no Passport)
- **Config**: `@nestjs/config`
- **Health checks**: `@nestjs/terminus`
- **Rate limiting**: `@nestjs/throttler`
- **Logging**: `nest-winston`

---

## Project Structure

Every NestJS application is organized around **feature modules**. Each module owns its slice of the domain — its controllers, services, repositories, and types. Nothing leaks across module boundaries except through explicitly exported providers.

```
src/
├── app.module.ts               # Root module — imports all feature modules
├── main.ts                     # Bootstrap — app factory, global middleware, pipes, guards
│
├── config/                     # Configuration module
│   ├── config.module.ts
│   └── config.schema.ts        # Joi/Zod validation schema for env vars
│
├── common/                     # Shared infrastructure — guards, interceptors, pipes, decorators
│   ├── guards/
│   ├── interceptors/
│   ├── pipes/
│   ├── decorators/
│   └── filters/
│
├── database/                   # Prisma module and service
│   ├── database.module.ts
│   └── database.service.ts     # PrismaClient wrapper
│
├── queue/                      # BullMQ shared setup
│   └── queue.module.ts
│
├── logger/                     # Winston logger module
│   └── logger.module.ts
│
└── <feature>/                  # One directory per bounded context
    ├── <feature>.module.ts
    ├── <feature>.controller.ts
    ├── <feature>.service.ts
    ├── <feature>.repository.ts
    ├── dto/
    │   ├── create-<feature>.dto.ts
    │   └── update-<feature>.dto.ts
    └── entities/
        └── <feature>.entity.ts
```

### Module Boundaries
- A module exports only what other modules are allowed to use
- Never import a service from another feature module directly — import the module that exports it
- Shared infrastructure (guards, interceptors, pipes) lives in `common/` and is applied globally in `main.ts` or at the controller level — never reimported per feature module

---

## Module Design

### Feature Module Template

```typescript
// invoices/invoices.module.ts
@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({ name: INVOICE_QUEUE }),
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository],
  exports: [InvoicesService], // Export only what other modules legitimately need
})
export class InvoicesModule {}
```

### Global Modules
Use `@Global()` only for truly cross-cutting infrastructure that every module needs without importing:
- `DatabaseModule` (PrismaService)
- `LoggerModule` (WinstonLogger)
- `ConfigModule`

Resist the urge to make feature modules global — it hides dependencies and makes the module graph untraceable.

---

## Dependency Injection

NestJS DI is constructor-based. Every dependency is declared in the constructor and injected by the container. Never instantiate services with `new` inside other services.

```typescript
@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly configService: ConfigService<EnvironmentVariables>,
    private readonly logger: Logger,
  ) {}
}
```

### Custom Providers
Use custom providers when the dependency requires configuration or factory logic:

```typescript
// Providing a configured instance
{
  provide: STRIPE_CLIENT,
  useFactory: (configService: ConfigService<EnvironmentVariables>) =>
    new Stripe(configService.getOrThrow('STRIPE_SECRET_KEY'), {
      apiVersion: '2023-10-16',
    }),
  inject: [ConfigService],
}
```

### Injection Tokens
Use string or Symbol tokens for non-class dependencies. Always define tokens as constants — never use raw strings inline:

```typescript
// constants/injection-tokens.ts
export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');
export const INVOICE_QUEUE = 'invoice-queue';

// Usage
@Inject(STRIPE_CLIENT) private readonly stripeClient: Stripe
```

---

## Configuration — `@nestjs/config`

### Setup with Validation

Validate all environment variables at startup. The application must fail fast with a clear error if a required variable is missing or malformed — never let a misconfigured app reach a running state.

```typescript
// config/config.module.ts
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
      cache: true, // Cache parsed values — avoids re-reading process.env on every access
    }),
  ],
})
export class ConfigModule {}
```

```typescript
// config/environment.ts
export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Transform(({ value }) => parseInt(value, 10))
  PORT: number;

  @IsEnum(['development', 'staging', 'production', 'test'])
  NODE_ENV: string;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.toString()}`);
  }
  return validatedConfig;
}
```

### Typed Config Access

Always type the `ConfigService` generic parameter — never access config values with untyped `get()`:

```typescript
// Untyped — no compile-time safety
this.configService.get('JWT_SECRET')

// Typed — compile error if key doesn't exist in EnvironmentVariables
this.configService.getOrThrow<string>('JWT_SECRET')

// Fully typed with generic parameter
constructor(
  private readonly configService: ConfigService<EnvironmentVariables, true>,
) {}

// Now this is fully type-safe
const jwtSecret = this.configService.get('JWT_SECRET'); // inferred as string
```

---

## Database — Prisma

### PrismaService

Wrap `PrismaClient` in a NestJS service that handles lifecycle correctly:

```typescript
// database/database.service.ts
@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    super({
      datasources: {
        db: { url: configService.get('DATABASE_URL') },
      },
      log: configService.get('NODE_ENV') === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

```typescript
// database/database.module.ts
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
```

### Repository Pattern

Never use `DatabaseService` directly in feature services — wrap all data access in a repository. This keeps Prisma out of the business logic layer and makes services testable without a database:

```typescript
// invoices/invoices.repository.ts
@Injectable()
export class InvoicesRepository {
  constructor(private readonly database: DatabaseService) {}

  async findById(invoiceId: string): Promise<Invoice | null> {
    return this.database.invoice.findUnique({
      where: { id: invoiceId },
    });
  }

  async findByCustomerId(
    customerId: string,
    pagination: PaginationParams,
  ): Promise<Invoice[]> {
    return this.database.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: pagination.limit,
      skip: pagination.offset,
    });
  }

  async create(data: Prisma.InvoiceCreateInput): Promise<Invoice> {
    return this.database.invoice.create({ data });
  }
}
```

### Transactions

Use `$transaction` for operations that must succeed or fail atomically. Pass the transaction client through to repository methods that participate in it:

```typescript
// In the service
async createOrderWithInvoice(
  orderData: CreateOrderInput,
): Promise<{ order: Order; invoice: Invoice }> {
  return this.database.$transaction(async (transactionClient) => {
    const order = await this.ordersRepository.create(orderData, transactionClient);
    const invoice = await this.invoicesRepository.createForOrder(order, transactionClient);
    return { order, invoice };
  });
}

// Repository method accepts optional transaction client
async create(
  data: Prisma.OrderCreateInput,
  transactionClient?: Prisma.TransactionClient,
): Promise<Order> {
  const client = transactionClient ?? this.database;
  return client.order.create({ data });
}
```

### Prisma Error Handling

Map Prisma errors to domain errors at the repository boundary — never let `PrismaClientKnownRequestError` propagate into the service layer:

```typescript
import { Prisma } from '@prisma/client';

async findByEmailOrThrow(emailAddress: string): Promise<User> {
  try {
    return await this.database.user.findUniqueOrThrow({
      where: { emailAddress },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new UserNotFoundException(emailAddress);
    }
    throw error;
  }
}
```

Common Prisma error codes to handle at the repository boundary:

| Code | Meaning | Action |
|---|---|---|
| `P2002` | Unique constraint violation | Throw a domain-specific conflict error |
| `P2025` | Record not found | Throw a domain-specific not-found error |
| `P2003` | Foreign key constraint failed | Throw a domain-specific reference error |
| `P2034` | Transaction conflict | Retry or throw a transient error |

---

## Authentication — `jsonwebtoken`

NestJS has no built-in auth — use `jsonwebtoken` directly, wrapped in a dedicated `AuthService` and protected by a custom `JwtAuthGuard`.

### Auth Service

```typescript
// auth/auth.service.ts
@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly usersRepository: UsersRepository,
  ) {
    this.jwtSecret = this.configService.get('JWT_SECRET');
    this.jwtExpiresIn = this.configService.get('JWT_EXPIRES_IN');
  }

  async login(emailAddress: string, plainPassword: string): Promise<{ accessToken: string }> {
    const user = await this.usersRepository.findByEmailOrThrow(emailAddress);
    const isPasswordValid = await bcrypt.compare(plainPassword, user.passwordHash);

    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    const accessToken = this.generateAccessToken(user);
    return { accessToken };
  }

  generateAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.emailAddress,
      role: user.role,
    };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn });
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch (error) {
      throw new InvalidTokenException();
    }
  }
}
```

### JWT Auth Guard

```typescript
// common/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided.');
    }

    const payload = this.authService.verifyAccessToken(token);
    request['authenticatedUser'] = payload;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const authorizationHeader = request.headers['authorization'];
    if (!authorizationHeader?.startsWith('Bearer ')) return null;
    return authorizationHeader.slice(7);
  }
}
```

### CurrentUser Decorator

```typescript
// common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (_, context: ExecutionContext): JwtPayload => {
    const request = context.switchToHttp().getRequest();
    return request.authenticatedUser;
  },
);
```

### Applying Auth

Apply `JwtAuthGuard` globally in `main.ts` and use a `@Public()` decorator to opt specific routes out:

```typescript
// common/decorators/public.decorator.ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// common/guards/jwt-auth.guard.ts — updated canActivate
canActivate(context: ExecutionContext): boolean {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (isPublic) return true;
  // ... rest of token validation
}

// main.ts
app.useGlobalGuards(new JwtAuthGuard(app.get(AuthService), app.get(Reflector)));

// controller
@Public()
@Post('login')
async login(@Body() loginDto: LoginDto) { ... }
```

---

## Queues — BullMQ with `@nestjs/bullmq`

### Module Setup

```typescript
// queue/queue.module.ts
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<EnvironmentVariables, true>) => ({
        connection: {
          url: configService.get('REDIS_URL'),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 100 }, // Keep last 100 completed jobs for inspection
          removeOnFail: { count: 500 },     // Keep last 500 failed jobs for debugging
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
```

### Defining a Queue

Register queues per feature module:

```typescript
// invoices/invoices.module.ts
BullModule.registerQueue({ name: INVOICE_PROCESSING_QUEUE })
```

### Producer

```typescript
// invoices/invoices.service.ts
@Injectable()
export class InvoicesService {
  constructor(
    @InjectQueue(INVOICE_PROCESSING_QUEUE)
    private readonly invoiceProcessingQueue: Queue,
  ) {}

  async scheduleInvoiceGeneration(orderId: string): Promise<void> {
    await this.invoiceProcessingQueue.add(
      'generate-invoice',
      { orderId },
      {
        jobId: `invoice-generation-${orderId}`, // Deduplication key
        delay: 0,
      },
    );
  }
}
```

### Consumer (Processor)

```typescript
// invoices/processors/invoice-generation.processor.ts
@Processor(INVOICE_PROCESSING_QUEUE)
export class InvoiceGenerationProcessor extends WorkerHost {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly logger: Logger,
  ) {
    super();
  }

  async process(job: Job<InvoiceGenerationJobData>): Promise<void> {
    this.logger.log(
      `Processing invoice generation for order ${job.data.orderId}`,
      InvoiceGenerationProcessor.name,
    );

    try {
      await this.invoicesService.generateForOrder(job.data.orderId);
    } catch (error) {
      this.logger.error(
        `Invoice generation failed for order ${job.data.orderId}`,
        error instanceof Error ? error.stack : String(error),
        InvoiceGenerationProcessor.name,
      );
      throw error; // Re-throw to trigger BullMQ retry logic
    }
  }
}
```

### Queue Naming Convention

Define queue names as constants — never inline strings:

```typescript
// constants/queues.ts
export const INVOICE_PROCESSING_QUEUE = 'invoice-processing';
export const EMAIL_NOTIFICATION_QUEUE = 'email-notification';
export const REPORT_GENERATION_QUEUE = 'report-generation';
```

---

## Logging — `nest-winston`

### Setup

```typescript
// logger/logger.module.ts
@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<EnvironmentVariables, true>) => ({
        transports: [
          new winston.transports.Console({
            format: configService.get('NODE_ENV') === 'production'
              ? winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.json(),        // Structured JSON for log aggregation
                )
              : winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.colorize(),
                  winston.format.simple(),      // Human-readable for local development
                ),
          }),
        ],
      }),
      inject: [ConfigService],
    }),
  ],
})
export class LoggerModule {}
```

### Usage in Services

Inject using the `WINSTON_MODULE_PROVIDER` token — never use `console.log` in application code:

```typescript
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    this.logger.info('Creating invoice', {
      customerId: input.customerId,
      lineItemCount: input.lineItems.length,
      context: InvoicesService.name,
    });
    // ...
  }
}
```

### Structured Log Fields

Always include consistent context fields in log entries:

```typescript
// Log levels and when to use them
this.logger.error('Payment processing failed', {
  context: PaymentsService.name,
  orderId: order.id,
  errorCode: error.code,
  stack: error.stack,
});

this.logger.warn('Rate limit approaching for customer', {
  context: RateLimitGuard.name,
  customerId,
  requestCount,
  windowSeconds: 60,
});

this.logger.info('Invoice created successfully', {
  context: InvoicesService.name,
  invoiceId: invoice.id,
  customerId: invoice.customerId,
});

this.logger.debug('Cache miss — fetching from database', {
  context: InvoicesRepository.name,
  cacheKey,
});
```

---

## Rate Limiting — `@nestjs/throttler`

### Setup

```typescript
// app.module.ts
ThrottlerModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService<EnvironmentVariables, true>) => ({
    throttlers: [
      {
        name: 'default',
        ttl: seconds(60),
        limit: 100, // 100 requests per 60 seconds by default
      },
    ],
    storage: new ThrottlerStorageRedisService(configService.get('REDIS_URL')),
  }),
  inject: [ConfigService],
}),
```

Apply the throttler guard globally:

```typescript
// main.ts or app.module.ts providers
{ provide: APP_GUARD, useClass: ThrottlerGuard }
```

### Per-Route Overrides

```typescript
// Stricter limit for auth endpoints
@Throttle({ default: { ttl: seconds(60), limit: 5 } })
@Post('login')
async login(@Body() dto: LoginDto) { ... }

// Skip throttling for internal health check endpoints
@SkipThrottle()
@Get('health')
async healthCheck() { ... }
```

---

## Health Checks — `@nestjs/terminus`

### Setup

```typescript
// health/health.module.ts
@Module({
  imports: [
    TerminusModule.forRoot({
      logger: WinstonLogger, // Use the Winston logger for terminus output
      gracefulShutdownTimeoutMs: 1000,
    }),
    HttpModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}
```

```typescript
// health/health.controller.ts
@Controller('health')
@SkipThrottle()
@Public()
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly databaseService: DatabaseService,
    private readonly redisIndicator: MicroserviceHealthIndicator,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    return this.healthCheckService.check([
      // Database connectivity
      () => this.checkDatabaseHealth(),

      // Redis connectivity
      () => this.redisIndicator.pingCheck('redis', {
        transport: Transport.REDIS,
        options: { url: this.configService.get('REDIS_URL') },
      }),
    ]);
  }

  private async checkDatabaseHealth(): Promise<HealthIndicatorResult> {
    try {
      await this.databaseService.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch {
      return { database: { status: 'down' } };
    }
  }
}
```

Health check endpoints are always:
- Decorated with `@Public()` — no auth required
- Decorated with `@SkipThrottle()` — not rate limited
- Used by load balancers and orchestrators, not exposed publicly

---

## Bootstrap — `main.ts`

`main.ts` is the single place where global concerns are applied. Keep it clean and explicit:

```typescript
// main.ts
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until the logger is initialized
  });

  // Use Winston as the NestJS logger
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Global prefix for all routes except health
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // Global validation pipe — apply to all incoming DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties (don't silently strip)
      transform: true,          // Auto-transform payloads to DTO class instances
      transformOptions: {
        enableImplicitConversion: false, // Require explicit @Type() decorators
      },
    }),
  );

  // Global exception filter — catch unhandled errors and format responses
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(WINSTON_MODULE_PROVIDER)));

  // CORS
  app.enableCors({
    origin: app.get(ConfigService).getOrThrow('ALLOWED_ORIGINS').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
}

bootstrap();
```

---

## Controllers

Controllers handle HTTP concerns only — routing, request parsing, response shaping. No business logic.

```typescript
// invoices/invoices.controller.ts
@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get(':id')
  async getInvoice(
    @Param('id', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() requestingUser: JwtPayload,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.invoicesService.findByIdOrThrow(invoiceId, requestingUser);
    return InvoiceResponseDto.fromEntity(invoice);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createInvoice(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @CurrentUser() requestingUser: JwtPayload,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.invoicesService.create(createInvoiceDto, requestingUser);
    return InvoiceResponseDto.fromEntity(invoice);
  }
}
```

### Response DTOs

Never return Prisma model types directly from controllers — map to response DTOs to control what is exposed:

```typescript
// invoices/dto/invoice-response.dto.ts
export class InvoiceResponseDto {
  @Expose() id: string;
  @Expose() invoiceNumber: string;
  @Expose() totalAmountInCents: number;
  @Expose() status: InvoiceStatus;
  @Expose() createdAt: Date;

  static fromEntity(invoice: Invoice): InvoiceResponseDto {
    return plainToInstance(InvoiceResponseDto, invoice, {
      excludeExtraneousValues: true,
    });
  }
}
```

---

## Exception Handling

### Domain Exceptions

Define domain exceptions that extend `HttpException` — never throw raw `HttpException` from services:

```typescript
// common/exceptions/invoice-not-found.exception.ts
export class InvoiceNotFoundException extends NotFoundException {
  constructor(invoiceId: string) {
    super(`Invoice with id '${invoiceId}' was not found.`);
  }
}
```

### Global Exception Filter

```typescript
// common/filters/global-exception.filter.ts
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : 500;
    const isServerError = statusCode >= 500;

    if (isServerError) {
      this.logger.error('Unhandled exception', {
        context: GlobalExceptionFilter.name,
        statusCode,
        path: request.url,
        method: request.method,
        stack: exception instanceof Error ? exception.stack : String(exception),
      });
    }

    response.status(statusCode).json({
      statusCode,
      message: isHttpException ? exception.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

---

## Best Practices

**DTOs validate at the boundary** — every incoming request body, query param, and route param is validated before reaching the service layer. Use `class-validator` decorators and let the global `ValidationPipe` enforce them.

**Services are framework-agnostic** — a service should not import anything from `@nestjs/common` except `Injectable` and exception classes. No `Request`, no `Response`, no HTTP concepts.

**One module per domain concept** — resist merging modules for convenience. Two domains that happen to share a database schema are still two modules.

**Async configuration everywhere** — use `forRootAsync` and `forFeatureAsync` over synchronous variants. The application needs access to `ConfigService` at module initialization time, which requires async factory functions.

**`enableShutdownHooks()`** is non-negotiable — NestJS won't call `onModuleDestroy` lifecycle hooks without it, which means Prisma connections, BullMQ workers, and Redis connections won't be cleanly closed on process termination.

**Never use `@Inject()` for class providers** — it is only needed for non-class tokens (`Symbol`, `string`). Injecting class providers by type works automatically from constructor typing.

---

## Hard Limits

- Never call `new PrismaClient()` outside of `DatabaseService`
- Never use `process.env` directly — always go through `ConfigService`
- Never return Prisma model types from controllers — always map to response DTOs
- Never put business logic in controllers or processors — they delegate to services
- Never use `console.log` — always use the injected Winston logger
- Never swallow BullMQ job errors — re-throw so BullMQ can manage retries
- Never use `@Global()` on feature modules — only infrastructure modules
- Never share mutable state between request scopes through singleton services