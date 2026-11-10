import { AiAgentType } from './agent.interface';
import { AgentRegistry } from './agent.registry';
import { ArchitectureAdvisorAgent } from './architecture-advisor.agent';
import { AutomationBuilderAgent } from './automation-builder.agent';
import { CloudAdvisorAgent } from './cloud-advisor.agent';
import { FinopsAnalystAgent } from './finops-analyst.agent';
import { SecurityAnalystAgent } from './security-analyst.agent';

describe('AgentRegistry', () => {
    const registry = new AgentRegistry(
        new CloudAdvisorAgent(),
        new FinopsAnalystAgent(),
        new SecurityAnalystAgent(),
        new AutomationBuilderAgent(),
        new ArchitectureAdvisorAgent(),
    );

    it('falls back to Cloud Advisor for basic when FinOps is requested', () => {
        const agent = registry.resolveForTier('basic', AiAgentType.FINOPS_ANALYST);
        expect(agent.type).toBe(AiAgentType.CLOUD_ADVISOR);
    });

    it('returns available FinOps agent for professional', () => {
        const agent = registry.resolveForTier('professional', AiAgentType.FINOPS_ANALYST);
        expect(agent.type).toBe(AiAgentType.FINOPS_ANALYST);
        expect(agent.available).toBe(true);
    });

    it('lists agents with tier-gated availability', () => {
        const basic = registry.listForTier('basic');
        const finops = basic.find((a) => a.type === AiAgentType.FINOPS_ANALYST);
        expect(finops?.available).toBe(false);

        const enterprise = registry.listForTier('enterprise');
        const automation = enterprise.find((a) => a.type === AiAgentType.AUTOMATION_BUILDER);
        expect(automation).toBeDefined();
        expect(automation?.available).toBe(true);
    });
});
