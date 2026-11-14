import { resolveWorkerConcurrency } from '../common/queues/worker-concurrency';

export const AI_FINOPS_QUEUE = 'ai-finops-sync';
export const AI_FINOPS_JOB_NAME = 'run-ai-finops-sync';
export const AI_FINOPS_WORKER_CONCURRENCY = resolveWorkerConcurrency('AI_FINOPS_WORKER_CONCURRENCY', 2);
export const AI_FINOPS_PENDING_STATES = ['active', 'waiting', 'prioritized', 'delayed', 'paused'] as const;

export const AI_FINOPS_PROVIDER_SEEDS = [
    {
        slug: 'openai',
        name: 'OpenAI',
        description: 'OpenAI API (BYOK) — Admin API key required for usage/costs by user',
        capabilities: {
            validateCredentials: true,
            listModels: true,
            listProjects: false,
            fetchUsage: true,
            fetchCosts: true,
            fetchLimits: false,
            usageByUser: true,
            syncHistorical: true,
        },
    },
    {
        slug: 'anthropic',
        name: 'Anthropic',
        description: 'Anthropic Claude API (BYOK) — Admin API key required for usage/costs by actor',
        capabilities: {
            validateCredentials: true,
            listModels: true,
            listProjects: false,
            fetchUsage: true,
            fetchCosts: true,
            fetchLimits: false,
            usageByUser: true,
            syncHistorical: true,
        },
    },
    {
        slug: 'google_gemini',
        name: 'Google Gemini',
        description:
            'Google Gemini API (BYOK) — no public Admin usage/cost API; gateway estimated only',
        capabilities: {
            validateCredentials: true,
            listModels: true,
            listProjects: false,
            fetchUsage: false,
            fetchCosts: false,
            fetchLimits: false,
            usageByUser: false,
            syncHistorical: false,
        },
    },
    {
        slug: 'microsoft_copilot',
        name: 'Microsoft Copilot / M365',
        description:
            'Microsoft Copilot seats + Copilot Credits via Graph (credits unit, not USD invoice)',
        capabilities: {
            validateCredentials: true,
            listModels: false,
            listProjects: false,
            fetchUsage: true,
            fetchCosts: true,
            fetchLimits: false,
            usageByUser: true,
            syncHistorical: true,
        },
    },
    {
        slug: 'aws_bedrock',
        name: 'AWS Bedrock',
        description: 'Amazon Bedrock (BYOK) — official costs via Cost Explorer',
        capabilities: {
            validateCredentials: true,
            listModels: true,
            listProjects: false,
            fetchUsage: true,
            fetchCosts: true,
            fetchLimits: false,
            usageByUser: false,
            syncHistorical: true,
        },
    },
    {
        slug: 'azure_ai_foundry',
        name: 'Azure AI Foundry',
        description:
            'Azure AI Foundry / Azure OpenAI (BYOK) — Cost Management requires Entra SP + subscription',
        capabilities: {
            validateCredentials: true,
            listModels: true,
            listProjects: false,
            fetchUsage: true,
            fetchCosts: true,
            fetchLimits: false,
            usageByUser: false,
            syncHistorical: true,
        },
    },
    {
        slug: 'deepseek',
        name: 'DeepSeek',
        description:
            'DeepSeek API (BYOK) — no public Admin usage/cost API; gateway estimated only',
        capabilities: {
            validateCredentials: true,
            listModels: true,
            listProjects: false,
            fetchUsage: false,
            fetchCosts: false,
            fetchLimits: false,
            usageByUser: false,
            syncHistorical: false,
        },
    },
    {
        slug: 'mistral',
        name: 'Mistral',
        description: 'Mistral API (BYOK) — Enterprise Admin API key required for usage/costs',
        capabilities: {
            validateCredentials: true,
            listModels: true,
            listProjects: false,
            fetchUsage: true,
            fetchCosts: true,
            fetchLimits: false,
            usageByUser: true,
            syncHistorical: true,
        },
    },
    {
        slug: 'groq',
        name: 'Groq',
        description: 'Groq API (BYOK) — no public Admin usage/cost API; gateway estimated only',
        capabilities: {
            validateCredentials: true,
            listModels: true,
            listProjects: false,
            fetchUsage: false,
            fetchCosts: false,
            fetchLimits: false,
            usageByUser: false,
            syncHistorical: false,
        },
    },
] as const;

export type AiFinopsSyncJobPayload = {
    tenantId: string;
    connectionId: string;
    syncRunId: string;
    syncType: string;
    startDate?: string;
    endDate?: string;
};
