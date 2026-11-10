import { Injectable } from '@nestjs/common';
import { agentAllowedForTier, type AiTier } from '../usage/ai-tier.policy';
import { AiAgentType, type AiAgent, type AiAgentDefinition, type AiAgentTypeName } from './agent.interface';
import { ArchitectureAdvisorAgent } from './architecture-advisor.agent';
import { AutomationBuilderAgent } from './automation-builder.agent';
import { CloudAdvisorAgent } from './cloud-advisor.agent';
import { FinopsAnalystAgent } from './finops-analyst.agent';
import { SecurityAnalystAgent } from './security-analyst.agent';

const STUB_AGENTS: AiAgentDefinition[] = [
    {
        type: AiAgentType.DEVOPS_ANALYST,
        displayName: 'AI DevOps / SRE Analyst',
        description: 'Operations and observability intelligence agent.',
        available: false,
    },
];

@Injectable()
export class AgentRegistry {
    private readonly agents = new Map<AiAgentTypeName, AiAgentDefinition>();

    constructor(
        cloudAdvisor: CloudAdvisorAgent,
        finopsAnalyst: FinopsAnalystAgent,
        securityAnalyst: SecurityAnalystAgent,
        automationBuilder: AutomationBuilderAgent,
        architectureAdvisor: ArchitectureAdvisorAgent,
    ) {
        this.register(cloudAdvisor);
        this.register(finopsAnalyst);
        this.register(securityAnalyst);
        this.register(automationBuilder);
        this.register(architectureAdvisor);
        for (const stub of STUB_AGENTS) {
            this.agents.set(stub.type, stub);
        }
    }

    private register(agent: AiAgent): void {
        this.agents.set(agent.definition.type, agent.definition);
    }

    get(type: AiAgentTypeName): AiAgentDefinition | undefined {
        return this.agents.get(type);
    }

    list(): AiAgentDefinition[] {
        return Array.from(this.agents.values());
    }

    resolveOrDefault(type?: AiAgentTypeName | null): AiAgentDefinition {
        if (type) {
            const agent = this.agents.get(type);
            if (agent) {
                return agent;
            }
        }
        return this.agents.get(AiAgentType.CLOUD_ADVISOR)!;
    }

    /** Prefer requested agent when available for the org AI tier; otherwise Cloud Advisor. */
    resolveForTier(tier: AiTier, type?: AiAgentTypeName | null): AiAgentDefinition {
        if (type && agentAllowedForTier(tier, type)) {
            const agent = this.agents.get(type);
            if (agent) {
                return {
                    ...agent,
                    available: agent.available && agentAllowedForTier(tier, agent.type),
                };
            }
        }
        return this.agents.get(AiAgentType.CLOUD_ADVISOR)!;
    }

    listForTier(tier: AiTier): AiAgentDefinition[] {
        return this.list().map((agent) => ({
            ...agent,
            available: agent.available && agentAllowedForTier(tier, agent.type),
        }));
    }
}
