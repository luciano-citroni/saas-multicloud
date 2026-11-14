'use client';

import { BookOpen, ExternalLink, ShieldCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useLocale } from '@/components/providers/locale-provider';
import { cn } from '@/lib/utils';

type Guide = {
    title: string;
    intro: string;
    steps: string[];
    notes?: string[];
    docsUrl?: string;
    docsLabel?: string;
};

const GUIDES_PT: Record<string, Guide> = {
    openai: {
        title: 'Como obter as credenciais na OpenAI',
        intro: 'Você precisa de uma API key de projeto para modelos e, para custos oficiais, de uma Admin API key da organização.',
        steps: [
            'Acesse platform.openai.com e faça login na organização correta.',
            'Em API keys, crie uma chave de projeto (Project API key). Cole no campo API key — ela lista modelos e pode chamar o Gateway.',
            'Para sincronizar uso e custos oficiais: Settings → Organization → Admin keys → Create admin key. Cole no campo Admin API key.',
            'Opcional: informe Organization ID e Project ID se usar várias orgs/projetos.',
            'Salve a conexão e clique em Sincronizar. Os custos aparecem em FinOps → AI Costs.',
        ],
        notes: [
            'Admin keys não substituem a API key de projeto para chat/completions.',
            'Sem Admin key, a conexão fica partial (só modelos).',
        ],
        docsUrl: 'https://platform.openai.com/settings/organization/admin-keys',
        docsLabel: 'Abrir Admin keys na OpenAI',
    },
    anthropic: {
        title: 'Como obter as credenciais na Anthropic',
        intro: 'Use uma API key padrão para modelos e uma Admin API key (sk-ant-admin…) para uso e custos oficiais.',
        steps: [
            'Acesse console.anthropic.com (Claude Console) com uma organização (não conta individual Team-only).',
            'Em API Keys, crie uma chave de workspace/projeto. Cole no campo API key.',
            'Para FinOps: Settings → Admin keys (ou Organization) → Create Admin API key (prefixo sk-ant-admin). Cole em Admin API key.',
            'Admin API não está disponível em planos Team / contas individuais sem organização.',
            'Salve e sincronize. Uso por ator/usuário e custos oficiais vão para FinOps → AI Costs.',
        ],
        notes: [
            'Workspace API keys não acessam endpoints Admin.',
            'A Analytics API (Admin) é a fonte oficial de usage/cost.',
        ],
        docsUrl: 'https://platform.claude.com/docs/en/manage-claude/usage-cost-api',
        docsLabel: 'Documentação Usage & Cost API',
    },
    mistral: {
        title: 'Como obter as credenciais na Mistral',
        intro: 'API key padrão lista modelos. Uso e custos oficiais exigem Enterprise Admin API key.',
        steps: [
            'Acesse console.mistral.ai e crie uma API key. Cole no campo API key.',
            'Em planos Enterprise, abra o Admin Panel e crie uma Admin API key.',
            'Cole a Admin key no campo Admin API key (opcional se só quiser modelos).',
            'Salve a conexão e sincronize para puxar usage/custos do Admin API.',
        ],
        notes: [
            'Admin API não é self-serve fora do Enterprise — contate o time Mistral se necessário.',
        ],
        docsUrl: 'https://docs.mistral.ai/admin/admin-api/usage-metrics',
        docsLabel: 'Documentação Admin Usage',
    },
    aws_bedrock: {
        title: 'Como obter as credenciais no AWS Bedrock',
        intro: 'A plataforma assume uma IAM Role na sua conta (cross-account) para listar modelos e ler custos no Cost Explorer.',
        steps: [
            'No AWS Console da conta cliente, abra IAM → Roles → Create role.',
            'Em Trusted entity, use Custom trust policy permitindo a conta/usuário da plataforma (com External ID se a plataforma exigir).',
            'Anexe permissões mínimas: bedrock:ListFoundationModels (e correlatas) e ce:GetCostAndUsage / ce:GetDimensionValues para Amazon Bedrock.',
            'Crie a role, copie o Role ARN e cole no formulário. Informe a região (ex.: us-east-1) e, se houver, External ID e Account ID.',
            'Salve e sincronize — custos oficiais vêm do Cost Explorer filtrado em Amazon Bedrock.',
        ],
        notes: [
            'Cost Explorer precisa estar habilitado na conta (pode haver custo da própria CE).',
            'Tokens detalhados por usuário de chat não vêm do CE; o gasto oficial ($) sim.',
        ],
        docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/cost-management.html',
        docsLabel: 'Bedrock cost management',
    },
    azure_ai_foundry: {
        title: 'Como obter as credenciais no Azure AI Foundry',
        intro: 'Endpoint + API key listam deployments. Para custos oficiais, adicione um Service Principal com acesso ao Cost Management da subscription.',
        steps: [
            'No Azure Portal, abra o recurso Azure OpenAI / AI Foundry e copie o Endpoint.',
            'Em Keys and Endpoint, copie uma Key → campo API key.',
            'Opcional (FinOps): Entra ID → App registrations → New registration. Copie Tenant ID e Application (client) ID.',
            'Em Certificates & secrets, crie um Client secret.',
            'Na Subscription → Access control (IAM), conceda à app a role Cost Management Reader (e Reader no recurso se precisar).',
            'Cole Subscription ID + Tenant / Client / Secret nos campos de Cost Management e sincronize.',
        ],
        notes: [
            'Só com API key a conexão fica partial (modelos, sem custo oficial).',
            'Custos aparecem sob Cognitive Services / Azure OpenAI no Cost Management.',
        ],
        docsUrl: 'https://learn.microsoft.com/en-us/azure/foundry/concepts/manage-costs',
        docsLabel: 'Plan and manage Foundry costs',
    },
    microsoft_copilot: {
        title: 'Como conectar Microsoft Copilot / M365',
        intro: 'Use um App Registration com permissões de aplicativo no Microsoft Graph para inventário de assentos e créditos Copilot.',
        steps: [
            'Azure Portal → Microsoft Entra ID → App registrations → New registration.',
            'Copie Directory (tenant) ID e Application (client) ID.',
            'Certificates & secrets → New client secret → copie o valor imediatamente.',
            'API permissions → Add → Microsoft Graph (Application): Organization.Read.All (seats). Para créditos Copilot, conceda as permissões de Copilot Cost Management exigidas pelo tenant e faça Admin consent.',
            'Cole Tenant ID, Client ID e Client Secret no formulário, salve e use Sincronizar licenças / Sync.',
        ],
        notes: [
            'Consumo é em Copilot Credits (unidade CRD), não fatura USD da OpenAI.',
            'Sem permissões de Cost Management, apenas seats podem sincronizar.',
        ],
        docsUrl: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/cost-management/overview',
        docsLabel: 'Copilot Cost Management API',
    },
    google_gemini: {
        title: 'Como obter a chave do Google Gemini',
        intro: 'A Gemini API (AI Studio) usa API key para modelos. Não há Admin usage/cost API pública — o gasto oficial exigiria Cloud Billing/BigQuery.',
        steps: [
            'Acesse a Google AI Studio (aistudio.google.com) e faça login.',
            'Em Get API key, crie ou selecione um projeto e gere uma API key.',
            'Cole a chave no campo API key e salve a conexão.',
            'Para ver estimativa de custo no produto, roteie chamadas pelo AI Gateway; sync Admin oficial não está disponível com API key.',
        ],
        notes: [
            'Não inventamos billing: sem BigQuery export, só modelos + gateway estimado.',
        ],
        docsUrl: 'https://aistudio.google.com/apikey',
        docsLabel: 'Google AI Studio — API keys',
    },
    deepseek: {
        title: 'Como obter a chave do DeepSeek',
        intro: 'DeepSeek expõe API OpenAI-compatible. Não há Admin usage/cost API pública documentada — use a key para modelos e o Gateway para estimativa.',
        steps: [
            'Acesse platform.deepseek.com e crie uma conta.',
            'Em API Keys, gere uma chave e cole no formulário.',
            'Salve a conexão. Uso detalhado oficial não sincroniza via Admin API; exporte no console DeepSeek se precisar de fatura.',
        ],
        notes: ['Custos no produto: apenas estimados via AI Gateway.'],
        docsUrl: 'https://platform.deepseek.com',
        docsLabel: 'DeepSeek Platform',
    },
    groq: {
        title: 'Como obter a chave do Groq',
        intro: 'Groq usa API key no console. Usage/cost oficiais ficam no dashboard; não há Admin API pública para sync BYOK.',
        steps: [
            'Acesse console.groq.com e faça login.',
            'Em API Keys, crie uma chave e cole no campo API key.',
            'Salve a conexão. Para spend no produto, use o AI Gateway (estimado).',
        ],
        notes: ['Spend Limits e Usage no console Groq são a fonte oficial fora desta plataforma.'],
        docsUrl: 'https://console.groq.com/keys',
        docsLabel: 'Groq Console — API Keys',
    },
};

