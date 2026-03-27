# FinOps Module Progress

## Current Step
✅ Implementação completa. Aguardando validação / testes.

---

## Completed

- [x] 5 entidades TypeORM criadas em `backend/src/db/entites/`
  - `finops-consent.entity.ts`
  - `finops-cost-record.entity.ts`
  - `finops-budget.entity.ts`
  - `finops-job.entity.ts`
  - `finops-recommendation.entity.ts`
- [x] Migration `1777000000000-finops.ts` — cria 5 tabelas com índices e foreign keys
- [x] `finops/constants.ts` — fila, concorrência, versão de consentimento
- [x] Provider interface + 2 implementações
  - `finops-provider.interface.ts`
  - `aws-finops.provider.ts` — usa STS AssumeRole + Cost Explorer
  - `azure-finops.provider.ts` — usa `@azure/identity` + REST Cost Management
- [x] 3 serviços
  - `finops.service.ts` — consentimento, controle de jobs, enfileiramento
  - `finops-analysis.service.ts` — dashboard, score, recomendações, monetização
  - `finops-budget.service.ts` — CRUD de budgets + status/alertas
- [x] `finops.processor.ts` — BullMQ WorkerHost com 4 fases
- [x] `finops.controller.ts` — 20+ endpoints REST com Zod + Swagger
- [x] `finops/dto/swagger.dto.ts` — DTOs completos para Swagger
- [x] `finops.module.ts` — módulo NestJS wiring tudo
- [x] `app.module.ts` — `FinopsModule` registrado
- [x] `error-messages.ts` — seção `FINOPS` adicionada
- [x] `system-modules.ts` — `'finops'` adicionado ao enum de módulos

---

## Pending

- [ ] Instalar dependências npm se ainda não presentes:
  ```bash
  npm install @aws-sdk/client-cost-explorer @aws-sdk/client-sts
  # @azure/identity já está no projeto
  ```
- [ ] Rodar migration: `npm run migration:run`
- [ ] Testes unitários (opcional)
- [ ] Frontend: componentes do dashboard FinOps

---

## Created Structure

```
backend/src/finops/
├── constants.ts
├── finops.module.ts
├── controllers/
│   └── finops.controller.ts
├── services/
│   ├── finops.service.ts
│   ├── finops-analysis.service.ts
│   └── finops-budget.service.ts
├── processors/
│   └── finops.processor.ts
├── providers/
│   ├── finops-provider.interface.ts
│   ├── aws-finops.provider.ts
│   └── azure-finops.provider.ts
└── dto/
    └── swagger.dto.ts

backend/src/db/entites/
├── finops-consent.entity.ts
├── finops-cost-record.entity.ts
├── finops-budget.entity.ts
├── finops-job.entity.ts
└── finops-recommendation.entity.ts

backend/src/db/migrations/
└── 1777000000000-finops.ts
```

---

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/finops/accounts/:id/consent?cloudProvider=aws` | Consultar consentimento |
| POST | `/finops/accounts/:id/consent` | Aceitar consentimento |
| DELETE | `/finops/accounts/:id/consent?cloudProvider=aws` | Revogar consentimento |
| POST | `/finops/accounts/:id/sync` | Iniciar coleta de custos (async, 202) |
| GET | `/finops/accounts/:id/jobs` | Listar jobs |
| GET | `/finops/accounts/:id/jobs/:jobId` | Status de um job |
| GET | `/finops/accounts/:id/dashboard` | Dashboard resumo (30d) |
| GET | `/finops/accounts/:id/cost-history` | Histórico por período |
| GET | `/finops/accounts/:id/score` | Score FinOps (0–100) |
| GET | `/finops/accounts/:id/recommendations` | Recomendações abertas |
| DELETE | `/finops/accounts/:id/recommendations/:recId` | Descartar recomendação |
| GET | `/finops/accounts/:id/savings` | Economia potencial |
| POST | `/finops/accounts/:id/pricing` | Calcular preço com markup |
| POST | `/finops/accounts/:id/margin` | Calcular margem do cliente |
| POST | `/finops/accounts/:id/budgets` | Criar budget |
| GET | `/finops/accounts/:id/budgets` | Listar budgets |
| GET | `/finops/accounts/:id/budgets/status` | Status de todos os budgets ativos |
| GET | `/finops/accounts/:id/budgets/:budgetId` | Status de um budget |
| PUT | `/finops/accounts/:id/budgets/:budgetId` | Atualizar budget |
| DELETE | `/finops/accounts/:id/budgets/:budgetId` | Remover budget |

---

## Decisions

1. **Consentimento obrigatório** — qualquer coleta de custo sem consent retorna 409. A versão `1.0` do termo está em `constants.ts` e pode ser evoluída com versionamento.

2. **Provider pattern** — `IFinopsProvider` permite adicionar GCP, OCI etc. sem modificar o core.

3. **Sem dependência circular** — o `FinopsModule` não importa `CloudModule`. A descriptografia de credenciais no `FinopsProcessor` usa crypto direto (mesma lógica do `CloudService`), evitando `forwardRef`.

4. **Upsert em cost records** — conflito por `(cloudAccountId, service, region, date, granularity)` garante idempotência em re-execuções.

5. **Optimization Engine** — baseado nos dados já sincronizados no banco (EC2 paradas, RDS público, VMs Azure deallocated, discos não anexados). Não chama APIs externas durante análise.

6. **FinOps Score** — ponderado: eficiência 50%, crescimento 30%, desperdício 20%. Rótulos: Excellent ≥85, Good ≥70, Fair ≥50, Poor <50.

7. **Monetização** — endpoints de pricing e margin são síncronos (sem fila) pois são cálculos sobre dados já persistidos.

8. **`finops` adicionado a `SYSTEM_MODULES`** — permite gate por plano via `hasModuleAccess` no billing.

---

## Notes

- AWS Cost Explorer cobra $0.01 por 1.000 requisições — por isso o consentimento é obrigatório.
- Azure Cost Management tem tier gratuito para subscriptions individuais.
- O processor descriptografa credenciais com `process.env.CREDENTIALS_ENCRYPTION_KEY` diretamente (mesma lógica do `CloudService.decryptCredentials`).
- A fila BullMQ usa o mesmo Redis configurado em `app.module.ts` (REDIS_HOST/PORT/PASSWORD).
