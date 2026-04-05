# FinOps Enterprise Evolution — Progress Log

## Status: COMPLETO (2026-03-30)

---

## O que foi implementado

### 1. Correções de Precisão (CRÍTICO)
- **AWS**: métrica mudada de `UnblendedCost` → `AmortizedCost` (distribui RIs e Savings Plans proporcionalmente — mais preciso para FinOps)
- **AWS**: agora agrupa também por `USAGE_TYPE` (dimensão adicional)
- **Azure**: adicionado agrupamento por `MeterCategory` + agregação de `UsageQuantity`
- **UTC**: todas as datas calculadas em UTC explicitamente
- **End date exclusivo (AWS)**: já estava correto, mantido

### 2. Interface `FinopsCostEntry` estendida
Novos campos: `resourceId`, `usageType`, `operation`, `usageQuantity`, `usageUnit`

### 3. Entidade `FinopsCostRecord` evoluída
Novos campos: `resource_id`, `usage_type`, `operation`, `usage_quantity`, `usage_unit`

**Unique constraint atualizado**: `(cloud_account_id, service, resource_id, region, date, granularity)`

### 4. Novas Entidades (4)
| Entidade | Tabela | Propósito |
|----------|--------|-----------|
| `FinopsCostAggregate` | `finops_cost_aggregates` | Agregados mensais pré-calculados para dashboard de alta performance |
| `FinopsCostSyncRun` | `finops_cost_sync_runs` | Audit log de cada execução de ingestão |
| `FinopsCostAnomaly` | `finops_cost_anomalies` | Anomalias detectadas com severidade e impacto financeiro |
| `FinopsTenantBilling` | `finops_tenant_billing` | Billing persistido com markup, margin e chargeback breakdown |

### 5. Novos Serviços (6)

#### `FinopsCostIngestionService`
- Pipeline normalização → upsert em batches de 200
- Registra `FinopsCostSyncRun` para audit trail
- Conflict path inclui `resourceId`

#### `FinopsCostAggregationService`
- Calcula agregados mensais após cada ingestão
- `getMonthlyAggregates()` para queries de dashboard sem varrer `cost_records`
- Índices otimizados por `(org, account, period)`

#### `FinopsAnomalyDetectionService`
- Compara custo do dia com média 7 dias anteriores
- Threshold: `actual > avg * 1.3` (30% acima)
- Severidade: `low` (<50%), `medium` (<100%), `high` (<200%), `critical` (≥200%)
- Upsert idempotente por `(org, account, service, region, date)`
- `acknowledgeAnomaly()` para gestão de status

#### `FinopsForecastService`
- `forecastCurrentMonth()`: `avg_daily_cost × dias_totais_mês`
- `forecastNextMonths(n)`: projeção baseada na média dos últimos 3 meses
- Confiança: `low` (<7 dias), `medium` (<14 dias), `high` (≥14 dias)
- Breakdown por serviço (top 10)

#### `FinopsMonetizationService`
- `computeAndSaveBilling()`: `final_price = cloud_cost × (1 + markup%)`
- `margin = markup_amount`, `margin% = margin / final_price × 100`
- Chargeback por serviço (padrão) e por tag JSONB (`getChargebackByTag()`)
- Persiste em `finops_tenant_billing` com upsert idempotente por período

#### `FinopsOptimizationService`
- `generateInsights()`: top 3 serviços, maior crescimento, causas de aumento, waste total
- `generateCrossModuleRecommendations()`: cruza custo × inventário
  - **AWS**: EC2 paradas com EBS, RDS publicamente acessível
  - **Azure**: VMs desalocadas com discos, discos não anexados

### 6. Processor Atualizado — 5 Fases
```
Fase 1/5 → Carregar credenciais
Fase 2/5 → Coletar custos (AWS/Azure API)
Fase 3/5 → Ingestão (FinopsCostIngestionService)
Fase 4/5 → Agregar meses no range (FinopsCostAggregationService)
Fase 5/5 → Detectar anomalias + gerar recomendações
```

### 7. Novos Endpoints (~11 adicionados ao controller)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/finops/accounts/:id/forecast` | Forecast mês corrente |
| GET | `/finops/accounts/:id/forecast/next-months` | Projeção N meses |
| GET | `/finops/accounts/:id/anomalies` | Lista anomalias (filtro status/days) |
| PATCH | `/finops/accounts/:id/anomalies/:anomalyId/acknowledge` | Reconhecer anomalia |
| GET | `/finops/accounts/:id/insights` | Top serviços, crescimento, causas |
| POST | `/finops/accounts/:id/billing/compute` | Calcular + persistir billing com markup |
| GET | `/finops/accounts/:id/billing/history` | Histórico de billing |
| GET | `/finops/accounts/:id/billing/chargeback` | Chargeback por tag key |
| GET | `/finops/accounts/:id/sync-runs` | Histórico de execuções de sync |

### 8. Migration `1777200000000-finops-enterprise.ts`
- `ALTER TABLE finops_cost_records` — 5 novos campos
- Drop constraint antiga + nova constraint com `resource_id`
- `CREATE TABLE finops_cost_aggregates` + índices
- `CREATE TABLE finops_cost_sync_runs` + índices
- `CREATE TABLE finops_cost_anomalies` + índices
- `CREATE TABLE finops_tenant_billing` + índices
- Todos os comandos `IF NOT EXISTS`/`IF EXISTS` (safe to run múltiplas vezes)

---

## Para rodar a migration

```bash
cd backend
npm run migration:run
```

---

## Arquitetura de Precisão

### Por que AmortizedCost?
- `UnblendedCost`: custo bruto como cobrado pela AWS
- `AmortizedCost`: distribui o custo de RIs e Savings Plans proporcionalmente aos dias de uso
- Para clientes com RIs, `AmortizedCost` reflete o custo real alocado por período — evita picos artificiais no início do mês

### Idempotência
- Unique constraint: `(cloud_account_id, service, resource_id, region, date, granularity)`
- Upsert com `skipUpdateIfNoValuesChanged: true` onde aplicável
- Sync runs registrados com status + timestamp de conclusão

### Performance
- `finops_cost_aggregates` elimina queries pesadas no dashboard
- Todos os selects usam QueryBuilder com GROUP BY explícito
- Índices em `(organization_id, cloud_account_id, date)` e `(service, date)`

---

## Próximos Passos Sugeridos

- [ ] Adicionar suporte a `resource_id` real via AWS Resource Groups Tagging API
- [ ] Webhook/alert quando anomalia `critical` é detectada (integrar com notificações)
- [ ] Finalizar billing (`status: 'finalized'`) após fechamento mensal no dia 6
- [ ] Dashboard frontend para forecast + anomalias
- [ ] Exportar chargeback para CSV/Excel