const GUIDES_EN: Record<string, Guide> = {
    openai: {
        title: 'How to get OpenAI credentials',
        intro: 'You need a project API key for models and an Organization Admin API key for official usage and costs.',
        steps: [
            'Open platform.openai.com and sign in to the right organization.',
            'Under API keys, create a Project API key. Paste it into API key — it lists models and can call the Gateway.',
            'For official usage/costs: Settings → Organization → Admin keys → Create admin key. Paste into Admin API key.',
            'Optional: set Organization ID and Project ID when you use multiple orgs/projects.',
            'Save the connection and click Sync. Costs show under FinOps → AI Costs.',
        ],
        notes: [
            'Admin keys do not replace the project key for chat/completions.',
            'Without an Admin key, the connection stays partial (models only).',
        ],
        docsUrl: 'https://platform.openai.com/settings/organization/admin-keys',
        docsLabel: 'Open OpenAI Admin keys',
    },
    anthropic: {
        title: 'How to get Anthropic credentials',
        intro: 'Use a standard API key for models and an Admin API key (sk-ant-admin…) for official usage and costs.',
        steps: [
            'Open console.anthropic.com (Claude Console) with an organization (not individual Team-only).',
            'Under API Keys, create a workspace/project key. Paste into API key.',
            'For FinOps: Settings → Admin keys → Create Admin API key (sk-ant-admin prefix). Paste into Admin API key.',
            'Admin API is not available on Team plans / individual accounts without an organization.',
            'Save and sync. Per-actor usage and official costs appear in FinOps → AI Costs.',
        ],
        notes: [
            'Workspace API keys cannot call Admin endpoints.',
            'The Analytics / Usage & Cost Admin API is the official source.',
        ],
        docsUrl: 'https://platform.claude.com/docs/en/manage-claude/usage-cost-api',
        docsLabel: 'Usage & Cost API docs',
    },
    mistral: {
        title: 'How to get Mistral credentials',
        intro: 'A standard API key lists models. Official usage/costs require an Enterprise Admin API key.',
        steps: [
            'Open console.mistral.ai and create an API key. Paste into API key.',
            'On Enterprise plans, open the Admin Panel and create an Admin API key.',
            'Paste the Admin key into Admin API key (optional if you only need models).',
            'Save and sync to pull usage/costs from the Admin API.',
        ],
        notes: [
            'Admin API is not self-serve outside Enterprise — contact Mistral if needed.',
        ],
        docsUrl: 'https://docs.mistral.ai/admin/admin-api/usage-metrics',
        docsLabel: 'Admin Usage docs',
    },
    aws_bedrock: {
        title: 'How to get AWS Bedrock credentials',
        intro: 'The platform assumes an IAM Role in your account to list models and read Cost Explorer for Bedrock.',
        steps: [
            'In the customer AWS Console, open IAM → Roles → Create role.',
            'Trusted entity: Custom trust policy allowing the platform account/user (with External ID if required).',
            'Attach least privilege: bedrock:ListFoundationModels (and related) plus ce:GetCostAndUsage / ce:GetDimensionValues for Amazon Bedrock.',
            'Create the role, copy the Role ARN into the form. Set region (e.g. us-east-1) and External ID / Account ID when applicable.',
            'Save and sync — official spend comes from Cost Explorer filtered to Amazon Bedrock.',
        ],
        notes: [
            'Cost Explorer must be enabled (CE itself may incur charges).',
            'Per-chat user tokens are not in CE; official $ spend is.',
        ],
        docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/cost-management.html',
        docsLabel: 'Bedrock cost management',
    },
    azure_ai_foundry: {
        title: 'How to get Azure AI Foundry credentials',
        intro: 'Endpoint + API key list deployments. Official costs need a Service Principal with Cost Management access on the subscription.',
        steps: [
            'In Azure Portal, open the Azure OpenAI / AI Foundry resource and copy the Endpoint.',
            'Under Keys and Endpoint, copy a Key into API key.',
            'Optional (FinOps): Entra ID → App registrations → New registration. Copy Tenant ID and Application (client) ID.',
            'Certificates & secrets → create a Client secret.',
            'On the Subscription → Access control (IAM), grant the app Cost Management Reader (and Reader on the resource if needed).',
            'Paste Subscription ID + Tenant / Client / Secret into the Cost Management fields and sync.',
        ],
        notes: [
            'API key alone keeps the connection partial (models, no official cost).',
            'Costs appear under Cognitive Services / Azure OpenAI in Cost Management.',
        ],
        docsUrl: 'https://learn.microsoft.com/en-us/azure/foundry/concepts/manage-costs',
        docsLabel: 'Plan and manage Foundry costs',
    },
    microsoft_copilot: {
        title: 'How to connect Microsoft Copilot / M365',
        intro: 'Use an App Registration with Microsoft Graph application permissions for seat inventory and Copilot Credits.',
        steps: [
            'Azure Portal → Microsoft Entra ID → App registrations → New registration.',
            'Copy Directory (tenant) ID and Application (client) ID.',
            'Certificates & secrets → New client secret → copy the value immediately.',
            'API permissions → Add → Microsoft Graph (Application): Organization.Read.All (seats). For Copilot credits, grant the Copilot Cost Management permissions your tenant requires and Admin consent.',
            'Paste Tenant ID, Client ID and Client Secret, save, then Sync licenses / Sync.',
        ],
        notes: [
            'Consumption is Copilot Credits (CRD), not an OpenAI-style USD invoice.',
            'Without Cost Management permissions, only seats may sync.',
        ],
        docsUrl: 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/cost-management/overview',
        docsLabel: 'Copilot Cost Management API',
    },
    google_gemini: {
        title: 'How to get a Google Gemini API key',
        intro: 'Gemini (AI Studio) uses an API key for models. There is no public Admin usage/cost API — official spend would need Cloud Billing/BigQuery.',
        steps: [
            'Open Google AI Studio (aistudio.google.com) and sign in.',
            'Under Get API key, create or select a project and generate an API key.',
            'Paste the key into API key and save the connection.',
            'For estimated spend in-product, route calls through the AI Gateway; official Admin sync is not available with an API key alone.',
        ],
        notes: [
            'We do not invent billing: without BigQuery export, only models + gateway estimates.',
        ],
        docsUrl: 'https://aistudio.google.com/apikey',
        docsLabel: 'Google AI Studio — API keys',
    },
    deepseek: {
        title: 'How to get a DeepSeek API key',
        intro: 'DeepSeek exposes an OpenAI-compatible API. There is no documented public Admin usage/cost API — use the key for models and the Gateway for estimates.',
        steps: [
            'Open platform.deepseek.com and create an account.',
            'Under API Keys, generate a key and paste it into the form.',
            'Save the connection. Official detailed usage is not synced via Admin API; export from the DeepSeek console for invoices.',
        ],
        notes: ['In-product costs: gateway estimates only.'],
        docsUrl: 'https://platform.deepseek.com',
        docsLabel: 'DeepSeek Platform',
    },
    groq: {
        title: 'How to get a Groq API key',
        intro: 'Groq uses console API keys. Official usage/cost lives in the dashboard; there is no public Admin API for BYOK sync.',
        steps: [
            'Open console.groq.com and sign in.',
            'Under API Keys, create a key and paste it into API key.',
            'Save the connection. For in-product spend, use the AI Gateway (estimated).',
        ],
        notes: ['Groq console Spend Limits / Usage remain the external source of truth.'],
        docsUrl: 'https://console.groq.com/keys',
        docsLabel: 'Groq Console — API Keys',
    },
};

