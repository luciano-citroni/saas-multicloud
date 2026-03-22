# Project Rules — SaaS MultiCloud

This file contains the coding rules and conventions for this project. Always follow these instructions when generating or modifying code.

---

# Frontend Development Instructions

## Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (Radix UI primitives) + `class-variance-authority`
- **Forms**: `react-hook-form` + `zod` + `@hookform/resolvers`
- **Notifications**: `sonner` (toast)
- **Icons**: `lucide-react`
- **Theme**: `next-themes` (dark/light mode)
- **Charts**: `recharts`
- **Animations**: `framer-motion`

## Component Structure

All components live in `/components`, organized by the page/feature they belong to:

```
components/
  auth/           ← login, register, logout components
  root/           ← authenticated pages (billing, cloud-accounts, settings, etc.)
    billing/
    cloud-accounts/
    organizations/
    settings/
  sidebar/        ← navigation (AppSidebar, NavMain, NavUser, SiteHeader)
  providers/      ← context providers (ThemeProvider)
  ui/             ← shared primitives (Button, Card, Dialog, Input, Table, etc.)
```

Rules:

- Each page/feature has its own subfolder inside `components/`.
- Components are small, focused on a single responsibility.
- Never put business logic or API calls directly inside components.
- `'use client'` only where necessary (event handlers, hooks, browser APIs).

## API Layer

### Route Handlers (`app/api/`)

All backend communication goes through **Next.js Route Handlers** in `app/api/`. These handlers:

- Manage authentication cookies (`smc_access_token`, `smc_refresh_token`)
- Auto-refresh expired tokens
- Attach `Authorization` and `x-organization-id` headers
- Return normalized responses to the client

```typescript
// Example: app/api/cloud/accounts/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { message: "organizationId é obrigatório" },
      { status: 400 },
    );
  }

  const { accessToken, rotatedTokens } = await resolveAccessToken();

  if (!accessToken) {
    const res = NextResponse.json(
      { message: "Sessão expirada" },
      { status: 401 },
    );
    clearAuthCookies(res);
    return res;
  }

  const response = await backendFetch("/api/cloud/accounts", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-organization-id": organizationId,
    },
  });

  const payload = await parseJsonSafe<unknown>(response);
  const nextResponse = NextResponse.json(payload ?? [], {
    status: response.status,
  });

  if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);

  return nextResponse;
}
```

### Client Fetch Actions (`app/actions/`)

Client components call the Next.js API routes via simple fetch wrappers — never call the backend directly from the client:

```typescript
// app/actions/organization.ts
export async function fetchOrganizationCloudAccounts(organizationId: string) {
  const url = `/api/cloud/accounts?organizationId=${encodeURIComponent(organizationId)}`;
  return fetch(url, { cache: "no-store" });
}

export async function enqueueGeneralSync(
  organizationId: string,
  cloudAccountId: string,
  provider = "aws",
) {
  const url =
    provider === "azure"
      ? `/api/azure/assessment/accounts/${encodeURIComponent(cloudAccountId)}?organizationId=${encodeURIComponent(organizationId)}`
      : `/api/aws/assessment/accounts/${encodeURIComponent(cloudAccountId)}/sync?organizationId=${encodeURIComponent(organizationId)}`;

  return fetch(url, { method: "POST" });
}
```

Rules:

- Client components NEVER call the backend directly — always go through `app/api/` route handlers.
- Route handlers ALWAYS use `backendFetch`, `resolveAccessToken`, `setAuthCookies` from `lib/auth/session`.
- Never construct bearer tokens or read cookies manually inside components.
- Always pass `organizationId` as a query param when the route requires tenant context.

## Authentication

Sessions are managed via **httpOnly cookies** (`smc_access_token` / `smc_refresh_token`). Tokens are never exposed to client-side JS.

```typescript
// lib/auth/session.ts - utilities you must reuse
getAccessTokenFromCookies();
getRefreshTokenFromCookies();
setAuthCookies(response, tokens);
clearAuthCookies(response);
refreshAccessToken(refreshToken);
backendFetch(path, options); // always use this instead of raw fetch to backend
```

