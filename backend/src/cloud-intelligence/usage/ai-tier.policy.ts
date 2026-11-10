import { AiAgentType, type AiAgentTypeName } from '../agents/agent.interface';

export type AiTier = 'basic' | 'professional' | 'enterprise';

export type AiCapability =
    | 'cloud_advisor'
    | 'finops_agent'
    | 'security_agent'
    | 'devops_agent'
    | 'daily_intelligence'
    | 'automation_builder'
    | 'architecture_advisor'
    | 'recommendation_automation'
    | 'org_private_rag';

const TIER_CAPABILITIES: Record<AiTier, ReadonlySet<AiCapability>> = {
    basic: new Set(['cloud_advisor']),
    professional: new Set([
        'cloud_advisor',
        'finops_agent',
        'security_agent',
        'recommendation_automation',
    ]),
    enterprise: new Set([
        'cloud_advisor',
        'finops_agent',
        'security_agent',
        'devops_agent',
        'daily_intelligence',
        'automation_builder',
        'architecture_advisor',
        'recommendation_automation',
        'org_private_rag',
    ]),
};

const AGENT_CAPABILITY: Record<AiAgentTypeName, AiCapability> = {
    [AiAgentType.CLOUD_ADVISOR]: 'cloud_advisor',
    [AiAgentType.FINOPS_ANALYST]: 'finops_agent',
    [AiAgentType.SECURITY_ANALYST]: 'security_agent',
    [AiAgentType.DEVOPS_ANALYST]: 'devops_agent',
    [AiAgentType.AUTOMATION_BUILDER]: 'automation_builder',
    [AiAgentType.ARCHITECTURE_ADVISOR]: 'architecture_advisor',
};

export function normalizeAiTier(raw: string | null | undefined): AiTier | null {
    if (!raw) return null;
    const value = raw.trim().toLowerCase();
    if (value === 'basic' || value === 'professional' || value === 'enterprise') {
        return value;
    }
    if (value === 'pro') return 'professional';
    return null;
}

/** Resolve tier from explicit metadata or plan modules fallback. */
export function resolveAiTier(input: {
    aiTier?: string | null;
    modules?: string[] | null;
}): AiTier {
    const explicit = normalizeAiTier(input.aiTier);
    if (explicit) return explicit;

    const modules = (input.modules ?? []).map((m) => m.trim().toLowerCase());
    if (modules.includes('*')) return 'enterprise';
    if (modules.includes('cloud_intelligence')) return 'basic';
    return 'basic';
}

export function tierHasCapability(tier: AiTier, capability: AiCapability): boolean {
    return TIER_CAPABILITIES[tier].has(capability);
}

export function agentAllowedForTier(tier: AiTier, agentType: AiAgentTypeName): boolean {
    return tierHasCapability(tier, AGENT_CAPABILITY[agentType]);
}

export function listCapabilities(tier: AiTier): AiCapability[] {
    return Array.from(TIER_CAPABILITIES[tier]);
}
