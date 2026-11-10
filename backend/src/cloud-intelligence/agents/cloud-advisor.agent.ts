import { Injectable } from '@nestjs/common';
import { AiAgentType, type AiAgent, type AiAgentDefinition } from './agent.interface';

@Injectable()
export class CloudAdvisorAgent implements AiAgent {
    readonly definition: AiAgentDefinition = {
        type: AiAgentType.CLOUD_ADVISOR,
        displayName: 'AI Cloud Advisor',
        description:
            'Central multicloud assistant for inventory, FinOps, governance, assessment, and automations.',
        available: true,
        systemPromptAddon:
            'You are the Cloud Advisor. Prefer organization-scoped real data from tools. Never invent resources, costs, or findings.',
    };
}