Route protection is handled by the middleware in `proxy.ts` — unauthenticated requests to protected routes are redirected to `/auth/sign-in`.

## Forms

All forms use **`react-hook-form`** with a **Zod schema** via `zodResolver`:

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { extractErrorMessage } from '@/lib/error-messages';

const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
});
type FormData = z.infer<typeof schema>;

export function MyForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '' },
  });

  const onSubmit = async (data: FormData) => {
    const response = await fetch('/api/...', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json();
    if (!response.ok) {
      toast.error(extractErrorMessage(body, 'pt'));
      return;
    }

    toast.success('Salvo com sucesso!');
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Nome</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" isLoading={form.formState.isSubmitting}>Salvar</Button>
      </form>
    </Form>
  );
}
```

Rules:

- Always define Zod schemas in the same file or a sibling `schema.ts` file.
- Never use uncontrolled inputs; always use `FormField` + `FormControl` + `FormMessage`.
- Use `form.formState.isSubmitting` to disable the submit button while loading.

## Error Handling & Translations

All backend error messages must be translated before displaying to the user. Never show raw backend strings.

```typescript
import { extractErrorMessage } from "@/lib/error-messages";

// In async handlers:
const body = await response.json();
if (!response.ok) {
  toast.error(extractErrorMessage(body, "pt"));
  return;
}
```

The `extractErrorMessage` function maps backend `ErrorMessages` keys to Portuguese/English UI strings using the centralized dictionary in `lib/error-messages.ts`.

Rules:

- Always call `extractErrorMessage(body, 'pt')` before showing errors in toasts or inline messages.
- Never display `body.message` directly in the UI.
- Use `toast.error()` from `sonner` for non-blocking error feedback.
- Use `toast.success()` for confirmation of successful mutations.

## RBAC on the Frontend

Use the utilities in `lib/organization-rbac.ts` to conditionally render UI based on the user's role:

```typescript
import { hasRequiredOrganizationRole, canManageCloudAccounts } from '@/lib/organization-rbac';

// Conditionally show actions:
{canManageCloudAccounts(currentRole) && <Button>Adicionar conta</Button>}

// Generic role check:
{hasRequiredOrganizationRole(currentRole, 'ADMIN') && <AdminPanel />}
```

For module-based feature flags (billing plans), use `lib/modules.ts`:

```typescript
import { hasModuleAccess, PlanModule } from '@/lib/modules';

{hasModuleAccess(organization.plans, PlanModule.ASSESSMENT) && <AssessmentSection />}
```

Rules:

- Never hardcode role strings — use `OrgRole` equivalents from `lib/organization-rbac.ts`.
- Features gated by plan must use `hasModuleAccess`.
- Hiding UI is a UX affordance only. The backend always enforces the real access control.

## Styling

- Use **Tailwind CSS v4** utility classes exclusively. No inline styles.
- Use the `cn()` utility from `lib/utils.ts` for conditional class merging.
- Use `cva` for component variants (see `components/ui/button.tsx` as reference).
- Respect the design token variables: `--color-primary`, `--color-destructive`, `--color-muted`, etc.
- Use `bg-background`, `text-foreground`, `border`, `text-muted-foreground` for semantic colors.

## State Management

- Prefer **local component state** (`useState`, `useReducer`) for UI state.
- Use **`window.dispatchEvent`** with event constants from `lib/sidebar-context.ts` to signal cross-component updates (e.g., after creating an organization, dispatch `SIDEBAR_CONTEXT_UPDATED_EVENT`).
- Use `localStorage` only for non-sensitive UI preferences (e.g., `ACTIVE_ORG_STORAGE_KEY`).
- Never store tokens, user data, or session info in `localStorage` — they live in httpOnly cookies.

## Code Quality

- **Strict TypeScript**: Avoid `any`. Infer types from Zod schemas.
- **`'use client'` sparingly**: Default to Server Components. Add `'use client'` only for hooks, event handlers, and browser APIs.
- **No business logic in components**: Keep components focused on rendering. Fetch and mutate in route handlers or server actions.
- **No direct backend calls from client**: Always proxy through `app/api/`.
- **Accessible markup**: Use semantic HTML, `FormLabel`, `aria-*` attributes when needed.
- **Loading states**: Always handle loading with `isLoading` prop on `Button` or skeleton components.

---

# Backend Development Instructions

## Stack

- **Framework**: NestJS v11 (Express adapter)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL + TypeORM 0.3.x
- **Validation**: Zod schemas (never `class-validator`)
- **Authentication**: JWT + Session-based (PostgreSQL sessions via `user_sessions` table)
- **Queue**: BullMQ (Redis)
- **Scheduler**: `@nestjs/schedule` (cron)
- **Docs**: `@nestjs/swagger` v11 (OpenAPI)
- **Payments**: Stripe v20

## Module Structure

Every feature must be a NestJS module with clear boundaries:

```
src/feature/
  feature.module.ts
  feature.controller.ts
  feature.service.ts
  dto.ts            ← Zod schemas + inferred types
  swagger.dto.ts    ← @ApiProperty DTOs for Swagger only
