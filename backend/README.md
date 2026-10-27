# Backend — SaaS MultiCloud

API NestJS do SaaS MultiCloud (cloud accounts, assessment, FinOps, governance, automation).

## Setup rápido

```bash
npm install
cp .env.example .env   # preencha as variáveis
npm run start:dev
```

Swagger: `http://localhost:3000/api/docs`

---

## Tutorial: configurar AWS

A plataforma **não** usa Access Keys das contas dos clientes. O fluxo é:

```
Backend (.env)
  └─ IAM user: saas-multicloud  (credenciais da plataforma)
       └─ STS AssumeRole
            └─ IAM Role na conta do cliente
                 └─ APIs AWS (EC2, S3, Cost Explorer, etc.)
```

Há **duas contas** envolvidas:

| Conta | O que criar | Para quê |
|-------|-------------|----------|
| **Plataforma** (sua) | IAM user `saas-multicloud` + Access Key | O backend chama `sts:AssumeRole` |
| **Cliente** (tenant) | IAM Role com trust + permissões | Assessment, FinOps, sync de recursos |

---

### Parte 1 — Conta da plataforma (user `saas-multicloud`)

Faça isso **uma vez**, na conta AWS onde roda o backend.

#### 1.1 Criar o usuário IAM

1. Console AWS → **IAM** → **Users** → **Create user**
2. Nome: `saas-multicloud`
3. Não precisa de console password (só Access Key)
4. Anote o ARN, por exemplo:

```text
arn:aws:iam::SEU_ACCOUNT_ID:user/saas-multicloud
```

#### 1.2 Policy do user (AssumeRole)

Anexe uma policy inline (ou managed custom) ao user:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAssumeCustomerRoles",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::*:role/SaasMulticloud*"
    }
  ]
}
```

Notas:

- O `Resource` pode ser mais restrito (`arn:aws:iam::ACCOUNT_DO_CLIENTE:role/SaasMulticloudRole`) se quiser limitar por conta.
- O prefixo `SaasMulticloud*` deve bater com o nome da role criada no cliente.

#### 1.3 Criar Access Key

1. User `saas-multicloud` → **Security credentials** → **Create access key**
2. Tipo: **Application running outside AWS**
3. Copie `Access key ID` e `Secret access key` (o secret só aparece uma vez)

#### 1.4 Variáveis no `.env` do backend

```env
AWS_ACCESS_KEY_ID=AKIA................
AWS_SECRET_ACCESS_KEY=................
AWS_USER_ARN=arn:aws:iam::SEU_ACCOUNT_ID:user/saas-multicloud
# Opcional — default us-east-1
AWS_STS_REGION=us-east-1
```

Regras importantes:

- Use keys de longo prazo (`AKIA...`).
- **Não** defina `AWS_SESSION_TOKEN` junto com `AKIA*` (token residual do SSO/CLI causa `InvalidClientTokenId`).
- Se a key for revogada/rotacionada, atualize o `.env` e **reinicie** o Nest.

Validação rápida (AWS CLI com as mesmas keys do `.env`):

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
unset AWS_SESSION_TOKEN
aws sts get-caller-identity
```

Deve retornar o ARN do user `saas-multicloud`. Se retornar `InvalidClientTokenId`, a Access Key está inválida/revogada.

---

### Parte 2 — Conta do cliente (IAM Role)

Faça isso **em cada conta AWS** que for conectada no produto.

#### 2.1 Criar a role

