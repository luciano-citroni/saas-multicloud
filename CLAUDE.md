# Project Rules — SaaS MultiCloud

This file contains the coding rules and conventions for this project. Always follow these instructions when generating or modifying code.

Monorepo roots:

- `frontend/` — Next.js 16 App Router (UI + BFF `app/api`)
- `backend/` — NestJS API (`/api` prefix)

Paths below are relative to those roots unless noted.

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
- Prefer shared BFF helpers from `lib/api/proxy-request.ts`: `resolveAccessToken`, `proxyToBackend`, `unauthorizedResponse`, `hasTrustedOrigin`.
- Cookie helpers and `backendFetch` live in `lib/auth/session.ts` (`setAuthCookies`, `clearAuthCookies`, `refreshAccessToken`).
- Never construct bearer tokens or read cookies manually inside components.
- Always pass `organizationId` as a query param when the route requires tenant context.
- Mutating BFF routes (`POST` / `PUT` / `PATCH` / `DELETE`) must call `hasTrustedOrigin(request)` and return **403** when false (`proxyToBackend` already does this for non-GET).

## Authentication

Sessions are managed via **httpOnly cookies** (`smc_access_token` / `smc_refresh_token`). Tokens are never exposed to client-side JS.

```typescript
// lib/auth/session.ts - cookie + backend fetch helpers
getAccessTokenFromCookies();
getRefreshTokenFromCookies();
setAuthCookies(response, tokens);
clearAuthCookies(response);
refreshAccessToken(refreshToken);
backendFetch(path, options); // always use this instead of raw fetch to backend

// lib/api/proxy-request.ts - prefer for new BFF routes
resolveAccessToken();
proxyToBackend(path, options);
hasTrustedOrigin(request);
```

Cookie policy (`lib/auth/session.ts` + `lib/auth/constants.ts`):

- Flags: `httpOnly: true`, `sameSite: 'lax'`, `secure` only in production, `path: '/'`.
- TTLs: access **15 minutes**, refresh **7 days**.
- Access tokens within ~30s of expiry are treated as missing (proactive refresh).
- Prefer `getBackendInternalUrl()` / `BACKEND_URL` for server→API calls; do not use `NEXT_PUBLIC_BACKEND_URL` for secrets or internal routing.

Route protection (`frontend/proxy.ts`):

- Session = presence of access **or** refresh cookie (not JWT validation in the proxy).
- Unauthenticated requests to protected routes redirect to `/auth/sign-in?next=<pathname>`.
- Public: `/auth/*`, `/invite/*` (verify-email always allowed). Authenticated users are redirected away from sign-in/sign-up.
- Matcher excludes `api`, `_next/static`, `_next/image`, favicon, sitemap, robots — API auth is cookie + BFF, not this proxy.
- Post-login redirects must use `getSafeNextPath()` (`lib/auth/request-origin.ts`) — relative paths only; reject `//`, `://`, `\`, newlines (open-redirect hardening).

## Forms

All data-entry forms use **`react-hook-form`** with a **Zod schema** via `zodResolver`. Types come from `z.infer<typeof schema>`.

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
      toast.error(extractErrorMessage(body));
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

- Prefer a sibling `schema.ts` file (canonical name). Inline schemas are acceptable for tiny dialogs.
- When messages are i18n-driven, use a factory `createXSchema(msgs)` + `useMemo(() => createXSchema(...), [deps])`.
- Never use uncontrolled inputs for form fields; always use `FormField` + `FormControl` + `FormMessage`.
- Do not invent ad-hoc field validation outside Zod (`if (!email)` style checks).
- Use `form.formState.isSubmitting` to disable the submit button while loading.
- Controlled non-RHF UIs (e.g. automation resource config) must still validate with Zod (`safeParse` / shared schema modules) until migrated to RHF.

## Error Handling & Translations

All backend error messages must be translated before displaying to the user. Never show raw backend strings.

```typescript
import { extractErrorMessage } from "@/lib/error-messages";

