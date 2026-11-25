import { AiAgentType } from '../agents/agent.interface';
import {
    agentAllowedForTier,
    resolveAiTier,
    tierHasCapability,
} from './ai-tier.policy';

describe('ai-tier.policy', () => {
    it('resolves explicit tiers when Cloud Intelligence is on the plan', () => {
        expect(resolveAiTier({ aiTier: 'professional', modules: ['cloud_intelligence'] })).toBe(
            'professional',
        );
        expect(resolveAiTier({ aiTier: 'pro', modules: ['cloud_intelligence'] })).toBe('professional');
        expect(resolveAiTier({ aiTier: 'enterprise', modules: ['cloud_intelligence'] })).toBe(
            'enterprise',
        );
    });

    it('keeps the free basic assistant when Cloud Intelligence is absent', () => {
        expect(resolveAiTier({ aiTier: 'enterprise', modules: ['finops'] })).toBe('basic');
        expect(resolveAiTier({ aiTier: 'professional', modules: [] })).toBe('basic');
        expect(resolveAiTier({})).toBe('basic');
    });

    it('falls back to enterprise when modules include *', () => {
        expect(resolveAiTier({ modules: ['*'] })).toBe('enterprise');
    });

    it('gates capabilities by tier', () => {
        expect(tierHasCapability('basic', 'cloud_advisor')).toBe(true);
        expect(tierHasCapability('basic', 'daily_intelligence')).toBe(false);
        expect(tierHasCapability('professional', 'recommendation_automation')).toBe(true);
        expect(tierHasCapability('enterprise', 'org_private_rag')).toBe(true);
    });

    it('gates agents by tier', () => {
        expect(agentAllowedForTier('basic', AiAgentType.FINOPS_ANALYST)).toBe(false);
        expect(agentAllowedForTier('professional', AiAgentType.FINOPS_ANALYST)).toBe(true);
        expect(agentAllowedForTier('enterprise', AiAgentType.AUTOMATION_BUILDER)).toBe(true);
    });
});
