# Backend Audit Progress

## Current Step
✅ CONCLUÍDA — Todas as correções aplicadas. TypeScript compila sem erros.

---

## Issues Found

### 🔴 CRÍTICO

| # | Arquivo | Linha | Problema |
|---|---------|-------|---------|
| C1 | `cloud/cloud.service.ts` | 134 | Chave AES-256 com fallback `'0'.repeat(64)` — se `CREDENTIALS_ENCRYPTION_KEY` não estiver definida, todas as credenciais ficam cifradas com uma chave trivial (todos zeros). **Ataque trivial de recuperação de credenciais.** |
| C2 | `main.ts` | — | **Sem rate limiting** em nenhum endpoint. Endpoints de auth (`/login`, `/register`, `/refresh`, `/google/exchange`) são alvo óbvio de força bruta e credential stuffing. |
| C3 | `common/filters/http-exception.filter.ts` | 154–161 | Para erros de DB não mapeados, expõe `error.detail` e `error.message` do PostgreSQL direto na resposta HTTP — vaza informações internas da estrutura do banco ao cliente. |

### 🟠 ALTO

| # | Arquivo | Linha | Problema |
|---|---------|-------|---------|
| A1 | `auth/auth.service.ts` | 151 | `console.error(...)` — viola padrão do projeto (deve usar `Logger` do NestJS). Causa logs não estruturados, sem contexto e sem integração com o sistema de log configurado. |
| A2 | `main.ts` | 85 | `allowedHeaders` no CORS não inclui `x-organization-id` — necessário para todas as rotas protegidas por tenant. Causa erro de preflight CORS em todos os browsers. |
| A3 | `main.ts` | — | Swagger UI (`/api/docs`) é registrado incondicionalmente, sem checar `NODE_ENV`. Em produção, expõe toda a superfície de ataque da API (rotas, parâmetros, schemas). |
| A4 | `auth/auth.controller.ts` | 374–394 | `resolveGoogleRedirectUrl` decodifica o `state` e usa a URL diretamente como redirect sem validar se o host pertence ao `FRONTEND_URL` — potencial **Open Redirect**. O `GoogleAuthGuard` valida na entrada, mas a saída não é re-validada no callback. |

### 🟡 MÉDIO

| # | Arquivo | Linha | Problema |
|---|---------|-------|---------|
| M1 | `main.ts` | 49 | `contentSecurityPolicy: false` desabilita CSP completamente no Helmet. O backend serve respostas JSON (não HTML), então CSP tem impacto limitado, mas a ausência favorece ataques mistos. |
| M2 | `users/users.service.ts` | 37 | `as any` em `sanitizeUser` — perde type-safety. Problema cosmético mas indica dado de retorno mal tipado. |
| M3 | `governance/controllers/governance.controller.ts` | 99–100 | Re-parseia `page`/`limit` do query string manualmente em vez de usar `request.pagination` injetado pelo `PaginationMiddleware`. Duplicação de lógica. |

### 🟢 BAIXO

| # | Arquivo | Linha | Problema |
|---|---------|-------|---------|
| B1 | Múltiplos arquivos | — | Excesso de linhas em branco entre declarações (formatação). Não afeta funcionalidade. |

---

## Fixes Applied

- [x] C1 — Chave de criptografia: removido fallback inseguro, lança `InternalServerErrorException` se env var ausente
- [x] C2 — Rate limiting: adicionado `@nestjs/throttler` com limites por IP nos endpoints de auth
- [x] C3 — HttpExceptionFilter: erro DB não mapeado não retorna mais `error.detail` ao cliente
- [x] A1 — `console.error` substituído por `Logger` no `auth.service.ts`
- [x] A2 — CORS: `x-organization-id` adicionado em `allowedHeaders`
- [x] A3 — Swagger: desabilitado em `NODE_ENV=production`
- [x] A4 — Google OAuth redirect: validação de host contra `FRONTEND_URL` adicionada
- [x] M2 — `as any` removido em `sanitizeUser`

---

## Pending

- M1 — CSP: considerar habilitar com diretivas básicas em iteração futura
- M3 — Governance controller: migrar para usar `request.pagination` (refactor de baixa prioridade)

---

## Sugestões Futuras

1. **Cache de memberships** — `TenantGuard` faz query ao banco a cada request para validar o membership. Adicionar cache Redis (TTL 60s) reduziria latência significativamente em alta carga.
2. **Índices de banco** — Validar se `user_sessions(token)` e `organization_members(userId, organizationId)` têm índices. São consultados a cada request autenticado.
3. **Retry com exponential backoff** — Chamadas AWS/Azure não têm retry configurado. Em falhas transientes, os workers falham o job inteiro. Recomendado: `p-retry` ou `axios-retry`.
4. **Health check endpoint** — Não há `/health` exposto. Necessário para orchestradores (Kubernetes, ECS).
5. **Auditoria de ações** — Operações críticas (criação de cloud accounts, mudança de papel, billing) não têm log de auditoria estruturado além dos logs de NestJS.
6. **`@nestjs/throttler` com store Redis** — O rate limiter padrão usa memória in-process; em múltiplas instâncias, os limites não são compartilhados. Configurar `ThrottlerStorageRedisService` para ambientes com múltiplos pods.
7. **Testes** — Nenhuma estrutura de testes encontrada. Prioridade alta para cobrir guards (JwtGuard, TenantGuard, RolesGuard) e serviços de auth com unit tests.

---

## Notes

- O projeto segue muito bem os padrões definidos no CLAUDE.md. A auditoria encontrou 0 casos de lógica de negócio em controllers, 0 chamadas diretas ao DB em controllers, e 0 tokens expostos ao cliente.
- Multi-tenancy está corretamente isolado via `TenantGuard` + `organizationId` em todas as queries.
- AES-256-GCM com IV aleatório e auth tag — implementação criptográfica correta, exceto pelo fallback de chave zero.
- Bcrypt com cost factor 12 para senhas — correto.
- Refresh tokens são opacos e armazenados como hash SHA-256 — correto.
- Google auth codes são single-use com atomic update (optimistic lock) — correto.
