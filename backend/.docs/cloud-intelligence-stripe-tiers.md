# Cloud Intelligence — Stripe tiers (Basic / Professional / Enterprise)

O SaaS **não cria** products no Stripe. Configure metadata nos products/prices existentes.

## Metadata keys

| Key | Descrição |
|-----|-----------|
| `modules` | CSV ou JSON dos módulos (`cloud_intelligence`, `finops`, … ou `*`) |
| `ai_tier` | `basic` \| `professional` \| `enterprise` |
| `ai_daily_limit` | tokens/dia (vazio = ilimitado / env default) |
| `ai_monthly_limit` | tokens/mês |
| `ai_credit_pack_tokens` | pacote avulso de tokens (créditos) para top-up além da cota mensal |
| `max_cloud_accounts` / `max_users` | já existentes |

Price metadata sobrescreve product metadata.

## Exemplos

### Basic
```
modules=assessment,cloud_inventory,finops,governance,cloud_intelligence
ai_tier=basic
ai_daily_limit=50000
ai_monthly_limit=500000
```

### Professional
```
modules=assessment,cloud_inventory,finops,governance,automation,cloud_intelligence
ai_tier=professional
ai_daily_limit=250000
ai_monthly_limit=3000000
```

### Enterprise
```
modules=*
ai_tier=enterprise
ai_daily_limit=
ai_monthly_limit=
```

## Capacidades por tier

- **Basic:** Cloud Advisor
- **Professional:** + FinOps/Security agents + prepare automation draft
- **Enterprise:** + Daily Intelligence (ranking/briefing), Automation/Architecture agents, RAG privado, ROI snapshots + digest semanal
- **DevOps agent:** ainda stub (adiado)

Créditos avulsos: use um Price Stripe com `ai_credit_pack_tokens` e some o valor em `ai_org_quotas` no webhook de invoice (extensão futura do sync).

Após checkout/webhook, `syncTenantPlanSnapshot` grava `ai_org_quotas.tier` e limites.