```

Rules:

- Never mix business logic into controllers.
- Never perform HTTP calls or DB queries inside controllers.
- One module per domain/feature. Do not create god-modules.
- Each module exports only what is needed by other modules.

## Authentication & Guards

Guards must always be applied in this exact order:

```typescript
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
```

- **JwtGuard** — validates JWT signature, checks session exists in DB (`user_sessions` table), loads `request.user`
- **TenantGuard** — reads `x-organization-id` header, verifies user membership, loads `request.organization` and `request.membership`
- **RolesGuard** — checks RBAC role hierarchy against `@Roles()` metadata

Public routes must be annotated with `@Public()`. Never skip guards on protected routes.

### JWT Payload Structure

```typescript
{
  sub: string;
  sessionId: string;
}
```

Sessions have a 7-day TTL and can be revoked by deleting the DB record.

## Multi-tenancy

Every protected endpoint operates within a tenant context:

- The `x-organization-id` header is **required** on all protected routes.
- Use `@CurrentOrganization()` to inject the organization — never read the header manually.
- Use `@CurrentMembership()` to inject the `OrganizationMember` (includes role).
- All database queries **must** include the organization scope: `WHERE organization_id = :orgId`.
- Never return data from other organizations. Tenant isolation is enforced at the service layer.

```typescript
async listResources(orgId: string): Promise<ResourceEntity[]> {
  return this.repository.find({ where: { organizationId: orgId } });
}
```

## RBAC (Role-Based Access Control)

Role hierarchy (higher value = more permissions):

```typescript
OWNER = 4 > ADMIN = 3 > MEMBER = 2 > VIEWER = 1
```

Apply roles on the endpoint using the `@Roles()` decorator:

```typescript
@Roles(OrgRole.OWNER, OrgRole.ADMIN)
@Patch('settings')
updateSettings() {}
```

Rules:

- No `@Roles()` = accessible by all authenticated org members.
- Read-only endpoints (GET) = generally no role restriction.
- Mutations (create/update/delete) require at minimum `MEMBER`.
- Administrative operations (invite/remove members, manage cloud accounts) require `ADMIN`.
- Sensitive operations (delete org, manage billing) require `OWNER`.

## DTO and Validation

Use **Zod** for all DTO validation. Never use `class-validator` or unvalidated plain types.

```typescript
// dto.ts
import { z } from "zod";
import { awsRegionRegex } from "common/validators";

export const createResourceSchema = z.object({
  name: z.string().min(1).max(100),
  region: z.string().regex(awsRegionRegex),
});

