# AI Chat — entrega

## Arquitetura

- Backend NestJS: módulo `src/ai-chat` com controller SSE, history, scope, tools, audit e provider OpenAI.
- Frontend Next.js: FAB + Sheet em `components/root/ai-chat`, proxies em `app/api/ai-chat`, actions em `app/actions/ai-chat.ts`.
- Isolamento: `organizationId` / `userId` apenas de `TenantGuard` + JWT; tools ignoram IDs de tenant enviados pelo modelo/cliente.

## Endpoints

| Método | Path | Notas |
|---|---|---|
| GET | `/api/ai-chat/conversations` | Lista do usuário na org |
| POST | `/api/ai-chat/conversations` | Cria conversa |
| GET | `/api/ai-chat/conversations/:id` | Detalhe + mensagens |
| DELETE | `/api/ai-chat/conversations/:id` | Remove conversa própria |
| POST | `/api/ai-chat/conversations/:id/messages` | SSE (`token`, `tool`, `sources`, `done`, `error`) |
| POST | `/api/ai-chat/conversations/:id/cancel` | Cancela geração |

Body mensagem: `{ "content": string(1..4000), "cloudAccountId"?: uuid }`

## Variáveis de ambiente

- `AI_CHAT_PROVIDER=openai`
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-6-luna` (Chat Completions + tools exige `reasoning_effort=none` no provider)
- `OPENAI_BASE_URL` (opcional)
- `AI_CHAT_TIMEOUT_MS=60000`
- `AI_CHAT_MAX_TOKENS=2048`
- `AI_CHAT_MAX_TOOL_CALLS=6`
- `AI_CHAT_MAX_HISTORY_MESSAGES=20`
- `AI_CHAT_RATE_LIMIT_PER_MINUTE=20` (documentado; throttle Nest `@Throttle` 20/min)

## Configurar o provedor

1. Defina `OPENAI_API_KEY` no backend.
2. Opcional: ajuste `OPENAI_MODEL` / `OPENAI_BASE_URL`.
3. Rode a migration `1779000000000-ai-chat`.
4. Sem API key, o SaaS sobe normalmente; o chat retorna erro controlado `PROVIDER_NOT_CONFIGURED`.

## Módulos integrados

- Cloud accounts
- FinOps (overview, compare, optimize)
- Cloud inventory / Assessment (summary + jobs) — ownership via `findByIdAndTenant`
- Governance (score + findings non_compliant)
- Automations (list + runs redacted)
- Documentação SaaS embutida (`get_saas_documentation`)

## Pendências

- Sem busca cross-account por nome/tag unificada
- Governance Azure inexistente
- Sem RAG vetorial
- Sem RLS PostgreSQL
- Somente consulta (sem mutações cloud)
- Stream OpenAI é completion-then-token (não token-by-token nesta v1)

## Segurança

- Tools filtradas por módulos do plano
- Escopo off-topic/security rejeitado sem tools
- Resultados wrapados em `UNTRUSTED_DATA`
- Auditoria sem secrets
- Histórico restrito a `organization_id + user_id`

## Testes

`npm test -- --testPathPatterns=ai-chat` — 21 testes passando (isolamento, scope, tools, provider, limites).