// In async handlers — omit language to use the active locale (getLocale()):
const body = await response.json();
if (!response.ok) {
  toast.error(extractErrorMessage(body));
  return;
}
```

The `extractErrorMessage` function maps backend `ErrorMessages` keys to Portuguese/English UI strings using the centralized dictionary in `lib/error-messages.ts`.

Rules:

- Always call `extractErrorMessage(body)` (or pass the active `locale`) before showing errors in toasts or inline messages. Never hardcode `'pt'`.
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

## Responsive Layout

Authenticated shell lives in `frontend/app/(root)/layout.tsx` (sidebar + `SiteHeader` + padded scroll region). Auth/invite pages stay centered cards — do not force the dashboard shell on them.

### Breakpoints

| Viewport | Tailwind | Behavior |
|----------|----------|----------|
| Mobile | `< md` (768) | Sidebar as Sheet (`useIsMobile`); stacked headers/toolbars; scrollable subnavs |
| Tablet | `md`–`lg` | Fixed/collapsible sidebar; 2-col grids; dense filters may still use Sheet |
| Desktop | `lg+` | Inline dense filters; master–detail side-by-side |

### Shared primitives (`components/root/layout/`)

- **`PageHeader`** — title + optional description/eyebrow/actions (`flex-col` → `sm:flex-row`).
- **`ScrollableSubnav`** — horizontal scroll, no wrap, hidden scrollbar (FinOps/CI subnavs).
- **`PageToolbar`** — filter/action row that stacks on mobile; nested inputs use `w-full sm:w-*`.

### Rules

- Page headers: `flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`.
- KPI / form grids: mobile-first `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3|4`.
- Dense filter bars: desktop grid `hidden lg:block`; mobile bottom **Sheet** + chips (see `FinopsFilterBar`).
- Master–detail: `lg:grid` split + `lg:hidden` stacked mobile view.
- Tables: use `components/ui/table` (built-in `overflow-x-auto`) or wrap custom tables; cells use `min-w-0` / `truncate`.
- Breadcrumbs (`SiteHeader`): must not overflow — `min-w-0`, truncate last crumb, horizontal scroll if needed.
- Automation builders: palette/config as **Sheet** below `lg`; canvas full-width; adaptive heights (`h-[70dvh]`, not fixed side-by-side panels on mobile).
- Always put `min-w-0` on flex children that truncate or scroll.
- Prefer existing patterns over one-off fixed widths (`w-50`, `w-[170px]` without `w-full sm:`).

## Frontend Security

- Never store access/refresh tokens or session payloads in `localStorage` / `sessionStorage` / client-readable cookies.
- `localStorage` is only for non-sensitive UI prefs (e.g. `ACTIVE_ORG_STORAGE_KEY`). Active org in storage is UX only — backend membership is authoritative.
- Client components call only same-origin `/api/...` (or `app/actions`); never call the Nest backend URL from the browser.
- Route handlers attach `Authorization` and `x-organization-id` server-side only (including org path routes such as `/api/organization/[organizationId]`).
- Mutating BFF routes require `hasTrustedOrigin` before cookie-authenticated work (`proxyToBackend` enforces this for non-GET).
- CSRF allowlist (`lib/auth/request-origin.ts`): request URL origin + configured env origins (`FRONTEND_URL`, `NEXT_PUBLIC_*`, `ALLOWED_AUTH_ORIGINS`). **Never** trust client-supplied `X-Forwarded-Host` / `X-Forwarded-Proto` to expand the allowlist.
- Post-login redirects must use `getSafeNextPath()` (relative paths only; reject `//`, `://`, `\`, newlines, and encoded `/%2f%2f…` tricks).
- Auth BFF routes (login / refresh / Google / invite-register) must set httpOnly cookies and return `{ success: true }` (or equivalent) — **never** forward raw backend token payloads to the client.
- Prefer `proxyToBackend` over copy-pasted auth boilerplate per route.
- Frontend RBAC helpers hide UI only — the backend always enforces authorization.
- Security headers are set in `frontend/next.config.ts` (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, CSP baseline). Do not weaken `frame-ancestors 'none'` without an explicit product need.

## State Management

- Prefer **local component state** (`useState`, `useReducer`) for UI state.
- Todos os filtros de frontend devem usar **URL state** (query params) como fonte de verdade para permitir compartilhamento de link, refresh e navegação com histórico.
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

`JwtGuard` is registered as a **global** `APP_GUARD`. Controllers still apply tenant + roles:

```typescript
@UseGuards(TenantGuard, RolesGuard)
```

- **JwtGuard** (global) — validates JWT signature, checks session exists in DB (`user_sessions` table), loads `request.user` (`sub` + `sessionId` required). Rejects revoked/expired sessions and inactive users.
- **TenantGuard** — reads `x-organization-id` header, verifies UUID + membership, loads `request.organization` and `request.membership`. Baseline: mutating methods require at least `MEMBER` unless `@Roles(OrgRole.VIEWER)` explicitly allows write.
- **RolesGuard** — checks RBAC role hierarchy against `@Roles()` metadata
- **UserThrottlerGuard** (global) — rate limit by `user:{sub}` or IP
- **TenantContextInterceptor** (global) — fails closed if an authenticated request lacks org/membership unless `@Public()`, `@SkipTenant()`, or `@AllowMissingOrganization()` applies