export type CreateResourceDto = z.infer<typeof createResourceSchema>;
```

```typescript
// controller
@Post()
create(@Body(new ZodValidationPipe(createResourceSchema)) dto: CreateResourceDto) {
  return this.service.create(dto);
}
```

Rules:

- Always export both the Zod schema and the inferred type.
- Reuse existing validators: `cpfValidator`, `passwordValidator`, `awsRegionRegex`, `uuidValidator`.
- Swagger DTOs live in `swagger.dto.ts` and use `@ApiProperty()` — they are completely separate from Zod schemas.
- Validation errors are formatted by `ZodValidationPipe` and returned as 400 with field-level details.

## Controllers

```typescript
@ApiTags("Feature Name")
@ApiBearerAuth("access-token")
@ApiHeader({
  name: "x-organization-id",
  description: "Organization UUID",
  required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller("feature")
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Get()
  @ApiOperation({ summary: "List resources" })
  @ApiPaginationQuery()
  @ApiResponse({ status: 200, type: FeatureListResponseDto })
  async list(@CurrentOrganization() org: Organization) {
    return this.featureService.list(org.id);
  }

  @Post()
  @Roles(OrgRole.ADMIN)
  @HttpCode(201)
  @ApiOperation({ summary: "Create resource" })
  @ApiBody({ type: CreateFeatureRequestDto })
  @ApiResponse({ status: 201, type: FeatureResponseDto })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 403, description: "Insufficient role" })
  async create(
    @CurrentOrganization() org: Organization,
    @Body(new ZodValidationPipe(createFeatureSchema)) dto: CreateFeatureDto,
  ) {
    return this.featureService.create(org.id, dto);
  }
}
```

Rules:

- Every route needs `@ApiOperation`, `@ApiResponse` (success + error codes), and `@ApiBody` (for POST/PATCH).
- Always annotate `@ApiBearerAuth('access-token')` and `@ApiHeader` for the `x-organization-id`.
- Paginated list endpoints must use `@ApiPaginationQuery()`.
- Use explicit `@HttpCode()` for non-200 status codes (e.g., 201 for create, 204 for delete).

## Services

```typescript
@Injectable()
export class FeatureService {
  private readonly logger = new Logger(FeatureService.name);

  constructor(
    @InjectRepository(FeatureEntity)
    private readonly featureRepository: Repository<FeatureEntity>,
  ) {}

  async list(organizationId: string): Promise<FeatureEntity[]> {
    return this.featureRepository.find({ where: { organizationId } });
  }

  async findOrFail(id: string, organizationId: string): Promise<FeatureEntity> {
    const entity = await this.featureRepository.findOne({
      where: { id, organizationId },
    });
    if (!entity) throw new NotFoundException(ErrorMessages.FEATURE.NOT_FOUND);
    return entity;
  }
}
```

Rules:

- All DB operations are async with `await`.
- Throw NestJS built-in exceptions: `NotFoundException`, `BadRequestException`, `ForbiddenException`, `ConflictException`, `InternalServerErrorException`.
- Never throw generic `Error`. Always use typed NestJS exceptions.
- Error messages must use `ErrorMessages` constants from `common/messages/error-messages.ts`.
- For multi-step operations requiring atomicity, use `QueryRunner` transactions.
- Use `Logger` for all meaningful debug/error logging.

## Database & Entities

```typescript
@Entity("feature_table")
export class FeatureEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ name: "organization_id" })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id" })
  organization: Organization;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
