# Cloud Intelligence AI

## Contrato de valor

| Camada | Responsabilidade |
|---|---|
| **FinOps / Governança** | **Detectar** — anomalias, savings, findings, scores (fonte da verdade) |
| **Cloud Intelligence** | **Decidir e agir** — correlacionar, ranquear, narrar briefing, fila operacional, chat, prepare→automation |

A IA **não inventa** findings novos. Toda recomendação cita a fonte (`evidence.sources` / `findingId` / `anomalyId` / `finopsRecommendationId`).

## Arquitetura

- Backend NestJS: módulo `src/cloud-intelligence` com orquestrador, provider factory (OpenAI), tool registry, agentes, usage/quotas, recomendações e auditoria.
- Compat: controller `/api/ai-chat/*` permanece e usa o mesmo orquestrador.
- Frontend: shell `/cloud-intelligence` (recommendations + chat) + BFF `app/api/cloud-intelligence`.
- Daily: aggregator determinístico → top N upsert → briefing LLM (top 5) em `AiDailyReport.findings.briefing`.

## Isolamento

- `organizationId` / `userId` apenas de `TenantGuard` + JWT.
- Tools ignoram IDs de tenant enviados pelo modelo; orquestrador remove `organizationId`/`tenantId`/`orgId` dos args.
- Resultados wrapados em `UNTRUSTED_DATA`.
- Gate de plano: `SystemModule.CLOUD_INTELLIGENCE` (`*` inclui o módulo).

## Endpoints

| Método | Path | Notas |
|---|---|---|
| GET/POST/DELETE | `/api/ai-chat/conversations...` | Compat chat |
| POST | `/api/ai-chat/conversations/:id/messages` | SSE |
| GET | `/api/cloud-intelligence/dashboard` | KPIs + filtros |
| GET | `/api/cloud-intelligence/usage` | Overview + engagement (`rec_viewed`, `rec_status_changed`, `prepare_automation`, `daily_generated`) |
| GET/PATCH | `/api/cloud-intelligence/quotas` | PATCH: OWNER/ADMIN |
| GET/PATCH | `/api/cloud-intelligence/daily-settings` | Daily Intelligence config |
| GET | `/api/cloud-intelligence/daily-reports` | Histórico |
| GET | `/api/cloud-intelligence/daily-reports/:id` | Detalhe |
| POST | `/api/cloud-intelligence/daily-reports/generate` | Geração manual |
| GET | `/api/cloud-intelligence/recommendations/:id` | Detalhe + audit `rec_viewed` |
| GET/PATCH | `/api/cloud-intelligence/recommendations` | Status / assignee |
| POST | `/api/cloud-intelligence/recommendations/:id/prepare-automation` | Cria DRAFT |
| POST | `/api/cloud-intelligence/recommendations/:id/execute` | Só se ACTIVE |
| GET/POST/DELETE | `/api/cloud-intelligence/knowledge` | Org knowledge (Enterprise): guidance + structured rules |

## Variáveis de ambiente

- `AI_ENABLED=true`
- `AI_CHAT_PROVIDER=openai` / `AI_PROVIDER`
- `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`)
- `AI_CHAT_TIMEOUT_MS`, `AI_CHAT_MAX_TOKENS` / `AI_MAX_TOKENS`
- `AI_CHAT_MAX_TOOL_CALLS`, `AI_CHAT_MAX_HISTORY_MESSAGES`
- `AI_DEFAULT_DAILY_LIMIT`, `AI_DEFAULT_MONTHLY_LIMIT`

## Agentes e tiers

- **Cloud Advisor**: Basic+
- FinOps / Security: Professional+
- DevOps / Daily Intelligence / Automation Builder / Architecture / org RAG: Enterprise
- Recommendation → draft automation: Professional+ (módulo `automation` obrigatório)

Ver policy em `usage/ai-tier.policy.ts` e Stripe metadata em [cloud-intelligence-stripe-tiers.md](./cloud-intelligence-stripe-tiers.md).

## Migrations

- `1780900000000-cloud-intelligence-foundation.ts` — usage, quotas, recommendations
- `1781000000000-cloud-intelligence-phase2.ts` — daily reports, tier/settings, `ai_knowledge_chunks`
  - tenta `CREATE EXTENSION vector`; se o Postgres não tiver pgvector, usa `embedding jsonb` e o RAG semântico fica desabilitado até instalar a extensão
- Work-queue / ROI columns conforme fases 2 e 5

## Knowledge base: guidance vs rule

| Papel (`role`) | Domínio | Efeito |
|---|---|---|
| `guidance` | qualquer | Orientação para chat (`search_knowledge`) e drafts |
| `rule` + **Regra de tags** (`required_tags`) | `governance` | Tags dinâmicas aplicadas no **scan de Governança** (EC2/VM) |
| `rule` (texto) | `governance` | Também infere tags de listas Markdown se não houver payload estruturado |
| `rule` | `finops` / `automation` | Contexto forte para chat/drafts |

Fluxo de remediação de tags:

1. Salvar regra de tags em `/cloud-intelligence/knowledge` (Governança + Regra + tags).
2. Rodar **scan de Governança**.
3. **Gerar análise** no Cloud Intelligence (ou Daily) para virar recomendação.
4. Na recomendação → **Gerar automação** (`AWS_EC2_CREATE_TAGS`) — revise valores (`pending-review`) antes de executar.

## Fluxo prepare → execute

1. `prepare-automation` gera automação **DRAFT** com nós suportados pelo motor atual (sem mutação cloud direta).
2. Humano revisa/publica no editor `/automations/:id`.
3. `execute` exige automação `ACTIVE` + `confirm` no `AutomationsCrudService`.

## Testes

```bash
npm test -- --testPathPatterns=cloud-intelligence
```

## Frontend

- `/cloud-intelligence` — Recommendation Center + chat + painel “Ações de hoje”
- Billing: badge `ai_tier` + limites diário/mensal + engagement counters