type Props = {
    providerSlug: string;
    className?: string;
};

export function AiProviderSetupGuide({ providerSlug, className }: Props) {
    const { locale } = useLocale();
    const guides = locale === 'en' ? GUIDES_EN : GUIDES_PT;
    const guide = guides[providerSlug];
    if (!guide) return null;

    return (
        <div className={cn('md:col-span-2', className)}>
            <Accordion type="single" collapsible>
                <AccordionItem value="ai-provider-setup" className="rounded-lg border border-border px-4">
                    <AccordionTrigger
                        type="button"
                        className="gap-2 text-sm font-medium hover:no-underline"
                    >
                        <span className="flex items-center gap-2">
                            <ShieldCheck className="text-muted-foreground size-4 shrink-0" />
                            {guide.title}
                        </span>
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-4 pb-4">
                        <p className="text-muted-foreground text-sm">{guide.intro}</p>
                        <ol className="text-muted-foreground flex list-inside list-decimal flex-col gap-2.5 text-sm">
                            {guide.steps.map((step, index) => (
                                <li key={`${providerSlug}-step-${index}`}>{step}</li>
                            ))}
                        </ol>
                        {guide.notes && guide.notes.length > 0 && (
                            <div className="bg-muted/40 flex flex-col gap-1.5 rounded-md border px-3 py-2.5">
                                <p className="flex items-center gap-1.5 text-xs font-semibold">
                                    <BookOpen className="size-3.5" />
                                    {locale === 'en' ? 'Notes' : 'Observações'}
                                </p>
                                <ul className="text-muted-foreground list-inside list-disc text-xs">
                                    {guide.notes.map((note, index) => (
                                        <li key={`${providerSlug}-note-${index}`}>{note}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {guide.docsUrl && (
                            <a
                                href={guide.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                            >
                                <ExternalLink className="size-3.5" />
                                {guide.docsLabel ?? guide.docsUrl}
                            </a>
                        )}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