Public routes must be annotated with `@Public()`. Never skip guards on protected routes.

Escape hatches (use sparingly; document why):

| Decorator | Typical use |
|-----------|-------------|
| `@Public()` | login, register, refresh, Google OAuth, email verify, Stripe webhook, AI FinOps gateway (API-key auth) |
| `@AllowMissingOrganization()` | authenticated routes that run before an org is selected (sessions, me) |
| `@SkipTenant()` | org bootstrap (create/list orgs), invites, billing tenant setup, selected members cross-org ops |

### JWT Payload Structure

```typescript
{
  sub: string;
  sessionId: string;
}
```

JWT does **not** embed roles — membership role is loaded from the DB on each request via `TenantGuard`.

### Session & password security

- Access token ~15 minutes; refresh opaque token stored as **SHA-256** hash in `user_sessions`; 7-day TTL; rotation with short grace / successor token.
- Logout and password change revoke sessions (password change invalidates other sessions).
- Passwords: **bcrypt cost 12**. Never return `password` / `sessions` in API responses (`sanitizeUser`).
- Password login requires `emailVerified === true`. Unverified users get `AUTH.EMAIL_NOT_VERIFIED` and can use public `POST /auth/email/resend-by-email` (anti-enumeration). Invite signup and verified Google accounts mark email as verified automatically.
- Login lockout: after **5** failed password attempts, lock for **15 minutes** (`failed_login_attempts` / `locked_until`). Never expose these fields in API responses.
- Stripe webhooks: `@Public()` + signature verification with `rawBody: true` in Nest bootstrap.

## Multi-tenancy

Every protected endpoint operates within a tenant context:

- The `x-organization-id` header is **required** on all protected routes.
- Use `@CurrentOrganization()` to inject the organization — never read the header manually.
- Use `@CurrentMembership()` to inject the `OrganizationMember` (includes role).
- All database queries **must** include the organization scope: `WHERE organization_id = :orgId`.
- Never return data from other organizations. Tenant isolation is enforced at the service layer.
- BFF routes: pass `organizationId` as query param → set `x-organization-id` header server-side; never trust org id from the body alone without that header path.

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

- No `@Roles()` = accessible by all authenticated org members (VIEWER still blocked on writes by `TenantGuard`).
- Read-only endpoints (GET) = generally no role restriction.
- Mutations (create/update/delete) require at minimum `MEMBER` (mutating methods reject `VIEWER` unless `@Roles` explicitly includes it).
- Administrative operations (invite/remove members, manage cloud accounts, manage billing UI) require `ADMIN` — matches frontend helpers in `lib/organization-rbac.ts` (`canManageCloudAccounts`, `canManageBilling`, etc.).
- Ownership-sensitive operations (delete org, transfer ownership) require `OWNER`.
- Sync cloud accounts: frontend allows `MEMBER` (`canSyncCloudAccounts`); backend must still enforce.
- **Do not encrypt roles** in the database. Roles are authorization metadata (`organization_members.role` varchar enum). Encrypting them does not prevent IDOR and forces decrypt-on-every-request. Protect access via membership checks + `@Roles`, not ciphertext.

## HTTP Hardening (Helmet, CORS, Throttling)

Configured in `backend/src/main.ts` and `app.module.ts`:

- **Helmet**: enabled; CSP on in production (Helmet defaults), disabled in non-production; `crossOriginEmbedderPolicy: false`; `referrerPolicy: 'no-referrer'`; `x-powered-by` disabled; `trust proxy: 1`.
- **CORS**: `credentials: true`; allowed origins from `FRONTEND_URL` and `GOOGLE_ALLOWED_REDIRECT_ORIGINS` (comma lists); localhost allowed in development; missing Origin allowed (OAuth / server-to-server). Allowed headers include `Authorization`, `Content-Type`, `x-organization-id`.
- **Throttling**: global **300 req / 60s** via `UserThrottlerGuard` (tracker `user:{sub}` or IP). Stricter `@Throttle` on auth endpoints (e.g. login/register ~10/min, refresh ~120/min).
- **Swagger** (`/api/docs`): disabled in production.

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
- Never expose encrypted fields in responses — annotate with `@Exclude()` and prefer `select: false` on secret columns (`password`, `credentials_encrypted`, session token hashes, etc.).
- Global `SensitiveResponseInterceptor` strips encrypted blobs / password hashes from JSON responses as a last line of defense — do not rely on it alone; sanitize in the service.
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