```

Rules:

- All entities must have `id` (UUID, PK), `created_at`, and `updated_at`.
- Use **snake_case** for all column names (`organization_id`, not `organizationId`).
- Always use `onDelete: 'CASCADE'` on foreign keys to prevent orphaned records.
- Never expose encrypted fields in responses — annotate with `@Exclude()`.
- After entity changes, run: `npm run migration:generate src/db/migrations/MigrationName`. Never modify existing migrations.

## Error Handling

Use centralized error messages. Never hardcode error strings in service/controller code.

```typescript
throw new NotFoundException(ErrorMessages.FEATURE.NOT_FOUND);
throw new ConflictException(ErrorMessages.FEATURE.ALREADY_EXISTS);
throw new ForbiddenException(ErrorMessages.RBAC.INSUFFICIENT_ROLE);
```

For TypeORM `QueryFailedError`, catch and map to appropriate HTTP exceptions:

```typescript
catch (error) {
  if (error instanceof QueryFailedError) {
    const detail = (error as QueryFailedError & { detail?: string }).detail ?? '';
    if (detail.includes('unique constraint')) {
      throw new ConflictException(ErrorMessages.FEATURE.ALREADY_EXISTS);
    }
  }
  throw error;
}
```

The global `HttpExceptionFilter` normalizes all responses to:

```json
{
  "statusCode": 400,
  "error": "BadRequest",
  "message": "...",
  "path": "/api/...",
  "timestamp": "2026-03-19T10:00:00.000Z"
}
```

## Pagination

List endpoints use offset-based pagination via `?page=1&limit=25` (max: 100).

- Services return plain arrays. **Never manually wrap with `{ items, pagination }`**.
- The `PaginationInterceptor` automatically wraps array responses.
- Always annotate list endpoints with `@ApiPaginationQuery()`.
- `PaginationMiddleware` parses query params and stores them in `request.pagination`.

Response format (auto-generated by interceptor):

```json
{
  "items": [...],
  "pagination": {
    "page": 1,
    "limit": 25,
    "totalItems": 150,
    "totalPages": 6,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

## Cloud Credentials Security

- AWS and Azure credentials are **always encrypted** with AES-256-GCM before storage.
- Use the existing `encryptCredentials` / `decryptCredentials` utilities in `cloud/cloud.service.ts`.
- The encryption key comes from `CREDENTIALS_ENCRYPTION_KEY` env var (32-byte hex).
- Credential format stored: `ivHex:authTagHex:ciphertextHex`.
- Never log, return, or expose raw credentials in API responses.
- Credential fields on entities must be annotated with `@Exclude()`.

### Cloud Credential Schemas (Zod)

```typescript
// AWS
const awsCredentialsSchema = z.object({
  roleArn: z.string(),
  region: z.string().regex(awsRegionRegex),
  regions: z.array(z.string()).optional(),
  externalId: z.string().optional(),
});

// Azure
const azureCredentialSchema = z.object({
  tenantId: z.string().uuid(),
  clientId: z.string().uuid(),
  clientSecret: z.string(),
  subscriptionId: z.string().uuid(),
  subscriptionIds: z.array(z.string().uuid()).optional(),
});
```

## Swagger Documentation

Every module must be fully documented:

- `@ApiTags()` on every controller.
- `@ApiOperation({ summary: '...' })` on every endpoint.
- `@ApiResponse()` for all relevant status codes: 200/201 (success), 400 (validation), 401 (auth), 403 (permission), 404 (not found), 409 (conflict).
- `@ApiBody({ type: SwaggerDto })` for all POST/PATCH endpoints.
- All Swagger response/request types have a corresponding DTO class in `swagger.dto.ts` with `@ApiProperty()`.
- The Swagger UI is available at `http://localhost:3000/api/docs`.

## Code Quality

- **Strict TypeScript**: Avoid `any`. Use proper generics and inferred types from Zod schemas.
- **No side effects in constructors**: Use `onModuleInit()` for initialization logic.
- **Dependency injection**: Always inject via constructor. Never instantiate services with `new`.
- **ConfigService**: Use `this.configService.get<string>('ENV_VAR')` — never `process.env.VAR` directly in services.
- **UUIDs**: Use `import { v4 as uuidv4 } from 'uuid'` — never `Math.random()`.
- **Logging**: Use NestJS `Logger` class, not `console.log`.
- **Environment secrets**: Never commit secrets. All sensitive values come from environment variables via `ConfigService`.

## Available Scripts (backend)

```bash
npm run start:dev          # start with hot reload
npm run build              # compile TypeScript
npm run migration:generate src/db/migrations/Name  # generate migration
npm run migration:run      # apply pending migrations
npm run migration:revert   # revert last migration
```
