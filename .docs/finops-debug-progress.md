# FinOps Debug Progress

## Current Step
✅ CONCLUÍDO — Diagnóstico finalizado e correções aplicadas.

---

## Findings

### BUG 1 — CRÍTICO (causa primária da divergência)
**Arquivo**: `finops/providers/aws-finops.provider.ts:62`

```typescript
// ANTES (incorreto)
if (amount <= 0) {
    continue;
}
```

O AWS Cost Explorer retorna **valores negativos** para:
- Créditos aplicados (`Credits`)
- Reembolsos (`Refunds`)
- Descontos de Enterprise Discount Program (EDP)
- Ajustes de Reserved Instance

Ao filtrar `amount <= 0`, o sistema descarta TODOS esses itens de redução de custo.

**Impacto**: O total no banco fica **MAIOR** que o valor real da AWS. Exemplo:
- AWS retorna: EC2 $500 + Credits -$50 = **total $450**
- Sistema armazena: EC2 $500 = **total $500**
- Divergência: **+$50 (11%)**

---

### BUG 2 — CRÍTICO (divergência de período — mês errado)
**Arquivo**: `finops/services/finops-scheduler.service.ts:147-165`

O scheduler usa `new Date(year, month, day)` (construção em timezone LOCAL) mas converte com `.toISOString()` (que é sempre UTC).

```typescript
// ANTES (incorreto)
const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
return firstDayPrevMonth.toISOString().slice(0, 10);
// → new Date(2025, 1, 1) em UTC+3 = '2025-01-31T21:00:00Z'
// → .slice(0, 10) = '2025-01-31' ← ERRADO (deveria ser '2025-02-01')
```

Em servidores com timezone UTC+ (ex: UTC+3 ou UTC+5), os períodos ficam deslocados:
- `startDate` pode ficar 1 dia antes do esperado
- `endDate` pode ficar 1 dia antes → o último dia do mês NÃO é coletado
- Resultado: **dados do mês incompletos** (falta o último dia ou mais)

O mesmo problema existe em `getYesterdayDateString()`.

---

### BUG 3 — MÉDIO (legado da auditoria de segurança)
**Arquivo**: `finops/processors/finops.processor.ts:150`

```typescript
const keyHex = process.env['CREDENTIALS_ENCRYPTION_KEY'] ?? '0'.repeat(64);
```

Fallback inseguro com chave zero. Se a env var não estiver configurada, as credenciais são "descriptografadas" com a chave `000...0` (32 bytes zero), o que é inseguro. Aplicar o mesmo fix da auditoria.

---

## Hypotheses (validadas)

| Hipótese | Verificada? | Resultado |
|---|---|---|
| Duplicidade por sync diário + mensal | ✅ | Não há duplicidade — `resolveGranularityForPeriod` evita corretamente |
| Timeout incorreto (UTC vs local) | ✅ | **BUG CONFIRMADO** — scheduler usa new Date() local |
| Filtro de valores negativos (créditos) | ✅ | **BUG CONFIRMADO** — `amount <= 0` exclui créditos |
| Upsert sem constraint no DB | ✅ | Não é bug — constraint `uq_finops_cost_record` existe na migration 1777100000000 |
| region NULL causando duplicatas | ✅ | Já corrigido pela migration 1777100000000 |
| UnblendedCost vs BlendedCost | ⚠️ | Possível divergência se usuário compara com console AWS (que mostra BlendedCost por padrão em contas consolidadas) |
| Dados incompletos (jobs falhando) | ❓ | Verificar via endpoint de debug |
| Currency incorreta | ✅ | Não há conversão — tudo em USD (fornecido pela API) |

---

## Validations

### Fluxo do upsert (correto)
```
Processor → upsert(conflictPaths: [cloudAccountId, service, region, date, granularity])
DB constraint: UNIQUE(cloud_account_id, service, region, date, granularity)
→ Idempotente ✅ (desde que region não seja NULL — corrigido pela migration)
```

### Fluxo de granularidade no mês anterior (correto)
```
resolveGranularityForPeriod(from, to, 'monthly-first')
→ Se existe registro monthly → usa 'monthly' (evita dupla contagem com daily) ✅
→ Se só existe daily → usa 'daily' ✅
```

### Fechamento mensal (dia 6) — correto em teoria, mas timezone quebra o período
```
Correto: coleta todo mês anterior com granularidade MONTHLY
Errado: em UTC+X, startDate e endDate ficam deslocados 1 dia
→ Resultado: AWS recebe Start: '2025-02-28' em vez de '2025-03-01' (UTC+3)
```

---

## Fixes Applied

- [x] BUG 1: `amount <= 0` → `amount === 0` em `aws-finops.provider.ts`
- [x] BUG 2: Timezone — `getYesterdayDateString()` e `getPreviousMonthDateRange()` agora usam UTC explicitamente
- [x] BUG 3: Fallback inseguro removido de `finops.processor.ts`
- [x] FEATURE: Endpoint de debug `GET /finops/debug/aws-cost/:cloudAccountId` implementado
- [x] MELHORIA: Log detalhado dos valores negativos (créditos) coletados da AWS

---

## Pending

- Verificar se `BlendedCost` vs `UnblendedCost` causa divergência no ambiente do cliente (pode ser configurado via env var futuramente)
- Considerar adicionar `AmortizedCost` como métrica alternativa para contas com RI/Savings Plans

---

## Notes

- A constraint `uq_finops_cost_record` existe no DB e está correta após a migration 1777100000000
- O `resolveGranularityForPeriod` evita dupla contagem entre granularidade daily e monthly — design correto
- Créditos negativos da AWS têm service name como `"Credit"` ou `"Discount"` — agora são armazenados e aparecem no breakdown de serviços
- Serviços com custo **exatamente zero** continuam sendo ignorados (correto — não há valor em armazenar $0)
- O endpoint de debug requer role OWNER e consome 1 chamada ao AWS Cost Explorer por execução