## Cloud Credentials & Secrets Security

- Cloud credentials (AWS, Azure, GCP) and AI FinOps BYOK secrets are **always encrypted** with AES-256-GCM before storage.
- Shared crypto lives in `backend/src/common/crypto/credentials-cipher.ts`: `encryptCredentialsJson` / `decryptCredentialsJson` / `maskSecret`. Domain services may wrap these (e.g. cloud service, AI FinOps connection service).
- Automation execution parameters use the same algorithm via `backend/src/automation/parameter-cipher.ts` (`parameters_encrypted`, `select: false`); clear encrypted params after successful runs; redact sensitive keys in API/audit payloads (`redactSensitive`).
- Key: `CREDENTIALS_ENCRYPTION_KEY` = **64 hex chars** (32 bytes).
- Stored format: Base64 encoding of `ivHex:authTagHex:ciphertextHex`.
- Never log, return, or expose decrypted secrets in API responses.
- Persist encrypted columns with `select: false` (do not rely only on `@Exclude()`). Same for `users.password` and session token hash columns.
- Global `SensitiveResponseInterceptor` + `redactSensitiveData()` strip encrypted blobs / password hashes from JSON as a last line of defense (does not strip intentional one-time secrets like Stripe `clientSecret`, issued AI API keys, or auth tokens for the BFF).
- Client responses must use redaction helpers (`redactCredentialsForClient` / flags like `hasClientSecret`, `hasPrivateKey`, `hasApiKey`, or AI FinOps `maskedCredential`) — never return raw secrets.
- User API payloads must not include `password` or raw `googleId` — expose `hasPassword` / `hasGoogleLinked` flags instead.
- Secret field names to strip/merge include at least: `clientSecret`, `privateKey`, `secretAccessKey`, `apiKey`, `adminApiKey`, `password`, `secret` (and snake_case variants).
- On update, merge via helpers that preserve stored secrets when the client sends blank fields (`mergeCredentialsPreservingSecrets`).
- AI FinOps gateway API keys: store **one-way hash** (`key_hash`) only — never persist the raw key after issuance.
- Platform roles (`OWNER`/`ADMIN`/`MEMBER`/`VIEWER`) are **not** encrypted — see RBAC rules above.

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

## LGPD / Privacy

Practices already enforced in this codebase — follow them in new features:

- **Minimization / no secret leakage**: never log credentials, refresh tokens, API keys, or passwords. Prefer Nest `Logger` with redacted context.
- **FinOps consent (opt-in)**: cost collection requires accepted consent per cloud account/provider (`finops_consents`, versioned). Collect endpoints must return 409/`CONSENT_REQUIRED` when missing. Revoke stops future collection; historical cost rows may be retained (document in API descriptions).
- **User responses**: always sanitize — strip `password`, sessions, and other internal relations before returning user objects.
- **Session control**: users can list/revoke their sessions; password change invalidates other sessions.
- **Account deletion**: hard-delete via users service (cascades memberships/sessions where FKs use `onDelete: CASCADE`). When adding personal data tables, define cascade/cleanup explicitly.
- **AI FinOps / automation audit**: prefer audit logs for sensitive mutations (connections, budgets, policies, automation runs) without storing secret values.
- **PII in validators**: reuse shared validators (e.g. `passwordValidator`). Do not invent new CPF/PII columns without a retention + access plan.
- **Not yet a full LGPD product surface**: there is no dedicated data-export / portability API or formal retention job. If you add subject-rights endpoints, keep them authenticated, tenant-scoped, and audited — do not invent compliance UI that the backend cannot fulfill.

## Swagger Documentation

Every module must be fully documented:

- `@ApiTags()` on every controller.
- `@ApiOperation({ summary: '...' })` on every endpoint.
- `@ApiResponse()` for all relevant status codes: 200/201 (success), 400 (validation), 401 (auth), 403 (permission), 404 (not found), 409 (conflict).
- `@ApiBody({ type: SwaggerDto })` for all POST/PATCH endpoints.
- All Swagger response/request types have a corresponding DTO class in `swagger.dto.ts` with `@ApiProperty()`.
- The Swagger UI is available at `http://localhost:3000/api/docs` in non-production only.

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