1. Console AWS (conta do cliente) → **IAM** → **Roles** → **Create role**
2. Trusted entity: **Custom trust policy**
3. Cole a trust policy abaixo (troque o ARN do user e, se usar, o External ID)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::SEU_ACCOUNT_ID:user/saas-multicloud"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "EXTERNAL_ID_SECRETO_DO_TENANT"
        }
      }
    }
  ]
}
```

Sem External ID (menos seguro, só para testes):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::SEU_ACCOUNT_ID:user/saas-multicloud"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

4. Nome sugerido: `SaasMulticloudRole`
5. Anote o ARN:

```text
arn:aws:iam::ACCOUNT_DO_CLIENTE:role/SaasMulticloudRole
```

#### 2.2 Permissões da role (cliente)

Anexe policies à role conforme os módulos que o tenant vai usar.

##### Assessment / inventário (mínimo prático)

AWS managed (rápido para começar):

- `ReadOnlyAccess` — cobre Describe/List/Get da maioria dos serviços sincronizados (EC2, S3, RDS, IAM, EKS, etc.)

Ou, se preferir least-privilege, use uma policy custom com ações `Describe*`, `List*`, `Get*` nos serviços que o produto sincroniza (EC2, VPC, ELB, ECS, EKS, RDS, S3, IAM, Lambda, CloudFront, Route53, CloudWatch, CloudTrail, API Gateway, KMS, Secrets Manager, ECR, DynamoDB, ElastiCache, SQS, SNS, WAF, GuardDuty).

##### FinOps (obrigatório para sync de custos)

Cost Explorer **não** está coberto só com `ReadOnlyAccess` em todos os casos. Anexe também:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FinOpsCostExplorer",
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "ce:GetCostForecast",
        "ce:GetDimensionValues",
        "ce:GetTags"
      ],
      "Resource": "*"
    }
  ]
}
```

Mínimo absoluto para o sync atual: `ce:GetCostAndUsage`.

##### Automation (opcional)

Só se o tenant usar provisionamento/automação: permissões de escrita nos recursos alvo (EC2, IAM, etc.). Não anexe write policies se o uso for só leitura/FinOps.

#### 2.3 Cadastrar a conta no produto

Na UI (Cloud Accounts) ou API, envie:

```json
{
  "provider": "aws",
  "alias": "Produção",
  "credentials": {
    "roleArn": "arn:aws:iam::ACCOUNT_DO_CLIENTE:role/SaasMulticloudRole",
    "region": "us-east-1",
    "regions": ["us-east-1", "sa-east-1"],
    "externalId": "EXTERNAL_ID_SECRETO_DO_TENANT"
  }
}
```

O backend valida com `sts:AssumeRole` na hora do cadastro. Se a trust policy / External ID / permissões do user estiverem erradas, a conexão falha.

---

### Parte 3 — Checklist

**Plataforma**

- [ ] User `saas-multicloud` criado
- [ ] Policy `sts:AssumeRole` no user
- [ ] Access Key válida no `.env` (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)
- [ ] Sem `AWS_SESSION_TOKEN` com key `AKIA*`
- [ ] `aws sts get-caller-identity` funciona com essas keys

**Cliente**

- [ ] Role criada com trust apontando para o ARN do user da plataforma
- [ ] External ID igual ao cadastrado no produto (se usado)
- [ ] `ReadOnlyAccess` (ou equivalente) para assessment
- [ ] Policy `ce:GetCostAndUsage` para FinOps
- [ ] Conta cloud cadastrada e “connection verified”

---

### Troubleshooting

| Erro | Causa comum | Correção |
|------|-------------|----------|
| `InvalidClientTokenId` / *security token included in the request is invalid* | Access Key da plataforma inválida, revogada, ou `AWS_SESSION_TOKEN` stale com `AKIA*` | Gere nova Access Key; atualize `.env`; remova `AWS_SESSION_TOKEN`; reinicie o Nest |
| `AccessDenied` em `sts:AssumeRole` | Trust policy não confia no user, External ID errado, ou user sem `sts:AssumeRole` | Ajuste trust + External ID + policy do user |
| `not authorized to perform: ce:GetCostAndUsage` | Role do cliente sem Cost Explorer | Anexe a policy FinOps da Parte 2.2 |
| Sync enfileira mas não processa localmente | Redis compartilhado com outro worker | Defina `BULLMQ_PREFIX=local-dev` no `.env` local |

---

## Database migrations

```bash
# create empty migration
npm run migration:create --name=nome-da-migration

# generate migration based on entity changes
npm run migration:generate --name=nome-da-migration

# run migrations in development
npm run migration:run

# revert last migration
npm run migration:revert

# list migration status
npm run migration:show
```

### Production flow (recommended)

```bash
# 1) build artifacts
npm run build

# 2) run migrations against production database
npm run migration:run:prod

# 3) start application
npm run start:prod
```

## Scripts

```bash
npm run start:dev   # hot reload
npm run build
npm run start:prod
npm run test
npm run test:e2e
npm run test:cov
```
